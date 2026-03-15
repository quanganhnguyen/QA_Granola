import type { DatabaseManager } from './DatabaseManager';
import type { Notes } from '../../domain/session';

interface NotesRow {
  session_id: string;
  content: string;
  updated_at: number;
}

export class NotesRepository {
  constructor(private readonly dbManager: DatabaseManager) {}

  upsert(notes: Notes): void {
    this.dbManager.getDb().prepare(`
      INSERT INTO notes (session_id, content, updated_at)
      VALUES (@sessionId, @content, @updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `).run({
      sessionId: notes.sessionId,
      content: notes.content,
      updatedAt: notes.updatedAt,
    });
  }

  findBySessionId(sessionId: string): Notes | undefined {
    const row = this.dbManager.getDb().prepare(
      'SELECT * FROM notes WHERE session_id = ?'
    ).get(sessionId) as NotesRow | undefined;
    if (!row) return undefined;
    return {
      sessionId: row.session_id,
      content: row.content,
      updatedAt: row.updated_at,
    };
  }
}
