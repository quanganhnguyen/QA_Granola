import path from 'path';
import fs from 'fs';
import { PROFILE_CONFIGS, type QualityProfile } from './QualityProfile';

export class ModelRegistry {
  constructor(private readonly modelsDir: string) {}

  getModelPath(profile?: QualityProfile): string {
    if (profile) {
      return path.join(this.modelsDir, PROFILE_CONFIGS[profile].modelFilename);
    }
    // Default: return whichever model is available, preferring higher quality
    for (const p of ['max', 'balanced', 'fast'] as QualityProfile[]) {
      const candidate = path.join(this.modelsDir, PROFILE_CONFIGS[p].modelFilename);
      if (fs.existsSync(candidate)) return candidate;
    }
    return path.join(this.modelsDir, PROFILE_CONFIGS['fast'].modelFilename);
  }

  isAvailable(profile?: QualityProfile): boolean {
    return fs.existsSync(this.getModelPath(profile));
  }

  /** Returns the best available profile given installed models. */
  bestAvailableProfile(): QualityProfile {
    for (const p of ['max', 'balanced', 'fast'] as QualityProfile[]) {
      if (this.isAvailable(p)) return p;
    }
    return 'fast';
  }

  async verify(): Promise<void> {
    // At least one model must be present
    if (!this.isAvailable()) {
      const fastPath = this.getModelPath('fast');
      throw new Error(
        `No Whisper model found in ${this.modelsDir}. ` +
        `Expected at least ${path.basename(fastPath)}. ` +
        'Run: npm run download-model',
      );
    }
    const best = this.bestAvailableProfile();
    console.log(`[ModelRegistry] Best available profile: ${best} (${path.basename(this.getModelPath(best))})`);
  }
}
