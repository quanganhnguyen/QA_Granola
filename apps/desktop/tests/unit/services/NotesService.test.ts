import { NotesService } from '../../../src/services/NotesService';
import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import { NotesRepository } from '../../../src/storage/sqlite/NotesRepository';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

describe('NotesService', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let service: NotesService;

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
    const notesRepo = new NotesRepository(dbManager);
    service = new NotesService(notesRepo);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('saveNotes persists content for session', async () => {
    await service.saveNotes('session-1', '## Action items\n- Item 1');
    const notes = await service.getNotes('session-1');
    expect(notes?.content).toBe('## Action items\n- Item 1');
  });

  test('getNotes returns undefined for session with no notes', async () => {
    const notes = await service.getNotes('session-1');
    expect(notes).toBeUndefined();
  });

  test('saveNotes overwrites previous content', async () => {
    await service.saveNotes('session-1', 'first');
    await service.saveNotes('session-1', 'second');
    const notes = await service.getNotes('session-1');
    expect(notes?.content).toBe('second');
  });
});
