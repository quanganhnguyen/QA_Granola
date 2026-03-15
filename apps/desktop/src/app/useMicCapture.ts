import { useEffect, useRef } from 'react';
import type { QualityProfile } from '../services/transcription/QualityProfile';
import { PROFILE_CONFIGS, DEFAULT_PROFILE } from '../services/transcription/QualityProfile';
import { processSamplesVAD, samplesForMs, getWorkletUrl, makeVADState } from './audioCapture';

const SAMPLE_RATE = 16000;

/**
 * When isRecording is true, captures microphone and sends PCM chunks to main process
 * for transcription. Uses VAD-like chunking with profile-driven chunk sizes.
 * Tries AudioWorklet first; falls back to ScriptProcessorNode if the worklet fails.
 */
export function useMicCapture(isRecording: boolean, qualityProfile?: QualityProfile): void {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const vadStateRef = useRef(makeVADState());

  useEffect(() => {
    if (!isRecording) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
      const s = vadStateRef.current;
      s.bufferRef.current = new Int16Array(0);
      s.bufferLengthRef.current = 0;
      s.hadSpeechRef.current = false;
      s.silentFramesRef.current = 0;
      return;
    }

    const profile = qualityProfile ?? DEFAULT_PROFILE;
    const config = PROFILE_CONFIGS[profile];
    const targetSamples = samplesForMs(config.chunkDurationMs);

    let cancelled = false;
    const isCancelled = () => cancelled;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: SAMPLE_RATE,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const context = new AudioContext({ sampleRate: SAMPLE_RATE });
        if (cancelled) { context.close(); return; }
        contextRef.current = context;

        const vadState = vadStateRef.current;
        const onSamples = (samples: Float32Array) => {
          if (!window.qaNola?.audio?.sendChunk) return;
          processSamplesVAD(
            samples,
            vadState,
            targetSamples,
            (buf, src) => window.qaNola.audio.sendChunk(buf, src),
            'microphone',
          );
        };

        let pair: { source: AudioNode; node: AudioNode } | null = null;

        const workletUrl = await getWorkletUrl();
        try {
          await context.audioWorklet.addModule(workletUrl);
          if (isCancelled()) return;
          const source = context.createMediaStreamSource(stream);
          const workletNode = new AudioWorkletNode(context, 'pcm-capture-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
          });
          workletNode.port.onmessage = (event: MessageEvent<{ samples: Float32Array }>) => {
            const { samples } = event.data;
            if (samples?.length) onSamples(samples);
          };
          pair = { source, node: workletNode };
        } catch {
          console.warn('[useMicCapture] AudioWorklet failed, using ScriptProcessor fallback');
          const source = context.createMediaStreamSource(stream);
          const scriptNode = context.createScriptProcessor(4096, 1, 1);
          scriptNode.onaudioprocess = (e) => onSamples(e.inputBuffer.getChannelData(0));
          pair = { source, node: scriptNode };
        }

        if (cancelled) return;
        pair.source.connect(pair.node);
        pair.node.connect(context.createMediaStreamDestination());
      } catch (err) {
        console.error('[useMicCapture] Capture failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, [isRecording, qualityProfile]);
}
