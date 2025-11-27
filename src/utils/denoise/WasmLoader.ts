/**
 * WASM Module Loader
 * 
 * Implements lazy loading pattern for WebAssembly modules.
 * Ensures modules are loaded only when needed and provides
 * caching to avoid redundant loading.
 */

import { getDenoiseLogger } from './logger';
import { LoadStatus, type IWasmLoader } from './types';

/**
 * Generic WASM module loader with lazy loading support
 */
export class WasmLoader<T = unknown> implements IWasmLoader<T> {
  private _status: LoadStatus = LoadStatus.NOT_LOADED;
  private _module: T | null = null;
  private _loadPromise: Promise<T> | null = null;
  private readonly logger = getDenoiseLogger().createChild({ component: 'WasmLoader' });
  private readonly loadFn: () => Promise<T>;
  private readonly moduleName: string;

  constructor(loadFn: () => Promise<T>, moduleName: string) {
    this.loadFn = loadFn;
    this.moduleName = moduleName;
  }

  get status(): LoadStatus {
    return this._status;
  }

  async load(): Promise<T> {
    // Return cached module if already loaded
    if (this._status === LoadStatus.LOADED && this._module !== null) {
      this.logger.debug(`${this.moduleName}: Returning cached module`);
      return this._module;
    }

    // Return existing promise if currently loading
    if (this._status === LoadStatus.LOADING && this._loadPromise !== null) {
      this.logger.debug(`${this.moduleName}: Waiting for existing load operation`);
      return this._loadPromise;
    }

    // Start new load operation
    this._status = LoadStatus.LOADING;
    this.logger.info(`${this.moduleName}: Starting load operation`);
    const startTime = performance.now();

    this._loadPromise = this.loadFn()
      .then((module) => {
        this._module = module;
        this._status = LoadStatus.LOADED;
        const duration = (performance.now() - startTime).toFixed(2);
        this.logger.info(`${this.moduleName}: Loaded successfully in ${duration}ms`);
        return module;
      })
      .catch((error) => {
        this._status = LoadStatus.ERROR;
        this._module = null;
        this.logger.error(`${this.moduleName}: Load failed`, undefined, error);
        throw error;
      });

    return this._loadPromise;
  }

  getModule(): T {
    if (this._status !== LoadStatus.LOADED || this._module === null) {
      throw new Error(`${this.moduleName} module not loaded. Call load() first.`);
    }
    return this._module;
  }

  isReady(): boolean {
    return this._status === LoadStatus.LOADED && this._module !== null;
  }

  reset(): void {
    this._status = LoadStatus.NOT_LOADED;
    this._module = null;
    this._loadPromise = null;
    this.logger.debug(`${this.moduleName}: Loader reset`);
  }
}

/**
 * Create a lazy-loaded WASM module
 */
export function createWasmLoader<T>(
  loadFn: () => Promise<T>,
  moduleName: string
): IWasmLoader<T> {
  return new WasmLoader(loadFn, moduleName);
}

