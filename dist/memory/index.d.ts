/**
 * Durable Memory System
 *
 * Entry point for the durable memory system that provides persistent knowledge
 * storage for bass-agents using Beads as the underlying storage layer.
 */
export type { EvidenceReference, MemoryEntry, MemoryEntryInput, MemoryUpdate, MemoryQueryFilters, } from './types';
export { MemoryAdapter } from './memory-adapter';
export { validateMemoryEntry, isValidISO8601, isValidScope, } from './validation';
export type { ValidationResult } from './validation';
export { detectSecrets, validateNoSecrets } from './secret-detection';
export type { SecretDetectionResult } from './secret-detection';
//# sourceMappingURL=index.d.ts.map