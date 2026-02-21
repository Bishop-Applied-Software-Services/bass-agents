# Basic Todo App Benchmark

## Purpose

Provide a repeatable baseline use case to compare:

- Plain assistant usage (no bass-agents workflow)
- bass-agents guided workflow

This benchmark is intentionally small but realistic: a single-session build + verify task with fixed acceptance criteria.

## Benchmark Task

Use:

- `fixtures/tasks/basic-todo-app-task.json`

The task asks for a small web app (single-page todo app) with deterministic requirements.

## Run Modes

1. Baseline mode
- Use Claude CLI or Codex CLI directly.
- Do not provide bass-agents workflow instructions.

2. bass-agents mode
- Run with bass-agents instructions enabled (`CLAUDE.md` / `AGENTS.md`).
- Require structured `AgentResult` style handoffs where applicable.

## Required Capture Per Run

- Model/tool used (e.g., Claude CLI, Codex CLI)
- Start/end timestamps
- Total token usage (input/output/total, if available)
- Tool call count
- Iteration count (how many major revise loops)
- Final artifact locations (code, tests, notes)
- Pass/fail by acceptance criterion
- Reviewer-noted defects (count + severity)

## Scoring

Use:

- `benchmarks/basic-todo-app/scoring-rubric.md`

Compute:

- Quality score
- Efficiency score
- Reliability score
- Composite score
- Optional helper: `scripts/score-basic-todo-run.sh`

## Output Convention

Store each run under:

- `fixtures/results/basic-todo-app/<YYYY-MM-DD>-<tool>-<mode>.md`

Where:

- `<mode>` is `baseline` or `bass-agents`

## Minimum Sample Size

For first comparison:

- 3 baseline runs
- 3 bass-agents runs

Then compare median scores and variance.
