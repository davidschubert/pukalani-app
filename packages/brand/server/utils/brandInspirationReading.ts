import type { H3Event } from 'h3'
import { BRAND_INSPIRATION_AREAS, BRAND_READING_VERDICTS, brandTermById, brandTermLabel } from '../../shared/brandDesignVocab'
import { brandChoiceDisplayLabel } from '../../shared/brandChoiceOptions'
import {
  BRAND_INSPIRATION_MAX,
  BRAND_INSPIRATION_MAX_BYTES,
  type BrandInspirationEntry,
  detectBrandInspirationImage,
} from '../../shared/brandInspiration'
import {
  type BrandReadingEntry,
  type BrandReadingRawResponse,
  type BrandReadingSlotLabels,
  type BrandReadingSummary,
  clampBrandReadings,
} from '../../shared/brandReading'
import {
  type BrandReadingPromptImage,
  BRAND_READING_SYSTEM_PROMPT,
  brandReadingImageLabel,
  brandReadingPrompt,
} from './readingPrompt'
import { BRAND_PROVIDER_ROUTING_EU } from './brandProviderRouting'
import { brandDevStubEnabled } from './brandGenerators'
import { brandSlotPromptLabel } from './brandSlotPromptLabels'
import {
  BRAND_INSPIRATION_STEP_KEY,
  readBrandInspirationBytes,
  writeBrandInspirationReading,
} from './brandInspirationStore'
import {
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  mergeStepSlotRecords,
  parseSlotRecords,
  serializeSlotRecords,
} from './brandStore'

/**
 * DIE LESUNG DER VORBILDER — DER LAUF (Konzept docs/archiv/BRAND-DESIGN.md
 * §2.2 Schritt 3, Paket D2b).
 *
 * EIN Aufruf über ALLE Bilder, nicht einer je Bild. Das ist keine Sparsamkeit,
 * sondern der Auftrag: das FAZIT („trägt schon" / „geht besser") ist eine
 * Aussage über die ganze Sammlung, und zwölf Einzelaufrufe könnten es gar
 * nicht treffen — sie sähen nie, dass drei Bilder dasselbe sagen.
 *
 * ── DIE VIER FOUNDATION-STELLEN ───────────────────────────────────────────
 * Werte (`c.final`), Archetyp (`d.primary`), Ton-Wörter (`d.toneWords`) und
 * die Richtung (`result.direction`) — dieselben vier, an denen Schicht 2
 * insgesamt hängt (`g.dna`-Abhängigkeiten in der Registry). Genommen wird der
 * BESTÄTIGTE Wert, nicht der Entwurf: an einem Entwurf zu messen hiesse, ein
 * Vorbild gegen etwas zu halten, dem niemand zugestimmt hat (dieselbe Regel
 * wie beim Spezialisten, §8 „Entwürfe sind keine Wahrheit").
 *
 * ── BILDER SIND EINGABE, NIE AUSGABE ──────────────────────────────────────
 * Die Bytes gehen an den Anbieter und sonst nirgendwohin: nicht ins Log, nicht
 * ins Ereignis, nicht in die Antwort. Was die Route zurückgibt, sind die
 * LESUNGEN — Vokabular-Ids und Sätze über die Foundation.
 */

/** Der Zeit-Deckel eines Laufs: zwölf Bilder sind langsam, aber nicht endlos. */
const BRAND_READING_TIMEOUT_MS = 120_000
/** Zwölf Lesungen mit Anker, Begründung und Vorschlag brauchen Platz. */
const BRAND_READING_MAX_TOKENS = 4000

/**
 * DIE VIER STELLEN, GEGEN DIE GEMESSEN WIRD. Reihenfolge = Reihenfolge im
 * Prompt: erst wer die Marke IST (Werte, Archetyp), dann wie sie KLINGT
 * (Ton-Wörter), dann wohin sie WILL (Richtung).
 */
export const BRAND_READING_FOUNDATION_SLOTS = [
  'c.final',
  'd.primary',
  'd.toneWords',
  'result.direction',
] as const

/**
 * LÄUFT DER ERSATZ? — der Entwicklungs-Ersatz ODER die Beweis-Variable.
 *
 * Dieselbe Bauform und dieselbe Begründung wie `reviewStubEnabled` in
 * `brandReview.ts`: der Beweis läuft gegen einen Dev-Server der `branding`-App
 * (nur dort sind Datentür, Zugang und die sechs Kapitel-Zeilen echt), und ein
 * Beweis, der je Lauf ein multimodales Modell bezahlt, wird nicht gefahren.
 *
 * `BRAND_DEV_STUB_VISION` bewusst OHNE `NUXT_`-Präfix: keine Runtime-Config,
 * kein Pflichtschlüssel für `ops:site-env`, sondern ein Handgriff am Beweis.
 */
export function brandReadingStubEnabled(): boolean {
  return brandDevStubEnabled() || process.env.BRAND_DEV_STUB_VISION === '1'
}

/**
 * DER DETERMINISTISCHE ERSATZ. Er ruft keinen Anbieter, kostet nichts und
 * sagt in seinem Fazit, dass er ein Ersatz ist — eine Lesung, die wie eine
 * Lesung aussieht, landet irgendwann in einem Screenshot.
 *
 * DAS URTEIL HÄNGT AM BEREICH, damit alle drei Ausgänge (`fits`/`tension`/
 * `off`) in einem Lauf vorkommen: der Beweis prüft die drei Zustände der
 * Oberfläche, und ein Ersatz, der immer „passt" sagt, beweist einen davon.
 */
const STUB_VERDICT_BY_AREA: Record<string, 'fits' | 'tension' | 'off'> = {
  color: 'fits',
  type: 'fits',
  mark: 'tension',
  imagery: 'tension',
  composition: 'off',
}

function stubReading(images: readonly BrandReadingPromptImage[]): BrandReadingRawResponse {
  return {
    readings: images.map(image => ({
      id: image.id,
      // Zwei Belegungen aus dem Vokabular — echte Ids, damit die Klemmung sie
      // durchlässt und die Oberfläche echte Etiketten zeigt.
      observed: [
        { dimension: 'composition', value: 'calm' },
        { dimension: 'color', value: 'earthy' },
      ],
      verdict: STUB_VERDICT_BY_AREA[image.area.split(' ')[0] ?? ''] ?? 'fits',
      anchor: `Ersatz-Lesung · Vorbild ${image.number}`,
      reason: 'Ersatz-Lesung für den Beweis — kein Sprachmodell beteiligt.',
      suggestion: 'Im echten Betrieb steht hier der Satz der Beraterin.',
    })),
    summary: {
      keeps: ['Ersatz-Fazit: was trägt, steht hier.'],
      improves: ['Ersatz-Fazit: was besser geht, steht hier.'],
    },
  }
}

// ── Die Eingaben ───────────────────────────────────────────────────────────

/**
 * DIE FOUNDATION ALS PROMPT-BLÖCKE. Die Beschriftung kommt aus demselben
 * Katalog wie die Oberfläche (`brandSlotPromptLabel`) — die interne Id im
 * Prompt war 2026-09-03 ein Live-Fund, und sie kommt hier nicht zurück.
 *
 * Ein Wahl-Wert (`d.primary`) wird über `brandChoiceDisplayLabel` in seinen
 * Namen übersetzt: „sage" ist für ein Bildmodell kein Archetyp.
 */
export function brandReadingFoundationBlocks(
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
): { label: string, value: string }[] {
  const records = mergeStepSlotRecords(stepRows)
  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const pathKind = profile.pathKind === 'relaunch' ? 'relaunch' : 'new'
  const team = profile.team === 'team' ? 'team' : 'solo'
  const blocks: { label: string, value: string }[] = []
  for (const slotId of BRAND_READING_FOUNDATION_SLOTS) {
    const record = records[slotId]
    // NUR BESTÄTIGTES (s. Kopf): `confirmed` und nicht `brandSlotStoredValue`,
    // das den Entwurf mitnimmt.
    const raw = typeof record?.confirmed === 'string' ? record.confirmed.trim() : ''
    if (!raw) continue
    blocks.push({
      label: brandSlotPromptLabel(slotId, locale, pathKind, team),
      value: brandChoiceDisplayLabel(slotId, raw, locale) || raw,
    })
  }
  return blocks
}

/** Der Bereich eines Bildes, wie er im Prompt steht: Id UND Lesefassung. */
function areaForPrompt(areaId: string, locale: string): string {
  const term = brandTermById(BRAND_INSPIRATION_AREAS, areaId)
  return term ? `${term.id} (${brandTermLabel(term, locale)})` : areaId
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

export type BrandReadingFailure =
  | 'no_images'
  | 'provider_error'
  | 'empty_result'
  /** Mehr Bytes, als ein Zug tragen darf — die Route macht daraus eine 413. */
  | 'too_large'

export interface BrandReadingRunResult {
  readonly failure?: BrandReadingFailure
  readonly readings?: Record<string, BrandReadingEntry>
  readonly summary?: BrandReadingSummary
  /** Die Bilder, für die nichts Brauchbares zurückkam. */
  readonly missing?: readonly string[]
  /** Modell-Kennung ohne Schlüssel — für Slot-Wert und Ereignis. */
  readonly model?: string
  readonly ms?: number
}

/**
 * EINEN LAUF AUSFÜHREN. Er wirft NICHT: jeder Ausgang ist entweder eine
 * geklemmte Lesung oder ein Grund. Die Route macht daraus ihren Status —
 * dieselbe Arbeitsteilung wie bei `runStage` im Spezialisten.
 *
 * DIE ZUGEHÖRIGKEIT IST VORHER BELEGT: `requireBrandInspirationContext` hat
 * die Marke geprüft, und die Bilder kommen aus `listBrandInspiration` DIESER
 * Marke. Hier wird nichts mehr autorisiert.
 */
export async function runBrandInspirationReading(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  entries: readonly BrandInspirationEntry[],
  model: string,
): Promise<BrandReadingRunResult> {
  if (entries.length === 0) return { failure: 'no_images' }

  /**
   * DER PRODUKT-DECKEL, HIER UND NICHT ERST IM TRANSPORT (Audit-Befund
   * 2026-09-09): zwölf Bilder je Marke sind die Zusage des Kapitels
   * (`BRAND_INSPIRATION_MAX`), der Upload lässt keinen dreizehnten zu — die
   * LISTE holt aber bewusst bis zu 50 Zeilen, damit ein Altbestand sichtbar
   * bleibt (s. `listBrandInspiration`). Ohne diesen Schnitt bezahlte ein
   * solcher Altbestand einen Vision-Zug über 50 Bilder.
   *
   * Geschnitten wird VOR dem Laden: was hier wegfällt, wird gar nicht erst aus
   * dem Bucket geholt.
   */
  const capped = entries.slice(0, BRAND_INSPIRATION_MAX)

  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const images: BrandReadingPromptImage[] = capped.map(entry => ({
    id: entry.id,
    number: entry.number,
    area: areaForPrompt(entry.area, locale),
    note: entry.note,
  }))
  const at = new Date().toISOString()
  const started = Date.now()

  if (brandReadingStubEnabled()) {
    const clamped = clampBrandReadings(stubReading(images), capped.map(e => e.id), at)
    return {
      readings: clamped.readings,
      summary: clamped.summary,
      missing: clamped.missing,
      model: 'dev-stub',
      ms: Date.now() - started,
    }
  }

  /**
   * DIE BYTES. Der MIME-Typ kommt aus den MAGIC BYTES und nicht aus der Zeile:
   * die Zeile trägt gar keinen, und ein aus dem Dateinamen geratener Typ wäre
   * genau die Client-Eingabe, die der Upload schon einmal verworfen hat.
   * Ein Bild, das sich nicht laden lässt, fällt still weg — die Klemmung meldet
   * es hinterher als `missing`.
   */
  const payload: { mime: string, bytes: Uint8Array, label: string, id: string }[] = []
  for (const [index, entry] of capped.entries()) {
    try {
      const bytes = await readBrandInspirationBytes(event, entry.id)
      const kind = detectBrandInspirationImage(bytes)
      if (!kind) continue
      payload.push({
        mime: kind.mime,
        bytes,
        label: brandReadingImageLabel(images[index]!),
        id: entry.id,
      })
    }
    catch (error) {
      logEvent('warn', 'brand.reading_image_unreadable', {
        profileId: profile.$id,
        fileId: entry.id,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }
  if (payload.length === 0) return { failure: 'no_images' }

  /**
   * DIE SUMME, GEPRÜFT NACH DEM LADEN — weil die Zeile sie nicht trägt.
   *
   * `brand_inspiration` speichert keine Dateigrösse; die einzige Wahrheit über
   * die Bytes ist die Datei selbst. Der Deckel steht deshalb hier und nicht vor
   * der Schleife: geladen wird, was zwölf erlaubte Bilder sind, und danach
   * entschieden. Er greift trotzdem VOR jedem Anbieter-Aufruf — das ist die
   * Stelle, an der Geld anfängt zu kosten.
   *
   * Die Zahl ist die des PRODUKTS (12 × 5 MB) und damit enger als die
   * Transport-Sicherung in `aiVision` (16 Bilder / 64 MB): ein Produkt sagt,
   * was es zumutet, der Transport sagt, was er überhaupt noch abschickt.
   */
  const totalBytes = payload.reduce((sum, part) => sum + part.bytes.length, 0)
  const maxBytes = BRAND_INSPIRATION_MAX * BRAND_INSPIRATION_MAX_BYTES
  if (totalBytes > maxBytes) {
    logEvent('warn', 'brand.reading_payload_too_large', {
      profileId: profile.$id,
      images: payload.length,
      bytes: totalBytes,
      maxBytes,
    })
    return { failure: 'too_large' }
  }

  const prompt = brandReadingPrompt({
    contentLocale: locale,
    foundation: brandReadingFoundationBlocks(profile, stepRows),
    images: images.filter(image => payload.some(part => part.id === image.id)),
  })

  let raw: BrandReadingRawResponse
  try {
    raw = await aiVisionJson<BrandReadingRawResponse>(
      event,
      payload.map(part => ({ mime: part.mime, bytes: part.bytes, label: part.label })),
      prompt,
      {
        model,
        system: BRAND_READING_SYSTEM_PROMPT,
        label: 'brand-reading',
        maxTokens: BRAND_READING_MAX_TOKENS,
        timeoutMs: BRAND_READING_TIMEOUT_MS,
        // Die ZDR-Bedingungen dieses Layers, PLUS der Ort: hier reicht ein
        // Kunde eigene Bilder hinein, deshalb die EU-gepinnte Fassung
        // (Davids Entscheidung 2026-10-27). `data_collection: 'deny'` setzt
        // der Transport ohnehin selbst und lässt es sich nicht nehmen — `zdr`
        // und `allowFallbacks: false` verschärfen sie auf dieselbe Weise wie
        // bei jedem Text-Aufruf.
        providerRouting: { ...BRAND_PROVIDER_ROUTING_EU },
      },
    )
  }
  catch (error) {
    logEvent('warn', 'brand.reading_provider_error', {
      profileId: profile.$id,
      images: payload.length,
      // Die MELDUNG des Anbieters — nie der Prompt, nie ein Bild.
      message: error instanceof Error ? error.message : 'unknown',
    })
    return { failure: 'provider_error' }
  }

  const clamped = clampBrandReadings(raw, payload.map(part => part.id), at)
  if (Object.keys(clamped.readings).length === 0) {
    logEvent('warn', 'brand.reading_empty_result', {
      profileId: profile.$id,
      images: payload.length,
    })
    return { failure: 'empty_result' }
  }
  return {
    readings: clamped.readings,
    summary: clamped.summary,
    missing: clamped.missing,
    model,
    ms: Date.now() - started,
  }
}

// ── Das Ergebnis ablegen ───────────────────────────────────────────────────

/** Die Überschriften des Slot-Wertes, in der INHALTSSPRACHE der Marke. */
export function brandReadingSlotLabels(locale: string): BrandReadingSlotLabels {
  const verdictLabel = (id: string): string => {
    const term = brandTermById(BRAND_READING_VERDICTS, id)
    return term ? brandTermLabel(term, locale) : id
  }
  const de = locale === 'de'
  return {
    keeps: verdictLabel('fits'),
    improves: de ? 'Geht besser' : 'Could be better',
    run: de ? 'Lauf' : 'Run',
    empty: de ? 'Ohne Befund.' : 'Nothing to report.',
  }
}

/**
 * DIE LAUF-ZEILE — Zeit, Anzahl, Modell-Kennung. Sie ist TEXT und wird nie
 * zurückgeparst (s. `brandReadingSlotValue`); die Modell-Kennung ist der
 * Modell-NAME, nie ein Schlüssel und nie eine Adresse.
 */
export function brandReadingRunLine(
  at: string,
  count: number,
  model: string,
  locale: string,
): string {
  const when = new Date(at).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const images = locale === 'de' ? `${count} Bilder gelesen` : `${count} images read`
  return `${when} — ${images} — ${locale === 'de' ? 'Modell' : 'model'} ${model}`
}

/**
 * DEN SLOT-WERT VON `g.reading` SCHREIBEN.
 *
 * ── ER IST BESTÄTIGBAR, ANDERS ALS `g.inspiration` ────────────────────────
 * `g.reading` ist `type: 'derivation'` — der Mensch nimmt sie ab wie jede
 * andere Herleitung, und genau das soll er: die Lesung ist eine AUSSAGE über
 * seine Marke, kein Ablage-Vorgang. Sie reist trotzdem nirgendwohin, weil
 * `sensitivity: 'internal'` steht (`sessionContent.ts`) und
 * `brandShareableSlotValues` sie damit aus Snapshot, Share und Beispiel
 * heraushält — dieselbe zweite Sicherung wie bei den Bildern.
 *
 * ── EINE NEUE FASSUNG NIMMT DIE BESTÄTIGUNG MIT ───────────────────────────
 * Ein neuer Lauf schreibt `latestDraft` und LÖSCHT `confirmed`: der Mensch hat
 * einer ANDEREN Lesung zugestimmt, und eine stehengebliebene Bestätigung wäre
 * eine Zustimmung, die er nie gegeben hat. Das ist dieselbe Regel, die die
 * Korrektur-Kette (§9) für jeden anderen Slot durchsetzt — hier von Hand, weil
 * der Lauf nicht über den Autosave-PATCH läuft.
 */
export async function writeBrandReadingSlot(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  value: string,
): Promise<void> {
  const stepRow = stepRows.find(row => row.stepKey === BRAND_INSPIRATION_STEP_KEY)
  if (!stepRow) {
    logEvent('warn', 'brand.reading_slot_row_missing', { profileId: profile.$id })
    return
  }
  const records = parseSlotRecords(stepRow.slots)
  const before = records['g.reading']
  const next: Record<string, BrandSlotRecord> = {
    ...records,
    'g.reading': {
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
    logEvent('warn', 'brand.reading_slot_write_failed', {
      profileId: profile.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * DIE LESUNGEN IN DIE ZEILEN SCHREIBEN — je Bild eine. Gibt zurück, wie viele
 * wirklich angekommen sind: eine Zeile, die inzwischen entfernt wurde (der
 * Mensch hat während des Laufs gelöscht), ist kein Fehler, sondern eine
 * Lesung weniger.
 */
export async function storeBrandReadings(
  event: H3Event,
  readings: Record<string, BrandReadingEntry>,
): Promise<number> {
  let written = 0
  for (const [fileId, reading] of Object.entries(readings)) {
    if (await writeBrandInspirationReading(event, fileId, reading)) written += 1
  }
  return written
}

/** Die Session, deren Wert dieser Lauf schreibt. */
export const BRAND_READING_SLOT_ID = 'g.reading'
