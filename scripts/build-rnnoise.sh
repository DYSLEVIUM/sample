#!/bin/bash
set -eux

# Use xiph/rnnoise main with increased memory and debugging
RNNOISE_REPOSITORY=https://github.com/xiph/rnnoise
RNNOISE_VERSION="main"

# Use -O3 for maximum performance
# Note: -ffast-math is NOT compatible with RNNoise (requires FLOAT_APPROX)
OPTIMIZE="-O3"

# Export rnnoise_get_frame_size for proper frame size detection
RNN_EXPORTED_FUNCTIONS="['_rnnoise_process_frame', '_rnnoise_destroy', '_rnnoise_create', '_rnnoise_get_frame_size', '_malloc', '_free']"

if ! which emcc >/dev/null; then
  echo "Please install emscripten"
  exit 1
fi

unset BUILD_DIR
trap '[[ "$BUILD_DIR" ]] && rm -rf $BUILD_DIR' 1 2 3 15
BUILD_DIR=$(mktemp -d)
mkdir -p $BUILD_DIR

ROOT_DIR=$PWD

WASM_BUILD_DIR=wasm_dist
mkdir -p $WASM_BUILD_DIR

function build_rnnoise() {
  local EXTRA_CFLAGS="$1"
  local CONFIGURE_FLAGS="$2"
  local NAME="$3"

  mkdir -p $BUILD_DIR/$NAME
  cd $BUILD_DIR/$NAME

  git clone $RNNOISE_REPOSITORY rnnoise
  cd rnnoise/
  git checkout $RNNOISE_VERSION

  echo "Building $NAME from commit $RNNOISE_VERSION"

  ./autogen.sh

  # Configure with emscripten - enable all optimizations
  emconfigure ./configure \
    CFLAGS="${OPTIMIZE} ${EXTRA_CFLAGS} -DNDEBUG" \
    --enable-shared=no \
    --disable-examples \
    --disable-doc \
    $CONFIGURE_FLAGS

  # Build the library
  emmake make V=1

  # Link into WASM module with increased memory settings for better performance
  # INITIAL_MEMORY: 128MB for plenty of working space
  # MAXIMUM_MEMORY: 1GB to allow growth if needed
  # STACK_SIZE: 2MB for deep recursion in neural network
  emcc \
    ${OPTIMIZE} \
    ${EXTRA_CFLAGS} \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=134217728 \
    -s MAXIMUM_MEMORY=1073741824 \
    -s STACK_SIZE=2097152 \
    -s MALLOC=dlmalloc \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s INCOMING_MODULE_JS_API="['locateFile']" \
    -s ENVIRONMENT='web,worker' \
    -s EXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
    -s EXPORTED_FUNCTIONS="${RNN_EXPORTED_FUNCTIONS}" \
    -s NO_FILESYSTEM=1 \
    -s ASSERTIONS=0 \
    -s DISABLE_EXCEPTION_CATCHING=1 \
    -s SUPPORT_LONGJMP=0 \
    -s SINGLE_FILE=0 \
    .libs/librnnoise.a \
    --emit-tsd $NAME.d.ts \
    -o $NAME.js

  echo "Done building $NAME"

  cd $ROOT_DIR
}

# Create output directories
mkdir -p $WASM_BUILD_DIR/rnnoise
mkdir -p sample/web/rnnoise 2>/dev/null || true
mkdir -p dist/rnnoise 2>/dev/null || true

# Build non-SIMD version
echo "Building non-SIMD version..."
build_rnnoise "" "" "rnnoise"
cp $BUILD_DIR/rnnoise/rnnoise/rnnoise.wasm $WASM_BUILD_DIR/rnnoise/
cp $BUILD_DIR/rnnoise/rnnoise/rnnoise.d.ts src/utils/rnnoise_wasm.d.ts
cp $BUILD_DIR/rnnoise/rnnoise/rnnoise.js src/utils/rnnoise_wasm.js

# Build SIMD version
echo "Building SIMD version..."
build_rnnoise "-msimd128 -mrelaxed-simd" "" "rnnoise_simd"
cp $BUILD_DIR/rnnoise_simd/rnnoise/rnnoise_simd.wasm $WASM_BUILD_DIR/rnnoise/
cp $BUILD_DIR/rnnoise_simd/rnnoise/rnnoise_simd.d.ts src/utils/rnnoise_simd_wasm.d.ts
cp $BUILD_DIR/rnnoise_simd/rnnoise/rnnoise_simd.js src/utils/rnnoise_simd_wasm.js

# Copy to sample/web for dev server
cp $WASM_BUILD_DIR/rnnoise/rnnoise.wasm sample/web/rnnoise/ 2>/dev/null || true
cp $WASM_BUILD_DIR/rnnoise/rnnoise_simd.wasm sample/web/rnnoise/ 2>/dev/null || true

# Copy to dist folder
cp $WASM_BUILD_DIR/rnnoise/rnnoise.wasm dist/rnnoise/ 2>/dev/null || true
cp $WASM_BUILD_DIR/rnnoise/rnnoise_simd.wasm dist/rnnoise/ 2>/dev/null || true

rm -rf $BUILD_DIR

echo "Build complete! WASM files in $WASM_BUILD_DIR/rnnoise/"
ls -la $WASM_BUILD_DIR/rnnoise/
