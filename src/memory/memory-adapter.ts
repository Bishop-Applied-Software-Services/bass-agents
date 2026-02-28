/**
 * Memory Adapter
 * 
 * Core business logic for memory operations using Beads directly.
 * Translates between Memory_Entry JSON and Beads storage using direct bd commands.
 * 
 * Requirements: 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.10, 7.5, 7.11, 7.12, 16.6
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { execFileSync, execSync } from 'child_process';
import { 
  MemoryEntry, 
  MemoryEntryInput, 
  MemoryProvenance,
  MemoryQueryFilters, 
  CompactionReport, 
  FreshnessReport, 
  EvidenceValidationReport,
  ExportFilters,
  ConflictStrategy,
  ImportReport,
  EvidenceReference
} from './types';
import { validateMemoryEntry, ValidationResult } from './validation';
import { detectSecrets } from './secret-detection';
import { logQuery, analyzeQueryPatterns, QueryPatternStats } from './query-logger';
import { getStatistics, MemoryStatistics, StatisticsDateRange } from './statistics';
import { logger } from './logger';
import { statisticsCache } from './statistics-cache';
import {
  assertPathWithinProject,
  defaultBassAgentsConfig,
  loadProjectContext,
  ProjectContext,
  ResolvedProjectContext,
  writeProjectConfig,
} from '../project-context';

/**
 * Beads issue structure (parsed from issues.jsonl)
 */
interface BeadsIssue {
  id: string;
  title: string;
  body: string;
  labels: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * MemoryAdapter provides the core API for memory operations
 */
export class MemoryAdapter {
  private context: ResolvedProjectContext;
  private readonly useJsonlFallback: boolean = true;

  constructor(projectRootOrContext: string | ProjectContext | ResolvedProjectContext) {
    if (typeof projectRootOrContext === 'string') {
      this.context = loadProjectContext(projectRootOrContext);
      return;
    }

    if ('configPath' in projectRootOrContext) {
      this.context = projectRootOrContext;
      return;
    }

    this.context = loadProjectContext(projectRootOrContext.projectRoot);
  }

  /**
   * Initialize memory storage for the current project.
   * Creates ai-memory/ directory and initializes the local Beads repository.
   * 
   * Requirements:
   * - 2.2: Store Project_Memory at ai-memory/{project-name}/
   * - 2.3: Store Global_Memory at ai-memory/global/
   * - 7.5: CLI command to initialize memory
   * - 7.11: Create directory at workspace root
   * - 7.12: Create configuration metadata
   * 
   */
  async init(_project?: string): Promise<void> {
    if (!this.context.initialized) {
      await writeProjectConfig(
        this.context.projectRoot,
        defaultBassAgentsConfig(true)
      );
      this.refreshContext();
    }

    const memoryPath = this.context.memoryRoot;

    // Create directory if it doesn't exist
    await fs.promises.mkdir(memoryPath, { recursive: true });

    if (this.useJsonlFallback) {
      await this.initializeJsonlFallback(memoryPath);
      return;
    }

    // Initialize Beads repository
    try {
      this.runBdCommand(
        ['init', '--server', '--server-host', '127.0.0.1', '--server-port', '3306', '--server-user', 'root'],
        memoryPath,
        this.getBeadsDir(memoryPath)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already initialized')) {
        // continue
      } else if (this.shouldFallbackToJsonl(error)) {
        await this.initializeJsonlFallback(memoryPath);
      } else {
        throw new Error(`Failed to initialize Beads repository: ${error}`);
      }
    }
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
   * @param entry - Memory entry input
   * @returns Memory_ID of created entry
   */
  async create(
    projectOrEntry: string | MemoryEntryInput,
    maybeEntry?: MemoryEntryInput
  ): Promise<string> {
    const entry = this.resolveArg(projectOrEntry, maybeEntry);
    const startTime = Date.now();
    const normalizedEntry = this.withDefaultProvenance(entry, {
      source_type: 'manual',
    });
    
    // Validate entry
    const validationResult = validateMemoryEntry(normalizedEntry);
    if (!validationResult.valid) {
      throw new Error(
        `Memory entry validation failed:\n${validationResult.errors.join('\n')}`
      );
    }

    // Check for secrets
    const secretResult = detectSecrets(normalizedEntry);
    if (secretResult.hasSecrets) {
      throw new Error(
        `Secret detection failed:\n${secretResult.errors.join('\n')}`
      );
    }

    // Check for duplicates
    const memoryPath = this.context.memoryRoot;
    await this.ensureWritableStorage();

    const existingEntries = await this.readAllIssues(memoryPath);

    for (const existingIssue of existingEntries) {
      const existingEntry = this.beadsIssueToMemoryEntry(existingIssue);
      
      if (
        existingEntry.subject === normalizedEntry.subject &&
        existingEntry.scope === normalizedEntry.scope &&
        existingEntry.summary === normalizedEntry.summary
      ) {
        throw new Error(
          `Duplicate entry detected: An entry with the same subject, scope, and summary already exists (ID: ${existingEntry.id})`
        );
      }
    }

    // Set default status if not provided
    const status = normalizedEntry.status || 'active';
    const tags = normalizedEntry.tags || [];
    const related_entries = normalizedEntry.related_entries || [];
    const superseded_by = normalizedEntry.superseded_by || null;

    // Build labels
    const labels = [
      `section:${normalizedEntry.section}`,
      `kind:${normalizedEntry.kind}`,
      `scope:${normalizedEntry.scope}`,
      `status:${status}`,
      ...tags.map(tag => `tag:${tag}`)
    ];

    // Build body with metadata
    const metadata = {
      subject: normalizedEntry.subject,
      confidence: normalizedEntry.confidence,
      evidence: normalizedEntry.evidence,
      provenance: normalizedEntry.provenance,
      superseded_by,
      related_entries,
      created_by: normalizedEntry.created_by
    };

    const body = `${normalizedEntry.content}\n\n---METADATA---\n${JSON.stringify(metadata, null, 2)}`;

    if (this.useJsonlFallback) {
      const issueId = await this.createIssueJsonlFallback(memoryPath, {
        title: normalizedEntry.summary,
        body,
        labels,
        created_by: normalizedEntry.created_by,
      });
      const duration = Date.now() - startTime;
      this.logConcurrentWrite('create', issueId, normalizedEntry.created_by, duration);
      statisticsCache.invalidate(this.getCacheKey());
      return issueId;
    }

    try {
      const output = this.runBdCommand(
        [
          'create',
          '--title',
          normalizedEntry.summary,
          '--description',
          body,
          '--labels',
          labels.join(','),
          '--silent',
        ],
        memoryPath,
        this.getBeadsDir(memoryPath)
      );
      const issueId = this.extractIssueId(output);
      const duration = Date.now() - startTime;
      this.logConcurrentWrite('create', issueId, normalizedEntry.created_by, duration);
      statisticsCache.invalidate(this.getCacheKey());
      await this.syncJsonlExport(memoryPath);
      return issueId;
    } catch (error) {
      if (!this.shouldFallbackToJsonl(error)) {
        throw new Error(`Failed to create Beads issue: ${error}`);
      }

      const issueId = await this.createIssueJsonlFallback(memoryPath, {
        title: normalizedEntry.summary,
        body,
        labels,
        created_by: normalizedEntry.created_by,
      });
      const duration = Date.now() - startTime;
      this.logConcurrentWrite('create', issueId, normalizedEntry.created_by, duration);
      statisticsCache.invalidate(this.getCacheKey());
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
   * @param targetId - Memory_ID of entry to supersede
   * @param replacementEntry - New entry to replace the target
   * @returns Memory_ID of replacement entry
   */
  async supersede(
    projectOrTargetId: string,
    targetIdOrReplacementEntry: string | MemoryEntryInput,
    maybeReplacementEntry?: MemoryEntryInput
  ): Promise<string> {
    const targetId =
      typeof targetIdOrReplacementEntry === 'string'
        ? targetIdOrReplacementEntry
        : projectOrTargetId;
    const replacementEntry =
      typeof targetIdOrReplacementEntry === 'string'
        ? maybeReplacementEntry!
        : targetIdOrReplacementEntry;
    const startTime = Date.now();
    await this.ensureWritableStorage();

    // Get target entry
    const targetEntry = await this.get(targetId);
    if (!targetEntry) {
      throw new Error(`Target entry not found: ${targetId}`);
    }

    // Create replacement entry
    const replacementId = await this.create(replacementEntry);

    // Update target entry: set status to "superseded"
    // Last-write-wins strategy for concurrent updates (Requirement 12.3)
    await this.updateEntry({
      ...targetEntry,
      status: 'superseded',
      superseded_by: replacementId,
      updated_at: new Date().toISOString(),
    });
    const duration = Date.now() - startTime;
    this.logConcurrentWrite('supersede', targetId, replacementEntry.created_by, duration);
    statisticsCache.invalidate(this.getCacheKey());

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
   * @param targetId - Memory_ID of entry to deprecate
   */
  async deprecate(projectOrTargetId: string, maybeTargetId?: string): Promise<void> {
    const targetId = maybeTargetId || projectOrTargetId;
    const startTime = Date.now();
    await this.ensureWritableStorage();

    // Get target entry
    const targetEntry = await this.get(targetId);
    if (!targetEntry) {
      throw new Error(`Target entry not found: ${targetId}`);
    }

    // Update entry: set status to "deprecated"
    // Last-write-wins strategy for concurrent updates (Requirement 12.3)
    await this.updateEntry({
      ...targetEntry,
      status: 'deprecated',
      superseded_by: null,
      updated_at: new Date().toISOString(),
    });
    const duration = Date.now() - startTime;
    this.logConcurrentWrite('deprecate', targetId, 'system', duration);
    statisticsCache.invalidate(this.getCacheKey());
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
   * @param filters - Query filters
   * @returns Array of matching memory entries
   */
  async query(
    projectOrFilters?: string | MemoryQueryFilters,
    maybeFilters?: MemoryQueryFilters
  ): Promise<MemoryEntry[]> {
    const filters =
      typeof projectOrFilters === 'string'
        ? maybeFilters || {}
        : projectOrFilters || {};
    const memoryPath = this.context.memoryRoot;

    // Graceful degradation: return empty array if not initialized
    if (!this.context.initialized || !this.context.durableMemoryEnabled) {
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
      const relatedEntries = await this.fetchRelatedEntries(entries);
      entries = [...entries, ...relatedEntries];
    }

    // Log query for pattern tracking (Requirement 22.6)
    try {
      await logQuery(this.context.memoryRoot, this.context.projectName, effectiveFilters, entries.length);
    } catch (error) {
      // Don't fail query if logging fails
      logger.warn('Failed to log query', { project: this.context.projectName, error });
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
   * @param id - Memory_ID
   * @returns Memory entry or null if not found
   */
  async get(projectOrId: string, maybeId?: string): Promise<MemoryEntry | null> {
    const id = maybeId || projectOrId;
    const memoryPath = this.context.memoryRoot;

    if (!this.context.initialized || !this.context.durableMemoryEnabled) {
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
   * @param id - Memory_ID
   * @returns Array of related memory entries
   */
  async getRelated(projectOrId: string, maybeId?: string): Promise<MemoryEntry[]> {
    const id = maybeId || projectOrId;
    const entry = await this.get(id);

    if (!entry || !entry.related_entries || entry.related_entries.length === 0) {
      return [];
    }

    const relatedEntries: MemoryEntry[] = [];

    for (const relatedId of entry.related_entries) {
      const relatedEntry = await this.get(relatedId);
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
   * @param dryRun - If true, preview changes without applying them
   * @returns Compaction report with details of what was/would be consolidated
   */
  async compact(projectOrDryRun?: string | boolean, maybeDryRun?: boolean): Promise<CompactionReport> {
    const dryRun =
      typeof projectOrDryRun === 'boolean'
        ? projectOrDryRun
        : maybeDryRun || false;
    const memoryPath = this.context.memoryRoot;
    await this.ensureWritableStorage();

    // Get current entry count
    const allEntries = await this.readAllIssues(memoryPath);
    const supersededCount = allEntries.filter(issue =>
      issue.labels.includes('status:superseded')
    ).length;

    // Warn if memory exceeds 100 entries (Requirement 6.2)
    if (allEntries.length > 100) {
      console.warn(
        `Warning: Memory for project "${this.context.projectName}" has ${allEntries.length} entries. ` +
        `Consider running compaction to consolidate old entries.`
      );
    }

    if (this.useJsonlFallback) {
      return {
        project: this.context.projectName,
        timestamp: new Date().toISOString(),
        dryRun,
        totalEntries: allEntries.length,
        supersededEntries: supersededCount,
        compactedCount: 0,
        output: 'Compaction is unavailable in local JSONL fallback mode',
        success: false,
      };
    }

    // Execute bd compact command
    const command = dryRun ? 'bd compact --dry-run' : 'bd compact';

    try {
      const output = execSync(command, {
        cwd: memoryPath,
        encoding: 'utf-8'
      });

      // Parse output to create report
      const report: CompactionReport = {
        project: this.context.projectName,
        timestamp: new Date().toISOString(),
        dryRun,
        totalEntries: allEntries.length,
        supersededEntries: supersededCount,
        compactedCount: this.parseCompactedCount(output),
        output: output.trim(),
        success: true
      };

      return report;
    } catch (error) {
      // If bd compact fails (e.g., command not available), return graceful report
      const report: CompactionReport = {
        project: this.context.projectName,
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
   * @returns Freshness report (empty in simplified implementation)
   */
  async checkFreshness(_project?: string): Promise<FreshnessReport> {
    await this.ensureWritableStorage();

    // Simplified: No temporal validity tracking, return empty report
    const report: FreshnessReport = {
      project: this.context.projectName,
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
   * @returns Evidence validation report (simplified)
   */
  async validateEvidence(_project?: string): Promise<EvidenceValidationReport> {
    const memoryPath = this.context.memoryRoot;
    await this.ensureInitialized();

    const allEntries = await this.readAllIssues(memoryPath);

    // Simplified: Just count evidence, don't check reachability
    let totalEvidence = 0;
    for (const issue of allEntries) {
      const entry = this.beadsIssueToMemoryEntry(issue);
      totalEvidence += entry.evidence.length;
    }

    const report: EvidenceValidationReport = {
      project: this.context.projectName,
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
  private parseCompactedCount(output: string): number {
    // Try to extract count from output (format may vary)
    const match = output.match(/compacted (\d+)/i) || output.match(/(\d+) entries/i);
    return match ? parseInt(match[1], 10) : 0;
  }


  /**
   * Read all issues from .beads/issues.jsonl
   */
  private async readAllIssues(memoryPath: string): Promise<BeadsIssue[]> {
    if (this.useJsonlFallback) {
      return this.readIssuesJsonl(memoryPath);
    }

    const beadsDir = this.getBeadsDir(memoryPath);
    try {
      const output = this.runBdCommand(['list', '--json'], memoryPath, beadsDir);
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        return parsed.map((data: any) => ({
          id: data.id,
          title: data.title || '',
          body: data.body || data.description || '',
          labels: data.labels || [],
          created_by: data.created_by || data.createdBy || '',
          created_at: data.created_at || data.createdAt || new Date().toISOString(),
          updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
        }));
      }
    } catch {
      // Fall through to JSONL read path.
    }

    return this.readIssuesJsonl(memoryPath);
  }

  /**
   * Convert a Beads issue to a Memory_Entry
   */
  private beadsIssueToMemoryEntry(issue: BeadsIssue): MemoryEntry {
    // Parse labels
    const labelMap = new Map<string, string>();
    const tags: string[] = [];
    
    issue.labels.forEach(label => {
      const [prefix, ...valueParts] = label.split(':');
      const value = valueParts.join(':'); // Handle values with colons
      
      if (prefix === 'tag') {
        tags.push(value);
      } else {
        labelMap.set(prefix, value);
      }
    });
    
    // Extract fields from labels
    const section = labelMap.get('section') as MemoryEntry['section'] || 'observations';
    const kind = labelMap.get('kind') as MemoryEntry['kind'] || 'other';
    const scope = labelMap.get('scope') || 'repo';
    const status = labelMap.get('status') as MemoryEntry['status'] || 'active';
    
    // Extract metadata from body
    let content = issue.body;
    let metadata: any = {
      subject: '',
      confidence: 0.5,
      evidence: [],
      provenance: {
        source_type: 'other',
      },
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
      } catch (error) {
        // If parsing fails, use defaults
      }
    }
    
    // Create Memory_Entry
    const memoryEntry: MemoryEntry = {
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
      provenance: metadata.provenance || { source_type: 'other' },
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
  private applyDefaultFilters(filters: MemoryQueryFilters): MemoryQueryFilters {
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
  private applyFilters(
    entries: MemoryEntry[],
    filters: MemoryQueryFilters
  ): MemoryEntry[] {
    let filtered = entries;

    // Section filter
    if (filters.section && filters.section.length > 0) {
      filtered = filtered.filter(e => filters.section!.includes(e.section));
    }

    // Kind filter
    if (filters.kind && filters.kind.length > 0) {
      filtered = filtered.filter(e => filters.kind!.includes(e.kind));
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter(e => filters.status!.includes(e.status));
    }

    // Scope filter with hierarchy expansion
    if (filters.scope && filters.scope.length > 0) {
      const expandedScopes = this.expandScopeHierarchy(filters.scope);
      filtered = filtered.filter(e => expandedScopes.includes(e.scope));
    }

    // Subject filter
    if (filters.subject && filters.subject.length > 0) {
      filtered = filtered.filter(e => filters.subject!.includes(e.subject));
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(e => 
        filters.tags!.some(tag => e.tags.includes(tag))
      );
    }

    // Confidence range filter
    if (filters.minConfidence !== undefined) {
      filtered = filtered.filter(e => e.confidence >= filters.minConfidence!);
    }
    if (filters.maxConfidence !== undefined) {
      filtered = filtered.filter(e => e.confidence <= filters.maxConfidence!);
    }

    // Created timestamp filter
    if (filters.createdAfter) {
      filtered = filtered.filter(e => e.created_at >= filters.createdAfter!);
    }
    if (filters.createdBefore) {
      filtered = filtered.filter(e => e.created_at <= filters.createdBefore!);
    }

    // Updated timestamp filter
    if (filters.updatedAfter) {
      filtered = filtered.filter(e => e.updated_at >= filters.updatedAfter!);
    }
    if (filters.updatedBefore) {
      filtered = filtered.filter(e => e.updated_at <= filters.updatedBefore!);
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
  private expandScopeHierarchy(scopes: string[]): string[] {
    const expanded = new Set<string>();

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
  private rankResults(
    entries: MemoryEntry[],
    filters: MemoryQueryFilters
  ): MemoryEntry[] {
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
  private calculateEvidenceQuality(entry: MemoryEntry): number {
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
  private calculateRecencyScore(entry: MemoryEntry, now: Date): number {
    const updatedAt = new Date(entry.updated_at);
    const ageInDays = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Decay function: score = 1.0 for today, 0.5 for 180 days ago, 0.0 for 365+ days ago
    if (ageInDays <= 0) return 1.0;
    if (ageInDays >= 365) return 0.0;

    return Math.max(0, 1.0 - (ageInDays / 365));
  }

  /**
   * Calculate scope match score (0.0 to 1.0).
   * Exact scope match = 1.0, hierarchical match = 0.5, no match = 0.0
   */
  private calculateScopeMatch(entry: MemoryEntry, filters: MemoryQueryFilters): number {
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
  private toSummaryOnly(entry: MemoryEntry): MemoryEntry {
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
      provenance: entry.provenance,
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
  private async fetchRelatedEntries(
    entries: MemoryEntry[]
  ): Promise<MemoryEntry[]> {
    const relatedIds = new Set<string>();
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
    const relatedEntries: MemoryEntry[] = [];

    for (const id of relatedIds) {
      const entry = await this.get(id);
      if (entry) {
        relatedEntries.push(entry);
      }
    }

    return relatedEntries;
  }

  /**
   * Ensure memory is initialized for the current project.
   * Standard behavior: fail fast with setup guidance if not initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.context.initialized) {
      throw new Error(
        `bass-agents is not initialized for this project root.\n` +
        `Run: bass-agents init --durable-memory`
      );
    }

    if (!this.context.durableMemoryEnabled) {
      throw new Error(
        `Durable memory is disabled for this project.\n` +
        `Re-run: bass-agents init --durable-memory`
      );
    }

    const beadsDir = this.getBeadsDir(this.context.memoryRoot);
    try {
      await fs.promises.access(beadsDir, fs.constants.F_OK);
    } catch {
      throw new Error(
        `Durable memory is not initialized at ${this.context.memoryRoot}.\n` +
        `Run: bass-agents init --durable-memory`
      );
    }
  }

  private async ensureWritableStorage(): Promise<void> {
    if (!this.context.initialized) {
      await this.init();
      return;
    }

    if (!this.context.durableMemoryEnabled) {
      throw new Error(
        `Durable memory is disabled for this project.\n` +
        `Re-run: bass-agents init --durable-memory`
      );
    }

    try {
      await fs.promises.access(this.getBeadsDir(this.context.memoryRoot), fs.constants.F_OK);
    } catch {
      await this.init();
    }
  }

  /**
   * Escape quotes in strings for shell commands
   */
  /**
   * Export memory entries to JSONL format
   * 
   * @param outputPath - Path to output JSONL file
   * @param filters - Optional filters for export
   */
  async export(
    projectOrOutputPath: string,
    outputPathOrFilters?: string | ExportFilters,
    maybeFilters?: ExportFilters
  ): Promise<void> {
    const outputPath =
      typeof outputPathOrFilters === 'string' ? outputPathOrFilters : projectOrOutputPath;
    const filters =
      typeof outputPathOrFilters === 'string' ? maybeFilters : outputPathOrFilters;
    const safeOutputPath = assertPathWithinProject(
      this.context.projectRoot,
      path.isAbsolute(outputPath)
        ? outputPath
        : path.join(this.context.projectRoot, outputPath),
      'export output'
    );
    await this.ensureWritableStorage();

    // Build query filters from export filters
    const queryFilters: MemoryQueryFilters = {
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
    const entries = await this.query(queryFilters);

    // Write entries to JSONL format (one JSON object per line)
    const lines = entries.map(entry => JSON.stringify(entry));
    const content = lines.join('\n');

    // Ensure output directory exists
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    const outputDir = pathModule.dirname(safeOutputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write to file
    await fs.writeFile(safeOutputPath, content, 'utf-8');
  }

  /**
   * Import memory entries from JSONL format
   * 
   * @param inputPath - Path to input JSONL file
   * @param conflictStrategy - Strategy for handling conflicts (skip, overwrite, merge)
   */
  async import(
    projectOrInputPath: string,
    inputPathOrConflictStrategy?: string | ConflictStrategy,
    maybeConflictStrategy: ConflictStrategy = 'skip'
  ): Promise<ImportReport> {
    const isConflictStrategy =
      inputPathOrConflictStrategy === 'skip' ||
      inputPathOrConflictStrategy === 'overwrite' ||
      inputPathOrConflictStrategy === 'merge';
    const inputPath =
      isConflictStrategy
        ? projectOrInputPath
        : typeof inputPathOrConflictStrategy === 'string'
        ? inputPathOrConflictStrategy
        : projectOrInputPath;
    const conflictStrategy =
      isConflictStrategy
        ? inputPathOrConflictStrategy
        : typeof inputPathOrConflictStrategy === 'string'
        ? maybeConflictStrategy
        : inputPathOrConflictStrategy || 'skip';
    const safeInputPath = assertPathWithinProject(
      this.context.projectRoot,
      path.isAbsolute(inputPath)
        ? inputPath
        : path.join(this.context.projectRoot, inputPath),
      'import input'
    );
    await this.ensureWritableStorage();

    const fs = await import('fs/promises');
    const content = await fs.readFile(safeInputPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const report: ImportReport = {
      project: this.context.projectName,
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
        const entry = this.withEntryProvenance(JSON.parse(lines[i]) as MemoryEntry, {
          source_type: 'import',
        });

        // Check if entry already exists
        const existing = await this.get(entry.id);

        if (existing) {
          // Handle conflict
          if (conflictStrategy === 'skip') {
            report.skipCount++;
            report.conflicts.push({
              id: entry.id,
              resolution: 'skipped',
            });
            continue;
          } else if (conflictStrategy === 'overwrite') {
            // Update existing entry by creating a new one with same ID
            // This is a simplified approach - in production, we'd need proper update logic
            await this.updateEntry(entry);
            report.successCount++;
            report.conflicts.push({
              id: entry.id,
              resolution: 'overwritten',
            });
          } else if (conflictStrategy === 'merge') {
            // Merge entries: prefer higher confidence, merge evidence arrays, union tags
            const merged = this.mergeEntries(existing, entry);
            await this.updateEntry(merged);
            report.successCount++;
            report.conflicts.push({
              id: entry.id,
              resolution: 'merged',
            });
          }
        } else {
          // Create new entry
          const entryInput: MemoryEntryInput = {
            section: entry.section,
            kind: entry.kind,
            subject: entry.subject,
            scope: entry.scope,
            summary: entry.summary,
            content: entry.content,
            tags: entry.tags,
            confidence: entry.confidence,
            evidence: entry.evidence,
            provenance: entry.provenance || {
              source_type: 'import',
            },
            status: entry.status,
            superseded_by: entry.superseded_by,
            related_entries: entry.related_entries,
            created_by: entry.created_by,
          };

          await this.create(entryInput);
          report.successCount++;
        }
      } catch (error) {
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
   */
  async syncContext(_project?: string): Promise<void> {
    await this.ensureInitialized();

    // Query high-confidence entries with code/artifact evidence
    const entries = await this.query({
      minConfidence: 0.8,
      status: ['active'],
      limit: 50,
    });

    // Filter entries with code or artifact evidence
    const relevantEntries = entries.filter(entry =>
      entry.evidence.some(e => e.type === 'code' || e.type === 'artifact')
    );

    // Group entries by subject
    const bySubject = new Map<string, MemoryEntry[]>();
    for (const entry of relevantEntries) {
      const subject = entry.subject;
      if (!bySubject.has(subject)) {
        bySubject.set(subject, []);
      }
      bySubject.get(subject)!.push(entry);
    }

    // Generate summaries for each subject
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    const contextDir = this.context.aiContextRoot;
    
    await fs.mkdir(contextDir, { recursive: true });

    for (const [subject, subjectEntries] of bySubject) {
      const filename = `${subject.replace(/[^a-z0-9-]/gi, '_')}.md`;
      const filepath = pathModule.join(contextDir, filename);

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
  private async updateEntry(entry: MemoryEntry): Promise<void> {
    const memoryPath = this.context.memoryRoot;
    
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
      provenance: entry.provenance,
      superseded_by: entry.superseded_by,
      related_entries: entry.related_entries,
      created_by: entry.created_by,
    };
    const body = `${entry.content}\n\n---METADATA---\n${JSON.stringify(metadata, null, 2)}`;

    try {
      if (this.useJsonlFallback) {
        await this.updateIssueJsonlFallback(memoryPath, entry.id, issue => ({
          ...issue,
          title: entry.summary,
          body,
          labels,
          updated_at: new Date().toISOString(),
        }));
        return;
      }
      this.runBdCommand(
        [
          'update',
          entry.id,
          '--title',
          entry.summary,
          '--description',
          body,
          '--set-labels',
          labels.join(','),
        ],
        memoryPath,
        this.getBeadsDir(memoryPath)
      );
      await this.syncJsonlExport(memoryPath);
    } catch (error) {
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
  private mergeEntries(existing: MemoryEntry, incoming: MemoryEntry): MemoryEntry {
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
      provenance: useIncoming ? incoming.provenance : existing.provenance,
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
  private mergeEvidence(
    existing: EvidenceReference[],
    incoming: EvidenceReference[]
  ): EvidenceReference[] {
    const evidenceMap = new Map<string, EvidenceReference>();

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

  private runBdCommand(args: string[], cwd: string, beadsDir?: string): string {
    const env = beadsDir
      ? { ...process.env, BEADS_DIR: beadsDir }
      : process.env;
    return execFileSync('bd', args, {
      cwd,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  private async syncJsonlExport(memoryPath: string): Promise<void> {
    if (this.useJsonlFallback) {
      return;
    }
    try {
      this.runBdCommand(['sync'], memoryPath, this.getBeadsDir(memoryPath));
    } catch {
      // Best-effort export sync; query/create should not fail on sync errors.
    }
  }

  private getBeadsDir(memoryPath: string): string {
    return path.join(memoryPath, '.beads');
  }

  private async initializeJsonlFallback(memoryPath: string): Promise<void> {
    const beadsDir = this.getBeadsDir(memoryPath);
    await fs.promises.mkdir(beadsDir, { recursive: true });

    const configPath = path.join(beadsDir, 'config.yaml');
    const issuesPath = path.join(beadsDir, 'issues.jsonl');
    const interactionsPath = path.join(beadsDir, 'interactions.jsonl');

    if (!fs.existsSync(configPath)) {
      await fs.promises.writeFile(
        configPath,
        `issue-prefix: "${this.sanitizeIssuePrefix(this.context.projectName)}"\n`,
        'utf-8'
      );
    }
    if (!fs.existsSync(issuesPath)) {
      await fs.promises.writeFile(issuesPath, '', 'utf-8');
    }
    if (!fs.existsSync(interactionsPath)) {
      await fs.promises.writeFile(interactionsPath, '', 'utf-8');
    }
  }

  private async readIssuesJsonl(memoryPath: string): Promise<BeadsIssue[]> {
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
    } catch {
      return [];
    }
  }

  private extractIssueId(output: string): string {
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

  private withDefaultProvenance(
    entry: MemoryEntryInput,
    fallback: MemoryProvenance
  ): MemoryEntryInput {
    return {
      ...entry,
      provenance: entry.provenance || fallback,
    };
  }

  private withEntryProvenance(
    entry: MemoryEntry,
    fallback: MemoryProvenance
  ): MemoryEntry {
    return {
      ...entry,
      provenance: entry.provenance || fallback,
    };
  }

  private shouldFallbackToJsonl(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('no beads database found') ||
      message.includes('requires CGO') ||
      message.includes('Dolt backend configured but database not found') ||
      message.includes('failed to open database') ||
      message.includes('Dolt server unreachable') ||
      message.includes('operation not permitted')
    );
  }

  private async createIssueJsonlFallback(
    memoryPath: string,
    input: { title: string; body: string; labels: string[]; created_by: string }
  ): Promise<string> {
    const issuesPath = path.join(memoryPath, '.beads', 'issues.jsonl');
    await fs.promises.mkdir(path.dirname(issuesPath), { recursive: true });

    const now = new Date().toISOString();
    const prefix = await this.getIssuePrefix(memoryPath);
    const hash = createHash('sha1')
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

  private async updateIssueJsonlFallback(
    memoryPath: string,
    issueId: string,
    updateFn: (issue: any) => any
  ): Promise<void> {
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

  private async getIssuePrefix(memoryPath: string): Promise<string> {
    const configPath = path.join(memoryPath, '.beads', 'config.yaml');
    try {
      const config = await fs.promises.readFile(configPath, 'utf-8');
      const match = config.match(/^\s*issue-prefix\s*:\s*"?([^"\n]+)"?\s*$/m);
      if (match && match[1].trim()) {
        return this.sanitizeIssuePrefix(match[1].trim());
      }
    } catch {
      // Fall back to project name.
    }
    return this.sanitizeIssuePrefix(this.context.projectName);
  }

  private sanitizeIssuePrefix(prefix: string): string {
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
   * @param entryId - Memory entry ID
   * @param agent - Agent identifier
   * @param duration - Operation duration in milliseconds
   */
  private logConcurrentWrite(
    operation: 'create' | 'supersede' | 'deprecate',
    entryId: string,
    agent: string,
    duration: number
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      operation,
      project: this.context.projectName,
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
   * 1. Navigate to the memory directory: ai-memory/.beads/
   * 2. Use git log to see history: git log --all -- "*{entryId}*"
   * 3. Use git show to view specific versions: git show {commit}:{path}
   * 
   * Requirements:
   * - 12.5: Provide version history for memory entries
   * 
   * @param entryId - Memory entry ID
   * @returns Instructions for accessing version history
   */
  getVersionHistoryInstructions(projectOrEntryId: string, maybeEntryId?: string): string {
    const entryId = maybeEntryId || projectOrEntryId;
    const memoryPath = this.context.memoryRoot;
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
   * @param dateRange - Optional date range filter
   * @param bypassCache - If true, bypass cache and force recomputation (for --no-cache flag)
   * @returns Memory statistics
   */
  async getStatistics(
    projectOrDateRange?: string | StatisticsDateRange,
    dateRangeOrBypassCache?: StatisticsDateRange | boolean,
    maybeBypassCache: boolean = false
  ): Promise<MemoryStatistics> {
    const dateRange =
      typeof projectOrDateRange === 'string'
        ? (typeof dateRangeOrBypassCache === 'boolean' ? undefined : dateRangeOrBypassCache)
        : projectOrDateRange;
    const bypassCache =
      typeof projectOrDateRange === 'string'
        ? maybeBypassCache
        : (typeof dateRangeOrBypassCache === 'boolean' ? dateRangeOrBypassCache : false);
    const cacheKey = this.getCacheKey();

    // Check cache first (unless bypassed)
    const cached = statisticsCache.get(cacheKey, dateRange, bypassCache);
    if (cached) {
      return cached;
    }

    const memoryPath = this.context.memoryRoot;

    // Graceful degradation: return empty stats if not initialized
    if (!this.context.initialized || !this.context.durableMemoryEnabled) {
      return this.emptyStatistics();
    }

    // Read all entries
    const issues = await this.readAllIssues(memoryPath);
    const entries = issues.map(issue => this.beadsIssueToMemoryEntry(issue));

    // Get query patterns
    const queryPatterns = await analyzeQueryPatterns(
      this.context.memoryRoot,
      this.context.projectName,
      dateRange
    );

    // Compute statistics
    const stats = getStatistics(entries, dateRange);

    // Merge query patterns into statistics
    const result = {
      ...stats,
      most_queried_subjects: queryPatterns.most_queried_subjects.map(s => ({ subject: s.subject, count: s.count })),
      most_queried_scopes: queryPatterns.most_queried_scopes.map(s => ({ scope: s.scope, count: s.count })),
      query_frequency_over_time: queryPatterns.query_frequency_over_time,
    } as any;

    // Cache the result
    statisticsCache.set(cacheKey, result, dateRange);

    return result;
  }

  /**
   * Get query pattern statistics.
   * 
   * Requirements:
   * - 22.6: Include query pattern statistics
   * 
   * @param dateRange - Optional date range filter
   * @returns Query pattern statistics
   */
  async getQueryPatterns(
    projectOrDateRange?: string | StatisticsDateRange,
    maybeDateRange?: StatisticsDateRange
  ): Promise<QueryPatternStats> {
    const dateRange =
      typeof projectOrDateRange === 'string' ? maybeDateRange : projectOrDateRange;
    return analyzeQueryPatterns(
      this.context.memoryRoot,
      this.context.projectName,
      dateRange
    );
  }

  /**
   * Return empty statistics for uninitialized projects
   */
  private emptyStatistics(): MemoryStatistics {
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

  private resolveArg<T>(valueOrLegacy: string | T, maybeValue?: T): T {
    return (typeof valueOrLegacy === 'string' ? maybeValue : valueOrLegacy) as T;
  }

  private getCacheKey(): string {
    return this.context.memoryRoot;
  }

  private refreshContext(): void {
    this.context = loadProjectContext(this.context.projectRoot);
  }
}
