#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { MemoryAdapter } from '../memory/memory-adapter';
import { MemoryQueryFilters } from '../memory/types';
import {
  assertPathWithinProject,
  loadProjectContext,
  resolveProjectRoot,
  ResolvedProjectContext,
} from '../project-context';

interface ParsedArgs {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};
  let command = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const optionName = arg.slice(2);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options[optionName] = nextArg;
        i++;
      } else {
        options[optionName] = true;
      }
      continue;
    }

    if (arg.startsWith('-')) {
      options[arg.slice(1)] = true;
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      args.push(arg);
    }
  }

  return { command, args, options };
}

function getProjectContext(parsed: ParsedArgs): ResolvedProjectContext {
  const projectRoot = resolveProjectRoot(parsed.options.project as string | undefined);
  return loadProjectContext(projectRoot);
}

function requireLocalMemory(context: ResolvedProjectContext): void {
  if (!context.initialized) {
    throw new Error(
      `bass-agents is not initialized for ${context.projectRoot}.\n` +
      `Run: bass-agents init`
    );
  }

  if (!context.durableMemoryEnabled) {
    throw new Error(
      `Durable memory is disabled for this project.\n` +
      `Re-run: bass-agents init --durable-memory`
    );
  }
}

function createAdapter(context: ResolvedProjectContext): MemoryAdapter {
  return new MemoryAdapter(context);
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No entries found.';
  }

  const widths = headers.map((header, index) => {
    const maxRowWidth = Math.max(...rows.map(row => (row[index] || '').length));
    return Math.max(header.length, maxRowWidth);
  });

  const headerRow = headers.map((header, index) => header.padEnd(widths[index])).join(' | ');
  const separator = widths.map(width => '-'.repeat(width)).join('-+-');
  const body = rows.map(row =>
    row.map((cell, index) => (cell || '').padEnd(widths[index])).join(' | ')
  );

  return [headerRow, separator, ...body].join('\n');
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}

function formatTimestamp(isoString: string): string {
  if (!isoString) {
    return '';
  }
  return new Date(isoString).toISOString().replace('T', ' ').slice(0, 19);
}

function parseDateRange(
  rangeOption: string
): { start_date?: string; end_date?: string } | undefined {
  const now = new Date();

  switch (rangeOption) {
    case '7d':
      return {
        start_date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: now.toISOString(),
      };
    case '30d':
      return {
        start_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: now.toISOString(),
      };
    default:
      return undefined;
  }
}

function buildFilters(parsed: ParsedArgs): MemoryQueryFilters {
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

  return filters;
}

function ensureNoAllOption(parsed: ParsedArgs): void {
  if (parsed.options.all === true) {
    throw new Error('--all is not supported in project-local mode');
  }
}

function showHelp(): void {
  console.log(`
bass-agents memory - Project-local durable memory management

Usage:
  bass-agents memory <command> [options]

Commands:
  list                            List memory entries in the current project
  show <entry-id>                 Show full entry details
  query <text>                    Search memory content
  compact                         Trigger local memory consolidation
  validate-evidence               Check local evidence references
  check-freshness                 List entries approaching expiry
  sync-context                    Generate ai-context/ summaries
  export <output-path>            Export memory to JSONL
  import <input-path>             Import memory from JSONL
  dashboard                       Display local memory dashboard
  stats                           Display local memory statistics

Options:
  --project <path>                Resolve a specific project root (default: cwd)
  --section <name>                Filter by section
  --kind <name>                   Filter by kind
  --scope <scope>                 Filter by scope
  --subject <subject>             Filter by subject
  --status <status>               Filter by status
  --min-confidence <value>        Minimum confidence filter
  --dry-run                       Preview compaction only
  --conflict-strategy <strategy>  Import strategy: skip|overwrite|merge
  --range <7d|30d|all>            Stats/dashboard date range
  --no-cache                      Bypass statistics cache
  --web                           Generate static web dashboard
  --out <path>                    Output path for web dashboard
  --json                          Output stats as JSON

Examples:
  bass-agents memory list
  bass-agents memory query "authentication" --section decisions
  bass-agents memory export ./backup.jsonl
  bass-agents memory import ./backup.jsonl --conflict-strategy merge
  bass-agents memory dashboard --web
`);
}

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const context = getProjectContext(parsed);
  const adapter = createAdapter(context);

  try {
    switch (parsed.command) {
      case 'list':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleList(adapter, parsed);
        return;
      case 'show':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleShow(adapter, parsed);
        return;
      case 'query':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleQuery(adapter, parsed);
        return;
      case 'compact':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleCompact(adapter, parsed);
        return;
      case 'validate-evidence':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleValidateEvidence(adapter);
        return;
      case 'check-freshness':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleCheckFreshness(adapter);
        return;
      case 'sync-context':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleSyncContext(adapter, context);
        return;
      case 'export':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleExport(adapter, context, parsed);
        return;
      case 'import':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleImport(adapter, context, parsed);
        return;
      case 'dashboard':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleDashboard(adapter, context, parsed);
        return;
      case 'stats':
        ensureNoAllOption(parsed);
        requireLocalMemory(context);
        await handleStats(adapter, context, parsed);
        return;
      default:
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleList(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const entries = await adapter.query(buildFilters(parsed));
  const rows = entries.map(entry => [
    entry.id,
    formatTimestamp(entry.updated_at),
    entry.section,
    entry.kind,
    entry.subject,
    entry.scope,
    entry.confidence.toFixed(2),
    truncate(entry.summary, 80),
  ]);

  console.log(
    formatTable(
      ['ID', 'Updated', 'Section', 'Kind', 'Subject', 'Scope', 'Conf', 'Summary'],
      rows
    )
  );
  console.log(`\nTotal: ${entries.length} entries`);
}

async function handleShow(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const entryId = parsed.args[0];
  if (!entryId) {
    throw new Error('Usage: bass-agents memory show <entry-id>');
  }

  const entry = await adapter.get(entryId);
  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

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

  if (entry.superseded_by) {
    console.log(`Superseded By:${entry.superseded_by}`);
  }

  console.log(`\nSummary:\n${entry.summary}`);
  console.log(`\nContent:\n${entry.content}`);

  if (entry.tags.length > 0) {
    console.log(`\nTags: ${entry.tags.join(', ')}`);
  }

  if (entry.evidence.length > 0) {
    console.log(`\nEvidence (${entry.evidence.length}):`);
    entry.evidence.forEach((evidence, index) => {
      console.log(`  ${index + 1}. [${evidence.type}] ${evidence.uri}`);
      console.log(`     ${evidence.note}`);
    });
  }

  if (entry.related_entries.length > 0) {
    console.log(`\nRelated Entries: ${entry.related_entries.join(', ')}`);
  }
}

async function handleQuery(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const searchText = parsed.args.join(' ').trim();
  if (!searchText) {
    throw new Error('Usage: bass-agents memory query <text>');
  }

  const entries = await adapter.query(buildFilters(parsed));
  const matchingEntries = entries.filter(entry => {
    const haystack = `${entry.summary}\n${entry.content}\n${entry.subject}`.toLowerCase();
    return haystack.includes(searchText.toLowerCase());
  });

  const rows = matchingEntries.map(entry => [
    entry.id,
    entry.section,
    entry.subject,
    entry.confidence.toFixed(2),
    truncate(entry.summary, 72),
  ]);

  console.log(formatTable(['ID', 'Section', 'Subject', 'Conf', 'Summary'], rows));
  console.log(`\nFound: ${matchingEntries.length} matching entries`);
}

async function handleCompact(adapter: MemoryAdapter, parsed: ParsedArgs): Promise<void> {
  const dryRun = parsed.options['dry-run'] === true;
  const report = await adapter.compact(dryRun);

  console.log(`Compaction Report`);
  console.log(`  Total entries: ${report.totalEntries}`);
  console.log(`  Superseded entries: ${report.supersededEntries}`);
  console.log(`  Entries compacted: ${report.compactedCount}`);
  if (report.output) {
    console.log(`\n${report.output}`);
  }
}

async function handleValidateEvidence(adapter: MemoryAdapter): Promise<void> {
  const report = await adapter.validateEvidence();
  console.log(`Evidence Validation Report`);
  console.log(`  Total entries: ${report.totalEntries}`);
  console.log(`  Total evidence: ${report.totalEvidence}`);
  console.log(`  Stale evidence: ${report.staleEvidence.length}`);
  if (report.message) {
    console.log(`\n${report.message}`);
  }
}

async function handleCheckFreshness(adapter: MemoryAdapter): Promise<void> {
  const report = await adapter.checkFreshness();
  console.log(`Freshness Report`);
  console.log(`  Entries expiring soon: ${report.expiringEntries.length}`);
  if (report.message) {
    console.log(`\n${report.message}`);
  }
}

async function handleSyncContext(
  adapter: MemoryAdapter,
  context: ResolvedProjectContext
): Promise<void> {
  await adapter.syncContext();
  console.log(`Context synced to ${context.aiContextRoot}`);
}

async function handleExport(
  adapter: MemoryAdapter,
  context: ResolvedProjectContext,
  parsed: ParsedArgs
): Promise<void> {
  const outputPath = parsed.args[0];
  if (!outputPath) {
    throw new Error('Usage: bass-agents memory export <output-path>');
  }

  const exportPath = assertPathWithinProject(
    context.projectRoot,
    path.isAbsolute(outputPath)
      ? outputPath
      : path.join(context.projectRoot, outputPath),
    'export output'
  );
  await adapter.export(exportPath, buildFilters(parsed));
  console.log(`Exported memory to ${exportPath}`);
}

async function handleImport(
  adapter: MemoryAdapter,
  context: ResolvedProjectContext,
  parsed: ParsedArgs
): Promise<void> {
  const inputPath = parsed.args[0];
  if (!inputPath) {
    throw new Error('Usage: bass-agents memory import <input-path>');
  }

  const conflictStrategy = ((parsed.options['conflict-strategy'] as string) || 'skip') as
    | 'skip'
    | 'overwrite'
    | 'merge';
  if (!['skip', 'overwrite', 'merge'].includes(conflictStrategy)) {
    throw new Error('Invalid conflict strategy. Must be: skip, overwrite, or merge');
  }

  const importPath = assertPathWithinProject(
    context.projectRoot,
    path.isAbsolute(inputPath)
      ? inputPath
      : path.join(context.projectRoot, inputPath),
    'import input'
  );
  const report = await adapter.import(importPath, conflictStrategy);
  console.log(JSON.stringify(report, null, 2));
}

async function handleDashboard(
  adapter: MemoryAdapter,
  context: ResolvedProjectContext,
  parsed: ParsedArgs
): Promise<void> {
  const dateRange = parseDateRange((parsed.options.range as string) || 'all');
  const bypassCache = parsed.options['no-cache'] === true;

  if (parsed.options.web === true) {
    await displayWebDashboard(context, parsed.options.out as string | undefined);
    return;
  }

  const { createDashboardUI } = require('../memory/dashboard-ui');
  const stats = await adapter.getStatistics(dateRange, bypassCache);

  let dateRangeLabel = 'All time';
  if (dateRange?.start_date && dateRange.end_date) {
    dateRangeLabel = `${dateRange.start_date.slice(0, 10)} to ${dateRange.end_date.slice(0, 10)}`;
  }

  createDashboardUI(stats, {
    project: context.projectName,
    dateRange: dateRangeLabel,
    onRefresh: async () => adapter.getStatistics(dateRange, true),
    onQuit: () => {
      console.log('\nDashboard closed.');
    },
  });

  await new Promise(() => {});
}

async function displayWebDashboard(
  context: ResolvedProjectContext,
  outPath?: string
): Promise<void> {
  const scriptPath = path.resolve(__dirname, '../../scripts/memory-dashboard-web.py');
  const defaultOutputPath = path.join(context.dashboardsRoot, 'memory-dashboard.html');
  const outputPath = outPath
    ? assertPathWithinProject(
        context.projectRoot,
        path.isAbsolute(outPath) ? outPath : path.join(context.projectRoot, outPath),
        'dashboard output'
      )
    : defaultOutputPath;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const output = execFileSync(
    'python3',
    [
      scriptPath,
      '--root',
      context.memoryRoot,
      '--project-root',
      context.projectRoot,
      '--out',
      outputPath,
    ],
    {
      cwd: context.projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (output.trim()) {
    console.log(output.trim());
  }
  console.log(outputPath);
}

async function handleStats(
  adapter: MemoryAdapter,
  context: ResolvedProjectContext,
  parsed: ParsedArgs
): Promise<void> {
  const dateRange = parseDateRange((parsed.options.range as string) || 'all');
  const bypassCache = parsed.options['no-cache'] === true;
  const stats = await adapter.getStatistics(dateRange, bypassCache);

  if (parsed.options.json === true) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`Memory Statistics for ${context.projectName}`);
  console.log(`Date Range: ${(parsed.options.range as string) || 'all'}`);
  console.log('='.repeat(60));
  console.log(`Total Entries: ${stats.total_entries}`);
  console.log(`Active Entries: ${stats.entries_by_status.active || 0}`);
  console.log(`Average Confidence: ${stats.avg_confidence.toFixed(2)}`);
  console.log(`Low Confidence Entries: ${stats.low_confidence_count}`);
  console.log(`Stale Evidence: ${stats.stale_evidence_count}`);
  console.log(`Compaction Candidates: ${stats.compaction_candidates}`);
}

if (require.main === module) {
  void main(process.argv.slice(2));
}
