#!/usr/bin/env bash
set -euo pipefail

AGENTS_DIR="$HOME/.agents"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/agents"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: agents/ directory not found at $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$AGENTS_DIR"

count=0
for agent_file in "$SOURCE_DIR"/*.agent; do
  [ -e "$agent_file" ] || continue

  filename="$(basename "$agent_file")"
  target="$AGENTS_DIR/$filename"

  # Skip if a non-symlink file already exists (protect manual customizations)
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "skip: $target exists and is not a symlink (manual customization preserved)"
    continue
  fi

  ln -sf "$agent_file" "$target"
  echo "link: $target -> $agent_file"
  count=$((count + 1))
done

echo "Done. $count agent(s) linked into $AGENTS_DIR"
