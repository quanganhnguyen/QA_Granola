#!/usr/bin/env bash
# Downloads the bundled Whisper base.en model for local transcription.
# Run this once before building the installer: npm run download-model
set -euo pipefail

MODELS_DIR="$(dirname "$0")/../models"
MODEL_FILE="ggml-base.en.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
# Updated when Hugging Face updates the file (run: shasum -a 256 models/ggml-base.en.bin)
EXPECTED_SHA256="a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"

mkdir -p "$MODELS_DIR"

if [ -f "$MODELS_DIR/$MODEL_FILE" ]; then
  echo "Model already present at models/$MODEL_FILE"
  exit 0
fi

echo "Downloading Whisper base.en model (~142 MB)..."
curl -L --progress-bar -o "$MODELS_DIR/$MODEL_FILE" "$MODEL_URL"

echo "Verifying checksum..."
if command -v sha256sum &>/dev/null; then
  ACTUAL=$(sha256sum "$MODELS_DIR/$MODEL_FILE" | awk '{print $1}')
elif command -v shasum &>/dev/null; then
  ACTUAL=$(shasum -a 256 "$MODELS_DIR/$MODEL_FILE" | awk '{print $1}')
else
  echo "Warning: no sha256 tool found, skipping checksum verification"
  echo "Model downloaded to models/$MODEL_FILE"
  exit 0
fi

if [ "$ACTUAL" != "$EXPECTED_SHA256" ]; then
  echo "ERROR: Checksum mismatch!"
  echo "  Expected: $EXPECTED_SHA256"
  echo "  Got:      $ACTUAL"
  rm "$MODELS_DIR/$MODEL_FILE"
  exit 1
fi

echo "Model verified and ready at models/$MODEL_FILE"
