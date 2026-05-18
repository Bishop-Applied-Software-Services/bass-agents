# Platform Capability Radar

Use this workflow before adding or expanding any `bass-agents` feature that could plausibly be provided by the workflow engine (Temporal) or a host harness (Claude Code, Codex, Cursor, GitHub Copilot, Gemini).

The goal is to keep `bass-agents` thin: portable agent doctrine, role definitions expressed as workflows, safety posture, quality rubrics, and mappings to platform features — and nothing else.

## Trigger

Run this when:

- proposing a new platform-like feature
- reviving deferred memory, orchestration, worktree, browser, CI, cost, routing, or telemetry work
- the workflow engine (Temporal) ships a major release that overlaps `bass-agents`
- a host harness ships a major release that overlaps `bass-agents`
- deciding whether existing repo docs should be kept, demoted, or deleted

## Inputs

- Capability name
- Proposed `bass-agents` behavior
- Platforms in scope: workflow engines (Temporal, Inngest, DBOS, Restate, Hatchet) and host harnesses (Claude Code, Codex, Cursor, …)
- Decision deadline, if any

## Steps

1. **Define the capability narrowly.**

   Write the smallest concrete version of the feature. Prefer "role workflow type export" over "subagents"; prefer "compensating activity for irreversible tool calls" over "safety".

2. **Research primary sources.**

   Use official docs, changelogs, release notes, roadmaps, repositories, and product announcements. For Temporal, prefer the Temporal docs MCP or official Temporal sources. For Claude, prefer official Anthropic and Claude Code sources. For OpenAI/Codex, prefer the OpenAI docs MCP.

   Roadmaps change, so use live research when running this workflow. Record exact dates. Treat social posts, issues, and community comments as pointers unless the vendor confirms the capability.

3. **Classify the capability — per platform where useful.**

   - `engine-native`: provided by the workflow engine (Temporal primitives, activity options, signals, queries, child workflows, etc.)
   - `harness-native`: shipped and usable in a host harness (Claude Code, Codex, Cursor)
   - `engine-soon` / `harness-soon`: announced or clearly planned by the vendor
   - `portable-gap`: pieces exist on each platform but cross-platform consistency still needs a thin `bass-agents` layer
   - `local-only`: valuable local convention, unlikely to become a platform primitive
   - `avoid`: speculative, duplicated, or outside the product boundary

4. **Decide the product move.**

   - `keep`: remains a core `bass-agents` concern
   - `adapt`: map to a platform capability and keep portable policy/rubric only
   - `demote`: keep as legacy/reference material, not default product path
   - `delete`: remove from active docs or code
   - `defer`: wait for stronger signal before building

5. **Write the artifact.**

   Copy `docs/research/TEMPLATE-platform-capability-radar.md` to:

   `docs/research/YYYY-MM-DD-platform-capability-radar-<capability-slug>.md`

6. **Update direction only when the evidence changes it.**

   If the radar changes product direction, update `VISION.md`, `README.md`, open issues, or plans in the same branch. Otherwise, keep the artifact as the decision record.

## Guardrails

- Do not build during the radar pass.
- Do not infer vendor plans without labeling them as inferred.
- Do not cite stale docs as current without checking dates.
- Do not treat a local workaround as a product feature unless the platform layers cannot reasonably absorb it.
- Do not preserve legacy `bass-agents` subsystems just because they already exist.
