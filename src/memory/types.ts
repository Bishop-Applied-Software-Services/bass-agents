/**
 * Durable Memory Types
 * 
 * Type definitions for the durable memory system based on the Memory_Entry schema
 * and related data structures.
 */

/**
 * Evidence reference for a memory entry
 */
export interface EvidenceReference {
  type: 'code' | 'artifact' | 'log' | 'screenshot' | 'assumption' | 'ticket' | 'doc';
  uri: string;
  note: string;
}

/**
 * Provenance for a memory entry so write paths remain distinguishable.
 */
export type MemoryProvenanceSource =
  | 'field_note'
  | 'agent_result'
  | 'manual'
  | 'import'
  | 'validation'
  | 'compaction'
  | 'system'
  | 'other';

export interface MemoryProvenance {
  source_type: MemoryProvenanceSource;
  source_ref?: string;
  note?: string;
}

/**
 * Memory entry representing a single unit of stored knowledge
 */
export interface MemoryEntry {
  id: string;
  section: 'decisions' | 'state' | 'observations' | 'learnings';
  kind: 'decision' | 'requirement' | 'invariant' | 'incident' | 'metric' | 'hypothesis' | 'runbook_step' | 'other';
  subject: string;
  scope: string;
  summary: string;
  content: string;
  tags: string[];
  confidence: number;
  evidence: EvidenceReference[];
  provenance: MemoryProvenance;
  status: 'active' | 'superseded' | 'deprecated' | 'draft';
  superseded_by: string | null;
  related_entries: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new memory entry (id, created_at, updated_at are generated)
 */
export interface MemoryEntryInput {
  section: 'decisions' | 'state' | 'observations' | 'learnings';
  kind: 'decision' | 'requirement' | 'invariant' | 'incident' | 'metric' | 'hypothesis' | 'runbook_step' | 'other';
  subject: string;
  scope: string;
  summary: string;
  content: string;
  tags?: string[];
  confidence: number;
  evidence: EvidenceReference[];
  provenance?: MemoryProvenance;
  status?: 'active' | 'superseded' | 'deprecated' | 'draft';
  superseded_by?: string | null;
  related_entries?: string[];
  created_by: string;
}

/**
 * Memory update operation
 */
export interface MemoryUpdate {
  operation: 'create' | 'supersede' | 'deprecate';
  entry: MemoryEntryInput;
  target_id?: string;
}

/**
 * Filters for querying memory entries
 */
export interface MemoryQueryFilters {
  section?: string[];
  kind?: string[];
  scope?: string[];
  subject?: string[];
  tags?: string[];
  status?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  summaryOnly?: boolean;
  includeRelated?: boolean;
  limit?: number;
}

/**
 * Report from a compaction operation
 */
export interface CompactionReport {
  project: string;
  timestamp: string;
  dryRun: boolean;
  totalEntries: number;
  supersededEntries: number;
  compactedCount: number;
  output: string;
  success: boolean;
}

/**
 * Report from a freshness check operation
 */
export interface FreshnessReport {
  project: string;
  timestamp: string;
  expiringEntries: Array<{
    id: string;
    summary: string;
    valid_to: string;
  }>;
  message?: string;
}

/**
 * Report from an evidence validation operation
 */
export interface EvidenceValidationReport {
  project: string;
  timestamp: string;
  totalEntries: number;
  totalEvidence: number;
  staleEvidence: Array<{
    entryId: string;
    evidenceUri: string;
    error: string;
  }>;
  message?: string;
}

/**
 * Filters for exporting memory entries
 */
export interface ExportFilters {
  section?: string[];
  minConfidence?: number;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Conflict resolution strategy for import operations
 */
export type ConflictStrategy = 'skip' | 'overwrite' | 'merge';

/**
 * Report from an import operation
 */
export interface ImportReport {
  project: string;
  timestamp: string;
  totalEntries: number;
  successCount: number;
  skipCount: number;
  errorCount: number;
  conflicts: Array<{
    id: string;
    resolution: string;
  }>;
  errors: Array<{
    line: number;
    error: string;
  }>;
  message?: string;
}
