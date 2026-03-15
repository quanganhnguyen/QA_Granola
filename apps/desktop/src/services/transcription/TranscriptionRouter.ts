import type { TranscriptSegment } from '../../domain/session';
import { type QualityProfile, DEFAULT_PROFILE, PROFILE_CONFIGS } from './QualityProfile';

type SegmentCallback = (segment: TranscriptSegment) => void;

export interface IModelRegistry {
  isAvailable(profile?: QualityProfile): boolean;
  getModelPath(profile?: QualityProfile): string;
  bestAvailableProfile(): QualityProfile;
  verify(): Promise<void>;
}

export class TranscriptionRouter {
  private callbacks: SegmentCallback[] = [];
  private qualityProfile: QualityProfile = DEFAULT_PROFILE;

  constructor(private readonly modelRegistry: IModelRegistry) {
    // Auto-select best available profile on construction
    this.qualityProfile = modelRegistry.bestAvailableProfile();
    console.log(`[TranscriptionRouter] Quality profile: ${this.qualityProfile}`);
  }

  setQualityProfile(profile: QualityProfile): void {
    if (!this.modelRegistry.isAvailable(profile)) {
      console.warn(`[TranscriptionRouter] Model for profile "${profile}" not found, keeping "${this.qualityProfile}"`);
      return;
    }
    this.qualityProfile = profile;
    console.log(`[TranscriptionRouter] Quality profile changed to: ${profile}`);
  }

  getQualityProfile(): QualityProfile {
    return this.qualityProfile;
  }

  getProfileConfig() {
    return PROFILE_CONFIGS[this.qualityProfile];
  }

  preferLocal(): boolean {
    return this.modelRegistry.isAvailable(this.qualityProfile);
  }

  onSegment(callback: SegmentCallback): void {
    this.callbacks.push(callback);
  }

  removeSegmentListener(callback: SegmentCallback): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  emitSegment(segment: TranscriptSegment): void {
    for (const cb of this.callbacks) {
      cb(segment);
    }
  }

  getModelPath(): string {
    return this.modelRegistry.getModelPath(this.qualityProfile);
  }
}
