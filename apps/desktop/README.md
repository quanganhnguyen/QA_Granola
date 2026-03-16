# QA Nola Desktop

Local-first meeting transcription and notes app. Records mic + system audio, transcribes locally with Whisper, and merges your notes with the transcript using Claude.

## Prerequisites

- Node.js >= 20
- npm >= 10
- `ANTHROPIC_API_KEY` environment variable (for merge feature)

## Setup

```bash
cd apps/desktop
npm install

# Download Whisper models from Hugging Face (one-time; cross-platform Node script)
npm run download-model          # all: fast (base.en), balanced (small.en), max (medium.en)
npm run download-model:fast     # base.en only (~142 MB)
npm run download-model:balanced # small.en only (~466 MB)
npm run download-model:max      # medium.en only (~1.5 GB)
```

## Development

```bash
npm run dev
```

## Testing

```bash
# All unit + integration tests with coverage
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests (requires built app)
npm run build && npm run test:e2e

# Full quality gate (lint + typecheck + tests + coverage + model check)
npx ts-node scripts/quality-gate.ts
```

## Build Installers

```bash
# One command: download model (if missing) then build — produces a single installer that works offline
npm run dist:mac:full   # macOS (.dmg + zip)
npm run dist:win:full   # Windows (.exe)
npm run dist:full       # Both platforms

# Build only (requires model already present from a previous npm run download-model)
npm run dist:mac
npm run dist:win
npm run dist
```

**One-package for users:** Use `dist:mac:full` or `dist:win:full` when creating releases. The script downloads the Whisper model (~142 MB) if needed, then builds the installer. The resulting file in `release/` is a single download for end users — no separate model download or setup. The app is fully self-contained: Whisper engine, model, and dependencies are inside the app; no runtime downloads required for transcription.

## Auto-updates

The app checks for updates on launch (production builds only). To enable updates:

1. **Set your update server URL** in `package.json` under `build.publish.url`, or set the `QA_NOLA_UPDATE_URL` environment variable when building/running.
2. **Publish each release**: upload the contents of `release/` to that URL (e.g. the DMG, zip, and the `latest-mac.yml` / `latest.yml` files that electron-builder generates). The app will compare its version to the server and notify the user when an update is available.
3. **Bump the version** in `package.json` for each release so the updater can detect newer builds.

## Quality Gates (must all pass before release)

| Gate | Threshold |
|------|-----------|
| Unit tests | 0 failures |
| Integration tests | 0 failures |
| E2E critical flows | 5/5 pass |
| Line coverage | ≥ 90% |
| Branch coverage | ≥ 85% |
| TypeScript | 0 errors |
| ESLint | 0 warnings |
| Whisper model | present |

## Architecture

```
electron/          Electron main process + IPC handlers
src/
  app/             React entry + global hook
  components/      UI components
  domain/          TypeScript domain types
  services/        Business logic (SessionService, NotesService, etc.)
    audio/         Audio capture adapters
    transcription/ Whisper engine + routing
    merge/         Claude merge service
  storage/sqlite/  SQLite repositories
tests/
  unit/            Unit tests (TDD)
  integration/     Integration tests (real SQLite)
  e2e/             Playwright E2E tests
scripts/           Build + quality gate scripts
models/            Bundled Whisper model (not committed to git)
```
