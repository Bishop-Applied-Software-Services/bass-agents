# Session Review Reports

Store generated session-review outputs here for historical tracking.

Convention:
- One folder per project (`session-reviews/<project>/`)
- One file per review run (`YYYY-MM-DD-<tool>-session-review-HHMMSS.{md|json}`)

Example:
- `session-reviews/bass.ai/2026-02-22-claude-session-review-112115.md`

Dashboard:
- Build static dashboard HTML from all project trend/report data:
  - `bass-agents dashboard`
- Launch terminal dashboard:
  - `bass-agents dashboard --tui`
- Default output:
  - `session-reviews/dashboard.html`
