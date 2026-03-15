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

describe('SessionService branch coverage', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let service: SessionService;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();
    service = new SessionService(
      new SessionRepository(dbManager),
      new TranscriptRepository(dbManager),
    );
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('stopSession throws when session not found', async () => {
    await expect(service.stopSession('nonexistent')).rejects.toThrow('Session not found: nonexistent');
  });

  test('createSession generates unique ids', async () => {
    const s1 = await service.createSession();
    const s2 = await service.createSession();
    expect(s1.id).not.toBe(s2.id);
  });
});
