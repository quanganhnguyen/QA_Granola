import { useEffect, useRef, useState } from 'react';
import type { QualityProfile } from '../services/transcription/QualityProfile';
import { PROFILE_CONFIGS, DEFAULT_PROFILE } from '../services/transcription/QualityProfile';
import { processSamplesVAD, samplesForMs, getWorkletUrl, makeVADState } from './audioCapture';

const SAMPLE_RATE = 16000;

/**
 * When isRecording and includeSystemAudio are both true, captures system audio
 * via BlackHole virtual audio device (no screen recording needed).
 *
 * Flow:
 * 1. Calls main process to set up BlackHole aggregate device (speakers + BlackHole)
 * 2. Enumerates audio devices to find BlackHole 2ch
 * 3. Opens getUserMedia on that device — captures all system audio as a loopback
 * 4. Sends PCM chunks to main with source 'system'
 */
export function useSystemAudioCapture(
  isRecording: boolean,
  includeSystemAudio: boolean,
  qualityProfile?: QualityProfile,
): { systemAudioError: string | null } {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const vadStateRef = useRef(makeVADState());
  const [systemAudioError, setSystemAudioError] = useState<string | null>(null);

  useEffect(() => {
    console.log(`[useSystemAudioCapture] Effect fired: isRecording=${isRecording}, includeSystemAudio=${includeSystemAudio}`);
    if (!isRecording || !includeSystemAudio) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
      const s = vadStateRef.current;
      s.bufferRef.current = new Int16Array(0);
      s.bufferLengthRef.current = 0;
      s.hadSpeechRef.current = false;
      s.silentFramesRef.current = 0;
      setSystemAudioError(null);
      return;
    }

    const profile = qualityProfile ?? DEFAULT_PROFILE;
    const config = PROFILE_CONFIGS[profile];
    const targetSamples = samplesForMs(config.chunkDurationMs);

    let cancelled = false;

    const log = (msg: string) => {
      console.log(msg);
      (window.qaNola as { logToMain?: (m: string) => void })?.logToMain?.(msg);
    };

    const startCapture = async () => {
      try {
        if (!window.qaNola?.systemAudio) {
          setSystemAudioError('System audio API not available');
          log('[useSystemAudioCapture] FAIL: System audio API not available on window.qaNola');
          return;
        }

        log('[useSystemAudioCapture] Setting up BlackHole loopback...');
        const setup = await window.qaNola.systemAudio.setup();
        if (cancelled) return;

        if (!setup.available) {
          const msg = setup.error || 'BlackHole not available';
          log(`[useSystemAudioCapture] FAIL: ${msg}`);
          setSystemAudioError(msg);
          return;
        }

        log('[useSystemAudioCapture] BlackHole setup OK, finding device...');

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;

        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        log(`[useSystemAudioCapture] Found ${audioInputs.length} audio inputs: ${audioInputs.map(d => d.label || '(no label)').join(', ')}`);

        const blackhole = devices.find(
          (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes('blackhole'),
        );

        if (!blackhole) {
          setSystemAudioError('BlackHole audio device not found. You may need to reboot after installing.');
          log('[useSystemAudioCapture] FAIL: BlackHole not in enumerateDevices');
          return;
        }

        log(`[useSystemAudioCapture] Found BlackHole: "${blackhole.label}" id=${blackhole.deviceId}`);

        // Step 3: Open getUserMedia on the BlackHole device
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: blackhole.deviceId },
            channelCount: 1,
            sampleRate: SAMPLE_RATE,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setSystemAudioError(null);

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
            'system',
          );
        };

        const SYSTEM_AUDIO_GAIN = 10.0;
        const gainNode = context.createGain();
        gainNode.gain.value = SYSTEM_AUDIO_GAIN;
        console.log(`[useSystemAudioCapture] Applying ${SYSTEM_AUDIO_GAIN}x gain to system audio`);

        let pair: { source: AudioNode; node: AudioNode } | null = null;
        const workletUrl = await getWorkletUrl();
        if (cancelled) return;
        try {
          await context.audioWorklet.addModule(workletUrl);
          if (cancelled) return;
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
          console.warn('[useSystemAudioCapture] AudioWorklet failed, using ScriptProcessor fallback');
          const source = context.createMediaStreamSource(stream);
          const scriptNode = context.createScriptProcessor(4096, 1, 1);
          scriptNode.onaudioprocess = (e) => onSamples(e.inputBuffer.getChannelData(0));
          pair = { source, node: scriptNode };
        }

        if (cancelled || !pair) return;
        pair.source.connect(gainNode);
        gainNode.connect(pair.node);
        pair.node.connect(context.createMediaStreamDestination());
        log(`[useSystemAudioCapture] System audio capture STARTED via BlackHole (gain=${SYSTEM_AUDIO_GAIN}x)`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[useSystemAudioCapture] EXCEPTION: ${errMsg}`);
        setSystemAudioError(errMsg);
      }
    };

    startCapture();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, [isRecording, includeSystemAudio, qualityProfile]);

  return { systemAudioError };
}
