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

function makeClaudeClient(response: string): IClaudeClient {
  return {
    complete: async (_prompt: string) => response,
  };
}

describe('ClaudeMergeService', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let service: ClaudeMergeService;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();

    const sessionRepo = new SessionRepository(dbManager);
    sessionRepo.insert({
      id: 'session-1',
      title: 'Test',
      state: 'stopped',
      createdAt: 1000,
      updatedAt: 2000,
      stoppedAt: 2000,
    });

    const transcriptRepo = new TranscriptRepository(dbManager);
    transcriptRepo.insert({
      id: 'seg-1',
      sessionId: 'session-1',
      text: 'We discussed the Q1 roadmap and agreed on three priorities.',
      startMs: 0,
      endMs: 5000,
      source: 'microphone',
      confidence: 0.95,
      createdAt: 1000,
    });

    const notesRepo = new NotesRepository(dbManager);
    notesRepo.upsert({
      sessionId: 'session-1',
      content: '## Q1 Roadmap\n- Priority 1\n- Priority 2',
      updatedAt: 1500,
    });

    const mergedRepo = new MergedOutputRepository(dbManager);
    service = new ClaudeMergeService(
      mergedRepo,
      transcriptRepo,
      notesRepo,
      makeClaudeClient('## Q1 Roadmap\n- Priority 1 (confirmed in meeting)\n- Priority 2\n- Priority 3 (from transcript)'),
    );
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('merge returns merged output with content', async () => {
    const result = await service.merge('session-1');
    expect(result.content).toBeTruthy();
    expect(result.sessionId).toBe('session-1');
  });

  test('merge preserves original notes in artifact', async () => {
    const result = await service.merge('session-1');
    expect(result.originalNotes).toBe('## Q1 Roadmap\n- Priority 1\n- Priority 2');
  });

  test('merge preserves raw transcript in artifact', async () => {
    const result = await service.merge('session-1');
    expect(result.rawTranscript).toContain('Q1 roadmap');
  });

  test('merge persists result to storage', async () => {
    await service.merge('session-1');
    const stored = await service.getMergedOutput('session-1');
    expect(stored).toBeDefined();
    expect(stored?.content).toBeTruthy();
  });

  test('getMergedOutput returns undefined when no merge exists', async () => {
    const result = await service.getMergedOutput('session-1');
    expect(result).toBeUndefined();
  });

  test('merge throws when session has no transcript', async () => {
    const emptyMergedRepo = new MergedOutputRepository(dbManager);
    const emptyTranscriptRepo = new TranscriptRepository(dbManager);
    const notesRepo = new NotesRepository(dbManager);

    const sessionRepo = new SessionRepository(dbManager);
    sessionRepo.insert({
      id: 'empty-session',
      title: 'Empty',
      state: 'stopped',
      createdAt: 1000,
      updatedAt: 1000,
    });

    const emptyService = new ClaudeMergeService(
      emptyMergedRepo,
      emptyTranscriptRepo,
      notesRepo,
      makeClaudeClient(''),
    );

    await expect(emptyService.merge('empty-session')).rejects.toThrow(/no transcript/i);
  });
});
