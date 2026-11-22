import { createAdminClient } from '../lib/appwrite'
import { tenancyWithoutResolver } from '../utils/tenantResolver'
import { TENANT_RESOLVER_MISSING_CODE } from '../../shared/unknownHost'
import { resolveSchemaState } from '../utils/schemaState'
import { siteCardHealth } from '../utils/siteCard'

/**
 * Health-Check gegen die Appwrite-Instanz via AdminClient (Scope: health.read).
 *
 * Bewusst methodenneutral (Datei `health.ts`, NICHT `health.get.ts`): Uptime-
 * Monitore (UptimeRobot Free-Plan) und Load-Balancer prüfen oft per HEAD —
 * ein GET-only-Handler lieferte HEAD → 404 und damit falsche DOWN-Alerts.
 * H3 verwirft den Body bei HEAD automatisch; der Statuscode ist das Signal.
 *
 * ZWISCHENSPEICHER STATT DROSSEL (BE-002): die Route ist ohne Anmeldung
 * erreichbar, und jeder Aufruf traf Appwrite — ein billiger Hebel für
 * Dauerfeuer. Eine 429 wäre hier aber die falsche Antwort: die Wächter
 * (`verify-health.mjs`), der Deploy-Beweis und UptimeRobot dürfen NIE eine
 * 429 sehen, sonst meldet die Überwachung einen Ausfall, den es nicht gibt.
 * Deshalb hält jeder Prozess das Ergebnis der Appwrite-Abfrage 5 Sekunden,
 * und gleichzeitige Aufrufe teilen sich EINE laufende Abfrage. Auch ein
 * Fehlschlag wird so lange gehalten (bei einem Ausfall soll nicht jeder
 * Aufruf Appwrite erneut treffen) und wie bisher als Fehler weitergegeben.
 * `build` kommt aus der Laufzeit-Config und wird nicht zwischengespeichert.
 *
 * Das frühere Feld `user` (Spiegel von `event.context.user`) ist entfallen:
 * kein Leser im Repo, und eine Infra-Route soll keine Sitzungsdaten tragen.
 *
 * SCHEMA-STAND (OPS-008, seit 2026-11-15): Deploys laufen automatisch,
 * Migrationen von Hand — zweimal ging Code live, bevor seine Migration lief.
 * Das Feld `schema` sagt deshalb, ob die Datenbank zum ausgerollten Programm
 * passt: `{ state: 'ok' | 'behind' | 'unknown', expected, found }`. Jeder
 * einkompilierte Layer mit Migrationen prüft EINE Probe am wirklichen Schema
 * (`schema` im product.manifest.ts, Logik in `utils/schemaState.ts`).
 *  - ÖFFENTLICH heißt: nur ein Zustandswort und zwei Zahlen, NIE Tabellen-,
 *    Spalten- oder Migrationsnamen. Was fehlt (`brand-026`), steht nur im
 *    Server-Log (`schema.behind`, eine Zeile je Wechsel).
 *  - Ein LESEFEHLER (Ausfall, Frist, falscher Schlüssel) ist `unknown`, nicht
 *    „ungesund"; nur ein sicher fehlendes Stück ist `behind`.
 *  - `ok` bleibt davon UNBERÜHRT: seit P10 wird jeder Deploy rot, wenn `ok`
 *    nicht true ist — ein Fehlalarm der Schema-Prüfung färbte sonst jeden
 *    Deploy. `behind` meldet der tägliche Wächter.
 *  - Beide Prüfungen laufen parallel; jede Probe hat ihre eigene Frist von
 *    4 s, die Schema-Prüfung wirft nie und hat ihren eigenen
 *    Zwischenspeicher (ok 5 min, behind 30 s, unknown 10 s).
 *
 * SCHALTER DER EINTRITTSKARTE (PK1 E1c): `siteCard` sagt, wie die App den
 * Schalter `NUXT_SITE_CARD_MODE` gelesen hat — `mode`, `cards` (ein
 * brauchbarer Schlüssel ist da, Karten können entstehen) und `previous` (ein
 * voriger Schlüssel ist zum Lesen gesetzt). Ein Speicherzugriff, kein
 * Zwischenspeicher nötig (`siteCardHealth`).
 *
 * WARUM ÖFFENTLICH (Gegenlesen E1c, Fund 5, entschieden: alle drei bleiben):
 * es sind drei Betriebszustände, kein Geheimnis — kein Schlüssel, keine
 * Schlüssel-Kennung, nichts über Personen. Wer sie liest, erfährt, ob die
 * Anmeldung Karten schreibt; das sieht jeder ohnehin am eigenen Cookie
 * (`c1.`). Gebraucht werden sie VON AUSSEN und ohne Geheimnis: vom
 * Erreichbarkeits-Wächter (`scripts/ops/verify-health.mjs`, Warnung bei
 * `previous`), von der Konsole für die Freigabe-Pflicht eigener Domains (K6,
 * liest `mode`/`cards`) und von der Prüfung nach jedem Umschalten (Runbook
 * `docs/runbooks/PK1-EINSCHALTEN.md`). Ein eigener, geschützter Weg nur für
 * zwei Wahrheitswerte wäre mehr Angriffsfläche (ein weiteres Geheimnis) als
 * die Werte selbst.
 */

const CACHE_MS = 5_000

/**
 * Wie lange sich Aufrufe eine LAUFENDE Abfrage teilen. Der Appwrite-Client hat
 * keine eigene Frist: bliebe eine Abfrage für immer offen, hinge ohne diese
 * Grenze jeder spätere Aufruf an ihr — und `/api/health` wäre bis zum
 * Neustart des Prozesses stumm. Danach startet der nächste Aufruf eine neue.
 */
const IN_FLIGHT_MS = 10_000

/** Die laufende oder zuletzt beendete Abfrage; ab Ende gilt `CACHE_MS`. */
let cached: { result: Promise<boolean>, expiresAt: number } | null = null

function appwriteHealthy(event: Parameters<typeof createAdminClient>[0]): Promise<boolean> {
  if (cached && Date.now() < cached.expiresAt) return cached.result

  const entry = {
    result: createAdminClient(event).health.get().then(status => status.status === 'pass'),
    // Solange die Abfrage läuft, teilen sich alle Aufrufe dieselbe (befristet).
    expiresAt: Date.now() + IN_FLIGHT_MS,
  }
  const settle = () => {
    entry.expiresAt = Date.now() + CACHE_MS
  }
  entry.result.then(settle, settle)
  cached = entry
  return entry.result
}

export default defineEventHandler(async (event) => {
  // Deployter Commit (Build-Zeit) — Basis der Deploy-Verifikation (A.5)
  const build = useRuntimeConfig(event).public.buildSha || null

  /**
   * SEC-025 (2026-11-13): Mandanten-Trennung an, aber kein Resolver ⇒ die
   * App lehnt jede andere Anfrage mit 503 ab (`00.tenant.ts`). Diese Route
   * kommt dort bewusst durch und sagt WARUM: `ok:false` mit `reason`
   * (derselbe Schlüsselname wie im Fehler-Envelope, core/server/error.ts).
   * Welche Variable fehlt, steht nur im Server-Log — nie hier.
   *
   * HTTP bleibt 200 wie bei jedem anderen `ok:false`: der Deploy-Beweis liest
   * `.build` per `curl -f`, ein 5xx machte den Build-SHA unlesbar. Rot wird
   * es trotzdem überall — `verify-health.mjs` und UptimeRobot verlangen
   * `"ok":true`. Appwrite wird dann gar nicht erst gefragt: die Antwort steht
   * ohnehin fest, und die Prüfung ist ein Speicherzugriff (kein Zwischenspeicher
   * nötig).
   */
  const tenancyEnabled = (useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } })
    .pukalani?.tenancy?.enabled
  if (tenancyWithoutResolver(tenancyEnabled)) {
    return { ok: false, build, reason: TENANT_RESOLVER_MISSING_CODE, siteCard: siteCardHealth() }
  }

  // Parallel: die Schema-Prüfung lehnt nie ab und verlängert die Antwort
  // höchstens bis zur Frist der langsamsten Probe.
  const [ok, schema] = await Promise.all([appwriteHealthy(event), resolveSchemaState(event)])

  return { ok, build, schema, siteCard: siteCardHealth() }
})
