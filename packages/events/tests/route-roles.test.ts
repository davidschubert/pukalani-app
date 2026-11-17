import { rejectOversizedUpload } from '../../core/server/utils/uploadSize'
import { describeRoleGatedRoute } from '../../core/tests/support/participationHarness'

/**
 * ROLLEN-PROBEN FÜR TERMINE — DIE ROLLEN-TORE (P27, OPS-009).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`). Die Probe endet an der
 * Datentür: geprüft wird, wer VOR ihr abgewiesen wird und wer durchkommt.
 *
 * Die Erwartungen stehen hier Person für Person ausgeschrieben, abgelesen aus
 * der Rechte-Matrix (`core/shared/communityAuthz.ts`) — nie berechnet:
 *  - `events.manage`   (Termine verfassen): Editor, Admin, Owner; der
 *    Betreiber im protokollierten Not-Zugang. Der Moderator NICHT — er urteilt
 *    über fremde Termine, er verfasst keine.
 *  - `events.moderate` (über fremde Termine urteilen): Moderator, Admin, Owner;
 *    der Betreiber im Not-Zugang. Der Editor NICHT.
 *
 * Lesende Routen, der Erinnerungs-Lauf und das Übersetzen stehen in
 * `route-roles-reads.test.ts`.
 */

const MANAGE = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
} as const

const MODERATE = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
} as const

const NEW_EVENT = {
  title: 'Treffen',
  description: 'Wir treffen uns.',
  startAt: '2026-12-01T18:00:00.000Z',
}

// ── events.manage ───────────────────────────────────────────────────────────

describeRoleGatedRoute('POST /api/events', () => import('../server/api/events/index.post'), MANAGE, {
  body: NEW_EVENT,
})

describeRoleGatedRoute('PATCH /api/events/:id', () => import('../server/api/events/[id].patch'), MANAGE, {
  params: { id: 'e-1' }, body: { title: 'Neuer Titel' },
})

describeRoleGatedRoute('DELETE /api/events/:id (absagen)', () => import('../server/api/events/[id].delete'), MANAGE, {
  params: { id: 'e-1' },
})

describeRoleGatedRoute('DELETE /api/events/:id/series', () => import('../server/api/events/[id]/series.delete'), MANAGE, {
  params: { id: 'e-1' },
})

describeRoleGatedRoute('GET /api/events/manage', () => import('../server/api/events/manage.get'), MANAGE)

describeRoleGatedRoute('GET /api/events/:id/cover (Vorschau)', () => import('../server/api/events/[id]/cover.get'), MANAGE, {
  params: { id: 'e-1' },
})

// Die Wache steht VOR dem Einlesen der hochgeladenen Datei: die Probe endet an
// der Datentür, bevor `readMultipartFormData` gebraucht würde. Die frühe
// Größen-Prüfung davor läuft echt mit (kleine angegebene Länge).
describeRoleGatedRoute('POST /api/events/:id/cover', () => import('../server/api/events/[id]/cover.post'), MANAGE, {
  params: { id: 'e-1' },
  globals: { rejectOversizedUpload, getRequestHeader: () => '128' },
})

describeRoleGatedRoute('DELETE /api/events/:id/cover', () => import('../server/api/events/[id]/cover.delete'), MANAGE, {
  params: { id: 'e-1' },
})

// ── events.moderate ─────────────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/events/moderation', () => import('../server/api/events/moderation.get'), MODERATE)

describeRoleGatedRoute('POST /api/events/:id/hide', () => import('../server/api/events/[id]/hide.post'), MODERATE, {
  params: { id: 'e-1' },
})

describeRoleGatedRoute('POST /api/events/:id/restore', () => import('../server/api/events/[id]/restore.post'), MODERATE, {
  params: { id: 'e-1' },
})

describeRoleGatedRoute('POST /api/events/:id/redact', () => import('../server/api/events/[id]/redact.post'), MODERATE, {
  params: { id: 'e-1' },
})
