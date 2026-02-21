# Session Review MVP

## Goal

Enable a Claude CLI or Codex CLI user to ask for session analysis and get a structured report of token usage drivers, key efficiency metrics, and actionable best practices.

## Primary User Stories

1. As a user, I can review my current session and see what contributed most to token usage.
2. As a user, I can review one or more past sessions and compare high-level efficiency metrics.
3. As a user, I receive prioritized recommendations with references to relevant provider docs when useful.

## MVP Scope

- Input adapters for:
  - Claude session artifact(s) (when available in accessible log/export form)
  - Codex session artifact(s) (when available in accessible log/export form)
- Normalization into one shared shape.
- Report generation with a stable schema.
- Core metrics:
  - input/output/total tokens
  - estimated cost (if pricing/model metadata is present)
  - message count and average tokens per message
  - tool call count
  - repeated-context ratio (heuristic)
  - rewrite/retry loop count (heuristic)
- Ranked "top token drivers" and recommendations.
- Automated heuristic scoring in the report:
  - efficiency (0-100)
  - reliability (0-100)
  - composite (0-100)
  - optional quality estimate (low-confidence in MVP)

## Out of Scope (MVP)

- Real-time streaming dashboards.
- Automatic pricing fetch from provider APIs.
- Deep semantic quality scoring of all prompts/responses.
- Enterprise analytics (multi-team RBAC, billing reconciliation).

## Proposed CLI Surface (MVP)

```bash
bass-agents review-session --source codex --path ./session.json
bass-agents review-session --source claude --path ./session.json
bass-agents review-session --source codex --path ./sessions/ --format markdown
```

Optional flags:

- `--current` review current session if available in runtime context
- `--out <path>` write machine-readable report JSON
- `--format json|markdown` human output format
- `--max-tokens`, `--max-cost-usd`, `--timebox-minutes`, `--elapsed-minutes` for budget-aware scoring

Wrapper command (recommended UX):

```bash
./scripts/run-with-bass-agents.sh --tool codex -- --model gpt-5
./scripts/run-with-bass-agents.sh --tool claude --session-path ./session.json --format markdown --report-out ./session-review.md -- --model sonnet
```

If `--session-path` is omitted, wrapper attempts auto-discovery of newest session artifact in tool-specific default directories (or custom `BASS_AGENTS_SESSION_DIRS`).

## Output Contract

MVP output must conform to:

- `schemas/session-review-report.schema.json`

## Acceptance Criteria

1. Given a valid session artifact, command returns a valid report JSON (schema pass).
2. Report includes top token drivers ranked by estimated token impact.
3. Report includes at least 3 concrete recommendations.
4. Each recommendation includes an expected impact (`high|medium|low`).
5. Report includes computed scores in `scores`.
6. If budget flags are provided, report includes budget adherence and warnings.
7. Command exits non-zero with actionable error on unreadable or unsupported input.

## Implementation Plan

1. Add report schema and fixtures.
2. Build parser + normalizer for one source first (Codex).
3. Add Claude adapter.
4. Add markdown rendering for human-readable output.
5. Add validation tests in CI.

## Success Metrics

- Adoption: number of review runs per week.
- Utility: percent of runs producing actionable recommendations.
- Improvement: median token reduction after recommendations are applied.
