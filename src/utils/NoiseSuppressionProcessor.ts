/// <reference types="dom-mediacapture-transform" />
// import { type DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm';
import { type DenoiseState, Rnnoise } from './rnnoise';

interface NoiseSuppressionProcessorOptions {
  modelPath?: string;
}

class NoiseSuppressionProcessor {
  private static instance: NoiseSuppressionProcessor;
  static rnnoise: Rnnoise;

  private trackProcessor?: TrackProcessor;

  private processedTrack?: MediaStreamAudioTrack;

  private originalTrack?: MediaStreamAudioTrack;

  public static async build(
    assetsPath: string
  ): Promise<NoiseSuppressionProcessor> {
    console.log('@PUSHPA building NoiseSuppressionProcessor');

    if (!NoiseSuppressionProcessor.instance) {
      NoiseSuppressionProcessor.instance = new NoiseSuppressionProcessor();
       NoiseSuppressionProcessor.instance.load(assetsPath);
    }

    return NoiseSuppressionProcessor.instance;
  }

  private constructor() {}

  private async load(assetsPath: string) {
    assetsPath = trimLastSlash(assetsPath);
    await Rnnoise.load({
      // wasmFileName: 'rnnoise.wasm', // we are loading simd file
      assetsPath: assetsPath,
    }).then((rnnoise) => {
      console.log(
        '@PUSHPA NoiseSuppressionProcessor loaded with rnnoise module'
      );
      NoiseSuppressionProcessor.rnnoise = rnnoise;
    });
  }

  static isSupported(): boolean {
    return !(
      typeof MediaStreamTrackProcessor === 'undefined' ||
      typeof MediaStreamTrackGenerator === 'undefined'
    );
  }

  async startProcessing(
    track: MediaStreamAudioTrack
    // options: NoiseSuppressionProcessorOptions = {}
  ): Promise<MediaStreamAudioTrack> {
    if (this.isProcessing()) {
      throw Error('Noise suppression processing has already started.');
    }

    // let denoiseState: DenoiseState;
    // if (options.modelPath === undefined) {
    //   denoiseState = this.rnnoise.createDenoiseState();
    // } else {
    //   const modelString = await fetch(options.modelPath).then((res) =>
    //     res.text()
    //   );
    //   const model = this.rnnoise.createModel(modelString);
    //   denoiseState = this.rnnoise.createDenoiseState(model);
    // }

    this.trackProcessor = new TrackProcessor(track);
    this.originalTrack = track;
    this.processedTrack = this.trackProcessor.startProcessing();
    return this.processedTrack;
  }

  stopProcessing() {
    if (this.trackProcessor !== undefined) {
      this.trackProcessor.stopProcessing();
      this.trackProcessor = undefined;
      this.originalTrack = undefined;
      this.processedTrack = undefined;
    }
  }

  isProcessing(): boolean {
    return this.trackProcessor !== undefined;
  }

  getOriginalTrack(): MediaStreamAudioTrack | undefined {
    return this.originalTrack;
  }

  getProcessedTrack(): MediaStreamAudioTrack | undefined {
    return this.processedTrack;
  }
}

class TrackProcessor {
  private track: MediaStreamAudioTrack;

  private abortController: AbortController;

  private denoiseState?: DenoiseState;

  private inputBuffer: Float32Array;

  private originalBuffer: Float32Array; // Keep original for blending

  private outputBuffer: Float32Array;

  private bufferFrameCount: number;

  private nextTimestamp: number;

  private generator: MediaStreamAudioTrackGenerator;

  private processor: MediaStreamTrackProcessor<AudioData>;

  // VAD smoothing and hangover parameters
  private smoothedVad: number = 0;

  private vadHangoverFrames: number = 0;

  private previousGain: number = 1;

  // Constants for smooth transitions
  private static readonly VAD_SMOOTHING_FACTOR = 0.12; // Slower VAD response

  private static readonly VAD_THRESHOLD = 0.25; // Lower threshold for speech detection

  private static readonly HANGOVER_FRAMES = 30; // Keep gate open after speech ends (~600ms at 48kHz/480 frame)

  private static readonly MIN_GATE_GAIN = 0.03; // Don't fully mute, keep some residual

  private static readonly ATTACK_SMOOTHING = 0.3; // Faster attack for speech onset

  private static readonly RELEASE_SMOOTHING = 0.02; // Much slower release for natural decay

  private static readonly HANGOVER_FADE_START = 0.5; // Start fading at 40% through hangover

  // Scaling factor for RNNoise (expects int16 range as floats)
  private static readonly SCALE_FACTOR = 32767.0;

  private static readonly INV_SCALE_FACTOR = 1.0 / 32767.0;

  static defaultFrameSize = 480;

  constructor(track: MediaStreamAudioTrack) {
    this.track = track;
    const frameSize =
      NoiseSuppressionProcessor.rnnoise?.frameSize ||
      TrackProcessor.defaultFrameSize;

    this.inputBuffer = new Float32Array(frameSize);
    this.originalBuffer = new Float32Array(frameSize);
    this.outputBuffer = new Float32Array(frameSize);
    this.bufferFrameCount = 0;
    this.nextTimestamp = 0;
    this.abortController = new AbortController();
    this.denoiseState = NoiseSuppressionProcessor.rnnoise?.createDenoiseState();

    this.generator = new MediaStreamTrackGenerator({ kind: 'audio' });
    this.processor = new MediaStreamTrackProcessor({ track: this.track });
  }

  startProcessing(): MediaStreamAudioTrack {
    const signal = this.abortController.signal;
    this.processor.readable
      .pipeThrough(
        new TransformStream({
          transform: (frame, controller) => {
            this.transform(frame, controller);
          },
        }),
        { signal }
      )
      .pipeTo(this.generator.writable)
      .catch((e: Error) => {
        if (signal.aborted) {
          console.debug('Shutting down streams after abort.');
        } else {
          console.warn('Error from stream transform:', e);
        }
        this.processor.readable.cancel(e).catch((err: Error) => {
          console.warn('Failed to cancel `MediaStreamTrackProcessor`:', err);
        });
        this.generator.writable.abort(e).catch((err: Error) => {
          console.warn('Failed to abort `MediaStreamTrackGenerator`:', err);
        });
      });
    return this.generator;
  }

  stopProcessing() {
    this.abortController.abort();
    this.denoiseState?.destroy();
  }

  /**
   * Compute adaptive gain based on VAD with smooth attack/release
   */
  private computeAdaptiveGain(rawVad: number): number {
    // Smooth the raw VAD value with asymmetric attack/release
    const smoothingFactor =
      rawVad > this.smoothedVad
        ? TrackProcessor.ATTACK_SMOOTHING
        : TrackProcessor.VAD_SMOOTHING_FACTOR;

    this.smoothedVad =
      this.smoothedVad * (1 - smoothingFactor) + rawVad * smoothingFactor;

    // Update hangover counter
    if (this.smoothedVad > TrackProcessor.VAD_THRESHOLD) {
      this.vadHangoverFrames = TrackProcessor.HANGOVER_FRAMES;
    } else if (this.vadHangoverFrames > 0) {
      this.vadHangoverFrames--;
    }

    // Compute target gain with gradual hangover fade
    let targetGain: number;
    if (this.smoothedVad > TrackProcessor.VAD_THRESHOLD) {
      // Active speech - full gain
      targetGain = 1.0;
    } else if (this.vadHangoverFrames > 0) {
      // In hangover period - gradually fade using an ease-out curve
      const hangoverProgress =
        1 - this.vadHangoverFrames / TrackProcessor.HANGOVER_FRAMES;

      // Only start fading after HANGOVER_FADE_START (first 40% stays at full gain)
      if (hangoverProgress < TrackProcessor.HANGOVER_FADE_START) {
        targetGain = 1.0;
      } else {
        // Map remaining hangover to 0-1 range for fade
        const fadeProgress =
          (hangoverProgress - TrackProcessor.HANGOVER_FADE_START) /
          (1 - TrackProcessor.HANGOVER_FADE_START);
        // Use ease-out cubic curve for natural decay: 1 - (1-t)^3
        const easedFade = 1 - Math.pow(1 - fadeProgress, 3);
        targetGain =
          1.0 - easedFade * (1.0 - TrackProcessor.MIN_GATE_GAIN * 2);
      }
    } else {
      // No speech and hangover ended - apply soft gating based on VAD probability
      // Use a smooth curve to transition
      const vadNormalized = Math.max(
        0,
        this.smoothedVad / TrackProcessor.VAD_THRESHOLD
      );
      // Use cubic curve for smoother fade
      targetGain =
        TrackProcessor.MIN_GATE_GAIN +
        (1 - TrackProcessor.MIN_GATE_GAIN) *
          vadNormalized *
          vadNormalized *
          vadNormalized;
    }

    // Smooth gain transitions (asymmetric for natural sound)
    const gainSmoothing =
      targetGain > this.previousGain
        ? TrackProcessor.ATTACK_SMOOTHING
        : TrackProcessor.RELEASE_SMOOTHING;

    const smoothedGain =
      this.previousGain * (1 - gainSmoothing) + targetGain * gainSmoothing;
    this.previousGain = smoothedGain;

    return smoothedGain;
  }

  /**
   * Apply per-sample gain with linear interpolation for click-free transitions
   */
  private applyGainWithInterpolation(
    output: Float32Array,
    original: Float32Array,
    startGain: number,
    endGain: number
  ): void {
    const length = output.length;
    const gainDelta = (endGain - startGain) / length;

    for (let i = 0; i < length; i++) {
      const gain = startGain + gainDelta * i;
      // Blend between denoised and original based on gain
      // When gain is low, we slightly mix in original to preserve natural character
      const blendFactor = Math.max(0, 1 - gain) * 0.1; // 10% original at most when gating
      output[i] = output[i] * gain + original[i] * blendFactor * gain;
    }
  }

  private transform(
    data: AudioData,
    controller: TransformStreamDefaultController<AudioData>
  ): void {
    if (!NoiseSuppressionProcessor.rnnoise) {
      console.log('@PUSHPA no rnnoise, skipping noise suppression');
      controller.enqueue(data);
      data.close();
      return;
    }

    if (!this.denoiseState) {
      console.log('@PUSHPA creating denoise state');
      this.denoiseState =
        NoiseSuppressionProcessor.rnnoise.createDenoiseState();
    }

    if (data.numberOfChannels !== 1) {
      throw Error(
        'Noise suppression for stereo channel has not been supported yet.'
      );
    }
    if (data.format !== 'f32-planar') {
      throw Error(`Unsupported audio data format ${data.format}."`);
    }

    if (this.bufferFrameCount === 0) {
      this.nextTimestamp = data.timestamp;
    }

    const frameSize = NoiseSuppressionProcessor.rnnoise.frameSize;
    let frameOffset = 0;

    while (frameOffset < data.numberOfFrames) {
      const frameCount = Math.min(
        frameSize - this.bufferFrameCount,
        data.numberOfFrames - frameOffset
      );

      data.copyTo(this.inputBuffer.subarray(this.bufferFrameCount), {
        planeIndex: 0,
        frameOffset,
        frameCount,
      });

      // Also keep original for potential blending
      data.copyTo(this.originalBuffer.subarray(this.bufferFrameCount), {
        planeIndex: 0,
        frameOffset,
        frameCount,
      });

      this.bufferFrameCount += frameCount;
      frameOffset += frameCount;

      if (this.bufferFrameCount === frameSize) {
        // Scale to int16 range for RNNoise (using float math for precision)
        for (let i = 0; i < frameSize; i++) {
          this.outputBuffer[i] =
            this.inputBuffer[i] * TrackProcessor.SCALE_FACTOR;
        }

        // Process frame and get VAD probability (0-1)
        const rawVad = this.denoiseState.processFrame(this.outputBuffer);

        // Scale back to float range with proper precision
        for (let i = 0; i < frameSize; i++) {
          this.outputBuffer[i] =
            this.outputBuffer[i] * TrackProcessor.INV_SCALE_FACTOR;
          // Soft clipping to prevent harsh artifacts
          if (this.outputBuffer[i] > 1.0) {
            this.outputBuffer[i] = 1.0 - 1.0 / (1.0 + this.outputBuffer[i]);
          } else if (this.outputBuffer[i] < -1.0) {
            this.outputBuffer[i] = -1.0 + 1.0 / (1.0 - this.outputBuffer[i]);
          }
        }

        // Compute adaptive gain based on VAD
        const previousFrameGain = this.previousGain;
        const currentGain = this.computeAdaptiveGain(rawVad);

        // Apply gain with smooth interpolation
        this.applyGainWithInterpolation(
          this.outputBuffer,
          this.originalBuffer,
          previousFrameGain,
          currentGain
        );

        if (this.generator.readyState === 'ended') {
          this.stopProcessing();
          break;
        }

        controller.enqueue(
          new AudioData({
            format: data.format,
            sampleRate: data.sampleRate,
            numberOfFrames: frameSize,
            numberOfChannels: data.numberOfChannels,
            timestamp: this.nextTimestamp,
            data: this.outputBuffer.buffer as ArrayBuffer,
          })
        );

        // Reset buffer counter (reuse buffers instead of creating new ones)
        this.bufferFrameCount = 0;
        this.nextTimestamp =
          data.timestamp + (data.duration * frameOffset) / data.numberOfFrames;
      }
    }

    data.close();
  }
}

function trimLastSlash(s: string): string {
  if (s.slice(-1) === '/') {
    return s.slice(0, -1);
  }
  return s;
}

export { NoiseSuppressionProcessor, type NoiseSuppressionProcessorOptions };
