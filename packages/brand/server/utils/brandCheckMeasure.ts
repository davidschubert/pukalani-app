import type { BrandSiteContent, BrandSiteSignals } from '../../shared/brandSiteAnalysis'
import { BRAND_CHECK_CRITERIA, type BrandCheckScoreValue } from '../../shared/brandCheck'

/**
 * DIE SECHZEHN GERECHNETEN KRITERIEN (docs/archiv/BRAND-CHECK.md §3, alle mit
 * **M** markiert) — deterministisch, ohne Modell, ohne Netz.
 *
 * ── WARUM DAS DIE HÄLFTE DES PRODUKTVERSPRECHENS IST ──────────────────────
 * „Fundiert statt gefühlt" (Plan §2) ist kein Marketing-Satz, sondern eine
 * Bauvorgabe: was man messen kann, wird gemessen und fällt bei derselben Seite
 * immer gleich aus. Das Modell bekommt nur die Fragen, die ein Mensch
 * beantworten müsste — und selbst dort mit Pflicht-Beleg.
 *
 * ── DIE ZAHLEN KOMMEN VON DRAUSSEN, DIE REGEL STEHT HIER ──────────────────
 * `extractSiteSignals()` (shared) zählt, diese Datei urteilt. Wer die
 * 0/1/2-Schwelle verschiebt, fasst genau eine Funktion an; wer eine neue
 * Messung braucht, genau die andere. Zusammengelegt wäre jede Regeländerung
 * ein Eingriff in die Extraktion — und die ist die Stelle, an der ein Fehler
 * still falsche Punkte erzeugt.
 *
 * ── `null` IST EIN ERLAUBTES ERGEBNIS, AUCH HIER ──────────────────────────
 * Zwei gerechnete Kriterien können ehrlich nicht antworten: die
 * Sprach-Konsistenz (c4) bei einer Seite, deren Sprache wir nicht prüfen
 * können, und die Jargon-Dichte (e5) bei einer Seite mit zwanzig Wörtern
 * Text. Eine 0 wäre dort eine Behauptung über etwas, das wir nicht angesehen
 * haben — `null` nimmt das Kriterium aus der Normalisierung (§3
 * „stufen-bewusst").
 *
 * ── DIE BELEGE SIND MESSWERTE, KEINE SÄTZE ───────────────────────────────
 * `title 42 · description 0` statt „Der Titel ist gut, die Beschreibung
 * fehlt". Zwei Gründe: ein Messwert braucht keine Übersetzung (die
 * Ergebnis-Seite spricht die Sprache ihres LESERS, die Belege der beurteilten
 * Kriterien die der geprüften SEITE — ein dritter Sprachfall wäre einer zu
 * viel), und eine Zahl lässt sich nachrechnen, ein Urteil nicht.
 */

/** So lang darf ein Beleg werden — dieselbe Grenze wie beim Modell (Plan §2). */
export const BRAND_CHECK_EVIDENCE_MAX = 160

export interface BrandCheckMeasurement {
  score: BrandCheckScoreValue
  evidence: string
}

export interface BrandCheckMeasureInput {
  content: BrandSiteContent
  signals: BrandSiteSignals
  /** Die Adresse NACH allen Weiterleitungen — Grundlage von h3. */
  finalUrl: string
  /** Haben wir den Sprung http → https selbst beobachtet? */
  httpsUpgraded: boolean
}

/** Beleg kürzen — nie mitten in einem Zeichen, nie mit Rest-Leerzeichen. */
function evidence(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, BRAND_CHECK_EVIDENCE_MAX)
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

/** „Wie viele von dreien?" → 0/1/2 mit der Plan-Schwelle „alle · zwei · Rest". */
function ofThree(hits: number): 0 | 1 | 2 {
  if (hits >= 3) return 2
  if (hits === 2) return 1
  return 0
}

/** „Wie viele von zweien?" — die häufigste Form im Katalog. */
function ofTwo(hits: number): 0 | 1 | 2 {
  if (hits >= 2) return 2
  if (hits === 1) return 1
  return 0
}

/** Bedeutungstragende Wörter einer Beschriftung, kleingeschrieben. */
function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length >= 3)
}

/**
 * Wie stark decken sich zwei Beschriftungen? Anteil gemeinsamer Wörter an der
 * KÜRZEREN von beiden — „Kailua Coffee" und „Kailua Coffee · Rösterei in
 * Honolulu" sollen deckungsgleich heissen, nicht „zur Hälfte".
 */
function overlap(a: string, b: string): number {
  const left = new Set(tokens(a))
  const right = new Set(tokens(b))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.min(left.size, right.size)
}

/**
 * WÖRTER, DIE EINE HANDLUNG BENENNEN (d1) — deutsch und englisch, weil die
 * geprüfte Seite beides sein kann und wir ihre Sprache an dieser Stelle nicht
 * kennen müssen. Bewusst KURZ und bewusst unvollständig: die Liste soll ein
 * „Jetzt buchen" von einem „Impressum" unterscheiden, nicht jede denkbare
 * Aufforderung katalogisieren. Ein verfehltes 2 wird hier zur 1, nie zur 0 —
 * die Beschriftung existiert ja.
 */
const ACTION_WORDS: readonly string[] = [
  'start', 'starten', 'jetzt', 'now', 'book', 'buchen', 'buy', 'kaufen', 'order', 'bestellen',
  'get', 'hol', 'holen', 'try', 'testen', 'test', 'discover', 'entdecken', 'learn', 'erfahren',
  'sign', 'anmelden', 'register', 'registrieren', 'login', 'einloggen', 'join', 'mitmachen',
  'download', 'herunterladen', 'request', 'anfragen', 'anfrage', 'contact', 'kontaktiere',
  'schreib', 'schreiben', 'call', 'anrufen', 'subscribe', 'abonnieren', 'explore', 'erkunde',
  'see', 'ansehen', 'view', 'demo', 'termin', 'schedule', 'reserve', 'reservieren', 'send',
  'senden', 'apply', 'bewerben', 'create', 'erstelle', 'erstellen', 'build', 'baue', 'shop',
]

/** Trägt diese Beschriftung ein Handlungswort? */
function hasActionWord(text: string): boolean {
  const words = new Set(tokens(text))
  return ACTION_WORDS.some(action => words.has(action))
}

/**
 * PLATZHALTER-SPUREN (h2). „lorem" allein steht nicht in der Liste: es ist ein
 * gewöhnliches Wort in mehreren romanischen Sprachen und würde einer echten
 * Seite eine 0 geben. Gesucht werden nur Zeichenketten, die niemand
 * versehentlich schreibt.
 */
const PLACEHOLDER_MARKS: readonly string[] = [
  'lorem ipsum',
  'dolor sit amet',
  'consectetur adipiscing',
  'hier steht ihr',
  'ihr text hier',
  'dein text hier',
  'your text here',
  'placeholder text',
  'dummy text',
  'blindtext',
  'beispieltext',
  'sample text',
  'text goes here',
]

/** Ganze Wörter, die für sich schon ein unfertiges Feld verraten. */
const PLACEHOLDER_WORDS: readonly string[] = ['todo', 'tbd', 'platzhalter', 'fixme', 'xxxxx']

/**
 * STOPPWÖRTER FÜR DIE SPRACHPROBE (c4) — die häufigsten Funktionswörter, die es
 * in der jeweils anderen Sprache nicht gibt. Kein Sprachdetektor, sondern der
 * kleinste ehrliche Test: passt das `lang`-Attribut zum Text oder widerspricht
 * es ihm? Alles, was wir NICHT so entscheiden können, wird `null`.
 */
const GERMAN_MARKERS: readonly string[] = ['und', 'der', 'die', 'das', 'nicht', 'mit', 'für', 'auch', 'wir', 'ist', 'ein', 'eine', 'sich', 'oder', 'aber']
const ENGLISH_MARKERS: readonly string[] = ['the', 'and', 'you', 'for', 'with', 'our', 'that', 'this', 'are', 'from', 'your', 'have', 'about', 'more', 'their']

function markerHits(words: readonly string[], markers: readonly string[]): number {
  let hits = 0
  for (const word of words) if (markers.includes(word)) hits += 1
  return hits
}

/** Erst so viele Wörter machen aus einer Stichprobe eine Aussage. */
const LANGUAGE_MIN_WORDS = 60
/** Der Vorsprung, ab dem eine Sprache als erkannt gilt. */
const LANGUAGE_MIN_LEAD = 3

/** Hero + Einleitung, angenähert: der Anfang des Fliesstextes (e5). */
export const BRAND_CHECK_HERO_CHARS = 600
/** Weniger Wörter tragen keinen Prozentsatz. */
const JARGON_MIN_WORDS = 20
/** Ab dieser Länge zählt ein Wort als Fachjargon-Kandidat (Plan §3, Kriterium 25). */
const JARGON_WORD_LENGTH = 14

/**
 * ALLE GERECHNETEN KRITERIEN AUF EINMAL — Id → { score, evidence }.
 *
 * Der Rückgabewert enthält AUSSCHLIESSLICH `kind: 'measured'`-Ids. Die Route
 * legt ihn und das Modell-Ergebnis nebeneinander; überlappen könnten sie nicht,
 * weil jedes Kriterium im Katalog genau eine Sorte hat (Test-Invariante).
 */
export function measureBrandCheck(input: BrandCheckMeasureInput): Record<string, BrandCheckMeasurement> {
  const { content, signals } = input
  const out: Record<string, BrandCheckMeasurement> = {}

  // ── B1 · Favicon + og:image ────────────────────────────────────────────
  out.b1 = {
    score: ofTwo((signals.hasFavicon ? 1 : 0) + (signals.ogImage ? 1 : 0)),
    evidence: evidence(`favicon: ${yesNo(signals.hasFavicon)} · og:image: ${yesNo(Boolean(signals.ogImage))}`),
  }

  // ── B2 · Überschriften-Hierarchie ──────────────────────────────────────
  {
    const h1Count = signals.headings.filter(heading => heading.level === 1).length
    const h2Count = signals.headings.filter(heading => heading.level === 2).length
    let jumps = 0
    for (let index = 1; index < signals.headings.length; index++) {
      const previous = signals.headings[index - 1]!.level
      const current = signals.headings[index]!.level
      if (current > previous + 1) jumps += 1
    }
    const startsWithH1 = signals.headings[0]?.level === 1
    const score: BrandCheckScoreValue = h1Count !== 1
      ? 0
      : (jumps === 0 && startsWithH1 ? 2 : 1)
    out.b2 = {
      score,
      evidence: evidence(`h1: ${h1Count} · h2: ${h2Count} · level jumps: ${jumps}`),
    }
  }

  // ── B4 · Farb-/Theme-Meta ──────────────────────────────────────────────
  out.b4 = {
    score: ofTwo((signals.themeColor ? 1 : 0) + (signals.colorScheme ? 1 : 0)),
    evidence: evidence(`theme-color: ${yesNo(Boolean(signals.themeColor))} · color-scheme: ${yesNo(Boolean(signals.colorScheme))}`),
  }

  // ── C2 · title / og:title / h1 ─────────────────────────────────────────
  {
    const h1 = signals.headings.find(heading => heading.level === 1)?.text ?? ''
    const present: { label: string, value: string }[] = [
      { label: 'title', value: signals.title },
      { label: 'og:title', value: signals.ogTitle },
      { label: 'h1', value: h1 },
    ].filter(entry => Boolean(entry.value))

    if (present.length < 2) {
      // Kein Widerspruch möglich — und trotzdem eine 0: wer nur EINE der drei
      // Beschriftungen hat, hat die Frage „sagen sie dasselbe?" nicht beantwortet,
      // sondern ihr die Grundlage entzogen.
      out.c2 = {
        score: 0,
        evidence: evidence(`only ${present.length} of title/og:title/h1 present`),
      }
    }
    else {
      let lowest = 1
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          lowest = Math.min(lowest, overlap(present[i]!.value, present[j]!.value))
        }
      }
      const score: BrandCheckScoreValue = lowest >= 0.6 ? 2 : (lowest >= 0.3 ? 1 : 0)
      out.c2 = {
        score,
        evidence: evidence(`${present.map(entry => entry.label).join('/')} word overlap: ${Math.round(lowest * 100)}%`),
      }
    }
  }

  // ── C4 · Sprache deklariert und konsistent ─────────────────────────────
  {
    const declared = signals.htmlLang.split('-')[0] ?? ''
    if (!declared) {
      out.c4 = { score: 0, evidence: evidence('html lang: missing') }
    }
    else if (declared !== 'de' && declared !== 'en') {
      // WIR KÖNNEN ES NICHT PRÜFEN, also behaupten wir nichts. Der Aussen-Check
      // kennt genau zwei Sprachen (die des Produkts); für eine dritte wäre jede
      // Note geraten.
      out.c4 = { score: null, evidence: evidence(`html lang: ${declared} (not verifiable)`) }
    }
    else {
      const words = tokens(content.text.slice(0, 4_000))
      const german = markerHits(words, GERMAN_MARKERS)
      const english = markerHits(words, ENGLISH_MARKERS)
      if (words.length < LANGUAGE_MIN_WORDS || Math.abs(german - english) < LANGUAGE_MIN_LEAD) {
        out.c4 = {
          score: null,
          evidence: evidence(`html lang: ${declared} · text too short or mixed to verify`),
        }
      }
      else {
        const detected = german > english ? 'de' : 'en'
        out.c4 = {
          score: detected === declared ? 2 : 0,
          evidence: evidence(`html lang: ${declared} · text reads as: ${detected}`),
        }
      }
    }
  }

  // ── D1 · Handlungsaufforderung ─────────────────────────────────────────
  {
    const withAction = signals.ctaTexts.find(hasActionWord)
    const score: BrandCheckScoreValue = signals.ctaTexts.length === 0 ? 0 : (withAction ? 2 : 1)
    out.d1 = {
      score,
      evidence: evidence(withAction
        ? `${signals.ctaTexts.length} links/buttons near the top · with a verb: "${withAction}"`
        : `${signals.ctaTexts.length} links/buttons near the top · none carries a verb`),
    }
  }

  // ── D3 · Auffindbarkeit (unser Alleinstellungs-Kriterium) ──────────────
  {
    const titleLength = signals.title.length
    const descriptionLength = signals.metaDescription.length
    const titleOk = titleLength >= 30 && titleLength <= 65
    const descriptionOk = descriptionLength >= 70 && descriptionLength <= 160
    out.d3 = {
      score: ofTwo((titleOk ? 1 : 0) + (descriptionOk ? 1 : 0)),
      evidence: evidence(`title ${titleLength} chars (want 30-65) · description ${descriptionLength} chars (want 70-160)`),
    }
  }

  // ── D4 · GEO-Readiness (JSON-LD) ───────────────────────────────────────
  {
    const types = signals.jsonLdTypes
    const strong = types.some(type => type === 'organization' || type === 'website'
      || type === 'localbusiness' || type === 'professionalservice')
    const score: BrandCheckScoreValue = types.length === 0 ? 0 : (strong ? 2 : 1)
    out.d4 = {
      score,
      evidence: evidence(types.length
        ? `JSON-LD @type: ${types.slice(0, 6).join(', ')}`
        : 'no JSON-LD found'),
    }
  }

  // ── E5 · Fachjargon-Dichte ─────────────────────────────────────────────
  {
    const hero = content.text.slice(0, BRAND_CHECK_HERO_CHARS)
    const words = hero.split(/[^\p{L}\p{N}-]+/u).filter(Boolean)
    if (words.length < JARGON_MIN_WORDS) {
      out.e5 = { score: null, evidence: evidence(`only ${words.length} words of body text to measure`) }
    }
    else {
      const long = words.filter(word => word.length >= JARGON_WORD_LENGTH).length
      const share = long / words.length
      const percent = Math.round(share * 100)
      const score: BrandCheckScoreValue = share > 0.12 ? 0 : (share >= 0.06 ? 1 : 2)
      out.e5 = {
        score,
        evidence: evidence(`${percent}% long words (${long} of ${words.length}, 14+ characters)`),
      }
    }
  }

  // ── G1 · Mobile-Viewport ───────────────────────────────────────────────
  out.g1 = {
    score: signals.viewport ? 2 : 0,
    evidence: evidence(signals.viewport ? `viewport: ${signals.viewport}` : 'no viewport meta'),
  }

  // ── G2 · Dunkelmodus-Bereitschaft ──────────────────────────────────────
  out.g2 = {
    score: ofTwo((signals.colorScheme ? 1 : 0) + (signals.hasPrefersColorScheme ? 1 : 0)),
    evidence: evidence(`color-scheme: ${yesNo(Boolean(signals.colorScheme))} · prefers-color-scheme: ${yesNo(signals.hasPrefersColorScheme)}`),
  }

  // ── G4 · Soziale Vorschau ──────────────────────────────────────────────
  out.g4 = {
    score: ofThree((signals.ogTitle ? 1 : 0) + (signals.ogDescription ? 1 : 0) + (signals.ogImage ? 1 : 0)),
    evidence: evidence(`og:title: ${yesNo(Boolean(signals.ogTitle))} · og:description: ${yesNo(Boolean(signals.ogDescription))} · og:image: ${yesNo(Boolean(signals.ogImage))}`),
  }

  // ── H1 · Rechtschreibung / Zeichensetzung ──────────────────────────────
  {
    const findings = signals.doubleSpaceCount + signals.mojibakeCount + signals.doubleEscapedCount
    const score: BrandCheckScoreValue = findings >= 3 ? 0 : (findings >= 1 ? 1 : 2)
    out.h1 = {
      score,
      evidence: evidence(`double spaces: ${signals.doubleSpaceCount} · broken encoding: ${signals.mojibakeCount} · leftover entities: ${signals.doubleEscapedCount}`),
    }
  }

  // ── H2 · Platzhalter-Text ──────────────────────────────────────────────
  {
    const haystack = content.text.toLowerCase()
    const words = new Set(tokens(haystack))
    const mark = PLACEHOLDER_MARKS.find(entry => haystack.includes(entry))
      ?? PLACEHOLDER_WORDS.find(entry => words.has(entry))
    out.h2 = {
      score: mark ? 0 : 2,
      evidence: evidence(mark ? `placeholder found: "${mark}"` : 'no placeholder text found'),
    }
  }

  // ── H3 · HTTPS ─────────────────────────────────────────────────────────
  {
    const secure = input.finalUrl.startsWith('https://')
    out.h3 = {
      score: secure ? 2 : 0,
      // Was wir WISSEN, steht im Beleg: den Sprung haben wir nur gesehen, wenn
      // die eingereichte Adresse http war. Eine Behauptung „http leitet weiter"
      // ohne eigenen Versuch wäre erfunden (§6: kein zweiter Abruf in Runde 1).
      evidence: evidence(secure
        ? (input.httpsUpgraded ? 'https · http redirects to https (observed)' : 'https')
        : 'served over plain http'),
    }
  }

  // ── H5 · Meta-Hygiene ──────────────────────────────────────────────────
  {
    const singleTitle = signals.titleCount === 1
    const singleDescription = signals.metaDescriptionCount === 1
    const hasCanonical = Boolean(signals.canonical)
    out.h5 = {
      score: ofThree((singleTitle ? 1 : 0) + (singleDescription ? 1 : 0) + (hasCanonical ? 1 : 0)),
      evidence: evidence(`title tags: ${signals.titleCount} · description metas: ${signals.metaDescriptionCount} · canonical: ${yesNo(hasCanonical)}`),
    }
  }

  return out
}

/** Die Ids, die `measureBrandCheck` liefern MUSS — der Katalog ist die Wahrheit. */
export const BRAND_CHECK_MEASURED_IDS: readonly string[] = BRAND_CHECK_CRITERIA
  .filter(criterion => criterion.kind === 'measured')
  .map(criterion => criterion.id)
