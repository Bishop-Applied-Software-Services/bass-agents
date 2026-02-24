/**
 * Logging module for durable memory system
 * Provides structured logging with levels and context
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  minLevel: LogLevel;
  component: string;
  enableConsole: boolean;
  enableFile?: boolean;
  filePath?: string;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  component: 'MemorySystem',
  enableConsole: true,
  enableFile: false,
};

/**
 * Logger class
 */
class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format a log entry
   */
  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}${contextStr}`;
  }

  /**
   * Write a log entry
   */
  private writeLog(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.config.component,
      message,
      context,
    };

    const formatted = this.formatLogEntry(entry);

    // Console output
    if (this.config.enableConsole) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.ERROR:
          console.error(formatted);
          break;
      }
    }

    // File output (if enabled)
    // Note: File logging would require fs module and async handling
    // For now, we'll keep it simple with console only
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  /**
   * Log at INFO level
   */
  info(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  /**
   * Log at WARN level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  /**
   * Log at ERROR level
   */
  error(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.ERROR, message, context);
  }

  /**
   * Log successful operation
   */
  logSuccess(operation: string, context?: Record<string, any>): void {
    this.info(`${operation} completed successfully`, context);
  }

  /**
   * Log validation failure
   */
  logValidationFailure(field: string, reason: string, context?: Record<string, any>): void {
    this.warn(`Validation failed for field: ${field}`, { reason, ...context });
  }

  /**
   * Log storage error
   */
  logStorageError(operation: string, error: string, context?: Record<string, any>): void {
    this.error(`Storage error during ${operation}`, { error, ...context });
  }

  /**
   * Log secret detection
   */
  logSecretDetection(location: string, context?: Record<string, any>): void {
    this.error(`Secret detected in ${location}`, context);
  }

  /**
   * Log query performance
   */
  logQueryPerformance(
    executionTimeMs: number,
    entriesScanned: number,
    entriesReturned: number,
    context?: Record<string, any>
  ): void {
    this.debug('Query performance', {
      executionTimeMs,
      entriesScanned,
      entriesReturned,
      ...context,
    });
  }

  /**
   * Create a child logger with a different component name
   */
  child(component: string): Logger {
    return new Logger({ ...this.config, component });
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  logger.configure(config);
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({ ...config, component });
}
