# Project-Local Memory, Init, and Dashboard Isolation

## Goal

Refactor `bass-agents` so that running `bass-agents init` inside a project sets up bass-agents state for that project only. Durable memory, dashboards, session reviews, and agtrace data must remain inside the initialized project directory and must not aggregate or read sibling project data by default.

This work is tracked under `bass-agents-kxk`.

## Blocking Prerequisite

`bass-agents-ela` must be completed before implementation proceeds. The current durable-memory write fallback does not reliably recover from Dolt-unavailable environments, and this feature depends on stable local durable-memory initialization and writes.

## Design Principles

- `ai-memory/` remains the durable-memory directory name, but it becomes project-local.
- The current project root is the isolation boundary.
- The core library must operate on injected local roots and feature flags, not on logical project names.
- `bass-agents init` sets up local project state; it does not become a general-purpose global tool installer.
- Dashboards launched in a project default to that project only.
- Cross-project aggregation is out of scope for the default UX.

## Target Filesystem Layout

If `bass-agents init` runs in `/path/to/project`, the resulting layout is:

```text
/path/to/project/
  ai-memory/
    .beads/
  session-reviews/
  .agtrace/
  .bass-agents/
    config.json
```

Notes:

- Durable memory lives directly in `ai-memory/.beads/`.
- Do not nest memory under `ai-memory/<project>/`.
- `ai-context/` stays optional and is created only when `sync-context` is used.
- All bass-agents-managed paths must resolve inside the project root.

## Config Contract

Store local configuration in `.bass-agents/config.json`.

```json
{
  "version": 1,
  "durable_memory": {
    "enabled": true,
    "root": "ai-memory"
  },
  "session_reviews": {
    "root": "session-reviews"
  },
  "agtrace": {
    "root": ".agtrace"
  },
  "dashboards": {
    "root": ".bass-agents/dashboards"
  },
  "ai_context": {
    "root": "ai-context"
  }
}
```

Rules:

- All configured roots are relative to the project root.
- Path resolution must reject `..`, absolute escapes, and symlink escapes outside the project root.
- Missing config should be treated as “not initialized”.

## CLI Changes

### `bass-agents init`

`bass-agents init` becomes the entry point for local project setup.

Behavior:

1. Resolve project root from `--project <path>` or `cwd`.
2. Prompt: `Enable durable memory for this project? [y/N]`
3. If enabled:
   - create `.bass-agents/`
   - write local config
   - create `ai-memory/`
   - initialize Beads in `ai-memory/`
4. If disabled:
   - create `.bass-agents/`
   - write local config with `durable_memory.enabled=false`
   - do not create `ai-memory/`
5. Keep `.agtrace/` local when agtrace setup is requested.

Add non-interactive flags:

- `--durable-memory`
- `--no-durable-memory`
- `--project <path>`

Rules:

- Passing both durable-memory flags is an error.
- If neither durable-memory flag is passed, prompt interactively.
- `init` should not attempt to install Beads, Dolt, agtrace, ccusage, or other host tools by default.

### Memory CLI

Move from logical project arguments to current-project defaults.

Target shape:

```bash
bass-agents memory list
bass-agents memory show <entry-id>
bass-agents memory query "authentication"
bass-agents memory compact
bass-agents memory validate-evidence
bass-agents memory check-freshness
bass-agents memory sync-context
bass-agents memory export <output-path>
bass-agents memory import <input-path>
bass-agents memory dashboard
bass-agents memory stats
```

Rules:

- Commands resolve local roots from project config.
- Normal usage should not require `<project>` positional arguments.
- If durable memory is disabled or uninitialized, commands should fail with local setup guidance.

### Dashboard CLI

`bass-agents dashboards` and `bass-agents memory dashboard` must scope to local project data only.

Rules:

- Session dashboards read only local `session-reviews/`.
- Memory dashboards read only local `ai-memory/`.
- If ticket data is shown, it should come only from the current project’s own tracker.
- Remove shared-workspace aggregation behavior from normal project usage.
- Remove or avoid `--all` semantics that cross project boundaries in this local mode.

## Core Architecture

Introduce a `ProjectContext` abstraction and make all relevant code consume it.

```ts
interface ProjectContext {
  projectRoot: string;
  memoryRoot: string;
  sessionReviewRoot: string;
  agtraceRoot: string;
  dashboardsRoot: string;
  aiContextRoot: string;
  durableMemoryEnabled: boolean;
}
```

Responsibilities:

- CLI resolves `ProjectContext`.
- Library code consumes `ProjectContext` or direct local roots.
- Library code must not derive shared-workspace paths from `process.cwd()` plus a logical project name.

## MemoryAdapter Refactor

The current adapter assumes `workspaceRoot/ai-memory/<project>`. That must be flattened to a local-root API.

Target API direction:

- from `init(project)`
- to `init()`

- from `query(project, filters)`
- to `query(filters)`

- from `create(project, entry)`
- to `create(entry)`

Apply the same pattern to:

- `get`
- `getRelated`
- `compact`
- `validateEvidence`
- `checkFreshness`
- `export`
- `import`
- `syncContext`
- `getStatistics`
- query logging
- statistics cache

All of them should operate against the resolved local `memoryRoot`.

## Universal Durable-Memory Hooks

Keep write hooks narrow and generic.

Approved write hooks:

- `AgentResult.memory_updates`
- session-review completion
- explicit field-note ingestion
- manual memory CLI commands
- import, compaction, validation, and sync-context flows

Do not auto-write durable memory from:

- dashboard launches
- arbitrary repo scans
- generic ticket churn
- background file watching

## Implementation Breakdown

Parent issue: `bass-agents-kxk`

Subtasks:

1. `bass-agents-kxk.2` Add `ProjectContext` and project-local bass-agents config resolution
2. `bass-agents-kxk.3` Refactor durable-memory storage APIs to use local `ai-memory` root
3. `bass-agents-kxk.4` Update `init` flow for durable-memory opt-in and local setup
4. `bass-agents-kxk.5` Simplify memory CLI and integrations to current-project defaults
5. `bass-agents-kxk.1` Scope dashboards to local project data only
6. `bass-agents-kxk.6` Add isolation tests, docs, and bass-agents one-time data flatten

All implementation work is blocked by `bass-agents-ela`.

## Recommended Implementation Order

1. Complete `bass-agents-ela`.
2. Add `ProjectContext` and local config resolution.
3. Refactor `MemoryAdapter` and related memory services to local roots.
4. Update `bass-agents init`.
5. Simplify memory CLI and integrations to current-project defaults.
6. Refactor dashboard flows to local-only scope.
7. Update tests, docs, and flatten the `bass-agents` repo’s own existing memory layout.

## One-Time Repo Data Move

Do not build a general migration feature into the framework.

Only this repo currently uses the existing nested durable-memory layout, so handle it as a one-time repo-local change:

- flatten `ai-memory/bass-agents/` into `ai-memory/`
- update fixtures, docs, and tests accordingly
- do not ship dual-read compatibility logic

## Acceptance Criteria

- Running `bass-agents init` in project A creates only project A local roots.
- Running `bass-agents init` in project B creates only project B local roots.
- Project A memory commands cannot read or write project B durable memory.
- Dashboard commands in project A do not aggregate project B data.
- No public durable-memory API requires a logical project name for normal project-local use.
- All resolved bass-agents paths stay within the current project root.
- The `bass-agents` repo itself is updated to the flattened `ai-memory/` layout without adding framework migration complexity.

## Risks

- Existing code assumes shared-workspace path derivation in multiple places.
- Dashboard behavior currently depends on explicit aggregation semantics.
- Query logs and statistics cache also encode the old path model and must be updated together.
- `bass-agents-ela` must land first or local initialization and writes will remain unreliable in Dolt-unavailable environments.

## Next Session Start Point

Start with `bass-agents-ela`. After that lands, begin implementation with `bass-agents-kxk.2` and `bass-agents-kxk.3` because those define the runtime boundary for all later CLI and dashboard changes.
