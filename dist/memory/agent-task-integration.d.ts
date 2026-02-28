/**
 * AgentTask Integration
 *
 * Integrates durable memory with AgentTask execution by populating memory context
 * based on task parameters.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 9.5
 */
import { MemoryEntry } from './types';
/**
 * AgentTask interface (subset needed for memory integration)
 */
export interface AgentTask {
    task_id: string;
    project: {
        name: string;
        repo_root?: string;
    };
    goal: string;
    memory_enabled?: boolean;
    memory_context?: MemoryEntry[];
    [key: string]: any;
}
/**
 * Populate memory context for an AgentTask.
 *
 * This function queries relevant memory entries based on the task's project, goal,
 * and other parameters, then populates the memory_context field with up to 10
 * high-confidence entries.
 *
 * Requirements:
 * - 8.1: Query relevant entries based on project, goal, scope, subject
 * - 8.2: Populate memory_context with up to 10 Memory_Entry objects
 * - 8.3: Select entries with highest confidence scores
 * - 8.4: Exclude entries with status="superseded", "deprecated", or "draft"
 * - 8.5: Exclude entries where valid_to is expired
 * - 8.8: Prefer entries with evidence type "code" or "artifact"
 * - 8.9: Include summary field to reduce token usage
 * - 9.5: Handle uninitialized memory gracefully
 *
 * @param task - AgentTask to populate with memory context
 * @param workspaceRoot - Workspace root directory
 * @returns Modified AgentTask with memory_context populated
 */
export declare function populateMemoryContext(task: AgentTask, workspaceRoot: string): Promise<AgentTask>;
//# sourceMappingURL=agent-task-integration.d.ts.map