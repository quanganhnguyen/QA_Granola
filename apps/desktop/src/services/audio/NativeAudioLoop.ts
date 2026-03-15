import type { LocalWhisperEngine } from '../transcription/LocalWhisperEngine';

export class NativeAudioLoop {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly engine: LocalWhisperEngine,
    private readonly captureChunk: () => Promise<Buffer | null>,
    private readonly intervalMs = 5000,
  ) {}

  start(): void {
    this.timer = setInterval(async () => {
      const chunk = await this.captureChunk();
      if (chunk && chunk.length > 0) {
        await this.engine.processChunk(chunk, 'microphone');
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
