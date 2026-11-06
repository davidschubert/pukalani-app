import { communitySeoSchema } from '../../../schemas/seo'
import type { CommunitySeoSettings } from '../../../../core/shared/communitySeo'
import { normalizeSeoDescription } from '../../../../core/shared/communitySeo'

/**
 * Den SUCHEINTRAG dieser Community speichern (U15 Teil 2).
 *
 * ── AUTORISIERUNG: `branding.manage`, KEINE NEUE CAPABILITY ───────────────
 * Dieselbe wie Erscheinungsbild (F5) und Menü (Teil 1) — owner + admin. Wie
 * eine Community in der Suche erscheint, ist eine Entscheidung ÜBER den
 * Auftritt, keine Redaktion an einem Text. BEWUSST NICHT `pages.manage`: das
 * trägt auch der EDITOR, und wer eine Seite schreiben darf, soll nicht die
 * ganze Community aus Google nehmen können — das ist die folgenreichste
 * Einstellung dieser Fläche und die am schwersten rückgängig zu machende
 * (zurück kommt sie erst nach dem nächsten Crawl).
 *
 * ── WARUM KEINE SERVICE-NAHT INS CONTROL PLANE ────────────────────────────
 * Wie beim Menü: die WAHRHEIT liegt im RUNTIME-Projekt, nicht in `communities`.
 * Es gibt nichts, wofür ein Secret, ein JWT und ein zweiter Dienst gebraucht
 * würden — die Route schreibt die Zeile selbst und ist danach fertig.
 *
 * ── DER STORE LIEGT IN core, DIE ROUTE HIER ───────────────────────────────
 * Und das ist kein Zufall, sondern die Aufteilung aus A14: den LESER besitzt
 * core (`useLocaleSeoHead` ist der eine Kopf-Aufruf, Begründung in
 * `core/server/utils/communitySeoStore.ts`), die BEDIENUNG der pages-Layer,
 * dem die „Website"-Gruppe gehört. Diese Route ist die Naht dazwischen — sie
 * autorisiert und validiert, das Schreiben selbst tut der Store.
 *
 * ── ES WIRD GESPEICHERT, WAS ANKOMMT, ABER GEPUTZT ────────────────────────
 * `normalizeSeoDescription` läuft VOR dem Schreiben und nicht erst beim Lesen.
 * Sonst stünde in der Zeile ein Text mit Absätzen, den der Editor beim
 * nächsten Öffnen anders anzeigt als die Vorschau ihn rechnet — und der Owner
 * sähe eine Änderung, die er nicht gemacht hat. Gespeichert wird das, was
 * gilt.
 */
export default defineEventHandler(async (event): Promise<CommunitySeoSettings> => {
  await requireCommunityPermission(event, 'branding.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, deren Sucheintrag man
  // einstellen könnte (Silo-App, Kontroll-Host, Single-Tenant) — 404 wie eine
  // fehlende Route, dieselbe Antwort wie bei `PATCH /api/pages/navigation`.
  // Seit 2026-09-08 dieselbe Row-Id-Regel wie Navigation und Weiterleitungen
  // (core/shared/communitySettingsRow.ts): im Silo speichert die INSTANZ
  // (`instance`) — vorher war die Id dort leer und jedes Speichern ein 404.
  // Nur der Kontroll-Host bleibt ohne Zeile.
  const rowId = communitySettingsRowIdFor(event)
  if (!rowId) throw createError({ status: 404, statusText: 'Not found' })

  const body = await readValidatedBody(event, communitySeoSchema.parse)

  const settings: CommunitySeoSettings = {
    metaDescription: normalizeSeoDescription(body.metaDescription),
    noindex: body.noindex,
  }
  await writeCommunitySeo(event, rowId, settings)

  // Die Antwort ist der GESPEICHERTE Zustand — die Seite übernimmt ihn daraus,
  // statt ihn sich zusammenzureimen (Muster navigation.patch.ts). Hier trägt
  // das zusätzlich: die Beschreibung kann sich beim Putzen geändert haben.
  return settings
})
