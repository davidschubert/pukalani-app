import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import {
  COMMUNITY_REDIRECTS_TABLE,
  type CommunityRedirectConfig,
  parseCommunityRedirectConfig,
} from '../../shared/communityRedirects'

/**
 * DIE ABLAGE DER WEITERLEITUNGEN (U15 Teil 3) — lesen, schreiben, vergessen.
 *
 * ── WARUM DIESE DATEI IN core LIEGT UND NICHT IM pages-LAYER ──────────────
 * Wie bei `communitySeoStore.ts` (Teil 2) und anders als beim Menü (Teil 1):
 * der LESER ist der Kern selbst. Die Middleware `01.community-redirect.ts`
 * entscheidet, bevor irgendetwas gerendert wird, ob dieser Pfad woanders
 * hingehört — läge der Leser in einem Produkt-Layer, müsste core ihn über eine
 * Registry zurückholen, und zwar im heissesten Pfad des Servers. Der SCHREIBER
 * bleibt trotzdem draussen: die Owner-Route und die Editor-Seite gehören dem
 * pages-Layer, dem die „Website"-Gruppe gehört. Core besitzt die Ablage, nicht
 * die Bedienung.
 *
 * ── ES LIEST NIEMAND, ES WIRD GELESEN ─────────────────────────────────────
 * `community_redirects` trägt **keinerlei Client-Rechte** (`permissions: []`,
 * system-035). Kein Besucher, kein Mitglied und kein Owner kommt an die Zeile —
 * der SERVER liest sie und schickt den Besucher weiter. Beide Zugriffe hier
 * laufen deshalb mit dem ADMIN-Client, und beide in der Haltung, die die
 * Datentür `as: 'operator', actor: 'operator'` nennt: es handelt kein Mensch,
 * es arbeitet das System. Daran hängt, was `actor: 'operator'` überall sonst
 * bedeutet — keine M13-Inhaltssperre (eine Weiterleitung ist kein Inhalt) und
 * kein A5-Beitritt (ein Owner, der seine Adressen ordnet, tritt nichts bei).
 *
 * ── WARUM NICHT DURCH `tenantDb()`, obwohl die Haltung dieselbe ist ───────
 * Wortgleich die Begründung aus Teil 1 und 2: `tenantDb().get()` prüft mit
 * `rowBelongsToTenant`, ob `row.communityId` zum Mandanten passt — diese
 * Tabelle hat aber gar keine `communityId`-Spalte, ihre **rowId IST die
 * Community**. Die Prüfung fiele fail-closed auf JEDE Zeile aus. Eine Spalte
 * nachzuziehen, nur damit die Tür etwas prüfen kann, was die rowId schon sagt,
 * wäre eine zweite Wahrheit über denselben Mandanten.
 *
 * DIE MANDANTEN-GRENZE GEHT DADURCH NICHT VERLOREN, sie liegt nur woanders:
 * die `communityId` kommt in BEIDEN Richtungen aus `useTenant(event)` bzw. aus
 * `event.context.tenant`, also aus der Host-Auflösung des Servers — NIE aus dem
 * Aufrufer. Die Weiterleitungen einer fremden Community sind nicht
 * adressierbar, unabhängig davon, was im Body steht.
 *
 * Die ESLint-Regel gegen rohes `.tablesDB` zielt auf `server/api/**` und
 * `server/plugins/**` (Request-Routen); diese Datei liegt bewusst in
 * `server/utils/**` — dieselbe Stelle wie der Branding-Spiegel.
 *
 * ── KEIN `upsertRow` ──────────────────────────────────────────────────────
 * UPDATE, bei 404 CREATE. Appwrite 1.9.6 schreibt bei `upsertRow` korrekt,
 * PUBLIZIERT dafür aber KEIN Realtime-Event (live erwischt am 2026-08-01, D6).
 * Heute liest ohnehin nur der Server; der Weg zur Live-Propagation soll aber
 * offen bleiben, und der besteht dann aus GENAU einer Ergänzung (`read(any)`
 * an der Tabelle, s. system-035).
 */

const TTL_MS = 30_000

/**
 * Microcache der Weiterleitungen.
 *
 * DAS IST HIER NICHT KOMFORT, SONDERN DIE BEDINGUNG. Die Middleware läuft an
 * JEDEM Seitenaufruf jeder Community, und der Normalfall ist „keine Regeln".
 * Ohne Zwischenspeicher kostete jede einzelne Seite einen Appwrite-Aufruf,
 * bevor sie überhaupt anfängt — die Weiterleitungen wären das Teuerste am
 * ganzen Seitenaufbau, für eine Funktion, die fast nie zutrifft.
 *
 * USER-AGNOSTISCH, und das ist die Bedingung fürs Cachen überhaupt (CLAUDE.md
 * „Microcache"): eine Weiterleitung gilt für jeden Besucher gleich. Anmeldung,
 * Rolle und Tarif spielen keine Rolle — hier liegt ausschliesslich die
 * gespeicherte Wahl des Owners.
 *
 * SCHLÜSSEL = MANDANT (`tenantCacheScope`). Pflicht: im Pool teilen sich alle
 * Communities einen Prozess, ein ungescopter Schlüssel schickte die Besucher
 * von Kunde A auf die Adressen von Kunde B — der teuerste denkbare Fehler
 * dieser Fläche, weil er den Besucher WEGSCHICKT statt ihm etwas Falsches zu
 * zeigen.
 *
 * `null` WIRD MITGECACHT, und das ist der wichtigere Teil: die allermeisten
 * Communities haben keine Row. Ohne negatives Caching kostete JEDER
 * Seitenaufbau jeder Community einen Appwrite-404.
 */
const cache = createMicrocache<CommunityRedirectConfig | null>(TTL_MS)

function isRowNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

/**
 * Die gespeicherten Weiterleitungen dieser Community — oder `null`.
 *
 * FAIL-SOFT bis zur letzten Zeile: fehlende Tabelle (Instanz ohne system-035),
 * fehlende Row, kaputtes JSON, Appwrite gerade nicht erreichbar — alles endet
 * in `null`, und `null` heisst „keine Weiterleitung, weiter wie bisher".
 *
 * DAS IST HIER DIE EINZIG VERTRETBARE RICHTUNG. Ein Fehler an dieser Stelle
 * darf niemals dazu führen, dass eine Community gar nicht mehr antwortet — die
 * Middleware steht vor ALLEM. Der Preis ist ehrlich zu benennen: solange der
 * Lesepfad kaputt ist, laufen die alten Adressen wieder in ihre 404. Das ist
 * der Zustand von vor U15 und damit die richtige Rückfallebene. Geloggt wird
 * trotzdem, sonst wäre ein dauerhaft kaputter Lesepfad unsichtbar.
 */
export async function readCommunityRedirects(
  event: H3Event,
  communityId: string,
): Promise<CommunityRedirectConfig | null> {
  if (!communityId) return null
  const key = tenantCacheScope(event)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  // KEINE APPWRITE-INSTANZ (help: Endpunkt bewusst leer) ⇒ still „keine
  // Weiterleitung". Dieselbe Klammer wie in communitySeoStore.ts — ohne sie
  // warf `createAdminClient` am leeren Endpunkt in den Warn-Zweig unten
  // (Regel und Logbefund: shared/appwriteConfigured.ts).
  if (!appwriteConfigured(event)) {
    cache.set(key, null)
    return null
  }

  let config: CommunityRedirectConfig | null = null
  try {
    const runtime = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const row = await admin.tablesDB.getRow<Models.Row & { config?: string }>({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: COMMUNITY_REDIRECTS_TABLE,
      rowId: communityId,
    })
    config = parseCommunityRedirectConfig(row.config)
  }
  catch (error) {
    // `config` bleibt `null` — das ist die Antwort in JEDEM Fehlerfall (s.
    // Kopf). Keine Row ist dabei der NORMALFALL und kein Zwischenfall; nur
    // alles andere ist eine Meldung wert.
    if (!isRowNotFound(error)) {
      logEvent('warn', 'community.redirects_read_failed', {
        communityId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  cache.set(key, config)
  return config
}

/**
 * Die Weiterleitungen dieser Community speichern.
 *
 * NICHT fail-soft (anders als das Lesen): wer auf „Speichern" klickt, muss
 * erfahren, wenn nichts gespeichert wurde. Der Aufrufer ist die Owner-Route im
 * pages-Layer, die den Fehler in ein 500 übersetzt.
 */
export async function writeCommunityRedirects(
  event: H3Event,
  communityId: string,
  config: CommunityRedirectConfig,
): Promise<void> {
  const runtime = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const target = {
    databaseId: runtime.public.appwriteDatabaseId,
    tableId: COMMUNITY_REDIRECTS_TABLE,
    rowId: communityId,
  }
  const data = { config: JSON.stringify(config) }
  try {
    await admin.tablesDB.updateRow({ ...target, data })
  }
  catch (error) {
    // 404 = erste Weiterleitung dieser Community, die Zeile gibt es noch nicht.
    if (!isRowNotFound(error)) throw error
    await admin.tablesDB.createRow({ ...target, data })
  }
  forgetCommunityRedirects(event)
}

/**
 * Nach dem Speichern: die neue Weiterleitung greift sofort, ohne 30 Sekunden
 * auf die Ablaufzeit zu warten. Die TTL bleibt als Netz für Schreibwege, die
 * nicht durch die Route gehen (Konsole, Nachrüst-Skripte) — und `delete` statt
 * `clear`, damit nicht die Einträge aller anderen Mandanten mitgehen.
 */
export function forgetCommunityRedirects(event: H3Event): void {
  cache.delete(tenantCacheScope(event))
}
