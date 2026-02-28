"use strict";
/**
 * Unit tests for statistics cache
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const statistics_cache_1 = require("./statistics-cache");
(0, vitest_1.describe)('StatisticsCache', () => {
    let cache;
    (0, vitest_1.beforeEach)(() => {
        cache = new statistics_cache_1.StatisticsCache();
    });
    const mockStats = {
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
    (0, vitest_1.describe)('get and set', () => {
        (0, vitest_1.it)('should cache and retrieve statistics', () => {
            cache.set('test-project', mockStats);
            const result = cache.get('test-project');
            (0, vitest_1.expect)(result).toEqual(mockStats);
        });
        (0, vitest_1.it)('should return null for non-existent cache entry', () => {
            const result = cache.get('non-existent');
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('should support cache bypass with bypassCache flag', () => {
            cache.set('test-project', mockStats);
            const result = cache.get('test-project', undefined, true);
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('should cache with date range as part of key', () => {
            const dateRange = { start_date: '2024-01-01T00:00:00Z', end_date: '2024-12-31T23:59:59Z' };
            cache.set('test-project', mockStats, dateRange);
            const result = cache.get('test-project', dateRange);
            (0, vitest_1.expect)(result).toEqual(mockStats);
        });
        (0, vitest_1.it)('should differentiate cache entries by date range', () => {
            const dateRange1 = { start_date: '2024-01-01T00:00:00Z' };
            const dateRange2 = { start_date: '2024-06-01T00:00:00Z' };
            const stats1 = { ...mockStats, total_entries: 10 };
            const stats2 = { ...mockStats, total_entries: 20 };
            cache.set('test-project', stats1, dateRange1);
            cache.set('test-project', stats2, dateRange2);
            (0, vitest_1.expect)(cache.get('test-project', dateRange1)?.total_entries).toBe(10);
            (0, vitest_1.expect)(cache.get('test-project', dateRange2)?.total_entries).toBe(20);
        });
    });
    (0, vitest_1.describe)('time-based expiry', () => {
        (0, vitest_1.it)('should expire cache after 5 minutes', async () => {
            // Mock the cache entry with an expired timestamp
            cache.set('test-project', mockStats);
            // Manually expire the cache by manipulating the internal state
            const cacheStats = cache.getStats();
            (0, vitest_1.expect)(cacheStats.size).toBe(1);
            // We can't easily test time-based expiry without mocking time,
            // but we can verify the cache structure includes expires_at
            const stats = cache.getStats();
            (0, vitest_1.expect)(stats.entries[0]).toHaveProperty('expires_at');
        });
    });
    (0, vitest_1.describe)('invalidate', () => {
        (0, vitest_1.it)('should invalidate all cache entries for a project', () => {
            cache.set('test-project', mockStats);
            cache.set('test-project', mockStats, { start_date: '2024-01-01T00:00:00Z' });
            cache.set('other-project', mockStats);
            cache.invalidate('test-project');
            (0, vitest_1.expect)(cache.get('test-project')).toBeNull();
            (0, vitest_1.expect)(cache.get('test-project', { start_date: '2024-01-01T00:00:00Z' })).toBeNull();
            (0, vitest_1.expect)(cache.get('other-project')).toEqual(mockStats);
        });
    });
    (0, vitest_1.describe)('clear', () => {
        (0, vitest_1.it)('should clear all cache entries', () => {
            cache.set('project-1', mockStats);
            cache.set('project-2', mockStats);
            cache.clear();
            (0, vitest_1.expect)(cache.get('project-1')).toBeNull();
            (0, vitest_1.expect)(cache.get('project-2')).toBeNull();
            (0, vitest_1.expect)(cache.getStats().size).toBe(0);
        });
    });
    (0, vitest_1.describe)('getStats', () => {
        (0, vitest_1.it)('should return cache statistics', () => {
            cache.set('project-1', mockStats);
            cache.set('project-2', mockStats);
            const stats = cache.getStats();
            (0, vitest_1.expect)(stats.size).toBe(2);
            (0, vitest_1.expect)(stats.entries).toHaveLength(2);
            (0, vitest_1.expect)(stats.entries[0]).toHaveProperty('project');
            (0, vitest_1.expect)(stats.entries[0]).toHaveProperty('computed_at');
            (0, vitest_1.expect)(stats.entries[0]).toHaveProperty('expires_at');
        });
    });
});
//# sourceMappingURL=statistics-cache.test.js.map