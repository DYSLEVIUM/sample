/**
 * Denoiser Registry
 * 
 * Registry Pattern for managing noise suppression algorithms.
 * Allows runtime registration and selection of denoisers.
 */

import { getDenoiseLogger } from './logger';
import {
  DenoiserType,
  type DenoiserConfig,
  type DenoiserFactory,
  type DenoiserRegistration,
  type IAudioDenoiser,
} from './types';

/**
 * Singleton registry for audio denoisers
 */
class DenoiserRegistryImpl {
  private readonly registrations = new Map<DenoiserType, DenoiserRegistration>();
  private readonly logger = getDenoiseLogger().createChild({ component: 'DenoiserRegistry' });

  /**
   * Register a denoiser type
   */
  register<T extends IAudioDenoiser, C extends DenoiserConfig>(
    registration: DenoiserRegistration<T, C>
  ): void {
    if (this.registrations.has(registration.type)) {
      this.logger.warn(`Overwriting registration for ${registration.type}`);
    }

    this.registrations.set(registration.type, registration as unknown as DenoiserRegistration);
    this.logger.info(`Registered denoiser: ${registration.type}`);
  }

  /**
   * Unregister a denoiser type
   */
  unregister(type: DenoiserType): boolean {
    const removed = this.registrations.delete(type);
    if (removed) {
      this.logger.info(`Unregistered denoiser: ${type}`);
    }
    return removed;
  }

  /**
   * Create a denoiser instance
   */
  create<T extends IAudioDenoiser = IAudioDenoiser>(
    type: DenoiserType,
    config: DenoiserConfig = {}
  ): T {
    const registration = this.registrations.get(type);

    if (!registration) {
      const available = this.getAvailableTypes().join(', ');
      throw new Error(`Unknown denoiser type: ${type}. Available: ${available || 'none'}`);
    }

    if (!registration.isSupported()) {
      throw new Error(`Denoiser ${type} not supported in this environment`);
    }

    const mergedConfig = { ...registration.defaultConfig, ...config };
    this.logger.debug(`Creating denoiser: ${type}`, { config: mergedConfig });
    
    return registration.factory(mergedConfig) as T;
  }

  /**
   * Check if a type is registered
   */
  has(type: DenoiserType): boolean {
    return this.registrations.has(type);
  }

  /**
   * Check if a type is supported
   */
  isSupported(type: DenoiserType): boolean {
    return this.registrations.get(type)?.isSupported() ?? false;
  }

  /**
   * Get all registered types
   */
  getAvailableTypes(): DenoiserType[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Get all supported types
   */
  getSupportedTypes(): DenoiserType[] {
    return Array.from(this.registrations.entries())
      .filter(([, reg]) => reg.isSupported())
      .map(([type]) => type);
  }

  /**
   * Get registration info
   */
  getRegistration(type: DenoiserType): DenoiserRegistration | undefined {
    return this.registrations.get(type);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.registrations.clear();
    this.logger.info('All registrations cleared');
  }

  /**
   * Get best available denoiser based on priority
   */
  getBestAvailable(priority?: DenoiserType[]): DenoiserType | null {
    const defaultPriority: DenoiserType[] = [
      DenoiserType.DEEP_FILTER_NET, // Higher quality
      DenoiserType.RNNOISE,         // Lighter weight
    ];

    for (const type of priority ?? defaultPriority) {
      if (this.isSupported(type)) {
        return type;
      }
    }

    const supported = this.getSupportedTypes();
    return supported.length > 0 ? supported[0] : null;
  }
}

export const DenoiserRegistry = new DenoiserRegistryImpl();
export type { DenoiserRegistration, DenoiserFactory };

