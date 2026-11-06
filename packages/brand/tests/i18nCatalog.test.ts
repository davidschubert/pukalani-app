import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_DIRECTIONS, BRAND_DIRECTIONS_VERSION } from '../shared/brandDirections'
import { type BrandFoundationInput, buildBrandFoundation } from '../shared/brandFoundation'
import { formatBrandSlotList, formatBrandSlotStructured } from '../shared/brandSlotFormat'
import {
  BRAND_OWN_ANSWER_PLACEHOLDER_KEY,
  BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY,
} from '../shared/brandStageModule'
import { BRAND_NEW_DETAILS_FIELDS, brandNewDetailsCopy } from '../shared/brandStartCard'
import {
  BRAND_SLOTS,
  type BrandSlot,
  exampleKeyFor,
  partKeyFor,
  partLabelKeyFor,
  slotById,
  slotLabelKeyFor,
} from '../shared/slotRegistry'

/**
 * DIE REGISTRY IST DIE QUELLE, DER KATALOG MUSS IHR FOLGEN.
 *
 * vue-i18n gibt bei fehlender Übersetzung den SCHLÜSSEL zurück — es gibt keinen
 * Fehler, keine Warnung, keinen roten Build (vier Tage `legal.imprint` im Fuß
 * von comments.pukalani.app). Der Wizard rendert seine Fragen aus
 * `slot.questionKey`, seine Lehrblöcke aus `slot.helpKey`: kommt ein Slot dazu,
 * ohne dass jemand Copy schreibt, stünde dort wörtlich `brand.q.c.discovery4`.
 * Genau das fängt dieser Test — in BEIDEN Sprachen, denn ein Schlüssel, den nur
 * eine Sprache hat, ist derselbe Fehler mit halber Trefferwahrscheinlichkeit.
 *
 * GEPRÜFT WIRD, WAS DIE OBERFLÄCHE WIRKLICH AUFRUFT:
 *  - `question`/`choice`-Slots werden GEFRAGT — dort zählt `questionKeyFor()`
 *    für BEIDE Pfade (die Weiche W1 tauscht die Fassung, nicht den Slot).
 *  - Alle anderen Slots (`derivation`, `stage-edit`, `special`) tragen auf der
 *    Bühne ein kurzes FELD-ETIKETT; die Seiten lösen es über den BASIS-Schlüssel
 *    auf, nie über `questionKeyFor` (Begründung s. `d.gapReveal` unten).
 *  - Jeder gesetzte `helpKey` braucht seinen Lehrblock.
 *
 * `d.gapReveal` IST DER GRUND FÜR DIESE TRENNUNG: der Slot hat nur
 * `pathVariants: { relaunch: true }`, also lieferte `questionKeyFor` auf dem
 * Gründer-Pfad `brand.q.d.gapReveal` und auf dem Relaunch-Pfad
 * `brand.q.d.gapReveal.relaunch`. Ein verschachtelter JSON-Katalog kann unter
 * EINEM Schlüssel nicht gleichzeitig eine Zeichenkette und ein Kind-Objekt
 * halten — beides zusammen ist dort nicht ausdrückbar. Da `d.gapReveal` eine
 * ABLEITUNG ist (`editor: 'none'`, es wird nie gefragt), ist die Auflösung: die
 * Bühne beschriftet ihn mit dem Basis-Schlüssel, der beide Pfade trägt. Ein
 * eigener Relaunch-Wortlaut („Außenbild-Check") braucht eine Änderung an der
 * Schlüssel-Konvention, nicht einen Sonderfall im Katalog.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const LOCALES = ['de', 'en'] as const

function flatten(node: unknown, prefix: string, into: Set<string>): Set<string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, into)
    else into.add(path)
  }
  return into
}

const catalogs = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    flatten(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')), '', new Set<string>()),
  ]),
) as Record<(typeof LOCALES)[number], Set<string>>

/** Welche Sprachen den Schlüssel NICHT haben — leer heisst „in Ordnung". */
function missingIn(key: string): string[] {
  return LOCALES.filter(locale => !catalogs[locale].has(key))
}

/** Die deutschen TEXTE, flach — der Anrede-Wächter unten liest sie. */
function flattenValues(node: unknown, prefix: string, into: Map<string, string>): Map<string, string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') into.set(path, value)
    else flattenValues(value, path, into)
  }
  return into
}

const deTexts = flattenValues(
  JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')),
  '',
  new Map<string, string>(),
)

/**
 * Die Schlüssel, die die Oberfläche für DIESEN Slot wirklich auflöst — über
 * BEIDE Pfade und, wo es eine Team-Fassung gibt, über beide Seiten der Weiche
 * W3 (Paket 2b: `c.discovery3` fragt im Team D7 statt D3; seit 2026-09-09
 * tauschen 48 weitere Fragen dort die Anrede).
 *
 * GERECHNET WIRD MIT `slotLabelKeyFor` und nicht mit einer eigenen
 * Typ-Aufzählung: das ist die Regel, die Bühne, Log, Abnahme und der
 * Prompt-Aufbau des Servers wirklich benutzen. Die Kopie, die hier stand
 * (`question`/`choice` gegen den Rest), hätte `d.pairs` durchgelassen — einen
 * `special`-Slot MIT Solo-Fassung.
 */
function keysFor(slot: BrandSlot): string[] {
  return [...new Set([
    slotLabelKeyFor(slot, 'new', 'solo'),
    slotLabelKeyFor(slot, 'relaunch', 'solo'),
    slotLabelKeyFor(slot, 'new', 'team'),
    slotLabelKeyFor(slot, 'relaunch', 'team'),
  ])]
}

const activeSlots = BRAND_SLOTS.filter(slot => !slot.deactivated)

describe('brand i18n-Katalog', () => {
  it('kennt beide Sprachen mit demselben Schlüsselvorrat', () => {
    const de = [...catalogs.de].sort()
    const en = [...catalogs.en].sort()
    expect(de).toEqual(en)
    expect(de.length).toBeGreaterThan(0)
  })

  it('hat für JEDEN aktiven Slot eine Frage bzw. ein Feld-Etikett', () => {
    const gaps: string[] = []
    for (const slot of activeSlots) {
      for (const key of keysFor(slot)) {
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${slot.id}: ${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('führt beide Fassungen der Team-Weiche — in de UND en', () => {
    // Sie liegen als KINDER unter `brand.q.c.discovery3` (`.solo` / `.team`)
    // und nicht als Zeichenkette plus Kind: ein verschachtelter JSON-Katalog
    // kann unter EINEM Schlüssel nicht beides halten (dieselbe Grenze wie bei
    // `d.gapReveal`, s. Kopf). Deshalb bekommt AUCH der Solo-Fall ein Suffix.
    expect(missingIn('brand.q.c.discovery3.solo')).toEqual([])
    expect(missingIn('brand.q.c.discovery3.team')).toEqual([])
    // Der Basis-Schlüssel darf es nicht mehr geben — er stünde sonst wörtlich
    // in der Oberfläche, sobald jemand ihn ohne die Weiche auflöst.
    expect(missingIn('brand.q.c.discovery3').length).toBeGreaterThan(0)
  })

  it('führt zu JEDER Team-Fassung auch eine Solo-Fassung — in de UND en', () => {
    // 49 Sessions tragen die Weiche W3: `c.discovery3` fragt solo etwas
    // ANDERES (Paket 2b), die übrigen 48 fragen dasselbe in der Anrede „du"
    // (Davids Entscheidung 2026-09-09). Die Zahl steht hier, damit ein stilles
    // Wegfallen auffällt.
    const withTeam = activeSlots.filter(slot => slot.teamVariant)
    expect(withTeam).toHaveLength(49)

    const gaps: string[] = []
    for (const slot of withTeam) {
      for (const pathKind of ['new', 'relaunch'] as const) {
        for (const team of ['solo', 'team'] as const) {
          const key = slotLabelKeyFor(slot, pathKind, team)
          if (missingIn(key).length) gaps.push(`${slot.id}: ${key} fehlt`)
          // Der BASIS-Schlüssel darf es nicht mehr geben — er stünde sonst
          // wörtlich in der Oberfläche, sobald jemand ihn ohne die Weiche
          // auflöst (ein JSON-Katalog kann unter EINEM Schlüssel nicht
          // gleichzeitig Text und Kind-Objekt halten).
          if (!missingIn(slot.questionKey).length) gaps.push(`${slot.id}: Basis-Schlüssel steht noch da`)
        }
      }
    }
    expect(gaps).toEqual([])
  })

  it('lässt in KEINER Solo-Fassung eine Mehrzahl-Anrede stehen', () => {
    /**
     * DER WÄCHTER ZU DAVIDS ENTSCHEIDUNG (DECISION-LOG 2026-09-09): auf der
     * Weiche „Nur ich" redet George mit „du". Eine Frage, die dort „ihr/euch/
     * euer" sagt, ist der Fehler, der die ganze Runde ausgelöst hat — und der
     * einzige, den weder Typecheck noch Lint noch die Schlüssel-Prüfung sehen
     * (der Schlüssel EXISTIERT ja, er trägt nur den falschen Satz).
     *
     * Geprüft wird die SOLO-Seite jeder Session, auch die der Sessions OHNE
     * Weiche: dort liefert `slotLabelKeyFor` den Basis-Schlüssel, und genau so
     * fällt eine Frage auf, die man beim Umstellen übersehen hat.
     */
    // Nur EINDEUTIGE Formen: „macht" stünde hier falsch („schlecht macht" ist
    // dritte Person), „ihre" ebenso („die sagen ihre Meinung"). Die Endung -t
    // allein trägt nicht — der Ausdruck nennt deshalb die Verben, die es im
    // Katalog wirklich gibt, statt ein Muster zu raten.
    const plural = /(^|[^a-zäöüß])(ihr|euch|euer|eure|eurem|euren|eures|eurer|habt|seid|wollt|könnt|müsst|sollt|würdet|hättet|nehmt|bewertet)([^a-zäöüß]|$)/i
    const keysToRead = (slot: BrandSlot): string[] => [
      slotLabelKeyFor(slot, 'new', 'solo'),
      slotLabelKeyFor(slot, 'relaunch', 'solo'),
      ...(slot.type === 'question'
        ? [exampleKeyFor(slot, 'new', 'solo'), exampleKeyFor(slot, 'relaunch', 'solo')]
        : []),
      // Die TEILE einer Sammel-Session gehören dazu (2026-09-09): sie werden
      // EINZELN gestellt, im selben Chat wie die Klammer-Frage darüber, und
      // genau dort stand solo „Seit wann gibt es euch?".
      ...slot.parts.map(part => partKeyFor(slot, part, 'solo')),
    ]

    const offenders: string[] = []
    for (const slot of activeSlots) {
      for (const key of new Set(keysToRead(slot))) {
        const text = deTexts.get(key)
        if (text && plural.test(text)) offenders.push(`${key}: ${text}`)
      }
    }
    expect(offenders).toEqual([])

    // GEGENPROBE, zweifach: der Ausdruck greift überhaupt, und die
    // TEAM-Fassung darf die Mehrzahl behalten — sie ist die abgenommene.
    expect(deTexts.get('brand.q.a.complaints.team')).toMatch(plural)
    expect(deTexts.get('brand.q.a.origin.relaunch.team')).toMatch(plural)
    // Dieselbe Gegenprobe eine Ebene tiefer: der Teil einer Sammel-Session
    // behält im Team seinen abgenommenen Wortlaut.
    expect(deTexts.get('brand.part.a.facts.markets.team')).toMatch(plural)
  })

  it('hat für JEDEN Teil einer Sammel-Session eine eigene Frage', () => {
    // `a.facts` fragt drei Dinge nacheinander (Paket 3). Sie liegen unter
    // `brand.part.<id>.<teil>` und NICHT unter `brand.q.a.facts.<teil>`: dort
    // steht schon die Klammer-Frage als Zeichenkette, und ein JSON-Katalog kann
    // unter einem Schlüssel nicht gleichzeitig Text und Kind-Objekt halten —
    // dieselbe Grenze wie bei `d.gapReveal` (s. Kopf).
    const gaps: string[] = []
    for (const slot of activeSlots.filter(slot => slot.parts.length > 0)) {
      // Die Klammer-Frage bleibt und wird weiter gerendert — seit der
      // Anrede-Runde in zwei Fassungen (`a.facts` fragt solo „wie lange machst
      // du das schon", im Team „wie lange gibt es euch"), also über dieselbe
      // Regel wie oben statt über den Basis-Schlüssel.
      for (const key of keysFor(slot)) {
        if (missingIn(key).length) gaps.push(`${slot.id}: ${key} fehlt`)
      }
      for (const part of slot.parts) {
        // BEIDE Seiten der Weiche W3 (2026-09-09): ein Teil mit `teamParts`
        // führt `.solo`/`.team` als Kinder, jeder andere den Basis-Schlüssel —
        // `partKeyFor` rechnet das, hier steht keine zweite Liste.
        for (const key of new Set([partKeyFor(slot, part, 'solo'), partKeyFor(slot, part, 'team')])) {
          const missing = missingIn(key)
          if (missing.length) gaps.push(`${slot.id}: ${key} fehlt in ${missing.join(', ')}`)
        }
        // Und der BASIS-Schlüssel darf es dort NICHT mehr geben, wo die Weiche
        // angemeldet ist — er stünde sonst wörtlich im Chat, sobald jemand ihn
        // ohne die Weiche auflöst (Text und Kind-Objekt unter EINEM Schlüssel
        // kann ein JSON-Katalog nicht halten).
        if (slot.teamParts?.includes(part) && !missingIn(`brand.part.${slot.id}.${part}`).length) {
          gaps.push(`${slot.id}: Basis-Schlüssel von "${part}" steht noch da`)
        }
      }
    }
    expect(gaps).toEqual([])
    // Ohne diese Zeile wäre der Test grün, sobald `parts` irgendwo leer würde.
    expect(activeSlots.filter(slot => slot.parts.length > 0).map(slot => slot.id)).toEqual(['a.facts'])
    // Und ohne diese, sobald `teamParts` still verschwände: „Seit" und „Märkte"
    // reden die Marke an, „Team" nicht (s. `partKeyFor`).
    expect(slotById('a.facts')!.teamParts).toEqual(['age', 'markets'])
    expect(missingIn('brand.part.a.facts.erfunden').length).toBeGreaterThan(0)
  })

  it('und für JEDEN Teil ein kurzes Etikett — es steht im gespeicherten Wert', () => {
    // Der zusammengelegte Wert einer Sammel-Session ist ein `structured`-Wert
    // aus beschrifteten Blöcken (`## Team`). Fehlt das Etikett, stünde dort die
    // interne Teil-Id — im Brand-Dokument, das ein Mensch liest.
    const gaps: string[] = []
    for (const slot of activeSlots.filter(slot => slot.parts.length > 0)) {
      for (const part of slot.parts) {
        const key = partLabelKeyFor(slot, part)
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${slot.id}: ${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])
    expect(missingIn('brand.partLabel.a.facts.erfunden').length).toBeGreaterThan(0)
  })

  it('hat für JEDE Menschenfrage eine Beispiel-Antwort (Composer-Platzhalter)', () => {
    // Der Berater-Chat legt zur aktuellen `question`-Frage eine Beispiel-
    // Antwort GRAU ins Antwortfeld (`exampleKeyFor`, Muster Claude Desktop).
    // Fehlt der Schlüssel, stünde dort wörtlich `brand.example.…` — derselbe
    // stille Fehler wie bei den Fragen, deshalb dieselbe Prüfung.
    const gaps: string[] = []
    for (const slot of activeSlots.filter(slot => slot.type === 'question')) {
      const keys = new Set([
        exampleKeyFor(slot, 'new', 'solo'),
        exampleKeyFor(slot, 'relaunch', 'solo'),
        // Auch die Team-Fassung (Paket 8): `c.discovery3` fragt im Team etwas
        // anderes und braucht dafür ihre eigene Musterantwort.
        exampleKeyFor(slot, 'new', 'team'),
        exampleKeyFor(slot, 'relaunch', 'team'),
      ])
      for (const key of keys) {
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${slot.id}: ${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('hat für JEDEN helpKey einen Lehrblock', () => {
    const withHelp = activeSlots.filter(slot => slot.helpKey !== null)
    // Katalog §13 kennt sieben Lehrblöcke + die B2-Infografik; sie hängen an
    // 15 Slots. Die Zahl steht hier, damit ein stilles Wegfallen auffällt.
    expect(withHelp).toHaveLength(15)

    const gaps: string[] = []
    for (const slot of withHelp) {
      const missing = missingIn(slot.helpKey!)
      if (missing.length) gaps.push(`${slot.id}: ${slot.helpKey} fehlt in ${missing.join(', ')}`)
    }
    expect(gaps).toEqual([])
  })

  it('löst den Abschluss-CTA der App-Config auf', () => {
    // `pukalani.brand.completionCta.labelKey` — die Schuld aus P1a.
    expect(missingIn('brand.cta.book')).toEqual([])
  })

  it('trägt die Werkstatt-Beschriftung (Konfidenz, Autosave, 409)', () => {
    const chrome = [
      'brand.workspace.confidence.fits',
      'brand.workspace.confidence.almost',
      'brand.workspace.confidence.restart',
      'brand.workspace.sync.saving',
      'brand.workspace.sync.saved',
      'brand.workspace.sync.offline',
      'brand.workspace.sync.error',
      'brand.workspace.sync.conflict',
      'brand.workspace.conflict.loadServer',
      'brand.workspace.conflict.copyMine',
      'brand.workspace.next',
      'brand.workspace.back',
      'brand.workspace.dontKnow',
    ]
    const gaps = chrome.filter(key => missingIn(key).length)
    expect(gaps).toEqual([])
  })

  it('trägt die Beschriftung der Generierung und der Fassungs-Wiederherstellung', () => {
    // Diese Schlüssel rendert die Werkstatt an Slots und in zwei Fenstern. Sie
    // stehen hier NAMENTLICH, weil sie an keiner Registry hängen: fiele einer
    // weg, stünde er wörtlich in der Oberfläche, und kein anderer Test sähe es.
    const generation = [
      'brand.workspace.draftBadge',
      'brand.workspace.generate.start',
      'brand.workspace.generate.again',
      'brand.workspace.generate.stop',
      'brand.workspace.generate.hintPlaceholder',
      'brand.workspace.generate.hintLabel',
      'brand.workspace.generate.aiDisabled',
      'brand.workspace.generate.noGenerator',
      'brand.workspace.generate.busy',
      'brand.workspace.generate.stopped',
      'brand.workspace.generate.failed',
      'brand.workspace.generate.dismiss',
      'brand.workspace.versions.open',
      'brand.workspace.versions.title',
      'brand.workspace.versions.description',
      'brand.workspace.versions.use',
      'brand.workspace.versions.first',
      'brand.workspace.versions.dropped',
      'brand.workspace.versions.empty',
      'brand.workspace.versions.loading',
      'brand.workspace.versions.close',
    ]
    expect(generation.filter(key => missingIn(key).length)).toEqual([])
  })

  /**
   * DIE ZWEI AUSGÄNGE DES EDITORS (Dritter Testlauf, Befund 3) und der zweite
   * Platzhalter der Antwort-Karte (Befund 9). Beide hängen an keiner Registry:
   * fiele einer weg, stünde sein Schlüssel wörtlich auf einem Knopf.
   */
  it('trägt die zwei Ausgänge der Korrektur und beide Antwort-Platzhalter', () => {
    const keys = [
      'brand.workspace.reviseSlot',
      'brand.workspace.reviseApply',
      'brand.workspace.reviseDiscard',
      BRAND_OWN_ANSWER_PLACEHOLDER_KEY,
      BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY,
    ]
    expect(keys.filter(key => missingIn(key).length)).toEqual([])
    // „Korrigieren beenden" ist ERSETZT und darf nicht liegen bleiben — ein
    // Schlüssel ohne Leser ist die nächste Copy-Runde, die ins Leere pflegt.
    expect(missingIn('brand.workspace.reviseDone').length).toBe(LOCALES.length)
  })

  /**
   * DIE STARTKARTE DER ANLAGE FOLGT DER WEICHE W3 (Befund 5) — dieselbe
   * Doppel-Zusage wie bei den Fragen: beide Fassungen da, der Basis-Schlüssel
   * weg (ein JSON-Katalog kann unter EINEM Schlüssel nicht gleichzeitig Text
   * und Kind-Objekt halten).
   */
  it('führt beide Fassungen der Anlage-Startkarte — in de UND en', () => {
    const gaps: string[] = []
    for (const team of ['solo', 'team'] as const) {
      for (const key of Object.values(brandNewDetailsCopy(team))) {
        if (missingIn(key).length) gaps.push(`${key} fehlt`)
      }
    }
    for (const field of BRAND_NEW_DETAILS_FIELDS) {
      const base = `brand.new.startCard.${field}`
      if (!missingIn(base).length) gaps.push(`${base}: Basis-Schlüssel steht noch da`)
    }
    expect(gaps).toEqual([])
  })

  /**
   * DIE LESEANSICHT REDET NICHT IM PLURAL (Dritter Testlauf, Befund 6).
   *
   * „Brand Design entsteht mit eurem Markenberater …" und „Die Richtung wählt
   * ihr im Ergebnis-Kapitel …" standen bei einer Solo-Marke im Handbuch — und
   * dieselben Sätze rendert die öffentliche Discover-Anatomie, die die Weiche
   * gar nicht kennt. Die Auflösung ist deshalb NEUTRAL statt zweifassig: ein
   * Text ohne Anrede ist auf beiden Seiten der Weiche und ohne sie richtig.
   */
  it('hält die Texte der Leseansicht frei von der Mehrzahl-Anrede', () => {
    const plural = /(^|[^a-zäöüß])(ihr|euch|euer|eure|eurem|euren|eures|eurer)([^a-zäöüß]|$)/i
    const offenders: string[] = []
    for (const [key, text] of deTexts) {
      if (!key.startsWith('brand.foundation.')) continue
      if (plural.test(text)) offenders.push(`${key}: ${text}`)
    }
    expect(offenders).toEqual([])
    // GEGENPROBE: der Ausdruck greift überhaupt.
    expect(plural.test('Die Richtung wählt ihr im Ergebnis-Kapitel.')).toBe(true)
  })

  it('GEGENPROBE: ein erfundener Slot fällt durch', () => {
    const invented: BrandSlot = { ...activeSlots[0]!, id: 'z.erfunden', questionKey: 'brand.q.z.erfunden' }
    expect(keysFor(invented).every(key => missingIn(key).length === 0)).toBe(false)
  })

  it('KEINE spitzen Klammern und kein rohes At-Zeichen in Nachrichten', () => {
    // Beides bricht den Nachrichten-Compiler bzw. wird als HTML gelesen
    // (CLAUDE.md: `/discussions/<adresse>` hat den CLIENT ausgehebelt).
    for (const locale of LOCALES) {
      const raw = readFileSync(join(localesDir, `${locale}.json`), 'utf8')
      const parsed = JSON.parse(raw) as unknown
      const values: string[] = []
      const walk = (node: unknown): void => {
        if (typeof node === 'string') { values.push(node); return }
        if (node && typeof node === 'object') Object.values(node).forEach(walk)
      }
      walk(parsed)
      expect(values.filter(value => /[<>]/.test(value)), locale).toEqual([])
      expect(values.filter(value => value.includes('@')), locale).toEqual([])
    }
  })
})

/**
 * DIE LESEANSICHT SPRICHT NUR IN SCHLÜSSELN (Paket G2).
 *
 * `buildBrandFoundation` ist pur und schickt `titleKey`, `labelKey` und
 * `columnKeys` statt Text (Kopf von `shared/brandFoundation.ts`); die visuelle
 * Schranke schickt nur Element-Ids. Fehlt einer dieser Schlüssel im Katalog,
 * steht im Handbuch wörtlich `brand.foundation.label.pitch` — vue-i18n meldet
 * das nie, und Typecheck und Lint sehen davon nichts.
 *
 * GEPRÜFT WIRD DER ECHTE LAUF: die Schlüssel werden nicht aufgezählt, sondern
 * aus einer Foundation über ALLE Sessions eingesammelt. Ein neuer Block-Bauer
 * mit neuem Label ist damit automatisch mitgeprüft.
 */
describe('Brand Foundation — jeder erzeugte Schlüssel hat seinen Text', () => {
  /** Ein formgültiger Wert je Art — sonst fielen Karten und Tabellen aus. */
  function slotValue(slot: BrandSlot): string {
    switch (slot.schema.kind) {
      case 'list':
        return formatBrandSlotList([`${slot.id}-eins`, `${slot.id}-zwei`])
      case 'structured':
        return formatBrandSlotStructured([{ label: `${slot.id}-etikett`, body: `${slot.id}-inhalt` }])
      default:
        return `${slot.id}-text`
    }
  }

  const input: BrandFoundationInput = {
    title: 'Kailua Coffee Co.',
    contentLocale: 'en',
    story: 'Ein Absatz.',
    // MIT gewählter Richtung (Paket G4): sonst blieben die Schlüssel des
    // Richtungs- und des Swatch-Blocks ungeprüft — sie entstehen nur, wenn
    // eine gültige Richtung anliegt.
    direction: { id: BRAND_DIRECTIONS[0]!.id, version: String(BRAND_DIRECTIONS_VERSION) },
    chapters: [{
      stepKey: 'context',
      slots: BRAND_SLOTS
        .filter(slot => !slot.deactivated)
        .map(slot => ({ slotId: slot.id, value: slotValue(slot) })),
    }],
  }

  /** Alles, was die Oberfläche an `t()` reicht — eingesammelt am Ergebnis. */
  function producedKeys(): string[] {
    const keys = new Set<string>()
    for (const chapter of buildBrandFoundation(input).chapters) {
      keys.add(chapter.titleKey)
      for (const block of chapter.blocks) {
        if ('labelKey' in block && block.labelKey) keys.add(block.labelKey)
        if (block.kind === 'table') block.columnKeys.forEach(key => keys.add(key))
        if (block.kind === 'locked') {
          keys.add(`brand.foundation.visual.${block.element}.title`)
          keys.add(`brand.foundation.visual.${block.element}.text`)
        }
        // Paket G4: Name und Begründung der Richtung, die Rolle jeder Farbe.
        if (block.kind === 'direction') {
          keys.add(block.nameKey)
          keys.add(block.reasonKey)
        }
        if (block.kind === 'swatches') block.items.forEach(item => keys.add(item.roleKey))
      }
    }
    return [...keys]
  }

  it('kennt jeden Kapitel-, Beschriftungs- und Spalten-Schlüssel in BEIDEN Sprachen', () => {
    const produced = producedKeys()
    // Ohne diese Zeile wäre der Test auch für eine leere Menge grün.
    expect(produced.length).toBeGreaterThan(25)
    expect(produced.filter(key => missingIn(key).length)).toEqual([])
  })

  it('kennt Name, Begründung und Farbrollen JEDER Richtung (Paket G4)', () => {
    // Der Lauf oben rendert nur EINE Richtung — die anderen fünf stehen im
    // Katalog und werden erst sichtbar, wenn jemand sie wählt. Ein fehlender
    // Name wäre dann ein Schlüssel auf der Seite eines zahlenden Kunden.
    const gaps: string[] = []
    for (const direction of BRAND_DIRECTIONS) {
      for (const key of [direction.nameKey, direction.reasonKey, ...direction.roles]) {
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${direction.id}: ${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])
    // Ohne diese Zeile wäre der Test auch für einen leeren Katalog grün.
    expect(BRAND_DIRECTIONS).toHaveLength(6)
  })

  it('kennt die festen Texte der Seite in BEIDEN Sprachen', () => {
    const fixed = [
      'brand.nav.foundation',
      'brand.document.readFoundation',
      'brand.foundation.title',
      'brand.foundation.toc',
      'brand.foundation.counter',
      'brand.foundation.contentLocale',
      'brand.foundation.standProgress',
      'brand.foundation.loadFailed',
      'brand.foundation.empty',
      'brand.foundation.showToc',
      'brand.foundation.hideToc',
      'brand.foundation.chapterNumber',
      'brand.foundation.pending',
      'brand.foundation.pendingNote',
      'brand.foundation.toAcceptance',
      'brand.foundation.onePage.title',
      'brand.foundation.onePage.values',
      'brand.foundation.onePage.archetype',
      'brand.foundation.onePage.tagline',
      'brand.foundation.onePage.wallLine',
      'brand.foundation.export.label',
      'brand.foundation.export.print',
      'brand.foundation.export.printSub',
      'brand.foundation.export.context',
      'brand.foundation.export.contextSub',
      'brand.foundation.export.tokens',
      'brand.foundation.export.tokensSub',
      'brand.foundation.export.assets',
      'brand.foundation.export.assetsSub',
      'brand.foundation.export.kit',
      'brand.foundation.ai.tone',
      'brand.foundation.ai.avoid',
      'brand.foundation.ai.stands',
      'brand.foundation.ai.hint',
      'brand.foundation.visual.follows',
      'brand.foundation.visual.shareLine',
      'brand.foundation.visual.product',
      'brand.foundation.visual.ctaCall',
      // Die Schranke und die Richtungswahl (Paket G4). `visual.offer` ist der
      // Schranken-Satz OHNE Preis (Davids Entscheidung §11 c) — steht er
      // nicht im Katalog, stünde an der teuersten Stelle des Dokuments
      // wörtlich sein Schlüssel.
      'brand.foundation.visual.offer',
      'brand.foundation.direction.chosen',
      'brand.foundation.direction.choose',
      'brand.foundation.direction.change',
      'brand.foundation.direction.lockedHint',
      'brand.foundation.direction.fontsLabel',
      'brand.foundation.direction.colors',
      'brand.foundation.direction.previewLine',
      'brand.foundation.direction.previewButton',
      'brand.foundation.direction.reason.both',
      'brand.foundation.direction.reason.primary',
      'brand.foundation.direction.reason.secondary',
      'brand.foundation.direction.reason.fallback',
      // Der Share-Dialog und die Empfänger-Seite (Paket G3). Beide sind die
      // Stellen, an denen ein fehlender Schlüssel am teuersten wäre: der
      // Dialog verspricht, WAS reist, und die Seite liest ein Fremder.
      'brand.foundation.share.button',
      'brand.foundation.share.eyebrow',
      'brand.foundation.share.title',
      'brand.foundation.share.close',
      'brand.foundation.share.intro',
      'brand.foundation.share.visible.title',
      'brand.foundation.share.visible.story',
      'brand.foundation.share.visible.chapters',
      'brand.foundation.share.visible.stand',
      'brand.foundation.share.hidden.title',
      'brand.foundation.share.hidden.chats',
      'brand.foundation.share.hidden.drafts',
      'brand.foundation.share.hidden.competitors',
      'brand.foundation.share.hidden.meta',
      'brand.foundation.share.expires',
      'brand.foundation.share.activeUntil',
      'brand.foundation.share.linkLabel',
      'brand.foundation.share.create',
      'brand.foundation.share.rotate',
      'brand.foundation.share.revoke',
      'brand.foundation.share.copy',
      'brand.foundation.share.copied',
      'brand.foundation.share.copyToast',
      'brand.foundation.share.copyFailed',
      'brand.foundation.share.onceHint',
      'brand.foundation.share.replacesHint',
      'brand.foundation.share.createdToast',
      'brand.foundation.share.revokedToast',
      'brand.foundation.share.failed',
      'brand.foundation.share.open',
      'brand.foundation.share.stand',
      'brand.foundation.share.print',
      'brand.foundation.share.madeWith',
      'brand.foundation.share.product',
      'brand.foundation.share.seoTitle',
      // Die optionalen Kapitel-Vermerke — die Seite fragt sie mit `te()` ab,
      // vorhanden sein sollen sie trotzdem in beiden Sprachen.
      'brand.foundation.note.visuell',
      'brand.foundation.note.ki-texte',
      // Die Spaltenköpfe der Tabellen — je nach gespeicherter Form erzeugt die
      // Regel nur einen Teil davon, gebraucht werden sie alle.
      'brand.foundation.column.name',
      'brand.foundation.column.note',
      'brand.foundation.column.rank',
      'brand.foundation.column.check',
      'brand.foundation.column.criteria',
    ]
    expect(fixed.filter(key => missingIn(key).length)).toEqual([])
  })
})
