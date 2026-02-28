/**
 * Evidence Validation Module
 *
 * Validates evidence references in memory entries according to Requirements 18.1-18.8.
 * Provides structure validation, type-specific URI validation, and periodic reachability checks.
 */
import { EvidenceReference } from './types';
/**
 * Validation result for a single evidence object
 */
export interface EvidenceValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Result of URI reachability check
 */
export interface URIReachabilityResult {
    reachable: boolean;
    error?: string;
}
/**
 * Report for evidence URI validation across all entries
 */
export interface EvidenceValidationReport {
    totalEntries: number;
    totalEvidence: number;
    staleEvidence: Array<{
        entryId: string;
        evidenceUri: string;
        error: string;
    }>;
    summary: {
        reachable: number;
        unreachable: number;
    };
}
/**
 * Validates evidence object structure and type-specific URI patterns.
 *
 * Requirements:
 * - 18.1: Validate evidence object contains type, uri, and note fields
 * - 18.2: Validate type="code" has git permalink or file path
 * - 18.3: Validate type="ticket" has ticket URL pattern
 * - 18.4: Validate type="doc" has valid URL or file path
 *
 * @param evidence - Evidence object to validate
 * @returns Validation result with errors if invalid
 */
export declare function validateEvidence(evidence: any): EvidenceValidationResult;
/**
 * Checks if an evidence URI is reachable.
 * For file paths, checks if the file exists.
 * For URLs, checks if the URL returns 200 status.
 *
 * Requirements:
 * - 18.5: Check file paths exist, URLs return 200
 *
 * @param uri - URI to check
 * @param workspaceRoot - Workspace root directory for resolving relative paths
 * @returns Reachability result
 */
export declare function checkEvidenceURIReachability(uri: string, workspaceRoot: string): Promise<URIReachabilityResult>;
/**
 * Validates evidence URIs for all entries in a project.
 * Checks reachability of file paths and URLs.
 *
 * Requirements:
 * - 18.6: Provide command to check all evidence URIs
 * - 18.7: Mark entries with stale evidence
 * - 18.8: Down-rank entries with unreachable evidence
 *
 * @param entries - Memory entries to validate
 * @param workspaceRoot - Workspace root directory
 * @returns Validation report with stale evidence
 */
export declare function validateEvidenceURIs(entries: Array<{
    id: string;
    evidence: EvidenceReference[];
}>, workspaceRoot: string): Promise<EvidenceValidationReport>;
//# sourceMappingURL=evidence-validation.d.ts.map