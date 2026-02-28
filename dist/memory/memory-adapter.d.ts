/**
 * Memory Adapter
 *
 * Core business logic for memory operations using Beads directly.
 * Translates between Memory_Entry JSON and Beads storage using direct bd commands.
 *
 * Requirements: 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.10, 7.5, 7.11, 7.12, 16.6
 */
import { MemoryEntry, MemoryEntryInput, MemoryQueryFilters, CompactionReport, FreshnessReport, EvidenceValidationReport, ExportFilters, ConflictStrategy, ImportReport } from './types';
import { QueryPatternStats } from './query-logger';
import { MemoryStatistics, StatisticsDateRange } from './statistics';
/**
 * MemoryAdapter provides the core API for memory operations
 */
export declare class MemoryAdapter {
    private workspaceRoot;
    constructor(workspaceRoot: string);
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
    init(project: string): Promise<void>;
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
    create(project: string, entry: MemoryEntryInput): Promise<string>;
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
    supersede(project: string, targetId: string, replacementEntry: MemoryEntryInput): Promise<string>;
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
    deprecate(project: string, targetId: string): Promise<void>;
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
    query(project: string, filters?: MemoryQueryFilters): Promise<MemoryEntry[]>;
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
    get(project: string, id: string): Promise<MemoryEntry | null>;
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
    getRelated(project: string, id: string): Promise<MemoryEntry[]>;
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
    compact(project: string, dryRun?: boolean): Promise<CompactionReport>;
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
    checkFreshness(project: string): Promise<FreshnessReport>;
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
    validateEvidence(project: string): Promise<EvidenceValidationReport>;
    /**
     * Parse the number of compacted entries from bd compact output
     */
    private parseCompactedCount;
    /**
     * Read all issues from .beads/issues.jsonl
     */
    private readAllIssues;
    /**
     * Convert a Beads issue to a Memory_Entry
     */
    private beadsIssueToMemoryEntry;
    /**
     * Apply default filters for smart retrieval.
     * Requirements: 5.11, 6.10, 15.1
     */
    private applyDefaultFilters;
    /**
     * Apply all filters to entries
     */
    private applyFilters;
    /**
     * Expand scope hierarchy for inclusive querying.
     * Requirements: 15.6, 15.7, 17.1, 17.2, 17.3, 17.5
     *
     * When querying scope="service:auth", include "repo" and "org" scopes.
     * When querying scope="environment:prod", include "repo" and "org" scopes.
     */
    private expandScopeHierarchy;
    /**
     * Rank query results by composite score.
     * Requirements: 15.4, 15.8, 18.8, 3.10
     *
     * Composite score = (confidence * 0.5) + (evidence_quality * 0.3) + (recency_score * 0.1) + (scope_match * 0.1)
     * Evidence quality: code/artifact=1.0, ticket/doc=0.8, log/screenshot=0.6, assumption=0.4
     */
    private rankResults;
    /**
     * Calculate evidence quality score.
     * code/artifact=1.0, ticket/doc=0.8, log/screenshot=0.6, assumption=0.4
     */
    private calculateEvidenceQuality;
    /**
     * Calculate recency score (0.0 to 1.0).
     * More recent entries score higher.
     */
    private calculateRecencyScore;
    /**
     * Calculate scope match score (0.0 to 1.0).
     * Exact scope match = 1.0, hierarchical match = 0.5, no match = 0.0
     */
    private calculateScopeMatch;
    /**
     * Convert entry to summary-only format.
     * Requirement 4.12: Return only id, summary, subject, scope, kind, confidence
     */
    private toSummaryOnly;
    /**
     * Fetch related entries for a list of entries.
     * Requirement 4.11: Follow related_entries links
     */
    private fetchRelatedEntries;
    /**
     * Get the memory path for a project
     */
    private getMemoryPath;
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
    private validateWorkspaceBoundary;
    /**
     * Ensure memory is initialized for a project.
     * Auto-initializes if not already initialized (Requirement 9.6).
     */
    private ensureInitialized;
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
    export(project: string, outputPath: string, filters?: ExportFilters): Promise<void>;
    /**
     * Import memory entries from JSONL format
     *
     * @param project - Project name
     * @param inputPath - Path to input JSONL file
     * @param conflictStrategy - Strategy for handling conflicts (skip, overwrite, merge)
     */
    import(project: string, inputPath: string, conflictStrategy?: ConflictStrategy): Promise<ImportReport>;
    /**
     * Sync high-confidence memory entries to ai-context/ directory
     *
     * @param project - Project name
     */
    syncContext(project: string): Promise<void>;
    /**
     * Update an existing memory entry (helper for import)
     */
    private updateEntry;
    /**
     * Merge two memory entries (helper for import)
     */
    private mergeEntries;
    /**
     * Merge evidence arrays (helper for mergeEntries)
     */
    private mergeEvidence;
    private runBdCommand;
    private extractIssueId;
    private shouldFallbackToJsonl;
    private createIssueJsonlFallback;
    private updateIssueJsonlFallback;
    private getIssuePrefix;
    private sanitizeIssuePrefix;
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
    private logConcurrentWrite;
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
    getVersionHistoryInstructions(project: string, entryId: string): string;
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
    getStatistics(project: string, dateRange?: StatisticsDateRange, bypassCache?: boolean): Promise<MemoryStatistics>;
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
    getQueryPatterns(project: string, dateRange?: StatisticsDateRange): Promise<QueryPatternStats>;
    /**
     * Return empty statistics for uninitialized projects
     */
    private emptyStatistics;
}
//# sourceMappingURL=memory-adapter.d.ts.map