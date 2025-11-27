/**
 * Denoiser Factory
 * 
 * Factory functions for creating noise suppression processors.
 * Auto-registers built-in denoisers on module load.
 */

import { DenoiserRegistry } from './DenoiserRegistry';
import { getDenoiseLogger } from './logger';
import { DeepFilterNetProcessor } from './processors/DeepFilterNetProcessor';
import { RNNoiseProcessor } from './processors/RNNoiseProcessor';
import {
    DenoiserType,
    type DeepFilterNetConfig,
    type DenoiserConfig,
    type IAudioDenoiser,
    type RNNoiseConfig,
} from './types';

// ============================================================================
// Auto-Register Built-in Denoisers
// ============================================================================

function registerBuiltinDenoisers(): void {
  const logger = getDenoiseLogger().createChild({ component: 'DenoiserFactory' });

  if (!DenoiserRegistry.has(DenoiserType.RNNOISE)) {
    DenoiserRegistry.register({
      type: DenoiserType.RNNOISE,
      factory: (config: RNNoiseConfig) => new RNNoiseProcessor(config),
      isSupported: () => RNNoiseProcessor.isSupported(),
      defaultConfig: { preferSimd: true },
    });
    logger.debug('Registered RNNoise');
  }

  if (!DenoiserRegistry.has(DenoiserType.DEEP_FILTER_NET)) {
    DenoiserRegistry.register({
      type: DenoiserType.DEEP_FILTER_NET,
      factory: (config: DeepFilterNetConfig) => new DeepFilterNetProcessor(config),
      isSupported: () => DeepFilterNetProcessor.isSupported(),
      defaultConfig: { attenLimit: 80.0, postFilterBeta: 0.0 },
    });
    logger.debug('Registered DeepFilterNet');
  }
}

// Auto-register on module load
registerBuiltinDenoisers();

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a denoiser by type
 */
export function createDenoiser(
  type: DenoiserType.RNNOISE,
  config?: RNNoiseConfig
): RNNoiseProcessor;
export function createDenoiser(
  type: DenoiserType.DEEP_FILTER_NET,
  config?: DeepFilterNetConfig
): DeepFilterNetProcessor;
export function createDenoiser(
  type: DenoiserType,
  config?: DenoiserConfig
): IAudioDenoiser;
export function createDenoiser(
  type: DenoiserType,
  config: DenoiserConfig = {}
): IAudioDenoiser {
  return DenoiserRegistry.create(type, config);
}

/**
 * Create RNNoise denoiser
 */
export function createRNNoiseDenoiser(config?: RNNoiseConfig): RNNoiseProcessor {
  return createDenoiser(DenoiserType.RNNOISE, config);
}

/**
 * Create DeepFilterNet denoiser
 */
export function createDeepFilterNetDenoiser(config?: DeepFilterNetConfig): DeepFilterNetProcessor {
  return createDenoiser(DenoiserType.DEEP_FILTER_NET, config);
}

/**
 * Create best available denoiser
 */
export function createBestDenoiser(config?: DenoiserConfig): IAudioDenoiser | null {
  const bestType = DenoiserRegistry.getBestAvailable();

  if (!bestType) {
    getDenoiseLogger().warn('No supported denoiser available');
    return null;
  }

  return createDenoiser(bestType, config);
}

/**
 * Check if a denoiser type is supported
 */
export function isDenoiserSupported(type: DenoiserType): boolean {
  return DenoiserRegistry.isSupported(type);
}

/**
 * Get all supported denoiser types
 */
export function getSupportedDenoisers(): DenoiserType[] {
  return DenoiserRegistry.getSupportedTypes();
}

// ============================================================================
// Type Guards
// ============================================================================

export function isRNNoiseDenoiser(d: IAudioDenoiser): d is RNNoiseProcessor {
  return d.type === DenoiserType.RNNOISE;
}

export function isDeepFilterNetDenoiser(d: IAudioDenoiser): d is DeepFilterNetProcessor {
  return d.type === DenoiserType.DEEP_FILTER_NET;
}
