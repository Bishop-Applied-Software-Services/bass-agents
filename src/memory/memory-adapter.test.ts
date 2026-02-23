/**
 * Memory Adapter Tests
 * 
 * Basic unit tests for MemoryAdapter core operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryAdapter } from './memory-adapter';
import { MemoryEntryInput } from './types';

describe('MemoryAdapter', () => {
  const testWorkspaceRoot = path.join(__dirname, '../../test-workspace');
  const testProject = 'test-project';
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter(testWorkspaceRoot);
    
    // Clean up test workspace if it exists
    const memoryPath = path.join(testWorkspaceRoot, 'ai-memory', testProject);
    if (fs.existsSync(memoryPath)) {
      await fs.promises.rm(memoryPath, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean up test workspace
    const memoryPath = path.join(testWorkspaceRoot, 'ai-memory');
    if (fs.existsSync(memoryPath)) {
      await fs.promises.rm(memoryPath, { recursive: true, force: true });
    }
  });

  describe('init', () => {
    it('should initialize memory storage for a project', async () => {
      await adapter.init(testProject);

      const memoryPath = path.join(testWorkspaceRoot, 'ai-memory', testProject);
      const configPath = path.join(memoryPath, '.config.json');

      // Check directory exists
      expect(fs.existsSync(memoryPath)).toBe(true);

      // Check config file exists
      expect(fs.existsSync(configPath)).toBe(true);

      // Check config content
      const configContent = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.project).toBe(testProject);
      expect(config.version).toBe('1.0.0');
      expect(config.created_at).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new memory entry', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service.authentication',
        scope: 'service:auth',
        summary: 'Use JWT for authentication',
        content: 'We decided to use JWT tokens for authentication because they are stateless and scalable.',
        confidence: 0.9,
        evidence: [
          {
            type: 'doc',
            uri: 'https://example.com/adr-001',
            note: 'Architecture decision record'
          }
        ],
        created_by: 'test-agent'
      };

      const memoryId = await adapter.create(testProject, entry);

      expect(memoryId).toBeDefined();
      expect(memoryId).toMatch(/^[a-z0-9][a-z0-9-]*-[a-f0-9]+$/);
    });

    it('should reject entry with validation errors', async () => {
      const invalidEntry: any = {
        section: 'invalid-section',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test',
        content: 'Test content',
        confidence: 1.5, // Invalid: > 1.0
        evidence: [],
        created_by: 'test-agent'
      };

      await expect(adapter.create(testProject, invalidEntry)).rejects.toThrow(
        /validation failed/i
      );
    });

    it('should reject entry with secrets', async () => {
      const entryWithSecret: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test',
        content: 'API key: AKIA1234567890ABCDEF',
        confidence: 0.8,
        evidence: [
          {
            type: 'assumption',
            uri: 'none',
            note: 'Test'
          }
        ],
        created_by: 'test-agent'
      };

      await expect(adapter.create(testProject, entryWithSecret)).rejects.toThrow(
        /secret detection failed/i
      );
    });

    it('should reject duplicate entries', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service.authentication',
        scope: 'service:auth',
        summary: 'Use JWT for authentication',
        content: 'We decided to use JWT tokens.',
        confidence: 0.9,
        evidence: [
          {
            type: 'doc',
            uri: 'https://example.com/adr-001',
            note: 'ADR'
          }
        ],
        created_by: 'test-agent'
      };

      // Create first entry
      await adapter.create(testProject, entry);

      // Try to create duplicate
      await expect(adapter.create(testProject, entry)).rejects.toThrow(
        /duplicate entry detected/i
      );
    });
  });

  describe('supersede', () => {
    it('should supersede an existing entry', async () => {
      const originalEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service.authentication',
        scope: 'service:auth',
        summary: 'Use JWT for authentication',
        content: 'Original decision',
        confidence: 0.8,
        evidence: [
          {
            type: 'doc',
            uri: 'https://example.com/adr-001',
            note: 'ADR'
          }
        ],
        created_by: 'test-agent'
      };

      const originalId = await adapter.create(testProject, originalEntry);

      const replacementEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service.authentication',
        scope: 'service:auth',
        summary: 'Use OAuth2 for authentication',
        content: 'Updated decision to use OAuth2',
        confidence: 0.9,
        evidence: [
          {
            type: 'doc',
            uri: 'https://example.com/adr-002',
            note: 'Updated ADR'
          }
        ],
        created_by: 'test-agent'
      };

      const replacementId = await adapter.supersede(
        testProject,
        originalId,
        replacementEntry
      );

      expect(replacementId).toBeDefined();
      expect(replacementId).not.toBe(originalId);
    });

    it('should throw error for non-existent target', async () => {
      const replacementEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test',
        content: 'Test content',
        confidence: 0.8,
        evidence: [
          {
            type: 'assumption',
            uri: 'none',
            note: 'Test'
          }
        ],
        created_by: 'test-agent'
      };

      await expect(
        adapter.supersede(testProject, 'bd-nonexistent', replacementEntry)
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('deprecate', () => {
    it('should deprecate an existing entry', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service.authentication',
        scope: 'service:auth',
        summary: 'Use JWT for authentication',
        content: 'Decision content',
        confidence: 0.8,
        evidence: [
          {
            type: 'doc',
            uri: 'https://example.com/adr-001',
            note: 'ADR'
          }
        ],
        created_by: 'test-agent'
      };

      const entryId = await adapter.create(testProject, entry);

      await expect(adapter.deprecate(testProject, entryId)).resolves.not.toThrow();
    });

    it('should throw error for non-existent target', async () => {
      await expect(
        adapter.deprecate(testProject, 'bd-nonexistent')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('query', () => {
    it('should return empty array for uninitialized project', async () => {
      const results = await adapter.query('nonexistent-project');
      expect(results).toEqual([]);
    });

    it('should query entries with section filter', async () => {
      const decision: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'Auth decision',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const observation: MemoryEntryInput = {
        section: 'observations',
        kind: 'incident',
        subject: 'perf',
        scope: 'repo',
        summary: 'Performance observation',
        content: 'Content',
        confidence: 0.7,
        evidence: [{ type: 'log', uri: 'file://log.txt', note: 'Note' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, decision);
      await adapter.create(testProject, observation);

      const results = await adapter.query(testProject, {
        section: ['decisions']
      });

      expect(results.length).toBe(1);
      expect(results[0].section).toBe('decisions');
    });

    it('should apply default filters (status=active, confidence>=0.6)', async () => {
      const highConfidence: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test1',
        scope: 'repo',
        summary: 'High confidence',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const lowConfidence: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test2',
        scope: 'repo',
        summary: 'Low confidence',
        content: 'Content',
        confidence: 0.4,
        evidence: [{ type: 'assumption', uri: 'none', note: 'Note' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, highConfidence);
      await adapter.create(testProject, lowConfidence);

      const results = await adapter.query(testProject);

      expect(results.length).toBe(1);
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should expand scope hierarchy', async () => {
      const repoEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'repo-level',
        scope: 'repo',
        summary: 'Repo decision',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const serviceEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'service-level',
        scope: 'service:auth',
        summary: 'Service decision',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, repoEntry);
      await adapter.create(testProject, serviceEntry);

      const results = await adapter.query(testProject, {
        scope: ['service:auth']
      });

      expect(results.length).toBe(2);
      const scopes = results.map(r => r.scope);
      expect(scopes).toContain('repo');
      expect(scopes).toContain('service:auth');
    });

    it('should return summary-only when requested', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test summary',
        content: 'This is the full content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry);

      const results = await adapter.query(testProject, {
        summaryOnly: true
      });

      expect(results.length).toBe(1);
      expect(results[0].summary).toBe('Test summary');
      expect(results[0].content).toBe('');
      expect(results[0].evidence).toEqual([]);
    });
  });

  describe('get', () => {
    it('should retrieve a single entry by ID', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test entry',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const id = await adapter.create(testProject, entry);
      const retrieved = await adapter.get(testProject, id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(id);
      expect(retrieved!.summary).toBe('Test entry');
    });

    it('should return null for non-existent ID', async () => {
      await adapter.init(testProject);
      const retrieved = await adapter.get(testProject, 'bd-nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getRelated', () => {
    it('should retrieve related entries', async () => {
      const entry1: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test1',
        scope: 'repo',
        summary: 'Entry 1',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const entry2: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test2',
        scope: 'repo',
        summary: 'Entry 2',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const id1 = await adapter.create(testProject, entry1);
      const id2 = await adapter.create(testProject, entry2);

      const mainEntry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'main',
        scope: 'repo',
        summary: 'Main entry',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        related_entries: [id1, id2],
        created_by: 'test-agent'
      };

      const mainId = await adapter.create(testProject, mainEntry);
      const related = await adapter.getRelated(testProject, mainId);

      expect(related.length).toBe(2);
      const relatedIds = related.map(r => r.id);
      expect(relatedIds).toContain(id1);
      expect(relatedIds).toContain(id2);
    });

    it('should return empty array for entry with no related entries', async () => {
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test entry',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const id = await adapter.create(testProject, entry);
      const related = await adapter.getRelated(testProject, id);

      expect(related).toEqual([]);
    });
  });

  describe('compact', () => {
    it('should return compaction report with dry-run', async () => {
      // Create some entries including superseded ones
      const entry1: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'Old auth decision',
        content: 'Old content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const entry2: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'New auth decision',
        content: 'New content',
        confidence: 0.9,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const id1 = await adapter.create(testProject, entry1);
      await adapter.supersede(testProject, id1, entry2);

      // Run compaction in dry-run mode
      const report = await adapter.compact(testProject, true);

      expect(report).toBeDefined();
      expect(report.project).toBe(testProject);
      expect(report.dryRun).toBe(true);
      expect(report.totalEntries).toBeGreaterThan(0);
      expect(report.supersededEntries).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();
    });

    it('should handle compaction when bd compact is not available', async () => {
      // Create a simple entry
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test entry',
        content: 'Content',
        confidence: 0.8,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry);

      // Run compaction (may fail if bd compact not available, but should not throw)
      const report = await adapter.compact(testProject, false);

      expect(report).toBeDefined();
      expect(report.project).toBe(testProject);
      expect(report.dryRun).toBe(false);
    });
  });

  describe('export', () => {
    it('should export memory entries to JSONL format', async () => {
      // Create test entries
      const entry1: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'Auth decision',
        content: 'Use JWT',
        confidence: 0.9,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const entry2: MemoryEntryInput = {
        section: 'state',
        kind: 'metric',
        subject: 'performance',
        scope: 'repo',
        summary: 'Performance metric',
        content: 'Response time < 100ms',
        confidence: 0.8,
        evidence: [{ type: 'artifact', uri: '/metrics.json', note: 'Metrics' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry1);
      await adapter.create(testProject, entry2);

      // Export to JSONL
      const outputPath = path.join(testWorkspaceRoot, 'export.jsonl');
      await adapter.export(testProject, outputPath);

      // Verify file exists
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify content
      const content = await fs.promises.readFile(outputPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      expect(lines.length).toBeGreaterThanOrEqual(2);

      // Parse first line
      const exported = JSON.parse(lines[0]);
      expect(exported.section).toBeDefined();
      expect(exported.summary).toBeDefined();
      expect(exported.confidence).toBeDefined();
    });

    it('should export with filters', async () => {
      // Create entries with different sections
      const entry1: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'Auth decision',
        content: 'Use JWT',
        confidence: 0.9,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const entry2: MemoryEntryInput = {
        section: 'observations',
        kind: 'metric',
        subject: 'performance',
        scope: 'repo',
        summary: 'Performance observation',
        content: 'Response time varies',
        confidence: 0.6,
        evidence: [{ type: 'log', uri: '/logs.txt', note: 'Logs' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry1);
      await adapter.create(testProject, entry2);

      // Export only decisions with high confidence
      const outputPath = path.join(testWorkspaceRoot, 'export-filtered.jsonl');
      await adapter.export(testProject, outputPath, {
        section: ['decisions'],
        minConfidence: 0.8
      });

      // Verify content
      const content = await fs.promises.readFile(outputPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Should only have decisions with confidence >= 0.8
      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(entry.section).toBe('decisions');
        expect(entry.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('import', () => {
    it('should import memory entries from JSONL format', async () => {
      // Create JSONL file
      const entries = [
        {
          id: 'bd-test001',
          section: 'decisions',
          kind: 'decision',
          subject: 'auth',
          scope: 'repo',
          summary: 'Auth decision',
          content: 'Use JWT',
          tags: ['auth', 'security'],
          confidence: 0.9,
          evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
          status: 'active',
          superseded_by: null,
          related_entries: [],
          created_by: 'test-agent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const inputPath = path.join(testWorkspaceRoot, 'import.jsonl');
      await fs.promises.mkdir(path.dirname(inputPath), { recursive: true });
      await fs.promises.writeFile(
        inputPath,
        entries.map(e => JSON.stringify(e)).join('\n'),
        'utf-8'
      );

      // Import
      const report = await adapter.import(testProject, inputPath, 'skip');

      expect(report).toBeDefined();
      expect(report.project).toBe(testProject);
      expect(report.totalEntries).toBe(1);
      expect(report.successCount).toBeGreaterThan(0);
      expect(report.errorCount).toBe(0);
    });

    it('should handle conflicts with skip strategy', async () => {
      // Create an entry
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth',
        scope: 'repo',
        summary: 'Auth decision',
        content: 'Use JWT',
        confidence: 0.9,
        evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
        created_by: 'test-agent'
      };

      const id = await adapter.create(testProject, entry);

      // Create JSONL with same ID
      const entries = [
        {
          id: id,
          section: 'decisions',
          kind: 'decision',
          subject: 'auth',
          scope: 'repo',
          summary: 'Updated auth decision',
          content: 'Use OAuth',
          tags: [],
          confidence: 0.95,
          evidence: [{ type: 'doc', uri: 'https://example.com', note: 'Note' }],
          status: 'active',
          superseded_by: null,
          related_entries: [],
          created_by: 'test-agent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const inputPath = path.join(testWorkspaceRoot, 'import-conflict.jsonl');
      await fs.promises.writeFile(
        inputPath,
        entries.map(e => JSON.stringify(e)).join('\n'),
        'utf-8'
      );

      // Import with skip strategy
      const report = await adapter.import(testProject, inputPath, 'skip');

      expect(report.skipCount).toBe(1);
      expect(report.conflicts.length).toBe(1);
      expect(report.conflicts[0].resolution).toBe('skipped');
    });

    it('should handle invalid entries gracefully', async () => {
      // Create JSONL with invalid entry
      const inputPath = path.join(testWorkspaceRoot, 'import-invalid.jsonl');
      await fs.promises.writeFile(
        inputPath,
        'invalid json\n{"valid": "but incomplete"}',
        'utf-8'
      );

      // Import should not throw
      const report = await adapter.import(testProject, inputPath, 'skip');

      expect(report.errorCount).toBeGreaterThan(0);
      expect(report.errors.length).toBeGreaterThan(0);
    });
  });

  describe('syncContext', () => {
    it('should sync high-confidence entries to ai-context/', async () => {
      // Create high-confidence entry with code evidence
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service',
        scope: 'service:auth',
        summary: 'Use JWT for authentication',
        content: 'We decided to use JWT tokens for authentication because they are stateless and scalable.',
        confidence: 0.9,
        evidence: [
          {
            type: 'code',
            uri: 'https://github.com/org/repo/blob/main/auth.ts#L10-L20',
            note: 'Implementation'
          }
        ],
        tags: ['auth', 'security'],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry);

      // Sync to context
      await adapter.syncContext(testProject);

      // Verify context file was created
      const contextDir = path.join(testWorkspaceRoot, 'ai-context', testProject);
      expect(fs.existsSync(contextDir)).toBe(true);

      // Check for generated file
      const files = await fs.promises.readdir(contextDir);
      expect(files.length).toBeGreaterThan(0);

      // Verify content
      const content = await fs.promises.readFile(
        path.join(contextDir, files[0]),
        'utf-8'
      );
      expect(content).toContain('auth-service');
      expect(content).toContain('Use JWT for authentication');
      expect(content).toContain('**Confidence:** 0.9');
    });

    it('should filter out low-confidence entries', async () => {
      // Create low-confidence entry
      const entry: MemoryEntryInput = {
        section: 'observations',
        kind: 'metric',
        subject: 'performance',
        scope: 'repo',
        summary: 'Performance observation',
        content: 'Response time varies',
        confidence: 0.5, // Below 0.8 threshold
        evidence: [
          {
            type: 'code',
            uri: '/metrics.ts',
            note: 'Metrics'
          }
        ],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry);

      // Sync to context
      await adapter.syncContext(testProject);

      // Context directory may not exist or be empty
      const contextDir = path.join(testWorkspaceRoot, 'ai-context', testProject);
      if (fs.existsSync(contextDir)) {
        const files = await fs.promises.readdir(contextDir);
        // Should not contain low-confidence entries
        for (const file of files) {
          const content = await fs.promises.readFile(
            path.join(contextDir, file),
            'utf-8'
          );
          expect(content).not.toContain('**Confidence:** 0.5');
        }
      }
    });

    it('should group entries by subject', async () => {
      // Create multiple entries with same subject
      const entry1: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'auth-service',
        scope: 'service:auth',
        summary: 'Use JWT',
        content: 'JWT decision',
        confidence: 0.9,
        evidence: [{ type: 'code', uri: '/auth.ts', note: 'Code' }],
        created_by: 'test-agent'
      };

      const entry2: MemoryEntryInput = {
        section: 'state',
        kind: 'requirement',
        subject: 'auth-service',
        scope: 'service:auth',
        summary: 'Auth requirements',
        content: 'Requirements',
        confidence: 0.85,
        evidence: [{ type: 'artifact', uri: '/requirements.md', note: 'Doc' }],
        created_by: 'test-agent'
      };

      await adapter.create(testProject, entry1);
      await adapter.create(testProject, entry2);

      // Sync to context
      await adapter.syncContext(testProject);

      // Verify single file for subject
      const contextDir = path.join(testWorkspaceRoot, 'ai-context', testProject);
      const files = await fs.promises.readdir(contextDir);
      
      // Should have one file for auth-service
      const authFile = files.find(f => f.includes('auth-service'));
      expect(authFile).toBeDefined();

      // Verify both entries are in the file
      const content = await fs.promises.readFile(
        path.join(contextDir, authFile!),
        'utf-8'
      );
      expect(content).toContain('Use JWT');
      expect(content).toContain('Auth requirements');
    });
  });

  describe('workspace boundary enforcement', () => {
    it('should reject init with path outside workspace', async () => {
      // Try to initialize with path traversal
      const maliciousProject = '../../../etc/passwd';
      
      await expect(adapter.init(maliciousProject)).rejects.toThrow(
        /workspace boundary violation/i
      );
    });

    it('should reject export with path outside workspace', async () => {
      await adapter.init(testProject);
      
      // Try to export to path outside workspace
      const maliciousPath = '/tmp/outside-workspace.jsonl';
      
      await expect(adapter.export(testProject, maliciousPath)).rejects.toThrow(
        /workspace boundary violation/i
      );
    });

    it('should reject import with path outside workspace', async () => {
      await adapter.init(testProject);
      
      // Try to import from path outside workspace
      const maliciousPath = '/etc/passwd';
      
      await expect(adapter.import(testProject, maliciousPath)).rejects.toThrow(
        /workspace boundary violation/i
      );
    });

    it('should reject syncContext with malicious project name', async () => {
      // Try to sync context with path traversal in project name
      const maliciousProject = '../../../tmp/evil';
      await adapter.init(testProject); // Initialize valid project first
      
      // syncContext validates the ai-context path, not the memory path
      // So we need to test with a project that would create ai-context outside workspace
      await expect(adapter.syncContext(maliciousProject)).rejects.toThrow(
        /workspace boundary violation/i
      );
    });

    it('should allow operations within workspace', async () => {
      // All normal operations should work
      await adapter.init(testProject);
      
      const entry: MemoryEntryInput = {
        section: 'decisions',
        kind: 'decision',
        subject: 'test',
        scope: 'repo',
        summary: 'Test entry',
        content: 'Test content',
        confidence: 0.8,
        evidence: [{ type: 'assumption', uri: 'n/a', note: 'Test' }],
        created_by: 'test-agent'
      };
      
      const memoryId = await adapter.create(testProject, entry);
      expect(memoryId).toBeDefined();
      
      // Export within workspace
      const exportPath = path.join(testWorkspaceRoot, 'export.jsonl');
      await expect(adapter.export(testProject, exportPath)).resolves.not.toThrow();
      
      // Import within workspace
      await expect(adapter.import(testProject, exportPath)).resolves.toBeDefined();
      
      // Sync context within workspace
      await expect(adapter.syncContext(testProject)).resolves.not.toThrow();
    });
  });
});
