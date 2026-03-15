import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import { NotesRepository } from '../../../src/storage/sqlite/NotesRepository';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

describe('NotesRepository', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let repo: NotesRepository;

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
    repo = new NotesRepository(dbManager);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('returns undefined for session with no notes', () => {
    expect(repo.findBySessionId('session-1')).toBeUndefined();
  });

  test('upserts notes for a session', () => {
    repo.upsert({ sessionId: 'session-1', content: '## My notes', updatedAt: 1000 });
    const notes = repo.findBySessionId('session-1');
    expect(notes?.content).toBe('## My notes');
  });

  test('upsert updates existing notes', () => {
    repo.upsert({ sessionId: 'session-1', content: 'original', updatedAt: 1000 });
    repo.upsert({ sessionId: 'session-1', content: 'updated', updatedAt: 2000 });
    const notes = repo.findBySessionId('session-1');
    expect(notes?.content).toBe('updated');
    expect(notes?.updatedAt).toBe(2000);
  });
});
