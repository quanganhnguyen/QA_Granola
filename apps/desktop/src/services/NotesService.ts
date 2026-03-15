import type { Notes } from '../domain/session';
import type { NotesRepository } from '../storage/sqlite/NotesRepository';

export class NotesService {
  constructor(private readonly notesRepo: NotesRepository) {}

  async saveNotes(sessionId: string, content: string): Promise<Notes> {
    const notes: Notes = {
      sessionId,
      content,
      updatedAt: Date.now(),
    };
    this.notesRepo.upsert(notes);
    return notes;
  }

  async getNotes(sessionId: string): Promise<Notes | undefined> {
    return this.notesRepo.findBySessionId(sessionId);
  }
}
