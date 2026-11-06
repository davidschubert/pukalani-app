import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { communityNavigationSchema } from '../../../schemas/navigation'
import { isCustomNavLinkId } from '../../../../core/shared/communityNavigation'
import type { CommunityNavOverride } from '../../../../core/shared/communityNavigation'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/**
 * Das MENÜ dieser Community speichern (U15 Teil 1).
 *
 * ── AUTORISIERUNG: `branding.manage`, KEINE NEUE CAPABILITY ───────────────
 * Dieselbe wie das Erscheinungsbild (F5) — owner + admin. Ein Menü ist eine
 * GESTALTUNGS-Entscheidung über die öffentliche Seite, keine Redaktion: es
 * bestimmt, was eine Community überhaupt anbietet und wie sie es nennt.
 * BEWUSST NICHT `pages.manage`: das trägt auch der EDITOR, und wer einen Text
 * schreiben darf, soll nicht die Struktur der ganzen Website umstellen oder
 * fremde Produkte aus dem Kopf nehmen können. Eine eigene Capability
 * (`community.navigation`) wäre eine dritte Zeile in der Rollen-Matrix für
 * genau die Rollen-Menge, die `branding.manage` schon beschreibt — CLAUDE.md:
 * keine neue Capability ohne Not.
 *
 * ── WARUM KEINE SERVICE-NAHT INS CONTROL PLANE ────────────────────────────
 * Anders als Branding, Registrierung und Team: die WAHRHEIT liegt hier im
 * RUNTIME-Projekt, nicht in `communities`. Es gibt also nichts, wofür ein
 * Secret, ein JWT und ein zweiter Dienst gebraucht würden — die Route schreibt
 * die Zeile selbst und ist danach fertig. Kein Spiegel, keine
 * Zwei-Deployment-Choreografie, kein optionales Feld gegen Versions-Drift.
 *
 * ── DIE ZWEITE PRÜFUNG, DIE DAS SCHEMA NICHT MACHEN KANN ──────────────────
 * Ob ein interner Link auf eine Seite zeigt, die es in DIESER Community
 * wirklich gibt. Das Schema kennt nur die FORM eines Pfads; die Liste der
 * veröffentlichten Seiten steht in der Datenbank. Ohne diese Prüfung könnte
 * ein Owner (oder ein manipulierter Request) beliebige interne Pfade ins Menü
 * legen — der Kopf der Community bewürbe dann Adressen, die 404 antworten,
 * oder Bereiche, die sein Tarif nicht enthält.
 *
 * Erlaubt sind: `/` (die Startseite) und `/<slug>` jeder VERÖFFENTLICHTEN
 * Seite dieser Community. BEWUSST NICHT die Pfade der Produkte (`/discussions`,
 * `/events`): die stehen als Registry-Einträge ohnehin im Menü und lassen sich
 * dort umbenennen und umsortieren — ein eigener Link dorthin wäre ein zweiter
 * Weg zu demselben Ziel, mit dem Unterschied, dass er das Tarif-Gate der
 * Registry nicht trägt.
 */
export default defineEventHandler(async (event): Promise<CommunityNavOverride> => {
  await requireCommunityPermission(event, 'branding.manage')

  /**
   * WESSEN MENÜ WIRD HIER GESCHRIEBEN (U15 Teil 3, 2026-09-08)?
   *
   * Hier stand `useTenant(event)?.communityId`, und damit antwortete diese
   * Route in JEDER Silo-App 404 — auf branding.supply und
   * comments.pukalani.app konnte der Betreiber sein eigenes Menü nie speichern,
   * obwohl der Reiter im Dashboard stand. `communityNavRowId()` (core) kennt
   * den Fall: dort ist die INSTANZ der Besitzer (`'instance'`).
   *
   * 404 bleibt genau für den Fall, für den es gedacht war — den KONTROLL-HOST
   * der Pool-App: dort gibt es keine Community, deren Menü jemand wählen
   * dürfte, und die Antwort ist dieselbe wie bei `PATCH /api/community/branding`.
   */
  const rowId = communitySettingsRowIdFor(event)
  if (!rowId) throw createError({ status: 404, statusText: 'Not found' })

  const body = await readValidatedBody(event, communityNavigationSchema.parse)

  const internalTargets = body.entries.filter(
    entry => isCustomNavLinkId(entry.id) && entry.external !== true && entry.to,
  )
  if (internalTargets.length) {
    const allowed = await publishedPagePaths(event)
    for (const entry of internalTargets) {
      if (!allowed.has(entry.to!)) {
        throw createError({
          status: 400,
          statusText: 'Unknown page',
          data: { code: 'unknown_page' },
        })
      }
    }
  }

  await writeCommunityNavOverride(event, rowId, body)

  // Die Antwort ist der GESPEICHERTE Zustand — die Seite übernimmt ihn daraus,
  // statt ihn sich zusammenzureimen (Muster registration.patch.ts).
  return body
})

/** `/` + `/<slug>` aller veröffentlichten Seiten DIESER Community. */
async function publishedPagePaths(event: H3Event): Promise<Set<string>> {
  // Durch die Datentür (Pflicht in `server/api/**`): `as: 'operator'`, weil
  // `pages`-Rows keine Row-Permissions tragen — dieselbe Klinke wie
  // `/api/pages/public`. `actor: 'operator'` ist hier richtig und nicht bloss
  // geerbt: gelesen wird, um eine OWNER-EINSTELLUNG zu prüfen; das ist kein
  // Inhalt (M13 greift nicht) und macht niemanden zum Mitglied (A5).
  const res = await tenantDb(event, { as: 'operator', actor: 'operator' }).list<PageRow>(PAGES_TABLE, [
    Query.equal('status', 'published'),
    Query.limit(100),
  ])
  const paths = new Set<string>(['/'])
  for (const row of res.rows) paths.add(`/${row.slug}`)
  return paths
}
