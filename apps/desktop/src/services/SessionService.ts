import { v4 as uuidv4 } from 'uuid';
import type { Session, TranscriptSegment } from '../domain/session';
import type { SessionRepository } from '../storage/sqlite/SessionRepository';
import type { TranscriptRepository } from '../storage/sqlite/TranscriptRepository';

export class SessionService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly transcriptRepo: TranscriptRepository,
  ) {}

  async createSession(): Promise<Session> {
    const now = Date.now();
    const sessionNumber = this.sessionRepo.nextSessionNumber();
    const session: Session = {
      id: uuidv4(),
      title: `Session ${sessionNumber}`,
      sessionNumber,
      state: 'recording',
      createdAt: now,
      updatedAt: now,
    };
    this.sessionRepo.insert(session);
    return session;
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    const session = this.sessionRepo.findById(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const trimmed = title.trim();
    if (!trimmed) throw new Error('Title cannot be empty');
    const updated: Session = {
      ...session,
      title: trimmed,
      updatedAt: Date.now(),
    };
    this.sessionRepo.update(updated);
    return updated;
  }

  async stopSession(sessionId: string): Promise<Session> {
    const session = this.sessionRepo.findById(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const now = Date.now();
    const updated: Session = { ...session, state: 'stopped', updatedAt: now, stoppedAt: now };
    this.sessionRepo.update(updated);
    return updated;
  }

  async resumeSession(sessionId: string): Promise<Session> {
    const session = this.sessionRepo.findById(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const now = Date.now();
    const updated: Session = { ...session, state: 'recording', updatedAt: now, stoppedAt: undefined };
    this.sessionRepo.update(updated);
    return updated;
  }

  async getActiveSession(): Promise<Session | undefined> {
    return this.sessionRepo.findActive();
  }

  async getSessionById(id: string): Promise<Session | undefined> {
    return this.sessionRepo.findById(id);
  }

  async getAllSessions(): Promise<Session[]> {
    return this.sessionRepo.findAll();
  }

  async appendTranscriptSegment(
    _sessionId: string,
    segment: TranscriptSegment,
  ): Promise<void> {
    this.transcriptRepo.insert(segment);
  }

  async getTranscriptSegments(sessionId: string): Promise<TranscriptSegment[]> {
    return this.transcriptRepo.findBySessionId(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessionRepo.findById(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.state === 'recording') throw new Error('Cannot delete a session that is currently recording');
    this.sessionRepo.delete(sessionId);
  }
}
