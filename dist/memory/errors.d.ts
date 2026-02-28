/**
 * Error handling module for durable memory system
 * Defines error types, codes, and response formats
 */
/**
 * Error codes for memory operations
 */
export declare enum MemoryErrorCode {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    STORAGE_ERROR = "STORAGE_ERROR",
    SECRET_DETECTED = "SECRET_DETECTED",
    EVIDENCE_INVALID = "EVIDENCE_INVALID",
    QUERY_ERROR = "QUERY_ERROR",
    CONFLICT_ERROR = "CONFLICT_ERROR"
}
/**
 * Error details structure
 */
export interface MemoryErrorDetails {
    field?: string;
    constraint?: string;
    value?: string;
    [key: string]: any;
}
/**
 * Error response format
 */
export interface MemoryErrorResponse {
    success: false;
    error: {
        code: MemoryErrorCode;
        message: string;
        details?: MemoryErrorDetails;
    };
}
/**
 * Success response format
 */
export interface MemorySuccessResponse<T = any> {
    success: true;
    data: T;
}
/**
 * Combined response type
 */
export type MemoryResponse<T = any> = MemorySuccessResponse<T> | MemoryErrorResponse;
/**
 * Base error class for memory operations
 */
export declare class MemoryError extends Error {
    code: MemoryErrorCode;
    details?: MemoryErrorDetails | undefined;
    constructor(code: MemoryErrorCode, message: string, details?: MemoryErrorDetails | undefined);
    toResponse(): MemoryErrorResponse;
}
/**
 * Validation error
 */
export declare class ValidationError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Storage error
 */
export declare class StorageError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Secret detection error
 */
export declare class SecretDetectedError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Evidence validation error
 */
export declare class EvidenceInvalidError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Query error
 */
export declare class QueryError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Conflict error
 */
export declare class ConflictError extends MemoryError {
    constructor(message: string, details?: MemoryErrorDetails);
}
/**
 * Create a success response
 */
export declare function createSuccessResponse<T>(data: T): MemorySuccessResponse<T>;
/**
 * Create an error response
 */
export declare function createErrorResponse(code: MemoryErrorCode, message: string, details?: MemoryErrorDetails): MemoryErrorResponse;
/**
 * Check if a response is an error
 */
export declare function isErrorResponse(response: MemoryResponse): response is MemoryErrorResponse;
/**
 * Check if a response is successful
 */
export declare function isSuccessResponse<T>(response: MemoryResponse<T>): response is MemorySuccessResponse<T>;
//# sourceMappingURL=errors.d.ts.map