/**
 * DeepFilterNet Processor
 * 
 * High-quality noise suppression using DeepFilterNet neural network.
 * Provides superior denoising at higher computational cost.
 */

import { AudioDenoiserBase } from '../AudioDenoiserBase';
import { getDenoiseLogger } from '../logger';
import { DenoiserType, type DeepFilterNetConfig, type IConfigurableDenoiser } from '../types';

// ============================================================================
// WASM Types
// ============================================================================

interface DeepFilterWasm {
  df_create(modelData: Uint8Array, attenLimit: number): number;
  df_process_frame(context: number, frame: Float32Array): Float32Array;
  df_get_frame_length(context: number): number;
  df_set_atten_lim(context: number, limDb: number): void;
  df_set_post_filter_beta(context: number, beta: number): void;
}

interface WasmData {
  wasmJsCode: string;
  wasmBinary: Uint8Array;
  modelData: Uint8Array;
}

// ============================================================================
// Constants
// ============================================================================

// Attenuation limit in dB - lower values = less aggressive, more natural sound
// 100+ = disabled (no limit), 80 = very aggressive (can sound robotic)
// 15-25 dB is recommended for natural-sounding speech
const DEFAULT_ATTEN_LIMIT = 18.0;

// Post-filter beta - helps preserve speech quality
// 0.0 = disabled, 0.02 = light, 0.05 = moderate
// Higher values = more natural sound but slightly less noise reduction
const DEFAULT_POST_FILTER_BETA = 0.03;

const DEFAULT_FRAME_SIZE = 480;
const GZIP_MAGIC = [0x1f, 0x8b];

// ============================================================================
// WASM Loader
// ============================================================================

class DeepFilterNetLoader {
  private static wasmData: WasmData | null = null;
  private static isLoading = false;
  private static basePath?: string;
  private static logger = getDenoiseLogger().createChild({ component: 'DeepFilterNetLoader' });

  static setBasePath(path: string): void {
    const normalized = path.endsWith('/') ? path : path + '/';
    if (this.basePath !== normalized) {
      this.basePath = normalized;
      this.reset();
    }
  }

  static getBasePath(): string {
    // Default paths in order of preference:
    // 1. User-set basePath
    // 2. /deepfilternet/ (for served apps)
    // 3. ./deepfilternet/ (relative path)
    return this.basePath ?? '/deepfilternet/';
  }

  static async loadWasmData(): Promise<WasmData> {
    if (this.wasmData) return this.wasmData;

    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (this.wasmData) return this.wasmData;
    }

    this.isLoading = true;
    const basePath = this.getBasePath();

    try {
      this.logger.info(`Loading DeepFilterNet from ${basePath}`);
      const startTime = performance.now();

      const [jsRes, wasmRes, modelRes] = await Promise.all([
        fetch(`${basePath}df.js`),
        fetch(`${basePath}df_bg.wasm`),
        fetch(`${basePath}DeepFilterNet3_onnx.tar.gz`, {
          headers: { 'Accept-Encoding': 'identity' }
        }),
      ]);

      if (!jsRes.ok) throw new Error(`Failed to fetch df.js: ${jsRes.status}`);
      if (!wasmRes.ok) throw new Error(`Failed to fetch df_bg.wasm: ${wasmRes.status}`);
      if (!modelRes.ok) throw new Error(`Failed to fetch model: ${modelRes.status}`);

      const wasmJsCode = await jsRes.text();
      const wasmBinary = new Uint8Array(await wasmRes.arrayBuffer());
      let modelData = new Uint8Array(await modelRes.arrayBuffer());

      // Check if model is gzipped
      const isGzipped = modelData.length >= 2 && 
                        modelData[0] === GZIP_MAGIC[0] && 
                        modelData[1] === GZIP_MAGIC[1];

      if (!isGzipped) {
        // Server auto-decompressed the file, we need to re-compress it
        this.logger.warn('Model was auto-decompressed by server, re-compressing...');
        try {
          const { gzipSync } = await import('fflate');
          modelData = new Uint8Array(gzipSync(modelData));
          this.logger.info('Model re-compressed successfully');
        } catch (gzipError) {
          this.logger.error('Failed to re-compress model data', undefined, gzipError);
          throw new Error(`Model must be gzipped. Server decompressed it and re-compression failed: ${gzipError}`);
        }
      }

      this.wasmData = { wasmJsCode, wasmBinary, modelData };

      const duration = (performance.now() - startTime).toFixed(2);
      this.logger.info(`Loaded in ${duration}ms`, undefined, {
        jsSize: wasmJsCode.length,
        wasmSize: wasmBinary.byteLength,
        modelSize: modelData.byteLength,
      });

      return this.wasmData;
    } finally {
      this.isLoading = false;
    }
  }

  static isLoaded(): boolean {
    return this.wasmData !== null;
  }

  static reset(): void {
    this.wasmData = null;
    this.isLoading = false;
  }
}

// ============================================================================
// DeepFilterNet Processor
// ============================================================================

/**
 * DeepFilterNet-based audio denoiser
 * 
 * Higher quality than RNNoise but more computationally intensive.
 * 
 * @example
 * ```typescript
 * const deepFilter = new DeepFilterNetProcessor({
 *   wasmBasePath: '/wasm/deepfilter',
 *   attenLimit: 60.0,
 *   postFilterBeta: 0.02,
 * });
 * 
 * await deepFilter.initialize();
 * deepFilter.processFrame(audioFrame);
 * deepFilter.destroy();
 * ```
 */
export class DeepFilterNetProcessor extends AudioDenoiserBase implements IConfigurableDenoiser {
  readonly type = DenoiserType.DEEP_FILTER_NET;
  readonly name = 'DeepFilterNet';

  private config: DeepFilterNetConfig;
  private wasm: DeepFilterWasm | null = null;
  private context = 0;
  private _frameSize = DEFAULT_FRAME_SIZE;

  constructor(config: DeepFilterNetConfig = {}) {
    super(config);
    this.config = {
      attenLimit: DEFAULT_ATTEN_LIMIT,
      postFilterBeta: DEFAULT_POST_FILTER_BETA,
      ...config,
    };

    if (config.wasmBasePath) {
      DeepFilterNetLoader.setBasePath(config.wasmBasePath);
    }
  }

  protected async doInitialize(): Promise<void> {
    const wasmData = await DeepFilterNetLoader.loadWasmData();

    // Initialize wasm_bindgen
    (0, eval)(`${wasmData.wasmJsCode}\nglobalThis.wasm_bindgen = wasm_bindgen;`);
    
    if (!(globalThis as any).wasm_bindgen) {
      throw new Error('wasm_bindgen not available');
    }

    await (globalThis as any).wasm_bindgen(wasmData.wasmBinary);
    this.wasm = (globalThis as any).wasm_bindgen as DeepFilterWasm;

    // Create context
    this.context = this.wasm.df_create(wasmData.modelData, this.config.attenLimit!);
    if (!this.context) {
      throw new Error('df_create failed');
    }

    this._frameSize = this.wasm.df_get_frame_length(this.context);
    
    const effectiveAttenLimit = this.config.attenLimit ?? DEFAULT_ATTEN_LIMIT;
    const effectivePostFilterBeta = this.config.postFilterBeta ?? DEFAULT_POST_FILTER_BETA;
    
    this.logger.info('DeepFilterNet initialized', {
      frameSize: this._frameSize,
      attenLimit: `${effectiveAttenLimit} dB`,
      postFilterBeta: effectivePostFilterBeta,
    });

    // Set post filter for more natural sound
    if (effectivePostFilterBeta > 0) {
      this.wasm.df_set_post_filter_beta(this.context, effectivePostFilterBeta);
      this.logger.debug(`Post-filter enabled with beta=${effectivePostFilterBeta}`);
    }
  }

  private processedFrameCount = 0;

  protected doProcessFrame(frame: Float32Array): number {
    if (!this.wasm || !this.context) {
      throw new Error('DeepFilterNet not initialized');
    }

    this.processedFrameCount++;

    // Log input stats on first frame
    if (this.processedFrameCount === 1) {
      const inputMin = Math.min(...frame);
      const inputMax = Math.max(...frame);
      const inputRms = Math.sqrt(frame.reduce((sum, x) => sum + x * x, 0) / frame.length);
      this.logger.debug('DeepFilterNet first frame input', {
        frameLength: frame.length,
        inputMin: inputMin.toFixed(6),
        inputMax: inputMax.toFixed(6),
        inputRms: inputRms.toFixed(6),
      });
    }

    const processed = this.wasm.df_process_frame(this.context, frame);

    // Log output stats on first frame
    if (this.processedFrameCount === 1) {
      const outputMin = Math.min(...processed);
      const outputMax = Math.max(...processed);
      const outputRms = Math.sqrt(processed.reduce((sum, x) => sum + x * x, 0) / processed.length);
      this.logger.debug('DeepFilterNet first frame output', {
        outputLength: processed.length,
        outputMin: outputMin.toFixed(6),
        outputMax: outputMax.toFixed(6),
        outputRms: outputRms.toFixed(6),
      });
    }

    frame.set(processed);

    // DeepFilterNet doesn't provide VAD
    return 0;
  }

  protected doDestroy(): void {
    this.wasm = null;
    this.context = 0;
  }

  protected getFrameSizeInternal(): number {
    return this._frameSize;
  }

  // IConfigurableDenoiser
  configure(config: Partial<DeepFilterNetConfig>): void {
    if (config.attenLimit !== undefined) {
      this.setAttenLimit(config.attenLimit);
    }
    if (config.postFilterBeta !== undefined) {
      this.setPostFilterBeta(config.postFilterBeta);
    }
  }

  /**
   * Set attenuation limit in dB
   */
  setAttenLimit(limDb: number): void {
    if (!this._isInitialized || !this.wasm) {
      throw new Error('Not initialized');
    }
    this.wasm.df_set_atten_lim(this.context, limDb);
    this.config.attenLimit = limDb;
    this.logger.debug(`Atten limit: ${limDb}dB`);
  }

  /**
   * Set post filter beta (0 disables, 0-0.05 recommended)
   */
  setPostFilterBeta(beta: number): void {
    if (!this._isInitialized || !this.wasm) {
      throw new Error('Not initialized');
    }
    this.wasm.df_set_post_filter_beta(this.context, beta);
    this.config.postFilterBeta = beta;
    this.logger.debug(`Post filter beta: ${beta}`);
  }

  static isSupported(): boolean {
    return typeof WebAssembly !== 'undefined' && typeof fetch !== 'undefined';
  }

  static async preload(basePath?: string): Promise<void> {
    if (basePath) DeepFilterNetLoader.setBasePath(basePath);
    await DeepFilterNetLoader.loadWasmData();
  }

  static resetLoader(): void {
    DeepFilterNetLoader.reset();
  }

  static setBasePath(path: string): void {
    DeepFilterNetLoader.setBasePath(path);
  }
}

export { DeepFilterNetLoader };
