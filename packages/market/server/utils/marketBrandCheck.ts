import type { H3Event } from 'h3'
import { findBrandCheckForUrl, runBrandCheck } from '../contracts/brandContract'
import type { MarketBrandCheck } from '../../shared/marketProfile'
import type { MarketCompetitorRow } from '../../shared/types/market'
import { updateMarketCompetitor } from './marketStore'

/**
 * DER BRAND-CHECK-SCORE JE KANDIDAT (Plan §7.3, Davids Entscheidung: „der
 * BESTEHENDE Score, kein zweiter").
 *
 * ── DER MARKTVERGLEICH RECHNET NICHTS ─────────────────────────────────────
 * Er LIEST den Score, den der Brand-Check ermittelt hat, und verlinkt dessen
 * Ergebnis. Er beeinflusst ihn auch nicht — insbesondere nicht über die
 * KI-Aussensicht (§7.5 c): die ist ungeprüft und hat in einer belegbasierten
 * Zahl nichts zu suchen. Was der Marktvergleich zeigt, ist eine ZWEITE
 * Ansicht auf dieselbe Marke, keine zweite Messung.
 *
 * ── SEIT BC1 STÖSST DER LAUF EINEN FEHLENDEN CHECK AN ─────────────────────
 * Das war lange nicht gebaut, und der Grund war nachprüfbar: die Check-Mechanik
 * lag vollständig im Handler von `packages/brand/server/api/brand/check.post.ts`
 * und war nirgends als Funktion herausgezogen — von hier zu rufen hiesse
 * kopieren, und dann hätte der Marktvergleich seinen eigenen, langsam
 * abweichenden Brand-Check, also genau die zweite Zahl, die §7.3 streicht.
 * BC1 hat die Mechanik nach `brand/server/utils/brandCheckRun.ts` gezogen; von
 * hier ist es seither ein AUFRUF derselben Funktion, die auch die öffentliche
 * Route benutzt (`runBrandCheck`, über den Vertrag). Es gibt weiterhin genau
 * einen Brand-Check.
 *
 * `market.score.pending` („Brand-Check läuft mit") bleibt der Zwischenzustand
 * und stimmt damit erst jetzt wörtlich: er beschreibt die Kandidaten, deren
 * Check gerade angestossen wurde oder die es beim nächsten Lauf werden.
 *
 * ── WO DER DECKEL LIEGT: BEIM BRAND-CHECK ─────────────────────────────────
 * `quota: 'account'` bucht den KONTO-Deckel des Brand-Checks (10/Tag) auf den
 * Menschen, der den Lauf ausgelöst hat. Der Marktvergleich bekommt dafür
 * BEWUSST keinen eigenen Eimer: es sind dieselben Anbieter-Aufrufe, und ein
 * zweiter Zähler darüber wäre eine zweite Buchhaltung, die beim ersten Ändern
 * zwei verschiedene Deckel ergibt. Ist der Deckel erschöpft, hört der Anstoss
 * für DIESEN Lauf auf (429 ⇒ Rest überspringen) — die übrigen Kandidaten
 * bleiben beim Zustand „läuft mit", und der nächste Lauf am nächsten Tag holt
 * sie nach.
 *
 * ── ER LÄUFT SYNCHRON IM LAUF, UND ZWAR MIT BUDGET ────────────────────────
 * Die Alternative wäre gewesen, die Checks NACH der Antwort anzustossen. Drei
 * Gründe dagegen, in dieser Reihenfolge:
 *  1. Es gäbe kein Werkzeug dafür. `h3@1.15` kennt kein `event.waitUntil` (im
 *     Node-Preset gibt es nur die Edge-Variante über `event.context`), und ein
 *     nacktes schwebendes Promise nach der Antwort ist Arbeit ohne Besitzer:
 *     eine unbehandelte Ablehnung nimmt unter pm2 den Prozess mit.
 *  2. Der Lauf macht ohnehin bis zu zwei Modell-Aufrufe JE Kandidat
 *     (Auswertung + Aussensicht). Ein dritter ist dieselbe Grössenordnung —
 *     und er wird je Adresse höchstens einmal in sieben Tagen fällig, weil der
 *     Zwischenspeicher des Checks vor der Buchung greift.
 *  3. Synchron trägt die ANTWORT DESSELBEN Klicks schon die Scores: der
 *     Bericht liest den Stand danach (`loadMarketReportState`), und die
 *     Check-Ids werden an einer Stelle gestempelt statt an zweien.
 * Der Preis ist Wartezeit, und deshalb gibt es `MARKET_BRAND_CHECK_BUDGET_MS`:
 * eine Wanduhr über den GANZEN Anstoss. Sie ist keine Feinsteuerung, sondern
 * die Antwort auf den schlimmsten Fall — der Urteils-Aufruf des Checks darf
 * 90 s dauern, fünf davon hintereinander wären siebeneinhalb Minuten obendrauf.
 *
 * ── NUR WEBSITE-KANDIDATEN ────────────────────────────────────────────────
 * Ein Brand-Check misst einen AUFTRITT. Eine Foundation hat keinen (sie ist
 * eine Entscheidung, keine Website), ein Bibliotheks-Eintrag hat einen, aber
 * nicht bei uns geprüft. Beide bleiben deshalb ohne Score — statt mit einem,
 * der etwas anderes misst als er behauptet.
 */

/**
 * Die Adresse, unter der ein Check zu suchen ist: der URSPRUNG der Website,
 * nicht die eingetragene Unterseite.
 *
 * `brandCheckUrlKey` schneidet die Query weg, behält aber den PFAD — der Check
 * einer Startseite und der einer Unterseite sind für ihn zwei Ergebnisse. Der
 * Marktvergleich fragt aber nach der MARKE, und deren Auftritt ist die
 * Startseite; ohne diese Reduktion fände ein Kandidat, der als
 * `marke.de/leistungen` eingetragen ist, den Check seiner eigenen Startseite
 * nie.
 */
function originOf(rawUrl: string): string {
  try {
    return `${new URL(rawUrl).origin}/`
  }
  catch {
    return ''
  }
}

/**
 * DIE SCORES ALLER KANDIDATEN — eine Abfrage je Website-Kandidat, höchstens
 * fünf.
 *
 * FAIL-SOFT im Ganzen (die Lesefunktion ist es schon je Zeile): ein Kandidat
 * ohne Eintrag steht schlicht nicht in der Karte.
 */
export async function loadMarketBrandChecks(
  event: H3Event,
  competitors: readonly MarketCompetitorRow[],
): Promise<Map<string, MarketBrandCheck>> {
  const checks = new Map<string, MarketBrandCheck>()

  for (const competitor of competitors) {
    if ((competitor.sourceKind ?? 'website') !== 'website') continue
    const url = originOf(competitor.url ?? '')
    if (!url) continue
    const found = await findBrandCheckForUrl(event, url)
    if (!found) continue
    checks.set(competitor.$id, { score: found.score, band: found.band, checkId: found.checkId })
  }

  return checks
}

/**
 * DIE ID DES CHECKS AN DER KANDIDATEN-ZEILE FESTHALTEN
 * (`market_competitors.brandCheckId`, Anhang B: „Adresse des Ergebnisses —
 * **nicht** der Score").
 *
 * Die ZAHL wird bewusst nicht mitgeschrieben: sie ändert sich, wenn jemand den
 * Check neu ermittelt, und eine Kopie daneben wäre ab dann eine zweite
 * Wahrheit. Die Id dagegen ist stabil und beantwortet die einzige Frage, die
 * ohne zweiten Lesevorgang nicht zu beantworten wäre: „auf welches Ergebnis
 * zeigt der Link?".
 */
export function marketBrandCheckIdOf(
  checks: ReadonlyMap<string, MarketBrandCheck>,
  competitorId: string,
): string {
  return checks.get(competitorId)?.checkId ?? ''
}

/**
 * DIESELBE FRAGE FÜR ALLE KANDIDATEN — die Adressen ohne die Zahlen.
 *
 * Der Stempel braucht NUR die Id, und ein frisch angestossener Check hat im
 * Moment des Stempelns noch keinen gelesenen Score. Eine Karte aus Ids kann
 * beides tragen, ohne irgendwo eine 0 zu behaupten, die niemand gemessen hat.
 */
export function marketBrandCheckIds(
  checks: ReadonlyMap<string, MarketBrandCheck>,
): Map<string, string> {
  const ids = new Map<string, string>()
  for (const [competitorId, check] of checks) ids.set(competitorId, check.checkId)
  return ids
}

/**
 * DIE CHECK-IDS AN DEN KANDIDATEN-ZEILEN NACHZIEHEN.
 *
 * FAIL-SOFT: eine Zeile, die sich nicht schreiben lässt, kostet den LINK, nie
 * den Lauf und nie den Bericht. Geschrieben wird nur, was sich geändert hat —
 * ein Lauf auf unverändertem Stand soll keine Schreibvorgänge auslösen.
 *
 * Sie steht HIER und nicht mehr im Bericht-Dienst, weil es seit BC1 zwei
 * Aufrufer gibt (der Lauf stösst an, der Bericht friert ein) und zwei Fassungen
 * derselben Regel beim ersten Ändern zwei verschiedene Regeln wären.
 */
export async function stampMarketBrandCheckIds(
  event: H3Event,
  profileId: string,
  rows: readonly MarketCompetitorRow[],
  checkIds: ReadonlyMap<string, string>,
): Promise<void> {
  for (const row of rows) {
    const checkId = checkIds.get(row.$id) ?? ''
    if ((row.brandCheckId ?? '') === checkId) continue
    try {
      await updateMarketCompetitor(event, profileId, row.$id, { brandCheckId: checkId })
    }
    catch (error) {
      logEvent('warn', 'market.brand_check_stamp_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * HÖCHSTENS FÜNF ANGESTOSSENE CHECKS JE LAUF — dieselbe Zahl wie die
 * Kandidaten-Obergrenze des Marktvergleichs. Sie ist kein zweiter Deckel,
 * sondern nur die Aussage, dass ein Lauf nicht mehr Adressen kennt als er hat.
 */
export const MARKET_BRAND_CHECK_MAX = 5

/**
 * DIE WANDUHR ÜBER DEN GANZEN ANSTOSS (Begründung im Kopf dieser Datei).
 *
 * Zwei Minuten reichen im Normalfall für alle fünf (ein Check ist ein Abruf und
 * EIN Modell-Aufruf, gemessen im Sekundenbereich) und schneiden den seltenen
 * Fall ab, in dem ein einzelner Anbieter-Aufruf in seinen 90-Sekunden-Deckel
 * läuft. Geprüft wird VOR jedem Kandidaten, nicht mitten in einem: ein Check,
 * der bezahlt ist, wird auch zu Ende gebracht und gespeichert.
 */
export const MARKET_BRAND_CHECK_BUDGET_MS = 120_000

export interface TriggerMarketBrandChecksInput {
  profileId: string
  /** Wessen Konto-Deckel den Anstoss bezahlt (`requireMarketProfile`). */
  userId: string
  /** Die Sprache der ERGEBNIS-Seite, nicht die der Belege. */
  locale: string
  /** ALLE Kandidaten — die Id-Stempel gelten auch für die, die niemand prüft. */
  competitors: readonly MarketCompetitorRow[]
  /**
   * WELCHE ANGESTOSSEN WERDEN DÜRFEN — die Ids der Kandidaten, die der Lauf
   * gerade tatsächlich lesen durfte. Zwei Fälle sind damit draussen, und beide
   * mit Grund: ein per `robots.txt` AUSGESCHLOSSENER Kandidat darf nicht über
   * einen zweiten Abruf doch gelesen werden, und ein UNERREICHBARER kostet
   * sonst ein Kontingent für einen Fehler, den wir schon kennen.
   *
   * Der Aufrufer sagt es, nicht diese Datei: hier läge dafür nur `row.status`
   * vor, und der ist der Stand VOR dem Lauf.
   */
  eligible: ReadonlySet<string>
}

/**
 * FEHLENDE CHECKS ANSTOSSEN UND DIE IDS FESTHALTEN (§7.3, BC1).
 *
 * FAIL-SOFT JE KANDIDAT, mit einer Ausnahme, die keine ist: ein 429 beendet
 * den ganzen Anstoss. Das ist kein „harter Abbruch", sondern die einzige
 * sinnvolle Deutung — der Deckel gilt fürs KONTO, der nächste Kandidat liefe
 * in dieselbe Wand, und vier weitere sinnlose Buchungsversuche wären vier
 * weitere Log-Zeilen ohne Erkenntnis. Jeder andere Fehler (400 wegen einer
 * unbrauchbaren Adresse, 422 hinter einem toten Host, 503 eines ausgefallenen
 * Anbieters) kostet genau SEINEN Kandidaten den Score.
 *
 * ── EIN `cached`-TREFFER WIRD NICHT GESTEMPELT ────────────────────────────
 * Wir rufen nur für Kandidaten an, für die `findBrandCheckForUrl` NICHTS
 * gefunden hat. Kommt von dort trotzdem ein Zwischenspeicher-Treffer zurück,
 * gibt es dafür genau einen Grund: die Zeile ist AUSGEBLENDET (Betreiber-Weg,
 * brand-017) — die Lesefunktion überspringt solche Zeilen, der Zwischenspeicher
 * des Checks nicht. Diese Id gehört an keine Kandidaten-Zeile: sie wäre ein
 * Link auf ein Ergebnis, das der Betreiber gerade aus der Auskunft genommen
 * hat. Ein frischer Check (`cached: false`) trägt dagegen `hidden: false` von
 * Bauart wegen.
 *
 * ── LOG-REGEL DES market-LAYERS ───────────────────────────────────────────
 * ZAHLEN und CODES, keine Adresse und kein Name — dieselbe Strenge wie in
 * `market.run`. Der Host steht im Log des Brand-Checks, wo er hingehört.
 */
export async function triggerMarketBrandChecks(
  event: H3Event,
  input: TriggerMarketBrandChecksInput,
): Promise<void> {
  const checks = await loadMarketBrandChecks(event, input.competitors)
  const checkIds = marketBrandCheckIds(checks)

  const open = input.competitors
    .filter(row => (row.sourceKind ?? 'website') === 'website')
    .filter(row => input.eligible.has(row.$id))
    .filter(row => !checks.has(row.$id) && originOf(row.url ?? ''))
    .slice(0, MARKET_BRAND_CHECK_MAX)

  const deadline = Date.now() + MARKET_BRAND_CHECK_BUDGET_MS
  let ran = 0
  let skipped = 0

  for (const row of open) {
    if (Date.now() > deadline) {
      logEvent('info', 'market.brand_check_skipped', {
        code: 'budget',
        remaining: open.length - ran - skipped,
      })
      break
    }

    try {
      const result = await runBrandCheck(event, {
        // Der URSPRUNG, nicht die eingetragene Unterseite (s. `originOf`).
        url: originOf(row.url ?? ''),
        locale: input.locale === 'de' ? 'de' : 'en',
        userId: input.userId,
        // KEIN `force`: der Sieben-Tage-Zwischenspeicher des Checks ist der
        // Kostendeckel, und ein Lauf, der jede fremde Startseite neu prüfte,
        // wäre der teuerste Knopf des Produkts.
        quota: 'account',
        // Ein fremder Auftritt kommt NIE ins Ranking, weil wir ihn geprüft
        // haben — das Häkchen gehört dem, dem die Marke gehört (§8.1).
        rankingOptIn: false,
      })
      // Ein `cached`-Treffer heisst hier „ausgeblendet" (s. Kopf) — er bekommt
      // keinen Stempel, weil sein Ergebnis aus der Auskunft genommen wurde.
      if (result.cached) {
        skipped++
        logEvent('info', 'market.brand_check_skipped', { status: 200, code: 'not_visible' })
        continue
      }
      ran++
      checkIds.set(row.$id, result.id)
    }
    catch (error) {
      skipped++
      const status = statusOf(error)
      logEvent('info', 'market.brand_check_skipped', { status, code: codeOf(error) })
      // Der Konto-Deckel gilt fürs ganze KONTO — der nächste liefe in dieselbe
      // Wand.
      if (status === 429) break
    }
  }

  // Die Karte trägt jetzt beides: die GEFUNDENEN Checks und die eben
  // angestossenen. Gestempelt wird in EINEM Durchgang.
  await stampMarketBrandCheckIds(event, input.profileId, input.competitors, checkIds)

  if (open.length) {
    logEvent('info', 'market.brand_checks', { open: open.length, ran, skipped })
  }
}

function statusOf(error: unknown): number {
  const status = (error as { statusCode?: unknown, status?: unknown } | null)?.statusCode
    ?? (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : 0
}

function codeOf(error: unknown): string {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code
  return typeof code === 'string' ? code : ''
}
