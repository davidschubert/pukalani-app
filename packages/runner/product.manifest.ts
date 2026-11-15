import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * AI-Runner (Konzept: docs/plans/AI-RUNNER.md) — die Ausführungs-Schicht:
 * ein Ticket (oder später ein Roadmap-Eintrag, ein GitHub-Issue) wird als
 * Claude-Code-Lauf auf einem registrierten Rechner ausgeführt.
 *
 * Der Titel ist ein EIGENNAME und deshalb de = en (wie „Aloha" bei den
 * Themes) — er heißt in beiden Sprachen „AI-Runner".
 */
export default {
  key: 'runner',
  tier: 'optional',
  hasMigrations: true,
  // Schema-Probe (OPS-008): runner-003 legt runs.resumeSessionId an.
  schema: { latest: '003', probe: { migration: '003', table: 'runs', column: 'resumeSessionId' } },
  apiPrefixes: ['/api/runner'],
  title: { en: 'AI-Runner', de: 'AI-Runner' },
  description: {
    en: 'Runs tickets as Claude Code runs on a registered runner.',
    de: 'Führt Tickets als Claude-Code-Läufe auf einem registrierten Runner aus.',
  },
  icon: 'i-ph-rocket-launch',
} satisfies ProductManifest
