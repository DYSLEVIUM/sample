/**
 * RNNoise Processor
 * 
 * Lightweight noise suppression using the RNNoise algorithm.
 * Supports SIMD-optimized WASM when available.
 */

import { simd } from 'wasm-feature-detect';
import { AudioDenoiserBase } from '../AudioDenoiserBase';
import { DenoiserType, type RNNoiseConfig } from '../types';
import { WasmLoader } from '../WasmLoader';

// ============================================================================
// WASM Module Types
// ============================================================================

interface RNNoiseWasmModule {
  HEAPF32: Float32Array;
  _rnnoise_get_frame_size(): number;
  _rnnoise_create(model?: number): number;
  _rnnoise_destroy(state: number): void;
  _rnnoise_process_frame(state: number, output: number, input: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

// ============================================================================
// Constants
// ============================================================================

const F32_BYTE_SIZE = 4;
const DEFAULT_FRAME_SIZE = 480;
const SCALE_TO_INT16 = 32767.0;
const SCALE_FROM_INT16 = 1.0 / 32767.0;

// Gain smoothing parameters
const GAIN_ATTACK_COEFF = 0.3;   // How fast to increase gain
const GAIN_RELEASE_COEFF = 0.05; // How fast to decrease gain (slower for smooth release)
const MIN_OUTPUT_GAIN = 0.1;     // Never go below 10% gain to avoid harsh cuts

// ============================================================================
// WASM Loader
// ============================================================================

class RNNoiseWasmLoader {
  private static loader: WasmLoader<RNNoiseWasmModule> | null = null;
  private static config: RNNoiseConfig = {};

  static getLoader(config: RNNoiseConfig): WasmLoader<RNNoiseWasmModule> {
    if (!this.loader || this.configChanged(config)) {
      this.config = config;
      this.loader = new WasmLoader(() => this.loadModule(config), 'RNNoise');
    }
    return this.loader;
  }

  private static configChanged(config: RNNoiseConfig): boolean {
    return config.assetsPath !== this.config.assetsPath ||
           config.wasmFileName !== this.config.wasmFileName ||
           config.preferSimd !== this.config.preferSimd;
  }

  private static async loadModule(config: RNNoiseConfig): Promise<RNNoiseWasmModule> {
    const isSimdSupported = await simd();
    const useSimd = config.preferSimd !== false && isSimdSupported;
    
    const loadRnnoiseModule = (await import('../../rnnoise_wasm')).default;
    
    const module = await loadRnnoiseModule({
      locateFile: (path: string, prefix: string) => {
        // Default to /rnnoise/ folder
        let finalPrefix = config.assetsPath 
          ? (config.assetsPath.endsWith('/') ? config.assetsPath : config.assetsPath + '/')
          : '/rnnoise/';

        let finalPath = config.wasmFileName ?? (useSimd ? 'rnnoise_simd.wasm' : 'rnnoise.wasm');

        console.debug(`[RNNoise] Loading: ${finalPrefix}${finalPath} (SIMD: ${useSimd})`);
        return finalPrefix + finalPath;
      },
    });

    return module as RNNoiseWasmModule;
  }

  static reset(): void {
    this.loader?.reset();
    this.loader = null;
    this.config = {};
  }
}

// ============================================================================
// RNNoise Processor
// ============================================================================

/**
 * RNNoise-based audio denoiser
 * 
 * Features:
 * - High-quality noise suppression via neural network
 * - Built-in VAD (Voice Activity Detection)
 * - Automatic gain smoothing for natural transitions
 * - SIMD optimization support
 * 
 * @example
 * ```typescript
 * const rnnoise = new RNNoiseProcessor({
 *   assetsPath: '/wasm',
 *   preferSimd: true,
 * });
 * 
 * await rnnoise.initialize();
 * const vadScore = rnnoise.processFrame(audioFrame);
 * rnnoise.destroy();
 * ```
 */
export class RNNoiseProcessor extends AudioDenoiserBase {
  readonly type = DenoiserType.RNNOISE;
  readonly name = 'RNNoise';

  private config: RNNoiseConfig;
  private wasmModule: RNNoiseWasmModule | null = null;
  private context = 0;
  private pcmInputBuffer = 0;
  private pcmOutputBuffer = 0;
  private _frameSize = DEFAULT_FRAME_SIZE;
  
  // Smoothing state
  private smoothedGain = 1.0;
  private prevVadScore = 0;
  private frameCount = 0;

  constructor(config: RNNoiseConfig = {}) {
    super(config);
    this.config = { preferSimd: true, ...config };
  }

  protected async doInitialize(): Promise<void> {
    const loader = RNNoiseWasmLoader.getLoader(this.config);
    this.wasmModule = await loader.load();

    this._frameSize = this.wasmModule._rnnoise_get_frame_size();
    this.logger.debug(`Frame size: ${this._frameSize}`);

    this.context = this.wasmModule._rnnoise_create();
    if (!this.context) {
      throw new Error('Failed to create RNNoise context');
    }

    const bufferSize = this._frameSize * F32_BYTE_SIZE;
    this.pcmInputBuffer = this.wasmModule._malloc(bufferSize);
    this.pcmOutputBuffer = this.wasmModule._malloc(bufferSize);

    if (!this.pcmInputBuffer || !this.pcmOutputBuffer) {
      this.releaseResources();
      throw new Error('Failed to allocate PCM buffers');
    }

    // Reset smoothing state
    this.smoothedGain = 1.0;
    this.prevVadScore = 0;
    this.frameCount = 0;
    
    this.logger.info('RNNoise initialized', {
      frameSize: this._frameSize,
      simd: this.config.preferSimd,
    });
  }

  protected doProcessFrame(frame: Float32Array): number {
    if (!this.wasmModule) {
      throw new Error('WASM module not loaded');
    }

    this.frameCount++;
    const inputIndex = this.pcmInputBuffer / F32_BYTE_SIZE;
    const outputIndex = this.pcmOutputBuffer / F32_BYTE_SIZE;

    // Scale input to int16 range (RNNoise expects this)
    for (let i = 0; i < this._frameSize; i++) {
      this.wasmModule.HEAPF32[inputIndex + i] = frame[i] * SCALE_TO_INT16;
    }

    // Process through RNNoise
    const vadScore = this.wasmModule._rnnoise_process_frame(
      this.context,
      this.pcmOutputBuffer,
      this.pcmInputBuffer
    );

    // Compute target gain based on VAD
    const targetGain = this.computeTargetGain(vadScore);
    
    // Smooth gain transition to avoid clicks
    const gainCoeff = targetGain > this.smoothedGain ? GAIN_ATTACK_COEFF : GAIN_RELEASE_COEFF;
    this.smoothedGain = this.smoothedGain + gainCoeff * (targetGain - this.smoothedGain);
    
    // Apply smoothed gain and scale back to float32
    for (let i = 0; i < this._frameSize; i++) {
      const sample = this.wasmModule.HEAPF32[outputIndex + i] * SCALE_FROM_INT16;
      frame[i] = sample * this.smoothedGain;
    }

    this.prevVadScore = vadScore;
    return vadScore;
  }

  /**
   * Compute target gain based on VAD score
   * - High VAD = full gain
   * - Low VAD = reduced gain but never fully muted
   */
  private computeTargetGain(vadScore: number): number {
    // Smooth VAD score
    const smoothedVad = 0.7 * vadScore + 0.3 * this.prevVadScore;
    
    // Map VAD to gain with soft knee
    // VAD > 0.5 = full gain, VAD < 0.2 = minimum gain
    if (smoothedVad > 0.5) {
      return 1.0;
    } else if (smoothedVad < 0.2) {
      return MIN_OUTPUT_GAIN + (smoothedVad / 0.2) * (0.5 - MIN_OUTPUT_GAIN);
    } else {
      // Smooth transition between 0.2 and 0.5
      const t = (smoothedVad - 0.2) / 0.3;
      return 0.5 + t * 0.5;
    }
  }

  protected doDestroy(): void {
    this.releaseResources();
  }

  protected getFrameSizeInternal(): number {
    return this._frameSize;
  }

  private releaseResources(): void {
    if (this.wasmModule) {
      if (this.context) {
        this.wasmModule._rnnoise_destroy(this.context);
        this.context = 0;
      }
      if (this.pcmInputBuffer) {
        this.wasmModule._free(this.pcmInputBuffer);
        this.pcmInputBuffer = 0;
      }
      if (this.pcmOutputBuffer) {
        this.wasmModule._free(this.pcmOutputBuffer);
        this.pcmOutputBuffer = 0;
      }
    }
    this.wasmModule = null;
  }

  /**
   * Get current smoothed gain (for debugging)
   */
  getSmoothedGain(): number {
    return this.smoothedGain;
  }

  /**
   * Reset gain smoothing state
   */
  resetGain(): void {
    this.smoothedGain = 1.0;
    this.prevVadScore = 0;
  }

  static isSupported(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  static resetLoader(): void {
    RNNoiseWasmLoader.reset();
  }
}
