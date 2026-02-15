# Default Pipeline

The standard 7-step orchestration workflow for bass-agents. MetaAgent runs this pipeline unless overridden by an explicit task directive.

---

## Agent Availability

| Step | Agent              | Agent File                  | Status    |
| ---- | ------------------ | --------------------------- | --------- |
| 1    | PM Agent           | `agents/pm-bassai.agent`    | Available |
| 2    | Gameplay Expert    | —                           | Pending   |
| 3    | Designer           | —                           | Pending   |
| 4    | QA Adversary       | —                           | Pending   |
| 5    | Coding Agent       | —                           | Pending   |
| 6    | Evaluator Agent    | —                           | Pending   |
| 7    | Planner (MetaAgent)| `agents/metaagent.agent`    | Available |

---

## Step 1: PM Agent

- **Agent file:** [`agents/pm-bassai.agent`](../agents/pm-bassai.agent)
- **Input:** `AgentTask` with a high-level project goal (e.g. "make a game for bass.ai").
- **Output:** `AgentResult` containing 3 concept options, 1 recommendation, MVP acceptance criteria, and risks.
- **Pass condition:** All `definition_of_done` items satisfied; findings include measurable acceptance criteria.
- **Handoff:** Result is forwarded to Step 2 (Gameplay Expert) as context in a new `AgentTask`.

---

## Step 2: Gameplay Expert

- **Agent file:** *Pending creation*
- **Input:** `AgentTask` with the PM's recommended concept and acceptance criteria in `context.user_notes`.
- **Output:** `AgentResult` with mechanics spec, core loop definition, scoring formula, and skill-depth analysis.
- **Pass condition:** Mechanics are specific enough for a coding agent to implement; scoring formula is deterministic.
- **Handoff:** Result is forwarded to Step 3 (Designer).

---

## Step 3: Designer

- **Agent file:** *Pending creation*
- **Input:** `AgentTask` with mechanics spec and brand constraints.
- **Output:** `AgentResult` with UI layout proposal, visual style guide, asset list, and layout risk findings.
- **Pass condition:** Layout is implementable with free assets; no unresolved brand conflicts.
- **Handoff:** Result is forwarded to Step 4 (QA Adversary).

---

## Step 4: QA Adversary

- **Agent file:** *Pending creation*
- **Input:** `AgentTask` with mechanics spec, UI layout, and acceptance criteria from Steps 1-3.
- **Output:** `AgentResult` with test plan, edge cases, performance guardrails (FPS floor, input latency, hitbox checks).
- **Pass condition:** Every MVP acceptance criterion has at least one corresponding test case.
- **Handoff:** Result is forwarded to Step 5 (Coding Agent).

---

## Step 5: Coding Agent

- **Agent file:** *Pending creation*
- **Input:** `AgentTask` with mechanics spec, UI layout, test plan, and `limits.max_code_diff_lines` set.
- **Output:** `AgentResult` with a working vertical slice (diff or branch reference), build status, and any blockers.
- **Pass condition:** Build compiles; at least one QA test passes; diff is within `max_code_diff_lines`.
- **Handoff:** Result is forwarded to Step 6 (Evaluator Agent).

---

## Step 6: Evaluator Agent

- **Agent file:** *Pending creation*
- **Input:** `AgentTask` with branch/diff reference and test plan from Step 4.
- **Output:** `AgentResult` with test results, screenshots/logs, performance metrics, and a scorecard.
- **Pass condition:** Scorecard includes pass/fail for each acceptance criterion; no blocker-severity findings unresolved.
- **Handoff:** Result is forwarded to Step 7 (Planner/MetaAgent).

---

## Step 7: Planner (MetaAgent)

- **Agent file:** [`agents/metaagent.agent`](../agents/metaagent.agent)
- **Input:** `AgentResult` from Step 6 (the scorecard).
- **Output:** Decision on next increment — either loop back to a specific step with refined `AgentTask`, or declare the iteration complete.
- **Pass condition:** Decision is justified with evidence from the scorecard; next `AgentTask` (if any) has clear `definition_of_done`.
- **Handoff:** New `AgentTask` dispatched to the appropriate step, or pipeline terminates.
