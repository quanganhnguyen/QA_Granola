import type { MergedOutput } from '../../domain/session';
import type { MergedOutputRepository } from '../../storage/sqlite/MergedOutputRepository';
import type { TranscriptRepository } from '../../storage/sqlite/TranscriptRepository';
import type { NotesRepository } from '../../storage/sqlite/NotesRepository';
import { DefaultClaudeClient } from './DefaultClaudeClient';

export interface IClaudeClient {
  complete(prompt: string): Promise<string>;
}

function buildSummaryPrompt(notes: string, transcript: string): string {
  const hasNotes = notes.trim().length > 0;
  return `You are an expert meeting assistant. Generate a clear, structured AI summary of the following session.

## Transcript
${transcript}
${hasNotes ? `\n## User's Notes\n${notes}\n` : ''}
## Instructions
Produce a concise, well-structured summary in clean Markdown with these sections:

### Summary
2-4 sentence overview of what was discussed.

### Key Points
Bullet list of the most important facts, ideas, or decisions.

### Action Items
Bullet list of any tasks, follow-ups, or next steps mentioned. If none, write "None identified."
${hasNotes ? '\n### Notes\nIncorporate any relevant context from the user\'s notes above.\n' : ''}
Be concise. Do not pad or repeat yourself. Output only the Markdown.`;
}

export class ClaudeMergeService {
  constructor(
    private readonly mergedRepo: MergedOutputRepository,
    private readonly transcriptRepo: TranscriptRepository,
    private readonly notesRepo: NotesRepository,
    private readonly claudeClient: IClaudeClient = new DefaultClaudeClient(),
  ) {}

  async merge(sessionId: string): Promise<MergedOutput> {
    const rawTranscript = this.transcriptRepo.getFullText(sessionId);
    if (!rawTranscript.trim()) {
      throw new Error(`No transcript found for session ${sessionId}`);
    }

    const notes = this.notesRepo.findBySessionId(sessionId);
    const originalNotes = notes?.content ?? '';

    const prompt = buildSummaryPrompt(originalNotes, rawTranscript);
    const mergedContent = await this.claudeClient.complete(prompt);

    const output: MergedOutput = {
      sessionId,
      content: mergedContent,
      rawTranscript,
      originalNotes,
      createdAt: Date.now(),
    };

    this.mergedRepo.upsert(output);
    return output;
  }

  async getMergedOutput(sessionId: string): Promise<MergedOutput | undefined> {
    return this.mergedRepo.findBySessionId(sessionId);
  }
}
