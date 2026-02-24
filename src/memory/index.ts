/**
 * Durable Memory System
 * 
 * Entry point for the durable memory system that provides persistent knowledge
 * storage for bass-agents using Beads as the underlying storage layer.
 */

// Export types
export type {
  EvidenceReference,
  MemoryEntry,
  MemoryEntryInput,
  MemoryUpdate,
  MemoryQueryFilters,
} from './types';

// Export MemoryAdapter
export { MemoryAdapter } from './memory-adapter';

// Export validation functions
export {
  validateMemoryEntry,
  isValidISO8601,
  isValidScope,
} from './validation';

export type { ValidationResult } from './validation';

// Export secret detection
export { detectSecrets, validateNoSecrets } from './secret-detection';
export type { SecretDetectionResult } from './secret-detection';
