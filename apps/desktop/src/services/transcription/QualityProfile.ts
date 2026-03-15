/**
 * Offline quality profiles for local Whisper transcription.
 *
 * fast     – base.en, 3s chunks, minimal decoder work. Lowest latency.
 * balanced – small.en, 5s chunks, moderate decoder settings. Good default.
 * max      – medium.en, 8s chunks, best decoder settings. Highest accuracy.
 */
export type QualityProfile = 'fast' | 'balanced' | 'max';

export interface ProfileConfig {
  /** Model filename (ggml format) */
  modelFilename: string;
  /** Chunk duration in milliseconds sent to Whisper */
  chunkDurationMs: number;
  /** Overlap in milliseconds carried over from previous chunk for context */
  overlapMs: number;
  /** Beam size for Whisper decoder (higher = more accurate, slower) */
  beamSize: number;
  /** Best-of candidates for decoder */
  bestOf: number;
  /** Max segment length in tokens (0 = default) */
  maxLen: number;
  /** Language hint passed to Whisper */
  language: string;
}

export const PROFILE_CONFIGS: Record<QualityProfile, ProfileConfig> = {
  fast: {
    modelFilename: 'ggml-base.en.bin',
    chunkDurationMs: 5000,
    overlapMs: 0,
    beamSize: 1,
    bestOf: 1,
    maxLen: 0,
    language: 'en',
  },
  balanced: {
    modelFilename: 'ggml-small.en.bin',
    chunkDurationMs: 6000,
    overlapMs: 0,
    beamSize: 3,
    bestOf: 3,
    maxLen: 0,
    language: 'en',
  },
  max: {
    modelFilename: 'ggml-medium.en.bin',
    chunkDurationMs: 8000,
    overlapMs: 0,
    beamSize: 5,
    bestOf: 5,
    maxLen: 0,
    language: 'en',
  },
};

export const DEFAULT_PROFILE: QualityProfile = 'balanced';
