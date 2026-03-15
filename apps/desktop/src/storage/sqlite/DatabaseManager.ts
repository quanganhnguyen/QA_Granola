import Database from 'better-sqlite3';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  getDb(): Database.Database {
    return this.db;
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        stopped_at INTEGER,
        session_number INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transcript_segments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'microphone',
        confidence REAL NOT NULL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_transcript_session
        ON transcript_segments(session_id, start_ms);
    `);

    // Additive migrations — safe to run on existing databases
    const cols = this.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!cols.some(c => c.name === 'session_number')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN session_number INTEGER NOT NULL DEFAULT 0');
    }

    this.db.exec(`

      CREATE TABLE IF NOT EXISTS notes (
        session_id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS merged_outputs (
        session_id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        raw_transcript TEXT NOT NULL,
        original_notes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  close(): void {
    this.db.close();
  }
}
