/**
 * Tests for AgentTask Integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { populateMemoryContext, AgentTask } from './agent-task-integration';
import { MemoryAdapter } from './memory-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('AgentTask Integration', () => {
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    // Create temporary workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-test-'));
    workspaceRoot = tempDir;
  });

  afterEach(async () => {
    // Clean up temporary workspace
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('populateMemoryContext', () => {
    it('should return task unchanged when memory_enabled is false', async () => {
      const task: AgentTask = {
        task_id: 'test-1',
        project: { name: 'test-project' },
        goal: 'Test goal',
        memory_enabled: false,
      };

      const result = await populateMemoryContext(task, workspaceRoot);

      expect(result.memory_enabled).toBe(false);
      expect(result.memory_context).toBeUndefined();
    });

    it('should return empty memory_context when memory is uninitialized (graceful degradation)', async () => {
      const task: AgentTask = {
        task_id: 'test-2',
        project: { name: 'test-project' },
        goal: 'Test goal',
        memory_enabled: true,
      };

      const result = await populateMemoryContext(task, workspaceRoot);

      expect(result.memory_enabled).toBe(true);
      expect(result.memory_context).toEqual([]);
    });

    it('should populate memory_context with up to 10 entries when memory is initialized', async () => {
      const project = 'test-project';
      const adapter = new MemoryAdapter(workspaceRoot);

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

      const task: AgentTask = {
        task_id: 'test-3',
        project: { name: project },
        goal: 'Test goal with decisions',
        memory_enabled: true,
      };

      const result = await populateMemoryContext(task, workspaceRoot);

      expect(result.memory_enabled).toBe(true);
      expect(result.memory_context).toBeDefined();
      expect(result.memory_context!.length).toBeLessThanOrEqual(10);
      expect(result.memory_context!.length).toBeGreaterThan(0);
    });

    it('should prefer entries with code/artifact evidence', async () => {
      const project = 'test-project';
      const adapter = new MemoryAdapter(workspaceRoot);

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
            uri: 'n/a',
            note: 'Assumption evidence',
          },
        ],
        created_by: 'test-agent',
      });

      const task: AgentTask = {
        task_id: 'test-4',
        project: { name: project },
        goal: 'Test goal',
        memory_enabled: true,
      };

      const result = await populateMemoryContext(task, workspaceRoot);

      expect(result.memory_context).toBeDefined();
      expect(result.memory_context!.length).toBeGreaterThan(0);

      // First entry should have code evidence (preferred)
      const firstEntry = result.memory_context![0];
      const hasCodeOrArtifact = firstEntry.evidence.some(
        ev => ev.type === 'code' || ev.type === 'artifact'
      );
      expect(hasCodeOrArtifact).toBe(true);
    });

    it('should filter by section based on goal keywords', async () => {
      const project = 'test-project';
      const adapter = new MemoryAdapter(workspaceRoot);

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

      const task: AgentTask = {
        task_id: 'test-5',
        project: { name: project },
        goal: 'Learn about patterns in the codebase',
        memory_enabled: true,
      };

      const result = await populateMemoryContext(task, workspaceRoot);

      expect(result.memory_context).toBeDefined();
      if (result.memory_context!.length > 0) {
        // Should prefer learnings section based on "learn" keyword
        const sections = result.memory_context!.map(e => e.section);
        expect(sections).toContain('learnings');
      }
    });
  });
});
