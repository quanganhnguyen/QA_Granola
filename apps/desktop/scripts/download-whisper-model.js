#!/usr/bin/env node
/**
 * Downloads Whisper ggml models for local transcription.
 * Cross-platform (Node 18+); no bash/curl required.
 *
 * Usage:
 *   node scripts/download-whisper-model.js           # downloads all models
 *   node scripts/download-whisper-model.js fast       # base.en only
 *   node scripts/download-whisper-model.js balanced   # small.en only
 *   node scripts/download-whisper-model.js max        # medium.en only
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODELS = {
  fast: {
    file: 'ggml-base.en.bin',
    label: 'base.en (~142 MB)',
    sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
  },
  balanced: {
    file: 'ggml-small.en.bin',
    label: 'small.en (~466 MB)',
    sha256: null, // verified by download integrity only
  },
  max: {
    file: 'ggml-medium.en.bin',
    label: 'medium.en (~1.5 GB)',
    sha256: null,
  },
};

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function download(url, redirectsLeft = 10) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'QA-Nola-Desktop/1.0' },
    };
    const req = https.get(opts, (res) => {
      if ((res.statusCode === 302 || res.statusCode === 301) && redirectsLeft > 0) {
        const loc = res.headers.location;
        if (loc) {
          return download(
            loc.startsWith('http') ? loc : new URL(loc, url).href,
            redirectsLeft - 1,
          ).then(resolve).catch(reject);
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let done = 0;
      res.on('data', (chunk) => {
        chunks.push(chunk);
        done += chunk.length;
        if (total && done % (10 * 1024 * 1024) < chunk.length) {
          process.stdout.write(`\r  ${Math.round((100 * done) / total)}%  (${Math.round(done / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB)`);
        }
      });
      res.on('end', () => {
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        resolve(Buffer.concat(chunks));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function downloadModel(profile) {
  const model = MODELS[profile];
  if (!model) {
    console.error(`Unknown profile: ${profile}. Choose fast, balanced, or max.`);
    process.exit(1);
  }

  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
  const outPath = path.join(MODELS_DIR, model.file);

  if (fs.existsSync(outPath)) {
    console.log(`[${profile}] Already installed: models/${model.file}`);
    return;
  }

  const url = `${BASE_URL}/${model.file}`;
  console.log(`[${profile}] Downloading ${model.label} from Hugging Face...`);
  const buf = await download(url);
  fs.writeFileSync(outPath, buf);

  if (model.sha256) {
    console.log(`[${profile}] Verifying checksum...`);
    const actual = sha256File(outPath);
    if (actual !== model.sha256) {
      fs.unlinkSync(outPath);
      console.error(`[${profile}] ERROR: Checksum mismatch!`);
      console.error('  Expected:', model.sha256);
      console.error('  Got:     ', actual);
      process.exit(1);
    }
  }

  console.log(`[${profile}] Ready: models/${model.file}`);
}

async function main() {
  const arg = process.argv[2];
  const profiles = arg ? [arg] : ['fast', 'balanced', 'max'];

  for (const profile of profiles) {
    await downloadModel(profile);
  }

  console.log('\nAll requested models are ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
