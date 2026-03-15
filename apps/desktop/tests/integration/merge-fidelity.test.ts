/**
 * Integration tests for merge fidelity (P5).
 * Verifies that merged output preserves note structure.
 */
import { ClaudeMergeService } from '../../src/services/merge/ClaudeMergeService';
import { DatabaseManager } from '../../src/storage/sqlite/DatabaseManager';
import { SessionRepository } from '../../src/storage/sqlite/SessionRepository';
import { TranscriptRepository } from '../../src/storage/sqlite/TranscriptRepository';
import { NotesRepository } from '../../src/storage/sqlite/NotesRepository';
import { MergedOutputRepository } from '../../src/storage/sqlite/MergedOutputRepository';
import type { IClaudeClient } from '../../src/services/merge/ClaudeMergeService';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-merge-${Date.now()}-${Math.random()}.db`);
}

function countHeadings(text: string): number {
  return (text.match(/^#{1,3} .+/gm) ?? []).length;
}

function countBullets(text: string): number {
  return (text.match(/^[-*] .+/gm) ?? []).length;
}

describe('Merge Fidelity (P5)', () => {
  let dbPath: string;
  let dbManager: DatabaseManager;
  let mergeService: ClaudeMergeService;

  const NOTES = `## Action Items
- Follow up with engineering team
- Review Q1 metrics dashboard
- Schedule retrospective

## Decisions Made
- Adopt new deployment pipeline
- Deprecate legacy auth service

## Open Questions
- Timeline for mobile release?
- Budget approval status?`;

  const TRANSCRIPT = `We started the meeting by reviewing the Q1 metrics. 
The engineering team confirmed the new deployment pipeline is ready. 
John mentioned the legacy auth service should be deprecated by end of quarter.
Sarah asked about the mobile release timeline - no decision was made.
The budget approval is still pending finance review.
We agreed to schedule a retrospective for next Friday.`;

  beforeEach(() => {
    dbPath = tempDbPath();
    dbManager = new DatabaseManager(dbPath);
    dbManager.migrate();

    const sessionRepo = new SessionRepository(dbManager);
    sessionRepo.insert({
      id: 'fidelity-session',
      title: 'Fidelity Test',
      state: 'stopped',
      createdAt: 1000,
      updatedAt: 2000,
      stoppedAt: 2000,
    });

    const transcriptRepo = new TranscriptRepository(dbManager);
    transcriptRepo.insert({
      id: 'seg-1',
      sessionId: 'fidelity-session',
      text: TRANSCRIPT,
      startMs: 0,
      endMs: 60000,
      source: 'microphone',
      confidence: 0.95,
      createdAt: 1000,
    });

    const notesRepo = new NotesRepository(dbManager);
    notesRepo.upsert({
      sessionId: 'fidelity-session',
      content: NOTES,
      updatedAt: 1500,
    });

    const mergedRepo = new MergedOutputRepository(dbManager);

    const fidelityClient: IClaudeClient = {
      complete: async (_prompt: string) => {
        return `## Action Items
- Follow up with engineering team (confirmed in meeting)
- Review Q1 metrics dashboard (reviewed at start of meeting)
- Schedule retrospective (agreed: next Friday)

## Decisions Made
- Adopt new deployment pipeline (engineering confirmed ready)
- Deprecate legacy auth service (by end of quarter per John)

## Open Questions
- Timeline for mobile release? (no decision made)
- Budget approval status? (pending finance review)

## Additional from Transcript
- Q1 metrics were reviewed at the start of the meeting
- Sarah raised the mobile release timeline question`;
      },
    };

    mergeService = new ClaudeMergeService(mergedRepo, transcriptRepo, notesRepo, fidelityClient);
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('merged output contains all original headings', async () => {
    const result = await mergeService.merge('fidelity-session');
    const originalHeadings = countHeadings(NOTES);
    const mergedHeadings = countHeadings(result.content);
    expect(mergedHeadings).toBeGreaterThanOrEqual(originalHeadings);
  });

  test('merged output retains >= 90% of original bullets', async () => {
    const result = await mergeService.merge('fidelity-session');
    const originalBullets = countBullets(NOTES);
    const mergedBullets = countBullets(result.content);
    const retentionRate = mergedBullets / originalBullets;
    expect(retentionRate).toBeGreaterThanOrEqual(0.9);
  });

  test('original notes are stored verbatim', async () => {
    const result = await mergeService.merge('fidelity-session');
    expect(result.originalNotes).toBe(NOTES);
  });

  test('raw transcript is stored verbatim', async () => {
    const result = await mergeService.merge('fidelity-session');
    expect(result.rawTranscript).toBe(TRANSCRIPT);
  });

  test('merged content is different from original notes', async () => {
    const result = await mergeService.merge('fidelity-session');
    expect(result.content).not.toBe(NOTES);
  });

  test('merged content incorporates transcript facts', async () => {
    const result = await mergeService.merge('fidelity-session');
    expect(result.content.toLowerCase()).toContain('next friday');
  });
});
