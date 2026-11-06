/**
 * DER PII-FILTER VOR DEM MODELL (Plan §1.7 Nr. 3, §2.9 Nr. 3).
 *
 * ── WAS ER IST UND WAS ER NICHT IST ───────────────────────────────────────
 * Er ist das ZWEITE Netz. Das erste ist die Pfad-Sperrliste
 * (`marketCrawlRules.ts`): Team-, Impressums- und Kontaktseiten werden gar
 * nicht erst geholt. Was hier gefiltert wird, sind die Reste, die auf jeder
 * anderen Seite trotzdem stehen — die Adresse im Fussbereich, die
 * Telefonnummer im Kopf, der Name der Gründerin im Fliesstext.
 *
 * Er ist KEINE Anonymisierung im Rechtssinn und behauptet das auch nicht. Er
 * ist die zumutbare Sorgfalt vor einem Verarbeitungsschritt, der ohne ihn
 * personenbezogene Daten an einen Auftragsverarbeiter gäbe.
 *
 * ── WARUM DER NAMENS-FILTER AN EINEM AMT HÄNGT UND NICHT AN NAMENSLISTEN ──
 * „Erkenne Personennamen" ist ohne Modell nicht lösbar, und ein Modell dafür
 * wäre genau der Aufruf, den wir vermeiden wollen. Was aber sehr wohl geht:
 * die STELLE finden, an der ein Name steht. Vor oder hinter „Geschäftsführer",
 * „CEO", „Gründerin", „Inhaber", „Founder", „Owner", „Managing Director"
 * steht in fast allen Fällen einer — und ein Grossbuchstaben-PAAR
 * („Anna Keanu") ist dort fast nie etwas anderes. Das Fenster ist eng
 * (±60 Zeichen), damit „Geschäftsführung" in einem Satz über Verantwortung
 * nicht den halben Absatz verschluckt.
 *
 * FALSCH-POSITIVE SIND HIER DER GÜNSTIGE FEHLER: verschwindet ein Markenname
 * neben „Gründer", verliert das Marktprofil einen Beleg. Bleibt ein
 * Personenname stehen, haben wir personenbezogene Daten an ein Modell
 * geschickt. Die zwei Fehler wiegen nicht gleich.
 */

/** Was an die Stelle eines Fundes tritt. */
export const MARKET_PII_PLACEHOLDER = '[entfernt]'

/** Wie weit um ein Amt herum nach einem Namen gesucht wird. */
export const MARKET_PII_NAME_WINDOW = 60

export interface MarketPiiResult {
  readonly text: string
  /** Wie viele Stellen ersetzt wurden — fürs Log (eine ZAHL, nie ein Fund). */
  readonly removed: number
}

/**
 * E-Mail-Adressen — in ZWEI Mustern, und die Trennung ist keine Kosmetik.
 *
 * Die GEWÖHNLICHE Adresse bindet eng: kein Leerraum um den Punkt. Der erste
 * Anlauf erlaubte ihn („`\s*\.\s*`", damit `firma (dot) de` mitgeht) und
 * verschluckte damit den Satz dahinter: aus „Fragen an hallo@roesterei.test.
 * Geschäftsführerin …" wurde „Fragen an [entfernt]äftsführerin …" (Test „der
 * PII-Filter greift über den ganzen Rohtext"). Ein Filter, der über den
 * Satzpunkt hinweg frisst, entfernt genau die Belege, für die es das Produkt
 * gibt.
 *
 * Die VERSCHLEIERTE Adresse darf weiterhin Leerraum tragen — sie ist ohnehin
 * nur an ihren Ersatzwörtern erkennbar, und wer sie so schreibt, will sie
 * erst recht nicht in einem Modell sehen.
 */
const EMAIL_PLAIN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi
const EMAIL_OBFUSCATED = /[\w.+-]+\s*(?:\(at\)|\[at\]|\s+at\s+)\s*[\w-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[\w-]+)+/gi

/**
 * Telefonnummern in DE-, US- und internationaler Schreibweise.
 *
 * Die Gefahr ist hier die falsche Richtung: eine Jahreszahl, eine Postleitzahl
 * oder ein Preis darf nicht als Nummer gelten. Deshalb verlangt das Muster
 * ENTWEDER ein Telefon-Präfix (`+`, `Tel`, `Phone`, `Fon`, `Mobil`) ODER
 * mindestens zwei Trennzeichen — eine nackte Zahlenfolge fällt durch.
 */
const PHONE_PREFIXED = /(?:\+|00)\d[\d\s().\-/]{6,20}\d/g
const PHONE_LABELED = /(?:tel|telefon|phone|fon|mobil|mobile|handy|fax)[.:\s]*[+\d][\d\s().\-/]{5,20}\d/gi

/** Die Ämter, in deren Nähe ein Personenname zu erwarten ist. */
const ROLE_WORDS = [
  'geschäftsführer', 'geschäftsführerin', 'geschaeftsführer', 'geschaeftsfuehrer', 'geschaeftsfuehrerin',
  'geschäftsführung', 'inhaber', 'inhaberin', 'gründer', 'gründerin', 'gruender', 'gruenderin',
  'mitgründer', 'mitgründerin', 'vorstand', 'vorständin',
  'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder', 'cofounder',
  'owner', 'managing director', 'president', 'chairman', 'chairwoman',
]

/**
 * BEWUSST NICHT IN DER LISTE: „Partner".
 *
 * Im deutschen Marketing heisst „Partner" fast immer ein UNTERNEHMEN
 * („Maui Coffee Works ist Partner"), nicht ein Mensch — und weil das Wort
 * dann direkt neben einem Markennamen steht, zog es genau den aus dem Text
 * (Gegenprobe „derselbe Name OHNE Amt in der Nähe bleibt stehen"). Ein
 * Kanzlei-Partner entgeht dem Filter damit; das ist der bewusst in Kauf
 * genommene Rest, und die Pfad-Sperrliste (Team, Impressum, Kontakt) fängt
 * ihn an der Stelle ab, an der er wirklich steht.
 */

const ROLE_RE = new RegExp(`(?:${ROLE_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')

/**
 * EIN NAME: zwei bis drei aufeinanderfolgende Wörter, die mit einem
 * Grossbuchstaben beginnen — mit erlaubten Bindegliedern („van", „von", „de").
 * Der erste Buchstabe muss ein Buchstabe sein, nicht bloss ein
 * Nicht-Kleinbuchstabe: sonst gilt „GmbH Co" als Name.
 */
const NAME_RE = /\p{Lu}\p{L}+(?:[-']\p{L}+)?(?:\s+(?:van|von|de|der|den|di|del|la|le)\s+|\s+)\p{Lu}\p{L}+(?:[-']\p{L}+)?(?:\s+\p{Lu}\p{L}+)?/gu

/**
 * Wörter, die zwar gross geschrieben sind, aber keine Personen bezeichnen —
 * sie stehen in der Nähe eines Amtes besonders oft („Geschäftsführer der
 * Musterfirma GmbH").
 */
const NOT_A_PERSON = new Set([
  'gmbh', 'ag', 'kg', 'ohg', 'ug', 'ltd', 'llc', 'inc', 'co', 'mbh', 'se', 'plc', 'bv', 'sarl',
  'der', 'die', 'das', 'und', 'the', 'and', 'unser', 'unsere', 'our', 'ihr', 'ihre', 'your',
])

function looksLikeCompany(candidate: string): boolean {
  const words = candidate.split(/\s+/).map(word => word.toLowerCase().replace(/[.,]/g, ''))
  return words.some(word => NOT_A_PERSON.has(word))
}

/**
 * DER FILTER. Reihenfolge: E-Mail, Telefon, dann Namen — die ersten beiden
 * sind eindeutig und sollen nicht erst durch das Namens-Fenster laufen.
 */
export function filterMarketPii(input: string): MarketPiiResult {
  let removed = 0
  const count = (): string => {
    removed++
    return MARKET_PII_PLACEHOLDER
  }

  // Die verschleierte Form ZUERST: ihr Muster ist das speziellere, und die
  // gewöhnliche Adresse steckt als Teilstück darin nicht drin.
  let text = input.replace(EMAIL_OBFUSCATED, count)
  text = text.replace(EMAIL_PLAIN, count)
  text = text.replace(PHONE_LABELED, count)
  text = text.replace(PHONE_PREFIXED, count)

  // ── Namen in der Nähe eines Amtes ────────────────────────────────────────
  // Gearbeitet wird auf einer Liste von FENSTERN, die aus den Ämtern entsteht.
  // Sie werden von hinten nach vorn ersetzt, damit die Indizes der noch
  // offenen Fenster gültig bleiben.
  const windows: { start: number, end: number }[] = []
  ROLE_RE.lastIndex = 0
  let role = ROLE_RE.exec(text)
  while (role !== null) {
    windows.push({
      start: Math.max(0, role.index - MARKET_PII_NAME_WINDOW),
      end: Math.min(text.length, role.index + role[0].length + MARKET_PII_NAME_WINDOW),
    })
    role = ROLE_RE.exec(text)
  }

  for (let index = windows.length - 1; index >= 0; index--) {
    const window = windows[index]
    if (!window) continue
    const slice = text.slice(window.start, window.end)

    /**
     * DAS AMT WIRD MASKIERT, BEVOR NACH DEM NAMEN GESUCHT WIRD.
     *
     * Sonst gehört „Gründer" selbst zum Treffer („Gründer Anna Keanu") und
     * verschwindet mit — und der Satz sagt danach nicht mehr, WAS entfernt
     * wurde. Der Punkt `·` ist kein Buchstabe, `\p{Lu}` und `\p{L}` greifen
     * darauf nicht; die Länge bleibt gleich, also stimmen alle Indizes.
     */
    ROLE_RE.lastIndex = 0
    const masked = slice.replace(ROLE_RE, match => '·'.repeat(match.length))

    const hits: { start: number, end: number }[] = []
    NAME_RE.lastIndex = 0
    let candidate = NAME_RE.exec(masked)
    while (candidate !== null) {
      const value = candidate[0]
      if (!looksLikeCompany(value)) {
        hits.push({ start: candidate.index, end: candidate.index + value.length })
      }
      candidate = NAME_RE.exec(masked)
    }
    if (!hits.length) continue

    let replaced = slice
    for (let hit = hits.length - 1; hit >= 0; hit--) {
      const range = hits[hit]
      if (!range) continue
      replaced = replaced.slice(0, range.start) + MARKET_PII_PLACEHOLDER + replaced.slice(range.end)
      removed++
    }
    text = text.slice(0, window.start) + replaced + text.slice(window.end)
  }

  return { text, removed }
}
