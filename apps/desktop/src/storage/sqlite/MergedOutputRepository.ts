import type { DatabaseManager } from './DatabaseManager';
import type { MergedOutput } from '../../domain/session';

interface MergedRow {
  session_id: string;
  content: string;
  raw_transcript: string;
  original_notes: string;
  created_at: number;
}

export class MergedOutputRepository {
  constructor(private readonly dbManager: DatabaseManager) {}

  upsert(output: MergedOutput): void {
    this.dbManager.getDb().prepare(`
      INSERT INTO merged_outputs (session_id, content, raw_transcript, original_notes, created_at)
      VALUES (@sessionId, @content, @rawTranscript, @originalNotes, @createdAt)
      ON CONFLICT(session_id) DO UPDATE SET
        content = excluded.content,
        raw_transcript = excluded.raw_transcript,
        original_notes = excluded.original_notes,
        created_at = excluded.created_at
    `).run({
      sessionId: output.sessionId,
      content: output.content,
      rawTranscript: output.rawTranscript,
      originalNotes: output.originalNotes,
      createdAt: output.createdAt,
    });
  }

  findBySessionId(sessionId: string): MergedOutput | undefined {
    const row = this.dbManager.getDb().prepare(
      'SELECT * FROM merged_outputs WHERE session_id = ?'
    ).get(sessionId) as MergedRow | undefined;
    if (!row) return undefined;
    return {
      sessionId: row.session_id,
      content: row.content,
      rawTranscript: row.raw_transcript,
      originalNotes: row.original_notes,
      createdAt: row.created_at,
    };
  }
}
