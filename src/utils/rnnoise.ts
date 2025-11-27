import { simd } from 'wasm-feature-detect';
import loadRnnoiseModule, * as rnnoise_wasm from './rnnoise_wasm';

interface RnnoiseOptions {
  assetsPath?: string;

  wasmFileName?: string;
}

class Rnnoise {
  private rnnoiseModule: rnnoise_wasm.RnnoiseModule;

  readonly frameSize: number;

  private constructor(rnnoiseModule: rnnoise_wasm.RnnoiseModule) {
    this.rnnoiseModule = rnnoiseModule;
    this.frameSize = rnnoiseModule._rnnoise_get_frame_size();
  }

  static async load(options: RnnoiseOptions = {}): Promise<Rnnoise> {
    const rnnoiseModule = await simd().then(async (isSupported) => {
      return Promise.resolve(
        await loadRnnoiseModule({
          locateFile: (path: string, prefix: string) => {
            console.log('@123 locatefile options', options);

            if (options.assetsPath !== undefined) {
              prefix = options.assetsPath + '/';
            }

            if (options.wasmFileName !== undefined) {
              path = options.wasmFileName;
              console.debug('Loads rnnoise-wasm: ', prefix + path);
            } else if (isSupported) {
              path = 'rnnoise_simd.wasm';
              console.debug('Loads rnnoise-wasm (SIMD ver): ', prefix + path);
            } else {
              console.debug(
                'Loads rnnoise-wasm (non SIMD ver): ',
                prefix + path
              );
            }

            return prefix + path;
          },
        })
      );
    });

    return Promise.resolve(new Rnnoise(rnnoiseModule));
  }

  createDenoiseState(): DenoiseState {
    return new DenoiseState(this.rnnoiseModule);
  }

  //   createDenoiseState(model?: Model): DenoiseState {
  //     return new DenoiseState(this.rnnoiseModule, model);
  //   }

  //   createModel(modelString: string): Model {
  //     return new Model(this.rnnoiseModule, modelString);
  //   }
}

const F32_BYTE_SIZE = 4;

class DenoiseState {
  private rnnoiseModule?: rnnoise_wasm.RnnoiseModule;

  private state: rnnoise_wasm.DenoiseState;

  private pcmInputBuf: rnnoise_wasm.F32Ptr;

  private pcmOutputBuf: rnnoise_wasm.F32Ptr;

  private frameSize: number;

  //   readonly model?: Model;

  //   constructor(rnnoiseModule: rnnoise_wasm.RnnoiseModule, model?: Model) {
  //     this.rnnoiseModule = rnnoiseModule;
  //     this.model = model;

  //     this.frameSize = this.rnnoiseModule._rnnoise_get_frame_size();
  //     let state;
  //     if (model !== undefined) {
  //       state = this.rnnoiseModule._rnnoise_create(model.model);
  //     } else {
  //       state = this.rnnoiseModule._rnnoise_create();
  //     }
  //     const pcmInputBuf = this.rnnoiseModule._malloc(
  //       this.frameSize * F32_BYTE_SIZE
  //     );
  //     const pcmOutputBuf = this.rnnoiseModule._malloc(
  //       this.frameSize * F32_BYTE_SIZE
  //     );
  //     if (!state || !pcmInputBuf || !pcmOutputBuf) {
  //       this.destroy();
  //       throw Error('Failed to allocate DenoiseState or PCM buffers.');
  //     }

  //     this.state = state;
  //     this.pcmInputBuf = pcmInputBuf;
  //     this.pcmOutputBuf = pcmOutputBuf;
  //   }

  //   constructor(rnnoiseModule: rnnoise_wasm.RnnoiseModule, model?: Model) {
  constructor(rnnoiseModule: rnnoise_wasm.RnnoiseModule) {
    this.rnnoiseModule = rnnoiseModule;
    // this.model = model;

    this.frameSize = this.rnnoiseModule._rnnoise_get_frame_size();
    const state = this.rnnoiseModule._rnnoise_create();

    const pcmInputBuf = this.rnnoiseModule._malloc(
      this.frameSize * F32_BYTE_SIZE
    );
    const pcmOutputBuf = this.rnnoiseModule._malloc(
      this.frameSize * F32_BYTE_SIZE
    );
    if (!state || !pcmInputBuf || !pcmOutputBuf) {
      this.destroy();
      throw Error('Failed to allocate DenoiseState or PCM buffers.');
    }

    this.state = state;
    this.pcmInputBuf = pcmInputBuf;
    this.pcmOutputBuf = pcmOutputBuf;
  }

  processFrame(frame: Float32Array): number {
    if (this.rnnoiseModule === undefined) {
      throw Error('This denoise state has already been destroyed.');
    }

    if (frame.length != this.frameSize) {
      throw Error(
        `Expected frame size ${this.frameSize}, but got ${frame.length}`
      );
    }

    const pcmInputIndex = this.pcmInputBuf / F32_BYTE_SIZE;
    const pcmOutputIndex = this.pcmOutputBuf / F32_BYTE_SIZE;

    this.rnnoiseModule.HEAPF32.set(frame, pcmInputIndex);
    const vad = this.rnnoiseModule._rnnoise_process_frame(
      this.state,
      this.pcmOutputBuf,
      this.pcmInputBuf
    );
    // console.log('//SHAHDEBUGS:processFrame VAD:', vad);
    frame.set(
      this.rnnoiseModule.HEAPF32.subarray(
        pcmOutputIndex,
        pcmOutputIndex + this.frameSize
      )
    );

    return vad;
  }

  destroy() {
    if (this.rnnoiseModule !== undefined) {
      this.rnnoiseModule._rnnoise_destroy(this.state);
      this.rnnoiseModule._free(this.pcmInputBuf);
      this.rnnoiseModule._free(this.pcmOutputBuf);
      this.rnnoiseModule = undefined;
    }
  }
}

// class Model {
//   private rnnoiseModule?: rnnoise_wasm.RnnoiseModule;

//   readonly model: rnnoise_wasm.RNNModel;

//   constructor(rnnoiseModule: rnnoise_wasm.RnnoiseModule, modelString: string) {
//     this.rnnoiseModule = rnnoiseModule;

//     const modelCString = new TextEncoder().encode(modelString + '\x00');
//     const modelCStringPtr = rnnoiseModule._malloc(modelCString.length);
//     rnnoiseModule.HEAPU8.subarray(
//       modelCStringPtr,
//       modelCStringPtr + modelCString.length
//     ).set(modelCString);
//     this.model = rnnoiseModule._rnnoise_model_from_string(modelCStringPtr);
//     rnnoiseModule._free(modelCStringPtr);

//     if (!this.model) {
//       throw Error('Failed to create Model from a given model string.');
//     }
//   }

//   free(): void {
//     if (this.rnnoiseModule !== undefined) {
//       this.rnnoiseModule._rnnoise_model_free(this.model);
//       this.rnnoiseModule = undefined;
//     }
//   }
// }

// export { DenoiseState, Model, Rnnoise, RnnoiseOptions };
export { DenoiseState, Rnnoise, RnnoiseOptions };
