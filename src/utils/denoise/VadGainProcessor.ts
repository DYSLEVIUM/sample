/**
 * VAD-based Gain Processor (Utility Class)
 * 
 * NOT a noise suppressor - this is a utility for smooth audio gating
 * based on Voice Activity Detection scores from a denoiser.
 * 
 * Used in conjunction with IAudioDenoiser implementations to provide
 * natural-sounding transitions between speech and silence.
 * 
 * @example
 * ```typescript
 * const denoiser = new RNNoiseProcessor({ assetsPath: '/' });
 * const vadGain = new VadGainProcessor();
 * 
 * await denoiser.initialize();
 * 
 * // Process audio
 * const vadScore = denoiser.processFrame(frame);
 * const gain = vadGain.computeGain(vadScore);
 * vadGain.applyGain(frame, gain);
 * ```
 */

import { clamp, lerp, softClip } from './math';
import type { VadGainConfig, VadGainState } from './types';

/**
 * Default VAD gain configuration
 * 
 * These values are tuned for natural-sounding speech:
 * - Slower attack/release to avoid harsh transitions
 * - Higher min gain to never fully mute
 * - Longer hangover for natural decay after speech
 */
export const DEFAULT_VAD_CONFIG: VadGainConfig = {
  vadSmoothingFactor: 0.08,   // Slower VAD smoothing (was 0.12)
  vadThreshold: 0.3,          // Slightly higher threshold (was 0.25)
  hangoverFrames: 45,         // Longer hangover period (was 30)
  minGateGain: 0.15,          // Higher minimum to never fully mute (was 0.03)
  attackSmoothing: 0.15,      // Slower attack for gentler onset (was 0.3)
  releaseSmoothing: 0.03,     // Slower release for smoother decay (was 0.02)
  hangoverFadeStart: 0.6,     // Start fading later in hangover (was 0.5)
};

/**
 * VAD-based gain control utility
 * 
 * Provides smooth gain transitions based on VAD scores:
 * 1. Smooths raw VAD values with asymmetric attack/release
 * 2. Applies hangover period after speech ends
 * 3. Gradually fades during hangover for natural decay
 * 4. Applies soft gating based on VAD probability
 */
export class VadGainProcessor {
  private config: VadGainConfig;
  private state: VadGainState;

  constructor(config: Partial<VadGainConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  private createInitialState(): VadGainState {
    return {
      smoothedVad: 0,
      hangoverFrames: 0,
      previousGain: 1,
      targetGain: 1,
    };
  }

  /**
   * Compute gain based on VAD score
   * @param vadScore - VAD score from denoiser (0-1)
   * @returns Computed gain value (0-1)
   */
  computeGain(vadScore: number): number {
    const { state, config } = this;

    // Asymmetric smoothing - faster attack, slower release
    const smoothingFactor = vadScore > state.smoothedVad
      ? config.attackSmoothing
      : config.vadSmoothingFactor;

    state.smoothedVad = lerp(state.smoothedVad, vadScore, smoothingFactor);

    // Update hangover counter
    if (state.smoothedVad > config.vadThreshold) {
      state.hangoverFrames = config.hangoverFrames;
    } else if (state.hangoverFrames > 0) {
      state.hangoverFrames--;
    }

    // Compute target gain
    state.targetGain = this.computeTargetGain();

    // Smooth gain transitions
    const gainSmoothing = state.targetGain > state.previousGain
      ? config.attackSmoothing
      : config.releaseSmoothing;

    const smoothedGain = lerp(state.previousGain, state.targetGain, gainSmoothing);
    state.previousGain = smoothedGain;

    return smoothedGain;
  }

  private computeTargetGain(): number {
    const { state, config } = this;

    // Active speech - full gain
    if (state.smoothedVad > config.vadThreshold) {
      return 1.0;
    }

    // Hangover period - gradual fade
    if (state.hangoverFrames > 0) {
      const progress = 1 - state.hangoverFrames / config.hangoverFrames;

      if (progress < config.hangoverFadeStart) {
        return 1.0;
      }

      const fadeProgress = (progress - config.hangoverFadeStart) / (1 - config.hangoverFadeStart);
      const easedFade = 1 - Math.pow(1 - fadeProgress, 3); // Ease-out cubic
      
      return 1.0 - easedFade * (1.0 - config.minGateGain * 2);
    }

    // No speech - soft gating
    const vadNormalized = clamp(state.smoothedVad / config.vadThreshold, 0, 1);
    const cubicFade = vadNormalized ** 3;
    
    return config.minGateGain + (1 - config.minGateGain) * cubicFade;
  }

  /**
   * Apply gain to audio buffer
   */
  applyGain(buffer: Float32Array, gain: number): void {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= gain;
    }
  }

  /**
   * Apply gain with linear interpolation (click-free)
   */
  applyGainInterpolated(buffer: Float32Array, startGain: number, endGain: number): void {
    const delta = (endGain - startGain) / buffer.length;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= startGain + delta * i;
    }
  }

  /**
   * Apply gain with original blending (preserves natural character)
   */
  applyGainWithBlend(
    output: Float32Array,
    original: Float32Array,
    startGain: number,
    endGain: number,
    blendRatio = 0.1
  ): void {
    const delta = (endGain - startGain) / output.length;
    
    for (let i = 0; i < output.length; i++) {
      const gain = startGain + delta * i;
      const blend = Math.max(0, 1 - gain) * blendRatio;
      output[i] = output[i] * gain + original[i] * blend * gain;
    }
  }

  /**
   * Apply soft clipping to prevent artifacts
   */
  applySoftClipping(buffer: Float32Array): void {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = softClip(buffer[i], 1.0);
    }
  }

  /**
   * Get current state (for debugging)
   */
  getState(): Readonly<VadGainState> {
    return { ...this.state };
  }

  /**
   * Get previous gain value
   */
  getPreviousGain(): number {
    return this.state.previousGain;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  /**
   * Update configuration
   */
  configure(config: Partial<VadGainConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
