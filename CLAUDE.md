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