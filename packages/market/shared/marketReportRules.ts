import type {
  MarketCompetitor,
  MarketEvidence,
  MarketFieldId,
  MarketFrequency,
  MarketProfile,
  MarketProfileField,
} from './marketProfile'
import { MARKET_FIELDS, MARKET_OWN_ID, marketField } from './marketProfile'
import { normalizeEvidence } from './marketExtractRules'

/**
 * DIE REGELN DES VERGLEICHS (Plan §2.3 Nr. 4–5, MV1 M3) — PUR: keine
 * Appwrite, kein H3, kein Modell.
 *
 * ── WAS DAS MODELL DARF UND WAS DER CODE ENTSCHEIDET ──────────────────────
 * Das Modell liefert AUSSAGEN („was sagen alle im Feld", „das sagen wir auch",
 * „das sagt niemand"). Es liefert KEINE Zahl und KEINE Wahrheit:
 *
 *  · Die GEGENÜBERSTELLUNG (Matrix) baut der Code aus den Marktprofilen — Zelle
 *    für Zelle, Feld für Feld. Ein Modell, das sie mitschriebe, könnte einen
 *    Wert leise ändern, und niemand sähe es, weil daneben ein echtes Zitat
 *    steht.
 *  · Die QUOTE einer Konvention (≥ 60 %) rechnet der Code nach. „Das sagen
 *    alle" ist die interessanteste Aussage des ganzen Berichts — und die
 *    einzige, bei der ein Modell durch blosses Zählen falsch liegen kann.
 *  · Jedes ZITAT wird gegen das Marktprofil GENAU DER Marke geprüft, der es
 *    zugeschrieben wird. Das ist derselbe Riegel wie in der Extraktion, nur
 *    eine Stufe später: dort musste das Zitat im Rohtext stehen, hier muss es
 *    ein bereits BELEGTES Zitat sein. Ein Modell kann damit keine Aussage
 *    einer Marke unterschieben, die sie nie gemacht hat.
 *
 * ── WARUM DER BERICHT EIN STAND IST UND KEIN STROM ────────────────────────
 * `marketRevisionInput` beschreibt genau das, worüber gerechnet wurde: die
 * eigenen Werte, die Kandidaten und ihre Abrufstände. Gleiche Zeichenkette ⇒
 * gleicher Bericht ⇒ kein zweiter Modell-Aufruf (§2.3 Nr. 5). Und weil
 * dieselbe Rechnung später sagt, ob der gespeicherte Bericht noch zum
 * aktuellen Stand passt, ist `stale` keine zweite Regel, sondern dieselbe
 * (Plan §2.4).
 */

// ── 1 · Die Gegenüberstellung (deterministisch) ────────────────────────────

export interface MarketMatrixCell {
  /** `_own` für die eigene Marke, sonst die Kandidaten-Id. */
  readonly competitorId: string
  /** Der Kurzwert; leer heisst „hier steht nichts". */
  readonly value: string
  readonly items?: readonly string[]
  readonly evidence?: MarketEvidence
  readonly frequency?: MarketFrequency
  /**
   * WARUM DIE ZELLE LEER IST — die zwei Fälle bedeuten Verschiedenes und
   * dürfen im Bericht nicht gleich aussehen (Plan §2.4): `own` heisst „bei
   * euch noch nicht bestätigt", `field` heisst „diese Marke sagt dazu
   * öffentlich nichts", `excluded` heisst „wir durften nicht nachsehen".
   */
  readonly empty?: 'own' | 'field' | 'excluded'
}

export interface MarketMatrixRow {
  readonly fieldId: MarketFieldId
  readonly cells: readonly MarketMatrixCell[]
}

function cellFrom(field: MarketProfileField | undefined, empty: 'own' | 'field'): Omit<MarketMatrixCell, 'competitorId'> {
  const value = field?.value?.trim() ?? ''
  if (!value) return { value: '', empty }
  return {
    value,
    ...(field?.items?.length ? { items: field.items } : {}),
    ...(field?.evidence ? { evidence: field.evidence } : {}),
    ...(field?.frequency ? { frequency: field.frequency } : {}),
  }
}

/**
 * DIE MATRIX — Zeile Feld × Spalte Marke, die eigene zuerst.
 *
 * Sie liest AUSSCHLIESSLICH aus `own` und `profiles`. Jede Zelle ist damit
 * buchstäblich ein Marktprofil-Feld; der Beweis rechnet genau das nach.
 */
export function marketMatrixRows(
  own: readonly MarketProfileField[],
  competitors: readonly MarketCompetitor[],
  profiles: readonly MarketProfile[],
): MarketMatrixRow[] {
  const byCompetitor = new Map(profiles.map(profile => [profile.competitorId, profile.fields]))

  return MARKET_FIELDS.map((definition) => {
    const cells: MarketMatrixCell[] = [
      { competitorId: MARKET_OWN_ID, ...cellFrom(marketField(own, definition.id), 'own') },
    ]
    for (const competitor of competitors) {
      if (competitor.status === 'excluded') {
        cells.push({ competitorId: competitor.id, value: '', empty: 'excluded' })
        continue
      }
      const fields = byCompetitor.get(competitor.id) ?? []
      cells.push({ competitorId: competitor.id, ...cellFrom(marketField(fields, definition.id), 'field') })
    }
    return { fieldId: definition.id, cells }
  })
}

// ── 2 · Die Quote einer Konvention ─────────────────────────────────────────

/**
 * „EINTRITTSKARTE" heisst: mindestens 60 % der Marken, die in diesem Feld
 * überhaupt etwas sagen, sagen dasselbe (Plan §2.3 Nr. 4).
 *
 * Der Nenner sind ausdrücklich NICHT alle Kandidaten: eine Marke, die zum
 * Purpose öffentlich schweigt, ist keine Gegenstimme — sie ist keine Stimme.
 * Nähme man sie mit, sänke die Quote mit jedem stillen Wettbewerber, und
 * ausgerechnet in den seltener besetzten Feldern (Purpose, Markenzeichen)
 * käme nie eine Konvention zustande.
 */
export const MARKET_CONVENTION_MIN_SHARE = 0.6

export function conventionMeetsQuota(sharedBy: number, of: number): boolean {
  if (of <= 0 || sharedBy <= 0 || sharedBy > of) return false
  // Mindestens ZWEI Marken — eine einzelne Marke ist keine Konvention, auch
  // wenn sie die einzige ist, die in dem Feld etwas sagt (1 von 1 = 100 %).
  if (sharedBy < 2) return false
  return sharedBy / of >= MARKET_CONVENTION_MIN_SHARE
}

/**
 * WIE VIELE MARKEN SAGEN IN DIESEM FELD ÜBERHAUPT ETWAS — der Nenner.
 *
 * `includeOwn` trennt die zwei Fragen (Prototyp-Vertrag, `demoMarket.ts`):
 * bei einer KONVENTION zählt die eigene Marke mit („was sagen alle im Feld" —
 * wir sind Teil des Feldes), bei einer ÜBERSCHNEIDUNG nicht („wer sagt unsere
 * Aussage AUCH").
 */
export function marketFieldSpeakers(
  fieldId: MarketFieldId,
  own: readonly MarketProfileField[],
  competitors: readonly MarketCompetitor[],
  profiles: readonly MarketProfile[],
  includeOwn: boolean,
): number {
  const byCompetitor = new Map(profiles.map(profile => [profile.competitorId, profile.fields]))
  let count = includeOwn && (marketField(own, fieldId)?.value.trim() ?? '') ? 1 : 0
  for (const competitor of competitors) {
    if (competitor.status === 'excluded') continue
    const value = marketField(byCompetitor.get(competitor.id) ?? [], fieldId)?.value.trim() ?? ''
    if (value) count++
  }
  return count
}

// ── 3 · Die Belegprüfung der Modell-Zitate ─────────────────────────────────

/**
 * IST DIESES ZITAT WIRKLICH EIN BELEG DIESER MARKE IN DIESEM FELD?
 *
 * Geprüft wird gegen das Zitat, das die EXTRAKTION für dieses Feld dieser
 * Marke gespeichert hat — und das seinerseits schon wörtlich im Rohtext stand.
 * Erlaubt ist Gleichheit oder eine KÜRZUNG (das Modell zitiert oft den Kern
 * eines längeren Satzes); nicht erlaubt ist eine Erweiterung, ein Umbau oder
 * eine Übersetzung.
 *
 * Ohne `fieldId` wird über ALLE Felder dieser Marke geprüft — der Fall einer
 * Konvention, deren Aussage sich aus einem Nachbarfeld belegen lässt.
 */
export function citationIsGrounded(
  quote: string,
  fields: readonly MarketProfileField[],
  fieldId?: MarketFieldId,
): boolean {
  const needle = normalizeEvidence(quote)
  // Ein Vier-Zeichen-„Zitat" belegt nichts und träfe irgendwo.
  if (needle.length < 12) return false
  const pool = fieldId ? fields.filter(field => field.fieldId === fieldId) : fields
  return pool.some((field) => {
    const stored = normalizeEvidence(field.evidence?.quote ?? '')
    return stored.length > 0 && stored.includes(needle)
  })
}

/** Das gespeicherte Beleg-Objekt zu einem geprüften Zitat. */
export function citationEvidence(
  fields: readonly MarketProfileField[],
  fieldId?: MarketFieldId,
): MarketProfileField | undefined {
  const pool = fieldId ? fields.filter(field => field.fieldId === fieldId) : fields
  return pool.find(field => field.evidence)
}

// ── 4 · Der Bericht-Schlüssel (Idempotenz und `stale`) ─────────────────────

/** Ein Kandidat, so wie er in den Schlüssel eingeht. */
export interface MarketRevisionCandidate {
  readonly id: string
  readonly sourceKind: string
  readonly sourceRef: string
  readonly url: string
  /** Der Stand der Auswertung — `''`, solange keine vorliegt. */
  readonly inputHash: string
}

export interface MarketRevisionInput {
  readonly own: readonly MarketProfileField[]
  readonly candidates: readonly MarketRevisionCandidate[]
  /** Die Fassung der Bibliothek — ein neuer Eintrag ist ein neuer Stand. */
  readonly libraryVersion: string
}

/**
 * DIE KANONISCHE ZEICHENKETTE DES BERICHT-STANDES.
 *
 * Sie geht durch `brandGenerationHashInput` (der Bauer, der schon den
 * `sourcesHash` und den `inputHash` der Generationen baut) — nicht, weil es
 * bequem wäre, sondern weil er die REGISTRY-FASSUNG mitführt: ändert sich das
 * Feld-Verzeichnis der Foundation, ist auch der Marktvergleich ein anderer,
 * und das soll man am Schlüssel sehen. Hier steht nur die Zutatenliste; das
 * Zusammensetzen und das Hashen macht der Server (`node:crypto` gehört nicht
 * in ein Client-Bündel).
 *
 * DIE KANDIDATEN WERDEN SORTIERT, die Felder folgen der Registry-Reihenfolge:
 * derselbe Stand muss denselben Schlüssel ergeben, egal in welcher Folge
 * Appwrite die Zeilen liefert.
 */
export function marketRevisionEntries(
  input: MarketRevisionInput,
): { slotId: string, value: string }[] {
  const entries: { slotId: string, value: string }[] = []
  for (const definition of MARKET_FIELDS) {
    entries.push({
      slotId: `own:${definition.id}`,
      value: marketField(input.own, definition.id)?.value.trim() ?? '',
    })
  }
  const sorted = [...input.candidates].sort((a, b) => a.id.localeCompare(b.id))
  for (const candidate of sorted) {
    entries.push({
      slotId: `cand:${candidate.id}`,
      value: [candidate.sourceKind, candidate.sourceRef, candidate.url, candidate.inputHash].join('|'),
    })
  }
  entries.push({ slotId: 'library', value: input.libraryVersion })
  return entries
}
