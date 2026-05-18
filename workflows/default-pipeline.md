# Default Pipeline

7-step orchestration workflow describing how the role agents compose end-to-end: PM → Gameplay → Designer → QA → Coder → Evaluator → Planner.

In the workflow frame ([VISION.md](../VISION.md), [docs/plans/2026-05-17-agents-are-workflows.md](../docs/plans/2026-05-17-agents-are-workflows.md)), this pipeline becomes a Temporal parent workflow composing child workflows for each role. Each role is a workflow type; each LLM/tool call inside it is an activity. The handoffs below become workflow child-execution boundaries.

For interactive use in Claude Code, Codex, or Cursor, use the host's native subagents, planning, approvals, worktrees, and session state directly — the same role definitions ported to those tools.

---

## Agent Availability

| Step | Agent              | Agent File                       | Status    |
| ---- | ------------------ | -------------------------------- | --------- |
| 1    | PM Agent           | `agents/pm.agent`                | Available |
| 2    | Gameplay Expert    | `agents/gameplay-expert.agent`   | Available |
| 3    | Designer           | `agents/designer.agent`          | Available |
| 4    | QA Adversary       | `agents/qa-adversary.agent`      | Available |
| 5    | Coding Agent       | `agents/coding-agent.agent`      | Available |
| 6    | Evaluator Agent    | `agents/evaluator.agent`         | Available |
| 7    | Planner (MetaAgent)| `agents/metaagent.agent`         | Available |

---

## Step 1: PM Agent

- **Agent file:** [`agents/pm.agent`](../agents/pm.agent)
- **Input:** `AgentTask` with a high-level project goal.
- **Output:** `AgentResult` containing 3 concept options, 1 recommendation, MVP acceptance criteria, and risks.
- **Pass condition:** All `definition_of_done` items satisfied; findings include measurable acceptance criteria.
- **Legacy handoff:** Result is forwarded to Step 2 (Gameplay Expert) as context in a new `AgentTask`.

---

## Step 2: Gameplay Expert

- **Agent file:** [`agents/gameplay-expert.agent`](../agents/gameplay-expert.agent)
- **Input:** `AgentTask` with the PM's recommended concept and acceptance criteria in `context.user_notes`.
- **Output:** `AgentResult` with mechanics spec, core loop definition, scoring formula, and skill-depth analysis.
- **Pass condition:** Mechanics are specific enough for a coding agent to implement; scoring formula is deterministic.
- **Legacy handoff:** Result is forwarded to Step 3 (Designer).

---

## Step 3: Designer

- **Agent file:** [`agents/designer.agent`](../agents/designer.agent)
- **Input:** `AgentTask` with mechanics spec and brand constraints.
- **Output:** `AgentResult` with UI layout proposal, visual style guide, asset list, and layout risk findings.
- **Pass condition:** Layout is implementable with declared asset strategy; no unresolved brand conflicts.
- **Legacy handoff:** Result is forwarded to Step 4 (QA Adversary).

---

## Step 4: QA Adversary

- **Agent file:** [`agents/qa-adversary.agent`](../agents/qa-adversary.agent)
- **Input:** `AgentTask` with mechanics spec, UI layout, and acceptance criteria from Steps 1-3.
- **Output:** `AgentResult` with test plan, edge cases, performance guardrails.
- **Pass condition:** Every MVP acceptance criterion has at least one corresponding test case.
- **Legacy handoff:** Result is forwarded to Step 5 (Coding Agent).

---

## Step 5: Coding Agent

- **Agent file:** [`agents/coding-agent.agent`](../agents/coding-agent.agent)
- **Input:** `AgentTask` with mechanics spec, UI layout, test plan, and `limits.max_code_diff_lines` set.
- **Output:** `AgentResult` with a working vertical slice (diff or branch reference), build status, and any blockers.
- **Pass condition:** Build compiles; at least one QA test passes; diff is within `max_code_diff_lines`.
- **Legacy handoff:** Result is forwarded to Step 6 (Evaluator Agent).

---

## Step 6: Evaluator Agent

- **Agent file:** [`agents/evaluator.agent`](../agents/evaluator.agent)
- **Input:** `AgentTask` with branch/diff reference and test plan from Step 4.
- **Output:** `AgentResult` with test results, screenshots/logs, performance metrics, and a scorecard.
- **Pass condition:** Scorecard includes pass/fail for each acceptance criterion; no blocker-severity findings unresolved.
- **Legacy handoff:** Result is forwarded to Step 7 (Planner/MetaAgent).

---

## Step 7: Planner (MetaAgent)

- **Agent file:** [`agents/metaagent.agent`](../agents/metaagent.agent)
- **Input:** `AgentResult` from Step 6 (the scorecard).
- **Output:** Decision on next increment — either loop back to a specific step with refined `AgentTask`, or declare the iteration complete.
- **Pass condition:** Decision is justified with evidence from the scorecard; next `AgentTask` (if any) has clear `definition_of_done`.
- **Legacy handoff:** New `AgentTask` dispatched to the appropriate step, or pipeline terminates.
