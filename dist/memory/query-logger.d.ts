/**
 * Query Pattern Tracking for Durable Memory System
 *
 * Logs memory queries to track usage patterns and analyze query frequency.
 * Implements log rotation to prevent unbounded growth.
 */
import { MemoryQueryFilters } from './types.js';
/**
 * Query log entry
 */
export interface QueryLogEntry {
    timestamp: string;
    project: string;
    filters: MemoryQueryFilters;
    result_count: number;
    subjects?: string[];
    scopes?: string[];
}
/**
 * Query pattern statistics
 */
export interface QueryPatternStats {
    most_queried_subjects: Array<{
        subject: string;
        count: number;
    }>;
    most_queried_scopes: Array<{
        scope: string;
        count: number;
    }>;
    query_frequency_over_time: Array<{
        date: string;
        count: number;
    }>;
    total_queries: number;
}
/**
 * Log a query to the query log file
 *
 * @param project - Project name
 * @param filters - Query filters used
 * @param resultCount - Number of results returned
 * @param workspaceRoot - Workspace root directory
 */
export declare function logQuery(project: string, filters: MemoryQueryFilters, resultCount: number, workspaceRoot: string): Promise<void>;
/**
 * Analyze query patterns from log file
 *
 * @param project - Project name
 * @param workspaceRoot - Workspace root directory
 * @param dateRange - Optional date range filter
 * @returns Query pattern statistics
 */
export declare function analyzeQueryPatterns(project: string, workspaceRoot: string, dateRange?: {
    start_date?: string;
    end_date?: string;
}): Promise<QueryPatternStats>;
//# sourceMappingURL=query-logger.d.ts.map