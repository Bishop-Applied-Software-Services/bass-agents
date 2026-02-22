# Session Review MVP (Tool-Integrated)

## Goal

Provide high-signal session review reports without building provider parsers from scratch, by composing two existing tools:

- `agtrace` for session/event indexing and trace-level analysis (Claude/Codex/Gemini)
- `ccusage` JSON output for Claude token/cost accounting

## Primary User Stories

1. As a user, I can review my most recent Claude or Codex session and see major token drivers.
2. As a user, I can get a normalized report format regardless of upstream tool/provider.
3. As a user, I can receive ranked recommendations and budget adherence signals in one report.

## MVP Architecture

### Data Sources

- **Claude**:
  - Token/cost source of truth from `ccusage session --json`
  - Session structure/tool-behavior enrichment from `agtrace session show --format json`
- **Codex**:
  - Session structure and token/tool behavior from `agtrace session list/show --format json`

### Normalization Layer (bass-agents)

`scripts/review-session.py` becomes an orchestrator:

1. Executes upstream CLI commands
2. Parses JSON
3. Maps data into `session-review-report.schema.json`
4. Applies heuristics for drivers, scoring, and recommendations
5. Emits JSON or markdown

### Why this approach

- Faster iteration than maintaining custom log parsers
- Lower breakage risk when providers change raw artifact formats
- Better separation of concerns: upstream tools parse logs; bass-agents scores/recommends

## Dependencies

- `agtrace` CLI (Lanegrid)
- `ccusage` CLI (for Claude usage + cost)

If dependencies are missing, review command fails with install guidance.

## Proposed CLI Surface (MVP)

```bash
./scripts/review-session.py --source codex --path .
./scripts/review-session.py --source claude --path .
./scripts/review-session.py --source claude --format markdown --out ./session-review.md
```

Notes:

- `--path` remains for compatibility with wrapper flows; primary data is sourced from upstream CLIs.
- `--source auto` infers provider from path hints and available tool output.

Wrapper command (recommended UX):

```bash
./scripts/run-with-bass-agents.sh --tool codex --project bass.ai -- --model gpt-5
./scripts/run-with-bass-agents.sh --tool claude --project bass.ai --max-tokens 20000 --timebox-minutes 60 -- --model sonnet
```

## Output Contract

MVP output must conform to:

- `schemas/session-review-report.schema.json`

## Acceptance Criteria

1. `review-session.py` shells out to `agtrace` (all providers) and `ccusage` (Claude).
2. Command returns schema-compatible output for both `--source codex` and `--source claude`.
3. Report includes top token drivers and at least 3 recommendations.
4. Budget flags (`--max-tokens`, `--max-cost-usd`, `--timebox-minutes`, `--elapsed-minutes`) influence report adherence and scoring.
5. Missing dependency errors are explicit and actionable.

## Out of Scope (MVP)

- Rebuilding parser logic already implemented by upstream tools
- Real-time dashboards
- Team billing reconciliation
- Deep semantic quality grading

## Implementation Plan

1. Update PRD and docs to codify tool-integrated architecture.
2. Refactor `scripts/review-session.py` to:
   - call `agtrace` and `ccusage`
   - normalize into current report schema
3. Keep existing scorer/recommendation layers in bass-agents.
4. Validate with a fresh wrapper run and capture report in `session-reviews/<project>/`.

## Success Metrics

- Adoption: review runs per week
- Stability: parser breakages avoided vs prior custom-parser baseline
- Utility: percent of reports judged actionable by maintainers
