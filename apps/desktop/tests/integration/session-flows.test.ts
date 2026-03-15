/**
 * Integration tests for critical session flows.
 * These test the full service stack with a real SQLite database.
 */
import { DatabaseManager } from '../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../src/storage/sqlite/SessionRepository';
import { TranscriptRepository } from '../../src/storage/sqlite/TranscriptRepository';
import { NotesRepository } from '../../src/storage/sqlite/NotesRepository';
import { MergedOutputRepository } from '../../src/storage/sqlite/MergedOutputRepository';
import { SessionService } from '../../src/services/SessionService';
import { NotesService } from '../../src/services/NotesService';
import { ClaudeMergeService } from '../../src/services/merge/ClaudeMergeService';
import type { IClaudeClient } from '../../src/services/merge/ClaudeMergeService';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-integration-${Date.now()}-${Math.random()}.db`);
}

function makeClaudeClient(): IClaudeClient {
  return {
    complete: async (prompt: string) => {
      return `## Merged Notes\n\nBased on your notes and the transcript:\n\n${prompt.slice(0, 100)}`;
    },
  };
}

describe('Session Flow Integration', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let sessionService: SessionService;
  let notesService: NotesService;
  let mergeService: ClaudeMergeService;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();

    const sessionRepo = new SessionRepository(dbManager);
    const transcriptRepo = new TranscriptRepository(dbManager);
    const notesRepo = new NotesRepository(dbManager);
    const mergedRepo = new MergedOutputRepository(dbManager);

    sessionService = new SessionService(sessionRepo, transcriptRepo);
    notesService = new NotesService(notesRepo);
    mergeService = new ClaudeMergeService(mergedRepo, transcriptRepo, notesRepo, makeClaudeClient());
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('P2-1: start recording creates a recording session', async () => {
    const session = await sessionService.createSession();
    expect(session.state).toBe('recording');
    const active = await sessionService.getActiveSession();
    expect(active?.id).toBe(session.id);
  });

  test('P2-2: stop recording transitions to stopped state', async () => {
    const session = await sessionService.createSession();
    const stopped = await sessionService.stopSession(session.id);
    expect(stopped.state).toBe('stopped');
    expect(stopped.stoppedAt).toBeDefined();
    const active = await sessionService.getActiveSession();
    expect(active).toBeUndefined();
  });

  test('P2-3: resume same session continues from stopped state', async () => {
    const session = await sessionService.createSession();
    await sessionService.appendTranscriptSegment(session.id, {
      id: 'seg-1', sessionId: session.id, text: 'First part',
      startMs: 0, endMs: 1000, source: 'microphone', confidence: 0.9, createdAt: Date.now(),
    });
    await sessionService.stopSession(session.id);
    const resumed = await sessionService.resumeSession(session.id);
    expect(resumed.state).toBe('recording');
    const segments = await sessionService.getTranscriptSegments(session.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('First part');
  });

  test('P2-4: new session creates fresh context', async () => {
    const session1 = await sessionService.createSession();
    await sessionService.appendTranscriptSegment(session1.id, {
      id: 'seg-1', sessionId: session1.id, text: 'Old content',
      startMs: 0, endMs: 1000, source: 'microphone', confidence: 0.9, createdAt: Date.now(),
    });
    await sessionService.stopSession(session1.id);

    const session2 = await sessionService.createSession();
    expect(session2.id).not.toBe(session1.id);
    const segments = await sessionService.getTranscriptSegments(session2.id);
    expect(segments).toHaveLength(0);
  });

  test('P2-5: merge notes and transcript produces three artifacts', async () => {
    const session = await sessionService.createSession();
    await sessionService.appendTranscriptSegment(session.id, {
      id: 'seg-1', sessionId: session.id, text: 'We agreed on the Q1 plan.',
      startMs: 0, endMs: 2000, source: 'microphone', confidence: 0.95, createdAt: Date.now(),
    });
    await sessionService.stopSession(session.id);
    await notesService.saveNotes(session.id, '## Q1 Plan\n- Item A\n- Item B');

    const merged = await mergeService.merge(session.id);
    expect(merged.content).toBeTruthy();
    expect(merged.originalNotes).toBe('## Q1 Plan\n- Item A\n- Item B');
    expect(merged.rawTranscript).toContain('Q1 plan');

    const stored = await mergeService.getMergedOutput(session.id);
    expect(stored?.content).toBeTruthy();
    expect(stored?.originalNotes).toBeTruthy();
    expect(stored?.rawTranscript).toBeTruthy();
  });

  test('P4: all three artifacts are preserved independently', async () => {
    const session = await sessionService.createSession();
    await sessionService.appendTranscriptSegment(session.id, {
      id: 'seg-1', sessionId: session.id, text: 'Transcript text here.',
      startMs: 0, endMs: 1000, source: 'microphone', confidence: 0.9, createdAt: Date.now(),
    });
    await sessionService.stopSession(session.id);
    await notesService.saveNotes(session.id, '## Original Notes\n- Note 1');

    const merged = await mergeService.merge(session.id);

    expect(merged.rawTranscript).toBe('Transcript text here.');
    expect(merged.originalNotes).toBe('## Original Notes\n- Note 1');
    expect(merged.content).not.toBe(merged.originalNotes);
    expect(merged.content).not.toBe(merged.rawTranscript);
  });

  test('multiple sessions are independent', async () => {
    const s1 = await sessionService.createSession();
    const s2 = await sessionService.createSession();
    await sessionService.stopSession(s1.id);
    await sessionService.stopSession(s2.id);

    await sessionService.appendTranscriptSegment(s1.id, {
      id: 'seg-s1', sessionId: s1.id, text: 'Session 1 text',
      startMs: 0, endMs: 500, source: 'microphone', confidence: 0.9, createdAt: Date.now(),
    });

    const s1segs = await sessionService.getTranscriptSegments(s1.id);
    const s2segs = await sessionService.getTranscriptSegments(s2.id);
    expect(s1segs).toHaveLength(1);
    expect(s2segs).toHaveLength(0);
  });

  test('notes are session-scoped', async () => {
    const s1 = await sessionService.createSession();
    const s2 = await sessionService.createSession();
    await notesService.saveNotes(s1.id, 'Notes for session 1');
    await notesService.saveNotes(s2.id, 'Notes for session 2');

    const n1 = await notesService.getNotes(s1.id);
    const n2 = await notesService.getNotes(s2.id);
    expect(n1?.content).toBe('Notes for session 1');
    expect(n2?.content).toBe('Notes for session 2');
  });
});
