import { TelemetryService } from '../../../src/services/TelemetryService';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('TelemetryService', () => {
  let logDir: string;
  let service: TelemetryService;

  beforeEach(() => {
    logDir = path.join(os.tmpdir(), `qa-nola-telemetry-${Date.now()}`);
    service = new TelemetryService(logDir);
  });

  afterEach(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('creates log directory on construction', () => {
    expect(fs.existsSync(logDir)).toBe(true);
  });

  test('flush writes events to log file', () => {
    service.emit('session.created', { sessionId: 'sess-1' });
    service.flush();
    const content = fs.readFileSync(service.getLogPath(), 'utf8');
    expect(content).toContain('session.created');
    expect(content).toContain('sess-1');
  });

  test('flush writes valid JSONL', () => {
    service.emit('recording.started', { sessionId: 'sess-1' });
    service.emit('transcription.segment', { sessionId: 'sess-1' });
    service.flush();
    const lines = fs.readFileSync(service.getLogPath(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test('flush is safe when buffer is empty', () => {
    expect(() => service.flush()).not.toThrow();
  });

  test('each event has a timestamp', () => {
    const before = Date.now();
    service.emit('merge.completed');
    service.flush();
    const line = fs.readFileSync(service.getLogPath(), 'utf8').trim();
    const event = JSON.parse(line);
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
  });
});
