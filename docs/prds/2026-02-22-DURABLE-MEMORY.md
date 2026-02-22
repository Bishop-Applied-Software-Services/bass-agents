# Durable Memory for bass-agents

## Goal

Enable a production-grade durable memory solution for evolving context over time. The system uses Beads (https://github.com/steveyegge/beads) as the storage layer, providing workspace-relative persistent knowledge storage with four memory sections (decisions, state, observations, learnings), rich metadata, smart retrieval, and lifecycle management.

**Key Principle**: ai-context/ provides minimum stable knowledge included in every agent run. ai-memory/ provides durable-but-evolving knowledge accessed only when needed.

## Status

✅ **Spec Complete** - Ready for implementation

- Requirements: 23 requirements with testable acceptance criteria
- Design: Comprehensive technical design with Beads integration  
- Tasks: 31 implementation tasks with 51 correctness properties
- Location: `.kiro/specs/durable-memory/`

## Primary User Stories

1. **As a developer**, I want clear guidance on when to use memory vs context, so that I can organize agent knowledge effectively.

2. **As an agent**, I want to query memory for relevant knowledge, so that I can make informed decisions based on past learnings.

3. **As an agent**, I want to add and update memory entries, so that I can record decisions and learnings for future runs.

4. **As a developer**, I want CLI commands to inspect and manage memory, so that I can understand and control what agents remember.

5. **As a developer**, I want memory to evolve and stay compact, so that it remains useful without growing unbounded.

6. **As an agent orchestrator**, I want to optionally include relevant memory in AgentTask, so that agents receive necessary context without manual intervention.

## MVP Scope

### Core Features

**Memory Storage**:
- Four sections: decisions, state, observations, learnings
- Rich metadata: confidence (0.0-1.0), evidence (code/artifact/log/ticket/doc), scope (repo/service/org/customer/environment), subject (canonical entity key), kind (decision/requirement/invariant/incident/metric/hypothesis/runbook_step)
- Lifecycle states: active, superseded, deprecated, draft
- Workspace-relative storage at ai-memory/{project-name}/

**Smart Retrieval**:
- Default filters: status=active, confidence≥0.6
- Composite ranking: confidence (50%) + evidence quality (30%) + recency (10%) + scope match (10%)
- Scope hierarchy: service queries include repo and org scopes
- Freshness controls: auto-exclude expired state entries, down-rank near-expiry
- Result limit: 50 entries max, summary-only mode for token efficiency

**Analytics Dashboard**:
- Terminal-based UI using blessed/rich
- Auto-refresh every 30 seconds
- Color coding: green (healthy), yellow (warning), red (critical)
- Multiple visualizations: line charts (trends), pie charts (distribution), bar charts (comparisons), tables (details)
- Statistics API with 5-minute caching
- Query logging for pattern analysis
- Keyboard shortcuts for navigation and filtering

**CLI Commands**:
```bash
bass-agents memory init <project>                    # Initialize memory storage
bass-agents memory list [project] [filters]          # List memory entries
bass-agents memory show <entry-id>                   # Show full entry details
bass-agents memory query <text> [filters]            # Search memory content
bass-agents memory compact [project] [--dry-run]     # Consolidate old entries
bass-agents memory validate-evidence [project]       # Check evidence URIs
bass-agents memory check-freshness [project]         # List entries approaching expiry
bass-agents memory sync-context <project>            # Generate ai-context/ summaries
bass-agents memory export <project> <path> [filters] # Export to JSON
bass-agents memory import <project> <path> [strategy] # Import from JSON
bass-agents memory dashboard [project]               # Launch interactive analytics dashboard
bass-agents memory stats [project]                   # Show statistics (programmatic)
```

**AgentTask/AgentResult Integration**:
- AgentTask.memory_enabled (boolean): Enable memory context population
- AgentTask.memory_context (array): Up to 10 relevant Memory_Entry objects
- AgentResult.memory_updates (array): Memory_Update operations to apply

**Validation & Security**:
- Schema validation: required fields, constraints, enums
- Secret detection: API keys, tokens, passwords, private keys, connection strings
- Evidence validation: type-specific URI patterns, reachability checks
- Write policy: evidence requirements for decisions/requirements/invariants

**Lifecycle Management**:
- Compaction: consolidate superseded entries (preserves history in git)
- Freshness checking: warn on entries approaching expiry
- Evidence validation: detect stale URIs, down-rank affected entries

## Out of Scope (MVP)

- Semantic search / embeddings (use text search initially)
- Multi-user access control (single-user/single-team initially)
- Automatic memory consolidation (manual trigger only)
- Memory replication across repositories (single repo only)
- Advanced conflict resolution strategies (last-write-wins only)

## Proposed CLI Surface (MVP)

See "CLI Commands" section above.

## Output Contract

- Memory_Entry JSON: Conforms to schema in [requirements.md](.kiro/specs/durable-memory/requirements.md)
- Memory_Update JSON: Operations (create/supersede/deprecate)
- AgentTask Extension: memory_enabled, memory_context (max 10)
- AgentResult Extension: memory_updates array

## Acceptance Criteria

✅ 23 requirements with testable acceptance criteria ([requirements.md](.kiro/specs/durable-memory/requirements.md))

✅ 51 correctness properties for property-based testing ([design.md](.kiro/specs/durable-memory/design.md))

✅ Complete schema contracts defined

✅ Beads integration leverages native capabilities

✅ Smart retrieval and write policies defined

## Implementation Plan

31 tasks in [tasks.md](.kiro/specs/durable-memory/tasks.md) organized in 10 phases with checkpoints at tasks 6, 12, 19, 24, 31.

**Phases**:
1. Foundation (Tasks 1-6): Schema extensions, Beads wrapper, validation, secret detection, evidence validation
2. Core Operations (Tasks 7-9): Memory Adapter (create/supersede/deprecate/query), lifecycle management
3. Export/Import (Tasks 10-11): Export/import operations, context sync
4. CLI (Task 13): 11 CLI commands with argument parsing and output formatting
5. Integration (Tasks 14-15): AgentTask/AgentResult integration, graceful degradation
6. Robustness (Tasks 16-18): Concurrent writes, workspace boundaries, error handling
7. Optimization (Task 20): Performance monitoring and indexing
8. Documentation (Task 21): User guide, API docs, integration examples
9. Testing (Tasks 1-24): 46 property-based tests + unit tests + integration tests
10. Analytics (Tasks 25-31): Statistics API, caching, dashboard CLI command, visualizations, stats command, documentation, integration testing

## Success Metrics

**Adoption**:
- Number of projects using memory (target: 5+ within first month)
- Memory-enabled AgentTask percentage (target: 30%+ of agent runs)

**Quality**:
- Average confidence score of active entries (target: ≥0.7)
- Percentage of entries with code/artifact evidence (target: ≥60%)

**Performance**:
- Query execution time for 100 entries (target: <100ms)
- Query execution time for 1000 entries (target: <500ms)

## References

- **Requirements**: [.kiro/specs/durable-memory/requirements.md](.kiro/specs/durable-memory/requirements.md) (23 requirements)
- **Design**: [.kiro/specs/durable-memory/design.md](.kiro/specs/durable-memory/design.md) (51 correctness properties)
- **Tasks**: [.kiro/specs/durable-memory/tasks.md](.kiro/specs/durable-memory/tasks.md) (31 implementation tasks)
- **Beads**: https://github.com/steveyegge/beads
