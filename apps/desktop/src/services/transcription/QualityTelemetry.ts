/**
 * Quality telemetry collector for offline transcription.
 *
 * Collects per-chunk metrics and exposes a summary for observable monitoring.
 * Metrics are logged to console and can be read by the eval harness.
 */

export interface ChunkMetric {
  chunkIndex: number;
  source: 'microphone' | 'system';
  chunkDurationMs: number;
  overlapMs: number;
  wordsTranscribed: number;
  firstTokenLatencyMs: number;
  dedupRemovedWords: number;
  profile: string;
  timestampMs: number;
}

export interface TelemetrySummary {
  totalChunks: number;
  totalWords: number;
  avgFirstTokenLatencyMs: number;
  p95FirstTokenLatencyMs: number;
  avgWordsPerChunk: number;
  totalDedupRemovedWords: number;
  dedupRate: number;
  profile: string;
}

export class QualityTelemetry {
  private metrics: ChunkMetric[] = [];

  record(metric: ChunkMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length <= 3 || this.metrics.length % 10 === 0) {
      console.log(
        `[QualityTelemetry] chunk #${metric.chunkIndex} | ` +
        `profile=${metric.profile} | ` +
        `words=${metric.wordsTranscribed} | ` +
        `latency=${metric.firstTokenLatencyMs}ms | ` +
        `dedupRemoved=${metric.dedupRemovedWords}`,
      );
    }
  }

  getSummary(): TelemetrySummary {
    if (this.metrics.length === 0) {
      return {
        totalChunks: 0,
        totalWords: 0,
        avgFirstTokenLatencyMs: 0,
        p95FirstTokenLatencyMs: 0,
        avgWordsPerChunk: 0,
        totalDedupRemovedWords: 0,
        dedupRate: 0,
        profile: 'unknown',
      };
    }

    const latencies = this.metrics.map(m => m.firstTokenLatencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const totalWords = this.metrics.reduce((s, m) => s + m.wordsTranscribed, 0);
    const totalDedup = this.metrics.reduce((s, m) => s + m.dedupRemovedWords, 0);

    return {
      totalChunks: this.metrics.length,
      totalWords,
      avgFirstTokenLatencyMs: latencies.reduce((s, v) => s + v, 0) / latencies.length,
      p95FirstTokenLatencyMs: latencies[p95Index] ?? latencies[latencies.length - 1],
      avgWordsPerChunk: totalWords / this.metrics.length,
      totalDedupRemovedWords: totalDedup,
      dedupRate: totalWords > 0 ? totalDedup / (totalWords + totalDedup) : 0,
      profile: this.metrics[this.metrics.length - 1].profile,
    };
  }

  /** Check quality gates and return pass/fail with details. */
  checkGates(opts?: { maxLatencyP95Ms?: number }): { pass: boolean; failures: string[] } {
    const summary = this.getSummary();
    const failures: string[] = [];
    const maxLatency = opts?.maxLatencyP95Ms ?? 5000;

    if (summary.p95FirstTokenLatencyMs > maxLatency) {
      failures.push(
        `Latency gate FAIL: p95 first-token latency ${summary.p95FirstTokenLatencyMs.toFixed(0)}ms > ${maxLatency}ms`,
      );
    }

    if (summary.totalChunks > 0 && summary.avgWordsPerChunk < 1) {
      failures.push(
        `Throughput gate FAIL: avg words/chunk ${summary.avgWordsPerChunk.toFixed(2)} < 1 (model may not be transcribing)`,
      );
    }

    return { pass: failures.length === 0, failures };
  }

  reset(): void {
    this.metrics = [];
  }

  getMetrics(): readonly ChunkMetric[] {
    return this.metrics;
  }
}
