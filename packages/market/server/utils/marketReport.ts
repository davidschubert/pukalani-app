import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { BRAND_PROVIDER_ROUTING, brandGenerationHashInput } from '../contracts/brandContract'
import type {
  MarketCitation,
  MarketClaimEntry,
  MarketClaimKind,
  MarketClaimList,
  MarketCompetitor,
  MarketFieldId,
  MarketProfile,
  MarketProfileField,
} from '../../shared/marketProfile'
import { MARKET_FIELD_IDS, MARKET_OWN_ID, marketField } from '../../shared/marketProfile'
import type { MarketRevisionInput } from '../../shared/marketReportRules'
import {
  citationIsGrounded,
  conventionMeetsQuota,
  marketFieldSpeakers,
  marketRevisionEntries,
} from '../../shared/marketReportRules'
import type { MarketDisparagementGuard, MarketFilterReason } from '../../shared/marketDisparagement'
import { checkMarketTexts, createMarketDisparagementGuard } from '../../shared/marketDisparagement'
import {
  MARKET_REPORT_LIST_MAX,
  MARKET_REPORT_MAX_TOKENS,
  MARKET_REPORT_PROMPT_VERSION,
  MARKET_REPORT_TEXT_MAX,
  MARKET_REPORT_TIMEOUT_MS,
  marketReportPrompt,
  marketReportSystemPrompt,
} from '../prompts/marketReportPrompt'
import { marketDevStubEnabled, marketReportModel } from './marketAi'

/**
 * DER VERGLEICH (Plan §2.3 Nr. 4, MV1 M3).
 *
 * EIN Modell-Aufruf über das eigene Profil und N Marktprofile, danach vier
 * deterministische Schritte, die aus einer Antwort einen Bericht machen:
 *
 *  1. ZOD auf die Antwort — fail-soft JE TEIL und JE EINTRAG. Eine kaputte
 *     Konventions-Zeile darf die freien Stellen nicht mitnehmen.
 *  2. DIE BELEGPRÜFUNG: jede genannte Marke muss es geben, und jedes Zitat muss
 *     ein BELEG IHRES Marktprofils sein (`citationIsGrounded`). Ein Modell kann
 *     damit keiner Marke eine Aussage unterschieben.
 *  3. DIE QUOTE: `sharedBy / of ≥ 60 %` wird NACHGERECHNET, nie übernommen.
 *  4. DER § 6 UWG-RIEGEL über JEDEN erzeugten Satz — Befunde, Konventionen,
 *     Überschneidungen und freie Stellen. Ein Treffer VERWIRFT das Element und
 *     zählt einen Zähler hoch (`market.report_filtered`), er formuliert nichts
 *     um.
 *
 * ── DER STÄRKSTE RIEGEL IST DIE ANONYMISIERUNG ────────────────────────────
 * Das Modell sieht die Wettbewerber nur als `c1 … c5` (s. Prompt). Es KANN
 * keinen Namen in einen Vorschlag schreiben. Die Wortliste darunter fängt den
 * Fall, dass ein Name über ein ZITAT ins Material geraten ist.
 *
 * ── EIN BEFUND ADRESSIERT IMMER EIN EIGENES FELD ──────────────────────────
 * Das ist keine Formulierungsregel, sondern die Form: `fieldId` ist eines der
 * zehn Marktprofil-Felder, und der Code bildet es auf DEN Slot ab, aus dem der
 * eigene Wert stammt (`marketOwnSlotId`). Ein Befund über einen Dritten hätte
 * gar kein Feld, an das er sich hängen könnte.
 */

// ── Das Schema der Modell-Antwort ──────────────────────────────────────────

const fieldIdSchema = z.enum(MARKET_FIELD_IDS)

const markSchema = z.object({
  ref: z.string().trim().max(20),
  quote: z.string().max(4000).optional(),
})

const claimSchema = z.object({
  fieldId: fieldIdSchema,
  statement: z.string().trim().min(1).max(MARKET_REPORT_TEXT_MAX),
  marks: z.array(markSchema).max(10).optional().default([]),
  similarity: z.enum(['high', 'medium', 'low']).optional(),
})

const whitespaceSchema = z.object({
  fieldId: fieldIdSchema,
  question: z.string().trim().min(1).max(MARKET_REPORT_TEXT_MAX),
})

const findingSchema = z.object({
  fieldId: fieldIdSchema,
  why: z.string().trim().min(1).max(MARKET_REPORT_TEXT_MAX),
  suggestion: z.string().trim().min(1).max(MARKET_REPORT_TEXT_MAX),
})

/**
 * Die Ränder LOCKER, die Mitte STRENG — dasselbe Muster wie in der Extraktion.
 * Jede Liste wird einzeln geprüft (`.catch([])`), damit ein kaputter Teil die
 * anderen drei nicht mitnimmt: der Bericht ist fail-soft JE TEIL (§2.3).
 */
const answerSchema = z.object({
  conventions: z.array(z.unknown()).max(40).optional().default([]),
  overlaps: z.array(z.unknown()).max(40).optional().default([]),
  whitespace: z.array(z.unknown()).max(40).optional().default([]),
  findings: z.array(z.unknown()).max(40).optional().default([]),
})

// ── Die Eingabe ────────────────────────────────────────────────────────────

/** Ein Kandidat, so wie der Bericht ihn braucht. */
export interface MarketReportCandidate {
  readonly competitor: MarketCompetitor
  readonly fields: readonly MarketProfileField[]
}

export interface MarketReportInput {
  readonly own: readonly MarketProfileField[]
  readonly candidates: readonly MarketReportCandidate[]
  readonly locale: string
  /** Für die Zuordnung Feld → eigener Slot (Befunde). */
  readonly slotFor: (fieldId: MarketFieldId) => string
}

/** Ein Befund, bevor er eine Zeile in `brand_findings` wird. */
export interface MarketReportFinding {
  readonly slotId: string
  readonly fieldId: MarketFieldId
  readonly why: string
  readonly suggestion: string
}

export interface MarketReportResult {
  readonly claims: MarketClaimList[]
  readonly findings: MarketReportFinding[]
  readonly model: string
  readonly promptVersion: string
  /** Wie viele Elemente der Riegel verworfen hat, je Grund (Zahl, kein Text). */
  readonly filtered: Record<MarketFilterReason, number>
  readonly failure: '' | 'ai_disabled' | 'provider_error' | 'schema_error'
}

// ── Der Bericht-Schlüssel ──────────────────────────────────────────────────

/**
 * DER STAND ALS EIN HASH (Plan §2.3 Nr. 5, §2.4).
 *
 * Die kanonische Zeichenkette baut `brandGenerationHashInput` — derselbe
 * Bauer, der im brand-Layer den `sourcesHash` und den `inputHash` der
 * Generationen baut. Er trägt die REGISTRY-FASSUNG mit: ändert sich das
 * Feld-Verzeichnis der Foundation, ist auch der Marktvergleich ein anderer.
 * Das Hashen bleibt hier, `node:crypto` gehört nicht in ein Client-Bündel.
 */
export function marketRevisionKey(input: MarketRevisionInput): string {
  const canonical = brandGenerationHashInput(
    'market.report',
    MARKET_REPORT_PROMPT_VERSION,
    marketRevisionEntries(input),
  )
  return createHash('sha256').update(canonical).digest('hex')
}

// ── Die Prüfung der Modell-Antwort ─────────────────────────────────────────

interface CandidateIndex {
  readonly refToId: Map<string, string>
  readonly fieldsById: Map<string, readonly MarketProfileField[]>
  readonly nameById: Map<string, string>
  readonly competitors: readonly MarketCompetitor[]
  readonly profiles: readonly MarketProfile[]
}

/**
 * `c1 … cn` — die Kürzel, unter denen das Modell die Kandidaten sieht. Sie
 * hängen an der REIHENFOLGE der übergebenen Liste und sonst nichts; die
 * Rückabbildung passiert ausschliesslich hier.
 */
function indexCandidates(candidates: readonly MarketReportCandidate[]): CandidateIndex {
  const refToId = new Map<string, string>()
  const fieldsById = new Map<string, readonly MarketProfileField[]>()
  const nameById = new Map<string, string>()
  const profiles: MarketProfile[] = []

  candidates.forEach((candidate, index) => {
    const ref = `c${index + 1}`
    refToId.set(ref, candidate.competitor.id)
    fieldsById.set(candidate.competitor.id, candidate.fields)
    nameById.set(candidate.competitor.id, candidate.competitor.name)
    profiles.push({ competitorId: candidate.competitor.id, fields: candidate.fields })
  })

  return {
    refToId,
    fieldsById,
    nameById,
    competitors: candidates.map(candidate => candidate.competitor),
    profiles,
  }
}

interface ValidatedMarks {
  /** Die geprüften Belege — je Marke höchstens einer. */
  citations: MarketCitation[]
  /** Wie viele Marken tatsächlich belegt genannt wurden (inkl. `_own`). */
  sharedBy: number
  /** War die eigene Marke dabei? */
  includesOwn: boolean
}

/**
 * DIE GENANNTEN MARKEN PRÜFEN.
 *
 * Eine Marke zählt nur, wenn (a) es sie gibt und (b) ihr Zitat ein BELEG ihres
 * Marktprofils ist. `_own` ist die Ausnahme ohne Zitat: die eigene Marke hat
 * keine Belege (sie ist beschlossen, nicht abgelesen) — geprüft wird stattdessen,
 * dass ihr Feld überhaupt einen Wert trägt. Eine Marke ohne gültigen Beleg
 * fällt STILL weg; sie zieht die Aussage nicht mit, sondern senkt nur ihre
 * Quote — und die entscheidet danach.
 */
function validateMarks(
  marks: readonly { ref: string, quote?: string }[],
  fieldId: MarketFieldId,
  index: CandidateIndex,
  own: readonly MarketProfileField[],
  allowOwn: boolean,
): ValidatedMarks {
  const citations: MarketCitation[] = []
  const seen = new Set<string>()
  let includesOwn = false

  for (const mark of marks) {
    const ref = mark.ref.trim()
    if (ref === MARKET_OWN_ID || ref === 'own' || ref === '_own') {
      if (!allowOwn) continue
      if (!(marketField(own, fieldId)?.value.trim())) continue
      includesOwn = true
      continue
    }
    const competitorId = index.refToId.get(ref)
    if (!competitorId || seen.has(competitorId)) continue
    const fields = index.fieldsById.get(competitorId) ?? []
    const quote = (mark.quote ?? '').trim()
    // OHNE Zitat kein Beleg — und ohne Beleg keine Marke. Der Wert allein
    // („die haben da auch was stehen") ist keine Aussage über INHALTE.
    if (!quote || !citationIsGrounded(quote, fields, fieldId)) continue
    const stored = fields.find(field => field.fieldId === fieldId)
    if (!stored?.evidence) continue

    seen.add(competitorId)
    citations.push({
      competitorId,
      competitorName: index.nameById.get(competitorId) ?? '',
      // DER GESPEICHERTE Beleg, nicht der zitierte Ausschnitt: Adresse und
      // Abrufdatum kennt nur das Marktprofil, und ein Beleg ohne Quelle wäre
      // keiner.
      evidence: stored.evidence,
      ...(stored.frequency ? { frequency: stored.frequency } : {}),
    })
  }

  return { citations, sharedBy: citations.length + (includesOwn ? 1 : 0), includesOwn }
}

function claimId(kind: MarketClaimKind, fieldId: string, position: number): string {
  return `${kind}-${fieldId}-${position + 1}`
}

// ── Der Ersatz (`MARKET_DEV_STUB=1`) ───────────────────────────────────────

/**
 * DER DETERMINISTISCHE ERSATZ.
 *
 * Er ruft keinen Anbieter und liefert — wie der Ersatz der Extraktion — eine
 * MODELL-FÖRMIGE Antwort, die durch dieselbe Prüfung geht. Er baut sie aus den
 * Profilen: ein Feld, in dem mindestens zwei Kandidaten etwas sagen, wird zur
 * Konvention; ein Feld, das die eigene Marke UND ein Kandidat besetzen, zur
 * Überschneidung; ein Feld, in dem nur wir etwas sagen, zur freien Stelle.
 *
 * ── UND ER LIEFERT ZWEI ABSICHTLICH VERBOTENE ELEMENTE ────────────────────
 * Einen Befund mit einer HERABSETZENDEN Formulierung und einen Vorschlag, der
 * einen WETTBEWERBER BEIM NAMEN nennt. Beide MÜSSEN vom Riegel verworfen
 * werden — das ist die Gegenprobe im Beweis, ohne einen bezahlten Aufruf.
 * Nimmt jemand den Riegel heraus, erscheinen sie im Bericht, und der Beweis
 * wird rot. Ein Ersatz, der nur Erlaubtes liefert, prüfte sich selbst.
 */
function stubAnswer(input: MarketReportInput, index: CandidateIndex): Record<string, unknown[]> {
  const conventions: unknown[] = []
  const overlaps: unknown[] = []
  const whitespace: unknown[] = []
  const findings: unknown[] = []

  for (const fieldId of MARKET_FIELD_IDS) {
    const speakers = input.candidates
      .map((candidate, position) => ({
        ref: `c${position + 1}`,
        field: marketField(candidate.fields, fieldId),
      }))
      .filter(entry => entry.field?.evidence && entry.field.value.trim())

    const ownValue = marketField(input.own, fieldId)?.value.trim() ?? ''

    if (speakers.length >= 2 && conventions.length < 1) {
      conventions.push({
        fieldId,
        statement: `Everyone in this field talks about the same thing here.`,
        marks: [
          ...(ownValue ? [{ ref: MARKET_OWN_ID }] : []),
          ...speakers.map(entry => ({ ref: entry.ref, quote: entry.field?.evidence?.quote ?? '' })),
        ],
      })
      continue
    }

    if (ownValue && speakers.length >= 1 && overlaps.length < 1) {
      overlaps.push({
        fieldId,
        statement: ownValue,
        similarity: 'medium',
        marks: [{ ref: speakers[0]!.ref, quote: speakers[0]!.field?.evidence?.quote ?? '' }],
      })
      continue
    }

    if (ownValue && speakers.length === 0 && whitespace.length < 1) {
      whitespace.push({
        fieldId,
        question: 'Nobody in this field says anything here. Do you want to be the one who does?',
      })
    }
  }

  // (1) Ein SAUBERER Befund — er muss durchkommen.
  const cleanField = MARKET_FIELD_IDS.find(fieldId => marketField(input.own, fieldId)?.value.trim())
  if (cleanField) {
    findings.push({
      fieldId: cleanField,
      why: 'Your sentence here says what two other sites in the field also say, in their own words.',
      suggestion: 'Sharpen it with the part only you do, and say it in the first line.',
    })
  }

  // (2) GEGENPROBE A — herabsetzend. Muss verworfen werden.
  if (cleanField) {
    findings.push({
      fieldId: cleanField,
      why: 'The other sites in this field are cheap and outdated, so anything beats them.',
      suggestion: 'Say that your offer is simply better than these inferior alternatives.',
    })
  }

  // (3) GEGENPROBE B — nennt einen Wettbewerber beim Namen. Muss ebenfalls weg.
  const firstName = index.nameById.values().next().value ?? ''
  if (cleanField && firstName) {
    findings.push({
      fieldId: cleanField,
      why: 'Your promise reads a lot like the one next door.',
      suggestion: `Write a line that sets you apart from ${firstName}, so the difference is obvious.`,
    })
  }

  return { conventions, overlaps, whitespace, findings }
}

// ── Der Bericht ────────────────────────────────────────────────────────────

/**
 * DIE DREI EIGENEN FELDER, DIE DIE KATEGORIE BESCHREIBEN (MV1 M4).
 *
 * `categoryLanguage`, `pitch` und `audience` — genau die Felder, in denen ein
 * Kunde die Wörter seiner Branche benutzt. Sie werden dem Riegel als
 * Ausnahme-Wortschatz gereicht; die restlichen sieben bleiben draussen, damit
 * ein zufällig gleichlautendes Wort in einer Tagline nicht die Sperre über
 * einen fremden Markennamen aufhebt.
 */
function ownCategoryTexts(own: readonly MarketProfileField[]): string[] {
  const wanted: readonly MarketFieldId[] = ['categoryLanguage', 'pitch', 'audience']
  return wanted
    .map(fieldId => marketField(own, fieldId)?.value ?? '')
    .filter(value => value.trim().length > 0)
}

const EMPTY_FILTERED: Record<MarketFilterReason, number> = {
  competitor_name: 0,
  competitor_domain: 0,
  disparagement: 0,
}

export async function buildMarketReport(
  event: H3Event,
  input: MarketReportInput,
): Promise<MarketReportResult> {
  const index = indexCandidates(input.candidates)
  const guard = createMarketDisparagementGuard(
    input.candidates.map(candidate => ({
      name: candidate.competitor.name,
      url: candidate.competitor.url,
    })),
    // DIE EIGENEN WORTE ENTSCHÄRFEN DIE SPERRE (MV1 M4, s. Kopf von
    // `marketDisparagement.ts`): was der Kunde selbst über seine Marke sagt,
    // macht keinen Dritten erkennbar. Genommen werden die drei Felder, die
    // die KATEGORIE beschreiben — Purpose und Tagline sind Eigenaussagen und
    // taugen nicht als Freibrief für ein fremdes Namenswort.
    { ownTexts: ownCategoryTexts(input.own) },
  )

  let raw: unknown
  let model: string

  if (marketDevStubEnabled()) {
    model = 'dev-stub'
    raw = stubAnswer(input, index)
  }
  else {
    model = await marketReportModel(event)
    if (!model) {
      return {
        claims: [],
        findings: [],
        model: '',
        promptVersion: MARKET_REPORT_PROMPT_VERSION,
        filtered: { ...EMPTY_FILTERED },
        failure: 'ai_disabled',
      }
    }
    try {
      raw = await aiCompleteJson<unknown>(event, marketReportPrompt({
        own: input.own,
        candidates: input.candidates.map((candidate, position) => ({
          ref: `c${position + 1}`,
          fields: candidate.fields,
        })),
        locale: input.locale,
      }), {
        model,
        system: marketReportSystemPrompt(),
        label: 'market-report',
        maxTokens: MARKET_REPORT_MAX_TOKENS,
        timeoutMs: MARKET_REPORT_TIMEOUT_MS,
        // Derselbe Stand soll denselben Bericht ergeben — die Idempotenz über
        // `revisionKey` verspricht das, und eine streuende Temperatur machte
        // aus dem Versprechen eine Behauptung über den Zwischenspeicher.
        temperature: 0,
        providerRouting: { ...BRAND_PROVIDER_ROUTING },
      })
    }
    catch (error) {
      logEvent('warn', 'market.report_provider_error', {
        // Die MELDUNG des Anbieters — nie der Prompt, nie ein Zitat.
        message: error instanceof Error ? error.message : String(error),
      })
      return {
        claims: [],
        findings: [],
        model,
        promptVersion: MARKET_REPORT_PROMPT_VERSION,
        filtered: { ...EMPTY_FILTERED },
        failure: 'provider_error',
      }
    }
  }

  const parsed = answerSchema.safeParse(raw)
  if (!parsed.success) {
    logEvent('warn', 'market.report_schema_error', { issues: parsed.error.issues.length })
    return {
      claims: [],
      findings: [],
      model,
      promptVersion: MARKET_REPORT_PROMPT_VERSION,
      filtered: { ...EMPTY_FILTERED },
      failure: 'schema_error',
    }
  }

  const filtered: Record<MarketFilterReason, number> = { ...EMPTY_FILTERED }
  function reject(reason: MarketFilterReason): void {
    filtered[reason]++
  }

  const conventions = shapeClaims(parsed.data.conventions, 'convention', input, index, guard, reject)
  const overlaps = shapeClaims(parsed.data.overlaps, 'overlap', input, index, guard, reject)
  const whitespace = shapeWhitespace(parsed.data.whitespace, guard, reject)
  const findings = shapeFindings(parsed.data.findings, input, guard, reject)

  return {
    claims: [
      { kind: 'convention', entries: conventions },
      { kind: 'overlap', entries: overlaps },
      { kind: 'whitespace', entries: whitespace },
    ],
    findings,
    model,
    promptVersion: MARKET_REPORT_PROMPT_VERSION,
    filtered,
    failure: '',
  }
}

/**
 * KONVENTIONEN UND ÜBERSCHNEIDUNGEN — dieselbe Form, zwei Nenner.
 *
 * Bei einer KONVENTION zählt die eigene Marke mit („was sagen alle im Feld" —
 * wir sind Teil des Feldes), bei einer ÜBERSCHNEIDUNG nicht („wer sagt unsere
 * Aussage AUCH"). Das ist der Prototyp-Vertrag, an dem die Zahlen im
 * Ergebnis-Screen hängen (3 von 3 gegen 1 von 2).
 */
function shapeClaims(
  entries: readonly unknown[],
  kind: 'convention' | 'overlap',
  input: MarketReportInput,
  index: CandidateIndex,
  guard: MarketDisparagementGuard,
  reject: (reason: MarketFilterReason) => void,
): MarketClaimEntry[] {
  const out: MarketClaimEntry[] = []
  const seen = new Set<string>()

  for (const raw of entries) {
    if (out.length >= MARKET_REPORT_LIST_MAX) break
    const parsed = claimSchema.safeParse(raw)
    if (!parsed.success) continue
    const claim = parsed.data

    const reason = guard.check(claim.statement)
    if (reason) {
      reject(reason)
      continue
    }

    const marks = validateMarks(claim.marks, claim.fieldId, index, input.own, kind === 'convention')
    const of = marketFieldSpeakers(
      claim.fieldId,
      input.own,
      index.competitors,
      index.profiles,
      kind === 'convention',
    )

    if (kind === 'convention') {
      // DIE QUOTE WIRD NACHGERECHNET (§2.3 Nr. 4): „das sagen alle" ist die
      // eine Aussage, die man ohne Nachzählen glauben müsste.
      if (!conventionMeetsQuota(marks.sharedBy, of)) continue
    }
    else {
      // Eine Überschneidung braucht (a) eine eigene Aussage und (b)
      // mindestens einen belegten Anderen. Ohne (a) wäre sie keine
      // Überschneidung, sondern eine Konvention ohne uns.
      if (!marketField(input.own, claim.fieldId)?.value.trim()) continue
      if (!marks.citations.length) continue
    }

    // Zweimal dasselbe Feld mit derselben Aussage: der erste gewinnt.
    const key = `${claim.fieldId} ${claim.statement.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      id: claimId(kind, claim.fieldId, out.length),
      fieldId: claim.fieldId,
      statement: claim.statement,
      sharedBy: kind === 'convention' ? marks.sharedBy : marks.citations.length,
      of,
      ...(marks.citations.length ? { citations: marks.citations } : {}),
    })
  }

  return out
}

/** FREIE STELLEN — ohne Belege, aber mit demselben Riegel. */
function shapeWhitespace(
  entries: readonly unknown[],
  guard: MarketDisparagementGuard,
  reject: (reason: MarketFilterReason) => void,
): MarketClaimEntry[] {
  const out: MarketClaimEntry[] = []
  for (const raw of entries) {
    if (out.length >= MARKET_REPORT_LIST_MAX) break
    const parsed = whitespaceSchema.safeParse(raw)
    if (!parsed.success) continue

    const reason = guard.check(parsed.data.question)
    if (reason) {
      reject(reason)
      continue
    }

    out.push({
      id: claimId('whitespace', parsed.data.fieldId, out.length),
      fieldId: parsed.data.fieldId,
      statement: parsed.data.question,
    })
  }
  return out
}

/**
 * BEFUNDE — genau EIN eigenes Feld, `why` UND `suggestion` PFLICHT (§2.3
 * Nr. 4).
 *
 * Der Riegel prüft BEIDE Texte: fällt einer, fällt der Befund. Ein Befund mit
 * gestrichenem Vorschlag wäre ein halber Befund — und der Vorschlag ist genau
 * der Satz, den ein Kunde am Ende verwendet.
 */
function shapeFindings(
  entries: readonly unknown[],
  input: MarketReportInput,
  guard: MarketDisparagementGuard,
  reject: (reason: MarketFilterReason) => void,
): MarketReportFinding[] {
  const out: MarketReportFinding[] = []
  const seen = new Set<string>()

  for (const raw of entries) {
    // Drei ist der Deckel des Prompts; er steht hier ein zweites Mal, weil ein
    // Modell ihn übersehen kann und eine Befund-Flut an denselben Feldern
    // hängen bliebe.
    if (out.length >= 3) break
    const parsed = findingSchema.safeParse(raw)
    if (!parsed.success) continue
    const finding = parsed.data

    const reason = checkMarketTexts(guard, [finding.why, finding.suggestion])
    if (reason) {
      reject(reason)
      continue
    }

    const slotId = input.slotFor(finding.fieldId)
    if (!slotId || seen.has(slotId)) continue
    seen.add(slotId)

    out.push({ slotId, fieldId: finding.fieldId, why: finding.why, suggestion: finding.suggestion })
  }

  return out
}
