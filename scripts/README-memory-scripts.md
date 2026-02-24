# Memory Testing Scripts

Utility scripts for testing and viewing the durable memory system.

## Scripts

### generate-test-data.ts

Creates sample memory entries for testing the memory system.

**Usage:**
```bash
npx ts-node scripts/generate-test-data.ts [project-name]
```

**What it creates:**
- 4 decisions (agent-architecture, memory-storage, typescript-implementation, concurrent-writes)
- 3 observations (query-performance, evidence-validation, confidence-decay)
- 2 learnings (memory-compaction, evidence-types)
- 1 state entry (memory-schema)

**Features:**
- Realistic subjects and content
- Varied confidence levels (0.65-0.98)
- Multiple evidence types (code, doc, artifact, assumption, log)
- Different statuses (active, draft)
- Clear progress output with emojis

### view-memory-stats.ts

Displays statistics about stored memory entries.

**Usage:**
```bash
npx ts-node scripts/view-memory-stats.ts [project-name]
```

**Shows:**
- Total entry count
- Breakdown by section (decisions, state, observations, learnings)
- Breakdown by status (active, draft, superseded, deprecated)
- Breakdown by kind (decision, requirement, invariant, etc.)
- Average confidence score
- Top 5 subjects by confidence
- Evidence type distribution

## Quick Start

```bash
# Generate test data
npx ts-node scripts/generate-test-data.ts bass-agents

# View statistics
npx ts-node scripts/view-memory-stats.ts bass-agents
```

## Default Project

Both scripts default to project name "bass-agents" if not specified.
