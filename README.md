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

# First-time setup (links CLI + agents, installs agtrace/ccusage, initializes .agtrace)
./bin/bass-agents init

# Verify
which bass-agents
which bassai
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

- **AgentTask** (input) — `task_id`, `project`, `goal`, `definition_of_done`, plus optional `context` and `limits`. See [`schemas/agent-task.schema.json`](schemas/agent-task.schema.json).
- **AgentResult** (output) — `task_id`, `status`, `summary`, `findings`, plus optional `next_actions` and `artifacts_produced`. See [`schemas/agent-result.schema.json`](schemas/agent-result.schema.json).

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
bass-agents run --tool claude --smoke-test --run-type smoke --project bass.ai --format markdown -- exec "Reply with exactly: ok"
```

Checkpoint flow (generate JSON report + append trend row):

```bash
bass-agents checkpoint --source codex --project bass.ai --session-id <agtrace-session-id>
bass-agents checkpoint --source claude --project bass.ai --session-id <session-id> --max-tokens 20000 --timebox-minutes 60
bass-agents checkpoint --source codex --run-type workflow --project bass.ai --session-id <agtrace-session-id>
bass-agents checkpoint --source codex --run-type workflow --project bass.ai --session-id <agtrace-session-id> --enforce-verdict
```

Notes:

- If `--session-path` is omitted, wrapper uses an internal path hint and relies on `review-session.py` tool-integrated session resolution.
- If `--session-id` is provided, wrapper passes it through so analysis targets that exact provider session.
- If `--session-id` is omitted, wrapper/checkpoint generates a `session reference id` and logs it for downstream filenames/tracking.
- Reports now include `session_reference_id`, `run_type`, and evaluation verdict (`pass|warn|fail`).
- Wrapper and checkpoint both persist trend rows in `session-reviews/<project>/trend.csv` with `run_type`, `uncached_tokens`, and verdict.
- Reports include baseline deltas vs the last 5 similar runs (`project + source + run_type`).
- CI gate policy: `scripts/ci-verdict-gate.py` fails on `workflow`/`real` reports with verdict `fail`; `smoke` is non-blocking.
- Override search roots with `BASS_AGENTS_SESSION_DIRS` (colon-separated paths).
- If `--report-out` is omitted, wrapper writes to `session-reviews/<project>/YYYY-MM-DD-<tool>-session-review-HHMMSS.{md|json}`.
- If `--session-id` is provided, default report filename appends the id: `...-session-review-HHMMSS-<session-id>.{md|json}`.
- Project name resolution order for default output: `--project`, then `BASS_AGENTS_PROJECT`, then current directory name.
- Store generated review reports under `session-reviews/<project>/` (for example: `session-reviews/bass.ai/2026-02-22-claude-session-review-112115.md`).
- Keep `.agtrace/` local-only (gitignored) so provider paths remain machine-specific and portable across contributors.

CI helper examples:

```bash
# Gate an existing JSON report
python3 scripts/ci-verdict-gate.py --report ./session-reviews/bass.ai/latest.json

# Generate + gate in one step
scripts/session-review-checkpoint.sh --source codex --run-type workflow --project bass.ai --session-id <id> --enforce-verdict
```

## Benchmarks

To measure whether `bass-agents` improves outcomes versus baseline tool usage:

- Basic benchmark spec: [`benchmarks/basic-todo-app/README.md`](benchmarks/basic-todo-app/README.md)
- Scoring rubric: [`benchmarks/basic-todo-app/scoring-rubric.md`](benchmarks/basic-todo-app/scoring-rubric.md)
- Fixed task fixture: [`fixtures/tasks/basic-todo-app-task.json`](fixtures/tasks/basic-todo-app-task.json)

## Creating a New Agent

1. Copy an existing `.agent` file as a template
2. Fill in all sections (Core Definition through Metadata)
3. Ensure the agent accepts `AgentTask` and produces `AgentResult`
4. Add it to `agents/` and re-run `bass-agents install`

See the [full spec](bass-agents-spec-v0.md) for detailed requirements.
