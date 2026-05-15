# Native Capability Radar

Use this workflow before adding or expanding any `bass-agents` feature that could plausibly become native in Claude Code, Codex, Cursor, GitHub Copilot, or another coding-agent harness.

The goal is to keep `bass-agents` additive: portable doctrine, role definitions, safety posture, quality rubrics, and thin mappings to native features.

## Trigger

Run this when:

- proposing a new platform-like feature
- reviving deferred memory, orchestration, worktree, browser, CI, cost, routing, or telemetry work
- a host harness ships a major release that overlaps `bass-agents`
- deciding whether existing repo docs should be kept, demoted, or deleted

## Inputs

- Capability name
- Proposed `bass-agents` behavior
- Host tools in scope
- Decision deadline, if any

## Steps

1. Define the capability narrowly.

   Write the smallest concrete version of the feature. Prefer "Claude subagent role export" over "subagents"; prefer "cross-harness session-review rubric" over "memory".

2. Research primary sources.

   Use official docs, changelogs, release notes, roadmaps, repositories, and product announcements. For OpenAI/Codex, prefer the OpenAI docs MCP or official OpenAI sources. For Claude, prefer official Anthropic and Claude Code sources.

   Roadmaps and product releases change, so use live research when running this workflow. Record exact dates. Treat social posts, issues, and community comments as pointers unless the vendor confirms the capability.

3. Classify the capability.

   Use one classification per host tool where useful:

   - `native-now`: shipped and usable in the host
   - `native-soon`: announced or clearly planned by the vendor
   - `portable-gap`: native pieces exist, but cross-harness consistency still needs a thin `bass-agents` layer
   - `local-only`: valuable local convention, unlikely to become a host primitive
   - `avoid`: speculative, duplicated, or outside the product boundary

4. Decide the product move.

   Choose one:

   - `keep`: remains a core `bass-agents` concern
   - `adapt`: map to native host capability and keep portable policy/rubric only
   - `demote`: keep as legacy/reference material, not default product path
   - `delete`: remove from active docs or code
   - `defer`: wait for stronger signal before building

5. Write the artifact.

   Copy `docs/research/TEMPLATE-native-capability-radar.md` to:

   `docs/research/YYYY-MM-DD-native-capability-radar-<capability-slug>.md`

6. Update direction only when the evidence changes it.

   If the radar changes product direction, update `VISION.md`, `README.md`, open issues, or plans in the same branch. Otherwise, keep the artifact as the decision record.

## Guardrails

- Do not build during the radar pass.
- Do not infer vendor plans without labeling them as inferred.
- Do not cite stale docs as current without checking dates.
- Do not treat a local workaround as a product feature unless the host tools cannot reasonably absorb it.
- Do not preserve legacy `bass-agents` subsystems just because they already exist.
