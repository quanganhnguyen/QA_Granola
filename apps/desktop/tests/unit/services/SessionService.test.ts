import { SessionService } from '../../../src/services/SessionService';
import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import { TranscriptRepository } from '../../../src/storage/sqlite/TranscriptRepository';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

describe('SessionService', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let service: SessionService;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();
    const sessionRepo = new SessionRepository(dbManager);
    const transcriptRepo = new TranscriptRepository(dbManager);
    service = new SessionService(sessionRepo, transcriptRepo);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('createSession returns a session in recording state', async () => {
    const session = await service.createSession();
    expect(session.state).toBe('recording');
    expect(session.id).toBeTruthy();
  });

  test('createSession persists the session', async () => {
    const session = await service.createSession();
    const found = await service.getSessionById(session.id);
    expect(found?.id).toBe(session.id);
  });

  test('stopSession transitions state to stopped', async () => {
    const session = await service.createSession();
    const stopped = await service.stopSession(session.id);
    expect(stopped.state).toBe('stopped');
    expect(stopped.stoppedAt).toBeDefined();
  });

  test('resumeSession transitions stopped session to recording', async () => {
    const session = await service.createSession();
    await service.stopSession(session.id);
    const resumed = await service.resumeSession(session.id);
    expect(resumed.state).toBe('recording');
  });

  test('resumeSession throws when session not found', async () => {
    await expect(service.resumeSession('nonexistent')).rejects.toThrow();
  });

  test('getActiveSession returns the recording session', async () => {
    const session = await service.createSession();
    const active = await service.getActiveSession();
    expect(active?.id).toBe(session.id);
  });

  test('getActiveSession returns undefined when no recording session', async () => {
    const session = await service.createSession();
    await service.stopSession(session.id);
    const active = await service.getActiveSession();
    expect(active).toBeUndefined();
  });

  test('appendTranscriptSegment stores segment for session', async () => {
    const session = await service.createSession();
    await service.appendTranscriptSegment(session.id, {
      id: 'seg-1',
      sessionId: session.id,
      text: 'Hello',
      startMs: 0,
      endMs: 500,
      source: 'microphone',
      confidence: 0.9,
      createdAt: Date.now(),
    });
    const segments = await service.getTranscriptSegments(session.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
  });

  test('getAllSessions returns all sessions', async () => {
    await service.createSession();
    await service.createSession();
    const all = await service.getAllSessions();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
