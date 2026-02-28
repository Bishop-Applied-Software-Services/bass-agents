/**
 * AgentResult Integration
 * 
 * Integrates durable memory with AgentResult processing by applying memory updates
 * from agent execution results.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6
 */

import { MemoryAdapter } from './memory-adapter';
import { MemoryUpdate, MemoryEntryInput } from './types';
import { validateMemoryEntry } from './validation';

/**
 * AgentResult interface (subset needed for memory integration)
 */
export interface AgentResult {
  task_id: string;
  status: 'pending' | 'success' | 'partial' | 'blocked';
  summary: string;
  memory_updates?: MemoryUpdate[];
  [key: string]: any;
}

/**
 * Result of applying memory updates
 */
export interface ApplyMemoryUpdatesResult {
  totalUpdates: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    updateIndex: number;
    operation: string;
    error: string;
  }>;
}

/**
 * Apply memory updates from an AgentResult.
 * 
 * This function processes the memory_updates array from an AgentResult, validates
 * each update, and applies them to the memory system. It handles partial failures
 * gracefully by logging errors and continuing with remaining updates.
 * 
 * Requirements:
 * - 9.1: Apply memory updates from AgentResult after validation
 * - 9.2: Validate each Memory_Update for required fields before applying
 * - 9.3: Log errors and skip invalid updates without failing entire operation
 * - 9.4: Record agent identifier in created_by field
 * - 9.6: Auto-initialize memory if uninitialized on first write
 * 
 * @param result - AgentResult containing memory updates
 * @param project - Project name
 * @param workspaceRoot - Workspace root directory
 * @param agentIdentifier - Identifier of the agent that produced this result
 * @returns Result summary with success/error counts
 */
export async function applyMemoryUpdates(
  result: AgentResult,
  project: string,
  workspaceRoot: string,
  agentIdentifier: string
): Promise<ApplyMemoryUpdatesResult> {
  const applyResult: ApplyMemoryUpdatesResult = {
    totalUpdates: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
  };

  // If no memory updates, return early
  if (!result.memory_updates || result.memory_updates.length === 0) {
    return applyResult;
  }

  const adapter = new MemoryAdapter(workspaceRoot);
  applyResult.totalUpdates = result.memory_updates.length;

  // Process each memory update
  for (let i = 0; i < result.memory_updates.length; i++) {
    const update = result.memory_updates[i];

    try {
      // Validate the update (Requirement 9.2)
      const validationError = validateMemoryUpdate(update);
      if (validationError) {
        throw new Error(validationError);
      }

      // Set created_by field to agent identifier (Requirement 9.4)
      const entryWithAgent: MemoryEntryInput = {
        ...update.entry,
        created_by: agentIdentifier,
        provenance: {
          source_type: update.entry.provenance?.source_type || 'agent_result',
          source_ref:
            update.entry.provenance?.source_ref ||
            `task:${result.task_id}`,
          note: update.entry.provenance?.note,
        },
      };

      // Apply the update based on operation type
      switch (update.operation) {
        case 'create':
          // Validate that required fields for create are present
          if (!update.entry.section) {
            throw new Error('Missing required field: section');
          }
          if (!update.entry.kind) {
            throw new Error('Missing required field: kind');
          }
          if (!update.entry.subject) {
            throw new Error('Missing required field: subject');
          }
          if (!update.entry.scope) {
            throw new Error('Missing required field: scope');
          }
          if (!update.entry.summary) {
            throw new Error('Missing required field: summary');
          }

          // Create the entry (auto-initializes if needed - Requirement 9.6)
          await adapter.create(project, entryWithAgent);
          applyResult.successCount++;
          break;

        case 'supersede':
          // Validate that target_id is present
          if (!update.target_id) {
            throw new Error('Missing required field: target_id for supersede operation');
          }

          // Supersede the entry
          await adapter.supersede(project, update.target_id, entryWithAgent);
          applyResult.successCount++;
          break;

        case 'deprecate':
          // Validate that target_id is present
          if (!update.target_id) {
            throw new Error('Missing required field: target_id for deprecate operation');
          }

          // Deprecate the entry
          await adapter.deprecate(project, update.target_id);
          applyResult.successCount++;
          break;

        default:
          throw new Error(`Unknown operation: ${(update as any).operation}`);
      }
    } catch (error) {
      // Log error and continue with remaining updates (Requirement 9.3)
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(
        `Error applying memory update ${i + 1}/${applyResult.totalUpdates} ` +
        `(operation: ${update.operation}): ${errorMessage}`
      );

      applyResult.errorCount++;
      applyResult.errors.push({
        updateIndex: i,
        operation: update.operation,
        error: errorMessage,
      });
    }
  }

  return applyResult;
}

/**
 * Validate a Memory_Update object.
 * 
 * Checks that required fields are present based on the operation type.
 * 
 * Requirement 9.2: Validate each Memory_Update for required fields
 * 
 * @param update - Memory update to validate
 * @returns Error message if invalid, null if valid
 */
function validateMemoryUpdate(update: MemoryUpdate): string | null {
  // Validate operation field
  if (!update.operation) {
    return 'Missing required field: operation';
  }

  if (!['create', 'supersede', 'deprecate'].includes(update.operation)) {
    return `Invalid operation: ${update.operation}`;
  }

  // Validate entry field
  if (!update.entry) {
    return 'Missing required field: entry';
  }

  // Validate required entry fields (common to all operations)
  if (!update.entry.content) {
    return 'Missing required field: entry.content';
  }

  if (update.entry.confidence === undefined || update.entry.confidence === null) {
    return 'Missing required field: entry.confidence';
  }

  if (!update.entry.evidence || !Array.isArray(update.entry.evidence)) {
    return 'Missing required field: entry.evidence (must be an array)';
  }

  if (update.entry.evidence.length === 0) {
    return 'entry.evidence array must contain at least one evidence object';
  }

  if (
    update.entry.provenance?.source_type === 'field_note' &&
    !update.entry.provenance?.source_ref
  ) {
    return 'Missing required field: entry.provenance.source_ref for field_note provenance';
  }

  // Validate evidence objects
  for (let i = 0; i < update.entry.evidence.length; i++) {
    const evidence = update.entry.evidence[i];
    
    if (!evidence.type) {
      return `Missing required field: entry.evidence[${i}].type`;
    }
    
    if (!evidence.uri) {
      return `Missing required field: entry.evidence[${i}].uri`;
    }
    
    if (!evidence.note) {
      return `Missing required field: entry.evidence[${i}].note`;
    }
  }

  // Validate operation-specific fields
  if (update.operation === 'create') {
    // For create, validate that all required fields are present
    // (These will be checked again in applyMemoryUpdates, but we validate here too)
    const requiredFields = ['section', 'kind', 'subject', 'scope', 'summary'];
    for (const field of requiredFields) {
      if (!(update.entry as any)[field]) {
        return `Missing required field for create operation: entry.${field}`;
      }
    }
  }

  if (update.operation === 'supersede' || update.operation === 'deprecate') {
    // For supersede/deprecate, validate that target_id is present
    if (!update.target_id) {
      return `Missing required field for ${update.operation} operation: target_id`;
    }
  }

  // Use the full validation for create operations
  if (update.operation === 'create') {
    const entryInput: MemoryEntryInput = {
      section: update.entry.section!,
      kind: update.entry.kind!,
      subject: update.entry.subject!,
      scope: update.entry.scope!,
      summary: update.entry.summary!,
      content: update.entry.content,
      confidence: update.entry.confidence,
      evidence: update.entry.evidence,
      provenance: update.entry.provenance || {
        source_type: 'agent_result',
      },
      tags: update.entry.tags,
      status: update.entry.status,
      related_entries: update.entry.related_entries,
      created_by: '', // Will be set by applyMemoryUpdates
    };

    const validationResult = validateMemoryEntry(entryInput);
    if (!validationResult.valid) {
      return `Entry validation failed: ${validationResult.errors.join(', ')}`;
    }
  }

  return null;
}
