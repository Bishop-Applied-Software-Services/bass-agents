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
 * Cache entry structure
 */
interface StatisticsCacheEntry {
  project: string;
  computed_at: string; // ISO 8601 timestamp
  expires_at: string; // ISO 8601 timestamp (5 minutes from computed_at)
  statistics: MemoryStatistics;
  dateRange?: StatisticsDateRange; // Cache key includes date range
}

/**
 * Statistics cache manager
 */
export class StatisticsCache {
  private cache: Map<string, StatisticsCacheEntry>;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached statistics for a project
   * 
   * @param project - Project name
   * @param dateRange - Optional date range filter
   * @param bypassCache - If true, ignore cache and force recomputation
   * @returns Cached statistics or null if not found/expired
   */
  get(
    project: string,
    dateRange?: StatisticsDateRange,
    bypassCache: boolean = false
  ): MemoryStatistics | null {
    if (bypassCache) {
      return null;
    }

    const cacheKey = this.getCacheKey(project, dateRange);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(entry.expires_at);

    if (now > expiresAt) {
      // Expired, remove from cache
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.statistics;
  }

  /**
   * Set cached statistics for a project
   * 
   * @param project - Project name
   * @param statistics - Statistics to cache
   * @param dateRange - Optional date range filter
   */
  set(
    project: string,
    statistics: MemoryStatistics,
    dateRange?: StatisticsDateRange
  ): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS);

    const entry: StatisticsCacheEntry = {
      project,
      computed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      statistics,
      dateRange,
    };

    const cacheKey = this.getCacheKey(project, dateRange);
    this.cache.set(cacheKey, entry);
  }

  /**
   * Invalidate cache for a project (event-based invalidation)
   * 
   * @param project - Project name
   */
  invalidate(project: string): void {
    // Remove all cache entries for this project (all date ranges)
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.project === project) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cached statistics
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getStats(): { size: number; entries: Array<{ project: string; computed_at: string; expires_at: string }> } {
    const entries = Array.from(this.cache.values()).map(entry => ({
      project: entry.project,
      computed_at: entry.computed_at,
      expires_at: entry.expires_at,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Generate cache key from project and date range
   */
  private getCacheKey(project: string, dateRange?: StatisticsDateRange): string {
    if (!dateRange) {
      return project;
    }

    const start = dateRange.start_date || 'none';
    const end = dateRange.end_date || 'none';
    return `${project}:${start}:${end}`;
  }
}

/**
 * Global statistics cache instance
 */
export const statisticsCache = new StatisticsCache();
