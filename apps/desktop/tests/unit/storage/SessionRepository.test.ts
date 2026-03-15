import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import type { Session } from '../../../src/domain/session';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-1',
    title: 'Test Session',
    state: 'idle',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('SessionRepository', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let repo: SessionRepository;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();
    repo = new SessionRepository(dbManager);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('inserts and retrieves a session by id', () => {
    const session = makeSession();
    repo.insert(session);
    const found = repo.findById(session.id);
    expect(found).toEqual(session);
  });

  test('returns undefined for unknown id', () => {
    expect(repo.findById('nonexistent')).toBeUndefined();
  });

  test('updates session state', () => {
    const session = makeSession();
    repo.insert(session);
    const updated = { ...session, state: 'recording' as const, updatedAt: 2000 };
    repo.update(updated);
    expect(repo.findById(session.id)?.state).toBe('recording');
  });

  test('findActive returns recording session', () => {
    repo.insert(makeSession({ id: 'idle-1', state: 'idle' }));
    repo.insert(makeSession({ id: 'rec-1', state: 'recording' }));
    const active = repo.findActive();
    expect(active?.id).toBe('rec-1');
  });

  test('findActive returns undefined when no recording session', () => {
    repo.insert(makeSession({ id: 's1', state: 'stopped' }));
    expect(repo.findActive()).toBeUndefined();
  });

  test('findAll returns sessions ordered by createdAt descending', () => {
    repo.insert(makeSession({ id: 'a', createdAt: 1000, updatedAt: 1000 }));
    repo.insert(makeSession({ id: 'b', createdAt: 2000, updatedAt: 2000 }));
    const all = repo.findAll();
    expect(all[0].id).toBe('b');
    expect(all[1].id).toBe('a');
  });

  test('persists stoppedAt timestamp', () => {
    const session = makeSession({ stoppedAt: 9999 });
    repo.insert(session);
    expect(repo.findById(session.id)?.stoppedAt).toBe(9999);
  });
});
