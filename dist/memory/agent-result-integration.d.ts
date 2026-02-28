/**
 * AgentResult Integration
 *
 * Integrates durable memory with AgentResult processing by applying memory updates
 * from agent execution results.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6
 */
import { MemoryUpdate } from './types';
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
export declare function applyMemoryUpdates(result: AgentResult, project: string, workspaceRoot: string, agentIdentifier: string): Promise<ApplyMemoryUpdatesResult>;
//# sourceMappingURL=agent-result-integration.d.ts.map