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

describe('AudioCaptureService', () => {
  test('isCapturing returns false initially', () => {
    const service = new AudioCaptureService(makeRouter());
    expect(service.isCapturing()).toBe(false);
  });

  test('start sets isCapturing to true', async () => {
    const service = new AudioCaptureService(makeRouter());
    await service.start('session-1');
    expect(service.isCapturing()).toBe(true);
    await service.stop();
  });

  test('stop sets isCapturing to false', async () => {
    const service = new AudioCaptureService(makeRouter());
    await service.start('session-1');
    await service.stop();
    expect(service.isCapturing()).toBe(false);
  });

  test('start is idempotent when already capturing', async () => {
    const service = new AudioCaptureService(makeRouter());
    await service.start('session-1');
    await service.start('session-1');
    expect(service.isCapturing()).toBe(true);
    await service.stop();
  });

  test('stop is safe when not capturing', async () => {
    const service = new AudioCaptureService(makeRouter());
    await expect(service.stop()).resolves.not.toThrow();
  });

  test('getCurrentSessionId returns session id after start', async () => {
    const service = new AudioCaptureService(makeRouter());
    await service.start('session-abc');
    expect(service.getCurrentSessionId()).toBe('session-abc');
    await service.stop();
  });

  test('getCurrentSessionId returns null when not capturing', () => {
    const service = new AudioCaptureService(makeRouter());
    expect(service.getCurrentSessionId()).toBeNull();
  });
});
