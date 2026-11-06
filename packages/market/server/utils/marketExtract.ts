import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { BRAND_PROVIDER_ROUTING } from '../contracts/brandContract'
import type {
  MarketEvidenceConfidence,
  MarketFieldId,
  MarketProfileField,
} from '../../shared/marketProfile'
import { MARKET_EVIDENCE_MAX, MARKET_FIELDS, MARKET_FIELD_IDS } from '../../shared/marketProfile'
import { countEvidenceFrequency, evidenceIsGrounded } from '../../shared/marketExtractRules'
import { splitMarketRawText } from '../../shared/marketCrawlRules'
import {
  MARKET_EXTRACT_MAX_TOKENS,
  MARKET_EXTRACT_PROMPT_VERSION,
  MARKET_EXTRACT_TIMEOUT_MS,
  marketExtractPrompt,
  marketExtractSystemPrompt,
} from '../prompts/marketExtractPrompt'
import { marketDevStubEnabled, marketExtractModel } from './marketAi'

/**
 * DIE EXTRAKTION EINES MARKTPROFILS (Plan §2.3 Schritt 3, MV1 M2).
 *
 * EIN Modell-Aufruf je Wettbewerber, danach drei deterministische Schritte, die
 * das Ergebnis erst zu Daten machen:
 *
 *  1. ZOD auf die Antwort — was die Form nicht trägt, fällt weg (fail-soft je
 *     FELD, nicht je Antwort: ein kaputtes Feld soll die anderen neun nicht
 *     mitnehmen).
 *  2. DER BELEG-RIEGEL: `evidence` muss wörtlich im Rohtext DER GENANNTEN
 *     SEITE stehen. Ohne Treffer wird das Feld VERWORFEN — nicht markiert,
 *     nicht abgeschwächt, verworfen (§2.2).
 *  3. DIE HÄUFIGKEIT wird GEZÄHLT, nie geglaubt (§7.4).
 *
 * ── DIE IDEMPOTENZ HÄNGT AM ROHTEXT, NICHT AN DER ZEIT ────────────────────
 * `inputHash` ist sha256 über den Rohtext. Gleicher Text ⇒ gleiches Ergebnis
 * ⇒ kein zweiter Aufruf. Das ist der Kostendeckel, den §2.8 „ein erneuter Lauf
 * bei unverändertem Stand kostet nichts" verspricht — und er hängt bewusst am
 * INHALT und nicht am Abrufdatum: eine Website, die sich nicht geändert hat,
 * soll auch nach einem neuen Abruf nicht neu ausgewertet werden.
 */

// ── Das Schema der Modell-Antwort ──────────────────────────────────────────

/**
 * Bewusst LOCKER an den Rändern und STRENG in der Mitte: `fieldId` muss
 * stimmen (sonst wüssten wir nicht, wohin), `quote` und `sourceUrl` müssen da
 * sein, wenn es ein `evidence` gibt. Alles andere wird geklemmt statt
 * abgelehnt — ein Modell, das 240 Zeichen zitiert, hat nicht halluziniert,
 * sondern zu lang zitiert, und das ist unser Problem, nicht seins.
 */
const answerFieldSchema = z.object({
  fieldId: z.enum(MARKET_FIELD_IDS),
  value: z.string().max(4000).optional().default(''),
  items: z.array(z.string().max(400)).max(20).optional(),
  evidence: z.object({
    quote: z.string().max(4000),
    sourceUrl: z.string().max(1000),
    confidence: z.string().max(20).optional(),
  }).optional(),
})

const answerSchema = z.object({
  // `catch` je Eintrag gibt es in Zod nicht auf Array-Ebene; deshalb wird die
  // Liste hier grob geprüft und JEDER Eintrag unten einzeln — nur so überlebt
  // ein gutes Feld einen kaputten Nachbarn.
  fields: z.array(z.unknown()).max(40),
})


/**
 * Status und Statustext eines H3-Fehlers, sonst die Meldung — nie der Prompt,
 * nie der Rohtext (Log-Regel). Ohne Status („AI not configured" kommt als 503,
 * „AI provider unavailable" als 502) wäre die Zeile eine leere Warnung.
 */
function describeProviderError(error: unknown): string {
  if (error && typeof error === 'object') {
    const status = 'statusCode' in error ? (error as { statusCode?: unknown }).statusCode
      : 'status' in error ? (error as { status?: unknown }).status : undefined
    const text = 'statusMessage' in error ? (error as { statusMessage?: unknown }).statusMessage
      : 'statusText' in error ? (error as { statusText?: unknown }).statusText : undefined
    const message = error instanceof Error ? error.message : ''
    const parts = [status, text, message].filter(part => typeof part === 'string' ? part.length > 0 : typeof part === 'number')
    if (parts.length) return parts.join(' ')
  }
  return error instanceof Error ? error.message : String(error)
}

export interface MarketExtractInput {
  competitorName: string
  /** Die gelesenen Adressen — `sourceUrl` muss eine davon sein. */
  pageUrls: readonly string[]
  /** Der gefilterte Rohtext MIT Seiten-Markern. */
  rawText: string
}

export interface MarketExtractResult {
  fields: MarketProfileField[]
  model: string
  promptVersion: string
  /** Warum es nicht geklappt hat — `''` heisst: es hat. */
  failure: '' | 'ai_disabled' | 'provider_error' | 'schema_error'
}

/** Der Stand des Rohtexts — er entscheidet über das Neu-Rechnen (s. Kopf). */
export function marketInputHash(rawText: string): string {
  return createHash('sha256').update(rawText).digest('hex')
}

const FIELD_BY_ID = new Map(MARKET_FIELDS.map(field => [field.id, field]))

function normalizeConfidence(value: string | undefined): MarketEvidenceConfidence {
  // Alles, was nicht ausdrücklich „so gesagt" ist, ist abgeleitet. Die
  // vorsichtigere Einstufung ist die richtige Vorgabe.
  return value === 'stated' ? 'stated' : 'implied'
}

/**
 * EIN FELD PRÜFEN UND FORMEN — oder verwerfen.
 *
 * `null` heisst: dieses Feld gibt es nicht. Ein LEERES Feld dagegen wird
 * ZURÜCKGEGEBEN (mit leerem `value`, ohne Beleg): „nicht öffentlich
 * formuliert" ist eine Aussage über die Kategorie und kein Fehler (§1.10).
 */
function shapeField(
  raw: unknown,
  pages: ReadonlyMap<string, string>,
  fetchedAt: string,
): MarketProfileField | null {
  const parsed = answerFieldSchema.safeParse(raw)
  if (!parsed.success) return null
  const answer = parsed.data
  const definition = FIELD_BY_ID.get(answer.fieldId as MarketFieldId)
  if (!definition) return null

  const items = definition.form === 'list'
    ? (answer.items ?? answer.value.split(',').map(part => part.trim()).filter(Boolean))
      .slice(0, definition.maxItems ?? 5)
    : undefined
  const value = definition.form === 'list'
    ? (items ?? []).join(', ')
    : answer.value.trim()

  if (!value) return { fieldId: answer.fieldId, value: '', source: 'website' }

  const evidence = answer.evidence
  if (!evidence) return null

  // DIE SEITE MUSS EINE GELESENE SEIN. Ein `sourceUrl`, das wir nicht kennen,
  // ist kein Tippfehler, sondern eine erfundene Quelle — und gegen die liesse
  // sich nichts prüfen.
  const pageText = pages.get(evidence.sourceUrl) ?? pages.get(evidence.sourceUrl.replace(/\/$/, ''))
  if (pageText === undefined) return null

  const quote = evidence.quote.trim().slice(0, MARKET_EVIDENCE_MAX)
  if (!evidenceIsGrounded({ quote, pageText })) return null

  return {
    fieldId: answer.fieldId,
    value: value.slice(0, 2000),
    ...(items ? { items } : {}),
    evidence: {
      quote,
      sourceUrl: evidence.sourceUrl,
      fetchedAt,
      confidence: normalizeConfidence(evidence.confidence),
    },
    source: 'website',
    frequency: countEvidenceFrequency(quote, pages),
  }
}

/**
 * DER DETERMINISTISCHE ERSATZ (`MARKET_DEV_STUB=1`).
 *
 * Er ruft keinen Anbieter und erfindet nichts: er nimmt den ERSTEN brauchbaren
 * Satz jeder gelesenen Seite als Beleg.
 *
 * ── ER LIEFERT EINE MODELL-ANTWORT, KEIN FERTIGES PROFIL ──────────────────
 * Das ist der Punkt, an dem der erste Anlauf falsch war: der Stub gab die
 * Felder FERTIG zurück und lief damit an `shapeField` — also am Beleg-Riegel —
 * vorbei. Der Beweis prüfte dann eine Kette, deren teuerstes Glied im
 * Ersatz-Betrieb gar nicht mitlief; „jedes Zitat steht im Rohtext" war damit
 * eine Aussage über den Stub und nicht über das Produkt.
 *
 * Jetzt liefert er dieselbe ROHFORM wie ein Modell und geht durch dieselbe
 * Prüfung. Und er legt EIN Feld mit einem ERFUNDENEN Zitat dazu
 * (`distinctiveAsset`): es MUSS verworfen werden. Damit ist der Riegel im
 * Beweis nicht nur beteiligt, sondern nachweisbar wirksam — eine Gegenprobe,
 * die ohne echten Anbieter läuft.
 */
function stubAnswer(pages: ReadonlyMap<string, string>): { fields: unknown[] } {
  const entries = [...pages.entries()]
  const fields: unknown[] = []

  MARKET_FIELDS.forEach((definition, index) => {
    // Das erfundene Feld — der Riegel muss es wegwerfen.
    if (definition.id === 'distinctiveAsset') {
      fields.push({
        fieldId: definition.id,
        value: 'Ein Satz, den diese Website nie geschrieben hat',
        evidence: {
          quote: 'Diesen Satz gibt es auf keiner dieser Seiten (Ersatz-Gegenprobe).',
          sourceUrl: entries[0]?.[0] ?? '',
          confidence: 'stated',
        },
      })
      return
    }

    const entry = entries[index % Math.max(1, entries.length)]
    if (!entry) return
    const [url, text] = entry
    const sentence = (text.replace(/\s+/g, ' ').match(/[^.!?]{25,180}[.!?]/) ?? [])[0]?.trim()
    if (!sentence) {
      fields.push({ fieldId: definition.id, value: '' })
      return
    }
    const quote = sentence.slice(0, MARKET_EVIDENCE_MAX)
    fields.push({
      fieldId: definition.id,
      value: quote,
      ...(definition.form === 'list'
        ? { items: sentence.split(/\s+/).slice(0, definition.maxItems ?? 5) }
        : {}),
      evidence: { quote, sourceUrl: url, confidence: 'stated' },
    })
  })

  return { fields }
}

/**
 * EINE GANZE ANTWORT FORMEN — je Feld einzeln, fail-soft.
 *
 * EINE Stelle für beide Zweige (Anbieter und Ersatz): läge die Schleife nur im
 * Anbieter-Zweig, prüfte der Beweis eine andere Kette als der Betrieb.
 * Dubletten: der ERSTE Eintrag je Feld gewinnt — ein Modell, das ein Feld
 * zweimal liefert, hat sich korrigiert, und die Korrektur ist nicht
 * verlässlicher als der erste Anlauf.
 */
function shapeAnswer(
  answer: { fields: unknown[] },
  pages: ReadonlyMap<string, string>,
  fetchedAt: string,
): { fields: MarketProfileField[], discarded: number } {
  const fields: MarketProfileField[] = []
  const seen = new Set<MarketFieldId>()
  let discarded = 0

  for (const entry of answer.fields) {
    const shaped = shapeField(entry, pages, fetchedAt)
    if (!shaped) {
      discarded++
      continue
    }
    if (seen.has(shaped.fieldId)) continue
    seen.add(shaped.fieldId)
    fields.push(shaped)
  }

  return { fields, discarded }
}

/**
 * DAS MARKTPROFIL EINES WETTBEWERBERS AUS SEINEM ROHTEXT.
 *
 * FAIL-SOFT im Ganzen: scheitert der Anbieter oder das Schema, kommt eine
 * leere Feldliste mit einem GRUND zurück. Der Abruf bleibt trotzdem stehen —
 * ein Lauf, der die Auswertung verliert, hat immer noch gelesen, und der
 * nächste Lauf trifft auf denselben `inputHash` und muss nicht neu holen.
 */
export async function extractMarketProfile(
  event: H3Event,
  input: MarketExtractInput,
): Promise<MarketExtractResult> {
  const pages = splitMarketRawText(input.rawText)
  const fetchedAt = new Date().toISOString().slice(0, 10)

  // Der Ersatz ersetzt den ANBIETER, nicht die Prüfung: seine Antwort geht
  // durch dieselbe Zod-Form, denselben Beleg-Riegel und dieselbe Zählung
  // (s. `stubAnswer`).
  if (marketDevStubEnabled()) {
    return {
      fields: shapeAnswer(stubAnswer(pages), pages, fetchedAt).fields,
      model: 'dev-stub',
      promptVersion: MARKET_EXTRACT_PROMPT_VERSION,
      failure: '',
    }
  }

  const model = marketExtractModel()
  if (!model) return { fields: [], model: '', promptVersion: MARKET_EXTRACT_PROMPT_VERSION, failure: 'ai_disabled' }

  let raw: unknown
  try {
    raw = await aiCompleteJson<unknown>(event, marketExtractPrompt({
      competitorName: input.competitorName,
      pageUrls: input.pageUrls,
      rawText: input.rawText,
    }), {
      model,
      system: marketExtractSystemPrompt(),
      label: 'market-extract',
      maxTokens: MARKET_EXTRACT_MAX_TOKENS,
      timeoutMs: MARKET_EXTRACT_TIMEOUT_MS,
      // Eine Extraktion soll bei gleicher Eingabe gleich ausfallen.
      temperature: 0,
      providerRouting: { ...BRAND_PROVIDER_ROUTING },
    })
  }
  catch (error) {
    logEvent('warn', 'market.extract_provider_error', {
      // Die MELDUNG des Anbieters — nie der Prompt, nie der Rohtext, nie ein
      // Zitat (Log-Regel).
      // Der Transport wirft H3-Fehler (`createError`), deren `message` LEER
      // ist — die Aussage steckt in `status` + `statusText` („AI not
      // configured", „AI provider unavailable"). Beim ersten bezahlten
      // Bibliothekslauf (2026-09-06) stand hier fünfmal `message: ""`, und die
      // Ursache (kein Schlüssel in der Dev-Env) war nur aus dem Code zu erraten.
      message: describeProviderError(error),
    })
    return { fields: [], model, promptVersion: MARKET_EXTRACT_PROMPT_VERSION, failure: 'provider_error' }
  }

  const parsed = answerSchema.safeParse(raw)
  if (!parsed.success) {
    logEvent('warn', 'market.extract_schema_error', { issues: parsed.error.issues.length })
    return { fields: [], model, promptVersion: MARKET_EXTRACT_PROMPT_VERSION, failure: 'schema_error' }
  }

  const { fields, discarded } = shapeAnswer(parsed.data, pages, fetchedAt)

  logEvent('info', 'market.extracted', {
    model,
    promptVersion: MARKET_EXTRACT_PROMPT_VERSION,
    // ZAHLEN, kein Inhalt: wie viele Felder kamen an, wie viele fielen durch
    // den Riegel. Genau das ist die Zahl, die sagt, ob ein Modell taugt.
    fields: fields.length,
    discarded,
    pages: pages.size,
  })

  return { fields, model, promptVersion: MARKET_EXTRACT_PROMPT_VERSION, failure: '' }
}
