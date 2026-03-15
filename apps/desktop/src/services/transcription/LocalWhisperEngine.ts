import { v4 as uuidv4 } from 'uuid';
import type { TranscriptSegment } from '../../domain/session';
import type { TranscriptionRouter } from './TranscriptionRouter';
import type { NodeWhisperBackend } from './NodeWhisperBackend';
import { QualityTelemetry } from './QualityTelemetry';

export interface WhisperResult {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface IWhisperBackend {
  transcribe(audioBuffer: Buffer, modelPath: string): Promise<WhisperResult[]>;
  setProfileConfig?(config: import('./QualityProfile').ProfileConfig): void;
  resetContext?(): void;
}

/**
 * Overlap deduplication: if the new text starts with a suffix of the previous
 * assembled text, strip the repeated prefix.
 *
 * Strategy: sliding window of up to 8 words from the tail of `prev` checked
 * against the head of `next`. Case-insensitive, punctuation-tolerant.
 */
function deduplicateOverlap(prev: string, next: string): string {
  if (!prev || !next) return next;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const prevWords = normalize(prev).split(' ');
  const nextWords = normalize(next).split(' ');
  const windowSize = Math.min(8, prevWords.length, nextWords.length);
  for (let len = windowSize; len >= 2; len--) {
    const prevTail = prevWords.slice(prevWords.length - len).join(' ');
    const nextHead = nextWords.slice(0, len).join(' ');
    if (prevTail === nextHead) {
      // Strip the duplicated prefix from `next` (raw, not normalized)
      const rawNextWords = next.trim().split(/\s+/);
      return rawNextWords.slice(len).join(' ');
    }
  }
  return next;
}

/**
 * Whole-chunk hallucination: the entire chunk is noise/silence with no real speech.
 * These are multi-token sequences that together form a hallucination phrase.
 */
const CHUNK_HALLUCINATION_PATTERNS = [
  /^\[BLANK_AUDIO\]$/i,
  /^\[MUSIC\]$/i,
  /^\[NOISE\]$/i,
  /^\[INAUDIBLE\]$/i,
  /^\[SILENCE\]$/i,
  /^\[Silence\]$/,
];

function isChunkHallucination(text: string): boolean {
  return CHUNK_HALLUCINATION_PATTERNS.some(p => p.test(text.trim()));
}

/**
 * Merge whisper-node's per-token segments into a single sentence string.
 *
 * whisper-node with word_timestamps returns one token per segment entry
 * (e.g. ["Sam", "was", "born", ",", "in", ...]). We need to:
 *  1. Filter out whole-chunk hallucinations (BLANK_AUDIO, MUSIC, etc.)
 *  2. Join tokens intelligently: punctuation attaches to the preceding word,
 *     no space before . , ! ? ; : ' and no space after opening quotes/brackets.
 *  3. Return the joined sentence and the time span (startMs of first, endMs of last).
 */
/**
 * Common short English words that are always standalone — never fragments.
 * Prevents "is", "we", "I", "he", "in", "at", etc. from being glued to the
 * previous token even though they are short.
 */
const STANDALONE_WORDS = new Set([
  'a', 'i', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in',
  'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us',
  'we', 'am', 'are', 'but', 'can', 'did', 'for', 'get', 'got', 'had', 'has',
  'her', 'him', 'his', 'how', 'its', 'let', 'may', 'not', 'now', 'our', 'out',
  'own', 'put', 'say', 'see', 'she', 'the', 'too', 'two', 'was', 'who', 'why',
  'yet', 'you', 'all', 'and', 'any', 'few', 'new', 'old', 'one', 'own', 'set',
  'ok', 'okay',
]);

/**
 * Returns true if a token looks like a word fragment that should be glued
 * to the previous token without a space.
 *
 * Whisper sometimes splits a single word across multiple tokens, e.g.:
 *   "indust" + "ri" + "als"  →  "industrials"
 *   "Con" + "oco"            →  "Conoco"
 *   "intern" + "ed"          →  "interned"
 *   "maj" + "ored"           →  "majored"
 *
 * We only glue when BOTH conditions hold:
 *   1. The PREVIOUS token has no vowel at all — the only reliable signal that
 *      it is a mid-word fragment (e.g. "indust", "Con", "maj", "ri", "nts").
 *      Common words like "actually", "very", "being" all contain vowels, so
 *      they are never treated as incomplete.
 *   2. The CURRENT token is a pure-letter suffix AND is not a standalone word.
 */
function isWordFragment(token: string, prevToken: string): boolean {
  const t = token.trim();
  const p = prevToken.trim();

  // Both must be pure letters only (no punctuation, digits, spaces)
  if (!/^[a-zA-Z]+$/.test(t)) return false;
  if (!/^[a-zA-Z]+$/.test(p)) return false;

  // Never glue known standalone words
  if (STANDALONE_WORDS.has(t.toLowerCase())) return false;

  // The previous token must contain NO vowel — the only reliable indicator
  // that it is a mid-word fragment rather than a complete word.
  const prevHasNoVowel = !/[aeiouAEIOU]/.test(p);
  if (!prevHasNoVowel) return false;

  // Current token must be short (≤5 chars) to be a plausible suffix
  if (t.length > 5) return false;

  return true;
}

function mergeTokensToSentence(results: WhisperResult[]): { text: string; startMs: number; endMs: number } | null {
  // Filter out per-token hallucinations
  const real = results.filter(r => {
    const t = r.text.trim();
    return t.length > 0 && !isChunkHallucination(t);
  });
  if (real.length === 0) return null;

  // Join tokens first (before hallucination check) so we can check the full string
  const ATTACH_LEFT = /^[.,!?;:'")\]%]|^'s$|^'t$|^'re$|^'ve$|^'ll$|^'d$|^'m$/;
  const ATTACH_RIGHT = /^[("'\[]/;

  let sentence = '';
  let prevRawToken = '';
  for (const r of real) {
    const token = r.text;
    if (sentence === '') {
      sentence = token;
      prevRawToken = token;
    } else if (ATTACH_LEFT.test(token) || ATTACH_RIGHT.test(sentence.slice(-1))) {
      // Punctuation: attach directly
      sentence = sentence + token;
      prevRawToken = token;
    } else if (isWordFragment(token, prevRawToken)) {
      // Word fragment: glue to previous token without space
      sentence = sentence + token;
      prevRawToken = token;
    } else {
      sentence = sentence + ' ' + token;
      prevRawToken = token;
    }
  }

  const joined = sentence.trim();

  // After joining, check if the full string is a hallucination pattern
  // e.g. "[BLANK_AUDIO]" or "[BL ANK _ AUD IO]" assembled back together
  const normalized = joined.replace(/\s+/g, '');
  if (/^\[BLANK_?AUDIO\]$/i.test(normalized) ||
      /^\[MUSIC\]$/i.test(normalized) ||
      /^\[NOISE\]$/i.test(normalized) ||
      /^\[SILENCE\]$/i.test(normalized) ||
      /^\[INAUDIBLE\]$/i.test(normalized)) {
    return null;
  }

  // Must contain at least one real word (2+ letters)
  if (!/[a-zA-Z]{2,}/.test(joined)) return null;

  return {
    text: joined,
    startMs: real[0].startMs,
    endMs: real[real.length - 1].endMs,
  };
}

/**
 * Apply deterministic punctuation spacing and casing cleanup.
 * - Remove space before punctuation: "hello ," → "hello,"
 * - Ensure one space after sentence-ending punctuation before next word
 * - Capitalize first letter of text and after sentence-ending punctuation
 * - Remove duplicate spaces
 */
function cleanupText(text: string): string {
  if (!text) return '';
  let t = text.replace(/\s+/g, ' ').trim();
  // Remove space before punctuation
  t = t.replace(/\s+([.,!?;:)\]%])/g, '$1');
  // Ensure space after sentence-ending punctuation before next word
  t = t.replace(/([.!?])([A-Za-z])/g, '$1 $2');
  // Capitalize after sentence-ending punctuation
  t = t.replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase());
  // Capitalize first character
  if (/^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

export class LocalWhisperEngine {
  private sessionId: string | null = null;
  private offsetMs = 0;
  private assembledText = '';
  private chunkIndex = 0;
  readonly telemetry = new QualityTelemetry();

  constructor(
    private readonly router: TranscriptionRouter,
    private readonly backend: IWhisperBackend,
  ) {}

  startSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.offsetMs = 0;
    this.assembledText = '';
    this.chunkIndex = 0;
    this.telemetry.reset();
    const config = this.router.getProfileConfig();
    (this.backend as NodeWhisperBackend).setProfileConfig?.(config);
    (this.backend as NodeWhisperBackend).resetContext?.();
    console.log(`[LocalWhisperEngine] Session started, profile: ${this.router.getQualityProfile()}`);
  }

  endSession(): void {
    const summary = this.telemetry.getSummary();
    if (summary.totalChunks > 0) {
      console.log('[LocalWhisperEngine] Session telemetry:', JSON.stringify(summary));
      const gates = this.telemetry.checkGates();
      if (!gates.pass) {
        console.warn('[LocalWhisperEngine] Quality gate failures:', gates.failures.join('; '));
      }
    }
    this.sessionId = null;
    this.offsetMs = 0;
    this.assembledText = '';
    (this.backend as NodeWhisperBackend).resetContext?.();
  }

  async processChunk(
    audioBuffer: Buffer,
    source: 'microphone' | 'system',
  ): Promise<void> {
    if (!this.sessionId) return;

    const chunkStart = Date.now();
    const modelPath = this.router.getModelPath();
    const results = await this.backend.transcribe(audioBuffer, modelPath);
    const firstTokenLatencyMs = Date.now() - chunkStart;

    if (results.length === 0) return;

    console.log('[LocalWhisperEngine] Whisper returned', results.length, 'token(s):', results.map(r => r.text).join(' | '));

    const config = this.router.getProfileConfig();

    // Merge all per-token results into one sentence with proper punctuation attachment
    const merged = mergeTokensToSentence(results);

    if (!merged) {
      console.log('[LocalWhisperEngine] Chunk suppressed (hallucination or no real speech)');
      this.telemetry.record({
        chunkIndex: this.chunkIndex++,
        source,
        chunkDurationMs: config.chunkDurationMs,
        overlapMs: config.overlapMs,
        wordsTranscribed: 0,
        firstTokenLatencyMs,
        dedupRemovedWords: 0,
        profile: this.router.getQualityProfile(),
        timestampMs: Date.now(),
      });
      return;
    }

    const sentence = cleanupText(merged.text);
    console.log(`[LocalWhisperEngine] Merged sentence: "${sentence}"`);

    // Deduplicate against previously assembled text
    const deduped = deduplicateOverlap(this.assembledText, sentence);
    const dedupRemovedWords = deduped !== sentence
      ? sentence.split(/\s+/).filter(Boolean).length - deduped.split(/\s+/).filter(Boolean).length
      : 0;

    const finalText = cleanupText(deduped);
    const wordCount = finalText.split(/\s+/).filter(Boolean).length;

    if (finalText) {
      this.assembledText = this.assembledText
        ? cleanupText(`${this.assembledText} ${finalText}`)
        : finalText;

      const segment: TranscriptSegment = {
        id: uuidv4(),
        sessionId: this.sessionId,
        text: finalText,
        startMs: this.offsetMs + merged.startMs,
        endMs: this.offsetMs + merged.endMs,
        source,
        confidence: 1.0,
        createdAt: Date.now(),
      };
      this.router.emitSegment(segment);
    }

    // Record telemetry
    this.telemetry.record({
      chunkIndex: this.chunkIndex++,
      source,
      chunkDurationMs: config.chunkDurationMs,
      overlapMs: config.overlapMs,
      wordsTranscribed: wordCount,
      firstTokenLatencyMs,
      dedupRemovedWords,
      profile: this.router.getQualityProfile(),
      timestampMs: Date.now(),
    });

    const lastResult = results[results.length - 1];
    if (lastResult) {
      this.offsetMs += lastResult.endMs;
    }
  }
}
