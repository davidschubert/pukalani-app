import type { GuardCandidate } from '../../../core/shared/disparagementGuard'
import { createDisparagementGuard } from '../../../core/shared/disparagementGuard'
import { evidenceIsGrounded } from '../../../core/shared/evidenceGrounding'
import type { InsightsPost, InsightsReviewIssue, InsightsSource } from '../../shared/insightsPost'
import { insightsMethodologyLinked, insightsReviewIssues } from '../../shared/insightsPost'
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
 */
export function insightsSourcesToFetch(next: InsightsPost, published?: InsightsPost | null): InsightsSource[] {
  const candidates = next.sources.filter(source => source.quote && source.url)
  if (!published) return candidates
  const pairOf = (source: InsightsSource) => JSON.stringify([source.url, source.quote])
  const known = new Set(published.sources.filter(source => source.quote && source.url).map(pairOf))
  return candidates.filter(source => !known.has(pairOf(source)))
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
 */
export async function insightsSourceTexts(sources: readonly InsightsSource[]): Promise<Record<string, string>> {
  const texts: Record<string, string> = {}
  let fetched = 0
  for (const source of sources) {
    if (!source.quote || !source.url) continue
    if (texts[source.url] !== undefined) continue
    if (fetched >= INSIGHTS_SOURCE_FETCH_MAX) break
    fetched += 1
    try {
      const site = await fetchBrandSiteForCheck(source.url)
      texts[source.url] = pageTextOf(site.content)
    }
    catch {
      // Leer statt fehlend: nicht lesbar heisst nicht belegbar (s. Kopf).
      texts[source.url] = ''
    }
  }
  return texts
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

const issuedClearances = new WeakMap<InsightsPublicClearance, { post: InsightsPost, snapshot: string }>()

function issueClearance(post: InsightsPost, kind: InsightsPublicClearance['kind']): InsightsPublicClearance {
  const clearance: InsightsPublicClearance = Object.freeze({ post, kind })
  issuedClearances.set(clearance, { post, snapshot: JSON.stringify(post) })
  return clearance
}

/** Deckt das Zeichen genau diesen Stand? Nur ein hier ausgestelltes, nur für
 *  dasselbe Objekt, nur solange es unverändert ist. */
export function insightsClearanceCovers(clearance: InsightsPublicClearance | null | undefined, post: InsightsPost): boolean {
  if (!clearance) return false
  const issued = issuedClearances.get(clearance)
  return !!issued && issued.post === post && issued.snapshot === JSON.stringify(post)
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

export type InsightsGateVerdict =
  | { passed: true, issues: InsightsReviewIssue[], clearance: InsightsPublicClearance }
  | { passed: false, issues: InsightsReviewIssue[] }

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
  const selected = insightsSourcesToFetch(next, published)
  const chosen = new Set<InsightsSource>(selected)
  const issues = insightsReviewIssues(next, {
    sourceTexts: await insightsSourceTexts(selected),
    flagText: insightsFlagText(next, brandRows),
    knownBrandIds: insightsKnownBrandIds(brandRows),
    methodologyLinked: insightsMethodologyLinked(next),
  }).filter((issue) => {
    if (issue.code !== 'quote_not_grounded' || issue.at?.kind !== 'source') return true
    const source = next.sources[issue.at.index]
    return !!source && chosen.has(source)
  })
  if (issues.length > 0) return { passed: false, issues }
  return { passed: true, issues: [], clearance: issueClearance(next, 'gate') }
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
