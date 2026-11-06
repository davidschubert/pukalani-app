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
 * DAS SERVER-GATE DER SECHS PRÜFREGELN (§9.4) — die Route, die einen
 * Zustandswechsel erlaubt, fragt HIER.
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
 * DIE TEXTE ALLER QUELLEN EINES BEITRAGS — für den Gate-Lauf.
 *
 * Nacheinander und nicht parallel: zwanzig gleichzeitige Anfragen an fremde
 * Server sind ein kleiner Lastangriff, und der Betreiber wartet ohnehin auf
 * eine einzige Antwort. Quellen OHNE Zitat werden übersprungen — es gibt
 * nichts zu belegen, und ein Abruf dafür wäre eine Anfrage an einen fremden
 * Server ohne Zweck.
 *
 * `own-data` wird NICHT ausgenommen: eine eigene Zahl ist auch ein Beleg, ihre
 * Adresse ist öffentlich, und eine Ausnahme wäre die Regel „unsere Zitate
 * prüfen wir nicht".
 */
export async function insightsSourceTexts(post: InsightsPost): Promise<Record<string, string>> {
  const texts: Record<string, string> = {}
  let fetched = 0
  for (const source of post.sources) {
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
 * Fünf der sechs Regeln kosten nichts (Herausgeber, Datum, Lizenz,
 * Beleg-Zeiger, Marken-Zeile, Methodik-Link, Herabsetzung). Nur die
 * Beleg-Prüfung braucht fremde Server, und die soll nicht bei jedem Öffnen
 * zwanzig Anfragen auslösen. Fehlt `sourceTexts`, PRÜFT die Regel nicht — und
 * genau deshalb ist der Gate-Lauf ein anderer (`insightsGateIssues`).
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

/**
 * DIE PRÜFREGELN MIT VOLLEM KONTEXT — was einen Zustandswechsel erlaubt oder
 * verhindert. Der einzige Unterschied zum Form-Lauf sind die abgerufenen
 * Quelltexte; er ist der teure, und er ist der verbindliche.
 */
export async function insightsGateIssues(
  post: InsightsPost,
  brandRows: readonly InsightsBrandRow[],
): Promise<InsightsReviewIssue[]> {
  return insightsReviewIssues(post, {
    sourceTexts: await insightsSourceTexts(post),
    flagText: insightsFlagText(post, brandRows),
    knownBrandIds: insightsKnownBrandIds(brandRows),
    methodologyLinked: insightsMethodologyLinked(post),
  })
}
