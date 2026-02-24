#!/usr/bin/env ts-node
/**
 * View Memory Statistics
 * 
 * Displays statistics and insights about stored memory entries.
 * Usage: npx ts-node scripts/view-memory-stats.ts [project-name]
 */

import { MemoryAdapter } from '../src/memory/memory-adapter';
import { MemoryEntry } from '../src/memory/types';

const PROJECT = process.argv[2] || 'bass-agents';
const WORKSPACE_ROOT = process.cwd();

interface Stats {
  total: number;
  bySection: Record<string, number>;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byEvidenceType: Record<string, number>;
  avgConfidence: number;
  topSubjects: Array<{ subject: string; confidence: number; section: string }>;
}

function calculateStats(entries: MemoryEntry[]): Stats {
  const stats: Stats = {
    total: entries.length,
    bySection: {},
    byStatus: {},
    byKind: {},
    byEvidenceType: {},
    avgConfidence: 0,
    topSubjects: []
  };

  if (entries.length === 0) {
    return stats;
  }

  let totalConfidence = 0;

  for (const entry of entries) {
    // Count by section
    stats.bySection[entry.section] = (stats.bySection[entry.section] || 0) + 1;
    
    // Count by status
    stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;
    
    // Count by kind
    stats.byKind[entry.kind] = (stats.byKind[entry.kind] || 0) + 1;
    
    // Count evidence types
    for (const evidence of entry.evidence) {
      stats.byEvidenceType[evidence.type] = (stats.byEvidenceType[evidence.type] || 0) + 1;
    }
    
    // Sum confidence
    totalConfidence += entry.confidence;
  }

  // Calculate average confidence
  stats.avgConfidence = totalConfidence / entries.length;

  // Get top 5 subjects by confidence
  stats.topSubjects = entries
    .map(e => ({ subject: e.subject, confidence: e.confidence, section: e.section }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return stats;
}

function formatPercentage(value: number, total: number): string {
  const pct = ((value / total) * 100).toFixed(1);
  return `${value} (${pct}%)`;
}

function displayStats(stats: Stats) {
  console.log('\n📊 Memory Statistics\n');
  console.log('═'.repeat(60));
  
  // Total
  console.log(`\n📈 Total Entries: ${stats.total}`);
  
  if (stats.total === 0) {
    console.log('\n💡 No entries found. Run generate-test-data.ts to create sample data.');
    return;
  }

  // By Section
  console.log('\n📂 By Section:');
  const sections = ['decisions', 'state', 'observations', 'learnings'];
  for (const section of sections) {
    const count = stats.bySection[section] || 0;
    console.log(`  ${section.padEnd(15)} ${formatPercentage(count, stats.total)}`);
  }

  // By Status
  console.log('\n🏷️  By Status:');
  for (const [status, count] of Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(15)} ${formatPercentage(count, stats.total)}`);
  }

  // By Kind
  console.log('\n🔖 By Kind:');
  for (const [kind, count] of Object.entries(stats.byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(15)} ${formatPercentage(count, stats.total)}`);
  }

  // Average Confidence
  console.log(`\n🎯 Average Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`);

  // Top Subjects
  console.log('\n⭐ Top 5 Subjects by Confidence:');
  for (let i = 0; i < stats.topSubjects.length; i++) {
    const { subject, confidence, section } = stats.topSubjects[i];
    console.log(`  ${i + 1}. ${subject.padEnd(30)} ${(confidence * 100).toFixed(1)}% [${section}]`);
  }

  // Evidence Types
  console.log('\n📎 Evidence Type Distribution:');
  const totalEvidence = Object.values(stats.byEvidenceType).reduce((sum, count) => sum + count, 0);
  for (const [type, count] of Object.entries(stats.byEvidenceType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(15)} ${formatPercentage(count, totalEvidence)}`);
  }

  console.log('\n' + '═'.repeat(60));
}

async function main() {
  console.log('🔍 Viewing memory statistics\n');
  console.log(`📁 Project: ${PROJECT}`);
  console.log(`📂 Workspace: ${WORKSPACE_ROOT}`);

  const adapter = new MemoryAdapter(WORKSPACE_ROOT);

  try {
    // Query all entries
    console.log('\n⏳ Loading memory entries...');
    const entries = await adapter.query(PROJECT, {});
    
    // Calculate and display stats
    const stats = calculateStats(entries);
    displayStats(stats);

    console.log('\n✨ Stats display complete!');

  } catch (error) {
    console.error('\n❌ Error loading memory stats:', error);
    console.log('\n💡 Make sure the project has been initialized.');
    console.log(`   Run: npx ts-node scripts/generate-test-data.ts ${PROJECT}`);
    process.exit(1);
  }
}

main();
