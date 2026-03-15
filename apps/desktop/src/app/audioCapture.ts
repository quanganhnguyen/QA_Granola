/**
 * Shared audio capture utilities for mic and system audio hooks.
 *
 * VAD-like chunking strategy:
 *  - Accumulate samples until the target chunk duration is reached (profile-driven).
 *  - Additionally, detect speech boundaries using RMS energy:
 *    if a period of silence follows a period of speech, flush early at a
 *    natural boundary to avoid cutting mid-word.
 *  - Minimum chunk size guard prevents sending tiny chunks.
 */

import type React from 'react';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // Int16

/** Convert Float32 PCM to Int16 PCM */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/** Compute RMS energy of a Float32 frame */
function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export interface VADState {
  bufferRef: React.MutableRefObject<Int16Array>;
  bufferLengthRef: React.MutableRefObject<number>;
  /** Number of consecutive silent frames seen after speech */
  silentFramesRef: React.MutableRefObject<number>;
  /** Whether we have seen speech in the current chunk */
  hadSpeechRef: React.MutableRefObject<boolean>;
}

export function makeVADState(): VADState {
  return {
    bufferRef: { current: new Int16Array(0) },
    bufferLengthRef: { current: 0 },
    silentFramesRef: { current: 0 },
    hadSpeechRef: { current: false },
  };
}

const SPEECH_THRESHOLD_MIC = 0.003;    // RMS above this = speech for microphone
const SPEECH_THRESHOLD_SYSTEM = 0.0005; // Much lower for system audio loopback (signal is quieter even after gain)
const SILENCE_FRAMES_TO_FLUSH = 60; // ~60 * 128 samples = ~480ms of silence before early flush
const MIN_CHUNK_SAMPLES = Math.floor(SAMPLE_RATE * 3.0); // 3s minimum — Whisper needs enough audio

/**
 * Process incoming Float32 samples using VAD-like chunking.
 * Flushes a chunk when:
 *   (a) buffer reaches targetSamples, OR
 *   (b) speech was detected and then silence follows for SILENCE_FRAMES_TO_FLUSH frames
 *       AND buffer is at least MIN_CHUNK_SAMPLES long.
 */
export function processSamplesVAD(
  samples: Float32Array,
  state: VADState,
  targetSamples: number,
  sendChunk: (buffer: ArrayBuffer, source: 'microphone' | 'system') => void,
  source: 'microphone' | 'system',
): void {
  const newSamples = float32ToInt16(samples);
  const energy = rms(samples);

  // System audio: skip VAD entirely — always send chunks on the size timer.
  // The gain boost handles making the signal audible to Whisper.
  if (source !== 'system') {
    const threshold = SPEECH_THRESHOLD_MIC;
    if (energy > threshold) {
      state.hadSpeechRef.current = true;
      state.silentFramesRef.current = 0;
    } else {
      if (state.hadSpeechRef.current) {
        state.silentFramesRef.current += 1;
      }
    }
  } else {
    state.hadSpeechRef.current = true;
    state.silentFramesRef.current = 0;
  }

  // Append to buffer
  const currentLen = state.bufferLengthRef.current;
  const merged = new Int16Array(currentLen + newSamples.length);
  if (currentLen > 0) merged.set(state.bufferRef.current.subarray(0, currentLen));
  merged.set(newSamples, currentLen);
  state.bufferRef.current = merged;
  state.bufferLengthRef.current = currentLen + newSamples.length;

  const shouldFlushOnSilence =
    source !== 'system' &&
    state.hadSpeechRef.current &&
    state.silentFramesRef.current >= SILENCE_FRAMES_TO_FLUSH &&
    state.bufferLengthRef.current >= MIN_CHUNK_SAMPLES;

  const shouldFlushOnSize = state.bufferLengthRef.current >= targetSamples;

  if (shouldFlushOnSize || shouldFlushOnSilence) {
    const toSend = state.bufferRef.current.subarray(0, state.bufferLengthRef.current);
    const rawBuffer = toSend.buffer as ArrayBuffer;
    sendChunk(rawBuffer.slice(toSend.byteOffset, toSend.byteOffset + toSend.byteLength), source);

    // Reset state
    state.bufferRef.current = new Int16Array(0);
    state.bufferLengthRef.current = 0;
    state.hadSpeechRef.current = false;
    state.silentFramesRef.current = 0;
  }
}

export function samplesForMs(ms: number): number {
  return Math.floor((SAMPLE_RATE * ms) / 1000);
}

export function bytesForMs(ms: number): number {
  return samplesForMs(ms) * BYTES_PER_SAMPLE;
}

/** Returns the URL for the PCM capture worklet. Uses IPC when in Electron (dev and prod) so main can return the correct URL. */
export async function getWorkletUrl(): Promise<string> {
  if (typeof window !== 'undefined' && window.qaNola?.getWorkletUrl) {
    return window.qaNola.getWorkletUrl();
  }
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    return `${window.location.origin}/pcm-capture-worklet.js`;
  }
  return new URL('../pcm-capture-worklet.js', import.meta.url).href;
}
