import fs from 'fs';
import path from 'path';

export type TelemetryEventName =
  | 'session.created'
  | 'session.stopped'
  | 'session.resumed'
  | 'recording.started'
  | 'recording.stopped'
  | 'transcription.segment'
  | 'transcription.error'
  | 'merge.started'
  | 'merge.completed'
  | 'merge.failed'
  | 'model.verified'
  | 'model.missing';

export interface TelemetryEvent {
  event: TelemetryEventName;
  sessionId?: string;
  timestamp: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export class TelemetryService {
  private logPath: string;
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(logDir: string) {
    fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, `telemetry-${new Date().toISOString().slice(0, 10)}.jsonl`);
  }

  emit(event: TelemetryEventName, data: Omit<TelemetryEvent, 'event' | 'timestamp'> = {}): void {
    const entry: TelemetryEvent = {
      event,
      timestamp: Date.now(),
      ...data,
    };
    this.buffer.push(entry);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, 1000);
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(this.logPath, lines);
    this.buffer = [];
  }

  getLogPath(): string {
    return this.logPath;
  }
}
