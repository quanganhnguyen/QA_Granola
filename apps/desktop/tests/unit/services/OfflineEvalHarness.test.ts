/**
 * Offline Eval Harness
 *
 * Runs quality gates against the eval fixture samples.
 * Pass/fail thresholds match the plan's quality contract:
 *   - WER <= 15% per sample
 *   - Punctuation F1 >= 0.88 per sample
 *   - Sentence capitalization accuracy >= 97% (after cleanup)
 *
 * This harness is deterministic (no model binary required) and runs in CI.
 * For live model evaluation, swap in real Whisper output as `hypothesis`.
 */

import { EVAL_SAMPLES } from '../../fixtures/eval-samples';

// ---------------------------------------------------------------------------
// Metric helpers (duplicated from QualityContract.test.ts for isolation)
// ---------------------------------------------------------------------------

function computeWER(reference: string, hypothesis: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const ref = normalize(reference).split(/\s+/).filter(Boolean);
  const hyp = normalize(hypothesis).split(/\s+/).filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  const dp: number[][] = Array.from({ length: ref.length + 1 }, (_, i) =>
    Array.from({ length: hyp.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      dp[i][j] = ref[i - 1] === hyp[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[ref.length][hyp.length] / ref.length;
}

function computePunctuationF1(reference: string, hypothesis: string): number {
  const PUNCT = /[.,!?;:]/g;
  const refCount = (reference.match(PUNCT) ?? []).length;
  const hypCount = (hypothesis.match(PUNCT) ?? []).length;
  if (refCount === 0 && hypCount === 0) return 1;
  const tp = Math.min(refCount, hypCount);
  const precision = hypCount === 0 ? 0 : tp / hypCount;
  const recall = refCount === 0 ? 1 : tp / refCount;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}


function cleanupText(text: string): string {
  if (!text) return '';
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/([.!?])\s*([a-z])/g, (_, end, letter) => `${end} ${letter.toUpperCase()}`);
  if (/^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

function sentenceCapitalizationAccuracy(text: string): number {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length === 0) return 1;
  return sentences.filter(s => /^[A-Z]/.test(s)).length / sentences.length;
}

// ---------------------------------------------------------------------------
// Quality gates
// ---------------------------------------------------------------------------

const WER_GATE = 0.15;
const PUNCT_F1_GATE = 0.88;
const CAP_ACCURACY_GATE = 0.97;

// ---------------------------------------------------------------------------
// Eval harness tests
// ---------------------------------------------------------------------------

describe('Offline Eval Harness', () => {
  describe('Per-sample quality gates', () => {
    for (const sample of EVAL_SAMPLES) {
      describe(`Sample: ${sample.id} (${sample.description})`, () => {
        test(`WER <= ${WER_GATE * 100}%`, () => {
          const wer = computeWER(sample.reference, sample.hypothesis);
          expect(wer).toBeLessThanOrEqual(WER_GATE);
        });

        test(`Punctuation F1 >= ${PUNCT_F1_GATE}`, () => {
          const f1 = computePunctuationF1(sample.reference, sample.hypothesis);
          expect(f1).toBeGreaterThanOrEqual(PUNCT_F1_GATE);
        });

        test(`Capitalization accuracy >= ${CAP_ACCURACY_GATE * 100}% after cleanup`, () => {
          const cleaned = cleanupText(sample.hypothesis);
          const acc = sentenceCapitalizationAccuracy(cleaned);
          expect(acc).toBeGreaterThanOrEqual(CAP_ACCURACY_GATE);
        });
      });
    }
  });

  describe('Aggregate quality summary', () => {
    test('average WER across all samples <= 15%', () => {
      const wers = EVAL_SAMPLES.map(s => computeWER(s.reference, s.hypothesis));
      const avgWER = wers.reduce((a, b) => a + b, 0) / wers.length;
      expect(avgWER).toBeLessThanOrEqual(WER_GATE);
    });

    test('average Punctuation F1 across all samples >= 0.88', () => {
      const f1s = EVAL_SAMPLES.map(s => computePunctuationF1(s.reference, s.hypothesis));
      const avgF1 = f1s.reduce((a, b) => a + b, 0) / f1s.length;
      expect(avgF1).toBeGreaterThanOrEqual(PUNCT_F1_GATE);
    });

    test('all samples pass capitalization gate after cleanup', () => {
      for (const sample of EVAL_SAMPLES) {
        const cleaned = cleanupText(sample.hypothesis);
        const acc = sentenceCapitalizationAccuracy(cleaned);
        expect(acc).toBeGreaterThanOrEqual(CAP_ACCURACY_GATE);
      }
    });
  });
});
