import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import type { IWhisperBackend, WhisperResult } from './LocalWhisperEngine';
import type { ProfileConfig } from './QualityProfile';

const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/**
 * Create a WAV file header for raw 16-bit PCM mono at 16kHz.
 */
function createWavHeader(dataLength: number): Buffer {
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = NUM_CHANNELS * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/** Parse whisper-node timestamp string "00:00:14.310" or "00:00:14" to milliseconds. */
function timestampToMs(s: string): number {
  const parts = s.trim().split(/:|\./).map(Number);
  if (parts.length >= 3) {
    const [h = 0, m = 0, sec = 0, ms = 0] = parts;
    return ((h * 3600 + m * 60 + sec) * 1000) + ms;
  }
  if (parts.length === 1 && !Number.isNaN(parts[0])) return Math.round(parts[0] * 1000);
  return 0;
}

export class NodeWhisperBackend implements IWhisperBackend {
  private profileConfig: ProfileConfig | null = null;
  /** When set (packaged app), we run whisper.cpp/main ourselves from this cwd to avoid whisper-node's process.exit(1). */
  private readonly whisperCwdPath: string | null;

  constructor(whisperCwdPath?: string | null) {
    this.whisperCwdPath = whisperCwdPath ?? null;
  }

  setProfileConfig(config: ProfileConfig): void {
    this.profileConfig = config;
  }

  resetContext(): void {
    // No audio overlap buffer to reset — we no longer prepend overlap audio
    // because it caused Whisper to re-transcribe the same words, producing duplicates.
  }

  async transcribe(audioBuffer: Buffer, modelPath: string): Promise<WhisperResult[]> {
    if (audioBuffer.length === 0) return [];

    if (!modelPath || !fs.existsSync(modelPath)) {
      console.error('[NodeWhisperBackend] Model file missing or invalid path:', modelPath);
      return [];
    }

    const config = this.profileConfig;
    const beamSize = config?.beamSize ?? 3;
    const bestOf = config?.bestOf ?? 3;
    const language = config?.language ?? 'en';

    const tempPath = path.join(
      os.tmpdir(),
      `qa-nola-whisper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`,
    );

    try {
      const header = createWavHeader(audioBuffer.length);
      fs.writeFileSync(tempPath, Buffer.concat([header, audioBuffer]));

      console.log(
        `[NodeWhisperBackend] Transcribing ${audioBuffer.length} bytes, model: ${modelPath} ` +
        `(beam=${beamSize}, bestOf=${bestOf}, lang=${language})`,
      );

      let results: { speech: string; start: string | number; end: string | number }[];

      if (this.whisperCwdPath && fs.existsSync(path.join(this.whisperCwdPath, 'main'))) {
        results = await this.runWhisperDirect(tempPath, modelPath, { language, word_timestamps: true, beam_size: beamSize, best_of: bestOf });
      } else {
        const rawResults = await this.runWhisperViaModule(tempPath, modelPath, { language, word_timestamps: true, beam_size: beamSize, best_of: bestOf });
        results = rawResults as { speech: string; start: string | number; end: string | number }[];
      }

      if (!results || !Array.isArray(results)) return [];

      return results
        .map((seg: { speech: string; start: string | number; end: string | number }) => {
          const startMs = typeof seg.start === 'number'
            ? Math.round(seg.start * 1000)
            : timestampToMs(String(seg.start));
          const endMs = typeof seg.end === 'number'
            ? Math.round(seg.end * 1000)
            : timestampToMs(String(seg.end));

          return {
            text: (seg.speech ?? '').trim(),
            startMs,
            endMs,
            confidence: 1.0,
          };
        })
        .filter((r: WhisperResult) => r.text.length > 0);
    } catch (err) {
      console.error('[NodeWhisperBackend] transcribe error:', err);
      return [];
    } finally {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }

  /** Run whisper.cpp/main from unpacked path (packaged app). Uses execFileSync so paths with spaces (e.g. "QA Nola.app") work. */
  private async runWhisperDirect(
    filePath: string,
    modelPath: string,
    options: { language: string; word_timestamps: boolean; beam_size: number; best_of: number },
  ): Promise<{ speech: string; start: string | number; end: string | number }[]> {
    const parseTranscript = require('whisper-node/dist/tsToArray').default;
    const mainPath = path.join(this.whisperCwdPath!, 'main');
    const args = [
      '-ml', '1',
      '-l', options.language,
      '-m', path.normalize(modelPath),
      '-f', path.normalize(filePath),
    ];
    let stdout: string;
    try {
      stdout = execFileSync(mainPath, args, {
        cwd: this.whisperCwdPath!,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      console.error('[NodeWhisperBackend] runWhisperDirect exec failed:', err);
      return [];
    }
    if (!stdout || !stdout.trim()) {
      console.log('[NodeWhisperBackend] runWhisperDirect empty stdout');
      return [];
    }
    console.log('[NodeWhisperBackend] runWhisperDirect stdout length:', stdout.length, 'preview:', stdout.slice(0, 400).replace(/\n/g, ' '));
    let parsed: { start: string; end: string; speech: string }[];
    try {
      const raw = parseTranscript(stdout);
      if (!raw || !Array.isArray(raw)) parsed = [];
      else parsed = raw;
    } catch (parseErr) {
      console.error('[NodeWhisperBackend] runWhisperDirect parse failed:', parseErr);
      parsed = this.parseWhisperStdoutFallback(stdout);
    }
    return parsed.map((p) => ({
      start: p.start,
      end: p.end,
      speech: p.speech,
    }));
  }

  /** Fallback parser when tsToArray fails (e.g. format difference). Expects "[start --> end]  text" lines. */
  private parseWhisperStdoutFallback(stdout: string): { start: string; end: string; speech: string }[] {
    const lines = stdout.match(/\[[0-9:.]+\s-->\s[0-9:.]+\]\s{2,}.+/g);
    if (!lines || lines.length === 0) return [];
    return lines.map((line) => {
      const bracket = line.indexOf(']');
      const timestamp = line.slice(1, bracket).trim();
      const [start, end] = timestamp.split(/\s*-->\s*/);
      const speech = line.slice(bracket + 1).replace(/\s+/g, ' ').trim();
      return { start: start ?? '', end: end ?? '', speech };
    });
  }

  /** Run via whisper-node module (dev). Loads shell.js which can process.exit(1) in packaged app. */
  private async runWhisperViaModule(
    filePath: string,
    modelPath: string,
    options: { language: string; word_timestamps: boolean; beam_size: number; best_of: number },
  ): Promise<unknown[]> {
    const { whisper } = require('whisper-node');
    return whisper(filePath, {
      modelPath,
      whisperOptions: options,
    });
  }
}
