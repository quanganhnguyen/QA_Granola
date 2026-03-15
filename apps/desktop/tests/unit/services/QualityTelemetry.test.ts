import { QualityTelemetry } from '../../../src/services/transcription/QualityTelemetry';

function makeMetric(overrides: Partial<Parameters<QualityTelemetry['record']>[0]> = {}) {
  return {
    chunkIndex: 0,
    source: 'microphone' as const,
    chunkDurationMs: 5000,
    overlapMs: 750,
    wordsTranscribed: 10,
    firstTokenLatencyMs: 1200,
    dedupRemovedWords: 2,
    profile: 'balanced',
    timestampMs: Date.now(),
    ...overrides,
  };
}

describe('QualityTelemetry', () => {
  test('getSummary returns zeros when no metrics recorded', () => {
    const t = new QualityTelemetry();
    const s = t.getSummary();
    expect(s.totalChunks).toBe(0);
    expect(s.totalWords).toBe(0);
  });

  test('records metrics and computes summary', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric({ wordsTranscribed: 10, firstTokenLatencyMs: 1000 }));
    t.record(makeMetric({ wordsTranscribed: 8, firstTokenLatencyMs: 1200 }));
    const s = t.getSummary();
    expect(s.totalChunks).toBe(2);
    expect(s.totalWords).toBe(18);
    expect(s.avgFirstTokenLatencyMs).toBe(1100);
  });

  test('p95 latency is computed correctly', () => {
    const t = new QualityTelemetry();
    for (let i = 0; i < 20; i++) {
      t.record(makeMetric({ firstTokenLatencyMs: i * 100 }));
    }
    const s = t.getSummary();
    // p95 of 20 items: index 19 = 1900ms
    expect(s.p95FirstTokenLatencyMs).toBe(1900);
  });

  test('dedup rate is computed correctly', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric({ wordsTranscribed: 8, dedupRemovedWords: 2 }));
    const s = t.getSummary();
    // 2 removed out of 10 total (8 kept + 2 removed)
    expect(s.dedupRate).toBeCloseTo(0.2);
  });

  test('checkGates passes when latency is within budget', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric({ firstTokenLatencyMs: 1000, wordsTranscribed: 5 }));
    const result = t.checkGates({ maxLatencyP95Ms: 3000 });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  test('checkGates fails when latency exceeds budget', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric({ firstTokenLatencyMs: 5000, wordsTranscribed: 5 }));
    const result = t.checkGates({ maxLatencyP95Ms: 3000 });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/latency gate fail/i);
  });

  test('checkGates fails when avg words/chunk < 1', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric({ wordsTranscribed: 0, firstTokenLatencyMs: 500 }));
    const result = t.checkGates({ maxLatencyP95Ms: 5000 });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/throughput gate fail/i);
  });

  test('reset clears all metrics', () => {
    const t = new QualityTelemetry();
    t.record(makeMetric());
    t.reset();
    expect(t.getSummary().totalChunks).toBe(0);
  });
});
