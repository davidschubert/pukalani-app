import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import {
  COMMUNITY_NAVIGATION_TABLE,
  type CommunityNavOverride,
  parseCommunityNavOverride,
} from '../../../core/shared/communityNavigation'

/**
 * DIE ABLAGE DES COMMUNITY-MENÜS (U15 Teil 1) — lesen, schreiben, vergessen.
 *
 * ── ES LIEST NIEMAND, ES WIRD GELESEN ─────────────────────────────────────
 * `community_navigation` trägt seit Davids Entscheidung vom 2026-08-13
 * **keinerlei Client-Rechte** (`permissions: []`, system-033). Kein Besucher,
 * kein Mitglied und kein Owner kommt an die Zeile — der SERVER liest sie beim
 * Seitenaufbau und rendert das Ergebnis ins HTML. Beide Zugriffe hier laufen
 * deshalb mit dem ADMIN-Client, und beide in der Haltung, die die Datentür
 * `as: 'operator', actor: 'operator'` nennt: es handelt kein Mensch, es
 * arbeitet das System. Daran hängt, was `actor: 'operator'` überall sonst
 * bedeutet — keine M13-Inhaltssperre (das ist kein Inhalt) und kein
 * A5-Beitritt (ein Owner, der sein Menü sortiert, tritt nichts bei).
 *
 * ── WARUM NICHT DURCH `tenantDb()`, obwohl die Haltung dieselbe ist ───────
 * Weil die Tür an dieser Zeile keinen Angriffspunkt hat, und zwar buchstäblich:
 * `tenantDb().get()` prüft mit `rowBelongsToTenant`, ob `row.communityId` zum
 * Mandanten passt — diese Tabelle hat aber gar keine `communityId`-Spalte,
 * ihre **rowId IST der Besitzer** (Form von `community_branding`, system-028).
 * Die Prüfung fiele damit fail-closed auf JEDE Zeile aus. Eine Spalte
 * nachzuziehen, nur damit die Tür etwas prüfen kann, was die rowId schon sagt,
 * wäre eine zweite Wahrheit über denselben Mandanten — genau die Sorte
 * Doppelablage, die auseinanderläuft.
 *
 * SEIT U15 TEIL 3 (2026-09-08) IST DER BESITZER NICHT MEHR IMMER EINE
 * COMMUNITY: in einer Silo-App gibt es keinen Mandanten, und die INSTANZ hält
 * ihr eigenes Menü unter der rowId `'instance'` (gerechnet von
 * `communityNavRowId()` in core/shared/communityNavigation.ts — dort steht die
 * ganze Begründung samt der dritten Möglichkeit „gar kein Besitzer"). Beide
 * Funktionen hier nehmen deshalb eine **rowId** und keine communityId; das
 * Rechnen bleibt bei den Routen, diese Datei legt nur ab.
 *
 * DIE MANDANTEN-GRENZE GEHT DADURCH NICHT VERLOREN, sie liegt nur woanders:
 * die rowId kommt in BEIDEN Richtungen aus `useTenant(event)`, also aus der
 * Host-Auflösung des Servers — NIE aus dem Aufrufer. Eine fremde Community
 * ist nicht adressierbar, unabhängig davon, was im Body steht. Zusätzlich
 * hätte `tenantDb().create` Row-Permissions gesetzt, die auf einer Tabelle
 * ohne Client-Rechte nichts zu suchen haben.
 *
 * Die ESLint-Regel gegen rohes `.tablesDB` zielt auf `server/api/**` und
 * `server/plugins/**` (Request-Routen); diese Datei liegt bewusst in
 * `server/utils/**` — dieselbe Stelle wie der Branding-Spiegel.
 *
 * ── KEIN `upsertRow` ──────────────────────────────────────────────────────
 * UPDATE, bei 404 CREATE. Appwrite 1.9.6 schreibt bei `upsertRow` korrekt,
 * PUBLIZIERT dafür aber KEIN Realtime-Event (live erwischt am 2026-08-01, D6).
 * Heute liest ohnehin nur der Server, das Menü käme also auch mit `upsertRow`
 * an — aber der Weg zur Live-Propagation soll offen bleiben, und der besteht
 * dann aus GENAU einer Ergänzung (`read(any)` an der Tabelle, s. system-033).
 * Ein `upsertRow` hier machte diese eine Zeile wirkungslos, ohne dass jemand
 * den Zusammenhang sähe. Zwei Aufrufe statt einem sind der Preis dafür.
 */

const TTL_MS = 30_000

/**
 * Microcache des Menüs.
 *
 * USER-AGNOSTISCH, und das ist die Bedingung (CLAUDE.md „Microcache"): das Menü
 * ist für jeden Besucher dasselbe — Anmeldung, Rolle und Tarif filtern es ERST
 * im Layout, aus Daten, die nie durch diesen Cache gehen. Hier liegt
 * ausschliesslich die gespeicherte Wahl des Owners.
 *
 * SCHLÜSSEL = MANDANT (`tenantCacheScope`). Pflicht: im Pool teilen sich alle
 * Communities einen Prozess, ein ungescopter Schlüssel gäbe Kunde A das Menü
 * von Kunde B — genau die Falle, die `publicPagesCache` daneben beschreibt.
 * Ohne Mandant liefert er den festen Schlüssel `'single'`, und das passt genau
 * zur `instance`-Zeile (U15 Teil 3): eine Silo-App hat einen Prozess, ein
 * Projekt und ein Menü.
 *
 * `null` WIRD MITGECACHT, und das ist der wichtigere Teil: die allermeisten
 * Communities haben keine Row. Ohne negatives Caching kostete JEDER
 * Seitenaufbau jeder Community einen Appwrite-404.
 */
const cache = createMicrocache<CommunityNavOverride | null>(TTL_MS)

function isRowNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

/**
 * Die gespeicherte Wahl dieses Besitzers — oder `null` („keine eigene Wahl").
 *
 * FAIL-SOFT, und zwar absichtlich bis zur letzten Zeile: fehlende Tabelle
 * (Instanz ohne system-033), fehlende Row, kaputtes JSON, Appwrite gerade nicht
 * erreichbar — alles endet in `null`, und `null` heisst „Menü wie vor U15".
 * Ein Fehler hier nähme einer Community ihren gesamten Seitenkopf, für eine
 * Bequemlichkeit. Geloggt wird trotzdem, sonst wäre ein dauerhaft kaputter
 * Lesepfad unsichtbar.
 */
export async function readCommunityNavOverride(
  event: H3Event,
  rowId: string,
): Promise<CommunityNavOverride | null> {
  if (!rowId) return null
  const key = tenantCacheScope(event)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let override: CommunityNavOverride | null = null
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const row = await admin.tablesDB.getRow<Models.Row & { config?: string }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMUNITY_NAVIGATION_TABLE,
      rowId,
    })
    override = parseCommunityNavOverride(row.config)
  }
  catch (error) {
    // `override` bleibt `null` — das ist die Antwort in JEDEM Fehlerfall
    // (s. Kopf). Keine Row ist dabei der NORMALFALL und kein Zwischenfall;
    // nur alles andere ist eine Meldung wert.
    if (!isRowNotFound(error)) {
      logEvent('warn', 'community.navigation_read_failed', {
        communityId: rowId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  cache.set(key, override)
  return override
}

/**
 * Die Wahl dieses Besitzers speichern.
 *
 * NICHT fail-soft (anders als das Lesen): wer auf „Speichern" klickt, muss
 * erfahren, wenn nichts gespeichert wurde. Der Aufrufer ist die Owner-Route,
 * die den Fehler in ein 500 übersetzt.
 */
export async function writeCommunityNavOverride(
  event: H3Event,
  rowId: string,
  override: CommunityNavOverride,
): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const target = {
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITY_NAVIGATION_TABLE,
    rowId,
  }
  const data = { config: JSON.stringify(override) }
  try {
    await admin.tablesDB.updateRow({ ...target, data })
  }
  catch (error) {
    // 404 = erstes Menü dieser Community, die Zeile gibt es noch nicht.
    if (!isRowNotFound(error)) throw error
    await admin.tablesDB.createRow({ ...target, data })
  }
  forgetCommunityNavOverride(event)
}

/**
 * Nach dem Speichern: der neue Stand ist sofort sichtbar, ohne 30 Sekunden auf
 * die Ablaufzeit zu warten. Die TTL bleibt als Netz für Schreibwege, die nicht
 * durch diese Route gehen (Konsole, Nachrüst-Skripte) — und `delete` statt
 * `clear`, damit nicht die Einträge aller anderen Mandanten mitgehen.
 */
export function forgetCommunityNavOverride(event: H3Event): void {
  cache.delete(tenantCacheScope(event))
}
