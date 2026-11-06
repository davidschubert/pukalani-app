import type { CommunityNavOverride } from '../../../../core/shared/communityNavigation'
import { emptyCommunityNavOverride } from '../../../../core/shared/communityNavigation'

/**
 * Öffentlich: die MENÜ-WAHL dieser Community (U15 Teil 1).
 *
 * Der Konsument ist das blueprint-Layout, das sie beim SSR-Aufbau holt und
 * über `resolveCommunityNav` auf seine registrierten Einträge legt. Die Antwort
 * ist bewusst ROH (die gespeicherte Wahl, nicht das fertige Menü): das Layout
 * ist die einzige Stelle, die weiss, welche Einträge ihre Gates überlebt
 * haben, und die Reihenfolge dieser beiden Schritte ist die Zusage, dass ein
 * Override nichts freischalten kann.
 *
 * WESSEN MENÜ, ENTSCHEIDET `communityNavRowId()` (U15 Teil 3, 2026-09-08). Hier
 * stand vorher `useTenant(event)?.communityId`, und damit gab es in JEDER
 * Silo-App (branding, comments, portfolio, photos) kein Menü — der Bauplan
 * galt dort unverändert, obwohl der Editor im Dashboard sichtbar war. Jetzt ist
 * die Instanz dort selbst der Besitzer (`'instance'`); ohne Besitzer bleibt nur
 * noch der KONTROLL-HOST der Pool-App, und dort ist das leere Dokument die
 * richtige Antwort: es gibt keine Community, deren Menü man wählen könnte.
 *
 * DIE PUBLIKUMS-FRAGE, und warum sie hier so beantwortet ist wie nebenan:
 * `assertCommunityContentReadable` steht auch vor `/api/pages/public`, und
 * beide Antworten fliessen in DENSELBEN Seitenkopf. Ohne diese Zeile sähe ein
 * Gast einer geschlossenen Community ihr eigenes Menü, aber weiterhin keine
 * ihrer Seiten — zwei Regeln für eine Fläche. Die Folge ist gutartig: er
 * bekommt 404, das Layout fängt es ab und zeigt das Menü aus dem Bauplan (der
 * dokumentierte Normalfall „keine eigene Wahl").
 *
 * UND SEIT DEM 2026-08-13 SCHÜTZT SIE AUCH ETWAS. Solange die Tabelle
 * `read(any)` trug, war diese Zeile bloss Gleichschritt — wer die Zeile wollte,
 * holte sie sich direkt bei Appwrite. Mit `permissions: []` (system-033,
 * Least Privilege) ist DIESE ROUTE der einzige Weg nach draussen, und damit ist
 * ihre Publikums-Prüfung die einzige, die es gibt. Wer sie entfernt, macht das
 * Menü jeder geschlossenen Community wieder öffentlich.
 */
export default defineEventHandler(async (event): Promise<CommunityNavOverride> => {
  assertCommunityContentReadable(event, 'Navigation not found')

  const rowId = communitySettingsRowIdFor(event)
  if (!rowId) return emptyCommunityNavOverride()

  const override = await readCommunityNavOverride(event, rowId)
  return override ?? emptyCommunityNavOverride()
})
