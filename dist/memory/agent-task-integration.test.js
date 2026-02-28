"use strict";
/**
 * Tests for AgentTask Integration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const agent_task_integration_1 = require("./agent-task-integration");
const memory_adapter_1 = require("./memory-adapter");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
(0, vitest_1.describe)('AgentTask Integration', () => {
    let tempDir;
    let workspaceRoot;
    (0, vitest_1.beforeEach)(async () => {
        // Create temporary workspace
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-test-'));
        workspaceRoot = tempDir;
    });
    (0, vitest_1.afterEach)(async () => {
        // Clean up temporary workspace
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)('populateMemoryContext', () => {
        (0, vitest_1.it)('should return task unchanged when memory_enabled is false', async () => {
            const task = {
                task_id: 'test-1',
                project: { name: 'test-project' },
                goal: 'Test goal',
                memory_enabled: false,
            };
            const result = await (0, agent_task_integration_1.populateMemoryContext)(task, workspaceRoot);
            (0, vitest_1.expect)(result.memory_enabled).toBe(false);
            (0, vitest_1.expect)(result.memory_context).toBeUndefined();
        });
        (0, vitest_1.it)('should return empty memory_context when memory is uninitialized (graceful degradation)', async () => {
            const task = {
                task_id: 'test-2',
                project: { name: 'test-project' },
                goal: 'Test goal',
                memory_enabled: true,
            };
            const result = await (0, agent_task_integration_1.populateMemoryContext)(task, workspaceRoot);
            (0, vitest_1.expect)(result.memory_enabled).toBe(true);
            (0, vitest_1.expect)(result.memory_context).toEqual([]);
        });
        (0, vitest_1.it)('should populate memory_context with up to 10 entries when memory is initialized', async () => {
            const project = 'test-project';
            const adapter = new memory_adapter_1.MemoryAdapter(workspaceRoot);
            // Initialize memory
            await adapter.init(project);
            // Create some test entries
            for (let i = 0; i < 15; i++) {
                await adapter.create(project, {
                    section: 'decisions',
                    kind: 'decision',
                    subject: `test-subject-${i}`,
                    scope: 'repo',
                    summary: `Test decision ${i}`,
                    content: `This is test decision ${i}`,
                    confidence: 0.8,
                    evidence: [
                        {
                            type: 'code',
                            uri: `file://test-${i}.ts`,
                            note: 'Test evidence',
                        },
                    ],
                    created_by: 'test-agent',
                });
            }
            const task = {
                task_id: 'test-3',
                project: { name: project },
                goal: 'Test goal with decisions',
                memory_enabled: true,
            };
            const result = await (0, agent_task_integration_1.populateMemoryContext)(task, workspaceRoot);
            (0, vitest_1.expect)(result.memory_enabled).toBe(true);
            (0, vitest_1.expect)(result.memory_context).toBeDefined();
            (0, vitest_1.expect)(result.memory_context.length).toBeLessThanOrEqual(10);
            (0, vitest_1.expect)(result.memory_context.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('should prefer entries with code/artifact evidence', async () => {
            const project = 'test-project';
            const adapter = new memory_adapter_1.MemoryAdapter(workspaceRoot);
            // Initialize memory
            await adapter.init(project);
            // Create entry with code evidence
            await adapter.create(project, {
                section: 'decisions',
                kind: 'decision',
                subject: 'code-subject',
                scope: 'repo',
                summary: 'Decision with code evidence',
                content: 'This has code evidence',
                confidence: 0.7,
                evidence: [
                    {
                        type: 'code',
                        uri: 'file://code.ts',
                        note: 'Code evidence',
                    },
                ],
                created_by: 'test-agent',
            });
            // Create entry with assumption evidence
            await adapter.create(project, {
                section: 'decisions',
                kind: 'decision',
                subject: 'assumption-subject',
                scope: 'repo',
                summary: 'Decision with assumption evidence',
                content: 'This has assumption evidence',
                confidence: 0.9, // Higher confidence but worse evidence type
                evidence: [
                    {
                        type: 'assumption',
                        uri: '',
                        note: 'Assumption evidence',
                    },
                ],
                created_by: 'test-agent',
            });
            const task = {
                task_id: 'test-4',
                project: { name: project },
                goal: 'Test goal',
                memory_enabled: true,
            };
            const result = await (0, agent_task_integration_1.populateMemoryContext)(task, workspaceRoot);
            (0, vitest_1.expect)(result.memory_context).toBeDefined();
            (0, vitest_1.expect)(result.memory_context.length).toBeGreaterThan(0);
            // First entry should have code evidence (preferred)
            const firstEntry = result.memory_context[0];
            const hasCodeOrArtifact = firstEntry.evidence.some(ev => ev.type === 'code' || ev.type === 'artifact');
            (0, vitest_1.expect)(hasCodeOrArtifact).toBe(true);
        });
        (0, vitest_1.it)('should filter by section based on goal keywords', async () => {
            const project = 'test-project';
            const adapter = new memory_adapter_1.MemoryAdapter(workspaceRoot);
            // Initialize memory
            await adapter.init(project);
            // Create entries in different sections
            await adapter.create(project, {
                section: 'decisions',
                kind: 'decision',
                subject: 'decision-subject',
                scope: 'repo',
                summary: 'A decision',
                content: 'Decision content',
                confidence: 0.8,
                evidence: [{ type: 'code', uri: 'file://test.ts', note: 'Test' }],
                created_by: 'test-agent',
            });
            await adapter.create(project, {
                section: 'learnings',
                kind: 'other',
                subject: 'learning-subject',
                scope: 'repo',
                summary: 'A learning',
                content: 'Learning content',
                confidence: 0.8,
                evidence: [{ type: 'code', uri: 'file://test.ts', note: 'Test' }],
                created_by: 'test-agent',
            });
            const task = {
                task_id: 'test-5',
                project: { name: project },
                goal: 'Learn about patterns in the codebase',
                memory_enabled: true,
            };
            const result = await (0, agent_task_integration_1.populateMemoryContext)(task, workspaceRoot);
            (0, vitest_1.expect)(result.memory_context).toBeDefined();
            if (result.memory_context.length > 0) {
                // Should prefer learnings section based on "learn" keyword
                const sections = result.memory_context.map(e => e.section);
                (0, vitest_1.expect)(sections).toContain('learnings');
            }
        });
    });
});
//# sourceMappingURL=agent-task-integration.test.js.map