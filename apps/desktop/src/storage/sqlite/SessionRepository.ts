import type { DatabaseManager } from './DatabaseManager';
import type { Session, SessionState } from '../../domain/session';

interface SessionRow {
  id: string;
  title: string;
  state: string;
  created_at: number;
  updated_at: number;
  stopped_at: number | null;
  session_number: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    sessionNumber: row.session_number ?? 0,
    state: row.state as SessionState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stoppedAt: row.stopped_at ?? undefined,
  };
}

export class SessionRepository {
  constructor(private readonly dbManager: DatabaseManager) {}

  insert(session: Session): void {
    this.dbManager.getDb().prepare(`
      INSERT INTO sessions (id, title, session_number, state, created_at, updated_at, stopped_at)
      VALUES (@id, @title, @sessionNumber, @state, @createdAt, @updatedAt, @stoppedAt)
    `).run({
      id: session.id,
      title: session.title,
      sessionNumber: session.sessionNumber,
      state: session.state,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      stoppedAt: session.stoppedAt ?? null,
    });
  }

  update(session: Session): void {
    this.dbManager.getDb().prepare(`
      UPDATE sessions
      SET title = @title, session_number = @sessionNumber, state = @state,
          updated_at = @updatedAt, stopped_at = @stoppedAt
      WHERE id = @id
    `).run({
      id: session.id,
      title: session.title,
      sessionNumber: session.sessionNumber,
      state: session.state,
      updatedAt: session.updatedAt,
      stoppedAt: session.stoppedAt ?? null,
    });
  }

  nextSessionNumber(): number {
    const row = this.dbManager.getDb()
      .prepare('SELECT COALESCE(MAX(session_number), 0) + 1 AS next FROM sessions')
      .get() as { next: number };
    return row.next;
  }

  findById(id: string): Session | undefined {
    const row = this.dbManager.getDb().prepare(
      'SELECT * FROM sessions WHERE id = ?'
    ).get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findActive(): Session | undefined {
    const row = this.dbManager.getDb().prepare(
      "SELECT * FROM sessions WHERE state = 'recording' ORDER BY created_at DESC LIMIT 1"
    ).get() as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findAll(): Session[] {
    const rows = this.dbManager.getDb().prepare(
      'SELECT * FROM sessions ORDER BY created_at DESC'
    ).all() as SessionRow[];
    return rows.map(rowToSession);
  }

  delete(id: string): void {
    const db = this.dbManager.getDb();
    db.prepare('DELETE FROM transcript_segments WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM notes WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM merged_outputs WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }
}
