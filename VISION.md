# bass-agents Vision

## Why This Exists

Software teams can use powerful coding assistants, but each tool has different conventions, prompt formats, and workflow behavior. `bass-agents` exists to provide a portable, tool-agnostic operating model for agentic software development, so teams can get consistent outcomes across environments without replacing the native harness.

## Vision

Any developer can say "build with bass-agents" in tools like Claude CLI or Codex CLI, and those tools reliably follow the same `bass-agents` doctrine, roles, safety posture, and quality standards using their native capabilities.

`bass-agents` is not an agent runtime. It is a portability and quality layer for native agent harnesses.

## End-State Experience

1. A developer enables `bass-agents` once in a repo or globally.
2. They invoke their preferred assistant (Claude CLI, Codex CLI, etc.).
3. The assistant reads the same project doctrine, role definitions, safety rules, and verification expectations.
4. Native harness features handle subagents, memory, approvals, worktrees, tool execution, and session state where available.
5. Teams get consistent, reviewable, repeatable agent behavior across tools without adopting a parallel platform.

## Core Principles

- Native-first: use Claude, Codex, and other harness capabilities instead of reimplementing them.
- Additive-only: improve the default agent setup without forcing a parallel runtime.
- Portable by default: one shared standard that maps cleanly into multiple tools.
- Token efficient: minimal instruction overhead and no duplicate policy files.
- Practical rigor: lightweight process, strong quality checks.
- Delete-when-native: remove or demote features once host harnesses provide them well.
- Incremental evolution: start simple, add capability only when needed.

## Success Criteria

- Invocation simplicity: "build with bass-agents" is a clear, repeatable pattern.
- Cross-tool consistency: materially similar behavior across Claude CLI and Codex CLI.
- Native fit: exported prompts/configs feel idiomatic in each host tool.
- Quality impact: better iteration outcomes (fewer regressions, clearer handoffs).
- Maintenance discipline: platform-like features are pruned when they become native.
- Adoption: repeated usage across projects, not one-off experiments.

## Milestones

### Now

- Maintain one concise project instruction layer (`AGENTS.md` / `CLAUDE.md`) that any assistant can use.
- Keep shared role definitions in `agents/*.agent` as portable source material.
- Export native Claude/Codex role prompts only where the host benefits from them.
- Keep safety posture focused on irreversible actions: data deletion, force-push, publishing, direct DB mutation.

### Next

- Standardize a simple "use bass-agents" invocation pattern for Claude CLI and Codex CLI.
- Add lightweight docs for setup, invocation, host-native role usage, and expected verification behavior.
- Define baseline quality rubrics for planning, review, implementation, and evaluation.
- Mark platform-like subsystems as native-handled, legacy, or deferred.

### Later

- Add adapter layers only when tool behavior materially diverges and the adapter remains thin.
- Publish versioned releases and migration notes for prompt, role, and policy changes.
- Revisit structured contracts only for headless/programmatic workflows that native harnesses cannot handle.

## Non-Goals (For Now)

- Building a complex orchestration platform before adoption signals are clear.
- Rebuilding native harness features: durable memory, task queues, subagent orchestration, worktree management, approval UI, session transcripts, browser/test harnesses, model routing, cost tracking, or CI-style runners.
- Optimizing for every editor/tool integration on day one.
- Expanding prompt verbosity at the cost of token efficiency.

## Decision Rule

If a change does not improve portability, consistency, native fit, or outcome quality, do not add it.

If a big AI harness is likely to make a category native, do not build that category as a `bass-agents` subsystem. Use the native feature, document the mapping, and keep `bass-agents` focused on portable doctrine, roles, safety, and quality.

For any platform-like capability, run `workflows/native-capability-radar.md` before building or preserving it.
