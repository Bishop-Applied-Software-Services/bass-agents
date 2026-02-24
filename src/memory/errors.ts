/**
 * Error handling module for durable memory system
 * Defines error types, codes, and response formats
 */

/**
 * Error codes for memory operations
 */
export enum MemoryErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  SECRET_DETECTED = 'SECRET_DETECTED',
  EVIDENCE_INVALID = 'EVIDENCE_INVALID',
  QUERY_ERROR = 'QUERY_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
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
export class MemoryError extends Error {
  constructor(
    public code: MemoryErrorCode,
    message: string,
    public details?: MemoryErrorDetails
  ) {
    super(message);
    this.name = 'MemoryError';
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): MemoryErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.VALIDATION_ERROR, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Storage error
 */
export class StorageError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.STORAGE_ERROR, message, details);
    this.name = 'StorageError';
  }
}

/**
 * Secret detection error
 */
export class SecretDetectedError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.SECRET_DETECTED, message, details);
    this.name = 'SecretDetectedError';
  }
}

/**
 * Evidence validation error
 */
export class EvidenceInvalidError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.EVIDENCE_INVALID, message, details);
    this.name = 'EvidenceInvalidError';
  }
}

/**
 * Query error
 */
export class QueryError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.QUERY_ERROR, message, details);
    this.name = 'QueryError';
  }
}

/**
 * Conflict error
 */
export class ConflictError extends MemoryError {
  constructor(message: string, details?: MemoryErrorDetails) {
    super(MemoryErrorCode.CONFLICT_ERROR, message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(data: T): MemorySuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  code: MemoryErrorCode,
  message: string,
  details?: MemoryErrorDetails
): MemoryErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Check if a response is an error
 */
export function isErrorResponse(response: MemoryResponse): response is MemoryErrorResponse {
  return response.success === false;
}

/**
 * Check if a response is successful
 */
export function isSuccessResponse<T>(response: MemoryResponse<T>): response is MemorySuccessResponse<T> {
  return response.success === true;
}
