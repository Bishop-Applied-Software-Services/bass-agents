/**
 * Unit tests for query logger module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logQuery, analyzeQueryPatterns } from './query-logger';
import { MemoryQueryFilters } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Query Logger', () => {
  let testDir: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'query-logger-test-'));
    workspaceRoot = testDir;
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('logQuery', () => {
    it('should log a query to JSONL file', async () => {
      const project = 'test-project';
      const filters: MemoryQueryFilters = {
        section: ['decisions'],
        subject: ['test-subject'],
      };

      await logQuery(project, filters, 5, workspaceRoot);

      const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(1);

      const logEntry = JSON.parse(lines[0]);
      expect(logEntry.project).toBe(project);
      expect(logEntry.result_count).toBe(5);
      expect(logEntry.subjects).toEqual(['test-subject']);
    });

    it('should append multiple queries', async () => {
      const project = 'test-project';

      await logQuery(project, { section: ['decisions'] }, 3, workspaceRoot);
      await logQuery(project, { section: ['state'] }, 2, workspaceRoot);

      const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2);
    });
  });

  describe('analyzeQueryPatterns', () => {
    it('should return empty stats for non-existent log', async () => {
      const stats = await analyzeQueryPatterns('non-existent', workspaceRoot);

      expect(stats.total_queries).toBe(0);
      expect(stats.most_queried_subjects).toEqual([]);
      expect(stats.most_queried_scopes).toEqual([]);
    });

    it('should analyze query patterns', async () => {
      const project = 'test-project';

      // Log some queries
      await logQuery(project, { subject: ['subject-1'] }, 5, workspaceRoot);
      await logQuery(project, { subject: ['subject-1'] }, 3, workspaceRoot);
      await logQuery(project, { subject: ['subject-2'] }, 2, workspaceRoot);
      await logQuery(project, { scope: ['repo'] }, 1, workspaceRoot);

      const stats = await analyzeQueryPatterns(project, workspaceRoot);

      expect(stats.total_queries).toBe(4);
      expect(stats.most_queried_subjects).toEqual([
        { subject: 'subject-1', count: 2 },
        { subject: 'subject-2', count: 1 },
      ]);
      expect(stats.most_queried_scopes).toEqual([
        { scope: 'repo', count: 1 },
      ]);
    });

    it('should filter by date range', async () => {
      const project = 'test-project';

      // Create log file with entries at different times
      const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
      await fs.mkdir(path.dirname(logPath), { recursive: true });

      const entries = [
        { timestamp: '2024-01-01T00:00:00Z', project, filters: {}, result_count: 1 },
        { timestamp: '2024-01-15T00:00:00Z', project, filters: {}, result_count: 1 },
        { timestamp: '2024-02-01T00:00:00Z', project, filters: {}, result_count: 1 },
      ];

      await fs.writeFile(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

      const stats = await analyzeQueryPatterns(project, workspaceRoot, {
        start_date: '2024-01-10T00:00:00Z',
        end_date: '2024-01-20T00:00:00Z',
      });

      expect(stats.total_queries).toBe(1);
    });

    it('should compute query frequency over time', async () => {
      const project = 'test-project';

      // Log queries on different days
      const logPath = path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
      await fs.mkdir(path.dirname(logPath), { recursive: true });

      const entries = [
        { timestamp: '2024-01-01T10:00:00Z', project, filters: {}, result_count: 1 },
        { timestamp: '2024-01-01T11:00:00Z', project, filters: {}, result_count: 1 },
        { timestamp: '2024-01-02T10:00:00Z', project, filters: {}, result_count: 1 },
      ];

      await fs.writeFile(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

      const stats = await analyzeQueryPatterns(project, workspaceRoot);

      expect(stats.query_frequency_over_time).toEqual([
        { date: '2024-01-01', count: 2 },
        { date: '2024-01-02', count: 1 },
      ]);
    });
  });
});
