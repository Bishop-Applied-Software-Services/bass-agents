#!/usr/bin/env node

/**
 * CLI commands for bass-agents memory management
 * 
 * Commands:
 * - bass-agents memory init <project>
 * - bass-agents memory list [project] [options]
 * - bass-agents memory show <entry-id>
 * - bass-agents memory query <text> [options]
 * - bass-agents memory compact [project] [options]
 * - bass-agents memory validate-evidence [project]
 * - bass-agents memory check-freshness [project]
 * - bass-agents memory sync-context <project>
 * - bass-agents memory export <project> <output-path> [options]
 * - bass-agents memory import <project> <input-path> [options]
 */

import { MemoryAdapter } from '../memory/memory-adapter';
import { MemoryQueryFilters } from '../memory/types';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

interface ParsedArgs {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
}

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};
  let command = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      // Long option
      const optName = arg.slice(2);
      const nextArg = argv[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        options[optName] = nextArg;
        i++; // Skip next arg
      } else {
        options[optName] = true;
      }
    } else if (arg.startsWith('-')) {
      // Short option (treat as boolean flag)
      options[arg.slice(1)] = true;
    } else {
      // Positional argument
      if (!command) {
        command = arg;
      } else {
        args.push(arg);
      }
    }
  }

  return { command, args, options };
}

/**
 * Get workspace root (current working directory)
 */
function getWorkspaceRoot(): string {
  return process.cwd();
}

/**
 * Format table output
 */
function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No entries found.';
  }

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });

  // Format header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');

  // Format rows
  const formattedRows = rows.map(row =>
    row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' | ')
  );

  return [headerRow, separator, ...formattedRows].join('\n');
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Main CLI handler
 */
export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const workspaceRoot = getWorkspaceRoot();
  const adapter = new MemoryAdapter(workspaceRoot);

  try {
    switch (parsed.command) {
      case 'init':
        await handleInit(adapter, parsed);
        break;
      case 'list':
        await handleList(adapter, parsed);
        break;
      case 'show':
        await handleShow(adapter, parsed);
        break;
      case 'query':
        await handleQuery(adapter, parsed);
        break;
      case 'compact':
        await handleCompact(adapter, parsed);
        break;
      case 'validate-evidence':
        await handleValidateEvidence(adapter, parsed);
        break;
      case 'check-freshness':
        await handleCheckFreshness(adapter, parsed);
        break;
      case 'sync-context':
        await handleSyncContext(adapter, parsed);
        break;
      case 'export':
        await handleExport(adapter, parsed);
        break;
      case 'import':
        await handleImport(adapter, parsed);
        break;
      case 'dashboard':
        await handleDashboard(adapter, parsed);
        break;
      case 'stats':
        await handleStats(adapter, parsed);
        break;
      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
bass-agents memory - Durable memory management for bass-agents

Usage:
  bass-agents memory <command> [options]

Commands:
  init <project>                    Initialize memory storage for a project
  list [project]                    List memory entries
  show <entry-id>                   Show full entry details
  query <text>                      Search memory content
  compact [project]                 Trigger memory consolidation
  validate-evidence [project]       Check all evidence URIs
  check-freshness [project]         List entries approaching expiry
  sync-context <project>            Generate ai-context/ summaries
  export <project> <output-path>    Export memory to file
  import <project> <input-path>     Import memory from file
  dashboard [project]               Display analytics dashboard
  stats [project]                   Display statistics (programmatic access)

Options:
  --section <s>                     Filter by section (list, query)
  --kind <k>                        Filter by kind (list, query)
  --scope <sc>                      Filter by scope (list, query)
  --subject <subj>                  Filter by subject (list, query)
  --status <st>                     Filter by status (list, query)
  --min-confidence <c>              Filter by minimum confidence (list, query, export)
  --dry-run                         Preview changes without applying (compact)
  --conflict-strategy <strategy>    Conflict resolution: skip|overwrite|merge (import)
  --all                             Show all projects (dashboard)
  --refresh <seconds>               Auto-refresh interval in seconds (dashboard, default: 30)
  --range <7d|30d|all>              Date range filter (dashboard, stats, default: all)
  --no-cache                        Bypass statistics cache (dashboard, stats)
  --web                             Generate web dashboard (dashboard)
  --out <path>                      Output path for web dashboard (dashboard --web)
  --json                            Output JSON format (stats)

Examples:
  bass-agents memory init auth-service
  bass-agents memory list auth-service --section decisions --min-confidence 0.7
  bass-agents memory show bd-a1b2c3
  bass-agents memory query "authentication" --section decisions
  bass-agents memory compact auth-service --dry-run
  bass-agents memory export auth-service ./backup.jsonl --min-confidence 0.8
  bass-agents memory import auth-service ./backup.jsonl --conflict-strategy merge
  bass-agents memory dashboard auth-service --range 7d --refresh 30
  bass-agents memory dashboard --all --no-cache
  bass-agents memory dashboard auth-service --web --out ai-memory/dashboard.html
  bass-agents memory stats auth-service --range 30d
  bass-agents memory stats --all --json
`);
}

/**
 * Handle init command
 */
async function handleInit(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length === 0) {
    throw new Error('Project name required. Usage: bass-agents memory init <project>');
  }

  const project = parsed.args[0];
  await adapter.init(project);
  
  const memoryPath = path.join(getWorkspaceRoot(), 'ai-memory', project);
  console.log(`✓ Memory initialized for project: ${project}`);
  console.log(`  Storage path: ${memoryPath}`);
}

/**
 * Handle list command
 */
async function handleList(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';
  
  // Build filters from options
  const filters: MemoryQueryFilters = {};
  
  if (parsed.options.section) {
    filters.section = [parsed.options.section as string];
  }
  if (parsed.options.kind) {
    filters.kind = [parsed.options.kind as string];
  }
  if (parsed.options.scope) {
    filters.scope = [parsed.options.scope as string];
  }
  if (parsed.options.subject) {
    filters.subject = [parsed.options.subject as string];
  }
  if (parsed.options.status) {
    filters.status = [parsed.options.status as string];
  }
  if (parsed.options['min-confidence']) {
    filters.minConfidence = parseFloat(parsed.options['min-confidence'] as string);
  }

  const entries = await adapter.query(project, filters);
  
  if (entries.length === 0) {
    console.log('No entries found.');
    return;
  }

  // Format as table
  const headers = ['ID', 'Timestamp', 'Section', 'Kind', 'Subject', 'Scope', 'Conf', 'Summary'];
  const rows = entries.map(entry => [
    entry.id,
    formatTimestamp(entry.updated_at),
    entry.section,
    entry.kind,
    entry.subject,
    entry.scope,
    entry.confidence.toFixed(2),
    truncate(entry.summary, 80)
  ]);

  console.log(formatTable(headers, rows));
  console.log(`\nTotal: ${entries.length} entries`);
}

/**
 * Handle show command
 */
async function handleShow(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length === 0) {
    throw new Error('Entry ID required. Usage: bass-agents memory show <entry-id>');
  }

  const entryId = parsed.args[0];
  
  // Try to find the entry in all projects
  // For now, we'll need to specify a project or search global
  // This is a simplification - in production, we'd search all projects
  const project = parsed.options.project as string || 'global';
  
  const entry = await adapter.get(project, entryId);
  
  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  // Display full entry details
  console.log(`\nMemory Entry: ${entry.id}`);
  console.log('='.repeat(80));
  console.log(`Section:      ${entry.section}`);
  console.log(`Kind:         ${entry.kind}`);
  console.log(`Subject:      ${entry.subject}`);
  console.log(`Scope:        ${entry.scope}`);
  console.log(`Status:       ${entry.status}`);
  console.log(`Confidence:   ${entry.confidence.toFixed(2)}`);
  console.log(`Created:      ${formatTimestamp(entry.created_at)} by ${entry.created_by}`);
  console.log(`Updated:      ${formatTimestamp(entry.updated_at)}`);
  
  // Note: valid_from and valid_to are not in the base MemoryEntry type
  // They would be added for state entries if needed
  
  if (entry.superseded_by) {
    console.log(`Superseded By: ${entry.superseded_by}`);
  }
  
  console.log(`\nSummary:`);
  console.log(entry.summary);
  
  console.log(`\nContent:`);
  console.log(entry.content);
  
  if (entry.tags.length > 0) {
    console.log(`\nTags: ${entry.tags.join(', ')}`);
  }
  
  console.log(`\nEvidence (${entry.evidence.length}):`);
  entry.evidence.forEach((ev, i) => {
    console.log(`  ${i + 1}. [${ev.type}] ${ev.uri}`);
    console.log(`     ${ev.note}`);
  });
  
  if (entry.related_entries.length > 0) {
    console.log(`\nRelated Entries: ${entry.related_entries.join(', ')}`);
  }
}

/**
 * Handle query command
 */
async function handleQuery(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length === 0) {
    throw new Error('Search text required. Usage: bass-agents memory query <text>');
  }

  const searchText = parsed.args.join(' ');
  const project = parsed.options.project as string || 'global';
  
  // Build filters from options
  const filters: MemoryQueryFilters = {};
  
  if (parsed.options.section) {
    filters.section = [parsed.options.section as string];
  }
  if (parsed.options.kind) {
    filters.kind = [parsed.options.kind as string];
  }
  if (parsed.options.scope) {
    filters.scope = [parsed.options.scope as string];
  }

  // Get all entries matching filters
  const entries = await adapter.query(project, filters);
  
  // Filter by search text (simple substring match)
  const matchingEntries = entries.filter(entry =>
    entry.summary.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.subject.toLowerCase().includes(searchText.toLowerCase())
  );

  if (matchingEntries.length === 0) {
    console.log('No matching entries found.');
    return;
  }

  // Format as table
  const headers = ['ID', 'Section', 'Subject', 'Conf', 'Summary'];
  const rows = matchingEntries.map(entry => [
    entry.id,
    entry.section,
    entry.subject,
    entry.confidence.toFixed(2),
    truncate(entry.summary, 60)
  ]);

  console.log(formatTable(headers, rows));
  console.log(`\nFound: ${matchingEntries.length} matching entries`);
}

/**
 * Handle compact command
 */
async function handleCompact(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';
  const dryRun = parsed.options['dry-run'] === true;

  console.log(`${dryRun ? 'Previewing' : 'Running'} compaction for project: ${project}...`);
  
  const report = await adapter.compact(project, dryRun);
  
  console.log(`\nCompaction Report:`);
  console.log(`  Total entries: ${report.totalEntries}`);
  console.log(`  Superseded entries: ${report.supersededEntries}`);
  console.log(`  Entries compacted: ${report.compactedCount}`);
  
  if (report.output) {
    console.log(`\nDetails:`);
    console.log(report.output);
  }
  
  if (dryRun) {
    console.log(`\nThis was a dry run. Use without --dry-run to apply changes.`);
  } else {
    console.log(`\n✓ Compaction complete`);
  }
}

/**
 * Handle validate-evidence command
 */
async function handleValidateEvidence(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';

  console.log(`Validating evidence URIs for project: ${project}...`);
  
  const report = await adapter.validateEvidence(project);
  
  console.log(`\nEvidence Validation Report:`);
  console.log(`  Total entries checked: ${report.totalEntries}`);
  console.log(`  Total evidence checked: ${report.totalEvidence}`);
  console.log(`  Stale evidence found: ${report.staleEvidence.length}`);
  
  if (report.staleEvidence.length > 0) {
    console.log(`\nStale Evidence:`);
    report.staleEvidence.forEach(item => {
      console.log(`  Entry: ${item.entryId}`);
      console.log(`    URI: ${item.evidenceUri}`);
      console.log(`    Error: ${item.error}`);
    });
  } else {
    console.log(`\n✓ All evidence URIs are valid`);
  }
}

/**
 * Handle check-freshness command
 */
async function handleCheckFreshness(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';

  console.log(`Checking freshness for project: ${project}...`);
  
  const report = await adapter.checkFreshness(project);
  
  console.log(`\nFreshness Report:`);
  console.log(`  Entries expiring soon: ${report.expiringEntries.length}`);
  
  if (report.expiringEntries.length > 0) {
    console.log(`\nExpiring Entries:`);
    report.expiringEntries.forEach(item => {
      console.log(`  ${item.id}: ${truncate(item.summary, 50)}`);
      console.log(`    Expires: ${formatTimestamp(item.valid_to)}`);
    });
  } else {
    console.log(`\n✓ All entries are fresh`);
  }
  
  if (report.message) {
    console.log(`\n${report.message}`);
  }
}

/**
 * Handle sync-context command
 */
async function handleSyncContext(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length === 0) {
    throw new Error('Project name required. Usage: bass-agents memory sync-context <project>');
  }

  const project = parsed.args[0];

  console.log(`Syncing context for project: ${project}...`);
  
  await adapter.syncContext(project);
  
  const contextPath = path.join(getWorkspaceRoot(), 'ai-context', `${project}-memory-summary.md`);
  console.log(`\n✓ Context synced`);
  console.log(`  Output: ${contextPath}`);
}

/**
 * Handle export command
 */
async function handleExport(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length < 2) {
    throw new Error('Project and output path required. Usage: bass-agents memory export <project> <output-path>');
  }

  const project = parsed.args[0];
  const outputPath = parsed.args[1];
  
  // Build filters from options
  const filters: any = {};
  
  if (parsed.options.section) {
    filters.section = [parsed.options.section as string];
  }
  if (parsed.options['min-confidence']) {
    filters.minConfidence = parseFloat(parsed.options['min-confidence'] as string);
  }

  console.log(`Exporting memory for project: ${project}...`);
  
  await adapter.export(project, outputPath, filters);
  
  const stats = fs.statSync(outputPath);
  console.log(`\n✓ Export complete`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
}

/**
 * Handle import command
 */
async function handleImport(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  if (parsed.args.length < 2) {
    throw new Error('Project and input path required. Usage: bass-agents memory import <project> <input-path>');
  }

  const project = parsed.args[0];
  const inputPath = parsed.args[1];
  const conflictStrategy = (parsed.options['conflict-strategy'] as string) || 'skip';

  if (!['skip', 'overwrite', 'merge'].includes(conflictStrategy)) {
    throw new Error('Invalid conflict strategy. Must be: skip, overwrite, or merge');
  }

  console.log(`Importing memory for project: ${project}...`);
  console.log(`  Conflict strategy: ${conflictStrategy}`);
  
  const report = await adapter.import(project, inputPath, conflictStrategy as 'skip' | 'overwrite' | 'merge');
  
  console.log(`\nImport Report:`);
  console.log(`  Total entries: ${report.totalEntries}`);
  console.log(`  Successful: ${report.successCount}`);
  console.log(`  Skipped: ${report.skipCount}`);
  console.log(`  Errors: ${report.errorCount}`);
  
  if (report.conflicts.length > 0) {
    console.log(`\nConflicts:`);
    report.conflicts.forEach(conflict => {
      console.log(`  - ${conflict.id}: ${conflict.resolution}`);
    });
  }
  
  if (report.errors.length > 0) {
    console.log(`\nErrors:`);
    report.errors.forEach(error => {
      console.log(`  - Line ${error.line}: ${error.error}`);
    });
  }
  
  console.log(`\n✓ Import complete`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  main(args).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

/**
 * Handle dashboard command
 * 
 * Requirements:
 * - 21.1: Dashboard command with project filtering
 * - 21.8: Auto-refresh mechanism (30 seconds default)
 * - 21.9: Support --all flag for all projects
 * - 21.10: Support date range filtering (7d, 30d, all)
 */
async function handleDashboard(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';
  const showAll = parsed.options.all === true;
  const rangeOption = (parsed.options.range as string) || 'all';
  const bypassCache = parsed.options['no-cache'] === true;
  const webMode = parsed.options.web === true;

  // Parse date range
  const dateRange = parseDateRange(rangeOption);

  if (webMode) {
    await displayWebDashboard(project, showAll, parsed.options.out as string | undefined);
    return;
  }

  // Display dashboard with blessed UI (handles its own lifecycle)
  await displayDashboard(adapter, project, dateRange, bypassCache, showAll);
}

/**
 * Parse date range option to StatisticsDateRange
 */
function parseDateRange(rangeOption: string): { start_date?: string; end_date?: string } | undefined {
  const now = new Date();
  
  switch (rangeOption) {
    case '7d': {
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start_date: startDate.toISOString(),
        end_date: now.toISOString()
      };
    }
    case '30d': {
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        start_date: startDate.toISOString(),
        end_date: now.toISOString()
      };
    }
    case 'all':
    default:
      return undefined; // No date range filter
  }
}

/**
 * Handle stats command
 */
async function handleStats(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const project = parsed.args[0] || 'global';
  const showAll = parsed.options.all === true;
  const rangeOption = (parsed.options.range as string) || 'all';
  const bypassCache = parsed.options['no-cache'] === true;
  const jsonOutput = parsed.options.json === true;

  // Parse date range
  const dateRange = parseDateRange(rangeOption);

  try {
    // Get statistics
    const stats = await adapter.getStatistics(project, dateRange, bypassCache);

    if (jsonOutput) {
      // Output complete JSON
      console.log(JSON.stringify(stats, null, 2));
    } else {
      // Human-readable summary
      console.log(`\nMemory Statistics for ${showAll ? 'all projects' : project}`);
      console.log(`Date Range: ${rangeOption}`);
      console.log('='.repeat(60));
      
      // Basic counts
      console.log(`\nTotal Entries: ${stats.total_entries}`);
      console.log(`Active Entries: ${stats.entries_by_status.active || 0}`);
      console.log(`Average Confidence: ${stats.avg_confidence.toFixed(2)}`);
      console.log(`Low Confidence Entries: ${stats.low_confidence_count}`);
      console.log(`Stale Evidence: ${stats.stale_evidence_count}`);
      
      // Sections
      console.log(`\nEntries by Section:`);
      Object.entries(stats.entries_by_section)
        .sort(([, a], [, b]) => b - a)
        .forEach(([section, count]) => {
          console.log(`  ${section}: ${count}`);
        });
      
      // Status
      console.log(`\nEntries by Status:`);
      Object.entries(stats.entries_by_status)
        .sort(([, a], [, b]) => b - a)
        .forEach(([status, count]) => {
          console.log(`  ${status}: ${count}`);
        });
      
      // Confidence distribution
      console.log(`\nConfidence Distribution:`);
      const confidenceRanges = ['0.0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];
      confidenceRanges.forEach(range => {
        const count = stats.confidence_distribution[range] || 0;
        console.log(`  ${range}: ${count}`);
      });
      
      // Evidence types
      console.log(`\nEvidence Types:`);
      Object.entries(stats.evidence_type_distribution)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
      
      // Top agents
      if (stats.most_active_agents.length > 0) {
        console.log(`\nMost Active Agents (Top 5):`);
        stats.most_active_agents.slice(0, 5).forEach(agent => {
          console.log(`  ${agent.agent}: ${agent.count} entries`);
        });
      }
      
      // Lifecycle metrics
      console.log(`\nLifecycle Metrics:`);
      console.log(`  Superseded: ${stats.superseded_percentage.toFixed(1)}%`);
      console.log(`  Compaction Candidates: ${stats.compaction_candidates}`);
      console.log(`  Entries Approaching Expiry: ${stats.entries_approaching_expiry.length}`);
      
      // Recent operations
      if (stats.recent_operations.length > 0) {
        console.log(`\nRecent Operations (Last 5):`);
        stats.recent_operations.slice(0, 5).forEach(op => {
          const timestamp = formatTimestamp(op.timestamp);
          const summary = truncate(op.summary, 40);
          console.log(`  ${timestamp} | ${op.operation} | ${op.agent} | ${summary}`);
        });
      }
      
      console.log('');
    }
  } catch (error) {
    throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Display dashboard with statistics using blessed UI
 */
async function displayDashboard(
  adapter: MemoryAdapter,
  project: string,
  dateRange: { start_date?: string; end_date?: string } | undefined,
  bypassCache: boolean,
  showAll: boolean
): Promise<void> {
  // Import dashboard UI module
  const { createDashboardUI } = require('../memory/dashboard-ui');
  
  try {
    // Fetch initial statistics
    const stats = await adapter.getStatistics(project, dateRange, bypassCache);
    
    // Format date range for display
    let dateRangeStr = 'All time';
    if (dateRange && dateRange.start_date) {
      const start = new Date(dateRange.start_date).toISOString().split('T')[0];
      const end = new Date(dateRange.end_date!).toISOString().split('T')[0];
      dateRangeStr = `${start} to ${end}`;
    }
    
    // Create blessed UI
    const screen = createDashboardUI(stats, {
      project,
      dateRange: dateRangeStr,
      onRefresh: async () => {
        // Refresh with cache bypass
        return await adapter.getStatistics(project, dateRange, true);
      },
      onQuit: () => {
        console.log('\nDashboard closed.');
      },
    });
    
    // Keep process alive until user quits
    await new Promise(() => {}); // Never resolves
    
  } catch (error) {
    console.error('Error fetching dashboard data:', error instanceof Error ? error.message : String(error));
    console.log('\nTip: Make sure the project is initialized with: bass-agents memory init <project>');
  }
}

/**
 * Generate static web dashboard for memory entries
 */
async function displayWebDashboard(
  project: string,
  showAll: boolean,
  outPath?: string
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  const scriptPath = path.join(workspaceRoot, 'scripts', 'memory-dashboard-web.py');
  const rootPath = path.join(workspaceRoot, 'ai-memory');
  const args = [scriptPath, '--root', rootPath];
  if (!showAll) {
    args.push('--project', project);
  }

  if (outPath) {
    args.push('--out', path.isAbsolute(outPath) ? outPath : path.join(workspaceRoot, outPath));
  } else if (!showAll) {
    const projectFile = `${project}-dashboard.html`;
    args.push('--out', path.join(rootPath, projectFile));
  }

  try {
    const output = execFileSync('python3', args, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(output.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate web dashboard: ${message}`);
  }
}
