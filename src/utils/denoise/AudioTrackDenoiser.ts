/**
 * Audio Track Denoiser
 * 
 * High-level API for applying noise suppression to MediaStreamAudioTrack.
 * Uses MediaStreamTrackProcessor/Generator for stream processing.
 */

/// <reference types="dom-mediacapture-transform" />

import { createDeepFilterNetDenoiser, createDenoiser } from './DenoiserFactory';
import { getDenoiseLogger, type IDenoiseLogger } from './logger';
import {
    DenoiserType,
    type DenoiserConfig,
    type IAudioDenoiser,
    type TrackProcessorConfig,
} from './types';
import { DEFAULT_VAD_CONFIG, VadGainProcessor } from './VadGainProcessor';

// ============================================================================
// Types
// ============================================================================

interface ProcessingState {
  processor: MediaStreamTrackProcessor<AudioData>;
  generator: MediaStreamTrackGenerator<AudioData>;
  abortController: AbortController;
  denoiser: IAudioDenoiser;
  vadGain: VadGainProcessor;
  inputBuffer: Float32Array;
  originalBuffer: Float32Array;
  outputBuffer: Float32Array;
  bufferFrameCount: number;
  nextTimestamp: number;
  // Debug counters
  framesReceived: number;
  framesProcessed: number;
  framesEnqueued: number;
  lastLogTime: number;
  // Fade-in state
  fadeInRemaining: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEBUG_LOG_INTERVAL_MS = 5000;

// Fade-in to avoid initial click (number of samples)
const FADE_IN_SAMPLES = 960; // ~20ms at 48kHz

// ============================================================================
// AudioTrackDenoiser
// ============================================================================

export class AudioTrackDenoiser {
  private static instance: AudioTrackDenoiser | null = null;
  
  private readonly logger: IDenoiseLogger;
  private readonly config: TrackProcessorConfig;
  private denoiser: IAudioDenoiser | null = null;
  private state: ProcessingState | null = null;
  private originalTrack: MediaStreamAudioTrack | null = null;
  private processedTrack: MediaStreamAudioTrack | null = null;

  private constructor(config: TrackProcessorConfig = {}) {
    this.config = { applyVadGain: false, ...config }; // Disable VAD gain by default
    this.logger = getDenoiseLogger().createChild({
      component: 'AudioTrackDenoiser',
      sessionId: config.denoiserConfig?.sessionId,
    });

    if (config.debug) {
      this.logger.setLevel(0);
    }
  }

  // ============================================================================
  // Factory
  // ============================================================================

  public static async create(config: TrackProcessorConfig = {}): Promise<AudioTrackDenoiser> {
    const logger = getDenoiseLogger().createChild({ component: 'AudioTrackDenoiser' });
    logger.info('Creating AudioTrackDenoiser...', undefined, config);

    if (!AudioTrackDenoiser.instance) {
      AudioTrackDenoiser.instance = new AudioTrackDenoiser(config);
      await AudioTrackDenoiser.instance.initializeDenoiser(config);
    } else {
      logger.debug('Returning existing AudioTrackDenoiser instance');
    }

    return AudioTrackDenoiser.instance;
  }

  public static getInstance(): AudioTrackDenoiser | null {
    return AudioTrackDenoiser.instance;
  }

  public static reset(): void {
    const logger = getDenoiseLogger().createChild({ component: 'AudioTrackDenoiser' });
    logger.info('Resetting AudioTrackDenoiser instance');
    
    if (AudioTrackDenoiser.instance) {
      AudioTrackDenoiser.instance.stopProcessing();
      AudioTrackDenoiser.instance.denoiser?.destroy();
      AudioTrackDenoiser.instance = null;
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async initializeDenoiser(config: TrackProcessorConfig): Promise<void> {
    const startTime = performance.now();
    this.logger.debug('Initializing denoiser...', undefined, { config });

    if (config.denoiserType) {
      this.logger.debug(`Using specified denoiser type: ${config.denoiserType}`);
      const denoiserConfig: DenoiserConfig = {
        debug: config.debug,
        ...config.denoiserConfig,
      };
      
      if (config.assetsPath && !config.denoiserConfig) {
        (denoiserConfig as any).assetsPath = config.assetsPath;
        (denoiserConfig as any).wasmBasePath = config.assetsPath;
      }
      
      this.denoiser = createDenoiser(config.denoiserType, denoiserConfig);
    } else {
      this.logger.debug('Using default denoiser: DeepFilterNet');
      this.denoiser = createDeepFilterNetDenoiser({
        wasmBasePath: config.assetsPath,
        debug: config.debug,
        ...config.denoiserConfig as any,
      });
    }

    await this.denoiser.initialize();

    const duration = (performance.now() - startTime).toFixed(2);
    this.logger.info(`Denoiser ready in ${duration}ms`, { 
      denoiser: this.denoiser.name,
      frameSize: this.denoiser.frameSize,
      type: this.denoiser.type,
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  public static isSupported(): boolean {
    return typeof MediaStreamTrackProcessor !== 'undefined' &&
           typeof MediaStreamTrackGenerator !== 'undefined';
  }

  public async startProcessing(track: MediaStreamAudioTrack): Promise<MediaStreamAudioTrack> {
    if (this.isProcessing()) {
      this.logger.warn('Already processing, stopping previous');
      this.stopProcessing();
    }

    if (!this.denoiser) {
      throw new Error('Denoiser not initialized');
    }

    const trackSettings = track.getSettings();
    this.logger.info('Starting processing', { 
      trackId: track.id,
      sampleRate: trackSettings.sampleRate,
      channelCount: trackSettings.channelCount,
      denoiserType: this.denoiser.type,
    });

    const frameSize = this.denoiser.frameSize;
    
    this.state = {
      processor: new MediaStreamTrackProcessor({ track }),
      generator: new MediaStreamTrackGenerator({ kind: 'audio' }) as MediaStreamTrackGenerator<AudioData>,
      abortController: new AbortController(),
      denoiser: this.denoiser,
      vadGain: new VadGainProcessor(this.config.vadConfig ?? DEFAULT_VAD_CONFIG),
      inputBuffer: new Float32Array(frameSize),
      originalBuffer: new Float32Array(frameSize),
      outputBuffer: new Float32Array(frameSize),
      bufferFrameCount: 0,
      nextTimestamp: 0,
      framesReceived: 0,
      framesProcessed: 0,
      framesEnqueued: 0,
      lastLogTime: Date.now(),
      fadeInRemaining: FADE_IN_SAMPLES,
    };

    this.originalTrack = track;
    this.startPipeline();
    this.processedTrack = this.state.generator as unknown as MediaStreamAudioTrack;

    this.logger.info('Processing started', {
      trackId: track.id,
      frameSize,
      denoiser: this.denoiser.name,
    });

    return this.processedTrack;
  }

  public stopProcessing(): void {
    if (!this.state) return;

    this.logger.info('Stopping processing', {
      framesProcessed: this.state.framesProcessed,
    });

    this.state.abortController.abort();
    this.state.vadGain.reset();
    this.state = null;
    this.originalTrack = null;
    this.processedTrack = null;
  }

  public isProcessing(): boolean {
    return this.state !== null;
  }

  public getOriginalTrack(): MediaStreamAudioTrack | null {
    return this.originalTrack;
  }

  public getProcessedTrack(): MediaStreamAudioTrack | null {
    return this.processedTrack;
  }

  public getDenoiser(): IAudioDenoiser | null {
    return this.denoiser;
  }

  // ============================================================================
  // Pipeline
  // ============================================================================

  private startPipeline(): void {
    if (!this.state) return;

    const { processor, generator, abortController } = this.state;
    const signal = abortController.signal;

    processor.readable
      .pipeThrough(
        new TransformStream({
          transform: (data, controller) => this.transform(data, controller),
        }),
        { signal }
      )
      .pipeTo(generator.writable)
      .catch((e: Error) => {
        if (!signal.aborted) {
          this.logger.error('Pipeline error', undefined, e);
        }
        processor.readable.cancel(e).catch(() => {});
        generator.writable.abort(e).catch(() => {});
      });
  }

  private transform(
    data: AudioData,
    controller: TransformStreamDefaultController<AudioData>
  ): void {
    const state = this.state;
    
    if (!state || !state.denoiser.isInitialized) {
      controller.enqueue(data);
      data.close();
      return;
    }

    state.framesReceived++;

    if (state.framesReceived === 1) {
      this.logger.debug('First audio frame', {
        format: data.format,
        sampleRate: data.sampleRate,
        numberOfChannels: data.numberOfChannels,
        numberOfFrames: data.numberOfFrames,
      });
    }

    if (data.numberOfChannels !== 1) {
      throw new Error('Stereo not supported');
    }

    if (data.format !== 'f32-planar') {
      throw new Error(`Unsupported format: ${data.format}`);
    }

    if (state.bufferFrameCount === 0) {
      state.nextTimestamp = data.timestamp;
    }

    const frameSize = state.denoiser.frameSize;
    let offset = 0;

    while (offset < data.numberOfFrames) {
      const count = Math.min(
        frameSize - state.bufferFrameCount,
        data.numberOfFrames - offset
      );

      data.copyTo(state.inputBuffer.subarray(state.bufferFrameCount), {
        planeIndex: 0,
        frameOffset: offset,
        frameCount: count,
      });

      data.copyTo(state.originalBuffer.subarray(state.bufferFrameCount), {
        planeIndex: 0,
        frameOffset: offset,
        frameCount: count,
      });

      state.bufferFrameCount += count;
      offset += count;

      if (state.bufferFrameCount === frameSize) {
        this.processFrame(state, data, controller);
        state.bufferFrameCount = 0;
        state.nextTimestamp = data.timestamp + (data.duration * offset) / data.numberOfFrames;
      }
    }

    data.close();

    // Periodic stats
    const now = Date.now();
    if (now - state.lastLogTime >= DEBUG_LOG_INTERVAL_MS) {
      this.logger.debug('Stats', {
        framesProcessed: state.framesProcessed,
        framesEnqueued: state.framesEnqueued,
      });
      state.lastLogTime = now;
    }
  }

  private processFrame(
    state: ProcessingState,
    data: AudioData,
    controller: TransformStreamDefaultController<AudioData>
  ): void {
    const { denoiser, inputBuffer, outputBuffer } = state;
    const frameSize = denoiser.frameSize;

    state.framesProcessed++;

    // Copy input to output buffer - each processor handles its own scaling internally
    outputBuffer.set(inputBuffer);

    // Process through denoiser (handles its own scaling)
    const vadScore = denoiser.processFrame(outputBuffer);

    // Apply fade-in for first ~20ms to avoid initial click
    if (state.fadeInRemaining > 0) {
      const fadeCount = Math.min(frameSize, state.fadeInRemaining);
      for (let i = 0; i < fadeCount; i++) {
        const progress = 1 - (state.fadeInRemaining - i) / FADE_IN_SAMPLES;
        // Smooth ease-in curve
        const smoothProgress = progress * progress * (3 - 2 * progress);
        outputBuffer[i] *= smoothProgress;
      }
      state.fadeInRemaining -= fadeCount;
    }

    // Clamp to prevent clipping
    for (let i = 0; i < frameSize; i++) {
      if (outputBuffer[i] > 1.0) outputBuffer[i] = 1.0;
      else if (outputBuffer[i] < -1.0) outputBuffer[i] = -1.0;
    }

    // VAD-based gain for RNNoise if enabled (RNNoise provides VAD scores)
    if (this.config.applyVadGain && denoiser.type === DenoiserType.RNNOISE && vadScore > 0) {
      const { vadGain, originalBuffer } = state;
      const prevGain = vadGain.getPreviousGain();
      const gain = vadGain.computeGain(vadScore);
      vadGain.applyGainWithBlend(outputBuffer, originalBuffer, prevGain, gain);
    }

    if (state.generator.readyState === 'ended') {
      this.stopProcessing();
      return;
    }

    state.framesEnqueued++;

    controller.enqueue(
      new AudioData({
        format: data.format as AudioSampleFormat,
        sampleRate: data.sampleRate,
        numberOfFrames: frameSize,
        numberOfChannels: data.numberOfChannels,
        timestamp: state.nextTimestamp,
        data: outputBuffer.buffer as ArrayBuffer,
      })
    );
  }
}
