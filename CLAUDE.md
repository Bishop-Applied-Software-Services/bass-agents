# bass-agents

Portable agent definitions and agentic workflows. Agent files live in `agents/` as `.agent` markdown files.

## Key Paths

- `agents/` — Agent definition files (.agent)
- `workflows/` — Pipeline definitions
- `schemas/` — JSON Schema contracts (AgentTask, AgentResult)
- `field-notes/` — Deployment learnings and feedback loop
- `bass-agents-spec-v0.md` — Full specification

## Field Notes

We capture deployment learnings in `field-notes/` to create a feedback loop from real usage back into agent improvements.

- **Template**: `field-notes/TEMPLATE.md`
- **Convention**: one folder per project, one file per session (`YYYY-MM-DD-<slug>.md`)
- **Skill**: use `/field-note <project> [slug]` to create an entry interactively

After significant deployments, testing sessions, or when you discover something worth recording about agent behavior, suggest creating a field note.

Field notes are the human-facing session record and an important ingestion source for durable memory, but they are not the only valid write path. Evidence-backed durable-memory updates may also be written directly through agent results, manual/admin flows, imports, validation, compaction, and other lifecycle operations.

## Token Discipline (Required)

When running agents (including Claude, Codex, bass-agents), optimize for low token usage and avoid repeated context churn.

- Scope first:
  - Work only in relevant directories/files for the current task.
  - Do not scan or summarize the entire repo unless explicitly requested.
- Read efficiency:
  - Prefer targeted searches (`rg`) and partial reads (`sed -n`) over full-file dumps.
  - Do not reread unchanged large files; reuse prior summaries.
- Output limits:
  - Keep intermediate updates short (1-3 sentences).
  - Do not print large command outputs unless needed for a decision.
  - When logs are long, provide only key lines/errors.
- Retry limits:
  - Max 2 retries for the same failing command pattern.
  - After repeated failure, stop and report blocker + next best action.
- Tool-call budgeting:
  - Avoid redundant parallel calls that fetch overlapping context.
  - Prefer one focused call over multiple broad exploratory calls.
- Prompt/context hygiene:
  - Reference file paths instead of pasting large blocks repeatedly.
  - Keep active task context minimal and task-specific.
- Stop conditions:
  - If token usage spikes without clear progress, pause and return a concise diagnostic:
    - what is consuming tokens,
    - what was tried,
    - proposed tighter plan.

## Token Spike Response Protocol

When token usage accelerates, agents must explicitly switch to this protocol.

### Trigger Conditions

If any of these happen, stop normal flow and run a checkpoint:

- More than 8 MCP/tool calls in one task phase without meaningful implementation progress.
- More than 40% of task effort spent on context gathering instead of implementation/testing.
- Same MCP endpoint queried repeatedly (2+ times) for similar data.
- Same failure/retry pattern repeated more than 2 times.

### Mandatory Checkpoint Output

Provide a short diagnostic with:

1. Primary token sink (what is expensive)
2. Why it is happening
3. Best next low-cost path (recommended)
4. One fallback path

### Optimization Decision Rules

- Repeated API-shape lookups:
  - Prefer a dedicated SDK/client wrapper over repeated raw MCP exploration.
- Repeated broad MCP reads:
  - Propose a narrower MCP scope/query contract (targeted fields/endpoints only).
- Repeated workflow across tasks:
  - Create or update a reusable Skill.
- Repeated static reference reads:
  - Create a cached summary artifact in the repo and reference it instead of rereading sources.

### Post-Task Improvement Capture

After a token-spike incident:

- Record one field note with root cause + fix.
- Add one concrete guardrail update to this file or related skill/workflow config.

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
