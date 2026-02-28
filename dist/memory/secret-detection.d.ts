/**
 * Secret Detection Module
 *
 * Detects common secret patterns in memory entry content and evidence URIs
 * to prevent sensitive data from being stored in the memory system.
 *
 * Requirements: 13.1, 13.2, 13.4, 13.5, 13.9
 */
import { MemoryEntryInput } from './types.js';
/**
 * Result of secret detection
 */
export interface SecretDetectionResult {
    hasSecrets: boolean;
    errors: string[];
}
/**
 * Detect secrets in a memory entry
 *
 * Scans the content field and all evidence URIs for common secret patterns.
 * Returns descriptive errors WITHOUT logging the detected secrets.
 *
 * Requirements:
 * - 13.1: Reject Memory_Entry content containing detected secrets
 * - 13.2: Reject Memory_Entry evidence URIs containing detected secrets
 * - 13.4: Scan for common secret patterns
 * - 13.5: Return descriptive error when secrets detected
 * - 13.9: Validate evidence URIs don't expose credentials
 *
 * @param entry - Memory entry input to validate
 * @returns Detection result with all errors found
 */
export declare function detectSecrets(entry: MemoryEntryInput): SecretDetectionResult;
/**
 * Validate that a memory entry does not contain secrets
 *
 * This is a convenience function that throws an error if secrets are detected.
 *
 * @param entry - Memory entry input to validate
 * @throws Error if secrets are detected
 */
export declare function validateNoSecrets(entry: MemoryEntryInput): void;
//# sourceMappingURL=secret-detection.d.ts.map