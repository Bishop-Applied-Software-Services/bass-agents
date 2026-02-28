"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatistics = getStatistics;
/**
 * Compute comprehensive statistics from memory entries
 *
 * @param entries - Array of memory entries to analyze
 * @param dateRange - Optional date range filter (filters by created_at)
 * @returns Comprehensive statistics object
 */
function getStatistics(entries, dateRange) {
    // Apply date range filtering if provided
    let filteredEntries = entries;
    if (dateRange) {
        filteredEntries = filterByDateRange(entries, dateRange);
    }
    // Basic counts
    const total_entries = filteredEntries.length;
    const entries_by_section = countByField(filteredEntries, 'section');
    const entries_by_status = countByField(filteredEntries, 'status');
    const entries_by_kind = countByField(filteredEntries, 'kind');
    // Quality metrics
    const avg_confidence = calculateAverageConfidence(filteredEntries);
    const confidence_distribution = calculateConfidenceDistribution(filteredEntries);
    const evidence_type_distribution = calculateEvidenceTypeDistribution(filteredEntries);
    const low_confidence_count = filteredEntries.filter(e => e.confidence < 0.5).length;
    const stale_evidence_count = 0; // TODO: Implement stale evidence detection
    // Growth trends
    const entries_created_over_time = calculateTimeSeries(filteredEntries, 'created_at');
    const supersededEntries = filteredEntries.filter(e => e.status === 'superseded');
    const entries_superseded_over_time = calculateTimeSeries(supersededEntries, 'updated_at');
    // Agent activity
    const entries_by_agent = countByField(filteredEntries, 'created_by');
    const most_active_agents = calculateMostActiveAgents(entries_by_agent);
    const recent_operations = calculateRecentOperations(filteredEntries);
    // Lifecycle metrics
    const superseded_percentage = total_entries > 0
        ? (supersededEntries.length / total_entries) * 100
        : 0;
    const entries_approaching_expiry = calculateApproachingExpiry(filteredEntries);
    const compaction_candidates = supersededEntries.length;
    return {
        total_entries,
        entries_by_section,
        entries_by_status,
        entries_by_kind,
        avg_confidence,
        confidence_distribution,
        evidence_type_distribution,
        low_confidence_count,
        stale_evidence_count,
        entries_created_over_time,
        entries_superseded_over_time,
        entries_by_agent,
        most_active_agents,
        recent_operations,
        superseded_percentage,
        entries_approaching_expiry,
        compaction_candidates,
    };
}
/**
 * Filter entries by date range (based on created_at)
 */
function filterByDateRange(entries, dateRange) {
    return entries.filter(entry => {
        const createdAt = new Date(entry.created_at);
        if (dateRange.start_date) {
            const startDate = new Date(dateRange.start_date);
            if (createdAt < startDate)
                return false;
        }
        if (dateRange.end_date) {
            const endDate = new Date(dateRange.end_date);
            if (createdAt > endDate)
                return false;
        }
        return true;
    });
}
/**
 * Count entries by a specific field
 */
function countByField(entries, field) {
    const counts = {};
    for (const entry of entries) {
        const value = String(entry[field]);
        counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
}
/**
 * Calculate average confidence score
 */
function calculateAverageConfidence(entries) {
    if (entries.length === 0)
        return 0;
    const sum = entries.reduce((acc, entry) => acc + entry.confidence, 0);
    return sum / entries.length;
}
/**
 * Calculate confidence distribution in ranges
 */
function calculateConfidenceDistribution(entries) {
    const distribution = {
        '0.0-0.2': 0,
        '0.2-0.4': 0,
        '0.4-0.6': 0,
        '0.6-0.8': 0,
        '0.8-1.0': 0,
    };
    for (const entry of entries) {
        const conf = entry.confidence;
        if (conf < 0.2)
            distribution['0.0-0.2']++;
        else if (conf < 0.4)
            distribution['0.2-0.4']++;
        else if (conf < 0.6)
            distribution['0.4-0.6']++;
        else if (conf < 0.8)
            distribution['0.6-0.8']++;
        else
            distribution['0.8-1.0']++;
    }
    return distribution;
}
/**
 * Calculate evidence type distribution
 */
function calculateEvidenceTypeDistribution(entries) {
    const distribution = {};
    for (const entry of entries) {
        for (const evidence of entry.evidence) {
            distribution[evidence.type] = (distribution[evidence.type] || 0) + 1;
        }
    }
    return distribution;
}
/**
 * Calculate time series data (entries per day)
 */
function calculateTimeSeries(entries, dateField) {
    const dateCounts = new Map();
    for (const entry of entries) {
        const timestamp = entry[dateField];
        const date = timestamp.split('T')[0]; // Extract YYYY-MM-DD
        dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    }
    // Convert to array and sort by date
    const timeSeries = Array.from(dateCounts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    return timeSeries;
}
/**
 * Calculate most active agents (top 10)
 */
function calculateMostActiveAgents(entries_by_agent) {
    return Object.entries(entries_by_agent)
        .map(([agent, count]) => ({ agent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}
/**
 * Calculate recent operations (last 20)
 */
function calculateRecentOperations(entries) {
    const operations = [];
    for (const entry of entries) {
        // Determine operation type based on status and timestamps
        let operation = 'create';
        let timestamp = entry.created_at;
        if (entry.status === 'superseded') {
            operation = 'supersede';
            timestamp = entry.updated_at;
        }
        else if (entry.status === 'deprecated') {
            operation = 'deprecate';
            timestamp = entry.updated_at;
        }
        operations.push({
            timestamp,
            operation,
            entry_id: entry.id,
            agent: entry.created_by,
            summary: entry.summary.substring(0, 80), // Truncate to 80 chars
        });
    }
    // Sort by timestamp descending and take last 20
    return operations
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 20);
}
/**
 * Calculate entries approaching expiry (within 7 days)
 */
function calculateApproachingExpiry(entries) {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringEntries = [];
    for (const entry of entries) {
        // Only check state entries with valid_to
        if (entry.section === 'state' && 'valid_to' in entry) {
            const validTo = new Date(entry.valid_to);
            if (validTo > now && validTo <= sevenDaysFromNow) {
                const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
                expiringEntries.push({
                    entry_id: entry.id,
                    summary: entry.summary,
                    valid_to: entry.valid_to,
                    days_remaining: daysRemaining,
                });
            }
        }
    }
    // Sort by days remaining ascending
    return expiringEntries.sort((a, b) => a.days_remaining - b.days_remaining);
}
//# sourceMappingURL=statistics.js.map