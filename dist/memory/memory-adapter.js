"use strict";
/**
 * Memory Adapter
 *
 * Core business logic for memory operations using Beads directly.
 * Translates between Memory_Entry JSON and Beads storage using direct bd commands.
 *
 * Requirements: 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.10, 7.5, 7.11, 7.12, 16.6
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
exports.MemoryAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const validation_1 = require("./validation");
const secret_detection_1 = require("./secret-detection");
const query_logger_1 = require("./query-logger");
const statistics_1 = require("./statistics");
const logger_1 = require("./logger");
const statistics_cache_1 = require("./statistics-cache");
/**
 * MemoryAdapter provides the core API for memory operations
 */
class MemoryAdapter {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
     * Initialize memory storage for a project.
     * Creates ai-memory/{project}/ directory and initializes Beads repository.
     *
     * Requirements:
     * - 2.2: Store Project_Memory at ai-memory/{project-name}/
     * - 2.3: Store Global_Memory at ai-memory/global/
     * - 7.5: CLI command to initialize memory
     * - 7.11: Create directory at workspace root
     * - 7.12: Create configuration metadata
     *
     * @param project - Project name (or "global" for global memory)
     */
    async init(project) {
        const memoryPath = this.getMemoryPath(project);
        // Validate workspace boundary (Requirement 2.7)
        this.validateWorkspaceBoundary(memoryPath, 'init');
        // Create directory if it doesn't exist
        await fs.promises.mkdir(memoryPath, { recursive: true });
        // Initialize Beads repository
        try {
            this.runBdCommand(['init', '--server', '--server-host', '127.0.0.1', '--server-port', '3306', '--server-user', 'root'], memoryPath, this.getBeadsDir(memoryPath));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // In shared DB/server setups, bd may report that the workspace is already initialized.
            // Treat this as non-fatal so init remains idempotent.
            if (message.includes('already initialized')) {
                // continue
            }
            else {
                throw new Error(`Failed to initialize Beads repository: ${error}`);
            }
        }
        // Do not force no-db mode: default Beads setup should remain DB-backed when available.
        // Create .config.json with project metadata
        const config = {
            project,
            created_at: new Date().toISOString(),
            version: '1.0.0'
        };
        const configPath = path.join(memoryPath, '.config.json');
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
    /**
     * Create a new memory entry.
     * Validates entry, checks for secrets, checks for duplicates, creates Beads issue.
     *
     * Requirements:
     * - 5.1: Create new Memory_Entry records
     * - 5.7: Validate confidence, evidence, kind, subject, scope, summary
     * - 16.6: Check for duplicates (same subject, scope, summary)
     *
     * @param project - Project name
     * @param entry - Memory entry input
     * @returns Memory_ID of created entry
     */
    async create(project, entry) {
        const startTime = Date.now();
        // Validate entry
        const validationResult = (0, validation_1.validateMemoryEntry)(entry);
        if (!validationResult.valid) {
            throw new Error(`Memory entry validation failed:\n${validationResult.errors.join('\n')}`);
        }
        // Check for secrets
        const secretResult = (0, secret_detection_1.detectSecrets)(entry);
        if (secretResult.hasSecrets) {
            throw new Error(`Secret detection failed:\n${secretResult.errors.join('\n')}`);
        }
        // Check for duplicates
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        const existingEntries = await this.readAllIssues(memoryPath);
        for (const existingIssue of existingEntries) {
            const existingEntry = this.beadsIssueToMemoryEntry(existingIssue);
            if (existingEntry.subject === entry.subject &&
                existingEntry.scope === entry.scope &&
                existingEntry.summary === entry.summary) {
                throw new Error(`Duplicate entry detected: An entry with the same subject, scope, and summary already exists (ID: ${existingEntry.id})`);
            }
        }
        // Set default status if not provided
        const status = entry.status || 'active';
        const tags = entry.tags || [];
        const related_entries = entry.related_entries || [];
        const superseded_by = entry.superseded_by || null;
        // Build labels
        const labels = [
            `section:${entry.section}`,
            `kind:${entry.kind}`,
            `scope:${entry.scope}`,
            `status:${status}`,
            ...tags.map(tag => `tag:${tag}`)
        ];
        // Build body with metadata
        const metadata = {
            subject: entry.subject,
            confidence: entry.confidence,
            evidence: entry.evidence,
            superseded_by,
            related_entries,
            created_by: entry.created_by
        };
        const body = `${entry.content}\n\n---METADATA---\n${JSON.stringify(metadata, null, 2)}`;
        try {
            const output = this.runBdCommand([
                'create',
                '--title',
                entry.summary,
                '--description',
                body,
                '--labels',
                labels.join(','),
                '--silent',
            ], memoryPath, this.getBeadsDir(memoryPath));
            const issueId = this.extractIssueId(output);
            const duration = Date.now() - startTime;
            // Log concurrent write attempt for debugging (Requirement 12.4)
            // Beads hash-based IDs provide conflict-free creates (Requirement 12.1, 12.2)
            this.logConcurrentWrite('create', project, issueId, entry.created_by, duration);
            // Invalidate statistics cache after write (Requirement 22.9)
            statistics_cache_1.statisticsCache.invalidate(project);
            await this.syncJsonlExport(memoryPath);
            return issueId;
        }
        catch (error) {
            if (!this.shouldFallbackToJsonl(error)) {
                throw new Error(`Failed to create Beads issue: ${error}`);
            }
            // Fallback for environments where Beads DB mode is unavailable.
            const issueId = await this.createIssueJsonlFallback(memoryPath, project, {
                title: entry.summary,
                body,
                labels,
                created_by: entry.created_by,
            });
            const duration = Date.now() - startTime;
            this.logConcurrentWrite('create', project, issueId, entry.created_by, duration);
            statistics_cache_1.statisticsCache.invalidate(project);
            return issueId;
        }
    }
    /**
     * Supersede an existing memory entry with a replacement.
     * Updates target entry status to "superseded", sets superseded_by, creates replacement.
     *
     * Requirements:
     * - 5.2: Mark entries as superseded
     * - 5.4: Set status to "superseded" and populate superseded_by
     *
     * @param project - Project name
     * @param targetId - Memory_ID of entry to supersede
     * @param replacementEntry - New entry to replace the target
     * @returns Memory_ID of replacement entry
     */
    async supersede(project, targetId, replacementEntry) {
        const startTime = Date.now();
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Get target entry
        const targetEntry = await this.get(project, targetId);
        if (!targetEntry) {
            throw new Error(`Target entry not found: ${targetId}`);
        }
        // Create replacement entry
        const replacementId = await this.create(project, replacementEntry);
        // Update target entry: set status to "superseded"
        // Last-write-wins strategy for concurrent updates (Requirement 12.3)
        await this.updateEntry(project, {
            ...targetEntry,
            status: 'superseded',
            superseded_by: replacementId,
            updated_at: new Date().toISOString(),
        });
        const duration = Date.now() - startTime;
        this.logConcurrentWrite('supersede', project, targetId, replacementEntry.created_by, duration);
        statistics_cache_1.statisticsCache.invalidate(project);
        return replacementId;
    }
    /**
     * Deprecate a memory entry.
     * Updates entry status to "deprecated" without requiring a replacement.
     *
     * Requirements:
     * - 5.3: Mark entries as deprecated
     * - 5.5: Set status to "deprecated" without superseded_by
     *
     * @param project - Project name
     * @param targetId - Memory_ID of entry to deprecate
     */
    async deprecate(project, targetId) {
        const startTime = Date.now();
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Get target entry
        const targetEntry = await this.get(project, targetId);
        if (!targetEntry) {
            throw new Error(`Target entry not found: ${targetId}`);
        }
        // Update entry: set status to "deprecated"
        // Last-write-wins strategy for concurrent updates (Requirement 12.3)
        await this.updateEntry(project, {
            ...targetEntry,
            status: 'deprecated',
            superseded_by: null,
            updated_at: new Date().toISOString(),
        });
        const duration = Date.now() - startTime;
        this.logConcurrentWrite('deprecate', project, targetId, 'system', duration);
        statistics_cache_1.statisticsCache.invalidate(project);
    }
    /**
     * Query memory entries with filters.
     * Implements smart retrieval rules, ranking, and result limiting.
     *
     * Requirements:
     * - 4.1-4.7: Filter by section, kind, scope, subject, tags, status, confidence, timestamps
     * - 4.10: Limit results to 50 entries maximum
     * - 4.12: Support summary-only mode
     * - 5.11: Default to status="active" and confidence>=0.6
     * - 6.7-6.10: Exclude superseded, deprecated, draft entries by default
     * - 15.1-15.8: Smart retrieval rules (ranking, scope hierarchy)
     * - 17.1-17.5: Scope-based access control with hierarchy
     *
     * @param project - Project name
     * @param filters - Query filters
     * @returns Array of matching memory entries
     */
    async query(project, filters = {}) {
        const memoryPath = this.getMemoryPath(project);
        // Graceful degradation: return empty array if not initialized
        try {
            await fs.promises.access(path.join(memoryPath, '.config.json'), fs.constants.F_OK);
        }
        catch {
            return [];
        }
        // Apply default filters (Requirements 5.11, 6.10, 15.1)
        const effectiveFilters = this.applyDefaultFilters(filters);
        // Read all issues from .beads/issues.jsonl
        const issues = await this.readAllIssues(memoryPath);
        // Translate to Memory_Entry objects
        let entries = issues.map(issue => this.beadsIssueToMemoryEntry(issue));
        // Apply filters
        entries = this.applyFilters(entries, effectiveFilters);
        // Rank results (Requirements 15.4, 15.8, 18.8, 3.10)
        entries = this.rankResults(entries, effectiveFilters);
        // Apply result limit (Requirement 4.10)
        const limit = effectiveFilters.limit || 50;
        entries = entries.slice(0, Math.min(limit, 50));
        // Apply summary-only mode if requested (Requirement 4.12)
        if (effectiveFilters.summaryOnly) {
            entries = entries.map(entry => this.toSummaryOnly(entry));
        }
        // Include related entries if requested (Requirement 4.11)
        if (effectiveFilters.includeRelated) {
            const relatedEntries = await this.fetchRelatedEntries(project, entries);
            entries = [...entries, ...relatedEntries];
        }
        // Log query for pattern tracking (Requirement 22.6)
        try {
            await (0, query_logger_1.logQuery)(project, effectiveFilters, entries.length, this.workspaceRoot);
        }
        catch (error) {
            // Don't fail query if logging fails
            logger_1.logger.warn('Failed to log query', { project, error });
        }
        return entries;
    }
    /**
     * Get a single memory entry by ID.
     *
     * Requirements:
     * - 2.6: Retrieve entries by Memory_ID
     * - 4.11: Support single entry retrieval
     *
     * @param project - Project name
     * @param id - Memory_ID
     * @returns Memory entry or null if not found
     */
    async get(project, id) {
        const memoryPath = this.getMemoryPath(project);
        try {
            await fs.promises.access(path.join(memoryPath, '.config.json'), fs.constants.F_OK);
        }
        catch {
            return null;
        }
        const issues = await this.readAllIssues(memoryPath);
        const issue = issues.find(i => i.id === id);
        if (!issue) {
            return null;
        }
        return this.beadsIssueToMemoryEntry(issue);
    }
    /**
     * Get related entries by following related_entries links.
     *
     * Requirements:
     * - 2.6: Support relationships between memory entries
     * - 4.11: Follow related_entries links
     *
     * @param project - Project name
     * @param id - Memory_ID
     * @returns Array of related memory entries
     */
    async getRelated(project, id) {
        const entry = await this.get(project, id);
        if (!entry || !entry.related_entries || entry.related_entries.length === 0) {
            return [];
        }
        const relatedEntries = [];
        for (const relatedId of entry.related_entries) {
            const relatedEntry = await this.get(project, relatedId);
            if (relatedEntry) {
                relatedEntries.push(relatedEntry);
            }
        }
        return relatedEntries;
    }
    /**
     * Compact/consolidate memory entries using Beads' native compact command.
     * Beads' compact command performs semantic "memory decay" by consolidating old entries.
     *
     * Requirements:
     * - 6.1: Support consolidation of old superseded memory entries
     * - 6.3: Preserve original entries in history (via git)
     * - 6.4: Provide a log of what was consolidated
     * - 6.5: Allow manual review before applying (via dryRun flag)
     *
     * @param project - Project name
     * @param dryRun - If true, preview changes without applying them
     * @returns Compaction report with details of what was/would be consolidated
     */
    async compact(project, dryRun = false) {
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Get current entry count
        const allEntries = await this.readAllIssues(memoryPath);
        const supersededCount = allEntries.filter(issue => issue.labels.includes('status:superseded')).length;
        // Warn if memory exceeds 100 entries (Requirement 6.2)
        if (allEntries.length > 100) {
            console.warn(`Warning: Memory for project "${project}" has ${allEntries.length} entries. ` +
                `Consider running compaction to consolidate old entries.`);
        }
        // Execute bd compact command
        const command = dryRun ? 'bd compact --dry-run' : 'bd compact';
        try {
            const output = (0, child_process_1.execSync)(command, {
                cwd: memoryPath,
                encoding: 'utf-8'
            });
            // Parse output to create report
            const report = {
                project,
                timestamp: new Date().toISOString(),
                dryRun,
                totalEntries: allEntries.length,
                supersededEntries: supersededCount,
                compactedCount: this.parseCompactedCount(output),
                output: output.trim(),
                success: true
            };
            return report;
        }
        catch (error) {
            // If bd compact fails (e.g., command not available), return graceful report
            const report = {
                project,
                timestamp: new Date().toISOString(),
                dryRun,
                totalEntries: allEntries.length,
                supersededEntries: supersededCount,
                compactedCount: 0,
                output: `Compaction not available: ${error}`,
                success: false
            };
            return report;
        }
    }
    /**
     * Check freshness of memory entries (SIMPLIFIED - no temporal validity tracking).
     *
     * Note: This is a simplified implementation. The original design included valid_from/valid_to
     * fields for temporal validity tracking, but these were removed in favor of using Beads directly.
     * This method now returns an empty report since we don't track temporal validity.
     *
     * Requirements:
     * - 7.7: Provide command to list entries approaching expiry
     * - 19.4: Generate freshness report
     *
     * @param project - Project name
     * @returns Freshness report (empty in simplified implementation)
     */
    async checkFreshness(project) {
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Simplified: No temporal validity tracking, return empty report
        const report = {
            project,
            timestamp: new Date().toISOString(),
            expiringEntries: [],
            message: 'Freshness checking is not implemented (no temporal validity tracking)'
        };
        return report;
    }
    /**
     * Validate evidence URIs (SIMPLIFIED - no staleness checking).
     *
     * Note: This is a simplified implementation. The original design included evidence
     * staleness checking, but this was removed. This method now returns a basic report
     * without actually checking URI reachability.
     *
     * Requirements:
     * - 7.6: Provide command to check all evidence URIs
     * - 18.6: Generate validation report
     *
     * @param project - Project name
     * @returns Evidence validation report (simplified)
     */
    async validateEvidence(project) {
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        const allEntries = await this.readAllIssues(memoryPath);
        // Simplified: Just count evidence, don't check reachability
        let totalEvidence = 0;
        for (const issue of allEntries) {
            const entry = this.beadsIssueToMemoryEntry(issue);
            totalEvidence += entry.evidence.length;
        }
        const report = {
            project,
            timestamp: new Date().toISOString(),
            totalEntries: allEntries.length,
            totalEvidence,
            staleEvidence: [],
            message: 'Evidence validation is simplified (no URI reachability checking)'
        };
        return report;
    }
    /**
     * Parse the number of compacted entries from bd compact output
     */
    parseCompactedCount(output) {
        // Try to extract count from output (format may vary)
        const match = output.match(/compacted (\d+)/i) || output.match(/(\d+) entries/i);
        return match ? parseInt(match[1], 10) : 0;
    }
    /**
     * Read all issues from .beads/issues.jsonl
     */
    async readAllIssues(memoryPath) {
        const beadsDir = this.getBeadsDir(memoryPath);
        try {
            const output = this.runBdCommand(['list', '--json'], memoryPath, beadsDir);
            const parsed = JSON.parse(output);
            if (Array.isArray(parsed)) {
                return parsed.map((data) => ({
                    id: data.id,
                    title: data.title || '',
                    body: data.body || data.description || '',
                    labels: data.labels || [],
                    created_by: data.created_by || data.createdBy || '',
                    created_at: data.created_at || data.createdAt || new Date().toISOString(),
                    updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
                }));
            }
        }
        catch {
            // Fall through to JSONL read path.
        }
        const issuesPath = path.join(memoryPath, '.beads', 'issues.jsonl');
        try {
            const content = await fs.promises.readFile(issuesPath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            return lines.map(line => {
                const data = JSON.parse(line);
                return {
                    id: data.id,
                    title: data.title || '',
                    body: data.body || '',
                    labels: data.labels || [],
                    created_by: data.created_by || data.createdBy || '',
                    created_at: data.created_at || data.createdAt || new Date().toISOString(),
                    updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
                };
            });
        }
        catch (error) {
            // If file doesn't exist or is empty, return empty array
            return [];
        }
    }
    /**
     * Convert a Beads issue to a Memory_Entry
     */
    beadsIssueToMemoryEntry(issue) {
        // Parse labels
        const labelMap = new Map();
        const tags = [];
        issue.labels.forEach(label => {
            const [prefix, ...valueParts] = label.split(':');
            const value = valueParts.join(':'); // Handle values with colons
            if (prefix === 'tag') {
                tags.push(value);
            }
            else {
                labelMap.set(prefix, value);
            }
        });
        // Extract fields from labels
        const section = labelMap.get('section') || 'observations';
        const kind = labelMap.get('kind') || 'other';
        const scope = labelMap.get('scope') || 'repo';
        const status = labelMap.get('status') || 'active';
        // Extract metadata from body
        let content = issue.body;
        let metadata = {
            subject: '',
            confidence: 0.5,
            evidence: [],
            superseded_by: null,
            related_entries: [],
            created_by: issue.created_by
        };
        const metadataMarker = '---METADATA---';
        if (content.includes(metadataMarker)) {
            const parts = content.split(metadataMarker);
            content = parts[0].trim();
            try {
                metadata = { ...metadata, ...JSON.parse(parts[1].trim()) };
            }
            catch (error) {
                // If parsing fails, use defaults
            }
        }
        // Create Memory_Entry
        const memoryEntry = {
            id: issue.id,
            section,
            kind,
            subject: metadata.subject || '',
            scope,
            summary: issue.title,
            content,
            tags,
            confidence: metadata.confidence || 0.5,
            evidence: Array.isArray(metadata.evidence) ? metadata.evidence : [],
            status,
            superseded_by: metadata.superseded_by || null,
            related_entries: Array.isArray(metadata.related_entries) ? metadata.related_entries : [],
            created_by: metadata.created_by || issue.created_by,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
        };
        return memoryEntry;
    }
    /**
     * Apply default filters for smart retrieval.
     * Requirements: 5.11, 6.10, 15.1
     */
    applyDefaultFilters(filters) {
        return {
            ...filters,
            // Default to status="active" unless explicitly overridden
            status: filters.status || ['active'],
            // Default to confidence>=0.6 unless explicitly overridden
            minConfidence: filters.minConfidence !== undefined ? filters.minConfidence : 0.6,
            // Default limit to 50
            limit: filters.limit !== undefined ? filters.limit : 50
        };
    }
    /**
     * Apply all filters to entries
     */
    applyFilters(entries, filters) {
        let filtered = entries;
        // Section filter
        if (filters.section && filters.section.length > 0) {
            filtered = filtered.filter(e => filters.section.includes(e.section));
        }
        // Kind filter
        if (filters.kind && filters.kind.length > 0) {
            filtered = filtered.filter(e => filters.kind.includes(e.kind));
        }
        // Status filter
        if (filters.status && filters.status.length > 0) {
            filtered = filtered.filter(e => filters.status.includes(e.status));
        }
        // Scope filter with hierarchy expansion
        if (filters.scope && filters.scope.length > 0) {
            const expandedScopes = this.expandScopeHierarchy(filters.scope);
            filtered = filtered.filter(e => expandedScopes.includes(e.scope));
        }
        // Subject filter
        if (filters.subject && filters.subject.length > 0) {
            filtered = filtered.filter(e => filters.subject.includes(e.subject));
        }
        // Tags filter
        if (filters.tags && filters.tags.length > 0) {
            filtered = filtered.filter(e => filters.tags.some(tag => e.tags.includes(tag)));
        }
        // Confidence range filter
        if (filters.minConfidence !== undefined) {
            filtered = filtered.filter(e => e.confidence >= filters.minConfidence);
        }
        if (filters.maxConfidence !== undefined) {
            filtered = filtered.filter(e => e.confidence <= filters.maxConfidence);
        }
        // Created timestamp filter
        if (filters.createdAfter) {
            filtered = filtered.filter(e => e.created_at >= filters.createdAfter);
        }
        if (filters.createdBefore) {
            filtered = filtered.filter(e => e.created_at <= filters.createdBefore);
        }
        // Updated timestamp filter
        if (filters.updatedAfter) {
            filtered = filtered.filter(e => e.updated_at >= filters.updatedAfter);
        }
        if (filters.updatedBefore) {
            filtered = filtered.filter(e => e.updated_at <= filters.updatedBefore);
        }
        return filtered;
    }
    /**
     * Expand scope hierarchy for inclusive querying.
     * Requirements: 15.6, 15.7, 17.1, 17.2, 17.3, 17.5
     *
     * When querying scope="service:auth", include "repo" and "org" scopes.
     * When querying scope="environment:prod", include "repo" and "org" scopes.
     */
    expandScopeHierarchy(scopes) {
        const expanded = new Set();
        for (const scope of scopes) {
            expanded.add(scope);
            // Add hierarchical parent scopes
            if (scope.startsWith('service:') || scope.startsWith('environment:') || scope === 'customer') {
                expanded.add('repo');
                expanded.add('org');
            }
        }
        return Array.from(expanded);
    }
    /**
     * Rank query results by composite score.
     * Requirements: 15.4, 15.8, 18.8, 3.10
     *
     * Composite score = (confidence * 0.5) + (evidence_quality * 0.3) + (recency_score * 0.1) + (scope_match * 0.1)
     * Evidence quality: code/artifact=1.0, ticket/doc=0.8, log/screenshot=0.6, assumption=0.4
     */
    rankResults(entries, filters) {
        const now = new Date();
        // Calculate composite score for each entry
        const scored = entries.map(entry => {
            const confidenceScore = entry.confidence * 0.5;
            const evidenceQuality = this.calculateEvidenceQuality(entry) * 0.3;
            const recencyScore = this.calculateRecencyScore(entry, now) * 0.1;
            const scopeMatch = this.calculateScopeMatch(entry, filters) * 0.1;
            const compositeScore = confidenceScore + evidenceQuality + recencyScore + scopeMatch;
            return {
                entry,
                compositeScore
            };
        });
        // Sort by composite score descending
        scored.sort((a, b) => b.compositeScore - a.compositeScore);
        return scored.map(s => s.entry);
    }
    /**
     * Calculate evidence quality score.
     * code/artifact=1.0, ticket/doc=0.8, log/screenshot=0.6, assumption=0.4
     */
    calculateEvidenceQuality(entry) {
        if (!entry.evidence || entry.evidence.length === 0) {
            return 0.4; // Default to assumption quality
        }
        // Use the highest quality evidence type
        let maxQuality = 0;
        for (const evidence of entry.evidence) {
            let quality = 0;
            switch (evidence.type) {
                case 'code':
                case 'artifact':
                    quality = 1.0;
                    break;
                case 'ticket':
                case 'doc':
                    quality = 0.8;
                    break;
                case 'log':
                case 'screenshot':
                    quality = 0.6;
                    break;
                case 'assumption':
                    quality = 0.4;
                    break;
            }
            maxQuality = Math.max(maxQuality, quality);
        }
        return maxQuality;
    }
    /**
     * Calculate recency score (0.0 to 1.0).
     * More recent entries score higher.
     */
    calculateRecencyScore(entry, now) {
        const updatedAt = new Date(entry.updated_at);
        const ageInDays = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        // Decay function: score = 1.0 for today, 0.5 for 180 days ago, 0.0 for 365+ days ago
        if (ageInDays <= 0)
            return 1.0;
        if (ageInDays >= 365)
            return 0.0;
        return Math.max(0, 1.0 - (ageInDays / 365));
    }
    /**
     * Calculate scope match score (0.0 to 1.0).
     * Exact scope match = 1.0, hierarchical match = 0.5, no match = 0.0
     */
    calculateScopeMatch(entry, filters) {
        if (!filters.scope || filters.scope.length === 0) {
            return 0.5; // No filter, neutral score
        }
        // Exact match
        if (filters.scope.includes(entry.scope)) {
            return 1.0;
        }
        // Hierarchical match (repo/org scopes)
        if (entry.scope === 'repo' || entry.scope === 'org') {
            return 0.5;
        }
        return 0.0;
    }
    /**
     * Convert entry to summary-only format.
     * Requirement 4.12: Return only id, summary, subject, scope, kind, confidence
     */
    toSummaryOnly(entry) {
        return {
            id: entry.id,
            summary: entry.summary,
            subject: entry.subject,
            scope: entry.scope,
            kind: entry.kind,
            confidence: entry.confidence,
            // Set other fields to empty/default values
            section: entry.section,
            content: '',
            tags: [],
            evidence: [],
            status: entry.status,
            superseded_by: null,
            related_entries: [],
            created_by: '',
            created_at: '',
            updated_at: ''
        };
    }
    /**
     * Fetch related entries for a list of entries.
     * Requirement 4.11: Follow related_entries links
     */
    async fetchRelatedEntries(project, entries) {
        const relatedIds = new Set();
        const existingIds = new Set(entries.map(e => e.id));
        // Collect all related entry IDs
        for (const entry of entries) {
            if (entry.related_entries) {
                entry.related_entries.forEach(id => {
                    if (!existingIds.has(id)) {
                        relatedIds.add(id);
                    }
                });
            }
        }
        // Fetch related entries
        const relatedEntries = [];
        for (const id of relatedIds) {
            const entry = await this.get(project, id);
            if (entry) {
                relatedEntries.push(entry);
            }
        }
        return relatedEntries;
    }
    /**
     * Get the memory path for a project
     */
    getMemoryPath(project) {
        return path.join(this.workspaceRoot, 'ai-memory', project);
    }
    /**
     * Validate that a path is within the workspace boundary.
     * Throws an error if the path attempts to escape the workspace root.
     *
     * Requirements:
     * - 2.7: Memory system SHALL NOT write memory data outside workspace root directory
     *
     * @param targetPath - Path to validate
     * @param operation - Operation name for error messages
     * @throws Error if path is outside workspace boundary
     */
    validateWorkspaceBoundary(targetPath, operation) {
        // Resolve both paths to absolute paths
        const resolvedTarget = path.resolve(targetPath);
        const resolvedWorkspace = path.resolve(this.workspaceRoot);
        // Check if the target path starts with the workspace root
        // Use path.relative to check if we need to go up (..) to reach workspace
        const relativePath = path.relative(resolvedWorkspace, resolvedTarget);
        // If relative path starts with '..' or is absolute, it's outside workspace
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error(`Workspace boundary violation: ${operation} attempted to access path outside workspace root.\n` +
                `Workspace root: ${resolvedWorkspace}\n` +
                `Attempted path: ${resolvedTarget}\n` +
                `All memory operations must stay within the workspace directory.`);
        }
    }
    /**
     * Ensure memory is initialized for a project.
     * Standard behavior: fail fast with setup guidance if not initialized.
     */
    async ensureInitialized(project, memoryPath) {
        const configPath = path.join(memoryPath, '.config.json');
        try {
            await fs.promises.access(configPath, fs.constants.F_OK);
        }
        catch {
            throw new Error(`Memory project "${project}" is not initialized at ${memoryPath}.\n` +
                `Run: bass-agents memory init ${project}\n` +
                `Initialize Beads in the primary repo checkout with: bd init\n` +
                `For additional working directories, use: bd worktree create <path> --branch <branch-name>`);
        }
    }
    /**
     * Escape quotes in strings for shell commands
     */
    /**
     * Export memory entries to JSONL format
     *
     * @param project - Project name
     * @param outputPath - Path to output JSONL file
     * @param filters - Optional filters for export
     */
    async export(project, outputPath, filters) {
        // Validate workspace boundary for output path (Requirement 2.7)
        this.validateWorkspaceBoundary(outputPath, 'export');
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Build query filters from export filters
        const queryFilters = {
            limit: 10000, // High limit for export
        };
        if (filters?.section) {
            queryFilters.section = filters.section;
        }
        if (filters?.minConfidence !== undefined) {
            queryFilters.minConfidence = filters.minConfidence;
        }
        if (filters?.createdAfter) {
            queryFilters.createdAfter = filters.createdAfter;
        }
        if (filters?.createdBefore) {
            queryFilters.createdBefore = filters.createdBefore;
        }
        // Query entries with filters
        const entries = await this.query(project, queryFilters);
        // Write entries to JSONL format (one JSON object per line)
        const lines = entries.map(entry => JSON.stringify(entry));
        const content = lines.join('\n');
        // Ensure output directory exists
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const outputDir = path.dirname(outputPath);
        await fs.mkdir(outputDir, { recursive: true });
        // Write to file
        await fs.writeFile(outputPath, content, 'utf-8');
    }
    /**
     * Import memory entries from JSONL format
     *
     * @param project - Project name
     * @param inputPath - Path to input JSONL file
     * @param conflictStrategy - Strategy for handling conflicts (skip, overwrite, merge)
     */
    async import(project, inputPath, conflictStrategy = 'skip') {
        // Validate workspace boundary for input path (Requirement 2.7)
        this.validateWorkspaceBoundary(inputPath, 'import');
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const content = await fs.readFile(inputPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const report = {
            project,
            timestamp: new Date().toISOString(),
            totalEntries: lines.length,
            successCount: 0,
            skipCount: 0,
            errorCount: 0,
            conflicts: [],
            errors: [],
        };
        for (let i = 0; i < lines.length; i++) {
            const lineNumber = i + 1;
            try {
                const entry = JSON.parse(lines[i]);
                // Check if entry already exists
                const existing = await this.get(project, entry.id);
                if (existing) {
                    // Handle conflict
                    if (conflictStrategy === 'skip') {
                        report.skipCount++;
                        report.conflicts.push({
                            id: entry.id,
                            resolution: 'skipped',
                        });
                        continue;
                    }
                    else if (conflictStrategy === 'overwrite') {
                        // Update existing entry by creating a new one with same ID
                        // This is a simplified approach - in production, we'd need proper update logic
                        await this.updateEntry(project, entry);
                        report.successCount++;
                        report.conflicts.push({
                            id: entry.id,
                            resolution: 'overwritten',
                        });
                    }
                    else if (conflictStrategy === 'merge') {
                        // Merge entries: prefer higher confidence, merge evidence arrays, union tags
                        const merged = this.mergeEntries(existing, entry);
                        await this.updateEntry(project, merged);
                        report.successCount++;
                        report.conflicts.push({
                            id: entry.id,
                            resolution: 'merged',
                        });
                    }
                }
                else {
                    // Create new entry
                    const entryInput = {
                        section: entry.section,
                        kind: entry.kind,
                        subject: entry.subject,
                        scope: entry.scope,
                        summary: entry.summary,
                        content: entry.content,
                        tags: entry.tags,
                        confidence: entry.confidence,
                        evidence: entry.evidence,
                        status: entry.status,
                        superseded_by: entry.superseded_by,
                        related_entries: entry.related_entries,
                        created_by: entry.created_by,
                    };
                    await this.create(project, entryInput);
                    report.successCount++;
                }
            }
            catch (error) {
                report.errorCount++;
                report.errors.push({
                    line: lineNumber,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        report.message = `Import completed: ${report.successCount} succeeded, ${report.skipCount} skipped, ${report.errorCount} failed`;
        return report;
    }
    /**
     * Sync high-confidence memory entries to ai-context/ directory
     *
     * @param project - Project name
     */
    async syncContext(project) {
        const memoryPath = this.getMemoryPath(project);
        await this.ensureInitialized(project, memoryPath);
        // Query high-confidence entries with code/artifact evidence
        const entries = await this.query(project, {
            minConfidence: 0.8,
            status: ['active'],
            limit: 50,
        });
        // Filter entries with code or artifact evidence
        const relevantEntries = entries.filter(entry => entry.evidence.some(e => e.type === 'code' || e.type === 'artifact'));
        // Group entries by subject
        const bySubject = new Map();
        for (const entry of relevantEntries) {
            const subject = entry.subject;
            if (!bySubject.has(subject)) {
                bySubject.set(subject, []);
            }
            bySubject.get(subject).push(entry);
        }
        // Generate summaries for each subject
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const contextDir = path.join(this.workspaceRoot, 'ai-context', project);
        // Validate workspace boundary for context directory (Requirement 2.7)
        this.validateWorkspaceBoundary(contextDir, 'syncContext');
        await fs.mkdir(contextDir, { recursive: true });
        for (const [subject, subjectEntries] of bySubject) {
            const filename = `${subject.replace(/[^a-z0-9-]/gi, '_')}.md`;
            const filepath = path.join(contextDir, filename);
            let content = `# ${subject}\n\n`;
            content += `*Generated from durable memory on ${new Date().toISOString()}*\n\n`;
            for (const entry of subjectEntries) {
                content += `## ${entry.summary}\n\n`;
                content += `**Section:** ${entry.section} | **Kind:** ${entry.kind} | **Confidence:** ${entry.confidence}\n\n`;
                content += `${entry.content}\n\n`;
                if (entry.evidence.length > 0) {
                    content += `**Evidence:**\n`;
                    for (const ev of entry.evidence) {
                        content += `- [${ev.type}] ${ev.uri}: ${ev.note}\n`;
                    }
                    content += `\n`;
                }
                if (entry.tags.length > 0) {
                    content += `**Tags:** ${entry.tags.join(', ')}\n\n`;
                }
                content += `---\n\n`;
            }
            await fs.writeFile(filepath, content, 'utf-8');
        }
    }
    /**
     * Update an existing memory entry (helper for import)
     */
    async updateEntry(project, entry) {
        const memoryPath = this.getMemoryPath(project);
        const labels = [
            `section:${entry.section}`,
            `kind:${entry.kind}`,
            `scope:${entry.scope}`,
            `status:${entry.status}`,
            ...entry.tags.map(tag => `tag:${tag}`),
        ];
        const metadata = {
            subject: entry.subject,
            confidence: entry.confidence,
            evidence: entry.evidence,
            superseded_by: entry.superseded_by,
            related_entries: entry.related_entries,
            created_by: entry.created_by,
        };
        const body = `${entry.content}\n\n---METADATA---\n${JSON.stringify(metadata, null, 2)}`;
        try {
            this.runBdCommand([
                'update',
                entry.id,
                '--title',
                entry.summary,
                '--description',
                body,
                '--set-labels',
                labels.join(','),
            ], memoryPath, this.getBeadsDir(memoryPath));
            await this.syncJsonlExport(memoryPath);
        }
        catch (error) {
            if (!this.shouldFallbackToJsonl(error)) {
                throw error;
            }
            await this.updateIssueJsonlFallback(memoryPath, entry.id, issue => ({
                ...issue,
                title: entry.summary,
                body,
                labels,
                updated_at: new Date().toISOString(),
            }));
        }
    }
    /**
     * Merge two memory entries (helper for import)
     */
    mergeEntries(existing, incoming) {
        // Prefer higher confidence
        const useIncoming = incoming.confidence > existing.confidence;
        return {
            ...existing,
            // Use higher confidence entry's core fields
            summary: useIncoming ? incoming.summary : existing.summary,
            content: useIncoming ? incoming.content : existing.content,
            confidence: Math.max(existing.confidence, incoming.confidence),
            // Merge evidence arrays (deduplicate by URI)
            evidence: this.mergeEvidence(existing.evidence, incoming.evidence),
            // Union tags
            tags: Array.from(new Set([...existing.tags, ...incoming.tags])),
            // Use most recent status
            status: useIncoming ? incoming.status : existing.status,
            // Merge related entries
            related_entries: Array.from(new Set([...existing.related_entries, ...incoming.related_entries])),
            // Update timestamp
            updated_at: new Date().toISOString(),
        };
    }
    /**
     * Merge evidence arrays (helper for mergeEntries)
     */
    mergeEvidence(existing, incoming) {
        const evidenceMap = new Map();
        // Add existing evidence
        for (const ev of existing) {
            evidenceMap.set(ev.uri, ev);
        }
        // Add incoming evidence (overwrites if URI matches)
        for (const ev of incoming) {
            evidenceMap.set(ev.uri, ev);
        }
        return Array.from(evidenceMap.values());
    }
    runBdCommand(args, cwd, beadsDir) {
        const env = beadsDir
            ? { ...process.env, BEADS_DIR: beadsDir }
            : process.env;
        return (0, child_process_1.execFileSync)('bd', args, {
            cwd,
            env,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    async syncJsonlExport(memoryPath) {
        try {
            this.runBdCommand(['sync'], memoryPath, this.getBeadsDir(memoryPath));
        }
        catch {
            // Best-effort export sync; query/create should not fail on sync errors.
        }
    }
    getBeadsDir(memoryPath) {
        return path.join(memoryPath, '.beads');
    }
    extractIssueId(output) {
        const trimmed = output.trim();
        if (!trimmed) {
            throw new Error('Beads returned empty output when creating issue');
        }
        // Current bd --silent usually returns only the ID on stdout.
        if (/^[a-z0-9][a-z0-9-]*-[a-z0-9]+$/i.test(trimmed)) {
            return trimmed;
        }
        const match = trimmed.match(/[a-z0-9][a-z0-9-]*-[a-z0-9]+/i);
        if (!match) {
            throw new Error(`Failed to extract issue ID from bd create output: ${output}`);
        }
        return match[0];
    }
    shouldFallbackToJsonl(error) {
        const message = error instanceof Error ? error.message : String(error);
        return (message.includes('no beads database found') ||
            message.includes('requires CGO') ||
            message.includes('Dolt backend configured but database not found'));
    }
    async createIssueJsonlFallback(memoryPath, project, input) {
        const issuesPath = path.join(memoryPath, '.beads', 'issues.jsonl');
        await fs.promises.mkdir(path.dirname(issuesPath), { recursive: true });
        const now = new Date().toISOString();
        const prefix = await this.getIssuePrefix(memoryPath, project);
        const hash = (0, crypto_1.createHash)('sha1')
            .update(`${input.title}\n${input.body}\n${now}\n${Math.random()}`)
            .digest('hex')
            .slice(0, 10);
        const id = `${prefix}-${hash}`;
        const issue = {
            id,
            title: input.title,
            body: input.body,
            labels: input.labels,
            created_by: input.created_by,
            created_at: now,
            updated_at: now,
        };
        await fs.promises.appendFile(issuesPath, `${JSON.stringify(issue)}\n`, 'utf-8');
        return id;
    }
    async updateIssueJsonlFallback(memoryPath, issueId, updateFn) {
        const issuesPath = path.join(memoryPath, '.beads', 'issues.jsonl');
        const content = await fs.promises.readFile(issuesPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        let found = false;
        const updatedLines = lines.map(line => {
            const parsed = JSON.parse(line);
            if (parsed.id !== issueId) {
                return line;
            }
            found = true;
            const updated = updateFn(parsed);
            return JSON.stringify(updated);
        });
        if (!found) {
            throw new Error(`Entry not found for JSONL fallback update: ${issueId}`);
        }
        await fs.promises.writeFile(issuesPath, `${updatedLines.join('\n')}\n`, 'utf-8');
    }
    async getIssuePrefix(memoryPath, project) {
        const configPath = path.join(memoryPath, '.beads', 'config.yaml');
        try {
            const config = await fs.promises.readFile(configPath, 'utf-8');
            const match = config.match(/^\s*issue-prefix\s*:\s*"?([^"\n]+)"?\s*$/m);
            if (match && match[1].trim()) {
                return this.sanitizeIssuePrefix(match[1].trim());
            }
        }
        catch {
            // Fall back to project name.
        }
        return this.sanitizeIssuePrefix(project);
    }
    sanitizeIssuePrefix(prefix) {
        return prefix
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'memory';
    }
    /**
     * Log concurrent write attempts for debugging.
     *
     * Requirements:
     * - 12.4: Log all concurrent write attempts for debugging
     *
     * @param operation - Type of operation (create, supersede, deprecate)
     * @param project - Project name
     * @param entryId - Memory entry ID
     * @param agent - Agent identifier
     * @param duration - Operation duration in milliseconds
     */
    logConcurrentWrite(operation, project, entryId, agent, duration) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            operation,
            project,
            entryId,
            agent,
            duration_ms: duration
        };
        // Log to console for debugging
        // In production, this could be written to a log file or monitoring system
        console.error(`[MEMORY_WRITE] ${JSON.stringify(logEntry)}`);
    }
    /**
     * Get version history for a memory entry.
     *
     * Beads stores all memory entries in git, providing automatic version history.
     * To retrieve previous versions of an entry:
     *
     * 1. Navigate to the memory directory: ai-memory/{project}/.beads/
     * 2. Use git log to see history: git log --all -- "*{entryId}*"
     * 3. Use git show to view specific versions: git show {commit}:{path}
     *
     * Requirements:
     * - 12.5: Provide version history for memory entries
     *
     * @param project - Project name
     * @param entryId - Memory entry ID
     * @returns Instructions for accessing version history
     */
    getVersionHistoryInstructions(project, entryId) {
        const memoryPath = this.getMemoryPath(project);
        return `
Version history for entry ${entryId} is available via git:

1. Navigate to memory directory:
   cd ${memoryPath}/.beads/

2. View entry history:
   git log --all --oneline -- "*${entryId}*"

3. View specific version:
   git show <commit-hash>:<file-path>

4. Compare versions:
   git diff <commit1> <commit2> -- "*${entryId}*"

All memory operations are automatically committed to git by Beads,
providing complete version history and audit trail.
`.trim();
    }
    /**
     * Get comprehensive statistics about memory entries.
     *
     * Requirements:
     * - 22.1: Provide getStatistics method
     * - 22.2-22.7: Include all required statistics
     * - 22.9: Use caching for efficient statistics computation
     * - 22.10: Support date range filtering
     *
     * @param project - Project name
     * @param dateRange - Optional date range filter
     * @param bypassCache - If true, bypass cache and force recomputation (for --no-cache flag)
     * @returns Memory statistics
     */
    async getStatistics(project, dateRange, bypassCache = false) {
        // Check cache first (unless bypassed)
        const cached = statistics_cache_1.statisticsCache.get(project, dateRange, bypassCache);
        if (cached) {
            return cached;
        }
        const memoryPath = this.getMemoryPath(project);
        // Graceful degradation: return empty stats if not initialized
        try {
            await fs.promises.access(path.join(memoryPath, '.config.json'), fs.constants.F_OK);
        }
        catch {
            return this.emptyStatistics();
        }
        // Read all entries
        const issues = await this.readAllIssues(memoryPath);
        const entries = issues.map(issue => this.beadsIssueToMemoryEntry(issue));
        // Get query patterns
        const queryPatterns = await (0, query_logger_1.analyzeQueryPatterns)(project, this.workspaceRoot, dateRange);
        // Compute statistics
        const stats = (0, statistics_1.getStatistics)(entries, dateRange);
        // Merge query patterns into statistics
        const result = {
            ...stats,
            most_queried_subjects: queryPatterns.most_queried_subjects.map(s => ({ subject: s.subject, count: s.count })),
            most_queried_scopes: queryPatterns.most_queried_scopes.map(s => ({ scope: s.scope, count: s.count })),
            query_frequency_over_time: queryPatterns.query_frequency_over_time,
        };
        // Cache the result
        statistics_cache_1.statisticsCache.set(project, result, dateRange);
        return result;
    }
    /**
     * Get query pattern statistics.
     *
     * Requirements:
     * - 22.6: Include query pattern statistics
     *
     * @param project - Project name
     * @param dateRange - Optional date range filter
     * @returns Query pattern statistics
     */
    async getQueryPatterns(project, dateRange) {
        return (0, query_logger_1.analyzeQueryPatterns)(project, this.workspaceRoot, dateRange);
    }
    /**
     * Return empty statistics for uninitialized projects
     */
    emptyStatistics() {
        return {
            total_entries: 0,
            entries_by_section: {},
            entries_by_status: {},
            entries_by_kind: {},
            avg_confidence: 0,
            confidence_distribution: {
                '0.0-0.2': 0,
                '0.2-0.4': 0,
                '0.4-0.6': 0,
                '0.6-0.8': 0,
                '0.8-1.0': 0,
            },
            evidence_type_distribution: {},
            low_confidence_count: 0,
            stale_evidence_count: 0,
            entries_created_over_time: [],
            entries_superseded_over_time: [],
            entries_by_agent: {},
            most_active_agents: [],
            recent_operations: [],
            superseded_percentage: 0,
            entries_approaching_expiry: [],
            compaction_candidates: 0,
        };
    }
}
exports.MemoryAdapter = MemoryAdapter;
//# sourceMappingURL=memory-adapter.js.map