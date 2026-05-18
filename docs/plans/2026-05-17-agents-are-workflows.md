# Agents are workflows — `bass-agents` design

## Problem

Coding agents work great in interactive sessions. They fall apart for long-running, multi-step, multi-tool, or multi-day work. The earlier framing ("native-first portability and quality layer") described what `bass-agents` is *not* — not a runtime, not a competitor to harnesses — but never produced a sharp product description.

The harness layer is also accelerating: Claude Code, Codex, and Cursor are absorbing subagents, memory, worktrees, approvals, session history, browser/test automation, and eval tooling. That makes "we are the portability layer above harnesses" a shrinking surface area.

## Design

**Agents are workflows.** Every piece of agent work — roles, tool calls, reviews, approvals, memory writes — is modeled as a workflow on Temporal.

- **Roles** (PM, Reviewer, Coder, Evaluator, …) → workflow types
- **LLM calls** → activities
- **Tool calls (MCP, shell, git)** → activities
- **AgentTask / AgentResult** → workflow input/output schemas
- **Pipelines** (PM → Gameplay → Designer → QA → Coder → Evaluator) → parent workflows composing child workflows
- **Human approval / review gate** → workflow signal
- **Safety boundary** → workflow-level guard or compensating activity
- **Memory / audit log** → workflow history (replay = remember)
- **Retry / token-spike protocol** → activity retry policy + timeouts
- **bd open issues** → workflow query against running state

Harnesses (Claude Code, Codex, Cursor) become the activities a workflow calls. They are *not* platforms `bass-agents` lives inside.

## Why Temporal

- **Battle-tested.** OpenAI runs Codex on Temporal in production.
- **Durable execution.** Workflows survive crashes, restarts, multi-day jobs without checkpoint code.
- **Deterministic orchestration + non-deterministic activities.** The split matches how agents actually work.
- **Workflow signals.** Native primitive for human-in-the-loop.
- **Replay.** Workflow history is the audit log, debugger, and memory.
- **MCP durability.** Wrapping MCP tools as durable activities is straightforward and already a documented pattern.

Alternatives (Inngest, DBOS, Restate, Hatchet) are evaluated via the [Platform Capability Radar](../../workflows/platform-capability-radar.md). Temporal is the recommended default until evidence changes it.

## Product Filter

- Use Temporal primitives first. Then host harness features. Then `bass-agents`.
- Add only what improves workflow ergonomics, portability across harnesses, or production durability.
- Do not rebuild Temporal primitives or host harness features.
- Delete or demote `bass-agents` features when Temporal or a harness absorbs them.
- Keep setup small enough to install into an existing repo quickly.

## Kept

- `agents/*.agent` as the portable source for role definitions — each becomes a workflow type.
- `AGENTS.md` / `CLAUDE.md` project doctrine.
- Safety guidance for irreversible actions — implementable as compensating activities and workflow guards.
- Verification and review rubrics — implementable as workflow stages.
- Field notes and lightweight feedback artifacts.
- AgentTask/AgentResult schemas — promoted from "reference material" back to "workflow I/O contracts" in the workflow path.

## Demoted / superseded

- Bespoke durable-memory storage — superseded by workflow history.
- Standalone runtime orchestration and provider wrappers — superseded by Temporal workflows + activities.
- Dashboards that duplicate Temporal Web or host session surfaces.
- Custom retry / timeout / token-spike machinery — superseded by Temporal activity options.

## Now / Next / Later

### Now
- Update VISION.md, README.md, MIGRATION_TO_SUBAGENTS.md to the new frame.
- Rename `native-capability-radar` → `platform-capability-radar`.
- Leave `agents/*.agent`, schemas, and field notes untouched — they survive the reframe unchanged.

### Next
- Minimal Temporal workflow library: each role exported as a workflow type with typed I/O.
- Activities for Claude Code CLI and Codex CLI so workflows can call either harness.
- Example workflow: PM → Reviewer → Coder → Evaluator runnable on the Temporal dev server.
- AgentTask/AgentResult ↔ workflow I/O glue.

### Later
- Versioned releases of the workflow library + migration notes for prompt/role changes.
- Adapter activities for Cursor, Gemini, local models where they materially differ.
- Durable MCP wrappers so MCP tools inherit workflow durability.

## Revisit conditions

If Temporal (or the next dominant workflow engine) ships a primitive that absorbs one of `bass-agents`'s remaining responsibilities, run the Platform Capability Radar and demote or delete accordingly.
