# bass-agents

Portable agent definitions and agentic workflows. Agent files live in `agents/` as `.agent` markdown files.

## Key Paths

- `agents/` — Agent definition files (.agent)
- `workflows/` — Pipeline definitions
- `schemas/` — JSON Schema contracts (AgentTask, AgentResult)
- `field-notes/` — Deployment learnings and feedback loop
- `bass-agents-spec-v0.md` — Full specification

## Field Notes

We capture deployment learnings in `field-notes/` to create a feedback loop from real usage back into agent improvements.

- **Template**: `field-notes/TEMPLATE.md`
- **Convention**: one folder per project, one file per session (`YYYY-MM-DD-<slug>.md`)
- **Skill**: use `/field-note <project> [slug]` to create an entry interactively

After significant deployments, testing sessions, or when you discover something worth recording about agent behavior, suggest creating a field note.
