import { Query } from 'node-appwrite'
import { brandCheckCategoryScores } from '../../../../shared/brandCheck'
import {
  BRAND_CHECK_RANKING_SCAN_LIMIT,
  pickLatestPerUrlKey,
  sortBrandCheckRankingItems,
} from '../../../../shared/brandCheckRanking'
import type {
  BrandCheckCategoryResult,
  BrandCheckCriterionResult,
  BrandCheckFinding,
  BrandCheckPrevious,
  BrandCheckRank,
  BrandCheckRankingItem,
  BrandCheckResult,
} from '../../../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  type BrandCheckRow,
  brandCheckRankingFacts,
  brandDb,
  isAppwriteNotFound,
} from '../../../utils/brandStore'

/**
 * EIN GESPEICHERTES CHECK-ERGEBNIS — öffentlich lesbar, unter genau der
 * Adresse, die der Anstoss zurückgegeben hat (`/brand-check/<id>`, Plan §4).
 *
 * ── WARUM SIE OHNE JEDEN BEWEIS ANTWORTET ─────────────────────────────────
 * Weil das Ergebnis TEILBAR sein soll (Davids Entscheidung 2026-09-05). Es
 * enthält nichts, was nicht ohnehin öffentlich wäre: die geprüfte Adresse und
 * Urteile über eine öffentlich erreichbare Startseite. Was NICHT drinsteht,
 * ist der Grund, warum das trägt — kein Seitentext, kein `ipHash`, kein
 * `textHash`, kein Modellname. Die Zeile trägt mehr, als diese Antwort zeigt,
 * und das ist Absicht: `ipHash` ist ein (pseudonymer) Personenbezug und geht
 * niemanden ausser dem Deckel etwas an.
 *
 * Die Seite dazu trägt `noindex` (Client) — geteilt heisst nicht indexiert.
 *
 * ── DIE ID IST DAS GANZE GEHEIMNIS, ALSO WIRD SIE GEMESSEN ────────────────
 * Sie kommt aus der Adresszeile. Eine ungeprüfte Zeichenkette in einem
 * `getRow` ist eine Zeichenkette, die jemand ausprobiert — deshalb erst die
 * Form (Appwrite-Zeilen-Ids: bis 36 Zeichen aus Buchstaben, Ziffern, `_`,
 * `-`), dann die Abfrage.
 *
 * ── ZWEI NEBENANGABEN, ZWEI ABFRAGEN — UND BEIDE DÜRFEN AUSFALLEN ─────────
 * Seit der Ergebnisseite v2 (BRAND-CHECK-SEITE §10) trägt die Antwort den
 * unmittelbaren VORGÄNGER derselben Adresse („↑ +7 seit dem 12. August") und
 * den PLATZ im Ranking. Beide kosten je eine Abfrage, beide laufen parallel
 * zum eigentlichen Ergebnis, und beide ergeben `null`, wenn irgendetwas
 * dazwischenkommt: ein Delta ist eine Zugabe, ein 503 auf einem geteilten Link
 * wäre ein Verlust. Den Platz holt die Route nur für Checks, die im Ranking
 * überhaupt erscheinen — ohne Häkchen wird dort nichts gelesen.
 *
 * ── EINE KAPUTTE ZEILE IST EIN 404, KEIN 500 ──────────────────────────────
 * `JSON.parse` über eine Spalte, die jemand von Hand editiert hat, wirft. Für
 * den Leser ist das dasselbe wie „gibt es nicht": er kann nichts daran ändern,
 * und ein 500 wäre eine Einladung, es noch dreimal zu versuchen.
 */
const ROW_ID = /^[A-Za-z0-9_-]{1,36}$/

export default defineEventHandler(async (event): Promise<BrandCheckResult> => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!ROW_ID.test(id)) {
    throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
  }

  const { tablesDB, databaseId } = brandDb(event)

  let row: BrandCheckRow
  try {
    row = await tablesDB.getRow<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
    }
    logEvent('warn', 'brand.check_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({ status: 503, statusText: 'Check unavailable', data: { code: 'check_unavailable' } })
  }

  // AUSGEBLENDET ⇒ dasselbe 404 wie „gibt es nicht" (§3 „Recht", §7).
  //
  // Kein 410 und kein eigener Code: der Betreiber hat einem Entfernungswunsch
  // stattgegeben, und ein Statuscode, der „hier stand mal etwas" sagt, nähme
  // genau die Wirkung wieder weg. Die ZEILE bleibt trotzdem stehen — sie ist
  // der Beleg dafür, was wann behauptet wurde, und ein Löschen brächte den
  // Check beim nächsten Aufruf derselben Adresse frisch zurück.
  if (row.hidden === true) {
    throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
  }

  const categories = parseJson<BrandCheckCategoryResult[]>(row.categories)
  const criteria = parseJson<BrandCheckCriterionResult[]>(row.criteria)
  const findings = parseJson<BrandCheckFinding[]>(row.findings)
  if (!categories || !criteria || !findings) {
    logEvent('warn', 'brand.check_corrupt', { id: row.$id })
    throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
  }

  const facts = brandCheckRankingFacts(row)
  const [previous, rank] = await Promise.all([
    loadPrevious(tablesDB, databaseId, row),
    loadRank(tablesDB, databaseId, row, facts.rankingOptIn),
  ])

  return {
    id: row.$id,
    url: row.url,
    host: row.host,
    locale: row.locale === 'de' ? 'de' : 'en',
    createdAt: row.$createdAt,
    score: row.score,
    band: row.band,
    scoreVersion: row.scoreVersion,
    // Die QUELLE (§5b) — sie muss mit, seit dieselbe Seite auch einen
    // Dokument-Check anzeigt: dort gibt es keine geprüfte Adresse, und
    // „Stand: Aussen-Check der Startseite " über einem leeren `url` wäre die
    // eine Zeile, die das Ergebnis falsch erklärt. Eine Zeile aus der Zeit vor
    // brand-017 liest sich als 'website' (`brandCheckRankingFacts`) — das war
    // sie auch.
    source: facts.source,
    industry: facts.industry,
    categories,
    criteria,
    findings,
    previous,
    rank,
  }
})

/** Der Datenbank-Griff aus `brandDb` — hier nur zum Weiterreichen benannt. */
type BrandTablesDb = ReturnType<typeof brandDb>['tablesDB']

/**
 * DER UNMITTELBARE VORGÄNGER DERSELBEN ADRESSE — eine Abfrage, eine Zeile.
 *
 * ── WARUM `hidden` NICHT IN DER ABFRAGE STEHT ─────────────────────────────
 * Weil „der vorige Stand" genau EIN Eintrag ist. Filterte die Abfrage
 * ausgeblendete Zeilen weg, griffe sie automatisch weiter zurück und die Seite
 * sagte „+7 seit dem 3. Juli" über einen Vergleichswert, den der Betreiber
 * gerade aus der Welt genommen hat. Also: den einen holen — und wenn er
 * ausgeblendet ist, GAR NICHTS sagen.
 *
 * Ein Dokument-Check kann hier nie mit einem Website-Check verglichen werden:
 * die Schlüssel sind verschieden gebaut (`doc:<profileId>` gegen Host+Pfad),
 * die Gleichheit auf `urlKey` trennt beide Welten von selbst (§5b).
 *
 * FAIL-SOFT: eine Nebenangabe darf das Ergebnis nie kosten. Jeder Fehler und
 * jede fehlende Spalte (Bestand vor brand-016) ergeben `null`.
 */
async function loadPrevious(
  tablesDB: BrandTablesDb,
  databaseId: string,
  row: BrandCheckRow,
): Promise<BrandCheckPrevious | null> {
  if (!row.urlKey) return null
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [
        Query.equal('urlKey', row.urlKey),
        Query.lessThan('$createdAt', row.$createdAt),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ],
    })
    const candidate = res.rows[0]
    // Der Vergleich steht NOCH EINMAL im Code, obwohl die Abfrage ihn schon
    // enthält: eine Ablage, die `lessThan` auf einem Systemfeld nicht
    // anwendet, lieferte sonst den Check SICH SELBST als seinen Vorgänger —
    // „+0 seit heute" wäre das plausibelste aller falschen Ergebnisse.
    if (!candidate || candidate.$id === row.$id || candidate.$createdAt >= row.$createdAt) return null
    if (candidate.hidden === true) return null
    return {
      id: candidate.$id,
      score: candidate.score ?? 0,
      band: candidate.band ?? '',
      createdAt: candidate.$createdAt,
    }
  }
  catch {
    return null
  }
}

/**
 * DER PLATZ IM RANKING — gerechnet mit DERSELBEN Auswahl wie die Ranking-Seite.
 *
 * Vier Grenzen in der Abfrage (Häkchen, nicht ausgeblendet, Wert über 0,
 * jüngster je Adresse) und die Sortierung nach Gesamtwert kommen wörtlich aus
 * `ranking.get.ts` bzw. `shared/brandCheckRanking.ts`. Eine zweite Rangfolge
 * daneben hiesse, dass diese Seite „Platz 3" sagt und die Ranking-Seite den
 * Auftritt auf Platz 4 zeigt.
 *
 * `null` heisst „steht dort nicht": ohne Häkchen, ausgeblendet, mit Wert 0 —
 * oder weil ein NEUERER Check derselben Adresse ihn im Ranking vertritt (die
 * Regel „je Adresse der jüngste"). Auch das ist wahr und keine Panne: dieser
 * Check hat dann keinen eigenen Platz.
 *
 * FAIL-SOFT wie der Vorgänger; der Preis (ein Lesefenster) ist derselbe wie
 * auf der Ranking-Seite und wird nur für Checks bezahlt, die überhaupt in
 * Frage kommen.
 */
async function loadRank(
  tablesDB: BrandTablesDb,
  databaseId: string,
  row: BrandCheckRow,
  rankingOptIn: boolean,
): Promise<BrandCheckRank | null> {
  if (!rankingOptIn || row.hidden === true || (row.score ?? 0) <= 0) return null
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [
        Query.equal('rankingOptIn', true),
        Query.equal('hidden', false),
        Query.greaterThan('score', 0),
        Query.orderDesc('$createdAt'),
        Query.limit(BRAND_CHECK_RANKING_SCAN_LIMIT),
      ],
    })
    const latest = pickLatestPerUrlKey(res.rows.map(toRankingRow))
    const sorted = sortBrandCheckRankingItems(latest.map(entry => entry.item), 'score')
    const index = sorted.findIndex(item => item.id === row.$id)
    if (index < 0) return null
    return { position: index + 1, total: sorted.length }
  }
  catch {
    return null
  }
}

/** Dieselbe Übersetzung wie in `ranking.get.ts` — Sicht plus Gruppier-Schlüssel. */
function toRankingRow(row: BrandCheckRow): { urlKey: string, createdAt: string, item: BrandCheckRankingItem } {
  const facts = brandCheckRankingFacts(row)
  return {
    urlKey: row.urlKey,
    createdAt: row.$createdAt,
    item: {
      id: row.$id,
      host: row.host ?? '',
      score: row.score ?? 0,
      band: row.band ?? '',
      industry: facts.industry,
      source: facts.source,
      createdAt: row.$createdAt,
      categories: toCategoryScores(row.categories),
    },
  }
}

/** Kaputtes JSON ⇒ leere Liste: eine Nebenangabe darf die Seite nicht kosten. */
function toCategoryScores(raw: string): { id: string, score: number | null }[] {
  const parsed = parseJson<BrandCheckCategoryResult[]>(raw)
  return parsed ? brandCheckCategoryScores(parsed) : []
}

/** `null` statt eines Wurfs — der Aufrufer entscheidet, was ein Loch bedeutet. */
function parseJson<T>(value: string): T | null {
  try {
    const parsed = JSON.parse(value || 'null') as unknown
    return Array.isArray(parsed) ? parsed as T : null
  }
  catch {
    return null
  }
}
