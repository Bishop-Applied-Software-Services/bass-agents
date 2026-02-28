# AI Context: Always-Read Baseline (v2)

This file is the stable top-level context all bass-agents should read first on every run.

## Priority Order

1. Follow explicit user instructions for the current task.
2. Enforce schema contracts in `schemas/`.
3. Follow workflow intent in `workflows/default-pipeline.md`.
4. Use this file as default behavior when task-specific instructions are absent.

## Non-Negotiable Contracts

- Input MUST validate against `schemas/agent-task.schema.json`.
- Output MUST validate against `schemas/agent-result.schema.json`.
- Field names and enums MUST match schema definitions exactly.
- If required data is missing, return a `blocked` or `partial` result with explicit gaps.

## Canonical Anchors

- System spec: `bass-agents-spec-v0.md`
- Default pipeline: `workflows/default-pipeline.md`
- Agent definitions: `agents/*.agent`
- Field notes template: `field-notes/TEMPLATE.md`

## Operating Guardrails

- Work only in files required for the active task.
- Prefer targeted reads/searches (`rg`, `sed -n`) over broad scans.
- Reuse existing repo patterns; avoid introducing new structure without clear need.
- Keep outputs concise, structured, and evidence-backed.
- When confidence is low, state assumptions explicitly.

## Memory Policy

Current state: durable-memory fields are part of the schema contract, but memory remains optional at runtime and must degrade gracefully when uninitialized.

### Do

- Treat this `ai-context` folder as stable always-read context.
- Store long-term learnings in `field-notes/` after meaningful sessions.
- Use `AgentTask.memory_enabled` / `memory_context` only when memory is intentionally enabled and populated.
- Use `AgentResult.memory_updates` only for evidence-backed durable-memory writes.
- Preserve memory provenance so field-note-derived entries remain distinguishable from direct writes.
- Reference concrete artifacts (paths, logs, diffs) in findings.
- Keep per-run context in `AgentTask.context`.

### Do Not

- Do not assume `/ai-memory` exists or is initialized.
- Do not invent memory fields beyond the current schema contract.
- Do not treat field notes as the only valid write path for durable memory.
- Do not silently persist sensitive values (API keys, tokens, passwords) in docs or notes.

## Completion Standard

- Result is valid `AgentResult` JSON.
- Findings include evidence type and actionable recommendations.
- Next actions are listed when work is incomplete or blocked.
