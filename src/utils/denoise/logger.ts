/**
 * Noise Suppression Logger Utility
 * 
 * Provides structured logging with different log levels for debugging
 * noise suppression processors.
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5,
}

export interface LogContext {
  processor?: string;
  component?: string;
  trackId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

type LogMethod = (message: string, context?: LogContext, ...args: unknown[]) => void;

export interface IDenoiseLogger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  createChild(context: LogContext): IDenoiseLogger;
}

/**
 * Default logger implementation with structured logging support
 */
class DenoiseLogger implements IDenoiseLogger {
  private level: LogLevel;
  private readonly context: LogContext;
  private readonly prefix: string;

  constructor(level: LogLevel = LogLevel.INFO, context: LogContext = {}) {
    this.level = level;
    this.context = context;
    this.prefix = '[Denoise]';
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const mergedContext = { ...this.context, ...context };
    const contextStr = Object.keys(mergedContext).length > 0
      ? ` ${JSON.stringify(mergedContext)}`
      : '';
    const timestamp = new Date().toISOString();
    return `${timestamp} ${this.prefix}[${level}]${contextStr} ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  trace(message: string, context?: LogContext, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.trace(this.formatMessage('TRACE', message, context), ...args);
    }
  }

  debug(message: string, context?: LogContext, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, context), ...args);
    }
  }

  info(message: string, context?: LogContext, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, context), ...args);
    }
  }

  warn(message: string, context?: LogContext, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context), ...args);
    }
  }

  error(message: string, context?: LogContext, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  createChild(context: LogContext): IDenoiseLogger {
    return new DenoiseLogger(this.level, { ...this.context, ...context });
  }
}

// Singleton logger instance
let globalLogger: IDenoiseLogger = new DenoiseLogger();

/**
 * Get the global denoise logger instance
 */
export function getDenoiseLogger(): IDenoiseLogger {
  return globalLogger;
}

/**
 * Set the global denoise logger instance
 */
export function setDenoiseLogger(logger: IDenoiseLogger): void {
  globalLogger = logger;
}

/**
 * Set the global log level for denoise module
 */
export function setDenoiseLogLevel(level: LogLevel): void {
  globalLogger.setLevel(level);
}

/**
 * Create a child logger with additional context
 */
export function createDenoiseLogger(context: LogContext): IDenoiseLogger {
  return globalLogger.createChild(context);
}

export { DenoiseLogger };

