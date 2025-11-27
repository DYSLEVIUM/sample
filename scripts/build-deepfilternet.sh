#!/bin/bash
set -eux

# DeepFilterNet WASM Build Script
# Requires: wasm-pack, Rust toolchain with wasm32-unknown-unknown target

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TEMP_DIR="$ROOT_DIR/temp/cgbu-ecprt-denoise"
DEEPFILTER_DIR="$TEMP_DIR/deepfilternet"
OUTPUT_DIR="$ROOT_DIR/wasm_dist/deepfilternet"

echo "============================================="
echo "Building DeepFilterNet WASM"
echo "============================================="

# Check if temp directory exists
if [ ! -d "$TEMP_DIR" ]; then
  echo "Error: temp/cgbu-ecprt-denoise directory not found"
  echo "Please ensure the DeepFilterNet source is available"
  exit 1
fi

# Check for wasm-pack
if ! which wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack not found. Installing..."
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Check for Rust and wasm32 target
if ! which rustc >/dev/null 2>&1; then
  echo "Error: Rust not installed. Please install Rust first:"
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  exit 1
fi

# Add wasm32 target if not present
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Create output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Build DeepFilterNet WASM
echo "Building DeepFilterNet libDF..."
cd "$DEEPFILTER_DIR/libDF"

# Build with wasm-pack
wasm-pack build --target no-modules --features wasm

# Copy WASM files
echo "Copying WASM files..."
cp ./pkg/df.js "$OUTPUT_DIR/"
cp ./pkg/df_bg.wasm "$OUTPUT_DIR/"

# Copy model file
echo "Copying model file..."
if [ -f "$DEEPFILTER_DIR/models/DeepFilterNet3_onnx.tar.gz" ]; then
  cp "$DEEPFILTER_DIR/models/DeepFilterNet3_onnx.tar.gz" "$OUTPUT_DIR/"
else
  echo "Warning: DeepFilterNet3_onnx.tar.gz not found in models directory"
  echo "You may need to download it from the DeepFilterNet releases"
fi

# Also copy to sample/web for development
mkdir -p "$ROOT_DIR/sample/web/deepfilternet"
cp "$OUTPUT_DIR"/* "$ROOT_DIR/sample/web/deepfilternet/" 2>/dev/null || true

# Copy to dist if it exists
if [ -d "$ROOT_DIR/dist" ]; then
  mkdir -p "$ROOT_DIR/dist/deepfilternet"
  cp "$OUTPUT_DIR"/* "$ROOT_DIR/dist/deepfilternet/"
fi

cd "$ROOT_DIR"

echo "============================================="
echo "DeepFilterNet WASM build complete!"
echo "Output directory: $OUTPUT_DIR"
echo "============================================="
ls -la "$OUTPUT_DIR/"

