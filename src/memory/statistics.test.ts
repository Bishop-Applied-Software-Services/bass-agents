/**
 * Unit tests for statistics module
 */

import { describe, it, expect } from 'vitest';
import { getStatistics, MemoryStatistics, StatisticsDateRange } from './statistics';
import { MemoryEntry } from './types';

describe('Statistics', () => {
  const createTestEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'test-id',
    section: 'decisions',
    kind: 'decision',
    subject: 'test-subject',
    scope: 'repo',
    summary: 'Test summary',
    content: 'Test content',
    tags: [],
    confidence: 0.8,
    evidence: [{ type: 'code', uri: 'test.ts', note: 'test' }],
    status: 'active',
    superseded_by: null,
    related_entries: [],
    created_by: 'test-agent',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  describe('getStatistics', () => {
    it('should compute basic counts', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ section: 'decisions' }),
        createTestEntry({ section: 'state' }),
        createTestEntry({ section: 'decisions' }),
      ];

      const stats = getStatistics(entries);

      expect(stats.total_entries).toBe(3);
      expect(stats.entries_by_section).toEqual({
        decisions: 2,
        state: 1,
      });
    });

    it('should compute average confidence', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ confidence: 0.8 }),
        createTestEntry({ confidence: 0.6 }),
        createTestEntry({ confidence: 1.0 }),
      ];

      const stats = getStatistics(entries);

      expect(stats.avg_confidence).toBeCloseTo(0.8, 2);
    });

    it('should compute confidence distribution', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ confidence: 0.1 }),
        createTestEntry({ confidence: 0.3 }),
        createTestEntry({ confidence: 0.5 }),
        createTestEntry({ confidence: 0.7 }),
        createTestEntry({ confidence: 0.9 }),
      ];

      const stats = getStatistics(entries);

      expect(stats.confidence_distribution).toEqual({
        '0.0-0.2': 1,
        '0.2-0.4': 1,
        '0.4-0.6': 1,
        '0.6-0.8': 1,
        '0.8-1.0': 1,
      });
    });

    it('should count low confidence entries', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ confidence: 0.3 }),
        createTestEntry({ confidence: 0.4 }),
        createTestEntry({ confidence: 0.6 }),
      ];

      const stats = getStatistics(entries);

      expect(stats.low_confidence_count).toBe(2);
    });

    it('should compute evidence type distribution', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ evidence: [{ type: 'code', uri: 'test.ts', note: 'test' }] }),
        createTestEntry({ evidence: [{ type: 'code', uri: 'test2.ts', note: 'test' }] }),
        createTestEntry({ evidence: [{ type: 'ticket', uri: 'http://ticket', note: 'test' }] }),
      ];

      const stats = getStatistics(entries);

      expect(stats.evidence_type_distribution).toEqual({
        code: 2,
        ticket: 1,
      });
    });

    it('should compute time series for entries created', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ created_at: '2024-01-01T10:00:00Z' }),
        createTestEntry({ created_at: '2024-01-01T11:00:00Z' }),
        createTestEntry({ created_at: '2024-01-02T10:00:00Z' }),
      ];

      const stats = getStatistics(entries);

      expect(stats.entries_created_over_time).toEqual([
        { date: '2024-01-01', count: 2 },
        { date: '2024-01-02', count: 1 },
      ]);
    });

    it('should compute most active agents', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ created_by: 'agent-1' }),
        createTestEntry({ created_by: 'agent-1' }),
        createTestEntry({ created_by: 'agent-2' }),
      ];

      const stats = getStatistics(entries);

      expect(stats.most_active_agents).toEqual([
        { agent: 'agent-1', count: 2 },
        { agent: 'agent-2', count: 1 },
      ]);
    });

    it('should compute superseded percentage', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ status: 'active' }),
        createTestEntry({ status: 'superseded' }),
        createTestEntry({ status: 'superseded' }),
        createTestEntry({ status: 'active' }),
      ];

      const stats = getStatistics(entries);

      expect(stats.superseded_percentage).toBe(50);
      expect(stats.compaction_candidates).toBe(2);
    });

    it('should filter by date range', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ created_at: '2024-01-01T00:00:00Z' }),
        createTestEntry({ created_at: '2024-01-15T00:00:00Z' }),
        createTestEntry({ created_at: '2024-02-01T00:00:00Z' }),
      ];

      const dateRange: StatisticsDateRange = {
        start_date: '2024-01-10T00:00:00Z',
        end_date: '2024-01-20T00:00:00Z',
      };

      const stats = getStatistics(entries, dateRange);

      expect(stats.total_entries).toBe(1);
    });

    it('should return empty stats for empty entries', () => {
      const stats = getStatistics([]);

      expect(stats.total_entries).toBe(0);
      expect(stats.avg_confidence).toBe(0);
      expect(stats.most_active_agents).toEqual([]);
    });
  });
});
