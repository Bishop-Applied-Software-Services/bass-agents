"use strict";
/**
 * Tests for AgentResult Integration
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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const agent_result_integration_1 = require("./agent-result-integration");
const memory_adapter_1 = require("./memory-adapter");
const TEST_WORKSPACE = path.join(__dirname, '../../test-workspace-agent-result');
const TEST_PROJECT = 'test-project';
(0, vitest_1.describe)('AgentResult Integration', () => {
    (0, vitest_1.beforeEach)(async () => {
        // Clean up test workspace
        await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
        await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    });
    (0, vitest_1.afterEach)(async () => {
        // Clean up test workspace
        await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    });
    (0, vitest_1.describe)('applyMemoryUpdates', () => {
        (0, vitest_1.it)('should apply create operation successfully', async () => {
            const result = {
                task_id: 'task-001',
                status: 'success',
                summary: 'Test task completed',
                memory_updates: [
                    {
                        operation: 'create',
                        entry: {
                            section: 'decisions',
                            kind: 'decision',
                            subject: 'test-subject',
                            scope: 'repo',
                            summary: 'Test decision',
                            content: 'This is a test decision',
                            confidence: 0.8,
                            created_by: 'test-agent',
                            evidence: [
                                {
                                    type: 'code',
                                    uri: 'https://github.com/test/repo/blob/main/file.ts#L10',
                                    note: 'Test evidence',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.totalUpdates).toBe(1);
            (0, vitest_1.expect)(applyResult.successCount).toBe(1);
            (0, vitest_1.expect)(applyResult.errorCount).toBe(0);
            (0, vitest_1.expect)(applyResult.errors).toHaveLength(0);
            // Verify entry was created
            const adapter = new memory_adapter_1.MemoryAdapter(TEST_WORKSPACE);
            const entries = await adapter.query(TEST_PROJECT, {});
            (0, vitest_1.expect)(entries).toHaveLength(1);
            (0, vitest_1.expect)(entries[0].subject).toBe('test-subject');
            (0, vitest_1.expect)(entries[0].created_by).toBe('test-agent');
        });
        (0, vitest_1.it)('should auto-initialize memory on first write', async () => {
            // Verify memory is not initialized
            const memoryPath = path.join(TEST_WORKSPACE, 'ai-memory', TEST_PROJECT);
            const configPath = path.join(memoryPath, '.config.json');
            await (0, vitest_1.expect)(fs.access(configPath)).rejects.toThrow();
            const result = {
                task_id: 'task-002',
                status: 'success',
                summary: 'Test task',
                memory_updates: [
                    {
                        operation: 'create',
                        entry: {
                            section: 'observations',
                            kind: 'other',
                            subject: 'auto-init-test',
                            scope: 'repo',
                            summary: 'Auto-init test',
                            content: 'Testing auto-initialization',
                            confidence: 0.7,
                            created_by: 'test-agent',
                            evidence: [
                                {
                                    type: 'assumption',
                                    uri: 'n/a',
                                    note: 'Test assumption',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.successCount).toBe(1);
            // Verify memory was auto-initialized
            await (0, vitest_1.expect)(fs.access(configPath)).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should handle partial failures gracefully', async () => {
            const result = {
                task_id: 'task-003',
                status: 'success',
                summary: 'Test task',
                memory_updates: [
                    {
                        operation: 'create',
                        entry: {
                            section: 'decisions',
                            kind: 'decision',
                            subject: 'valid-entry',
                            scope: 'repo',
                            summary: 'Valid entry',
                            content: 'This is valid',
                            confidence: 0.8,
                            evidence: [
                                {
                                    type: 'code',
                                    uri: 'https://example.com',
                                    note: 'Test',
                                },
                            ],
                        },
                    },
                    {
                        operation: 'create',
                        entry: {
                            // Missing required fields
                            section: 'decisions',
                            content: 'Invalid entry',
                            confidence: 0.5,
                            evidence: [],
                        },
                    },
                    {
                        operation: 'create',
                        entry: {
                            section: 'observations',
                            kind: 'other',
                            subject: 'another-valid',
                            scope: 'repo',
                            summary: 'Another valid entry',
                            content: 'This is also valid',
                            confidence: 0.7,
                            evidence: [
                                {
                                    type: 'doc',
                                    uri: 'https://docs.example.com',
                                    note: 'Documentation',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.totalUpdates).toBe(3);
            (0, vitest_1.expect)(applyResult.successCount).toBe(2);
            (0, vitest_1.expect)(applyResult.errorCount).toBe(1);
            (0, vitest_1.expect)(applyResult.errors).toHaveLength(1);
            (0, vitest_1.expect)(applyResult.errors[0].updateIndex).toBe(1);
            // Verify valid entries were created
            const adapter = new memory_adapter_1.MemoryAdapter(TEST_WORKSPACE);
            const entries = await adapter.query(TEST_PROJECT, {});
            (0, vitest_1.expect)(entries).toHaveLength(2);
        });
        (0, vitest_1.it)('should apply supersede operation successfully', async () => {
            // First create an entry
            const adapter = new memory_adapter_1.MemoryAdapter(TEST_WORKSPACE);
            await adapter.init(TEST_PROJECT);
            const entryId = await adapter.create(TEST_PROJECT, {
                section: 'decisions',
                kind: 'decision',
                subject: 'old-decision',
                scope: 'repo',
                summary: 'Old decision',
                content: 'This is the old decision',
                confidence: 0.6,
                evidence: [
                    {
                        type: 'assumption',
                        uri: 'n/a',
                        note: 'Old assumption',
                    },
                ],
                created_by: 'test-agent',
            });
            // Now supersede it
            const result = {
                task_id: 'task-004',
                status: 'success',
                summary: 'Supersede test',
                memory_updates: [
                    {
                        operation: 'supersede',
                        target_id: entryId,
                        entry: {
                            section: 'decisions',
                            kind: 'decision',
                            subject: 'new-decision',
                            scope: 'repo',
                            summary: 'New decision',
                            content: 'This is the new decision',
                            confidence: 0.9,
                            created_by: 'test-agent',
                            evidence: [
                                {
                                    type: 'code',
                                    uri: 'https://github.com/test/repo',
                                    note: 'New evidence',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.successCount).toBe(1);
            // Verify old entry is superseded
            const oldEntry = await adapter.get(TEST_PROJECT, entryId);
            (0, vitest_1.expect)(oldEntry?.status).toBe('superseded');
            // Verify new entry exists
            const allEntries = await adapter.query(TEST_PROJECT, { status: ['active'] });
            (0, vitest_1.expect)(allEntries).toHaveLength(1);
            (0, vitest_1.expect)(allEntries[0].subject).toBe('new-decision');
        });
        (0, vitest_1.it)('should apply deprecate operation successfully', async () => {
            // First create an entry
            const adapter = new memory_adapter_1.MemoryAdapter(TEST_WORKSPACE);
            await adapter.init(TEST_PROJECT);
            const entryId = await adapter.create(TEST_PROJECT, {
                section: 'state',
                kind: 'other',
                subject: 'old-state',
                scope: 'repo',
                summary: 'Old state',
                content: 'This is old state',
                confidence: 0.5,
                evidence: [
                    {
                        type: 'log',
                        uri: 'file:///logs/old.log',
                        note: 'Old log',
                    },
                ],
                created_by: 'test-agent',
            });
            // Now deprecate it
            const result = {
                task_id: 'task-005',
                status: 'success',
                summary: 'Deprecate test',
                memory_updates: [
                    {
                        operation: 'deprecate',
                        target_id: entryId,
                        entry: {
                            section: 'state',
                            kind: 'other',
                            subject: 'deprecated-entry',
                            scope: 'repo',
                            summary: 'Deprecating old state',
                            content: 'Deprecating old state',
                            confidence: 1.0,
                            created_by: 'test-agent',
                            evidence: [
                                {
                                    type: 'doc',
                                    uri: 'https://docs.example.com/deprecation',
                                    note: 'Deprecation notice',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.successCount).toBe(1);
            // Verify entry is deprecated
            const entry = await adapter.get(TEST_PROJECT, entryId);
            (0, vitest_1.expect)(entry?.status).toBe('deprecated');
        });
        (0, vitest_1.it)('should validate required fields for create operation', async () => {
            const result = {
                task_id: 'task-006',
                status: 'success',
                summary: 'Validation test',
                memory_updates: [
                    {
                        operation: 'create',
                        entry: {
                            // Missing section, kind, subject, scope, summary
                            content: 'Test content',
                            confidence: 0.8,
                            evidence: [
                                {
                                    type: 'code',
                                    uri: 'https://example.com',
                                    note: 'Test',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.successCount).toBe(0);
            (0, vitest_1.expect)(applyResult.errorCount).toBe(1);
            (0, vitest_1.expect)(applyResult.errors[0].error).toContain('Missing required field');
        });
        (0, vitest_1.it)('should validate target_id for supersede operation', async () => {
            const result = {
                task_id: 'task-007',
                status: 'success',
                summary: 'Validation test',
                memory_updates: [
                    {
                        operation: 'supersede',
                        // Missing target_id
                        entry: {
                            section: 'decisions',
                            kind: 'decision',
                            subject: 'test',
                            scope: 'repo',
                            summary: 'Test',
                            content: 'Test content',
                            confidence: 0.8,
                            evidence: [
                                {
                                    type: 'code',
                                    uri: 'https://example.com',
                                    note: 'Test',
                                },
                            ],
                        },
                    },
                ],
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.successCount).toBe(0);
            (0, vitest_1.expect)(applyResult.errorCount).toBe(1);
            (0, vitest_1.expect)(applyResult.errors[0].error).toContain('target_id');
        });
        (0, vitest_1.it)('should return empty result when no memory updates', async () => {
            const result = {
                task_id: 'task-008',
                status: 'success',
                summary: 'No updates',
            };
            const applyResult = await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'test-agent');
            (0, vitest_1.expect)(applyResult.totalUpdates).toBe(0);
            (0, vitest_1.expect)(applyResult.successCount).toBe(0);
            (0, vitest_1.expect)(applyResult.errorCount).toBe(0);
        });
        (0, vitest_1.it)('should set created_by field to agent identifier', async () => {
            const result = {
                task_id: 'task-009',
                status: 'success',
                summary: 'Test agent identifier',
                memory_updates: [
                    {
                        operation: 'create',
                        entry: {
                            section: 'learnings',
                            kind: 'other',
                            subject: 'test-learning',
                            scope: 'repo',
                            summary: 'Test learning',
                            content: 'This is a test learning',
                            confidence: 0.75,
                            created_by: 'test-agent',
                            evidence: [
                                {
                                    type: 'artifact',
                                    uri: 'file:///artifacts/test.json',
                                    note: 'Test artifact',
                                },
                            ],
                        },
                    },
                ],
            };
            await (0, agent_result_integration_1.applyMemoryUpdates)(result, TEST_PROJECT, TEST_WORKSPACE, 'custom-agent-123');
            // Verify created_by field
            const adapter = new memory_adapter_1.MemoryAdapter(TEST_WORKSPACE);
            const entries = await adapter.query(TEST_PROJECT, {});
            (0, vitest_1.expect)(entries).toHaveLength(1);
            (0, vitest_1.expect)(entries[0].created_by).toBe('custom-agent-123');
        });
    });
});
//# sourceMappingURL=agent-result-integration.test.js.map