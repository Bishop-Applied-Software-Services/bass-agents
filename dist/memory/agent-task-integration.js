"use strict";
/**
 * AgentTask Integration
 *
 * Integrates durable memory with AgentTask execution by populating memory context
 * based on task parameters.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 9.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.populateMemoryContext = populateMemoryContext;
const memory_adapter_1 = require("./memory-adapter");
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
async function populateMemoryContext(task, workspaceRoot) {
    // If memory is not enabled, return task unchanged (Requirement 8.7)
    if (!task.memory_enabled) {
        return task;
    }
    const adapter = new memory_adapter_1.MemoryAdapter(workspaceRoot);
    const project = task.project.name;
    try {
        // Build query filters based on task parameters
        const filters = {
            // Default filters for smart retrieval (Requirements 8.4, 8.5)
            status: ['active'], // Exclude superseded, deprecated, draft
            minConfidence: 0.6, // Default confidence threshold
            limit: 10, // Requirement 8.2: max 10 entries
            summaryOnly: false, // Include full content for context
        };
        // Extract potential subjects/scopes from task goal
        // This is a simple heuristic - in production, could use NLP or explicit task metadata
        const goalLower = task.goal.toLowerCase();
        // Try to identify relevant sections based on goal keywords
        if (goalLower.includes('decide') || goalLower.includes('design') || goalLower.includes('architecture')) {
            filters.section = ['decisions'];
        }
        else if (goalLower.includes('state') || goalLower.includes('status') || goalLower.includes('current')) {
            filters.section = ['state'];
        }
        else if (goalLower.includes('learn') || goalLower.includes('pattern') || goalLower.includes('insight')) {
            filters.section = ['learnings'];
        }
        else if (goalLower.includes('observe') || goalLower.includes('finding') || goalLower.includes('test')) {
            filters.section = ['observations'];
        }
        // Query memory entries (Requirement 8.1)
        let entries = await adapter.query(project, filters);
        // If no entries found with section filter, try without it
        if (entries.length === 0 && filters.section) {
            delete filters.section;
            entries = await adapter.query(project, filters);
        }
        // Prefer entries with code/artifact evidence (Requirement 8.8)
        entries = prioritizeByEvidenceType(entries);
        // Limit to 10 entries (Requirement 8.2)
        entries = entries.slice(0, 10);
        // Populate memory_context
        task.memory_context = entries;
        return task;
    }
    catch (error) {
        // Graceful degradation (Requirement 9.5)
        // If memory query fails (e.g., uninitialized memory), log warning and return empty context
        console.warn(`Warning: Failed to populate memory context for task ${task.task_id}: ${error instanceof Error ? error.message : String(error)}`);
        task.memory_context = [];
        return task;
    }
}
/**
 * Prioritize entries by evidence type.
 * Prefer entries with code/artifact evidence over other types.
 *
 * Requirement 8.8: Prefer entries with evidence type "code" or "artifact"
 */
function prioritizeByEvidenceType(entries) {
    // Separate entries by evidence type
    const withCodeOrArtifact = [];
    const withOtherEvidence = [];
    for (const entry of entries) {
        const hasCodeOrArtifact = entry.evidence.some(ev => ev.type === 'code' || ev.type === 'artifact');
        if (hasCodeOrArtifact) {
            withCodeOrArtifact.push(entry);
        }
        else {
            withOtherEvidence.push(entry);
        }
    }
    // Return code/artifact entries first, then others
    return [...withCodeOrArtifact, ...withOtherEvidence];
}
//# sourceMappingURL=agent-task-integration.js.map