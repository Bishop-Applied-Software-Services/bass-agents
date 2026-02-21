# Agentic Framework Status – bass-agents

**Date:** 2026-02-21
**Project:** bass-agents
**Pipeline run:** n/a (documentation review)
**Author:** Codex

## Summary

This document captures a point-in-time assessment (Feb 21, 2026) of bass-agents against a pragmatic agentic framework checklist. The repo is strong on contracts, portability, discipline, and basic observability; it is intentionally light on runtime automation.

## Current Capabilities Snapshot

- Contracts: Shared JSON Schemas for handoffs (`schemas/agent-task.schema.json`, `schemas/agent-result.schema.json`).
- Agents: Portable role-scoped `.agent` files (`agents/*.agent`) including MetaAgent orchestrator spec.
- Workflow: Documented 7-step pipeline with clear handoffs (`workflows/default-pipeline.md`).
- Observability/Cost: Session analyzer and wrapper with budget inputs (`scripts/review-session.py`, `scripts/run-with-bass-agents.sh`).
- Governance/Discipline: Token rules + spike protocol (`CLAUDE.md`).
- Evals: Starter benchmark + rubric (`benchmarks/basic-todo-app/README.md`, `benchmarks/basic-todo-app/scoring-rubric.md`).
- Validation: Artifact schema validator (`scripts/validate-results.sh`).
- Portability: Simple install via symlinks (`install.sh`), config-over-code ethos (`README.md`, `bass-agents-spec-v0.md`).

## Strengths

- Clear contracts and structured handoffs.
- Portable agent definitions with explicit tool registries.
- Cost/latency hygiene baked in (budgets, spike protocol, analyzer).
- Human-in-the-loop with artifact validation and small-diff norms.
- Early, concrete benchmarking path.

## Partially Covered

- Planner/orchestrator: Defined in prompts/docs; not an executable routing engine.
- Memory: Long-term via field notes/artifacts; no scoped retrieval cache.
- Tooling layer: Registries exist in text; no typed adapter/runtime with quotas.
- Reliability: Policies exist; limited automatic enforcement beyond schemas.
- Security/governance: Guidance present; no secrets scanning/redaction or approvals.

## Missing For A Full Framework

- Executable orchestrator that instantiates `AgentTask`s, enforces stop rules, and routes `AgentResult` -> next step automatically.
- Lightweight memory service (per-project cache of summaries/artifacts + query API).
- Typed tool adapters with rate limits/quotas and an allowlist policy.
- First-class tracing/metrics sink (structured spans) beyond the session analyzer.
- Policy hooks: secret redaction, PII filters, and approval gates for risky ops.

## Next 5 Moves (Low Lift)

1) Minimal orchestrator CLI: read `AgentTask` JSON, call selected agent via tool, validate `AgentResult`, emit next-task seed (align with `agents/metaagent.agent`).
2) Local memory cache: `./.bass/cache/` with summary JSONs and artifact index; agents reference cache instead of rereading sources.
3) Tool adapter layer: YAML/JSON capability registry + shell adapters with timeouts/rate limits; log adapter calls into session review.
4) Budget enforcement: wrapper halts at 85–90% of token/time budget and emits a checkpoint `AgentResult`.
5) CI checks: run `scripts/validate-results.sh` on `agent-results/*.json` and lint `.agent` files for required sections.

## Evidence References

- `schemas/agent-task.schema.json`
- `schemas/agent-result.schema.json`
- `agents/metaagent.agent`
- `workflows/default-pipeline.md`
- `scripts/review-session.py`
- `scripts/run-with-bass-agents.sh`
- `CLAUDE.md`
- `benchmarks/basic-todo-app/README.md`
- `benchmarks/basic-todo-app/scoring-rubric.md`
- `scripts/validate-results.sh`
