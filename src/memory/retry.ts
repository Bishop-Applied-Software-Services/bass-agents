/**
 * Retry logic module for transient failures
 * Implements exponential backoff for various operation types
 */

import { StorageError } from './errors.js';
import { logger } from './logger.js';

/**
 * Retry configuration for different operation types
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Default retry configurations for different operation types
 */
export const RETRY_CONFIGS = {
  beadsCommand: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  },
  evidenceValidation: {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
  },
  gitOperation: {
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 1600,
    backoffMultiplier: 2,
  },
} as const;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  backoffMultiplier: number,
  maxDelayMs?: number
): number {
  const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  return maxDelayMs ? Math.min(delay, maxDelayMs) : delay;
}

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP errors that are typically transient
  if (error.statusCode === 429 || error.statusCode === 503 || error.statusCode === 504) {
    return true;
  }

  // Git lock errors
  if (error.message?.includes('index.lock') || error.message?.includes('unable to create')) {
    return true;
  }

  // Beads temporary errors
  if (error.message?.includes('temporary') || error.message?.includes('busy')) {
    return true;
  }

  return false;
}

/**
 * Retry an operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  operationName: string
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if not first attempt
      if (attempt > 1) {
        logger.info(`${operationName} succeeded on attempt ${attempt}/${config.maxAttempts}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is transient
      const isTransient = isTransientError(error);

      // Log the failure
      if (attempt < config.maxAttempts && isTransient) {
        const delay = calculateDelay(
          attempt,
          config.baseDelayMs,
          config.backoffMultiplier ?? 2,
          config.maxDelayMs
        );
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(
          `${operationName} failed on attempt ${attempt}/${config.maxAttempts}, retrying in ${delay}ms`,
          { error: errorMessage, isTransient }
        );

        // Wait before retrying
        await sleep(delay);
      } else if (!isTransient) {
        // Non-transient error, don't retry
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${operationName} failed with non-transient error, not retrying`, {
          error: errorMessage,
          attempt,
        });
        throw error;
      } else {
        // Max attempts reached
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          `${operationName} failed after ${config.maxAttempts} attempts`,
          { error: errorMessage }
        );
        throw new StorageError(
          `${operationName} failed after ${config.maxAttempts} attempts: ${errorMessage}`,
          { originalError: errorMessage, attempts: config.maxAttempts }
        );
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Retry a Beads command operation
 */
export async function retryBeadsCommand<T>(
  operation: () => Promise<T>,
  commandName: string
): Promise<T> {
  return withRetry(operation, RETRY_CONFIGS.beadsCommand, `Beads command: ${commandName}`);
}

/**
 * Retry an evidence validation operation
 */
export async function retryEvidenceValidation<T>(
  operation: () => Promise<T>,
  uri: string
): Promise<T> {
  return withRetry(operation, RETRY_CONFIGS.evidenceValidation, `Evidence validation: ${uri}`);
}

/**
 * Retry a git operation
 */
export async function retryGitOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, RETRY_CONFIGS.gitOperation, `Git operation: ${operationName}`);
}
