import type { GuardCandidate } from '../../../core/shared/disparagementGuard'
import { createDisparagementGuard } from '../../../core/shared/disparagementGuard'
import { evidenceIsGrounded } from '../../../core/shared/evidenceGrounding'
import type { InsightsBrand, InsightsPost, InsightsReviewIssue, InsightsSource } from '../../shared/insightsPost'
import { insightsBrandReviewIssues, insightsMethodologyLinked, insightsReviewIssues } from '../../shared/insightsPost'
import type { InsightsBrandRow } from '../../shared/insightsRows'
import { toInsightsBrand } from '../../shared/insightsRows'
import type { InsightsEvidenceReason } from '../../shared/types/insightsApi'
import { BrandSiteBlockedError, fetchBrandSiteForCheck } from '../contracts/brandContract'

/**
 * DAS SERVER-GATE DER SIEBEN PRÜFREGELN (§9.4) — jede Route, die einen Stand
 * öffentlich macht oder einen öffentlichen ändert, fragt HIER
 * (`insightsPublicationGate`): der Zustandswechsel UND seit BE-009 das
 * Speichern eines veröffentlichten Artikels. Erst prüfen, dann
 * veröffentlichen — auch beim zweiten Mal.
 *
 * Seit IN1 c (2026-11-17) gilt dasselbe für MARKEN-SEITEN
 * (`insightsBrandPublicationGate`): dieselben Quellen-Regeln, derselbe
 * Abruf mit derselben Frist, dasselbe Freigabe-Zeichen in der
 * Schreib-Funktion (`saveInsightsBrandRow`).
 *
 * ── WARUM DAS GATE AUF DEM SERVER SITZT UND NICHT IM EDITOR ──────────────
 * Der Editor zeigt dieselben Regeln, aber er ist eine Anzeige. Die Regeln
 * sind rechtlich teuer (Zitatschranke, Belegpflicht, Lizenz-Link,
 * Herabsetzung) — eine Sperre, die nur im Browser steht, ist mit einem
 * `curl` erledigt. `insightsReviewIssues` ist pur und wird deshalb an beiden
 * Enden gelesen; was der Server hinzufügt, ist der KONTEXT, den ein Browser
 * nicht haben kann: der abgerufene Quelltext, die Marken-Zeilen und der
 * Herabsetzungs-Riegel.
 *
 * ── WAS AUS EINEM FEHLGESCHLAGENEN ABRUF FOLGT ───────────────────────────
 * Eine Quelle, die wir nicht lesen DÜRFEN (robots.txt, TDM-Vorbehalt) oder
 * nicht lesen KÖNNEN (Netz, 404), bekommt einen LEEREN Text — und ein Zitat
 * findet sich in einem leeren Text nie. Sie gilt damit als nicht belegbar
 * (`quote_not_grounded`) statt als ungeprüft. Der Unterschied ist der ganze
 * Punkt: „ungeprüft" wäre ein stiller Durchlass an genau der Stelle, an der
 * das Produkt seine Zusage macht. Was die Redaktion dann tun muss, sagt ihr
 * die AMPEL (`insightsCheckEvidence`) mit ihrem Grund — nicht diese Liste.
 */

/**
 * WIE VIELE QUELLEN EIN GATE-LAUF HÖCHSTENS ABRUFT.
 *
 * Der Vertrag erlaubt 40 Quellen je Beitrag; 40 fremde Websites in einem
 * Request wären eine Minute Wartezeit und 40 Anfragen an fremde Server für
 * EINEN Knopfdruck. Zwanzig ist der Deckel, ab dem die Redaktion die Belege
 * einzeln über die Ampel prüft — die es genau dafür gibt.
 */
export const INSIGHTS_SOURCE_FETCH_MAX = 20

/**
 * DER TEXT EINER QUELLE, wie der Beleg-Riegel ihn sieht: Titel, Beschreibung
 * und Fliesstext hintereinander.
 *
 * Titel und Beschreibung gehören dazu, weil ein Zitat oft genau dort steht
 * (ein Claim, ein Slogan) — sie stehen im `head` und nicht im Fliesstext.
 */
function pageTextOf(content: { title: string, description: string, text: string }): string {
  return [content.title, content.description, content.text].filter(Boolean).join('\n')
}

export interface InsightsEvidenceOutcome {
  grounded: boolean
  reason: InsightsEvidenceReason
}

/**
 * EINE QUELLE PRÜFEN — deterministisch, ohne Modell (§9.4).
 *
 * Die Frage ist nicht „passt das zusammen?", sondern „steht dieser Satz
 * wörtlich auf dieser Seite?". Das kann man rechnen, und deshalb wird es
 * gerechnet: `evidenceIsGrounded` aus dem Fundament, derselbe Riegel wie im
 * Marktvergleich — „kein zweiter, kein weicherer".
 */
export async function insightsCheckEvidence(source: InsightsSource): Promise<InsightsEvidenceOutcome> {
  if (!source.url) return { grounded: false, reason: 'no_url' }
  try {
    const site = await fetchBrandSiteForCheck(source.url)
    const grounded = evidenceIsGrounded({ quote: source.quote, pageText: pageTextOf(site.content) })
    return { grounded, reason: grounded ? 'ok' : 'not_found' }
  }
  catch (error) {
    // ZUERST die Absage der Website, dann der Fehlschlag: das eine ist eine
    // Antwort („nicht ihr"), das andere ein Ausfall. Sie sehen für die
    // Redaktion gleich aus, verlangen aber verschiedene Arbeit.
    if (error instanceof BrandSiteBlockedError) {
      return { grounded: false, reason: error.reason === 'robots' ? 'robots_denied' : 'tdm_reserved' }
    }
    return { grounded: false, reason: 'fetch_failed' }
  }
}

/**
 * WELCHE QUELLEN EIN GATE-LAUF ABRUFEN MUSS — pur, damit ein Test es einzeln
 * zeigen kann.
 *
 * Ohne `published` (Zustandswechsel) ist es JEDE Quelle mit Zitat und
 * Adresse, wie seit I2. MIT `published` (ein veröffentlichter Artikel wird
 * geändert, BE-009) nur die, deren Paar (Adresse, Zitat) im öffentlichen
 * Stand NICHT schon vorkommt.
 *
 * ── WARUM DER UNVERÄNDERTE BELEG NICHT NOCH EINMAL ABGERUFEN WIRD ────────
 * Er ist beim Veröffentlichen geprüft worden — mit genau diesem Zitat an
 * genau dieser Adresse. Ihn bei jedem Tippfehler neu abzurufen hiesse zweierlei:
 * eine fremde Seite, die sich inzwischen geändert hat, blockierte eine
 * Korrektur am TEXT (die mit dem Beleg nichts zu tun hat), und jedes Speichern
 * wären bis zu zwanzig Anfragen an fremde Server. Wer den alten Beleg erneut
 * prüfen will, hat dafür die Ampel.
 *
 * Verglichen wird nach INHALT, nicht nach Index: wer Quellen umsortiert, hat
 * keinen Beleg geändert und löst keinen Abruf aus.
 *
 * Seit IN1 c (2026-11-17) braucht sie nur `{ sources }`: dieselbe Auswahl
 * gilt für eine Marken-Seite, die kein Beitrag ist.
 */
export function insightsSourcesToFetch(
  next: { readonly sources: readonly InsightsSource[] },
  published?: { readonly sources: readonly InsightsSource[] } | null,
): InsightsSource[] {
  const candidates = next.sources.filter(source => source.quote && source.url)
  if (!published) return candidates
  const pairOf = (source: InsightsSource) => JSON.stringify([source.url, source.quote])
  const known = new Set(published.sources.filter(source => source.quote && source.url).map(pairOf))
  return candidates.filter(source => !known.has(pairOf(source)))
}

/**
 * DIE GESAMTFRIST DER QUELLEN-ABRUFE EINES GATE-LAUFS (GA1 P18, BE-008).
 *
 * Bis zu zwanzig Quellen nacheinander, je bis zu 30 s, wären bis zu zehn
 * Minuten in EINER Anfrage — der Webserver reisst nach 60 s ab, die Redaktion
 * sähe einen Fehler, und der Beitrag würde im Hintergrund TROTZDEM
 * veröffentlicht. Nach 45 s wird deshalb kein Abruf mehr abgewartet: eine
 * Quelle, die bis dahin nicht gelesen ist, zählt wie eine nicht lesbare
 * (`''` = nicht belegbar). Das ist FAIL-CLOSED — mit einer solchen Quelle
 * besteht das Gate nicht, und es wird NICHT veröffentlicht. Die Frist steht
 * hier, an der EINEN Stelle, durch die beide Aufrufer des Gates gehen
 * (Zustandswechsel und Speichern eines veröffentlichten Beitrags).
 */
export const INSIGHTS_GATE_FETCH_BUDGET_MS = 45_000

export interface InsightsSourceTextsOptions {
  /** Vorgabe `INSIGHTS_GATE_FETCH_BUDGET_MS`. */
  budgetMs?: number
  /** Die Uhr der Frist — Vorgabe `Date.now`, injizierbar für den Test. */
  now?: () => number
}

export interface InsightsSourceTextsResult {
  /** Adresse ⇒ Seitentext; `''` heisst „nicht belegbar". */
  texts: Record<string, string>
  /** Wie viele Quellen in der Frist NICHT gelesen wurden (in `texts` als `''`). */
  timedOut: number
}

/**
 * DIE TEXTE DER AUSGEWÄHLTEN QUELLEN — für den Gate-Lauf.
 *
 * Nacheinander und nicht parallel: zwanzig gleichzeitige Anfragen an fremde
 * Server sind ein kleiner Lastangriff, und der Betreiber wartet ohnehin auf
 * eine einzige Antwort. Quellen OHNE Zitat kommen gar nicht erst herein
 * (`insightsSourcesToFetch`) — es gibt nichts zu belegen, und ein Abruf dafür
 * wäre eine Anfrage an einen fremden Server ohne Zweck.
 *
 * `own-data` wird NICHT ausgenommen: eine eigene Zahl ist auch ein Beleg, ihre
 * Adresse ist öffentlich, und eine Ausnahme wäre die Regel „unsere Zitate
 * prüfen wir nicht".
 *
 * DIE FRIST (`INSIGHTS_GATE_FETCH_BUDGET_MS`): ein Abruf, der bei Fristende
 * noch läuft, wird nicht weiter abgewartet (er läuft im Hintergrund aus, sein
 * Fehler ist gefangen); jede danach noch offene Quelle wird gar nicht erst
 * abgerufen. Beide zählen in `timedOut` und stehen als `''` in `texts`.
 */
export async function insightsSourceTexts(
  sources: readonly InsightsSource[],
  options: InsightsSourceTextsOptions = {},
): Promise<InsightsSourceTextsResult> {
  const now = options.now ?? Date.now
  const deadline = now() + (options.budgetMs ?? INSIGHTS_GATE_FETCH_BUDGET_MS)
  const texts: Record<string, string> = {}
  let fetched = 0
  let timedOut = 0
  for (const source of sources) {
    if (!source.quote || !source.url) continue
    if (texts[source.url] !== undefined) continue
    if (fetched >= INSIGHTS_SOURCE_FETCH_MAX) break
    const remaining = deadline - now()
    if (remaining <= 0) {
      // In der Frist nicht mehr begonnen — zählt wie nicht lesbar (s. oben).
      texts[source.url] = ''
      timedOut += 1
      continue
    }
    fetched += 1
    const outcome = await withinBudget(fetchSourceText(source.url), remaining)
    if (outcome === TIMED_OUT) {
      texts[source.url] = ''
      timedOut += 1
      continue
    }
    // Leer statt fehlend: nicht lesbar heisst nicht belegbar (s. Kopf).
    texts[source.url] = outcome ?? ''
  }
  return { texts, timedOut }
}

/**
 * Ein Abruf, der NIE ablehnt: Text, oder `null` bei jedem Fehler. So darf er
 * nach der Frist im Hintergrund auslaufen, ohne als unbehandelte Ablehnung
 * den Prozess mitzunehmen.
 */
async function fetchSourceText(url: string): Promise<string | null> {
  try {
    const site = await fetchBrandSiteForCheck(url)
    return pageTextOf(site.content)
  }
  catch {
    return null
  }
}

const TIMED_OUT = Symbol('timed-out')

/**
 * Auf einen Abruf höchstens `ms` warten. Der Zeitgeber wird in jedem Fall
 * geräumt und hält den Prozess nicht am Leben (`unref`).
 */
async function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) timer.unref()
  })
  try {
    return await Promise.race([work, expired])
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * DER HERABSETZUNGS- UND NAMENSFILTER FÜR EINEN BEITRAG (Prüfregel 4).
 *
 * ── DIE KANDIDATEN SIND DIE MARKEN, ÜBER DIE DIESER BEITRAG NICHT REDET ──
 * Das ist der einzige Zuschnitt, der hier trägt, und er verdient eine
 * Begründung, weil der naheliegende falsch ist: Setzt man die Marken des
 * Beitrags als Kandidaten ein, sperrt der Riegel genau den Namen, um den es
 * geht — ein Markenprofil über Nike wäre an seinem eigenen Titel blockiert.
 * `createDisparagementGuard` sagt das im Kopf ausdrücklich: „Die EIGENE Marke
 * gehört ausdrücklich NICHT in `candidates`: der Text redet über sie."
 *
 * Für einen redaktionellen Beitrag sind „die eigenen" die Marken, die er
 * VERWEIST (`brandRefs`) — sie stehen im Quellen- und Marken-Panel, sie haben
 * eine Zeile, an der ein Korrekturvorschlag ankommt, und sie zu nennen ist der
 * Zweck. Alle ÜBRIGEN Marken-Zeilen sind die Kandidaten: taucht eine davon im
 * Text auf, ohne verwiesen zu sein, ist das kein Formfehler, sondern genau der
 * Fall aus Prüfregel 6 — eine genannte Marke ohne Ort für den Widerspruch. Der
 * Riegel zeigt die Stelle; die Redaktion trägt die Marke nach oder streicht sie.
 *
 * ── DIE WORTLISTE GILT IMMER ─────────────────────────────────────────────
 * `DISPARAGING_TERMS` hängt nicht an den Kandidaten. Auch ein Beitrag ohne
 * jede Marken-Zeile wird also auf Herabsetzung geprüft — das ist § 6 UWG und
 * nicht die Frage, über wen geredet wird.
 */
export function insightsFlagText(
  post: InsightsPost,
  brandRows: readonly InsightsBrandRow[],
): (text: string) => readonly string[] {
  const referenced = new Set(post.brandRefs.map(ref => ref.brandId))
  for (const entry of post.ranking?.entries ?? []) {
    if (entry.brandId) referenced.add(entry.brandId)
  }

  const candidates: GuardCandidate[] = []
  const ownTexts: string[] = []
  for (const row of brandRows) {
    if (row.state === 'removed') continue
    const brand = toInsightsBrand(row)
    if (referenced.has(row.$id)) {
      ownTexts.push(brand.name)
      if (brand.homepage) ownTexts.push(brand.homepage)
      continue
    }
    candidates.push({ name: brand.name, url: brand.homepage || undefined })
  }

  const guard = createDisparagementGuard(candidates, { ownTexts })
  return (text: string) => {
    const reason = guard.check(text)
    return reason ? [reason] : []
  }
}

/**
 * DIE PRÜFREGELN OHNE ABRUF — was der Editor beim ÖFFNEN sieht.
 *
 * Sechs der sieben Regeln kosten nichts (Herausgeber, Datum, Lizenz,
 * Beleg-Zeiger, Marken-Zeile, Methodik-Link, Herabsetzung). Nur die
 * Beleg-Prüfung braucht fremde Server, und die soll nicht bei jedem Öffnen
 * zwanzig Anfragen auslösen. Fehlt `sourceTexts`, PRÜFT die Regel nicht — und
 * genau deshalb ist der Gate-Lauf ein anderer (`insightsPublicationGate`).
 */
export function insightsFormIssues(
  post: InsightsPost,
  brandRows: readonly InsightsBrandRow[],
): InsightsReviewIssue[] {
  return insightsReviewIssues(post, {
    flagText: insightsFlagText(post, brandRows),
    knownBrandIds: insightsKnownBrandIds(brandRows),
    methodologyLinked: insightsMethodologyLinked(post),
  })
}

// ── Das Gate und sein Freigabe-Zeichen (BE-009) ────────────────────────────

/**
 * DAS FREIGABE-ZEICHEN — der Beleg, dass GENAU DIESER Stand die Prüfung
 * bestanden hat (oder öffentlich nichts Ungeprüftes zeigt).
 *
 * ── SICHERUNGEN GEHÖREN IN DIE SCHNITTSTELLE, NICHT IN DIE DISZIPLIN ─────
 * Bis BE-009 hing die Prüfung daran, dass eine Route sie RIEF. Der PATCH rief
 * sie nicht, und jede Änderung an einem veröffentlichten Artikel war sofort
 * öffentlich, an den sieben Regeln vorbei. Jetzt verlangt die Schreib-Funktion
 * (`saveInsightsPostRow`) für jeden öffentlichen Stand ein Zeichen — ein neuer
 * Weg, der die Prüfung vergisst, scheitert beim Schreiben statt still zu
 * veröffentlichen.
 *
 * Ausstellen kann es NUR dieses Modul: gültig ist ein Zeichen nur, wenn es in
 * der modul-privaten `WeakMap` steht. Ein von Hand gebautes `{ post }` hat die
 * Form, aber keinen Eintrag — und gilt deshalb nicht. Gebunden ist es an das
 * OBJEKT, das geprüft wurde, UND an dessen Inhalt zum Zeitpunkt der Prüfung:
 * wer den geprüften Stand danach noch verändert, hat einen ungeprüften.
 */
export interface InsightsPublicClearance {
  readonly post: InsightsPost
  readonly kind: 'gate' | 'hidden-translation'
}

/**
 * DAS ZEICHEN FÜR EINE MARKEN-SEITE (IN1 c, 2026-11-17) — dieselbe Bauart,
 * eine eigene Form: ein Beitrags-Zeichen trägt `post`, dieses `brand`. So
 * kann der Typ-Prüfer ein Zeichen der einen Tabelle gar nicht erst an die
 * Schreib-Funktion der anderen reichen; zur Laufzeit hält es ohnehin die
 * Bindung an das geprüfte Objekt.
 */
export interface InsightsBrandClearance {
  readonly brand: InsightsBrand
  readonly kind: 'brand-gate'
}

/**
 * EIN Verzeichnis für beide Zeichen-Arten (seit IN1 c verallgemeinert statt
 * verdoppelt): Schlüssel ist das Zeichen, Wert das geprüfte Objekt und sein
 * Inhalt zum Zeitpunkt der Prüfung.
 */
const issuedClearances = new WeakMap<object, { subject: object, snapshot: string }>()

function registerClearance<C extends object>(clearance: C, subject: object): C {
  issuedClearances.set(clearance, { subject, snapshot: JSON.stringify(subject) })
  return clearance
}

function clearanceCovers(clearance: object | null | undefined, subject: object): boolean {
  if (!clearance) return false
  const issued = issuedClearances.get(clearance)
  return !!issued && issued.subject === subject && issued.snapshot === JSON.stringify(subject)
}

function issueClearance(post: InsightsPost, kind: InsightsPublicClearance['kind']): InsightsPublicClearance {
  return registerClearance<InsightsPublicClearance>(Object.freeze({ post, kind }), post)
}

/** Deckt das Zeichen genau diesen Stand? Nur ein hier ausgestelltes, nur für
 *  dasselbe Objekt, nur solange es unverändert ist. */
export function insightsClearanceCovers(clearance: InsightsPublicClearance | null | undefined, post: InsightsPost): boolean {
  return clearanceCovers(clearance, post)
}

/** Dasselbe für eine Marken-Seite (IN1 c). */
export function insightsBrandClearanceCovers(clearance: InsightsBrandClearance | null | undefined, brand: InsightsBrand): boolean {
  return clearanceCovers(clearance, brand)
}

export interface InsightsGateInput {
  /** Der Stand, der öffentlich werden oder bleiben soll. */
  next: InsightsPost
  /**
   * Der Stand, der HEUTE öffentlich ist — nur beim Ändern eines
   * veröffentlichten Artikels. Fehlt er, wird jede Quelle mit Zitat abgerufen
   * (Zustandswechsel).
   */
  published?: InsightsPost | null
  brandRows: readonly InsightsBrandRow[]
}

/**
 * `sourcesTimedOut` (GA1 P18): wie viele Quellen in der Gesamtfrist nicht
 * gelesen wurden. Sie stehen schon als `quote_not_grounded` in `issues`; die
 * Zahl sagt der Redaktion nur, dass ein zweiter Versuch reichen KANN.
 */
export type InsightsGateVerdict =
  | { passed: true, issues: InsightsReviewIssue[], clearance: InsightsPublicClearance, sourcesTimedOut: number }
  | { passed: false, issues: InsightsReviewIssue[], sourcesTimedOut: number }

/**
 * DAS GATE DER SIEBEN PRÜFREGELN — der EINE Einstieg, den Routen rufen.
 *
 * Die Regeln OHNE Abruf laufen immer über den ganzen `next`. Der Abruf läuft
 * über die Auswahl aus `insightsSourcesToFetch` — beim Zustandswechsel alle
 * Quellen, beim Ändern eines veröffentlichten Artikels nur die neuen oder
 * geänderten Belege (Begründung dort).
 *
 * Ein `quote_not_grounded` zählt nur für eine Quelle, die auch AUSGEWÄHLT war:
 * teilt sich ein unveränderter Beleg die Adresse mit einem geänderten, liegt
 * zwar der frische Seitentext vor — aber der alte Beleg ist beim
 * Veröffentlichen geprüft worden und soll aus demselben Grund nicht an einer
 * geänderten fremden Seite hängen.
 *
 * Bestanden ⇒ ein Zeichen für GENAU `next`; nicht bestanden ⇒ die Liste.
 */
export async function insightsPublicationGate(input: InsightsGateInput): Promise<InsightsGateVerdict> {
  const { next, published, brandRows } = input
  const fetched = await fetchSelectedSources(next, published)
  const issues = insightsReviewIssues(next, {
    sourceTexts: fetched.texts,
    flagText: insightsFlagText(next, brandRows),
    knownBrandIds: insightsKnownBrandIds(brandRows),
    methodologyLinked: insightsMethodologyLinked(next),
  }).filter(issue => fetched.counts(issue))
  if (issues.length > 0) return { passed: false, issues, sourcesTimedOut: fetched.timedOut }
  return { passed: true, issues: [], clearance: issueClearance(next, 'gate'), sourcesTimedOut: fetched.timedOut }
}

/**
 * DER ABRUF-TEIL BEIDER GATES (seit IN1 c herausgezogen) — Auswahl, Abruf
 * mit Frist, und die Regel, dass ein `quote_not_grounded` nur für eine
 * AUSGEWÄHLTE Quelle zählt (Begründung an `insightsPublicationGate`). Eine
 * Stelle, damit Beitrag und Marke nicht zwei Fassungen derselben Ausnahme
 * bekommen.
 */
async function fetchSelectedSources(
  next: { readonly sources: readonly InsightsSource[] },
  published: { readonly sources: readonly InsightsSource[] } | null | undefined,
): Promise<{ texts: Record<string, string>, timedOut: number, counts: (issue: InsightsReviewIssue) => boolean }> {
  const selected = insightsSourcesToFetch(next, published)
  const chosen = new Set<InsightsSource>(selected)
  const fetched = await insightsSourceTexts(selected)
  const counts = (issue: InsightsReviewIssue): boolean => {
    if (issue.code !== 'quote_not_grounded' || issue.at?.kind !== 'source') return true
    const source = next.sources[issue.at.index]
    return !!source && chosen.has(source)
  }
  return { texts: fetched.texts, timedOut: fetched.timedOut, counts }
}

// ── Das Gate der Marken-Seiten (IN1 c, 2026-11-17) ─────────────────────────

/**
 * DER HERABSETZUNGS- UND NAMENSFILTER FÜR EINE MARKEN-SEITE.
 *
 * Dieselbe Überlegung wie bei `insightsFlagText`: Kandidaten sind die
 * Marken, über die diese Seite NICHT redet. „Die eigenen" sind die Marke
 * selbst — mit Name und Homepage aus dem NEUEN Stand, damit eine Umbenennung
 * sich nicht am eigenen Namen sperrt — und die Marken unter `relations`: sie
 * stehen verlinkt auf der Seite und haben eine Zeile, an der ein
 * Korrekturvorschlag ankommt, das genaue Gegenstück zu den Marken-Verweisen
 * eines Beitrags. Alle ÜBRIGEN nicht entfernten Zeilen sind Kandidaten. Die
 * Wortliste gilt immer.
 */
export function insightsBrandFlagText(
  brand: InsightsBrand,
  selfId: string,
  brandRows: readonly InsightsBrandRow[],
): (text: string) => readonly string[] {
  const related = new Set(brand.relations)
  const ownTexts: string[] = [brand.name]
  if (brand.homepage) ownTexts.push(brand.homepage)
  const candidates: GuardCandidate[] = []
  for (const row of brandRows) {
    if (row.state === 'removed' || row.$id === selfId) continue
    const other = toInsightsBrand(row)
    if (related.has(row.$id)) {
      ownTexts.push(other.name)
      if (other.homepage) ownTexts.push(other.homepage)
      continue
    }
    candidates.push({ name: other.name, url: other.homepage || undefined })
  }
  const guard = createDisparagementGuard(candidates, { ownTexts })
  return (text: string) => {
    const reason = guard.check(text)
    return reason ? [reason] : []
  }
}

export interface InsightsBrandGateInput {
  /** Der Stand, der veröffentlicht werden oder bleiben soll. */
  next: InsightsBrand
  /**
   * Der HEUTE veröffentlichte Stand — nur wenn die Zeile schon `published`
   * ist. Dann werden nur neue oder geänderte Belege abgerufen.
   */
  published?: InsightsBrand | null
  brandRows: readonly InsightsBrandRow[]
  /** Die Zeilen-Id der Marke selbst — sie ist kein Kandidat ihres Filters. */
  selfId: string
}

export type InsightsBrandGateVerdict =
  | { passed: true, issues: InsightsReviewIssue[], clearance: InsightsBrandClearance, sourcesTimedOut: number }
  | { passed: false, issues: InsightsReviewIssue[], sourcesTimedOut: number }

/**
 * DAS GATE EINER MARKEN-SEITE (IN1 c, 2026-11-17) — der EINE Einstieg für
 * Marken, gebaut wie `insightsPublicationGate`: Regeln ohne Abruf immer über
 * die ganze Zeile, Abruf über dieselbe Auswahl und dieselbe Frist (nicht
 * gelesen = nicht belegt), Zeichen nur bei bestandener Prüfung und nur für
 * GENAU `next`.
 */
export async function insightsBrandPublicationGate(input: InsightsBrandGateInput): Promise<InsightsBrandGateVerdict> {
  const { next, published, brandRows, selfId } = input
  const fetched = await fetchSelectedSources(next, published)
  const issues = insightsBrandReviewIssues(next, {
    sourceTexts: fetched.texts,
    flagText: insightsBrandFlagText(next, selfId, brandRows),
  }).filter(issue => fetched.counts(issue))
  if (issues.length > 0) return { passed: false, issues, sourcesTimedOut: fetched.timedOut }
  const clearance = registerClearance<InsightsBrandClearance>(Object.freeze({ brand: next, kind: 'brand-gate' as const }), next)
  return { passed: true, issues: [], clearance, sourcesTimedOut: fetched.timedOut }
}

/** Die Felder, die ein Übersetzen-Lauf ändern darf — ausser den Texten der
 *  Nicht-Grundsprache (die hängen an `baseLocale`). */
const TRANSLATION_RUN_FIELDS = ['translatedAt', 'translationModel', 'translationPromptVersion', 'translationReviewed'] as const

function withoutTranslation(post: InsightsPost, target: 'de' | 'en'): string {
  const dropped = new Set<string>([
    ...TRANSLATION_RUN_FIELDS,
    ...(target === 'de' ? ['titleDe', 'dekDe', 'bodyDe'] : ['titleEn', 'dekEn', 'bodyEn']),
  ])
  // Nach Schlüssel sortiert: die Reihenfolge der Felder ist keine Änderung.
  const kept = Object.entries(post)
    .filter(([key]) => !dropped.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(kept)
}

/**
 * DAS ENGE ZEICHEN FÜR DEN ÜBERSETZEN-LAUF — ohne Prüfung, und das ist
 * begründet.
 *
 * Der Lauf ist BEZAHLT; sein Ergebnis wird nicht verworfen, weil ein
 * veröffentlichter Artikel daneben steht (klemmen statt ablehnen). Und er
 * zeigt öffentlich nichts Neues: die frische Maschinen-Fassung trägt
 * `translationReviewed: false` und ist damit ausgeblendet
 * (`insightsPublicKopf`). Öffentlich wird sie erst über das Häkchen im PATCH
 * — und der läuft durch das Gate.
 *
 * Deshalb ist das Zeichen ENG: es gilt nur, wenn das Häkchen aus ist UND sich
 * `next` von `current` AUSSCHLIESSLICH in Titel/Vorspann/Text der
 * Nicht-Grundsprache und in den vier Übersetzungs-Feldern unterscheidet. Jede
 * andere Abweichung (ein Wort in der Grundfassung, eine Quelle, das Häkchen)
 * ⇒ `null`, und die Schreib-Funktion lehnt ab.
 */
export function insightsHiddenTranslationClearance(current: InsightsPost, next: InsightsPost): InsightsPublicClearance | null {
  if (next.translationReviewed !== false) return null
  if (next.baseLocale !== current.baseLocale) return null
  const target = current.baseLocale === 'de' ? 'en' : 'de'
  if (withoutTranslation(current, target) !== withoutTranslation(next, target)) return null
  return issueClearance(next, 'hidden-translation')
}
