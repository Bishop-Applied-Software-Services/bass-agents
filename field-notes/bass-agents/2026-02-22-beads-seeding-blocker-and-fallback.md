# Field Note: Beads Seeding Blocker and JSONL Fallback

**Date:** 2026-02-22
**Project:** bass-agents
**Pipeline run:** durable-memory implementation branch validation
**Author:** codex

## Summary

Memory seeding failed on `feature/durable-memory-implementation` because Beads write commands (`bd create`, `bd update`) errored with `no beads database found` in a local environment where Dolt/CGO database mode was not usable. The durable-memory adapter was also using older Beads CLI flags and a hardcoded `bd-*` ID assumption. We unblocked seeding by updating Beads command compatibility, adding JSONL fallback for DB/CGO errors, and validating end-to-end seed/test flows.

## Project Context

- **Stack / domain:** TypeScript CLI + memory adapter using Beads storage
- **Stage:** mid-build feature branch (`feature/durable-memory-implementation`)
- **Goal for this session:** analyze seeding blocker and restore reliable memory seeding + tests

## What Worked

- Reproduced the blocker directly with `npx ts-node scripts/generate-test-data.ts bass-agents`.
- Isolated root cause to Beads runtime compatibility + CLI contract drift.
- Implemented adapter fallback to direct `.beads/issues.jsonl` writes/updates for DB/CGO failures.
- Updated command usage to current Beads flags and generalized ID parsing.
- Passed validation: build, full `memory-adapter` tests (33/33), and seeding script (10 entries created).

## What Didn't

- Existing implementation assumed `bd create --body --label` and `bd update --field --label`, which do not match current CLI behavior.
- Hardcoded ID regex (`bd-[a-f0-9]+`) was too strict for prefix-based issue IDs.
- `init()` config handling risked clobbering `.beads/config.yaml` state.

## Agent-Specific Observations

| Agent | Observation | Action Item |
|-------|-------------|-------------|
| coding-agent | Adapter used brittle CLI assumptions and failed open only after runtime errors | Add a compatibility probe and explicit startup diagnostics for Beads mode/flags |
| coding-agent | Seeding depended on external DB mode availability | Keep JSONL fallback path tested and documented as first-class degraded mode |

## Follow-Up Actions

- [ ] Add a lightweight startup compatibility check command in memory CLI (`bd` mode/flags sanity check).
- [ ] Add a dedicated test that forces Beads DB failure and asserts JSONL fallback behavior.
- [ ] Add CI smoke test for `init -> create -> query` on durable-memory path.
- [ ] Track Beads `compact` deprecation migration (`bd compact` to `bd admin compact`).
