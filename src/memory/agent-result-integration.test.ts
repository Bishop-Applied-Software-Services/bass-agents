/**
 * Tests for AgentResult Integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { applyMemoryUpdates, AgentResult } from './agent-result-integration';
import { MemoryAdapter } from './memory-adapter';
import { MemoryUpdate } from './types';

const TEST_WORKSPACE = path.join(__dirname, '../../test-workspace-agent-result');
const TEST_PROJECT = 'test-project';

describe('AgentResult Integration', () => {
  beforeEach(async () => {
    // Clean up test workspace
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test workspace
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  describe('applyMemoryUpdates', () => {
    it('should apply create operation successfully', async () => {
      const result: AgentResult = {
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

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.totalUpdates).toBe(1);
      expect(applyResult.successCount).toBe(1);
      expect(applyResult.errorCount).toBe(0);
      expect(applyResult.errors).toHaveLength(0);

      // Verify entry was created
      const adapter = new MemoryAdapter(TEST_WORKSPACE);
      const entries = await adapter.query(TEST_PROJECT, {});
      expect(entries).toHaveLength(1);
      expect(entries[0].subject).toBe('test-subject');
      expect(entries[0].created_by).toBe('test-agent');
    });

    it('should auto-initialize memory on first write', async () => {
      // Verify memory is not initialized
      const memoryPath = path.join(TEST_WORKSPACE, 'ai-memory', TEST_PROJECT);
      const configPath = path.join(memoryPath, '.config.json');
      
      await expect(fs.access(configPath)).rejects.toThrow();

      const result: AgentResult = {
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

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.successCount).toBe(1);

      // Verify memory was auto-initialized
      await expect(fs.access(configPath)).resolves.not.toThrow();
    });

    it('should handle partial failures gracefully', async () => {
      const result: AgentResult = {
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
            } as any,
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

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.totalUpdates).toBe(3);
      expect(applyResult.successCount).toBe(2);
      expect(applyResult.errorCount).toBe(1);
      expect(applyResult.errors).toHaveLength(1);
      expect(applyResult.errors[0].updateIndex).toBe(1);

      // Verify valid entries were created
      const adapter = new MemoryAdapter(TEST_WORKSPACE);
      const entries = await adapter.query(TEST_PROJECT, {});
      expect(entries).toHaveLength(2);
    });

    it('should apply supersede operation successfully', async () => {
      // First create an entry
      const adapter = new MemoryAdapter(TEST_WORKSPACE);
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
      const result: AgentResult = {
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

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.successCount).toBe(1);

      // Verify old entry is superseded
      const oldEntry = await adapter.get(TEST_PROJECT, entryId);
      expect(oldEntry?.status).toBe('superseded');

      // Verify new entry exists
      const allEntries = await adapter.query(TEST_PROJECT, { status: ['active'] });
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0].subject).toBe('new-decision');
    });

    it('should apply deprecate operation successfully', async () => {
      // First create an entry
      const adapter = new MemoryAdapter(TEST_WORKSPACE);
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
      const result: AgentResult = {
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

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.successCount).toBe(1);

      // Verify entry is deprecated
      const entry = await adapter.get(TEST_PROJECT, entryId);
      expect(entry?.status).toBe('deprecated');
    });

    it('should validate required fields for create operation', async () => {
      const result: AgentResult = {
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
            } as any,
          },
        ],
      };

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.successCount).toBe(0);
      expect(applyResult.errorCount).toBe(1);
      expect(applyResult.errors[0].error).toContain('Missing required field');
    });

    it('should validate target_id for supersede operation', async () => {
      const result: AgentResult = {
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
          } as any,
        ],
      };

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.successCount).toBe(0);
      expect(applyResult.errorCount).toBe(1);
      expect(applyResult.errors[0].error).toContain('target_id');
    });

    it('should return empty result when no memory updates', async () => {
      const result: AgentResult = {
        task_id: 'task-008',
        status: 'success',
        summary: 'No updates',
      };

      const applyResult = await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'test-agent'
      );

      expect(applyResult.totalUpdates).toBe(0);
      expect(applyResult.successCount).toBe(0);
      expect(applyResult.errorCount).toBe(0);
    });

    it('should set created_by field to agent identifier', async () => {
      const result: AgentResult = {
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

      await applyMemoryUpdates(
        result,
        TEST_PROJECT,
        TEST_WORKSPACE,
        'custom-agent-123'
      );

      // Verify created_by field
      const adapter = new MemoryAdapter(TEST_WORKSPACE);
      const entries = await adapter.query(TEST_PROJECT, {});
      expect(entries).toHaveLength(1);
      expect(entries[0].created_by).toBe('custom-agent-123');
    });
  });
});
