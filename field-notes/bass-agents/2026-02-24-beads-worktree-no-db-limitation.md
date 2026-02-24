# Field Note: Beads Worktree Limitation in JSONL-only Mode

**Date:** 2026-02-24
**Project:** bass-agents
**Pipeline run:** durable-memory follow-up execution
**Author:** codex

## Summary

We tried to execute the standard Beads worktree flow to avoid `bd init` failures in plain git worktrees. `bd init` succeeded in the primary checkout, but `bd worktree create` failed repeatedly with `no beads database found` in this environment's JSONL-only Beads mode.

## Project Context

- **Stack / domain:** TypeScript + Beads-backed durable-memory workflows
- **Stage:** post-merge stabilization on main
- **Goal for this session:** persist and execute standard Beads worktree procedure

## What Worked

- `bd init` in main checkout completed successfully.
- Root cause was reproducible and consistent.
- Added repo guidance at `docs/beads-worktree-setup.md`.

## What Didn't

- `bd worktree create` failed in JSONL-only mode (`no beads database found`).
- Standard Beads-managed worktree flow is not executable on this machine with current backend mode.

## Agent-Specific Observations

| Agent | Observation | Action Item |
|-------|-------------|-------------|
| coding-agent | Assumed `bd worktree` was always usable after `bd init` | Add environment preflight for Beads backend mode before worktree-dependent tasks |

## Follow-Up Actions

- [ ] Add a small preflight script/command to detect Beads backend capability (DB-capable vs JSONL-only).
- [ ] If worktree support is required, move to CGO-enabled Beads or Dolt server mode.
- [ ] For now, run Beads-dependent validation from primary checkout or a full clone.
