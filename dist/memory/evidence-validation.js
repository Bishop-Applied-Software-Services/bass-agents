"use strict";
/**
 * Evidence Validation Module
 *
 * Validates evidence references in memory entries according to Requirements 18.1-18.8.
 * Provides structure validation, type-specific URI validation, and periodic reachability checks.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEvidence = validateEvidence;
exports.checkEvidenceURIReachability = checkEvidenceURIReachability;
exports.validateEvidenceURIs = validateEvidenceURIs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
function validateEvidence(evidence) {
    const errors = [];
    // Requirement 18.1: Validate required fields
    if (!evidence || typeof evidence !== 'object') {
        return { valid: false, errors: ['Evidence must be an object'] };
    }
    if (!evidence.type) {
        errors.push('Evidence missing required field: type');
    }
    if (!evidence.uri) {
        errors.push('Evidence missing required field: uri');
    }
    if (!evidence.note) {
        errors.push('Evidence missing required field: note');
    }
    // If required fields are missing, return early
    if (errors.length > 0) {
        return { valid: false, errors };
    }
    // Validate type is one of the allowed values
    const validTypes = ['code', 'artifact', 'log', 'screenshot', 'assumption', 'ticket', 'doc'];
    if (!validTypes.includes(evidence.type)) {
        errors.push(`Invalid evidence type: ${evidence.type}. Must be one of: ${validTypes.join(', ')}`);
    }
    // Type-specific URI validation
    switch (evidence.type) {
        case 'code':
            // Requirement 18.2: code requires git permalink or file path
            if (!isGitPermalink(evidence.uri) && !isFilePath(evidence.uri)) {
                errors.push('Evidence type "code" requires a git permalink or file path');
            }
            break;
        case 'ticket':
            // Requirement 18.3: ticket requires URL pattern
            if (!isTicketURL(evidence.uri)) {
                errors.push('Evidence type "ticket" requires a valid ticket URL');
            }
            break;
        case 'doc':
            // Requirement 18.4: doc requires URL or file path
            if (!isURL(evidence.uri) && !isFilePath(evidence.uri)) {
                errors.push('Evidence type "doc" requires a valid URL or file path');
            }
            break;
        case 'artifact':
            // artifact: file path or URL
            if (!isFilePath(evidence.uri) && !isURL(evidence.uri)) {
                errors.push('Evidence type "artifact" requires a file path or URL');
            }
            break;
        case 'log':
            // log: file path or URL
            if (!isFilePath(evidence.uri) && !isURL(evidence.uri)) {
                errors.push('Evidence type "log" requires a file path or URL');
            }
            break;
        case 'screenshot':
            // screenshot: file path or URL
            if (!isFilePath(evidence.uri) && !isURL(evidence.uri)) {
                errors.push('Evidence type "screenshot" requires a file path or URL');
            }
            break;
        case 'assumption':
            // assumption: no URI validation needed
            break;
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
/**
 * Checks if a URI is a git permalink.
 * Git permalinks typically follow patterns like:
 * - https://github.com/org/repo/blob/commit-hash/path/to/file.ts#L10-L20
 * - https://gitlab.com/org/repo/-/blob/commit-hash/path/to/file.ts#L10-L20
 *
 * @param uri - URI to check
 * @returns True if URI matches git permalink pattern
 */
function isGitPermalink(uri) {
    // Match GitHub, GitLab, Bitbucket permalink patterns
    const gitPermalinkPattern = /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^\/]+\/[^\/]+\/(blob|-\/blob)\/[a-f0-9]{7,40}\//;
    return gitPermalinkPattern.test(uri);
}
/**
 * Checks if a URI is a file path (relative or absolute).
 *
 * @param uri - URI to check
 * @returns True if URI looks like a file path
 */
function isFilePath(uri) {
    // File paths don't start with protocol schemes
    if (/^[a-z]+:\/\//i.test(uri)) {
        return false;
    }
    // Check for common file path patterns
    // Relative: ./path, ../path, path/to/file
    // Absolute: /path/to/file, C:\path\to\file
    return /^(\.{0,2}\/|\/|[a-zA-Z]:\\)/.test(uri) || !uri.includes('://');
}
/**
 * Checks if a URI is a valid URL.
 *
 * @param uri - URI to check
 * @returns True if URI is a valid URL
 */
function isURL(uri) {
    try {
        const url = new URL(uri);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
/**
 * Checks if a URI matches a ticket URL pattern.
 * Common ticket systems: GitHub Issues, GitLab Issues, Jira, Linear, etc.
 *
 * @param uri - URI to check
 * @returns True if URI matches ticket URL pattern
 */
function isTicketURL(uri) {
    if (!isURL(uri)) {
        return false;
    }
    // Match common ticket URL patterns
    const ticketPatterns = [
        /github\.com\/[^\/]+\/[^\/]+\/issues\/\d+/, // GitHub Issues
        /gitlab\.com\/[^\/]+\/[^\/]+\/-\/issues\/\d+/, // GitLab Issues
        /[^\/]+\.atlassian\.net\/browse\/[A-Z]+-\d+/, // Jira
        /linear\.app\/[^\/]+\/issue\/[A-Z]+-\d+/, // Linear
        /[^\/]+\.zendesk\.com\/agent\/tickets\/\d+/, // Zendesk
    ];
    return ticketPatterns.some(pattern => pattern.test(uri));
}
/**
 * Checks if a file path exists on the filesystem.
 *
 * @param filePath - File path to check
 * @param workspaceRoot - Workspace root directory for resolving relative paths
 * @returns Reachability result
 */
async function checkFileExists(filePath, workspaceRoot) {
    try {
        // Resolve relative paths against workspace root
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspaceRoot, filePath);
        await fs.promises.access(absolutePath, fs.constants.F_OK);
        return { reachable: true };
    }
    catch (error) {
        return {
            reachable: false,
            error: `File not found: ${filePath}`
        };
    }
}
/**
 * Checks if a URL is reachable (returns 200 status).
 *
 * @param url - URL to check
 * @returns Reachability result
 */
async function checkURLReachable(url) {
    try {
        // Use fetch with HEAD request to check reachability without downloading content
        const response = await fetch(url, {
            method: 'HEAD',
            // Set a reasonable timeout
            signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
            return { reachable: true };
        }
        else {
            return {
                reachable: false,
                error: `URL returned status ${response.status}: ${url}`
            };
        }
    }
    catch (error) {
        return {
            reachable: false,
            error: `URL unreachable: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
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
async function checkEvidenceURIReachability(uri, workspaceRoot) {
    if (isURL(uri)) {
        return checkURLReachable(uri);
    }
    else if (isFilePath(uri)) {
        return checkFileExists(uri, workspaceRoot);
    }
    else {
        return {
            reachable: false,
            error: 'URI is neither a valid URL nor a file path'
        };
    }
}
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
async function validateEvidenceURIs(entries, workspaceRoot) {
    const staleEvidence = [];
    let totalEvidence = 0;
    let reachableCount = 0;
    let unreachableCount = 0;
    for (const entry of entries) {
        for (const evidence of entry.evidence) {
            totalEvidence++;
            // Skip assumption type - no URI validation needed
            if (evidence.type === 'assumption') {
                reachableCount++;
                continue;
            }
            const result = await checkEvidenceURIReachability(evidence.uri, workspaceRoot);
            if (result.reachable) {
                reachableCount++;
            }
            else {
                unreachableCount++;
                staleEvidence.push({
                    entryId: entry.id,
                    evidenceUri: evidence.uri,
                    error: result.error || 'Unknown error'
                });
            }
        }
    }
    return {
        totalEntries: entries.length,
        totalEvidence,
        staleEvidence,
        summary: {
            reachable: reachableCount,
            unreachable: unreachableCount
        }
    };
}
//# sourceMappingURL=evidence-validation.js.map