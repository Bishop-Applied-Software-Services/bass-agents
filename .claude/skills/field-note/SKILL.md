---
name: field-note
description: Capture deployment learnings — what worked, what broke, which agents need tuning. Use after a deployment, testing session, or whenever you discover something worth recording.
user-invocable: true
allowed-tools: Read, Write, Glob, Bash
---

# Field Note Creator

Create a structured field note in `field-notes/`.

## Instructions

1. Read the template at `field-notes/TEMPLATE.md` to get the current structure.

2. Determine the **project name** and **slug**:
   - If the user provided arguments, parse them as `<project-name> [slug]`.
   - If no project name was given, ask the user.
   - If no slug was given, derive one from the conversation context (e.g. `initial-pipeline-run`, `auth-refactor-deploy`).

3. Create the project subdirectory if it doesn't exist:
   ```
   field-notes/<project-name>/
   ```

4. Create the field note file:
   ```
   field-notes/<project-name>/YYYY-MM-DD-<slug>.md
   ```
   Use today's date.

5. Fill in every section of the template by asking the user about their session:
   - **Summary**: What happened overall?
   - **Project Context**: Stack, stage, goal for the session.
   - **What Worked**: Successes, smooth handoffs, useful outputs.
   - **What Didn't**: Friction, failures, wasted cycles.
   - **Agent-Specific Observations**: Which agents were involved? How did each perform? What needs tuning?
   - **Follow-Up Actions**: Concrete next steps.

6. Write the completed field note. Show the user the file path when done.

## Arguments

$ARGUMENTS = `<project-name> [slug]`

Examples:
- `/field-note acme-app initial-pipeline-run`
- `/field-note acme-app` (slug will be derived from context)
- `/field-note` (will ask for project name)
