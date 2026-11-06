import type { Models } from 'node-appwrite'
import { z } from 'zod'
import type { MarketCandidateSource } from '../marketProfile'
import {
  MARKET_CANDIDATE_SOURCES,
  MARKET_EVIDENCE_MAX,
  MARKET_FIELD_IDS,
} from '../marketProfile'

/**
 * DIE ZEILEN DER DREI market_*-TABELLEN UND DIE PRÜFUNG IHRER JSON-SPALTEN
 * (Paket M1, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.6 + §7.6).
 *
 * ── ZWEI EBENEN, ZWEI DATEIEN ────────────────────────────────────────────
 * `shared/marketProfile.ts` ist der PRODUKT-Vertrag: was ein Marktprofil IST
 * (zehn Felder, Beleg, Herkunft, Häufigkeit). Diese Datei ist der ABLAGE-
 * Vertrag: wie das in Appwrite-Zeilen liegt. Sie hängt von jener ab, nie
 * umgekehrt — sonst wanderte die Datenbank in den Produktbegriff.
 *
 * ── WARUM DIE JSON-SPALTEN EIN ZOD-SCHEMA HABEN ──────────────────────────
 * `fields`, `aiOutsideView` und die vier Bericht-Teile sind Zeichenketten in
 * der Datenbank. Was darin steht, hat ein MODELL geschrieben (Extraktion,
 * Vergleich) — nicht ein Formular. Ein Wert, den ein Modell erzeugt hat und
 * den niemand geprüft hat, ist eine Behauptung; erst das Schema macht daraus
 * Daten. Deshalb wird beim LESEN geprüft und nicht nur beim Schreiben: eine
 * Zeile kann aus einer älteren Prompt-Fassung stammen, und ein `as`-Cast
 * würde den Unterschied verschweigen.
 *
 * ── DIE SCHEMAS SIND HIER UND NICHT IN `schemas/` ────────────────────────
 * Der brand-Layer hält seine FORMULAR-Schemas in `schemas/` (Factories mit
 * `t`, für Fehlermeldungen in der Sprache des Menschen). Diese hier prüfen
 * MASCHINEN-Ausgaben; sie brauchen keine Übersetzung, weil ihre Verletzung
 * nie einem Menschen gezeigt wird — sie führt zum Verwerfen des Feldes
 * (§2.2, Halluzinations-Riegel).
 */

// ── Tabellennamen ───────────────────────────────────────────────────────────
// EINMAL, weil eine Zeichenkette in vier Dateien ein Tippfehler in vier
// Dateien ist — und ein falscher Tabellenname in Appwrite ein 404, das wie
// „keine Daten" aussieht.
export const MARKET_COMPETITORS_TABLE = 'market_competitors'
export const MARKET_PROFILES_TABLE = 'market_profiles'
export const MARKET_REPORTS_TABLE = 'market_reports'

// ── Zeilen (market-001 … market-003) ────────────────────────────────────────

/**
 * Ein Kandidat (market-001). `url` und `rawText` sind optional, weil drei der
 * vier Quellen (§7.2) gar keine Adresse haben — die Begründung steht im Kopf
 * der Migration.
 */
export type MarketCompetitorRow = Models.Row & {
  profileId: string
  name: string
  url?: string
  status: string
  excludedReason?: string
  sourceKind?: string
  sourceRef?: string
  /**
   * `competitor` | `self` (market-004). OPTIONAL getypt, weil die Spalte
   * ADDITIV dazukam — eine Zeile von vor der Migration liest `undefined`, und
   * das ist genau der Default `competitor`.
   */
  role?: string
  brandCheckId?: string
  /** JSON-Liste der gelesenen Adressen (`string[]`). */
  pagesFetched?: string
  fetchedAt?: string | null
  /** Gefilterter Seitentext — lebt 24 h (§2.9 Nr. 6). */
  rawText?: string | null
  rawExpiresAt?: string | null
}

/** Ein Marktprofil (market-002). `fields` ist JSON nach `marketFieldsSchema`. */
export type MarketProfileRow = Models.Row & {
  competitorId: string
  profileId: string
  fields?: string | null
  /** Eigene Spalte, NIE mit `fields` vermischt (§7.5 a). */
  aiOutsideView?: string | null
  extractedAt?: string | null
  model?: string
  promptVersion?: string
  inputHash?: string
}

/** Ein Bericht (market-003). Fünf JSON-Teile plus die Befund-Adressen. */
export type MarketReportRow = Models.Row & {
  profileId: string
  revisionKey: string
  ownProfile?: string | null
  matrix?: string | null
  conventions?: string | null
  overlaps?: string | null
  whitespace?: string | null
  /** JSON-Liste von `brand_findings.$id` (`string[]`). */
  findingIds?: string
  model?: string
  promptVersion?: string
}

// ── Schemas der JSON-Spalten ────────────────────────────────────────────────

const fieldIdSchema = z.enum(MARKET_FIELD_IDS)
// Die Aufzählung stammt aus dem Produktvertrag und wird hier nur in Zods
// Tupel-Form gebracht — eine zweite, abgetippte Liste wäre die Stelle, an der
// eine fünfte Quelle irgendwann fehlt.
const sourceSchema = z.enum(
  MARKET_CANDIDATE_SOURCES as unknown as [MarketCandidateSource, ...MarketCandidateSource[]],
)

/**
 * Der Beleg. `quote` hat hier dieselbe Schranke wie im Produktvertrag
 * (`MARKET_EVIDENCE_MAX`, §2.9 Nr. 4) — sie ist eine RECHTLICHE Grenze
 * (Zitatrecht), nicht eine Anzeigefrage, und gehört deshalb an die
 * Eingangstür der Daten und nicht in die Komponente.
 */
export const marketEvidenceSchema = z.object({
  quote: z.string().min(1).max(MARKET_EVIDENCE_MAX),
  sourceUrl: z.url().max(512),
  fetchedAt: z.string().min(1).max(40),
  confidence: z.enum(['stated', 'implied']),
})

/** Häufigkeit als Aussage über SEITEN (§7.4) — nie ein Mittelwert. */
export const marketFrequencySchema = z.object({
  pages: z.number().int().min(0),
  of: z.number().int().min(0),
})

/**
 * EIN FELD. `value` DARF leer sein: „nicht öffentlich formuliert" ist eine
 * Aussage über die Kategorie und kein Fehler (§1.10). Der Beleg ist deshalb
 * optional — aber die Regel „gefüllter Wert ohne Beleg wird verworfen" gilt
 * trotzdem; sie steht als `superRefine`, weil Zod sie sonst nicht als EINEN
 * Zusammenhang ausdrücken könnte.
 */
export const marketProfileFieldSchema = z.object({
  fieldId: fieldIdSchema,
  value: z.string().max(2000),
  items: z.array(z.string().max(200)).max(10).optional(),
  evidence: marketEvidenceSchema.optional(),
  source: sourceSchema.optional(),
  frequency: marketFrequencySchema.optional(),
}).superRefine((field, ctx) => {
  // Der Halluzinations-Riegel auf Schema-Ebene (§2.2). Die zweite Hälfte —
  // `evidence.quote ⊂ rawText` — ist deterministisch und läuft in M2 an der
  // Extraktion; sie kann hier nicht stehen, weil das Schema den Rohtext nicht
  // kennt. AUSNAHME `foundation`: bestätigte eigene Felder sind BESCHLOSSEN,
  // nicht zitiert (s. `MarketCandidateSource` im Produktvertrag) — ein Beleg
  // für den eigenen Satz wäre eine Quellenangabe auf sich selbst.
  if (field.value.trim() && !field.evidence && field.source !== 'foundation' && field.source !== 'library') {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'evidence required for a stated value' })
  }
})

/** Die JSON-Spalte `market_profiles.fields`. */
export const marketFieldsSchema = z.array(marketProfileFieldSchema).max(MARKET_FIELD_IDS.length)

/**
 * Die JSON-Spalte `market_profiles.aiOutsideView` (§7.5).
 *
 * `agree` ≥ 2 IST der Konsens-Filter (§7.5 b) und steht im SCHEMA, nicht nur
 * im Code, der die Antworten einsammelt: eine Aussage, die nur ein Modell
 * gemacht hat, soll gar nicht erst ablegbar sein. `asked` daneben, weil „2 von
 * 2" und „2 von 3" verschieden viel bedeuten.
 */
export const marketAiStatementSchema = z.object({
  fieldId: fieldIdSchema,
  value: z.string().min(1).max(2000),
  agree: z.number().int().min(2),
  asked: z.number().int().min(2),
}).refine(statement => statement.agree <= statement.asked, {
  message: 'agree cannot exceed asked',
  path: ['agree'],
})

export const marketAiViewSchema = z.array(marketAiStatementSchema).max(MARKET_FIELD_IDS.length)

/**
 * Eine JSON-Spalte lesen, ohne dass eine kaputte Zeile die Seite mitnimmt.
 *
 * `undefined` heisst „nichts Verwertbares" — und der Aufrufer behandelt das
 * wie ein leeres Feld. Das ist die richtige Fail-Richtung: ein Bericht, der
 * eine unlesbare Spalte hat, soll seine anderen Teile trotzdem zeigen. Wer
 * den GRUND braucht, nimmt das Schema direkt (`safeParse`).
 */
export function parseMarketJson<T>(raw: string | null | undefined, schema: z.ZodType<T>): T | undefined {
  if (!raw) return undefined
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    return undefined
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
