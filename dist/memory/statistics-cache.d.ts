/**
 * Statistics Cache Module
 *
 * Provides in-memory caching for memory statistics with time-based and event-based invalidation.
 *
 * Requirements:
 * - 22.9: Compute statistics efficiently without scanning all entries for every request
 */
import { MemoryStatistics, StatisticsDateRange } from './statistics.js';
/**
 * Statistics cache manager
 */
export declare class StatisticsCache {
    private cache;
    private readonly TTL_MS;
    constructor();
    /**
     * Get cached statistics for a project
     *
     * @param project - Project name
     * @param dateRange - Optional date range filter
     * @param bypassCache - If true, ignore cache and force recomputation
     * @returns Cached statistics or null if not found/expired
     */
    get(project: string, dateRange?: StatisticsDateRange, bypassCache?: boolean): MemoryStatistics | null;
    /**
     * Set cached statistics for a project
     *
     * @param project - Project name
     * @param statistics - Statistics to cache
     * @param dateRange - Optional date range filter
     */
    set(project: string, statistics: MemoryStatistics, dateRange?: StatisticsDateRange): void;
    /**
     * Invalidate cache for a project (event-based invalidation)
     *
     * @param project - Project name
     */
    invalidate(project: string): void;
    /**
     * Clear all cached statistics
     */
    clear(): void;
    /**
     * Get cache statistics (for debugging)
     */
    getStats(): {
        size: number;
        entries: Array<{
            project: string;
            computed_at: string;
            expires_at: string;
        }>;
    };
    /**
     * Generate cache key from project and date range
     */
    private getCacheKey;
}
/**
 * Global statistics cache instance
 */
export declare const statisticsCache: StatisticsCache;
//# sourceMappingURL=statistics-cache.d.ts.map