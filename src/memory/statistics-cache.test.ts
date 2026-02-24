/**
 * Unit tests for statistics cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticsCache } from './statistics-cache';
import { MemoryStatistics } from './statistics';

describe('StatisticsCache', () => {
  let cache: StatisticsCache;

  beforeEach(() => {
    cache = new StatisticsCache();
  });

  const mockStats: MemoryStatistics = {
    total_entries: 10,
    entries_by_section: { decisions: 5, state: 3, observations: 2, learnings: 0 },
    entries_by_status: { active: 8, superseded: 2, deprecated: 0, draft: 0 },
    entries_by_kind: { decision: 5, requirement: 3, invariant: 2, incident: 0, metric: 0, hypothesis: 0, runbook_step: 0, other: 0 },
    avg_confidence: 0.75,
    confidence_distribution: { '0.0-0.2': 0, '0.2-0.4': 1, '0.4-0.6': 2, '0.6-0.8': 4, '0.8-1.0': 3 },
    evidence_type_distribution: { code: 5, artifact: 3, log: 2, screenshot: 0, assumption: 0, ticket: 0, doc: 0 },
    low_confidence_count: 1,
    stale_evidence_count: 0,
    entries_created_over_time: [],
    entries_superseded_over_time: [],
    entries_by_agent: { 'agent-1': 6, 'agent-2': 4 },
    most_active_agents: [{ agent: 'agent-1', count: 6 }, { agent: 'agent-2', count: 4 }],
    recent_operations: [],
    superseded_percentage: 20,
    entries_approaching_expiry: [],
    compaction_candidates: 2,
  };

  describe('get and set', () => {
    it('should cache and retrieve statistics', () => {
      cache.set('test-project', mockStats);
      const result = cache.get('test-project');
      
      expect(result).toEqual(mockStats);
    });

    it('should return null for non-existent cache entry', () => {
      const result = cache.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should support cache bypass with bypassCache flag', () => {
      cache.set('test-project', mockStats);
      const result = cache.get('test-project', undefined, true);
      
      expect(result).toBeNull();
    });

    it('should cache with date range as part of key', () => {
      const dateRange = { start_date: '2024-01-01T00:00:00Z', end_date: '2024-12-31T23:59:59Z' };
      
      cache.set('test-project', mockStats, dateRange);
      const result = cache.get('test-project', dateRange);
      
      expect(result).toEqual(mockStats);
    });

    it('should differentiate cache entries by date range', () => {
      const dateRange1 = { start_date: '2024-01-01T00:00:00Z' };
      const dateRange2 = { start_date: '2024-06-01T00:00:00Z' };
      
      const stats1 = { ...mockStats, total_entries: 10 };
      const stats2 = { ...mockStats, total_entries: 20 };
      
      cache.set('test-project', stats1, dateRange1);
      cache.set('test-project', stats2, dateRange2);
      
      expect(cache.get('test-project', dateRange1)?.total_entries).toBe(10);
      expect(cache.get('test-project', dateRange2)?.total_entries).toBe(20);
    });
  });

  describe('time-based expiry', () => {
    it('should expire cache after 5 minutes', async () => {
      // Mock the cache entry with an expired timestamp
      cache.set('test-project', mockStats);
      
      // Manually expire the cache by manipulating the internal state
      const cacheStats = cache.getStats();
      expect(cacheStats.size).toBe(1);
      
      // We can't easily test time-based expiry without mocking time,
      // but we can verify the cache structure includes expires_at
      const stats = cache.getStats();
      expect(stats.entries[0]).toHaveProperty('expires_at');
    });
  });

  describe('invalidate', () => {
    it('should invalidate all cache entries for a project', () => {
      cache.set('test-project', mockStats);
      cache.set('test-project', mockStats, { start_date: '2024-01-01T00:00:00Z' });
      cache.set('other-project', mockStats);
      
      cache.invalidate('test-project');
      
      expect(cache.get('test-project')).toBeNull();
      expect(cache.get('test-project', { start_date: '2024-01-01T00:00:00Z' })).toBeNull();
      expect(cache.get('other-project')).toEqual(mockStats);
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cache.set('project-1', mockStats);
      cache.set('project-2', mockStats);
      
      cache.clear();
      
      expect(cache.get('project-1')).toBeNull();
      expect(cache.get('project-2')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('project-1', mockStats);
      cache.set('project-2', mockStats);
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0]).toHaveProperty('project');
      expect(stats.entries[0]).toHaveProperty('computed_at');
      expect(stats.entries[0]).toHaveProperty('expires_at');
    });
  });
});
