/**
 * Retry logic module for transient failures
 * Implements exponential backoff for various operation types
 */
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
export declare const RETRY_CONFIGS: {
    readonly beadsCommand: {
        readonly maxAttempts: 3;
        readonly baseDelayMs: 100;
        readonly maxDelayMs: 1000;
        readonly backoffMultiplier: 2;
    };
    readonly evidenceValidation: {
        readonly maxAttempts: 2;
        readonly baseDelayMs: 500;
        readonly maxDelayMs: 2000;
        readonly backoffMultiplier: 2;
    };
    readonly gitOperation: {
        readonly maxAttempts: 3;
        readonly baseDelayMs: 200;
        readonly maxDelayMs: 1600;
        readonly backoffMultiplier: 2;
    };
};
/**
 * Retry an operation with exponential backoff
 */
export declare function withRetry<T>(operation: () => Promise<T>, config: RetryConfig, operationName: string): Promise<T>;
/**
 * Retry a Beads command operation
 */
export declare function retryBeadsCommand<T>(operation: () => Promise<T>, commandName: string): Promise<T>;
/**
 * Retry an evidence validation operation
 */
export declare function retryEvidenceValidation<T>(operation: () => Promise<T>, uri: string): Promise<T>;
/**
 * Retry a git operation
 */
export declare function retryGitOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T>;
//# sourceMappingURL=retry.d.ts.map