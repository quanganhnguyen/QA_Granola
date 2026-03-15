import { AudioCaptureService } from '../../../src/services/audio/AudioCaptureService';
import type { TranscriptionRouter } from '../../../src/services/transcription/TranscriptionRouter';

function makeRouter(): TranscriptionRouter {
  return {
    preferLocal: () => true,
    onSegment: jest.fn(),
    removeSegmentListener: jest.fn(),
    emitSegment: jest.fn(),
    getModelPath: () => '/fake/model.bin',
    getQualityProfile: () => 'balanced' as const,
    getProfileConfig: () => ({
      modelFilename: 'ggml-small.en.bin',
      chunkDurationMs: 5000,
      overlapMs: 750,
      beamSize: 3,
      bestOf: 3,
      maxLen: 0,
      language: 'en',
    }),
  } as unknown as TranscriptionRouter;
}

class TestableAudioCaptureService extends AudioCaptureService {
  public chunks: Buffer[] = [];

  protected override async captureChunk(): Promise<Buffer | null> {
    return this.chunks.shift() ?? null;
  }
}

describe('AudioCaptureService advanced', () => {
  test('captureChunk returns null in base class', async () => {
    const service = new AudioCaptureService(makeRouter());
    // Access protected method via casting for test
    const chunk = await (service as unknown as { captureChunk(): Promise<Buffer | null> }).captureChunk();
    expect(chunk).toBeNull();
  });

  test('subclass can override captureChunk to return audio data', async () => {
    const service = new TestableAudioCaptureService(makeRouter());
    service.chunks.push(Buffer.from([1, 2, 3]));
    const chunk = await (service as unknown as { captureChunk(): Promise<Buffer | null> }).captureChunk();
    expect(chunk).not.toBeNull();
    expect(chunk?.length).toBe(3);
  });

  test('start with different session ids creates separate sessions', async () => {
    const service = new AudioCaptureService(makeRouter());
    await service.start('session-a');
    expect(service.getCurrentSessionId()).toBe('session-a');
    await service.stop();
    await service.start('session-b');
    expect(service.getCurrentSessionId()).toBe('session-b');
    await service.stop();
  });
});
