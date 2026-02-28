/**
 * Memory Entry Validation Module
 *
 * Validates Memory_Entry fields against schema constraints and business rules.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.7, 5.8, 5.9, 9.7, 19.1
 */
import { MemoryEntryInput } from './types';
/**
 * Validation result containing success status and error messages
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validates a Memory_Entry input against all schema constraints and business rules
 *
 * @param entry - The memory entry input to validate
 * @returns ValidationResult with valid flag and error/warning messages
 */
export declare function validateMemoryEntry(entry: MemoryEntryInput): ValidationResult;
/**
 * Validates that a string is a valid ISO 8601 timestamp
 *
 * @param timestamp - The timestamp string to validate
 * @returns true if valid, false otherwise
 */
export declare function isValidISO8601(timestamp: string): boolean;
/**
 * Validates that a scope string matches the required pattern
 *
 * @param scope - The scope string to validate
 * @returns true if valid, false otherwise
 */
export declare function isValidScope(scope: string): boolean;
//# sourceMappingURL=validation.d.ts.map