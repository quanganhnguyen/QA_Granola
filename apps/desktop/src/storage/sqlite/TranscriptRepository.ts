import type { DatabaseManager } from './DatabaseManager';
import type { TranscriptSegment } from '../../domain/session';

interface SegmentRow {
  id: string;
  session_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  source: string;
  confidence: number;
  created_at: number;
}

function rowToSegment(row: SegmentRow): TranscriptSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    startMs: row.start_ms,
    endMs: row.end_ms,
    source: row.source as 'microphone' | 'system',
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

export class TranscriptRepository {
  constructor(private readonly dbManager: DatabaseManager) {}

  insert(segment: TranscriptSegment): void {
    this.dbManager.getDb().prepare(`
      INSERT INTO transcript_segments
        (id, session_id, text, start_ms, end_ms, source, confidence, created_at)
      VALUES
        (@id, @sessionId, @text, @startMs, @endMs, @source, @confidence, @createdAt)
    `).run({
      id: segment.id,
      sessionId: segment.sessionId,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      source: segment.source,
      confidence: segment.confidence,
      createdAt: segment.createdAt,
    });
  }

  findBySessionId(sessionId: string): TranscriptSegment[] {
    const rows = this.dbManager.getDb().prepare(
      'SELECT * FROM transcript_segments WHERE session_id = ? ORDER BY start_ms ASC'
    ).all(sessionId) as SegmentRow[];
    return rows.map(rowToSegment);
  }

  getFullText(sessionId: string): string {
    const segments = this.findBySessionId(sessionId);
    return segments.map(s => s.text).join(' ');
  }
}
