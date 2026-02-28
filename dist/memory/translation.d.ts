/**
 * Translation between Memory_Entry and Beads Issue formats
 *
 * Maps Memory_Entry fields to Beads labels and custom fields according to the design:
 * - section, kind, scope, status, tags -> Beads labels
 * - confidence, evidence, subject, valid_from, valid_to -> Beads custom fields
 * - superseded_by, related_entries -> Beads dependencies
 */
import { MemoryEntry, MemoryEntryInput, BeadsIssue } from './types';
/**
 * Convert a Memory_Entry to a Beads issue format
 */
export declare function memoryEntryToBeadsIssue(entry: MemoryEntry | MemoryEntryInput): BeadsIssue;
/**
 * Convert a Beads issue to a Memory_Entry
 */
export declare function beadsIssueToMemoryEntry(issue: BeadsIssue): MemoryEntry;
/**
 * Extract label value from a label string (e.g., "section:decisions" -> "decisions")
 */
export declare function extractLabelValue(label: string, prefix: string): string | null;
/**
 * Build a label string from prefix and value (e.g., "section", "decisions" -> "section:decisions")
 */
export declare function buildLabel(prefix: string, value: string): string;
//# sourceMappingURL=translation.d.ts.map