/**
 * Abstract Base Class for Audio Denoisers
 * 
 * Provides common functionality using Template Method pattern.
 * Subclasses implement specific hooks for different algorithms.
 */

import { createDenoiseLogger, type IDenoiseLogger, LogLevel } from './logger';
import type {
    BaseDenoiserConfig,
    DenoiserType,
    IAudioDenoiser,
} from './types';

/**
 * Abstract base class for noise suppression processors
 * 
 * Template Method pattern - subclasses implement:
 * - doInitialize(): Algorithm-specific initialization
 * - doProcessFrame(): Algorithm-specific frame processing
 * - doDestroy(): Algorithm-specific cleanup
 * - getFrameSizeInternal(): Return required frame size
 */
export abstract class AudioDenoiserBase implements IAudioDenoiser {
  protected readonly logger: IDenoiseLogger;
  protected _isInitialized = false;
  protected _lastVadScore = 0;
  protected _vadLogging = false;

  abstract readonly type: DenoiserType;
  abstract readonly name: string;

  constructor(config: BaseDenoiserConfig = {}) {
    this.logger = config.logger ?? createDenoiseLogger({
      processor: this.constructor.name,
      sessionId: config.sessionId,
    });

    if (config.debug) {
      this.logger.setLevel(LogLevel.DEBUG);
    }

    this.logger.debug('Denoiser instance created', { processor: this.constructor.name });
  }

  // ============================================================================
  // IAudioDenoiser Implementation
  // ============================================================================

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get frameSize(): number {
    return this.getFrameSizeInternal();
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      this.logger.warn('Denoiser already initialized');
      return;
    }

    this.logger.info('Initializing denoiser...', { processor: this.name });
    const startTime = performance.now();

    try {
      await this.doInitialize();
      this._isInitialized = true;
      
      const duration = (performance.now() - startTime).toFixed(2);
      this.logger.info(`Denoiser initialized in ${duration}ms`, {
        processor: this.name,
        frameSize: this.frameSize,
      });
    } catch (error) {
      this.logger.error('Failed to initialize denoiser', { processor: this.name }, error);
      this._isInitialized = false;
      throw error;
    }
  }

  processFrame(frame: Float32Array): number {
    if (!this._isInitialized) {
      throw new Error(`${this.name} denoiser not initialized`);
    }

    if (frame.length !== this.frameSize) {
      throw new Error(`Expected frame size ${this.frameSize}, got ${frame.length}`);
    }

    const vadScore = this.doProcessFrame(frame);
    this._lastVadScore = vadScore;

    if (this._vadLogging) {
      this.logger.debug(`VAD: ${vadScore.toFixed(4)}`, { processor: this.name });
    }

    return vadScore;
  }

  destroy(): void {
    if (!this._isInitialized) {
      return;
    }

    this.logger.info('Destroying denoiser...', { processor: this.name });

    try {
      this.doDestroy();
      this._isInitialized = false;
      this.logger.info('Denoiser destroyed', { processor: this.name });
    } catch (error) {
      this.logger.error('Error destroying denoiser', { processor: this.name }, error);
      this._isInitialized = false;
      throw error;
    }
  }

  getLastVadScore(): number {
    return this._lastVadScore;
  }

  setVadLogging(enabled: boolean): void {
    this._vadLogging = enabled;
  }

  // ============================================================================
  // Template Methods (implement in subclasses)
  // ============================================================================

  protected abstract doInitialize(): Promise<void>;
  protected abstract doProcessFrame(frame: Float32Array): number;
  protected abstract doDestroy(): void;
  protected abstract getFrameSizeInternal(): number;
}
