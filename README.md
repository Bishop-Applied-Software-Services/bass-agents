# bass-agents

Portable agent definitions and agentic workflows for building great software systems.

Agent definitions live in `~/.agents/` as plain `.agent` files (markdown) so they work across tools, projects, and models. This repo is the source of truth — install once, and edits here are reflected everywhere via symlinks.

## Directory Structure

```
bass-agents/
  agents/              # Agent definition files (.agent)
    metaagent.agent    # Agent factory & orchestrator
    pm-bassai.agent    # Product Manager agent
  workflows/           # Pipeline definitions
    default-pipeline.md
  schemas/             # JSON Schema contracts
    agent-task.schema.json
    agent-result.schema.json
  install.sh           # Symlink agents into ~/.agents/
  bass-agents-spec-v0.md  # Full specification
```

## Quick Start

```bash
# Clone the repo
git clone <repo-url> && cd bass-agents

# Install agent files (symlinks into ~/.agents/)
./install.sh

# Verify
ls -la ~/.agents/
```

To use an agent, point your tool (Claude Code, Cursor, etc.) at the `.agent` file as a system prompt or context document.

## Agent File Format

Each `.agent` file is a self-contained markdown document with a standard structure:

1. **Core Definition** — domain, model affinity, primary objective
2. **Role Expectations** — what the agent must do, pass/fail criteria
3. **Output Contract** — references to the handoff schemas
4. **Tool Registry** — what tools the agent is allowed to use
5. **System Prompt** — copy/paste-ready prompt text
6. **Audit Log** — versioned history of improvements
7. **Metadata & Tags** — for discovery and filtering

## Handoff Contracts

All agents share a universal I/O contract:

- **AgentTask** (input) — `task_id`, `project`, `goal`, `definition_of_done`, plus optional `context` and `limits`. See [`schemas/agent-task.schema.json`](schemas/agent-task.schema.json).
- **AgentResult** (output) — `task_id`, `status`, `summary`, `findings`, plus optional `next_actions` and `artifacts_produced`. See [`schemas/agent-result.schema.json`](schemas/agent-result.schema.json).

This contract enables agents to hand off work to each other without custom integration.

## Shared Rules

Every agent spawned by MetaAgent must follow these constraints:

- **Ground truth**: tag claims with `evidence` type and `confidence` (0.0–1.0)
- **Small changes**: coding agents cap diffs at 300 lines per iteration
- **Deterministic output**: use fixed schemas and stable sorting
- **Safety**: no secrets in logs; flag OWASP-style issues as findings

## Creating a New Agent

1. Copy an existing `.agent` file as a template
2. Fill in all sections (Core Definition through Metadata)
3. Ensure the agent accepts `AgentTask` and produces `AgentResult`
4. Add it to `agents/` and re-run `./install.sh`

See the [full spec](bass-agents-spec-v0.md) for detailed requirements.
