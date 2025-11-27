// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare namespace RuntimeExports {
    let HEAPF32: any;
}
interface WasmModule {
  _rnnoise_get_frame_size(): number;
  _rnnoise_create(_0: number): number;
  _rnnoise_destroy(_0: number): void;
  _rnnoise_process_frame(_0: number, _1: number, _2: number): number;
  _malloc(_0: number): number;
  _free(_0: number): void;
}

export type MainModule = WasmModule & typeof RuntimeExports;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;
