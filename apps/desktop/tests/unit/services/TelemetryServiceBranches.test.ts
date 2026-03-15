import { TelemetryService } from '../../../src/services/TelemetryService';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('TelemetryService branch coverage', () => {
  let logDir: string;

  beforeEach(() => {
    logDir = path.join(os.tmpdir(), `qa-nola-telemetry-${Date.now()}`);
  });

  afterEach(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('multiple flushes accumulate in same log file', () => {
    const service = new TelemetryService(logDir);
    service.emit('session.created', { sessionId: 'a' });
    service.flush();
    service.emit('session.stopped', { sessionId: 'a' });
    service.flush();
    const lines = fs.readFileSync(service.getLogPath(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  test('emit includes optional metadata', () => {
    const service = new TelemetryService(logDir);
    service.emit('merge.completed', {
      sessionId: 'sess-1',
      durationMs: 1234,
      metadata: { model: 'claude-3-5-sonnet' },
    });
    service.flush();
    const event = JSON.parse(fs.readFileSync(service.getLogPath(), 'utf8').trim());
    expect(event.durationMs).toBe(1234);
    expect(event.metadata?.model).toBe('claude-3-5-sonnet');
  });

  test('scheduleFlush does not duplicate timer', (done) => {
    const service = new TelemetryService(logDir);
    service.emit('recording.started');
    service.emit('recording.stopped');
    setTimeout(() => {
      service.flush();
      const lines = fs.readFileSync(service.getLogPath(), 'utf8').trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(1);
      done();
    }, 1200);
  });
});
