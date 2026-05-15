# Native-First Bass-Agents Design

## Problem

`bass-agents` started as an agent framework, but native harnesses like Claude Code and Codex are absorbing the platform categories: subagents, memory, worktrees, approvals, session history, browser/test automation, and eval tooling.

## Design

`bass-agents` should be a portability and quality layer for native agent harnesses, not a competing runtime. It should provide portable doctrine, role definitions, safety posture, project readiness defaults, and quality rubrics. It should export into each host's native format and avoid custom infrastructure unless the host cannot reasonably provide the capability.

## Product Filter

- Use native harness features first.
- Add only what improves portability, consistency, safety, or output quality.
- Do not build categories likely to become native.
- Delete or demote `bass-agents` features when a host harness absorbs them.
- Keep setup small enough to install into an existing repo quickly.

## Kept

- `agents/*.agent` as portable role source material.
- `AGENTS.md` / `CLAUDE.md` project doctrine.
- Safety guidance for irreversible actions.
- Verification and review rubrics.
- Field notes and lightweight feedback artifacts.
- Thin exporters/installers when they map source material into native host formats.

## Demoted

- Durable memory as a bespoke agent-memory system.
- Runtime orchestration and provider wrappers.
- Machine-enforced AgentTask/AgentResult as the default path.
- Dashboards that duplicate host session or eval surfaces.

## Revisit Conditions

Revisit runtime work only for concrete headless workflows, machine-validated cross-harness contracts, or real multi-user/customer demand.
