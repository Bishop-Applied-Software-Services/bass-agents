# bass-agents Vision

## Why This Exists

Coding agents work great in interactive sessions. They fall apart for long-running, multi-step, multi-tool, or multi-day work — exactly the work that matters in production. The gap isn't smarter models. It's missing **workflow infrastructure**: durable execution, deterministic replay, signal-based human input, compensating activities, retry policy.

`bass-agents` closes that gap by treating agent work as workflow work.

## Vision

**Agents are workflows.** Every role, every tool call, every review gate, every memory write — modeled as Temporal workflows and activities. Portable across Claude Code, Codex, and Cursor as the activities that drive them. Durable across crashes, restarts, and multi-day jobs.

`bass-agents` is portable agent doctrine plus a Temporal workflow library. Doctrine defines what good agent work looks like (roles, safety, review standards). The library expresses those roles as Temporal workflow types so they can actually run.

## End-State Experience

1. A developer defines a workflow: PM agent → Reviewer agent → Coder agent → Evaluator → human approval.
2. The workflow runs on Temporal. LLM calls happen inside activities (Claude Code CLI, Codex CLI, direct API).
3. The workflow survives anything — crashes, restarts, the agent walking away for a week.
4. Human approvals come in as workflow signals. Audit comes from workflow history. Retries follow workflow policy.
5. The same workflow runs interactively (dev mode) or autonomously (production), without changing the definition.

## Core Principles

- **Workflows are the unit.** Not agents, not prompts, not pipelines. Workflows.
- **Deterministic orchestration, non-deterministic activities.** Temporal's split is the design.
- **Harnesses are activities.** Claude Code, Codex, and Cursor are tools the workflow uses — not platforms it lives inside.
- **Doctrine over framework.** Roles, safety rules, and review standards are portable; the workflow library is opinionated but thin.
- **Delete-when-platform.** If Temporal (or a native harness) ships a feature, `bass-agents` stops shipping it.
- **Portable by default.** One shared standard that maps cleanly into multiple tools.

## Success Criteria

- A new workflow goes from idea to running in under an hour.
- A long-running workflow survives a multi-hour Temporal restart with zero data loss.
- A team can swap Claude Code for Codex CLI in one activity definition.
- Agent prompts and roles work identically when invoked inside or outside a workflow.

## Milestones

### Now

- Maintain one concise project instruction layer (`AGENTS.md` / `CLAUDE.md`) that any assistant can use.
- Keep `agents/*.agent` as the portable source for role definitions. Each role will export as a Temporal workflow type.
- Keep safety posture focused on irreversible actions: data deletion, force-push, publishing, direct DB mutation.
- Run the [Platform Capability Radar](workflows/platform-capability-radar.md) for any platform-like capability before building or preserving it.

### Next

- Ship a minimal Temporal workflow library that wraps each role as a workflow type with typed input/output.
- Define activities for Claude Code CLI and Codex CLI so workflows can call either harness.
- Express AgentTask/AgentResult as workflow I/O schemas; treat them as machine contracts, not just docs.
- Add a small example workflow (PM → Reviewer → Coder → Evaluator) runnable on the Temporal dev server.

### Later

- Publish versioned releases of the workflow library with migration notes for prompt, role, and policy changes.
- Add adapter activities for additional harnesses (Cursor, Gemini, local models) only where they materially differ.
- Build out durable MCP wrappers so MCP tool calls inherit workflow durability.

## Non-Goals (For Now)

- Building a workflow engine. Temporal exists; use it.
- Rebuilding native harness features that interactive sessions already handle well (subagents, approvals, worktrees, session state).
- Optimizing for every editor/tool integration on day one.
- Expanding prompt verbosity at the cost of token efficiency.

## Decision Rule

If a change does not improve workflow ergonomics, portability across harnesses, or durability for production runs — do not add it.

If a workflow engine (Temporal) or a host harness is likely to make a category native, do not build that category as a `bass-agents` subsystem. Use the native feature, document the mapping, and keep `bass-agents` focused on portable doctrine, roles, safety, and quality.

For any platform-like capability, run [`workflows/platform-capability-radar.md`](workflows/platform-capability-radar.md) before building or preserving it.
