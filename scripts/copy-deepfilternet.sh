#!/bin/bash
set -eux

# Copy pre-built DeepFilterNet WASM files
# Use this if you have pre-built files in temp/cgbu-ecprt-denoise/js/src/deepfilternet/wasm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE_DIR="$ROOT_DIR/temp/cgbu-ecprt-denoise/js/src/deepfilternet/wasm"
OUTPUT_DIR="$ROOT_DIR/wasm_dist/deepfilternet"

echo "============================================="
echo "Copying DeepFilterNet WASM files"
echo "============================================="

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Pre-built files not found at $SOURCE_DIR"
  echo "Run build-deepfilternet.sh to build from source"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Copy WASM files
echo "Copying from $SOURCE_DIR..."
cp "$SOURCE_DIR/df.js" "$OUTPUT_DIR/"
cp "$SOURCE_DIR/df_bg.wasm" "$OUTPUT_DIR/"
cp "$SOURCE_DIR/DeepFilterNet3_onnx.tar.gz" "$OUTPUT_DIR/"

# Also copy to sample/web for development
mkdir -p "$ROOT_DIR/sample/web/deepfilternet"
cp "$OUTPUT_DIR"/* "$ROOT_DIR/sample/web/deepfilternet/" 2>/dev/null || true

# Copy to dist if it exists
if [ -d "$ROOT_DIR/dist" ]; then
  mkdir -p "$ROOT_DIR/dist/deepfilternet"
  cp "$OUTPUT_DIR"/* "$ROOT_DIR/dist/deepfilternet/"
fi

echo "============================================="
echo "DeepFilterNet files copied!"
echo "Output directory: $OUTPUT_DIR"
echo "============================================="
ls -la "$OUTPUT_DIR/"

