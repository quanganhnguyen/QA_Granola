import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import { TranscriptRepository } from '../../../src/storage/sqlite/TranscriptRepository';
import type { TranscriptSegment } from '../../../src/domain/session';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: 'seg-1',
    sessionId: 'session-1',
    text: 'Hello world',
    startMs: 0,
    endMs: 1000,
    source: 'microphone',
    confidence: 0.95,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('TranscriptRepository', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let repo: TranscriptRepository;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();
    const sessionRepo = new SessionRepository(dbManager);
    sessionRepo.insert({
      id: 'session-1',
      title: 'Test',
      state: 'recording',
      createdAt: 1000,
      updatedAt: 1000,
    });
    repo = new TranscriptRepository(dbManager);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('inserts and retrieves segment by session id', () => {
    const seg = makeSegment();
    repo.insert(seg);
    const found = repo.findBySessionId('session-1');
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe('Hello world');
  });

  test('returns segments ordered by startMs ascending', () => {
    repo.insert(makeSegment({ id: 'seg-2', startMs: 2000, endMs: 3000, text: 'Second' }));
    repo.insert(makeSegment({ id: 'seg-1', startMs: 0, endMs: 1000, text: 'First' }));
    const segs = repo.findBySessionId('session-1');
    expect(segs[0].text).toBe('First');
    expect(segs[1].text).toBe('Second');
  });

  test('getFullText concatenates segment text with spaces', () => {
    repo.insert(makeSegment({ id: 'seg-1', startMs: 0, text: 'Hello' }));
    repo.insert(makeSegment({ id: 'seg-2', startMs: 1000, text: 'world' }));
    expect(repo.getFullText('session-1')).toBe('Hello world');
  });

  test('returns empty array for session with no segments', () => {
    expect(repo.findBySessionId('session-1')).toEqual([]);
  });

  test('stores system audio source', () => {
    repo.insert(makeSegment({ source: 'system' }));
    const segs = repo.findBySessionId('session-1');
    expect(segs[0].source).toBe('system');
  });
});
