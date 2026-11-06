import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import {
  BRAND_CHECK_CACHE_MS,
  BRAND_CHECK_CRITERIA,
  BRAND_CHECK_SCORE_VERSION,
  type BrandCheckScores,
  brandCheckUrlKey,
  computeBrandCheck,
  pickBrandCheckFindings,
} from '../../shared/brandCheck'
import type {
  BrandCheckCriterionResult,
  BrandCheckFinding,
} from '../../shared/types/brand'
import { type BrandCheckQuotaChoice, decideBrandCheckMode } from '../../shared/brandAiLimits'
import { bookBrandCheckQuota, brandCheckIpHash } from './brandAiQuota'
import { BRAND_CHECK_PROMPT_VERSION, judgeBrandCheck } from './brandCheckJudge'
import { measureBrandCheck } from './brandCheckMeasure'
import { BrandSiteBlockedError, fetchBrandSiteForCheck } from './brandCheckFetch'
import { BrandSiteFetchError } from './brandSiteFetch'
import { BRAND_CHECKS_TABLE, type BrandCheckRow, brandDb } from './brandStore'

/**
 * DIE CHECK-MECHANIK ALS FUNKTION (BC1) — Zwischenspeicher, Deckel, Abruf,
 * Messung, Urteil, Ablage.
 *
 * ── WARUM SIE AUS DEM HANDLER HERAUS MUSSTE ───────────────────────────────
 * Sie lag vollständig in `server/api/brand/check.post.ts`. Solange das so war,
 * konnte der Marktvergleich einen fehlenden Check NICHT anstossen (Plan
 * BRAND-MARKTVERGLEICH §7.3): von aussen zu rufen hiesse kopieren, und dann
 * hätte er seinen eigenen, langsam abweichenden Brand-Check — also genau die
 * zweite Zahl, die §7.3 streicht. Jetzt gibt es EINE Mechanik und zwei
 * Aufrufer: die öffentliche Route und der Lauf des Marktvergleichs (über
 * `packages/market/server/contracts/brandContract.ts`).
 *
 * ── DIE REIHENFOLGE IST DIE KOSTENKONTROLLE ───────────────────────────────
 * Unverändert gegenüber dem Handler, und sie darf sich nicht verschieben:
 *  1. ZWISCHENSPEICHER — dieselbe Adresse innerhalb von sieben Tagen ⇒ die
 *     gespeicherte Zeile, KEIN Abruf, KEIN Modell, KEINE Buchung. Das ist der
 *     Kostendeckel des Plans (§2) und der Grund, warum ein geteilter Link
 *     nicht jedes Mal Geld kostet.
 *  2. Die eigene Brand (`profileId`) — VOR der Buchung, weil eine fremde
 *     Profil-Id ein Fehler des Aufrufers ist und kein Kontingent kosten soll.
 *  3. Deckel buchen (3/Tag je Anschluss ODER 10/Tag je Konto, nie beides;
 *     200/Tag je Instanz).
 *  4. Erst DANN lesen, messen, urteilen, speichern.
 * Was nichts kostet, kostet kein Kontingent — dieselbe Regel wie beim Wizard.
 *
 * ── DIE ERLAUBNIS-FRAGE SITZT IN SCHRITT 4, NICHT DAVOR (BS1 R2b) ─────────
 * Seit dem 2026-09-08 fragt der Abruf `robots.txt` und den TDM-Vorbehalt
 * (`brandCheckFetch.ts`). Beides kostet zwei winzige Anfragen an einen FREMDEN
 * Server — und deshalb steht die Frage HINTER der Buchung, nicht davor: sonst
 * hätte jeder Vorbeikommende einen ungedeckelten Weg, unsere Server auf
 * beliebige fremde Adressen zeigen zu lassen. Ein abgewiesener Check kostet
 * damit ein Kontingent; das ist der richtige Preis für einen Vorgang, der
 * tatsächlich hinausgegangen ist.
 *
 * ── WAS DIESE FUNKTION BEWUSST NICHT TUT: AN DIE ANTWORT SCHREIBEN ────────
 * Der `Retry-After`-Kopf wird NICHT hier gesetzt, sondern von der Route, die
 * den 429 auch nach aussen gibt. Grund ist der zweite Aufrufer: der
 * Marktvergleich ruft bis zu fünf Checks INNERHALB seines eigenen Laufs und
 * fängt deren Fehler ab — ein `setHeader` hier stempelte ein `Retry-After` auf
 * eine 200er-Antwort, die gar nicht abgewiesen wurde. Ein Dienst schreibt
 * nicht in die Antwort eines Requests, der ihm nicht gehört; die Sekunden
 * reisen deshalb als `data.retryAfterSec` mit dem Fehler (die rohe `data`
 * bleibt draussen, der zentrale Handler hebt nur `code` als `reason`).
 *
 * ── OHNE MODELL GIBT ES KEINEN CHECK ──────────────────────────────────────
 * Anders als der Spezialist des Wizards ist der Check NICHT fail-soft: fällt
 * der Anbieter aus, wird NICHTS gespeichert und die Antwort ist 503
 * `check_unavailable`. Sechzehn von vierzig Kriterien ergäben zwar eine Zahl,
 * aber eine, die etwas anderes misst als sie behauptet — und sie läge dann
 * sieben Tage als „Ergebnis" im Zwischenspeicher.
 *
 * ── LOG-REGEL §6 UND PLAN §5 ──────────────────────────────────────────────
 * Geloggt werden Host, Score, Dauer und Fehlercode — nie ein Stück Seitentext,
 * nie die rohe IP. GESPEICHERT wird ebenfalls kein Seitentext: nur die Belege
 * (je ≤ 160 Zeichen) und ein `textHash`.
 */

export interface RunBrandCheckInput {
  /** Die geprüfte Adresse. Das SCHEMA normalisiert sie, nicht diese Funktion. */
  url: string
  /** Die Sprache der FRAGENDEN Seite — nicht die der Belege (Plan §2). */
  locale: 'de' | 'en'
  /** Das Konto, falls es eines gibt. Leer = Gast (Davids Hybrid-Zugang). */
  userId: string
  /**
   * „Neu ermitteln": den Sieben-Tage-Zwischenspeicher überspringen. Wirkt NUR
   * mit Konto und bucht dann vom Konto-Deckel (`decideBrandCheckMode`).
   */
  force?: boolean
  /** Das Ranking-Häkchen. Default AUS — ein Check ist bis zum Widerspruch privat. */
  rankingOptIn?: boolean
  /**
   * Die eigene Brand, unter der dieser Check erscheinen soll — BEREITS
   * GEPRÜFT, der Besitz ist Sache des Aufrufers.
   *
   * Als FUNKTION erlaubt, und das ist kein Selbstzweck: die Route prüft den
   * Besitz mit einer Appwrite-Abfrage, und die soll bei einem
   * Zwischenspeicher-Treffer gar nicht erst laufen (Schritt 1 vor Schritt 2,
   * s. o.). Ein fertiger Wert ist der einfache Fall für Aufrufer ohne Brand.
   */
  profileId?: string | (() => Promise<string>)
  /**
   * WELCHER ENGE EIMER zahlt, wenn wirklich geprüft wird.
   *
   * `'auto'` (Default) ist das Verhalten der öffentlichen Route: der Anschluss
   * zahlt, ausser bei „neu ermitteln". `'account'` ist der Eingang für
   * Aufrufer, die den Konto-Deckel AUSDRÜCKLICH wollen, ohne den
   * Zwischenspeicher zu umgehen — der Marktvergleich stösst so bis zu fünf
   * fehlende Checks je Lauf an, und zwar aus dem Kontingent des Menschen, der
   * den Lauf ausgelöst hat. Ohne Konto fällt `'account'` auf `'auto'` zurück:
   * einen Konto-Eimer ohne Konto gibt es nicht.
   */
  quota?: BrandCheckQuotaChoice
}

export interface RunBrandCheckResult {
  /** Die Adresse des Ergebnisses (`/brand-check/<id>`). */
  id: string
  /** Kam es aus dem Zwischenspeicher? Dann hat dieser Aufruf nichts gekostet. */
  cached: boolean
}

export async function runBrandCheck(
  event: H3Event,
  input: RunBrandCheckInput,
): Promise<RunBrandCheckResult> {
  const urlKey = brandCheckUrlKey(input.url)
  if (!urlKey) {
    throw createError({ status: 400, statusText: 'Invalid check payload', data: { code: 'invalid_body' } })
  }

  const mode = decideBrandCheckMode({
    userId: input.userId,
    force: input.force ?? false,
    quota: input.quota,
  })

  const { tablesDB, databaseId } = brandDb(event)

  // (1) Der Zwischenspeicher — VOR jeder Buchung und vor jedem Abruf.
  //
  // Die ABFRAGE läuft auch bei `force`, nur ihr Ergebnis zählt dann nicht: sie
  // ist zugleich der Lebenszeichen-Test der Ablage. Ohne sie merkte ein „neu
  // ermitteln" erst beim Speichern, dass die Tabelle fehlt — nachdem es ein
  // Modell bezahlt hat.
  let cached: BrandCheckRow | undefined
  try {
    const found = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [Query.equal('urlKey', urlKey), Query.orderDesc('$createdAt'), Query.limit(1)],
    })
    cached = mode.bypassCache ? undefined : found.rows[0]
  }
  catch (error) {
    // Fehlende Tabelle (Migration nicht gelaufen) oder kranke Appwrite. Beides
    // heisst für den Menschen davor dasselbe: „gerade nicht möglich" — und es
    // ist besser als ein Check, der gleich beim Speichern scheitert, nachdem
    // er ein Modell bezahlt hat.
    logEvent('warn', 'brand.check_unavailable', {
      host: hostOf(input.url),
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({ status: 503, statusText: 'Check unavailable', data: { code: 'check_unavailable' } })
  }

  if (cached && Date.parse(cached.$createdAt) > Date.now() - BRAND_CHECK_CACHE_MS) {
    logEvent('info', 'brand.check_completed', {
      host: hostOf(input.url),
      score: cached.score,
      ms: 0,
      cached: true,
    })
    return { id: cached.$id, cached: true }
  }

  // (2) Die eigene Brand, falls eine mitgeschickt wurde (§5 „Meine Brands").
  // Der Besitz ist beim Aufrufer geprüft; hier wird er nur aufgelöst.
  const profileId = typeof input.profileId === 'function'
    ? await input.profileId()
    : input.profileId ?? ''

  // (3) Die Deckel. Erst ab hier kostet der Aufruf etwas.
  const rejection = await bookBrandCheckQuota(event, {
    ipHash: brandCheckIpHash(event),
    quota: mode.quota,
    userId: input.userId,
  })
  if (rejection) {
    logEvent('info', 'brand.check_throttled', { code: rejection.code })
    throw createError({
      status: 429,
      statusText: 'Brand check limit reached',
      // `retryAfterSec` reist MIT, weil den Kopf die Route setzt (s. Kopf).
      data: { code: rejection.code, retryAfterSec: rejection.retryAfterSec },
    })
  }

  // (4a) Die Seite lesen — SSRF-Vertrag aus `shared/brandSiteAnalysis.ts`,
  // und seit BS1 R2b MIT der Erlaubnis-Frage davor (`brandCheckFetch.ts`).
  const started = Date.now()
  let site: Awaited<ReturnType<typeof fetchBrandSiteForCheck>>
  try {
    site = await fetchBrandSiteForCheck(input.url)
  }
  catch (error) {
    // ZUERST das Nein der Website (R2b). Es ist kein Fehlschlag: der Abruf lief,
    // die Antwort lautet „nicht ihr" — und daraus wird nie eine Zeile.
    if (error instanceof BrandSiteBlockedError) {
      logEvent('info', 'brand.check_blocked', {
        host: hostOf(input.url),
        // Der GRUND steht nur hier. Nach aussen reist genau EIN Schlüssel
        // (`domainReasonFrom` lässt nur `data.code` durch), und für den
        // Menschen davor ist die Auskunft dieselbe: diese Website will das
        // nicht. Der Betreiber, den es angeht, findet den Grund im Log.
        reason: error.reason,
        ms: Date.now() - started,
      })
      throw createError({
        // 409 und nicht 403: nicht WIR verweigern den Zugriff, sondern der
        // Zustand der fremden Website steht dem Ergebnis entgegen.
        status: 409,
        statusText: 'Website opted out',
        data: { code: 'site_blocked' },
      })
    }
    const code = error instanceof BrandSiteFetchError ? error.code : 'fetch_failed'
    logEvent('info', 'brand.check_fetch_failed', {
      code,
      // Der HOST, nie der Pfad: mit dem Pfad stünde eine private Adresse im Log.
      host: hostOf(input.url),
      ms: Date.now() - started,
    })
    throw createError({
      // „Da dürfen wir nicht hin" ist ein 400 (die ADRESSE ist das Problem);
      // alles andere ist ein 422 — die Adresse war in Ordnung, hinter ihr stand
      // nur nichts Lesbares. Ein 502 wäre die falsche Auskunft: nicht WIR sind
      // ausgefallen.
      status: code === 'blocked_target' ? 400 : 422,
      statusText: 'Website could not be checked',
      data: { code: code === 'blocked_target' ? 'blocked_target' : 'fetch_failed' },
    })
  }

  // (4b) Die sechzehn gerechneten Kriterien — deterministisch, ohne Modell.
  const measured = measureBrandCheck({
    content: site.content,
    signals: site.signals,
    finalUrl: site.finalUrl,
    httpsUpgraded: site.httpsUpgraded,
  })

  // (4c) Die vierundzwanzig beurteilten — EIN Aufruf.
  let judged: Awaited<ReturnType<typeof judgeBrandCheck>>
  try {
    judged = await judgeBrandCheck(event, { content: site.content, signals: site.signals })
  }
  catch (error) {
    logEvent('warn', 'brand.check_provider_error', {
      host: site.finalHost,
      ms: Date.now() - started,
      // Die MELDUNG des Anbieters, nie der Prompt und nie die Antwort.
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({ status: 503, statusText: 'Check unavailable', data: { code: 'check_unavailable' } })
  }

  // (4d) Zusammenlegen — in KATALOG-Reihenfolge, damit die Ergebnis-Seite
  // nichts sortieren muss. Was weder gemessen noch beurteilt wurde, ist
  // `null`: „nicht bewertbar", nicht „null Punkte".
  const criteria: BrandCheckCriterionResult[] = BRAND_CHECK_CRITERIA.map((criterion) => {
    const judgement = criterion.kind === 'judged' ? judged.judgements[criterion.id] : undefined
    const source = criterion.kind === 'measured' ? measured[criterion.id] : judgement
    return {
      id: criterion.id,
      category: criterion.category,
      kind: criterion.kind,
      score: source?.score ?? null,
      evidence: source?.evidence ?? '',
      // Der eine Satz des Modells. Gerechnete Kriterien haben keinen — ihr
      // Beleg IST die Begründung.
      note: judgement?.note ?? '',
    }
  })

  const scores: BrandCheckScores = {}
  for (const entry of criteria) scores[entry.id] = entry.score

  const computation = computeBrandCheck(scores)
  const findings: BrandCheckFinding[] = pickBrandCheckFindings(scores).map(criterionId => ({
    criterionId,
    evidence: criteria.find(entry => entry.id === criterionId)?.evidence ?? '',
  }))

  // (4e) Speichern. JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll
  // eine Entscheidung an dieser Stelle sein, kein stiller Default.
  let rowId: string
  try {
    const row = await tablesDB.createRow<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: ID.unique(),
      data: {
        urlKey,
        url: site.finalUrl.slice(0, 512),
        host: site.finalHost.slice(0, 256),
        locale: input.locale,
        score: computation.score,
        band: computation.band,
        scoreVersion: BRAND_CHECK_SCORE_VERSION,
        promptVersion: BRAND_CHECK_PROMPT_VERSION,
        model: judged.model.slice(0, 120),
        categories: JSON.stringify(computation.categories),
        criteria: JSON.stringify(criteria),
        findings: JSON.stringify(findings),
        // Der einzige Rest der gelesenen Seite (Plan §5, „kein Rohtext").
        textHash: createHash('sha256').update(site.content.text).digest('hex'),
        ipHash: brandCheckIpHash(event),
        // Die Branche kam im SELBEN Modell-Aufruf mit (Davids Entscheidung 2)
        // und ist bereits gegen den Katalog geprüft — `unknown`, wenn sie sich
        // aus der Seite nicht ergab.
        industry: judged.industry,
        rankingOptIn: input.rankingOptIn ?? false,
        // Ein frischer Check ist nie ausgeblendet: `hidden` ist die Antwort
        // des Betreibers auf einen Entfernungswunsch, kein Anfangszustand.
        hidden: false,
        userId: input.userId,
        profileId,
        // Heute prüft der Check Websites. 'document' kommt mit dem
        // Fundament-Check (§5b) und bekommt dort auch eine eigene
        // `scoreVersion` — die zwei Zahlen dürfen nie in einer verglichen
        // werden.
        source: 'website',
      },
    })
    rowId = row.$id
  }
  catch (error) {
    logEvent('warn', 'brand.check_unavailable', {
      host: site.finalHost,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({ status: 503, statusText: 'Check unavailable', data: { code: 'check_unavailable' } })
  }

  logEvent('info', 'brand.check_completed', {
    host: site.finalHost,
    score: computation.score,
    ms: Date.now() - started,
    cached: false,
  })

  return { id: rowId, cached: false }
}

/** Nur der Host — und nur, wenn sich die Eingabe überhaupt als URL lesen lässt. */
function hostOf(value: string): string {
  try {
    return new URL(value).host
  }
  catch {
    return ''
  }
}
