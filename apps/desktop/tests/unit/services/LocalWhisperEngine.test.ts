import { LocalWhisperEngine } from '../../../src/services/transcription/LocalWhisperEngine';
import { TranscriptionRouter } from '../../../src/services/transcription/TranscriptionRouter';
import type { TranscriptSegment } from '../../../src/domain/session';
import type { IWhisperBackend } from '../../../src/services/transcription/LocalWhisperEngine';

function makeRegistry() {
  return {
    isAvailable: () => true,
    getModelPath: () => '/fake/model.bin',
    bestAvailableProfile: () => 'balanced' as const,
    verify: async () => {},
  };
}

function makeBackend(results: Array<{ text: string; startMs: number; endMs: number; confidence: number }>): IWhisperBackend {
  return {
    transcribe: async () => results,
  };
}

describe('LocalWhisperEngine', () => {
  test('does not emit when no session is active', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const engine = new LocalWhisperEngine(router, makeBackend([{ text: 'hello', startMs: 0, endMs: 500, confidence: 0.9 }]));
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    await engine.processChunk(Buffer.from([]), 'microphone');
    expect(received).toHaveLength(0);
  });

  test('emits segment after startSession', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const engine = new LocalWhisperEngine(router, makeBackend([{ text: 'hello', startMs: 0, endMs: 500, confidence: 0.9 }]));
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    engine.startSession('sess-1');
    await engine.processChunk(Buffer.from([]), 'microphone');
    expect(received).toHaveLength(1);
    // cleanupText capitalizes the first letter of each segment
    expect(received[0].text).toBe('Hello');
    expect(received[0].sessionId).toBe('sess-1');
  });

  test('does not emit empty text segments', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const engine = new LocalWhisperEngine(router, makeBackend([{ text: '   ', startMs: 0, endMs: 500, confidence: 0.9 }]));
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    engine.startSession('sess-1');
    await engine.processChunk(Buffer.from([]), 'microphone');
    expect(received).toHaveLength(0);
  });

  test('accumulates offset across chunks', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const backend = makeBackend([{ text: 'word', startMs: 0, endMs: 1000, confidence: 0.9 }]);
    const engine = new LocalWhisperEngine(router, backend);
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    engine.startSession('sess-1');
    await engine.processChunk(Buffer.from([]), 'microphone');
    await engine.processChunk(Buffer.from([]), 'microphone');
    expect(received[1].startMs).toBe(1000);
  });

  test('endSession stops emitting segments', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const engine = new LocalWhisperEngine(router, makeBackend([{ text: 'hello', startMs: 0, endMs: 500, confidence: 0.9 }]));
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    engine.startSession('sess-1');
    engine.endSession();
    await engine.processChunk(Buffer.from([]), 'microphone');
    expect(received).toHaveLength(0);
  });

  test('marks source as system when processing system audio', async () => {
    const router = new TranscriptionRouter(makeRegistry());
    const engine = new LocalWhisperEngine(router, makeBackend([{ text: 'meeting audio', startMs: 0, endMs: 500, confidence: 0.9 }]));
    const received: TranscriptSegment[] = [];
    router.onSegment(s => received.push(s));
    engine.startSession('sess-1');
    await engine.processChunk(Buffer.from([]), 'system');
    expect(received[0].source).toBe('system');
  });
});
