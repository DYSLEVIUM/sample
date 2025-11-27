import type { E2EEOptions } from './e2ee/types';
import type { ReconnectPolicy } from './room/ReconnectPolicy';
import type {
  AudioCaptureOptions,
  AudioOutputOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from './room/track/options';
import type { AdaptiveStreamSettings } from './room/track/types';
import { AudioTrackDenoiser, DenoiserType } from './utils/denoise';

export interface WebAudioSettings {
  audioContext: AudioContext;
}

/**
 * @internal
 */
export interface InternalRoomOptions {
  /**
   * AdaptiveStream lets LiveKit automatically manage quality of subscribed
   * video tracks to optimize for bandwidth and CPU.
   * When attached video elements are visible, it'll choose an appropriate
   * resolution based on the size of largest video element it's attached to.
   *
   * When none of the video elements are visible, it'll temporarily pause
   * the data flow until they are visible again.
   */
  adaptiveStream: AdaptiveStreamSettings | boolean;

  /**
   * enable Dynacast, off by default. With Dynacast dynamically pauses
   * video layers that are not being consumed by any subscribers, significantly
   * reducing publishing CPU and bandwidth usage.
   *
   * Dynacast will be enabled if SVC codecs (VP9/AV1) are used. Multi-codec simulcast
   * requires dynacast
   */
  dynacast: boolean;

  /**
   * default options to use when capturing user's audio
   */
  audioCaptureDefaults?: AudioCaptureOptions;

  /**
   * default options to use when capturing user's video
   */
  videoCaptureDefaults?: VideoCaptureOptions;

  /**
   * default options to use when publishing tracks
   */
  publishDefaults?: TrackPublishDefaults;

  /**
   * audio output for the room
   */
  audioOutput?: AudioOutputOptions;

  /**
   * should local tracks be stopped when they are unpublished. defaults to true
   * set this to false if you would prefer to clean up unpublished local tracks manually.
   */
  stopLocalTrackOnUnpublish: boolean;

  /**
   * policy to use when attempting to reconnect
   */
  reconnectPolicy: ReconnectPolicy;

  /**
   * specifies whether the sdk should automatically disconnect the room
   * on 'pagehide' and 'beforeunload' events
   */
  disconnectOnPageLeave: boolean;

  /**
   * @internal
   * experimental flag, introduce a delay before sending signaling messages
   */
  expSignalLatency?: number;

  /**
   * mix all audio tracks in web audio, helps to tackle some audio auto playback issues
   * allows for passing in your own AudioContext instance, too
   */

  webAudioMix: boolean | WebAudioSettings;

  /**
   * @experimental
   */
  e2ee?: E2EEOptions;

  loggerName?: string;
}

/**
 * Options for when creating a new room
 */
export interface RoomOptions extends Partial<InternalRoomOptions> { }

/**
 * @internal
 */
export interface InternalRoomConnectOptions {
  /** autosubscribe to room tracks after joining, defaults to true */
  autoSubscribe: boolean;

  /** amount of time for PeerConnection to be established, defaults to 15s */
  peerConnectionTimeout: number;

  /**
   * use to override any RTCConfiguration options.
   */
  rtcConfig?: RTCConfiguration;

  /** specifies how often an initial join connection is allowed to retry (only applicable if server is not reachable) */
  maxRetries: number;

  /** amount of time for Websocket connection to be established, defaults to 15s */
  websocketTimeout: number;
}

/**
 * Options for Room.connect()
 */
export interface RoomConnectOptions
  extends Partial<InternalRoomConnectOptions> { }

/**
 * Runtime loader for lazy-loaded modules
 */
export class RuntimeLoader {
  static AudioTrackDenoiser: AudioTrackDenoiser | null = null;

  /**
   * Load runtime modules (noise suppression, etc.)
   * 
   * @param assetsPath - Base path for WASM assets
   * @param denoiserType - Which denoiser to use (default: DEEP_FILTER_NET)
   * @param debug - Enable debug logging
   */
  static async load(
    assetsPath?: string, 
    denoiserType: DenoiserType = DenoiserType.DEEP_FILTER_NET,
    debug = false
  ): Promise<void> {
    console.debug('[RuntimeLoader] Loading runtime modules...', "assetPath", assetsPath, "denoiserType", denoiserType);
    
    // Set default assets path based on denoiser type
    // Use relative paths to support subdirectory deployments (e.g., GitHub Pages)
    const defaultPath = denoiserType === DenoiserType.RNNOISE ? './rnnoise/' : './deepfilternet/';
    const effectivePath = assetsPath ?? defaultPath;
    
    try {
      this.AudioTrackDenoiser = await AudioTrackDenoiser.create({
        assetsPath: effectivePath,
        denoiserType,
        debug,
      });
      console.debug(`[RuntimeLoader] AudioTrackDenoiser (${denoiserType}) loaded successfully`);
    } catch (error) {
      console.error('[RuntimeLoader] Failed to load AudioTrackDenoiser:', error);
      this.AudioTrackDenoiser = null;
    }
  }

  /**
   * Get the audio track denoiser, loading if necessary
   * 
   * @param assetsPath - Base path for WASM assets
   * @param denoiserType - Which denoiser to use
   */
  static async getAudioTrackDenoiser(
    assetsPath?: string,
    denoiserType: DenoiserType = DenoiserType.DEEP_FILTER_NET
  ): Promise<AudioTrackDenoiser | null> {
    if (!this.AudioTrackDenoiser) {
      await this.load(assetsPath, denoiserType);
    }
    return this.AudioTrackDenoiser;
  }

  /**
   * Reset the denoiser (allows switching denoiser type)
   */
  static reset(): void {
    if (this.AudioTrackDenoiser) {
      AudioTrackDenoiser.reset();
      this.AudioTrackDenoiser = null;
    }
  }
}
