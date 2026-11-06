---
paths:
  - "tools/ai-runner/**"
  - "packages/runner/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## AI-Runner-Daemon (tools/ai-runner, seit 2026-08-18)
DIE ALLOWLIST LIEGT AUF DEM MAC (`~/.config/pukalani-runner/config.json`) —
über die Naht reist nur ein `repoKey`, nie ein Pfad; erlaubte Modi/Modelle/
Budget/geschützte Branches stehen ausschliesslich dort, und ein Lauf wird
still heruntergestuft (mit Ereigniszeile) statt abgelehnt. Der Daemon fährt
genau EINEN Lauf gleichzeitig und committet SELBST (`acceptEdits` erlaubt
kein `git commit`, gemessen) — nie push, nie auf einem geschützten Branch.
`needs_input` kommt NIE aus dem Exit-Code: ein blockierter Lauf endet als
`success`/`is_error:false`; die Wahrheit steht in `permission_denials` und im
`post_turn_summary` (AI-RUNNER.md § 11, gemessen). Stirbt der Daemon mitten im
Lauf, bleibt der Lauf auf `running` — die Kur ist der Abbrechen-Knopf im
Board, kein Totmann-Zeitgeber. Server-Seite: Layer `packages/runner`
(Board-UI + Naht, Tabellen runners/runs/run_events, Capability
`runner.manage` NUR admin); Beweise: `verify-runner-boundary.mjs` (24) und
`tools/ai-runner/scripts/smoke.mjs` (46).
