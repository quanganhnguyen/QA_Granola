import { ModelRegistry } from '../../../src/services/transcription/ModelRegistry';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('ModelRegistry', () => {
  let modelsDir: string;

  beforeEach(() => {
    modelsDir = path.join(os.tmpdir(), `qa-nola-models-${Date.now()}`);
    fs.mkdirSync(modelsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(modelsDir, { recursive: true, force: true });
  });

  test('verify throws when no model file is present', async () => {
    const registry = new ModelRegistry(modelsDir);
    await expect(registry.verify()).rejects.toThrow(/no whisper model/i);
  });

  test('verify resolves when base model file exists', async () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    await expect(registry.verify()).resolves.not.toThrow();
  });

  test('getModelPath with fast profile returns base.en path', () => {
    const registry = new ModelRegistry(modelsDir);
    const p = registry.getModelPath('fast');
    expect(p).toContain('ggml-base.en.bin');
  });

  test('getModelPath with balanced profile returns small.en path', () => {
    const registry = new ModelRegistry(modelsDir);
    const p = registry.getModelPath('balanced');
    expect(p).toContain('ggml-small.en.bin');
  });

  test('getModelPath with max profile returns medium.en path', () => {
    const registry = new ModelRegistry(modelsDir);
    const p = registry.getModelPath('max');
    expect(p).toContain('ggml-medium.en.bin');
  });

  test('isAvailable returns false when no model files present', () => {
    const registry = new ModelRegistry(modelsDir);
    expect(registry.isAvailable()).toBe(false);
  });

  test('isAvailable returns true when base model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.isAvailable()).toBe(true);
  });

  test('isAvailable(fast) returns true when base model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.isAvailable('fast')).toBe(true);
  });

  test('isAvailable(balanced) returns false when only base model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.isAvailable('balanced')).toBe(false);
  });

  test('bestAvailableProfile returns fast when only base model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.bestAvailableProfile()).toBe('fast');
  });

  test('bestAvailableProfile returns balanced when small model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    fs.writeFileSync(path.join(modelsDir, 'ggml-small.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.bestAvailableProfile()).toBe('balanced');
  });

  test('bestAvailableProfile returns max when medium model exists', () => {
    fs.writeFileSync(path.join(modelsDir, 'ggml-base.en.bin'), 'fake');
    fs.writeFileSync(path.join(modelsDir, 'ggml-small.en.bin'), 'fake');
    fs.writeFileSync(path.join(modelsDir, 'ggml-medium.en.bin'), 'fake');
    const registry = new ModelRegistry(modelsDir);
    expect(registry.bestAvailableProfile()).toBe('max');
  });
});
