import { describeGuardedRoute } from './support/participationHarness'

/**
 * ROLLEN-PROBEN FÜR CORE-ROUTEN (P27, OPS-009).
 *
 * Das Erwähnungs-Menü zeigt nur Menschen DIESER Community — und nur einem
 * Mitglied (`.claude/rules/editor.md`, Mitglieder-Gate vor dem
 * Publikums-Filter). Echte Handler, echte Core-Wachen (Prüfstand
 * `support/participationHarness.ts`).
 */

describeGuardedRoute('GET /api/handles/search', () => import('../server/api/handles/search.get'), 'membership', {
  query: { q: 'an' },
})
