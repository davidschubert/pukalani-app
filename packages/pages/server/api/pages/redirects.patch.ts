import { communityRedirectsSchema } from '../../../schemas/redirects'
import type { CommunityRedirectConfig, CommunityRedirectRule } from '../../../../core/shared/communityRedirects'
import { normalizeRedirectRule } from '../../../../core/shared/communityRedirects'

/**
 * Die WEITERLEITUNGEN dieser Community speichern (U15 Teil 3).
 *
 * ── AUTORISIERUNG: `branding.manage`, KEINE NEUE CAPABILITY ───────────────
 * Dieselbe wie Erscheinungsbild (F5), Menü (Teil 1) und Sucheintrag (Teil 2) —
 * owner + admin. Eine Weiterleitung ist eine Entscheidung über die STRUKTUR
 * der öffentlichen Adressen, keine Redaktion an einem Text. BEWUSST NICHT
 * `pages.manage`: das trägt auch der EDITOR, und wer eine Seite schreiben darf,
 * soll nicht bestimmen können, wohin ein Besucher geschickt wird, bevor die
 * Seite überhaupt lädt. Diese Fläche ist von den vieren die einzige, die den
 * Besucher WEGSCHICKT — sie gehört zur engsten Rollenmenge, die es für den
 * Auftritt gibt, nicht zu einer weiteren.
 *
 * ── WARUM KEINE SERVICE-NAHT INS CONTROL PLANE ────────────────────────────
 * Wie bei Menü und Sucheintrag: die WAHRHEIT liegt im RUNTIME-Projekt, nicht
 * in `communities`. Es gibt nichts, wofür ein Secret, ein JWT und ein zweiter
 * Dienst gebraucht würden — die Route schreibt die Zeile selbst.
 *
 * ── DER STORE LIEGT IN core, DIE ROUTE HIER ───────────────────────────────
 * Die Aufteilung aus A14: den LESER besitzt core (die Middleware
 * `01.community-redirect.ts` leitet um, bevor irgendetwas rendert), die
 * BEDIENUNG der pages-Layer, dem die „Website"-Gruppe gehört. Diese Route ist
 * die Naht dazwischen — sie autorisiert und validiert, das Schreiben tut der
 * Store.
 *
 * ── ES WIRD GESPEICHERT, WAS ANKOMMT, ABER NORMALISIERT ───────────────────
 * `normalizeRedirectRule` läuft VOR dem Schreiben: `/alt/` wird zu `/alt`.
 * Sonst stünde in der Zeile eine Form, die der Editor beim nächsten Öffnen
 * anders anzeigt als die Regel sie vergleicht — und der Owner sähe eine
 * Änderung, die er nicht gemacht hat. Gespeichert wird das, was gilt (Muster
 * `seo.patch.ts`).
 */
export default defineEventHandler(async (event): Promise<CommunityRedirectConfig> => {
  await requireCommunityPermission(event, 'branding.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, deren Adressen man umlenken
  // könnte (Silo-App, Kontroll-Host, Single-Tenant) — 404 wie eine fehlende
  // Route, dieselbe Antwort wie bei `PATCH /api/pages/navigation` und
  // `PATCH /api/pages/seo`.
  // Seit 2026-09-08 dieselbe Row-Id-Regel wie Navigation und Sucheintrag
  // (core/shared/communitySettingsRow.ts): im Silo speichert die INSTANZ
  // (`instance`) — vorher war die Id dort leer und jedes Speichern ein 404.
  const rowId = communitySettingsRowIdFor(event)
  if (!rowId) throw createError({ status: 404, statusText: 'Not found' })

  const body = await readValidatedBody(event, communityRedirectsSchema.parse)

  const config: CommunityRedirectConfig = {
    rules: body.rules.map((rule): CommunityRedirectRule => normalizeRedirectRule(rule)),
  }
  await writeCommunityRedirects(event, rowId, config)

  // Die Antwort ist der GESPEICHERTE Zustand — die Seite übernimmt ihn daraus,
  // statt ihn sich zusammenzureimen (Muster navigation.patch.ts). Hier trägt
  // das zusätzlich: die Pfade können beim Normalisieren anders geworden sein.
  return config
})
