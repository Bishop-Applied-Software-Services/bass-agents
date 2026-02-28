"use strict";
/**
 * Unit tests for statistics module
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const statistics_1 = require("./statistics");
(0, vitest_1.describe)('Statistics', () => {
    const createTestEntry = (overrides = {}) => ({
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
    (0, vitest_1.describe)('getStatistics', () => {
        (0, vitest_1.it)('should compute basic counts', () => {
            const entries = [
                createTestEntry({ section: 'decisions' }),
                createTestEntry({ section: 'state' }),
                createTestEntry({ section: 'decisions' }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.total_entries).toBe(3);
            (0, vitest_1.expect)(stats.entries_by_section).toEqual({
                decisions: 2,
                state: 1,
            });
        });
        (0, vitest_1.it)('should compute average confidence', () => {
            const entries = [
                createTestEntry({ confidence: 0.8 }),
                createTestEntry({ confidence: 0.6 }),
                createTestEntry({ confidence: 1.0 }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.avg_confidence).toBeCloseTo(0.8, 2);
        });
        (0, vitest_1.it)('should compute confidence distribution', () => {
            const entries = [
                createTestEntry({ confidence: 0.1 }),
                createTestEntry({ confidence: 0.3 }),
                createTestEntry({ confidence: 0.5 }),
                createTestEntry({ confidence: 0.7 }),
                createTestEntry({ confidence: 0.9 }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.confidence_distribution).toEqual({
                '0.0-0.2': 1,
                '0.2-0.4': 1,
                '0.4-0.6': 1,
                '0.6-0.8': 1,
                '0.8-1.0': 1,
            });
        });
        (0, vitest_1.it)('should count low confidence entries', () => {
            const entries = [
                createTestEntry({ confidence: 0.3 }),
                createTestEntry({ confidence: 0.4 }),
                createTestEntry({ confidence: 0.6 }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.low_confidence_count).toBe(2);
        });
        (0, vitest_1.it)('should compute evidence type distribution', () => {
            const entries = [
                createTestEntry({ evidence: [{ type: 'code', uri: 'test.ts', note: 'test' }] }),
                createTestEntry({ evidence: [{ type: 'code', uri: 'test2.ts', note: 'test' }] }),
                createTestEntry({ evidence: [{ type: 'ticket', uri: 'http://ticket', note: 'test' }] }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.evidence_type_distribution).toEqual({
                code: 2,
                ticket: 1,
            });
        });
        (0, vitest_1.it)('should compute time series for entries created', () => {
            const entries = [
                createTestEntry({ created_at: '2024-01-01T10:00:00Z' }),
                createTestEntry({ created_at: '2024-01-01T11:00:00Z' }),
                createTestEntry({ created_at: '2024-01-02T10:00:00Z' }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.entries_created_over_time).toEqual([
                { date: '2024-01-01', count: 2 },
                { date: '2024-01-02', count: 1 },
            ]);
        });
        (0, vitest_1.it)('should compute most active agents', () => {
            const entries = [
                createTestEntry({ created_by: 'agent-1' }),
                createTestEntry({ created_by: 'agent-1' }),
                createTestEntry({ created_by: 'agent-2' }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.most_active_agents).toEqual([
                { agent: 'agent-1', count: 2 },
                { agent: 'agent-2', count: 1 },
            ]);
        });
        (0, vitest_1.it)('should compute superseded percentage', () => {
            const entries = [
                createTestEntry({ status: 'active' }),
                createTestEntry({ status: 'superseded' }),
                createTestEntry({ status: 'superseded' }),
                createTestEntry({ status: 'active' }),
            ];
            const stats = (0, statistics_1.getStatistics)(entries);
            (0, vitest_1.expect)(stats.superseded_percentage).toBe(50);
            (0, vitest_1.expect)(stats.compaction_candidates).toBe(2);
        });
        (0, vitest_1.it)('should filter by date range', () => {
            const entries = [
                createTestEntry({ created_at: '2024-01-01T00:00:00Z' }),
                createTestEntry({ created_at: '2024-01-15T00:00:00Z' }),
                createTestEntry({ created_at: '2024-02-01T00:00:00Z' }),
            ];
            const dateRange = {
                start_date: '2024-01-10T00:00:00Z',
                end_date: '2024-01-20T00:00:00Z',
            };
            const stats = (0, statistics_1.getStatistics)(entries, dateRange);
            (0, vitest_1.expect)(stats.total_entries).toBe(1);
        });
        (0, vitest_1.it)('should return empty stats for empty entries', () => {
            const stats = (0, statistics_1.getStatistics)([]);
            (0, vitest_1.expect)(stats.total_entries).toBe(0);
            (0, vitest_1.expect)(stats.avg_confidence).toBe(0);
            (0, vitest_1.expect)(stats.most_active_agents).toEqual([]);
        });
    });
});
//# sourceMappingURL=statistics.test.js.map