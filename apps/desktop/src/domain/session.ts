export type SessionState = 'idle' | 'recording' | 'stopped' | 'merging' | 'merged';

export interface Session {
  id: string;
  title: string;
  sessionNumber: number;
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  stoppedAt?: number;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  text: string;
  startMs: number;
  endMs: number;
  source: 'microphone' | 'system';
  confidence: number;
  createdAt: number;
}

export interface Notes {
  sessionId: string;
  content: string;
  updatedAt: number;
}

export interface MergedOutput {
  sessionId: string;
  content: string;
  rawTranscript: string;
  originalNotes: string;
  createdAt: number;
}
