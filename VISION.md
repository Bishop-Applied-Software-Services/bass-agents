# bass-agents Vision

## Why This Exists

Software teams can use powerful coding assistants, but each tool has different conventions, prompt formats, and workflow behavior. `bass-agents` exists to provide a portable, tool-agnostic operating model for agentic software development, so teams can get consistent outcomes across environments.

## Vision

Any developer can say "build with bass-agents" in tools like Claude CLI or Codex CLI, and those tools reliably execute the same `bass-agents` rules, workflows, and quality standards.

## End-State Experience

1. A developer enables `bass-agents` once in a repo or globally.
2. They invoke their preferred assistant (Claude CLI, Codex CLI, etc.).
3. The assistant follows `bass-agents` contracts and workflow defaults.
4. Outputs are validated against shared schemas.
5. Teams get consistent, reviewable, repeatable agent behavior across tools.

## Core Principles

- Portable by default: one shared standard that works across tools.
- Token efficient: minimal instruction overhead and no duplicate policy files.
- Schema driven: stable machine-readable contracts for handoffs and validation.
- Practical rigor: lightweight process, strong quality checks.
- Incremental evolution: start simple, add capability only when needed.

## Success Criteria

- Invocation simplicity: "build with bass-agents" is a clear, repeatable pattern.
- Cross-tool consistency: materially similar behavior across Claude CLI and Codex CLI.
- Contract reliability: high schema-validation pass rate for agent outputs.
- Quality impact: better iteration outcomes (fewer regressions, clearer handoffs).
- Adoption: repeated usage across projects, not one-off experiments.

## Milestones

### Now

- Maintain one canonical instruction source (`CLAUDE.md`) with alias (`AGENTS.md` symlink).
- Keep shared agent definitions and schemas as the source of truth.
- Validate produced task/result artifacts with existing scripts.

### Next

- Standardize a simple "use bass-agents" invocation pattern for Claude CLI and Codex CLI.
- Add lightweight docs for setup, invocation, and expected outputs.
- Define baseline metrics for consistency and quality.

### Later

- Introduce a standalone `bass-agents` CLI wrapper for install/run/validate workflows.
- Add adapter layers only if tool behavior materially diverges.
- Publish versioned releases and migration notes for contract changes.

## Non-Goals (For Now)

- Building a complex orchestration platform before adoption signals are clear.
- Optimizing for every editor/tool integration on day one.
- Expanding prompt verbosity at the cost of token efficiency.

## Decision Rule

If a change does not improve portability, consistency, or outcome quality, do not add it.
