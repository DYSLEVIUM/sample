/**
 * Noise Suppression Types
 * 
 * Clean hierarchy following Interface Segregation Principle:
 * - IAudioProcessor: Base interface for any audio frame processor
 * - IAudioDenoiser: Specialized interface for noise suppression
 * - VadGainConfig: Configuration for VAD-based gain (separate utility)
 */

import type { IDenoiseLogger } from './logger';

// ============================================================================
// Base Processor Interface
// ============================================================================

/**
 * Base interface for any audio frame processor
 */
export interface IAudioProcessor {
  /** Unique processor type identifier */
  readonly type: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Whether the processor is initialized and ready */
  readonly isInitialized: boolean;
  
  /** Frame size expected by this processor */
  readonly frameSize: number;

  /** Initialize the processor */
  initialize(): Promise<void>;

  /** Release all resources */
  destroy(): void;
}

// ============================================================================
// Audio Denoiser Interface
// ============================================================================

/**
 * Interface for noise suppression processors
 * Extends base processor with denoising-specific methods
 */
export interface IAudioDenoiser extends IAudioProcessor {
  /** Processor type (from DenoiserType enum) */
  readonly type: DenoiserType;

  /**
   * Process a single audio frame in-place
   * @param frame - Audio samples (modified in place)
   * @returns VAD score (0-1) if available, 0 otherwise
   */
  processFrame(frame: Float32Array): number;

  /** Get the last VAD score */
  getLastVadScore(): number;
}

/**
 * Extended interface for denoisers that support runtime configuration
 */
export interface IConfigurableDenoiser extends IAudioDenoiser {
  /** Update configuration at runtime */
  configure(config: Partial<DenoiserConfig>): void;
}

// ============================================================================
// Denoiser Type Enumeration
// ============================================================================

/**
 * Available denoiser types
 */
export enum DenoiserType {
  RNNOISE = 'rnnoise',
  DEEP_FILTER_NET = 'deepfilternet',
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base configuration shared by all denoisers
 */
export interface BaseDenoiserConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger instance */
  logger?: IDenoiseLogger;
  /** Session identifier for logging */
  sessionId?: string;
}

/**
 * RNNoise-specific configuration
 */
export interface RNNoiseConfig extends BaseDenoiserConfig {
  /** Base path for loading WASM files */
  assetsPath?: string;
  /** Explicit WASM filename (overrides auto-detection) */
  wasmFileName?: string;
  /** Whether to use SIMD version if available (default: true) */
  preferSimd?: boolean;
}

/**
 * DeepFilterNet-specific configuration
 * 
 * For best audio quality:
 * - attenLimit: 25-40 dB (lower = more natural, less aggressive)
 * - postFilterBeta: 0.02-0.03 (helps preserve speech quality)
 * 
 * For maximum noise reduction (may sound robotic):
 * - attenLimit: 60-80 dB
 * - postFilterBeta: 0 (disabled)
 */
export interface DeepFilterNetConfig extends BaseDenoiserConfig {
  /** Base path for loading WASM files */
  wasmBasePath?: string;
  /** 
   * Attenuation limit in dB (default: 30.0)
   * - Lower values = less aggressive, more natural sound
   * - 100+ = disabled (no limit)
   * - 80 = very aggressive (can sound robotic)
   * - 25-40 = recommended for natural speech
   */
  attenLimit?: number;
  /** 
   * Post filter beta value (default: 0.02)
   * - Helps preserve speech quality and natural sound
   * - 0.0 = disabled
   * - 0.02 = light (recommended)
   * - 0.05 = moderate
   */
  postFilterBeta?: number;
}

/**
 * Union type for all denoiser configurations
 */
export type DenoiserConfig = RNNoiseConfig | DeepFilterNetConfig;

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Factory function type for creating denoisers
 */
export type DenoiserFactory<T extends IAudioDenoiser = IAudioDenoiser, C extends DenoiserConfig = DenoiserConfig> = 
  (config: C) => T;

/**
 * Denoiser registration info for the registry
 */
export interface DenoiserRegistration<T extends IAudioDenoiser = IAudioDenoiser, C extends DenoiserConfig = DenoiserConfig> {
  type: DenoiserType;
  factory: DenoiserFactory<T, C>;
  /** Check if this denoiser is supported in the current environment */
  isSupported: () => boolean;
  /** Default configuration */
  defaultConfig?: Partial<C>;
}

// ============================================================================
// WASM Loader Types
// ============================================================================

/**
 * Status of a lazy-loaded resource
 */
export enum LoadStatus {
  NOT_LOADED = 'not_loaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
}

/**
 * Interface for lazy-loaded WASM modules
 */
export interface IWasmLoader<T = unknown> {
  readonly status: LoadStatus;
  load(): Promise<T>;
  getModule(): T;
  isReady(): boolean;
  reset(): void;
}

// ============================================================================
// VAD Gain Utility Types (Separate from Denoiser Hierarchy)
// ============================================================================

/**
 * State for VAD-based gain computation
 */
export interface VadGainState {
  smoothedVad: number;
  hangoverFrames: number;
  previousGain: number;
  targetGain: number;
}

/**
 * Configuration for VAD-based gain control
 */
export interface VadGainConfig {
  /** VAD smoothing factor (default: 0.12) */
  vadSmoothingFactor: number;
  /** VAD threshold for speech detection (default: 0.25) */
  vadThreshold: number;
  /** Frames to keep gate open after speech (default: 30) */
  hangoverFrames: number;
  /** Minimum gain during gating (default: 0.03) */
  minGateGain: number;
  /** Attack smoothing for speech onset (default: 0.3) */
  attackSmoothing: number;
  /** Release smoothing for natural decay (default: 0.02) */
  releaseSmoothing: number;
  /** When to start fading during hangover (default: 0.5) */
  hangoverFadeStart: number;
}

// ============================================================================
// Track Processing Types
// ============================================================================

/**
 * Configuration for high-level track processing
 */
export interface TrackProcessorConfig {
  /** Path to WASM assets */
  assetsPath?: string;
  /** Denoiser type to use */
  denoiserType?: DenoiserType;
  /** Denoiser-specific configuration */
  denoiserConfig?: DenoiserConfig;
  /** VAD gain configuration (optional) */
  vadConfig?: Partial<VadGainConfig>;
  /** Enable debug logging */
  debug?: boolean;
  /** Apply VAD-based gain control (default: true) */
  applyVadGain?: boolean;
}
