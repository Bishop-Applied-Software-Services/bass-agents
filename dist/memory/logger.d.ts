/**
 * Logging module for durable memory system
 * Provides structured logging with levels and context
 */
/**
 * Log levels
 */
export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}
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
 * Logger class
 */
declare class Logger {
    private config;
    constructor(config?: Partial<LoggerConfig>);
    /**
     * Update logger configuration
     */
    configure(config: Partial<LoggerConfig>): void;
    /**
     * Check if a log level should be logged
     */
    private shouldLog;
    /**
     * Format a log entry
     */
    private formatLogEntry;
    /**
     * Write a log entry
     */
    private writeLog;
    /**
     * Log at DEBUG level
     */
    debug(message: string, context?: Record<string, any>): void;
    /**
     * Log at INFO level
     */
    info(message: string, context?: Record<string, any>): void;
    /**
     * Log at WARN level
     */
    warn(message: string, context?: Record<string, any>): void;
    /**
     * Log at ERROR level
     */
    error(message: string, context?: Record<string, any>): void;
    /**
     * Log successful operation
     */
    logSuccess(operation: string, context?: Record<string, any>): void;
    /**
     * Log validation failure
     */
    logValidationFailure(field: string, reason: string, context?: Record<string, any>): void;
    /**
     * Log storage error
     */
    logStorageError(operation: string, error: string, context?: Record<string, any>): void;
    /**
     * Log secret detection
     */
    logSecretDetection(location: string, context?: Record<string, any>): void;
    /**
     * Log query performance
     */
    logQueryPerformance(executionTimeMs: number, entriesScanned: number, entriesReturned: number, context?: Record<string, any>): void;
    /**
     * Create a child logger with a different component name
     */
    child(component: string): Logger;
}
/**
 * Global logger instance
 */
export declare const logger: Logger;
/**
 * Configure the global logger
 */
export declare function configureLogger(config: Partial<LoggerConfig>): void;
/**
 * Create a logger for a specific component
 */
export declare function createLogger(component: string, config?: Partial<LoggerConfig>): Logger;
export {};
//# sourceMappingURL=logger.d.ts.map