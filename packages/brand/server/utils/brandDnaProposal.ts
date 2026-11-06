import type { H3Event } from 'h3'
import {
  BRAND_DNA_DIMENSIONS,
  BRAND_INSPIRATION_AREAS,
  BRAND_READING_VERDICTS,
  type BrandDesignTerm,
  brandTermById,
  brandTermLabel,
} from '../../shared/brandDesignVocab'
import {
  type BrandDnaProposalEntry,
  type BrandDnaRawResponse,
  clampBrandDnaProposal,
} from '../../shared/brandDesignDna'
import type { BrandInspirationEntry } from '../../shared/brandInspiration'
import {
  type BrandDnaPromptReading,
  BRAND_DNA_SYSTEM_PROMPT,
  brandDnaPrompt,
} from './dnaPrompt'
import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'
import { brandDevStubEnabled } from './brandGenerators'
import { brandReadingFoundationBlocks } from './brandInspirationReading'
import { BRAND_INSPIRATION_STEP_KEY } from './brandInspirationStore'
import {
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  parseSlotRecords,
  serializeSlotRecords,
} from './brandStore'

/**
 * DER DNA-VORSCHLAG — DER LAUF (Konzept docs/archiv/BRAND-DESIGN.md §2.2
 * Schritt 4, Paket D2c).
 *
 * EIN Text-Lauf über die ganze Foundation, nicht einer je Dimension: die zehn
 * Dimensionen sind ORTHOGONAL, aber sie sind EINE Ableitung — zehn Aufrufe
 * sähen nie, dass Farbwelt und Grundstimmung dasselbe Ton-Wort tragen, und die
 * Begründungen widersprächen sich reihum.
 *
 * ── DIESELBEN VIER FOUNDATION-STELLEN WIE DIE LESUNG ──────────────────────
 * `brandReadingFoundationBlocks` wird IMPORTIERT, nicht abgeschrieben: Werte,
 * Archetyp, Ton-Wörter und Richtung, jeweils der BESTÄTIGTE Wert. Zwei Kopien
 * derselben vier Slots wären beim ersten fünften Slot zwei verschiedene
 * Massstäbe — und der Vorschlag misst sich am selben Massstab wie die Lesung,
 * die er als Beleg zitiert.
 *
 * ── NEUN ZEILEN SIND KEIN VORSCHLAG ───────────────────────────────────────
 * Bleibt nach der Klemmung auch nur eine Dimension offen, ist der Lauf ein
 * FEHLSCHLAG (`incomplete`) und nichts wird geschrieben. Eine unvollständige
 * DNA wäre nicht „etwas weniger": aus ihr entstünden drei Boards mit einem
 * Loch (`brandDnaBoards` schreibt dort einen leeren Wert), der Mix zeigte eine
 * leere Zeile, und `buildBrandDesign` weist eine unvollständige Belegung
 * ohnehin ab — der Kunde stünde vor einem Kapitel, das er nicht abschliessen
 * kann, ohne zu erfahren warum.
 *
 * ── ER WIRFT NICHT ────────────────────────────────────────────────────────
 * Jeder Ausgang ist eine geklemmte Liste oder ein Grund; die Route macht
 * daraus ihren Status. Dieselbe Arbeitsteilung wie bei
 * `runBrandInspirationReading` (D2b) und `runStage` beim Spezialisten.
 */

/** Zehn Zeilen mit Begründung sind ein Text-Lauf, kein Bildlauf — 60 s reichen. */
const BRAND_DNA_TIMEOUT_MS = 60_000
/** Zehn Begründungen à 420 Zeichen plus Vorbild-Sätze brauchen Platz. */
const BRAND_DNA_MAX_TOKENS = 3000

/** Die Session, deren Wert dieser Lauf schreibt. */
export const BRAND_DNA_SLOT_ID = 'g.dna'

/**
 * LÄUFT DER ERSATZ? — der Entwicklungs-Ersatz ODER die Beweis-Variable.
 *
 * Dieselbe Bauform und dieselbe Begründung wie `brandReadingStubEnabled`
 * (D2b): der Beweis läuft gegen einen Dev-Server der `branding`-App, und ein
 * Beweis, der je Lauf ein Modell bezahlt, wird nicht gefahren.
 *
 * `BRAND_DEV_STUB_DNA` bewusst OHNE `NUXT_`-Präfix, genau wie
 * `BRAND_DEV_STUB_VISION`: keine Runtime-Config, kein Pflichtschlüssel für
 * `ops:site-env`, sondern ein Handgriff am Beweis.
 */
export function brandDnaStubEnabled(): boolean {
  return brandDevStubEnabled() || process.env.BRAND_DEV_STUB_DNA === '1'
}

// ── Die Eingaben ───────────────────────────────────────────────────────────

/** Der Bereich bzw. das Urteil, wie es im Prompt steht: Id UND Lesefassung. */
function termForPrompt(terms: readonly BrandDesignTerm[], id: string, locale: string): string {
  const term = brandTermById(terms, id)
  return term ? `${term.id} (${brandTermLabel(term, locale)})` : id
}

/**
 * DIE LESUNGEN ALS BELEGE — je Vorbild eine Zeile, ZEILEN OHNE LESUNG FALLEN
 * WEG.
 *
 * Ein noch ungelesenes Vorbild trägt nichts bei, was der Vorschlag zitieren
 * könnte: es hat weder Belegung noch Anker. Es im Prompt zu nennen hiesse, dem
 * Modell eine Nummer zu geben, über die es nichts weiss — und genau daraus
 * entsteht „wie in Vorbild 4".
 */
export function brandDnaPromptReadings(
  entries: readonly BrandInspirationEntry[],
  locale: string,
): BrandDnaPromptReading[] {
  const readings: BrandDnaPromptReading[] = []
  for (const entry of entries) {
    const reading = entry.reading
    if (!reading) continue
    readings.push({
      number: entry.number,
      area: termForPrompt(BRAND_INSPIRATION_AREAS, entry.area, locale),
      verdict: termForPrompt(BRAND_READING_VERDICTS, reading.verdict, locale),
      anchor: reading.anchor,
      reason: reading.reason,
      ...(reading.suggestion ? { suggestion: reading.suggestion } : {}),
      observed: reading.observed.map(item => ({ dimension: item.dimension, value: item.value })),
    })
  }
  return readings
}

// ── Der Ersatz ─────────────────────────────────────────────────────────────

/**
 * EIN STABILER FINGERABDRUCK DER FOUNDATION — FNV-1a über den zusammengesetzten
 * Text, je Dimension mit ihrer Id gesalzen.
 *
 * Deterministisch, damit derselbe Stand zweimal dieselbe DNA ergibt (der
 * Beweis vergleicht zwei Läufe), und NICHT konstant, damit zwei verschiedene
 * Marken im Ersatz nicht dieselben zehn Werte bekommen — ein Ersatz, der immer
 * `minimal` sagt, beweist genau eine Zeile der Oberfläche.
 */
function foundationHash(text: string, salt: string): number {
  let hash = 0x811c9dc5
  for (const char of `${salt}|${text}`) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * DER DETERMINISTISCHE ERSATZ. Er ruft keinen Anbieter, kostet nichts und sagt
 * in JEDER Begründung, dass er ein Ersatz ist — eine Ableitung, die wie eine
 * echte aussieht, landet irgendwann in einem Screenshot.
 *
 * Er nennt die Foundation-Stelle trotzdem: ohne Begründung wirft die Klemmung
 * die Zeile weg, und der Ersatz-Lauf endete auf `incomplete` statt auf dem
 * Zustand, den der Beweis sehen soll.
 *
 * MIT LESUNGEN ÜBERNIMMT ER IHRE BELEGUNG. Damit hat ein Ersatz-Lauf MIT
 * Vorbildern garantiert mindestens eine `both`-Zeile (der Beweis prüft genau
 * das) und ohne Vorbilder garantiert keine — die zwei Zustände der Oberfläche
 * sind so beide erreichbar, ohne ein Modell zu bezahlen.
 */
function stubProposal(
  foundation: readonly { label: string, value: string }[],
  readings: readonly BrandDnaPromptReading[],
): BrandDnaRawResponse {
  const text = foundation.map(block => `${block.label}: ${block.value}`).join('\n')
  const anchor = foundation[0]?.label ?? 'Foundation'

  // Erste Lesung, die eine Dimension belegt — Dimensions-Id → Wert + Nummer.
  const observed = new Map<string, { value: string, number: number }>()
  for (const reading of readings) {
    for (const item of reading.observed) {
      if (!observed.has(item.dimension)) {
        observed.set(item.dimension, { value: item.value, number: reading.number })
      }
    }
  }

  return {
    dna: BRAND_DNA_DIMENSIONS.map((dimension) => {
      const fromReading = observed.get(dimension.id)
      const fallback = dimension.values[foundationHash(text, dimension.id) % dimension.values.length]!
      const value = fromReading && dimension.values.some(entry => entry.id === fromReading.value)
        ? fromReading.value
        : fallback.id
      const fromInspiration = Boolean(fromReading) && value === fromReading?.value
      return {
        dimension: dimension.id,
        value,
        origin: fromInspiration ? 'both' : 'foundation',
        reason: `Ersatz-Ableitung für den Beweis — kein Sprachmodell beteiligt. `
          + `Gemessen an: ${anchor}.`,
        ...(fromInspiration
          ? { inspirationReason: `Ersatz-Bezug — wie in Vorbild ${fromReading!.number}.` }
          : {}),
      }
    }),
  }
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

export type BrandDnaFailure =
  /** Keine BESTÄTIGTE Foundation-Stelle — es gibt nichts, woraus abzuleiten wäre. */
  | 'no_foundation'
  | 'provider_error'
  /** Nach der Klemmung fehlt mindestens eine der zehn Dimensionen. */
  | 'incomplete'

export interface BrandDnaRunResult {
  readonly failure?: BrandDnaFailure
  readonly entries?: readonly BrandDnaProposalEntry[]
  /** Hat der Lauf mit Vorbildern gerechnet? Die Oberfläche zeigt danach die Herkunft. */
  readonly hasInspiration?: boolean
  /** Modell-Kennung ohne Schlüssel — für Antwort und Ereignis. */
  readonly model?: string
  readonly ms?: number
}

/**
 * EINEN LAUF AUSFÜHREN.
 *
 * DIE ZUGEHÖRIGKEIT IST VORHER BELEGT: `requireBrandInspirationContext` hat
 * die Marke geprüft, und die Lesungen kommen aus den Zeilen DIESER Marke. Hier
 * wird nichts mehr autorisiert.
 */
export async function runBrandDnaProposal(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  readings: readonly BrandDnaPromptReading[],
  model: string,
): Promise<BrandDnaRunResult> {
  const foundation = brandReadingFoundationBlocks(profile, stepRows)
  if (foundation.length === 0) return { failure: 'no_foundation' }

  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const hasInspiration = readings.length > 0
  const started = Date.now()

  let raw: BrandDnaRawResponse
  if (brandDnaStubEnabled()) {
    raw = stubProposal(foundation, readings)
  }
  else {
    const prompt = brandDnaPrompt({ contentLocale: locale, foundation, readings })
    try {
      raw = await aiCompleteJson<BrandDnaRawResponse>(event, prompt, {
        model,
        system: BRAND_DNA_SYSTEM_PROMPT,
        label: 'brand-dna',
        maxTokens: BRAND_DNA_MAX_TOKENS,
        timeoutMs: BRAND_DNA_TIMEOUT_MS,
        // Die ZDR-Bedingungen dieses Layers, wie bei jedem anderen Aufruf.
        providerRouting: { ...BRAND_PROVIDER_ROUTING },
      })
    }
    catch (error) {
      logEvent('warn', 'brand.dna_provider_error', {
        profileId: profile.$id,
        readings: readings.length,
        // Die MELDUNG des Anbieters — nie der Prompt, nie die Foundation.
        message: error instanceof Error ? error.message : 'unknown',
      })
      return { failure: 'provider_error' }
    }
  }

  const clamped = clampBrandDnaProposal(raw, hasInspiration)
  if (clamped.missing.length > 0) {
    logEvent('warn', 'brand.dna_incomplete', {
      profileId: profile.$id,
      missing: clamped.missing.length,
      entries: clamped.entries.length,
    })
    return { failure: 'incomplete' }
  }

  return {
    entries: clamped.entries,
    hasInspiration,
    model: brandDnaStubEnabled() ? 'dev-stub' : model,
    ms: Date.now() - started,
  }
}

// ── Das Ergebnis ablegen ───────────────────────────────────────────────────

/**
 * DEN SLOT-WERT VON `g.dna` SCHREIBEN.
 *
 * ── EINE NEUE FASSUNG NIMMT DIE BESTÄTIGUNG MIT ───────────────────────────
 * Wörtlich dieselbe Regel wie bei `writeBrandReadingSlot` (D2b): `firstDraft`
 * bleibt stehen, `latestDraft` ist neu, und ein bestehendes `confirmed` wird
 * NICHT übernommen — der Mensch hat einer ANDEREN Fassung zugestimmt, und eine
 * stehengebliebene Bestätigung wäre eine Zustimmung, die er nie gegeben hat.
 * Hier von Hand, weil der Lauf nicht über den Autosave-PATCH läuft.
 *
 * `BRAND_INSPIRATION_STEP_KEY` heisst so wegen D2a, sein WERT ist `'dna'` —
 * `g.inspiration`, `g.reading` und `g.dna` liegen in derselben Kapitel-Zeile.
 */
export async function writeBrandDnaSlot(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  value: string,
): Promise<void> {
  const stepRow = stepRows.find(row => row.stepKey === BRAND_INSPIRATION_STEP_KEY)
  if (!stepRow) {
    logEvent('warn', 'brand.dna_slot_row_missing', { profileId: profile.$id })
    return
  }
  const records = parseSlotRecords(stepRow.slots)
  const before = records[BRAND_DNA_SLOT_ID]
  const next: Record<string, BrandSlotRecord> = {
    ...records,
    [BRAND_DNA_SLOT_ID]: {
      firstDraft: before?.firstDraft ?? value,
      latestDraft: value,
      updatedAt: new Date().toISOString(),
    },
  }
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      rowId: stepRow.$id,
      data: {
        slots: serializeSlotRecords(next),
        revision: (stepRow.revision ?? 0) + 1,
      },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.dna_slot_write_failed', {
      profileId: profile.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}
