# Migration to Claude Code subagents — 2026-05-14

On 2026-05-14, the agent prompts from this repo were ported to Claude Code
subagent format under `~/.claude/agents/`. That migration clarified the product
direction: `bass-agents` should be a native-first portability and quality layer,
not a competing agent runtime.

## What got ported

| `agents/*.agent` | Claude Code subagent | Notes |
|---|---|---|
| coding-agent | (skipped) | Claude Code itself is the coding agent |
| designer | `~/.claude/agents/Designer.md` | Adapted |
| evaluator | `~/.claude/agents/Evaluator.md` | Adapted |
| gameplay-expert | `~/.claude/agents/Gameplay-Expert.md` | Adapted, mechanic patterns preserved |
| metaagent | `~/.claude/agents/MetaAgent.md` | Adapted as subagent factory |
| pm | `~/.claude/agents/PM.md` | Adapted |
| qa-adversary | `~/.claude/agents/QA-Adversary.md` | Adapted |

Subagents in Claude Code return prose to the main session; they do not enforce
the AgentTask/AgentResult JSON schemas that this repo defines. That contract
layer only matters in a headless/programmatic runtime. It remains reference
material, but it is not the default product path.

## Native-first conclusion

- Big AI harnesses are absorbing subagents, memory, worktrees, approvals,
  session history, browser/test automation, model routing, and eval dashboards.
- `bass-agents` should not rebuild categories that are likely to become native.
- The durable-memory/runtime work is therefore legacy/deferred unless a concrete
  headless or cross-harness need appears.
- Beads remains useful as ordinary issue tracking. It should not be positioned
  as a bespoke agent-memory platform.

## What remains valuable

- Portable agent doctrine: how agents plan, verify, review, ask, and stop.
- Role definitions that export cleanly into native Claude/Codex formats.
- Safety posture for reversible vs irreversible actions.
- Project readiness defaults via `AGENTS.md`, `CLAUDE.md`, and lightweight setup.
- Quality rubrics and feedback artifacts that improve prompts over time.

## When to revisit runtime work

Revisit runtime work only if native harnesses cannot satisfy a concrete need:

- Headless unattended workflows with no human at a terminal.
- A cross-harness contract that must be machine-validated.
- A second user/customer needs tool-independent automation and accepts the
  extra setup/API cost.

Until then, prefer native harness features and keep `bass-agents` additive.
