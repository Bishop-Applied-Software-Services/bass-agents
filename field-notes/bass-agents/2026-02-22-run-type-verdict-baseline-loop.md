# Field Note: Run-Type Verdict + Baseline Loop

**Date:** 2026-02-22
**Project:** bass-agents
**Pipeline run:** session review hardening (`run-with-bass-agents.sh`, `session-review-checkpoint.sh`)
**Author:** Codex

## Summary

We moved session review from ad-hoc scoring to an operational loop with explicit run categories (`smoke|workflow|real`), per-type verdict thresholds, and baseline deltas over the last 5 similar runs. We also added a CI gate policy so `workflow/real` runs fail when verdict is `fail`, while `smoke` remains non-blocking.

## Project Context

- **Stack / domain:** Bash + Python CLI tooling for cross-provider agent session analysis
- **Stage:** hardening and operability
- **Goal for this session:** convert review output into actionable iteration gates for token efficiency work

## What Worked

- `run_type` is now propagated end-to-end (wrapper, reviewer, checkpoint, trend rows).
- Verdict policy is explicit and machine-enforceable (`pass|warn|fail`).
- Baseline deltas now compare against last 5 similar runs by project/source/run type.
- Baseline seeding runs completed quickly (5 smoke, 3 workflow, 3 real).
- CI gate script behaved correctly in tests: workflow pass, real fail, smoke non-blocking.

## What Didn't

- Legacy trend rows lacked `run_type`/`verdict`; migration had to support multiple prior schemas.
- Some old `real` rows remain empty-verdict history, so first-week comparisons should prefer recent rows.
- `High tokens per message` driver still uses total tokens/message and can overstate cache-heavy sessions.

## Agent-Specific Observations

| Agent | Observation | Action Item |
|-------|-------------|-------------|
| evaluator | Needed explicit policy outputs, not just scores | Keep verdict checks first-class in report and CI |
| coding-agent | Iteration speed improved when using known session IDs for deterministic replay | Continue using fixed session IDs for baseline seeding |
| qa-adversary | Legacy CSV schema drift created hidden reliability risk | Keep schema migration logic and test with old/new headers |

## Follow-Up Actions

- [x] Add `run_type` (`smoke|workflow|real`) and verdict thresholds to review pipeline.
- [x] Add baseline delta section (`last 5 similar runs`) to reports.
- [x] Add CI verdict gate script and checkpoint `--enforce-verdict` option.
- [ ] Rework `High tokens per message` driver to use uncached tokens/message for better attribution.
