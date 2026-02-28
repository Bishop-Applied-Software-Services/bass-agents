"use strict";
/**
 * Error handling module for durable memory system
 * Defines error types, codes, and response formats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = exports.QueryError = exports.EvidenceInvalidError = exports.SecretDetectedError = exports.StorageError = exports.ValidationError = exports.MemoryError = exports.MemoryErrorCode = void 0;
exports.createSuccessResponse = createSuccessResponse;
exports.createErrorResponse = createErrorResponse;
exports.isErrorResponse = isErrorResponse;
exports.isSuccessResponse = isSuccessResponse;
/**
 * Error codes for memory operations
 */
var MemoryErrorCode;
(function (MemoryErrorCode) {
    MemoryErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    MemoryErrorCode["STORAGE_ERROR"] = "STORAGE_ERROR";
    MemoryErrorCode["SECRET_DETECTED"] = "SECRET_DETECTED";
    MemoryErrorCode["EVIDENCE_INVALID"] = "EVIDENCE_INVALID";
    MemoryErrorCode["QUERY_ERROR"] = "QUERY_ERROR";
    MemoryErrorCode["CONFLICT_ERROR"] = "CONFLICT_ERROR";
})(MemoryErrorCode || (exports.MemoryErrorCode = MemoryErrorCode = {}));
/**
 * Base error class for memory operations
 */
class MemoryError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'MemoryError';
        Error.captureStackTrace(this, this.constructor);
    }
    toResponse() {
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
exports.MemoryError = MemoryError;
/**
 * Validation error
 */
class ValidationError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.VALIDATION_ERROR, message, details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
/**
 * Storage error
 */
class StorageError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.STORAGE_ERROR, message, details);
        this.name = 'StorageError';
    }
}
exports.StorageError = StorageError;
/**
 * Secret detection error
 */
class SecretDetectedError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.SECRET_DETECTED, message, details);
        this.name = 'SecretDetectedError';
    }
}
exports.SecretDetectedError = SecretDetectedError;
/**
 * Evidence validation error
 */
class EvidenceInvalidError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.EVIDENCE_INVALID, message, details);
        this.name = 'EvidenceInvalidError';
    }
}
exports.EvidenceInvalidError = EvidenceInvalidError;
/**
 * Query error
 */
class QueryError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.QUERY_ERROR, message, details);
        this.name = 'QueryError';
    }
}
exports.QueryError = QueryError;
/**
 * Conflict error
 */
class ConflictError extends MemoryError {
    constructor(message, details) {
        super(MemoryErrorCode.CONFLICT_ERROR, message, details);
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
/**
 * Create a success response
 */
function createSuccessResponse(data) {
    return {
        success: true,
        data,
    };
}
/**
 * Create an error response
 */
function createErrorResponse(code, message, details) {
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
function isErrorResponse(response) {
    return response.success === false;
}
/**
 * Check if a response is successful
 */
function isSuccessResponse(response) {
    return response.success === true;
}
//# sourceMappingURL=errors.js.map