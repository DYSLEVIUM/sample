/**
 * Noise Suppression Module
 * 
 * Clean architecture for audio noise suppression:
 * 
 * Hierarchy:
 * - IAudioProcessor (base interface)
 * - IAudioDenoiser (extends IAudioProcessor for noise suppression)
 *   - RNNoiseProcessor (lightweight, SIMD-optimized)
 *   - DeepFilterNetProcessor (high quality neural network)
 * 
 * Utilities:
 * - VadGainProcessor (separate utility for VAD-based gain control)
 * - AudioTrackDenoiser (high-level track processing)
 * 
 * @example Direct Processor Usage
 * ```typescript
 * import { RNNoiseProcessor, DeepFilterNetProcessor } from 'ecprt-client-sdk';
 * 
 * // RNNoise - lightweight
 * const rnnoise = new RNNoiseProcessor({ assetsPath: '/wasm' });
 * await rnnoise.initialize();
 * const vadScore = rnnoise.processFrame(audioFrame);
 * 
 * // DeepFilterNet - high quality
 * const deepFilter = new DeepFilterNetProcessor({ wasmBasePath: '/wasm' });
 * await deepFilter.initialize();
 * deepFilter.processFrame(audioFrame);
 * ```
 * 
 * @example Using Factory
 * ```typescript
 * import { createDenoiser, DenoiserType } from 'ecprt-client-sdk';
 * 
 * const denoiser = createDenoiser(DenoiserType.DEEP_FILTER_NET, {
 *   wasmBasePath: '/wasm',
 *   attenLimit: 60.0,
 * });
 * await denoiser.initialize();
 * ```
 * 
 * @example Track Processing
 * ```typescript
 * import { AudioTrackDenoiser, DenoiserType } from 'ecprt-client-sdk';
 * 
 * const trackDenoiser = await AudioTrackDenoiser.create({
 *   assetsPath: '/wasm',
 *   denoiserType: DenoiserType.DEEP_FILTER_NET,
 * });
 * const processedTrack = await trackDenoiser.startProcessing(audioTrack);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export {

    // Enums
    DenoiserType,
    LoadStatus,
    // Configuration
    type BaseDenoiserConfig, type DeepFilterNetConfig,
    type DenoiserConfig, type DenoiserFactory,
    // Registry types
    type DenoiserRegistration, type IAudioDenoiser,
    // Base interfaces
    type IAudioProcessor, type IConfigurableDenoiser,
    // Loader
    type IWasmLoader, type RNNoiseConfig, type TrackProcessorConfig,

    // VAD utility types
    type VadGainConfig,
    type VadGainState
} from './types';

// ============================================================================
// Logging
// ============================================================================

export {
    createDenoiseLogger, DenoiseLogger,
    getDenoiseLogger, LogLevel, setDenoiseLogger,
    setDenoiseLogLevel, type IDenoiseLogger,
    type LogContext
} from './logger';

// ============================================================================
// Denoisers
// ============================================================================

export { AudioDenoiserBase } from './AudioDenoiserBase';
export { DeepFilterNetLoader, DeepFilterNetProcessor } from './processors/DeepFilterNetProcessor';
export { RNNoiseProcessor } from './processors/RNNoiseProcessor';

// ============================================================================
// Registry & Factory
// ============================================================================

export { DenoiserRegistry } from './DenoiserRegistry';

export {
    createBestDenoiser, createDeepFilterNetDenoiser, createDenoiser,
    createRNNoiseDenoiser, getSupportedDenoisers, isDeepFilterNetDenoiser, isDenoiserSupported, isRNNoiseDenoiser
} from './DenoiserFactory';

// ============================================================================
// Track Processing
// ============================================================================

export { AudioTrackDenoiser } from './AudioTrackDenoiser';

// ============================================================================
// Utilities
// ============================================================================

export {
    clamp, greatestCommonDivisor,
    leastCommonMultiple, lerp,
    softClip
} from './math';
export { DEFAULT_VAD_CONFIG, VadGainProcessor } from './VadGainProcessor';
export { createWasmLoader, WasmLoader } from './WasmLoader';

