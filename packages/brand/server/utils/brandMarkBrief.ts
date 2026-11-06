import type { H3Event } from 'h3'
import {
  type BrandMarkBrief,
  type BrandMarkBriefRaw,
  brandMarkBriefSlotValue,
  brandMarkDerivedBriefFields,
  brandMarkInitial,
  brandMarkKindDefault,
  clampBrandMarkBrief,
  isBrandMarkKind,
} from '../../shared/brandDesignMark'
import {
  brandDnaValuesOf,
  parseBrandDnaMixSlotValue,
} from '../../shared/brandDesignDna'
import {
  BRAND_DNA_DIMENSIONS,
  BRAND_MARK_KINDS,
  brandTermById,
  brandTermLabel,
} from '../../shared/brandDesignVocab'
import { brandFontPair } from '../../shared/brandFontPairs'
import { canEnterBrandStep, resolveBrandJourney } from '../../shared/brandJourney'
import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'
import { brandDevStubEnabled } from './brandGenerators'
import { brandReadingFoundationBlocks } from './brandInspirationReading'
import { BRAND_MARK_BRIEF_SYSTEM_PROMPT, brandMarkBriefPrompt } from './markPrompt'
import {
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  brandSlotStoredValue,
  loadOwnedProfile,
  loadStepRows,
  mergeStepSlotRecords,
  parseSlotRecords,
  profileFacts,
  requireProfileIdParam,
  serializeSlotRecords,
  toStepFacts,
} from './brandStore'

/**
 * DAS ZEICHEN-BRIEFING — DER LAUF (Konzept docs/archiv/BRAND-DESIGN.md §2.5
 * Stufe 1, Paket D5a).
 *
 * EIN Text-Lauf über Foundation, DNA und die schon beschlossenen Kapitel
 * (Farbwelt, Schrift). Vier Felder, keine Bildbeschreibung — was hier
 * entsteht, ist der Prüfstein für JEDEN späteren Entwurf, auch für die
 * KI-Entwürfe aus D5c.
 *
 * ── ZWEI FELDER LAUFEN NICHT MIT ──────────────────────────────────────────
 * Schutzraum und Varianten sind gerechnet (`brandMarkDerivedBriefFields`) und
 * kommen NACH der Klemmung dazu. Die Begründung steht im Kopf von
 * `shared/brandDesignMark.ts`: ein Mass, das ein Modell erfindet, erfüllt das
 * Qualitätsmerkmal der Session nur zufällig.
 *
 * ── ER WIRFT NICHT ────────────────────────────────────────────────────────
 * Jeder Ausgang ist ein geklemmtes Briefing oder ein Grund; die Route macht
 * daraus ihren Status. Dieselbe Arbeitsteilung wie bei `runBrandDnaProposal`
 * (D2c) und `runBrandInspirationReading` (D2b).
 */

/** Vier Absätze sind ein Text-Lauf, kein Bildlauf — 60 s reichen. */
const BRAND_MARK_BRIEF_TIMEOUT_MS = 60_000
/** Vier Felder à 420 Zeichen plus JSON-Rahmen brauchen keinen Roman. */
const BRAND_MARK_BRIEF_MAX_TOKENS = 1200

/** Die Session, deren Wert dieser Lauf schreibt. */
export const BRAND_MARK_BRIEF_SLOT_ID = 'j.brief'
/** Das Kapitel, in dessen Zeile sie liegt. */
export const BRAND_MARK_STEP_KEY = 'mark' as const

/**
 * LÄUFT DER ERSATZ? — der Entwicklungs-Ersatz ODER die Beweis-Variable.
 *
 * Dieselbe Bauform und dieselbe Begründung wie `brandDnaStubEnabled` (D2c):
 * der Beweis läuft gegen einen Dev-Server der `branding`-App, und ein Beweis,
 * der je Lauf ein Modell bezahlt, wird nicht gefahren. `BRAND_DEV_STUB_MARK`
 * bewusst OHNE `NUXT_`-Präfix — keine Runtime-Config, kein Pflichtschlüssel
 * für `ops:site-env`, sondern ein Handgriff am Beweis.
 */
export function brandMarkBriefStubEnabled(): boolean {
  return brandDevStubEnabled() || process.env.BRAND_DEV_STUB_MARK === '1'
}

// ── Die Schranken ──────────────────────────────────────────────────────────

export interface BrandMarkContext {
  profile: BrandProfileRow
  stepRows: BrandStepRow[]
}

/**
 * DIE DREI SCHRANKEN AUF EINMAL — es gibt diese Marke, sie gehört diesem
 * Konto, und `mark` ist für sie offen.
 *
 * Wörtlich dieselbe Kette wie `requireBrandInspirationContext` (D2a), nur für
 * ein anderes Kapitel. Sie steht hier und nicht dort, weil dort der Name die
 * VORBILDER meint und die Prüfung an `dna` hängt; eine gemeinsame Fassung mit
 * Kapitel-Argument wäre die dritte Stelle, an der `canEnterBrandStep` gerufen
 * wird, und keine davon würde dadurch klarer.
 *
 * 404 und nicht 403: sie verrät nicht, ob es die Marke gibt.
 */
export async function requireBrandMarkContext(
  event: H3Event,
  userId: string,
  betaAccount: boolean,
): Promise<BrandMarkContext> {
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const stepRows = await loadStepRows(event, profile.$id)
  const journey = resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(stepRows))
  const decision = canEnterBrandStep(journey, BRAND_MARK_STEP_KEY)
  if (!decision.allowed) throw createError({ status: 404, statusText: 'Not Found' })
  return { profile, stepRows }
}

// ── Die Eingaben ───────────────────────────────────────────────────────────

/** Was der Prompt aus den bestätigten Kapiteln braucht. */
export interface BrandMarkBriefSources {
  readonly locale: string
  readonly brandName: string
  readonly initial: string
  readonly kindId: string
  readonly dnaLines: readonly string[]
  readonly settled: readonly string[]
}

function confirmedOf(
  records: Readonly<Record<string, BrandSlotRecord>>,
  slotId: string,
): string {
  const value = records[slotId]?.confirmed
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * DIE QUELLEN DES BRIEFINGS — DNA, Richtung, Schriftpaar, Farbwelt.
 *
 * ALLES AUS DEM BESTÄTIGTEN STAND: ein Entwurf, den niemand bestätigt hat,
 * ist keine Entscheidung, und ein Briefing, das sich darauf beruft, wäre beim
 * nächsten Öffnen falsch (dieselbe Regel wie `brandReadingFoundationBlocks`).
 *
 * FEHLT ETWAS, FEHLT ES IM PROMPT — der Lauf scheitert daran nicht. Ohne DNA
 * steht dort „(none recorded)", und das Modell hält sich an die Foundation;
 * ein Kapitel, das sich wegen einer fehlenden Nebenquelle gar nicht mehr
 * öffnen lässt, wäre die teurere Antwort.
 */
export function brandMarkBriefSources(
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
): BrandMarkBriefSources {
  const records = mergeStepSlotRecords(stepRows)
  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const brandName = (profile.title ?? '').trim()

  const mixEntries = parseBrandDnaMixSlotValue(confirmedOf(records, 'g.mix'))
  const dnaValues = mixEntries ? brandDnaValuesOf(mixEntries) : undefined
  const dnaLines = BRAND_DNA_DIMENSIONS
    .map((dimension) => {
      const valueId = dnaValues?.[dimension.id] ?? ''
      const value = dimension.values.find(entry => entry.id === valueId)
      return value ? `${dimension.id}: ${value.id} (${brandTermLabel(value, locale)})` : ''
    })
    .filter(line => line.length > 0)

  /**
   * DIE RICHTUNG IST DIE EINZIGE QUELLE AUS DEM EIGENEN KAPITEL — und die
   * einzige, die auch UNBESTÄTIGT zählt.
   *
   * Alles andere hier kommt aus FREMDEN, abgeschlossenen Kapiteln; dort ist
   * „nur Bestätigtes" richtig (s. Kopf). `j.kind` steht dagegen zwei
   * Abschnitte über dem Knopf: wer gerade „Monogramm" angeklickt hat und dann
   * das Briefing erzeugen lässt, bekäme sonst ein Briefing für eine
   * Wortmarke, ohne dass es irgendwo stünde (beim eigenen Klick erwischt).
   * Der Wert wandert erst am Kapitelende in `confirmed` — dieselbe Mechanik
   * wie in Farbwelt und Typografie.
   */
  const storedKind = brandSlotStoredValue(records['j.kind'])
  const kindId = isBrandMarkKind(storedKind) ? storedKind : brandMarkKindDefault(dnaValues)

  const settled: string[] = []
  const pair = brandFontPair(confirmedOf(records, 'i.pair'))
  if (pair) {
    settled.push(`type pair: headings ${pair.headingFamily}, body ${pair.bodyFamily}`)
  }
  const base = confirmedOf(records, 'h.base')
  if (base) settled.push(`base colour: ${base}`)
  const accent = confirmedOf(records, 'h.accent')
  if (accent) settled.push(`accent colour: ${accent}`)

  return {
    locale,
    brandName,
    initial: brandMarkInitial(brandName),
    kindId,
    dnaLines,
    settled,
  }
}

// ── Der Ersatz ─────────────────────────────────────────────────────────────

/**
 * DER DETERMINISTISCHE ERSATZ. Er ruft keinen Anbieter, kostet nichts und
 * sagt in JEDEM Feld, dass er ein Ersatz ist — ein Briefing, das wie ein
 * echtes aussieht, landet irgendwann in einem Screenshot (dieselbe Regel wie
 * beim DNA-Ersatz).
 *
 * Er nennt trotzdem Richtung und Name: die Klemmung wirft leere Felder weg,
 * und ein Ersatz-Lauf, der auf `incomplete` endet, prüft die Oberfläche nicht.
 */
function stubBrief(sources: BrandMarkBriefSources): BrandMarkBriefRaw {
  const de = sources.locale === 'de'
  const name = sources.brandName || (de ? 'diese Marke' : 'this brand')
  /* Die LESEFASSUNG der Richtung, nicht ihre Id: der Ersatz-Text steht im
   * Kapitel und wird gelesen (beim eigenen Klick stand dort „Richtung word"). */
  const kindTerm = brandTermById(BRAND_MARK_KINDS, sources.kindId)
  const kind = kindTerm ? brandTermLabel(kindTerm, sources.locale) : sources.kindId
  return de
    ? {
        character: `Ersatz-Briefing für den Beweis — kein Sprachmodell beteiligt. `
          + `Das Zeichen für ${name} soll ruhig wirken und ohne Erklärung auskommen.`,
        formLanguage: `Ersatz-Briefing: Formsprache passend zur Richtung „${kind}" — eine Idee, `
          + `keine Szene.`,
        noGos: 'Ersatz-Briefing: nicht verzerren, nicht schräg stellen, keinen Schatten, nie neu setzen.',
        places: 'Ersatz-Briefing: Website-Kopf, Rechnung, Social-Avatar.',
      }
    : {
        character: `Stub briefing for the proof — no language model involved. The mark for ${name} `
          + `should feel calm and work without explanation.`,
        formLanguage: `Stub briefing: form language matching the "${kind}" direction — one idea, `
          + `not a scene.`,
        noGos: 'Stub briefing: do not distort, do not tilt, no shadow, never re-type it.',
        places: 'Stub briefing: website header, invoice, social avatar.',
      }
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

export type BrandMarkBriefFailure =
  /** Keine BESTÄTIGTE Foundation-Stelle — es gibt nichts, woraus abzuleiten wäre. */
  | 'no_foundation'
  | 'provider_error'
  /** Nach der Klemmung fehlt mindestens eines der vier geschriebenen Felder. */
  | 'incomplete'

export interface BrandMarkBriefRunResult {
  readonly failure?: BrandMarkBriefFailure
  readonly brief?: BrandMarkBrief
  /** Modell-Kennung ohne Schlüssel — für Antwort und Ereignis. */
  readonly model?: string
  readonly ms?: number
}

/**
 * EINEN LAUF AUSFÜHREN.
 *
 * DIE ZUGEHÖRIGKEIT IST VORHER BELEGT (`requireBrandMarkContext`); hier wird
 * nichts mehr autorisiert.
 */
export async function runBrandMarkBrief(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  model: string,
): Promise<BrandMarkBriefRunResult> {
  const foundation = brandReadingFoundationBlocks(profile, stepRows)
  if (foundation.length === 0) return { failure: 'no_foundation' }

  const sources = brandMarkBriefSources(profile, stepRows)
  const derived = brandMarkDerivedBriefFields(sources.initial, sources.locale)
  const started = Date.now()

  let raw: BrandMarkBriefRaw
  if (brandMarkBriefStubEnabled()) {
    raw = stubBrief(sources)
  }
  else {
    const kindTerm = brandTermById(BRAND_MARK_KINDS, sources.kindId)
    const prompt = brandMarkBriefPrompt({
      contentLocale: sources.locale,
      brandName: sources.brandName,
      foundation,
      dna: sources.dnaLines,
      kind: kindTerm
        ? `${kindTerm.id} (${brandTermLabel(kindTerm, sources.locale)})`
        : sources.kindId,
      settled: sources.settled,
      clearSpace: derived.clearSpace,
      variants: derived.variants,
    })
    try {
      raw = await aiCompleteJson<BrandMarkBriefRaw>(event, prompt, {
        model,
        system: BRAND_MARK_BRIEF_SYSTEM_PROMPT,
        label: 'brand-mark-brief',
        maxTokens: BRAND_MARK_BRIEF_MAX_TOKENS,
        timeoutMs: BRAND_MARK_BRIEF_TIMEOUT_MS,
        // Die ZDR-Bedingungen dieses Layers, wie bei jedem anderen Aufruf.
        providerRouting: { ...BRAND_PROVIDER_ROUTING },
      })
    }
    catch (error) {
      logEvent('warn', 'brand.mark_brief_provider_error', {
        profileId: profile.$id,
        // Die MELDUNG des Anbieters — nie der Prompt, nie die Foundation.
        message: error instanceof Error ? error.message : 'unknown',
      })
      return { failure: 'provider_error' }
    }
  }

  const clamped = clampBrandMarkBrief(raw, sources.initial, sources.locale)
  if (!clamped.brief) {
    logEvent('warn', 'brand.mark_brief_incomplete', {
      profileId: profile.$id,
      missing: clamped.missing.length,
    })
    return { failure: 'incomplete' }
  }

  return {
    brief: clamped.brief,
    model: brandMarkBriefStubEnabled() ? 'dev-stub' : model,
    ms: Date.now() - started,
  }
}

// ── Das Ergebnis ablegen ───────────────────────────────────────────────────

/**
 * DEN SLOT-WERT VON `j.brief` SCHREIBEN.
 *
 * ── EINE NEUE FASSUNG NIMMT DIE BESTÄTIGUNG NICHT MIT ─────────────────────
 * Wörtlich dieselbe Regel wie bei `writeBrandDnaSlot` (D2c) und
 * `writeBrandReadingSlot` (D2b): `firstDraft` bleibt stehen, `latestDraft` ist
 * neu, ein bestehendes `confirmed` wird NICHT übernommen — der Mensch hat
 * einer ANDEREN Fassung zugestimmt.
 */
export async function writeBrandMarkBriefSlot(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  brief: BrandMarkBrief,
  locale: string,
): Promise<void> {
  const stepRow = stepRows.find(row => row.stepKey === BRAND_MARK_STEP_KEY)
  if (!stepRow) {
    logEvent('warn', 'brand.mark_brief_row_missing', { profileId: profile.$id })
    return
  }
  const value = brandMarkBriefSlotValue(brief, locale)
  const records = parseSlotRecords(stepRow.slots)
  const before = records[BRAND_MARK_BRIEF_SLOT_ID]
  const next: Record<string, BrandSlotRecord> = {
    ...records,
    [BRAND_MARK_BRIEF_SLOT_ID]: {
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
    logEvent('warn', 'brand.mark_brief_slot_write_failed', {
      profileId: profile.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}
