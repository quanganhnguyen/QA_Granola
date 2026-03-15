import type { TranscriptionRouter } from '../transcription/TranscriptionRouter';
import { LocalWhisperEngine } from '../transcription/LocalWhisperEngine';
import { NodeWhisperBackend } from '../transcription/NodeWhisperBackend';
import { NativeAudioLoop } from './NativeAudioLoop';

export class AudioCaptureService {
  private capturing = false;
  private sessionId: string | null = null;
  private whisperEngine: LocalWhisperEngine;
  private audioLoop: NativeAudioLoop;

  constructor(router: TranscriptionRouter, whisperCwdPath?: string | null) {
    const backend = new NodeWhisperBackend(whisperCwdPath);
    this.whisperEngine = new LocalWhisperEngine(router, backend);
    this.audioLoop = new NativeAudioLoop(
      this.whisperEngine,
      () => this.captureChunk(),
    );
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }

  async start(sessionId: string): Promise<void> {
    if (this.capturing) return;
    this.capturing = true;
    this.chunkCount = 0;
    this.sessionId = sessionId;
    this.whisperEngine.startSession(sessionId);
    this.audioLoop.start();
    console.log('[QA Nola] Recording started, sessionId:', sessionId);
  }

  private chunkCount = 0;

  /** Receives audio chunks from the renderer (mic or system/display) and sends to Whisper. */
  feedChunk(buffer: Buffer, source: 'microphone' | 'system' = 'microphone'): void {
    if (!this.capturing || !this.sessionId || buffer.length === 0) return;
    this.chunkCount += 1;
    if (this.chunkCount <= 2 || this.chunkCount % 5 === 0) {
      console.log('[QA Nola] feedChunk #' + this.chunkCount + ', size ' + buffer.length + ', source ' + source);
    }
    this.whisperEngine.processChunk(buffer, source).catch((err) => {
      console.error('[QA Nola] processChunk error:', err);
    });
  }

  async stop(): Promise<void> {
    if (!this.capturing) return;
    this.capturing = false;
    this.sessionId = null;
    this.audioLoop.stop();
    this.whisperEngine.endSession();
  }

  protected async captureChunk(): Promise<Buffer | null> {
    // Overridden in platform-specific subclasses or test doubles.
    // Returns null in base class (no-op for testing).
    return null;
  }
}
