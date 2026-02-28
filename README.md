# bass-agents

Portable agent definitions and agentic workflows for building great software systems.

Agent definitions live in `~/.agents/` as plain `.agent` files (markdown) so they work across tools, projects, and models. This repo is the source of truth — install once, and edits here are reflected everywhere via symlinks.

## Directory Structure

```
bass-agents/
  agents/                    # Agent definition files (.agent)
    metaagent.agent          # Agent factory & orchestrator
    pm.agent                 # Product Manager
    gameplay-expert.agent    # Gameplay & mechanics designer
    designer.agent           # UI/UX & visual design
    qa-adversary.agent       # Test planning & edge cases
    coding-agent.agent       # Implementation & vertical slices
    evaluator.agent          # Build evaluation & scoring
  workflows/                 # Pipeline definitions
    default-pipeline.md
  schemas/                   # JSON Schema contracts
    agent-task.schema.json
    agent-result.schema.json
  field-notes/               # Deployment learnings & feedback loop
    TEMPLATE.md              # Recommended structure for entries
    <project-name>/          # One folder per project
      YYYY-MM-DD-<slug>.md   # One file per session/learning
  bin/
    bass-agents              # Main CLI entrypoint
    bassai                   # Short alias for bass-agents
  install.sh                 # Legacy installer (calls "bass-agents install")
  bass-agents-spec-v0.md     # Full specification
```

## Quick Start

```bash
# Clone the repo
git clone <repo-url> && cd bass-agents

# Install dependencies
npm install

# Install Beads CLI (required for durable memory system)
npm install -g @beads/bd
# OR: brew install beads
# OR: go install github.com/steveyegge/beads/cmd/bd@latest

# First-time setup (links CLI + agents, installs agtrace/ccusage, initializes .agtrace)
./bin/bass-agents init

# Verify
which bass-agents
which bassai
which bd
ls -la ~/.agents/
```

To use an agent, point your tool (Claude Code, Cursor, etc.) at the `.agent` file as a system prompt or context document.

## Agent File Format

Each `.agent` file is a self-contained markdown document with a standard structure:

1. **Core Definition** — domain, model affinity, primary objective
2. **Role Expectations** — what the agent must do, pass/fail criteria
3. **Output Contract** — references to the handoff schemas
4. **Tool Registry** — what tools the agent is allowed to use
5. **System Prompt** — copy/paste-ready prompt text
6. **Audit Log** — versioned history of improvements
7. **Metadata & Tags** — for discovery and filtering

## Handoff Contracts

All agents share a universal I/O contract:

- **AgentTask** (input) — `task_id`, `project`, `goal`, `definition_of_done`, plus optional `context`, `limits`, `memory_enabled`, and `memory_context`. See [`schemas/agent-task.schema.json`](schemas/agent-task.schema.json).
- **AgentResult** (output) — `task_id`, `status`, `summary`, `findings`, plus optional `next_actions`, `artifacts_produced`, and `memory_updates`. See [`schemas/agent-result.schema.json`](schemas/agent-result.schema.json).

This contract enables agents to hand off work to each other without custom integration.

## Shared Rules

Every agent spawned by MetaAgent must follow these constraints:

- **Ground truth**: tag claims with `evidence` type and `confidence` (0.0–1.0)
- **Small changes**: coding agents cap diffs at 300 lines per iteration
- **Deterministic output**: use fixed schemas and stable sorting
- **Safety**: no secrets in logs; flag OWASP-style issues as findings

## Field Notes

The `field-notes/` directory captures deployment learnings — what worked, what broke, and which agents need tuning. This creates a feedback loop from real project usage back into agent improvements.

**Convention:**
- One folder per project (e.g. `field-notes/acme-app/`)
- One file per session or learning (e.g. `2026-02-15-initial-pipeline-run.md`)
- Use [`field-notes/TEMPLATE.md`](field-notes/TEMPLATE.md) as a starting point for each entry

Field notes are the human-facing session record and an important durable-memory ingestion source. Durable memory can also be updated directly through other valid, evidence-backed flows such as `AgentResult.memory_updates`, imports, validation, compaction, and manual/admin maintenance.

## Session Review (MVP)

`bass-agents` uses existing CLI tooling to analyze token usage drivers and recommend efficiency improvements.

- MVP definition: [`docs/prds/2026-02-21-SESSION-REVIEW-MVP.md`](docs/prds/2026-02-21-SESSION-REVIEW-MVP.md)
- Report contract: [`schemas/session-review-report.schema.json`](schemas/session-review-report.schema.json)
- Analyzer/normalizer script: `scripts/review-session.py`
- Wrapper script: `scripts/run-with-bass-agents.sh`
- Upstream tools: `agtrace` + `ccusage`

First-time setup:

```bash
./bin/bass-agents init
```

Example:

```bash
bass-agents review --path . --source codex --format markdown
bass-agents review --path . --source claude --format json --out ./session-review.json
bass-agents review --path . --source codex --session-id <agtrace-session-id> --format markdown
bass-agents review --path . --source claude --max-tokens 20000 --max-cost-usd 5 --timebox-minutes 60 --elapsed-minutes 52
```

Wrapper flow (launch tool, then auto-review on exit):

```bash
bass-agents run --tool codex --project bass.ai --session-id <agtrace-session-id> --format markdown -- --model gpt-5
bass-agents run --tool claude --project bass.ai --session-id <session-id> --max-tokens 20000 --timebox-minutes 60 -- --model sonnet
```

Checkpoint flow (generate JSON report + append trend row):

```bash
bass-agents checkpoint --source codex --project bass.ai --session-id <agtrace-session-id>
bass-agents checkpoint --source claude --project bass.ai --session-id <session-id> --max-tokens 20000 --timebox-minutes 60
```

Dashboard flow (session review):

```bash
bass-agents dashboard                 # web dashboard (HTML)
bass-agents dashboard --tui           # terminal dashboard (TUI)
# optional web output path:
bass-agents dashboard --root session-reviews --out session-reviews/dashboard.html
```

Notes:

- If `--session-path` is omitted, wrapper uses an internal path hint and relies on `review-session.py` tool-integrated session resolution.
- If `--session-id` is provided, wrapper passes it through so analysis targets that exact provider session.
- If `--session-id` is omitted, wrapper/checkpoint generates a `session reference id` and logs it for downstream filenames/tracking.
- Reports now include `session_reference_id`, and checkpoint trends persist it in `trend.csv`.
- Override search roots with `BASS_AGENTS_SESSION_DIRS` (colon-separated paths).
- If `--report-out` is omitted, wrapper writes to `session-reviews/<project>/YYYY-MM-DD-<tool>-session-review-HHMMSS.{md|json}`.
- If `--session-id` is provided, default report filename appends the id: `...-session-review-HHMMSS-<session-id>.{md|json}`.
- Project name resolution order for default output: `--project`, then `BASS_AGENTS_PROJECT`, then current directory name.
- Store generated review reports under `session-reviews/<project>/` (for example: `session-reviews/bass.ai/2026-02-22-claude-session-review-112115.md`).
- Keep `.agtrace/` local-only (gitignored) so provider paths remain machine-specific and portable across contributors.
- Dashboard output defaults to `session-reviews/dashboard.html` and can be opened directly in a browser.

Memory dashboard flow:

```bash
bass-agents memory dashboard bass-agents          # TUI (default)
bass-agents memory dashboard bass-agents --web    # web HTML output (Beads tickets + durable memory)
bass-agents memory dashboard --all --web --out ai-memory/dashboard.html
```

Notes:

- `bass-agents memory dashboard --web` now renders a workspace view that combines the repo's top-level Beads tickets with durable-memory entries from `ai-memory/`.
- TUI mode remains focused on durable-memory analytics.

Unified flow (both session + memory from one command):

```bash
bass-agents dashboards                                      # build both web dashboards
bass-agents dashboards --web --project bass-agents          # web dashboards; memory scoped to one project
bass-agents dashboards --tui --session                     # session-review TUI
bass-agents dashboards --tui --memory --project bass-agents # memory TUI
```

## Benchmarks

To measure whether `bass-agents` improves outcomes versus baseline tool usage:

- Basic benchmark spec: [`benchmarks/basic-todo-app/README.md`](benchmarks/basic-todo-app/README.md)
- Scoring rubric: [`benchmarks/basic-todo-app/scoring-rubric.md`](benchmarks/basic-todo-app/scoring-rubric.md)
- Fixed task fixture: [`fixtures/tasks/basic-todo-app-task.json`](fixtures/tasks/basic-todo-app-task.json)

## Durable Memory System

The durable memory system provides persistent knowledge storage for agents using Beads as the storage layer.

Field notes and durable memory serve different roles:

- Field notes capture session-level narrative for humans.
- Durable memory stores structured, queryable knowledge for agents.
- Field notes are an important memory ingestion source, but a new field note is not required for every valid memory update.

### Requirements

- **Node.js**: v20.10.6 or later
- **TypeScript**: v5.3.3 or later
- **Beads CLI**: Required for memory persistence ([installation instructions](https://github.com/steveyegge/beads))

### Installation

```bash
# Install Node.js dependencies
npm install

# Install Beads CLI (choose one method)
npm install -g @beads/bd        # via npm
brew install beads              # via Homebrew (macOS/Linux)
go install github.com/steveyegge/beads/cmd/bd@latest  # via Go

# Verify installation
bd --version
```

### Usage

```bash
# Generate test data
npx ts-node scripts/generate-test-data.ts bass-agents

# View memory statistics
npx ts-node scripts/view-memory-stats.ts bass-agents

# Run tests
npm test
```

### Documentation

- [Durable Memory PRD](docs/prds/2026-02-22-DURABLE-MEMORY.md)
- [Concurrent Writes](docs/concurrent-writes.md)
- [Memory Dashboard](docs/memory-dashboard.md)
- [Specification](.kiro/specs/durable-memory/)

## Creating a New Agent

1. Copy an existing `.agent` file as a template
2. Fill in all sections (Core Definition through Metadata)
3. Ensure the agent accepts `AgentTask` and produces `AgentResult`
4. Add it to `agents/` and re-run `bass-agents install`

See the [full spec](bass-agents-spec-v0.md) for detailed requirements.
