# Project-local Claude/Codex custom agent setup from one repo

I just finished wiring `bass-agents` so a project can generate and install its own Claude Code and Codex custom agents locally instead of relying on global hand setup.

What changed:

- `bass-agents init` now exports project-local agent bundles under `.bass-agents/custom-agents/`
- Claude gets ready-to-copy `AGENT.md` subagents
- Codex gets a multi-agent `.codex/config.toml` plus per-agent TOML configs
- `bass-agents install-custom-agents` installs those bundles into project or user config roots
- interactive `init` now asks whether to install the generated custom agents right away

The useful part was treating only the generated `bass-*` / `bass_*` agents as managed. For Codex, the installer merges a fenced `bass-agents` block into `.codex/config.toml` instead of overwriting the user's whole config.

That keeps the repo as the source of truth for agent definitions, while still fitting the way Claude Code and Codex expect local custom-agent config.

If people want it, I can turn this into a more detailed write-up on:

1. deriving Claude/Codex configs from a shared portable agent format
2. safely merging managed agent config into existing local tool config
3. when project-local agents are better than global `~/.claude` / `~/.codex` setup
