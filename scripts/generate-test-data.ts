#!/usr/bin/env ts-node
/**
 * Generate Test Data for Durable Memory System
 * 
 * Creates sample memory entries across all sections with realistic data.
 * Usage: npx ts-node scripts/generate-test-data.ts [project-name]
 */

import { MemoryAdapter } from '../src/memory/memory-adapter';
import { MemoryEntryInput } from '../src/memory/types';

const PROJECT = process.argv[2] || 'bass-agents';
const WORKSPACE_ROOT = process.cwd();

async function main() {
  console.log('🧪 Generating test data for durable memory system\n');
  console.log(`📁 Project: ${PROJECT}`);
  console.log(`📂 Workspace: ${WORKSPACE_ROOT}\n`);

  const adapter = new MemoryAdapter(WORKSPACE_ROOT);
  
  try {
    // Initialize project
    console.log('🔧 Initializing memory system...');
    await adapter.init(PROJECT);
    console.log('✅ Memory system initialized\n');

    const entries: MemoryEntryInput[] = [
      // Decisions
      {
        section: 'decisions',
        kind: 'decision',
        subject: 'agent-architecture',
        scope: 'repo',
        summary: 'Use markdown-based agent definitions instead of JSON',
        content: 'Agent definitions will use .agent markdown files for better readability and version control. This allows inline documentation and easier human review.',
        tags: ['architecture', 'agent-format', 'markdown'],
        confidence: 0.92,
        evidence: [
          { type: 'doc', uri: 'bass-agents-spec-v0.md', note: 'Specification defines markdown format' },
          { type: 'code', uri: 'agents/*.agent', note: 'Existing agent files use markdown' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'decisions',
        kind: 'decision',
        subject: 'memory-storage',
        scope: 'service:memory',
        summary: 'Use beads for memory persistence with JSONL format',
        content: 'Memory entries are stored using beads (issue tracker) with JSONL format for efficient append-only writes and concurrent access.',
        tags: ['storage', 'beads', 'persistence'],
        confidence: 0.88,
        evidence: [
          { type: 'code', uri: 'src/memory/memory-adapter.ts', note: 'MemoryAdapter uses beads CLI' },
          { type: 'doc', uri: 'docs/concurrent-writes.md', note: 'Documents concurrent write strategy' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'decisions',
        kind: 'decision',
        subject: 'typescript-implementation',
        scope: 'repo',
        summary: 'Implement memory system in TypeScript for type safety',
        content: 'TypeScript provides compile-time type checking and better IDE support, reducing runtime errors in memory operations.',
        tags: ['typescript', 'implementation', 'type-safety'],
        confidence: 0.85,
        evidence: [
          { type: 'code', uri: 'src/memory/types.ts', note: 'Type definitions for memory system' },
          { type: 'artifact', uri: 'tsconfig.json', note: 'TypeScript configuration' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'decisions',
        kind: 'requirement',
        subject: 'concurrent-writes',
        scope: 'service:memory',
        summary: 'Support concurrent writes without data loss',
        content: 'Multiple agents may write to memory simultaneously. Use beads append-only model with optimistic concurrency control.',
        tags: ['concurrency', 'requirements', 'safety'],
        confidence: 0.95,
        evidence: [
          { type: 'doc', uri: 'docs/concurrent-writes.md', note: 'Concurrent write strategy' },
          { type: 'code', uri: 'src/memory/memory-adapter.ts', note: 'Implements concurrent-safe operations' }
        ],
        status: 'active',
        created_by: 'test-script'
      },

      // Observations
      {
        section: 'observations',
        kind: 'metric',
        subject: 'query-performance',
        scope: 'service:memory',
        summary: 'Memory queries complete in under 100ms for typical workloads',
        content: 'Tested with 1000 entries, query operations average 45ms. Filtering by section and confidence is efficient.',
        tags: ['performance', 'metrics', 'query'],
        confidence: 0.78,
        evidence: [
          { type: 'code', uri: 'src/memory/memory-adapter.test.ts', note: 'Performance test results' },
          { type: 'assumption', uri: 'n/a', note: 'Based on local testing, not production data' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'observations',
        kind: 'incident',
        subject: 'evidence-validation',
        scope: 'service:memory',
        summary: 'Evidence URIs can become stale when files are moved',
        content: 'Observed that evidence references break when source files are refactored or moved. Need validation mechanism.',
        tags: ['evidence', 'validation', 'maintenance'],
        confidence: 0.82,
        evidence: [
          { type: 'log', uri: 'logs/evidence-errors.log', note: 'Errors from broken references' },
          { type: 'code', uri: 'src/memory/memory-adapter.ts', note: 'validateEvidence method added' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'observations',
        kind: 'hypothesis',
        subject: 'confidence-decay',
        scope: 'service:memory',
        summary: 'Memory confidence should decay over time without validation',
        content: 'Hypothesis: entries older than 90 days without updates should have reduced confidence scores to reflect potential staleness.',
        tags: ['confidence', 'freshness', 'hypothesis'],
        confidence: 0.65,
        evidence: [
          { type: 'assumption', uri: 'n/a', note: 'Proposed mechanism, not yet implemented' },
          { type: 'doc', uri: 'docs/memory-freshness.md', note: 'Design discussion' }
        ],
        status: 'draft',
        created_by: 'test-script'
      },

      // Learnings
      {
        section: 'learnings',
        kind: 'runbook_step',
        subject: 'memory-compaction',
        scope: 'service:memory',
        summary: 'Run compaction weekly to remove superseded entries',
        content: 'Compaction removes superseded entries from active memory, improving query performance. Run with --dry-run first to preview changes.',
        tags: ['operations', 'maintenance', 'compaction'],
        confidence: 0.90,
        evidence: [
          { type: 'code', uri: 'src/memory/memory-adapter.ts', note: 'compact() method implementation' },
          { type: 'doc', uri: 'docs/memory-maintenance.md', note: 'Maintenance procedures' }
        ],
        status: 'active',
        created_by: 'test-script'
      },
      {
        section: 'learnings',
        kind: 'other',
        subject: 'evidence-types',
        scope: 'service:memory',
        summary: 'Use specific evidence types for better traceability',
        content: 'Learned that using specific evidence types (code, doc, artifact) instead of generic references improves memory quality and validation.',
        tags: ['evidence', 'best-practices', 'quality'],
        confidence: 0.87,
        evidence: [
          { type: 'code', uri: 'src/memory/types.ts', note: 'EvidenceReference type definition' },
          { type: 'doc', uri: 'bass-agents-spec-v0.md', note: 'Evidence type guidelines' }
        ],
        status: 'active',
        created_by: 'test-script'
      },

      // State
      {
        section: 'state',
        kind: 'invariant',
        subject: 'memory-schema',
        scope: 'repo',
        summary: 'All memory entries must have valid section and kind fields',
        content: 'Schema invariant: section must be one of [decisions, state, observations, learnings]. Kind must match allowed values for the section.',
        tags: ['schema', 'validation', 'invariant'],
        confidence: 0.98,
        evidence: [
          { type: 'code', uri: 'src/memory/types.ts', note: 'Type definitions enforce schema' },
          { type: 'code', uri: 'schemas/memory-entry.schema.json', note: 'JSON schema validation' }
        ],
        status: 'active',
        created_by: 'test-script'
      }
    ];

    console.log('📝 Creating memory entries...\n');
    
    let successCount = 0;
    let errorCount = 0;
    const sectionCounts: Record<string, number> = {};

    for (const entry of entries) {
      try {
        const id = await adapter.create(PROJECT, entry);
        successCount++;
        sectionCounts[entry.section] = (sectionCounts[entry.section] || 0) + 1;
        console.log(`  ✅ Created ${entry.section}/${entry.kind}: ${entry.subject} (${id.substring(0, 8)}...)`);
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Failed to create ${entry.subject}: ${error}`);
      }
    }

    console.log('\n📊 Summary Statistics:');
    console.log(`  Total entries created: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log('\n  By section:');
    for (const [section, count] of Object.entries(sectionCounts)) {
      console.log(`    ${section}: ${count}`);
    }

    console.log('\n✨ Test data generation complete!');
    console.log(`\n💡 View stats with: npx ts-node scripts/view-memory-stats.ts ${PROJECT}`);

  } catch (error) {
    console.error('\n❌ Error generating test data:', error);
    process.exit(1);
  }
}

main();
