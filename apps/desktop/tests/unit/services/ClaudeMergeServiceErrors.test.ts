import { ClaudeMergeService } from '../../../src/services/merge/ClaudeMergeService';
import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../../src/storage/sqlite/SessionRepository';
import { TranscriptRepository } from '../../../src/storage/sqlite/TranscriptRepository';
import { NotesRepository } from '../../../src/storage/sqlite/NotesRepository';
import { MergedOutputRepository } from '../../../src/storage/sqlite/MergedOutputRepository';
import type { IClaudeClient } from '../../../src/services/merge/ClaudeMergeService';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

describe('ClaudeMergeService error paths', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();
    const sessionRepo = new SessionRepository(dbManager);
    sessionRepo.insert({
      id: 'sess-1',
      title: 'Test',
      state: 'stopped',
      createdAt: 1000,
      updatedAt: 2000,
      stoppedAt: 2000,
    });
    const transcriptRepo = new TranscriptRepository(dbManager);
    transcriptRepo.insert({
      id: 'seg-1',
      sessionId: 'sess-1',
      text: 'Some transcript text.',
      startMs: 0,
      endMs: 1000,
      source: 'microphone',
      confidence: 0.9,
      createdAt: 1000,
    });
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('merge propagates client error', async () => {
    const failingClient: IClaudeClient = {
      complete: async () => { throw new Error('API unavailable'); },
    };
    const service = new ClaudeMergeService(
      new MergedOutputRepository(dbManager),
      new TranscriptRepository(dbManager),
      new NotesRepository(dbManager),
      failingClient,
    );
    await expect(service.merge('sess-1')).rejects.toThrow('API unavailable');
  });

  test('merge uses empty string for notes when none exist', async () => {
    let capturedPrompt = '';
    const capturingClient: IClaudeClient = {
      complete: async (prompt: string) => {
        capturedPrompt = prompt;
        return 'merged result';
      },
    };
    const service = new ClaudeMergeService(
      new MergedOutputRepository(dbManager),
      new TranscriptRepository(dbManager),
      new NotesRepository(dbManager),
      capturingClient,
    );
    await service.merge('sess-1');
    expect(capturedPrompt).toContain('(no notes taken)');
  });
});
