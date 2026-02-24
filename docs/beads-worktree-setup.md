# Beads + Worktrees Setup

This repo uses Beads for durable-memory workflows.

## Standard Flow

1. Initialize Beads in the primary repository checkout:

```bash
cd /Users/jackbishop/dev/bass-agents
bd init
```

2. Create additional working directories with Beads-aware worktree management:

```bash
bd worktree create /path/to/worktree --branch <branch-name>
```

Do not use plain `git worktree add` for Beads workflows when you need `bd` operations in the worktree.

## Important Environment Caveat (Current Machine)

The current Beads build is running in JSONL-only mode (no DB/CGO backend). In this mode, `bd worktree create` fails with:

- `Error: no beads database found`

So on this machine today, only step 1 (`bd init` in the main checkout) is executable. Step 2 requires a DB-capable Beads environment.

## Practical Workaround

Until DB-capable Beads is available:

- Run Beads commands from the primary checkout.
- Avoid standard git worktrees for Beads-dependent test flows.
- If isolation is needed, use a full clone instead of `git worktree add`.

## To Fully Enable Beads Worktrees

Use one of these:

- Beads build with embedded DB support (CGO-enabled), or
- Dolt server mode configured for Beads.
