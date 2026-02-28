"use strict";
/**
 * Logging module for durable memory system
 * Provides structured logging with levels and context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
exports.configureLogger = configureLogger;
exports.createLogger = createLogger;
/**
 * Log levels
 */
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
};
/**
 * Default logger configuration
 */
const DEFAULT_CONFIG = {
    minLevel: LogLevel.INFO,
    component: 'MemorySystem',
    enableConsole: true,
    enableFile: false,
};
/**
 * Logger class
 */
class Logger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Update logger configuration
     */
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Check if a log level should be logged
     */
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
    }
    /**
     * Format a log entry
     */
    formatLogEntry(entry) {
        const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        return `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}${contextStr}`;
    }
    /**
     * Write a log entry
     */
    writeLog(level, message, context) {
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
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
    debug(message, context) {
        this.writeLog(LogLevel.DEBUG, message, context);
    }
    /**
     * Log at INFO level
     */
    info(message, context) {
        this.writeLog(LogLevel.INFO, message, context);
    }
    /**
     * Log at WARN level
     */
    warn(message, context) {
        this.writeLog(LogLevel.WARN, message, context);
    }
    /**
     * Log at ERROR level
     */
    error(message, context) {
        this.writeLog(LogLevel.ERROR, message, context);
    }
    /**
     * Log successful operation
     */
    logSuccess(operation, context) {
        this.info(`${operation} completed successfully`, context);
    }
    /**
     * Log validation failure
     */
    logValidationFailure(field, reason, context) {
        this.warn(`Validation failed for field: ${field}`, { reason, ...context });
    }
    /**
     * Log storage error
     */
    logStorageError(operation, error, context) {
        this.error(`Storage error during ${operation}`, { error, ...context });
    }
    /**
     * Log secret detection
     */
    logSecretDetection(location, context) {
        this.error(`Secret detected in ${location}`, context);
    }
    /**
     * Log query performance
     */
    logQueryPerformance(executionTimeMs, entriesScanned, entriesReturned, context) {
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
    child(component) {
        return new Logger({ ...this.config, component });
    }
}
/**
 * Global logger instance
 */
exports.logger = new Logger();
/**
 * Configure the global logger
 */
function configureLogger(config) {
    exports.logger.configure(config);
}
/**
 * Create a logger for a specific component
 */
function createLogger(component, config) {
    return new Logger({ ...config, component });
}
//# sourceMappingURL=logger.js.map