/**
 * Query Pattern Tracking for Durable Memory System
 * 
 * Logs memory queries to track usage patterns and analyze query frequency.
 * Implements log rotation to prevent unbounded growth.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryQueryFilters } from './types.js';

/**
 * Query log entry
 */
export interface QueryLogEntry {
  timestamp: string; // ISO 8601
  project: string;
  filters: MemoryQueryFilters;
  result_count: number;
  subjects?: string[]; // Extracted from filters
  scopes?: string[]; // Extracted from filters
}

/**
 * Query pattern statistics
 */
export interface QueryPatternStats {
  most_queried_subjects: Array<{ subject: string; count: number }>;
  most_queried_scopes: Array<{ scope: string; count: number }>;
  query_frequency_over_time: Array<{ date: string; count: number }>;
  total_queries: number;
}

/**
 * Query logger configuration
 */
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_LOG_ENTRIES = 10000;

/**
 * Log a query to the query log file
 * 
 * @param project - Project name
 * @param filters - Query filters used
 * @param resultCount - Number of results returned
 * @param workspaceRoot - Workspace root directory
 */
export async function logQuery(
  project: string,
  filters: MemoryQueryFilters,
  resultCount: number,
  workspaceRoot: string
): Promise<void> {
  const logPath = getQueryLogPath(project, workspaceRoot);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  
  // Create log entry
  const logEntry: QueryLogEntry = {
    timestamp: new Date().toISOString(),
    project,
    filters,
    result_count: resultCount,
    subjects: filters.subject,
    scopes: filters.scope,
  };
  
  // Append to log file (JSONL format)
  const logLine = JSON.stringify(logEntry) + '\n';
  await fs.appendFile(logPath, logLine, 'utf-8');
  
  // Check if rotation is needed
  await rotateLogIfNeeded(logPath);
}

/**
 * Analyze query patterns from log file
 * 
 * @param project - Project name
 * @param workspaceRoot - Workspace root directory
 * @param dateRange - Optional date range filter
 * @returns Query pattern statistics
 */
export async function analyzeQueryPatterns(
  project: string,
  workspaceRoot: string,
  dateRange?: { start_date?: string; end_date?: string }
): Promise<QueryPatternStats> {
  const logPath = getQueryLogPath(project, workspaceRoot);
  
  // Check if log file exists
  try {
    await fs.access(logPath);
  } catch {
    // Log file doesn't exist, return empty stats
    return {
      most_queried_subjects: [],
      most_queried_scopes: [],
      query_frequency_over_time: [],
      total_queries: 0,
    };
  }
  
  // Read and parse log file
  const logContent = await fs.readFile(logPath, 'utf-8');
  const logLines = logContent.trim().split('\n').filter(line => line.length > 0);
  
  let logEntries: QueryLogEntry[] = logLines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((entry): entry is QueryLogEntry => entry !== null);
  
  // Apply date range filter if provided
  if (dateRange) {
    logEntries = filterLogEntriesByDateRange(logEntries, dateRange);
  }
  
  // Analyze patterns
  const subjectCounts = new Map<string, number>();
  const scopeCounts = new Map<string, number>();
  const dateCounts = new Map<string, number>();
  
  for (const entry of logEntries) {
    // Count subjects
    if (entry.subjects) {
      for (const subject of entry.subjects) {
        subjectCounts.set(subject, (subjectCounts.get(subject) || 0) + 1);
      }
    }
    
    // Count scopes
    if (entry.scopes) {
      for (const scope of entry.scopes) {
        scopeCounts.set(scope, (scopeCounts.get(scope) || 0) + 1);
      }
    }
    
    // Count queries per day
    const date = entry.timestamp.split('T')[0];
    dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
  }
  
  // Convert to sorted arrays
  const most_queried_subjects = Array.from(subjectCounts.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const most_queried_scopes = Array.from(scopeCounts.entries())
    .map(([scope, count]) => ({ scope, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const query_frequency_over_time = Array.from(dateCounts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return {
    most_queried_subjects,
    most_queried_scopes,
    query_frequency_over_time,
    total_queries: logEntries.length,
  };
}

/**
 * Get the path to the query log file
 */
function getQueryLogPath(project: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'ai-memory', project, '.query-log.jsonl');
}

/**
 * Rotate log file if it exceeds size or entry limits
 */
async function rotateLogIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await fs.stat(logPath);
    
    // Check size limit
    if (stats.size > MAX_LOG_SIZE_BYTES) {
      await rotateLog(logPath);
      return;
    }
    
    // Check entry count limit
    const content = await fs.readFile(logPath, 'utf-8');
    const lineCount = content.split('\n').filter(line => line.length > 0).length;
    
    if (lineCount > MAX_LOG_ENTRIES) {
      await rotateLog(logPath);
    }
  } catch (error) {
    // Ignore errors (file might not exist yet)
  }
}

/**
 * Rotate log file by keeping only the most recent half of entries
 */
async function rotateLog(logPath: string): Promise<void> {
  const content = await fs.readFile(logPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.length > 0);
  
  // Keep the most recent half of entries
  const keepCount = Math.floor(lines.length / 2);
  const keptLines = lines.slice(-keepCount);
  
  // Write back to file
  await fs.writeFile(logPath, keptLines.join('\n') + '\n', 'utf-8');
}

/**
 * Filter log entries by date range
 */
function filterLogEntriesByDateRange(
  entries: QueryLogEntry[],
  dateRange: { start_date?: string; end_date?: string }
): QueryLogEntry[] {
  return entries.filter(entry => {
    const timestamp = new Date(entry.timestamp);
    
    if (dateRange.start_date) {
      const startDate = new Date(dateRange.start_date);
      if (timestamp < startDate) return false;
    }
    
    if (dateRange.end_date) {
      const endDate = new Date(dateRange.end_date);
      if (timestamp > endDate) return false;
    }
    
    return true;
  });
}
