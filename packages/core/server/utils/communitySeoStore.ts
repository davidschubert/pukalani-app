import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import {
  COMMUNITY_SEO_TABLE,
  type CommunitySeoSettings,
  parseCommunitySeoRow,
} from '../../shared/communitySeo'

/**
 * DIE ABLAGE DES SUCHEINTRAGS (U15 Teil 2) — lesen, schreiben, vergessen.
 *
 * ── WARUM DIESE DATEI IN core LIEGT UND NICHT IM pages-LAYER ──────────────
 * Anders als beim Menü (Teil 1, Store im pages-Layer) ist der LESER hier der
 * Kern selbst: `useLocaleSeoHead()` stempelt das robots-Signal, und das ist
 * der EINE Kopf-Aufruf jeder App (CLAUDE.md). Läge der Leser in einem
 * Produkt-Layer, müsste core ihn über eine Registry zurückholen — eine ganze
 * Vertragsschicht für ein einzelnes Boolean, das core ohnehin selbst
 * auflösen kann. Der SCHREIBER bleibt trotzdem draussen: die Owner-Route und
 * die Editor-Seite gehören dem pages-Layer, dem die „Website"-Gruppe gehört.
 * Core besitzt die Ablage, nicht die Bedienung.
 *
 * ── ES LIEST NIEMAND, ES WIRD GELESEN ─────────────────────────────────────
 * `community_seo` trägt **keinerlei Client-Rechte** (`permissions: []`,
 * system-034). Kein Besucher, kein Mitglied und kein Owner kommt an die Zeile
 * — der SERVER liest sie beim Seitenaufbau und rendert das Ergebnis in den
 * Kopf. Beide Zugriffe hier laufen deshalb mit dem ADMIN-Client, und beide in
 * der Haltung, die die Datentür `as: 'operator', actor: 'operator'` nennt: es
 * handelt kein Mensch, es arbeitet das System. Daran hängt, was
 * `actor: 'operator'` überall sonst bedeutet — keine M13-Inhaltssperre (eine
 * Sucheinstellung ist kein Inhalt) und kein A5-Beitritt (ein Owner, der seine
 * Beschreibung schreibt, tritt nichts bei).
 *
 * ── WARUM NICHT DURCH `tenantDb()`, obwohl die Haltung dieselbe ist ───────
 * Wortgleich die Begründung aus Teil 1 und von `communityBrandingMirror`:
 * `tenantDb().get()` prüft mit `rowBelongsToTenant`, ob `row.communityId` zum
 * Mandanten passt — diese Tabelle hat aber gar keine `communityId`-Spalte,
 * ihre **rowId IST die Community**. Die Prüfung fiele fail-closed auf JEDE
 * Zeile aus. Eine Spalte nachzuziehen, nur damit die Tür etwas prüfen kann,
 * was die rowId schon sagt, wäre eine zweite Wahrheit über denselben
 * Mandanten.
 *
 * DIE MANDANTEN-GRENZE GEHT DADURCH NICHT VERLOREN, sie liegt nur woanders:
 * die `communityId` kommt in BEIDEN Richtungen aus `useTenant(event)`, also
 * aus der Host-Auflösung des Servers — NIE aus dem Aufrufer. Eine fremde
 * Community ist nicht adressierbar, unabhängig davon, was im Body steht.
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
 * an der Tabelle, s. system-034). Ein `upsertRow` hier machte diese eine Zeile
 * wirkungslos, ohne dass jemand den Zusammenhang sähe.
 */

const TTL_MS = 30_000

/**
 * Microcache der Sucheinstellung.
 *
 * USER-AGNOSTISCH, und das ist die Bedingung (CLAUDE.md „Microcache"): beide
 * Werte sind für jeden Besucher dieselben — sie landen in einem meta-Tag, das
 * ein Crawler liest. Hier liegt nichts, was von einer Anmeldung abhinge.
 *
 * SCHLÜSSEL = MANDANT (`tenantCacheScope`). Pflicht: im Pool teilen sich alle
 * Communities einen Prozess, ein ungescopter Schlüssel gäbe Kunde A die
 * Beschreibung von Kunde B — und schlimmer noch dessen noindex.
 *
 * `null` WIRD MITGECACHT, und das ist der wichtigere Teil: die allermeisten
 * Communities haben keine Zeile. Ohne negatives Caching kostete JEDER
 * Seitenaufbau jeder Community einen Appwrite-404.
 */
const cache = createMicrocache<CommunitySeoSettings | null>(TTL_MS)

function isRowNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

/**
 * Die gespeicherte Wahl dieser Community — oder `null` („keine eigene Wahl").
 *
 * FAIL-SOFT bis zur letzten Zeile: fehlende Tabelle (Instanz ohne system-034),
 * fehlende Row, kaputte Werte, Appwrite gerade nicht erreichbar — alles endet
 * in `null`, und `null` heisst „Kopf wie vor U15". Ein Fehler hier nähme einer
 * Community ihren gesamten Seitenaufbau, für eine Bequemlichkeit.
 *
 * DASS DAS AUCH FÜR `noindex` GILT, ist die bewusste Kehrseite: ein
 * Lesefehler zeigt eine Community, die nicht gefunden werden will, doch der
 * Suchmaschine. Die Begründung, warum dieser Fehler der billigere ist, steht
 * bei `resolveCommunitySeo` (fail-open) — und sie hält nur, weil die Sperre
 * für NICHT-ÖFFENTLICHE Inhalte eine andere ist (C18, fail-closed im
 * Resolver).
 */
export async function readCommunitySeo(
  event: H3Event,
  communityId: string,
): Promise<CommunitySeoSettings | null> {
  if (!communityId) return null
  const key = tenantCacheScope(event)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  // KEINE APPWRITE-INSTANZ (help: Endpunkt bewusst leer) ⇒ still „keine
  // eigene Wahl". Ohne diese Zeile warf `createAdminClient` am leeren
  // Endpunkt und landete im Warn-Zweig unten — zweimal je Stunde im
  // pm2-Fehlerlog, sieben Wochen lang (Regel: shared/appwriteConfigured.ts).
  if (!appwriteConfigured(event)) {
    cache.set(key, null)
    return null
  }

  let settings: CommunitySeoSettings | null = null
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const row = await admin.tablesDB.getRow<Models.Row & { metaDescription?: string, noindex?: boolean }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMUNITY_SEO_TABLE,
      rowId: communityId,
    })
    settings = parseCommunitySeoRow(row)
  }
  catch (error) {
    // `settings` bleibt `null` — das ist die Antwort in JEDEM Fehlerfall
    // (s. Kopf). Keine Row ist dabei der NORMALFALL und kein Zwischenfall;
    // nur alles andere ist eine Meldung wert.
    if (!isRowNotFound(error)) {
      logEvent('warn', 'community.seo_read_failed', {
        communityId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  cache.set(key, settings)
  return settings
}

/**
 * Die Wahl dieser Community speichern.
 *
 * NICHT fail-soft (anders als das Lesen): wer auf „Speichern" klickt, muss
 * erfahren, wenn nichts gespeichert wurde. Der Aufrufer ist die Owner-Route
 * im pages-Layer, die den Fehler in ein 500 übersetzt.
 */
export async function writeCommunitySeo(
  event: H3Event,
  communityId: string,
  settings: CommunitySeoSettings,
): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const target = {
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITY_SEO_TABLE,
    rowId: communityId,
  }
  const data = { metaDescription: settings.metaDescription, noindex: settings.noindex }
  try {
    await admin.tablesDB.updateRow({ ...target, data })
  }
  catch (error) {
    // 404 = erste Sucheinstellung dieser Community, die Zeile gibt es noch nicht.
    if (!isRowNotFound(error)) throw error
    await admin.tablesDB.createRow({ ...target, data })
  }
  forgetCommunitySeo(event)
}

/**
 * Nach dem Speichern: der neue Stand ist sofort im Kopf, ohne 30 Sekunden auf
 * die Ablaufzeit zu warten. Die TTL bleibt als Netz für Schreibwege, die nicht
 * durch die Route gehen (Konsole, Nachrüst-Skripte) — und `delete` statt
 * `clear`, damit nicht die Einträge aller anderen Mandanten mitgehen.
 */
export function forgetCommunitySeo(event: H3Event): void {
  cache.delete(tenantCacheScope(event))
}
