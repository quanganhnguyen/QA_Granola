import { TranscriptionRouter } from '../../../src/services/transcription/TranscriptionRouter';
import type { TranscriptSegment } from '../../../src/domain/session';

function makeRegistry(available: boolean) {
  return {
    isAvailable: () => available,
    getModelPath: () => '/fake/model.bin',
    bestAvailableProfile: () => 'balanced' as const,
    verify: async () => { if (!available) throw new Error('model not found'); },
  };
}

describe('TranscriptionRouter', () => {
  test('onSegment registers a callback', () => {
    const router = new TranscriptionRouter(makeRegistry(true));
    const segments: TranscriptSegment[] = [];
    router.onSegment((s) => segments.push(s));
    expect(segments).toHaveLength(0);
  });

  test('emitSegment calls all registered callbacks', () => {
    const router = new TranscriptionRouter(makeRegistry(true));
    const received: TranscriptSegment[] = [];
    router.onSegment((s) => received.push(s));
    const seg: TranscriptSegment = {
      id: 'seg-1',
      sessionId: 'sess-1',
      text: 'test',
      startMs: 0,
      endMs: 500,
      source: 'microphone',
      confidence: 0.9,
      createdAt: Date.now(),
    };
    router.emitSegment(seg);
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('test');
  });

  test('emitSegment calls multiple registered callbacks', () => {
    const router = new TranscriptionRouter(makeRegistry(true));
    let count = 0;
    router.onSegment(() => count++);
    router.onSegment(() => count++);
    router.emitSegment({
      id: 'seg-1', sessionId: 's', text: 'hi',
      startMs: 0, endMs: 100, source: 'microphone', confidence: 1, createdAt: 0,
    });
    expect(count).toBe(2);
  });

  test('preferLocal returns true when model is available', () => {
    const router = new TranscriptionRouter(makeRegistry(true));
    expect(router.preferLocal()).toBe(true);
  });

  test('preferLocal returns false when model is not available', () => {
    const router = new TranscriptionRouter(makeRegistry(false));
    expect(router.preferLocal()).toBe(false);
  });

  test('removeSegmentListener removes a specific callback', () => {
    const router = new TranscriptionRouter(makeRegistry(true));
    const received: TranscriptSegment[] = [];
    const handler = (s: TranscriptSegment) => received.push(s);
    router.onSegment(handler);
    router.removeSegmentListener(handler);
    router.emitSegment({
      id: 's1', sessionId: 's', text: 'hi',
      startMs: 0, endMs: 100, source: 'microphone', confidence: 1, createdAt: 0,
    });
    expect(received).toHaveLength(0);
  });
});
