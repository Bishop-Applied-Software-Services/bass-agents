/**
 * Statistics API for Durable Memory System
 *
 * Provides comprehensive statistics and analytics about memory entries including:
 * - Basic counts (total entries, by section, by status, by kind)
 * - Quality metrics (confidence distribution, evidence types, low confidence count)
 * - Growth trends (entries created/superseded over time)
 * - Agent activity (entries by agent, most active agents)
 * - Lifecycle metrics (superseded percentage, approaching expiry, compaction candidates)
 */
import { MemoryEntry } from './types.js';
/**
 * Time series data point
 */
export interface TimeSeriesPoint {
    date: string;
    count: number;
}
/**
 * Agent activity data
 */
export interface AgentActivity {
    agent: string;
    count: number;
}
/**
 * Recent operation record
 */
export interface RecentOperation {
    timestamp: string;
    operation: 'create' | 'supersede' | 'deprecate';
    entry_id: string;
    agent: string;
    summary: string;
}
/**
 * Entry approaching expiry
 */
export interface ExpiringEntry {
    entry_id: string;
    summary: string;
    valid_to: string;
    days_remaining: number;
}
/**
 * Comprehensive statistics about memory entries
 */
export interface MemoryStatistics {
    total_entries: number;
    entries_by_section: Record<string, number>;
    entries_by_status: Record<string, number>;
    entries_by_kind: Record<string, number>;
    avg_confidence: number;
    confidence_distribution: Record<string, number>;
    evidence_type_distribution: Record<string, number>;
    low_confidence_count: number;
    stale_evidence_count: number;
    entries_created_over_time: TimeSeriesPoint[];
    entries_superseded_over_time: TimeSeriesPoint[];
    entries_by_agent: Record<string, number>;
    most_active_agents: AgentActivity[];
    recent_operations: RecentOperation[];
    superseded_percentage: number;
    entries_approaching_expiry: ExpiringEntry[];
    compaction_candidates: number;
    most_queried_subjects?: Array<{
        subject: string;
        count: number;
    }>;
    most_queried_scopes?: Array<{
        scope: string;
        count: number;
    }>;
    query_frequency_over_time?: TimeSeriesPoint[];
}
/**
 * Date range filter for statistics
 */
export interface StatisticsDateRange {
    start_date?: string;
    end_date?: string;
}
/**
 * Compute comprehensive statistics from memory entries
 *
 * @param entries - Array of memory entries to analyze
 * @param dateRange - Optional date range filter (filters by created_at)
 * @returns Comprehensive statistics object
 */
export declare function getStatistics(entries: MemoryEntry[], dateRange?: StatisticsDateRange): MemoryStatistics;
//# sourceMappingURL=statistics.d.ts.map