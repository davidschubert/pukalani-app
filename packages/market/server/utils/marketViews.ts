import type {
  MarketAiStatement,
  MarketAiView,
  MarketBrandCheck,
  MarketCandidateRole,
  MarketCandidateSource,
  MarketCompetitor,
  MarketCompetitorStatus,
  MarketExclusionReason,
  MarketProfile,
  MarketProfileField,
} from '../../shared/marketProfile'
import { MARKET_CANDIDATE_ROLES, MARKET_CANDIDATE_SOURCES } from '../../shared/marketProfile'
import type { MarketCompetitorRow, MarketProfileRow } from '../../shared/types/market'
import {
  marketAiViewSchema,
  marketFieldsSchema,
  parseMarketJson,
} from '../../shared/types/market'

/**
 * DIE ÜBERSETZUNG ZWISCHEN ZEILE UND VERTRAG — Appwrite-Zeilen hinein, die
 * Formen aus `shared/marketProfile.ts` heraus.
 *
 * ── WARUM DAS EINE EIGENE DATEI IST ───────────────────────────────────────
 * Vier Routen brauchen dieselbe Umformung. Läge sie in einer davon, schriebe
 * die zweite ihre eigene — und dann heisst `status` an einer Stelle etwas
 * anderes als an der anderen. Dasselbe Muster wie `toSlotView`/`toStepSummary`
 * im brand-Layer.
 *
 * ── DIE ZEILE IST DER VERDÄCHTIGE, NICHT DER VERTRAG ──────────────────────
 * Was in den JSON-Spalten steht, hat ein MODELL geschrieben (Extraktion,
 * Aussensicht). Deshalb wird beim LESEN geprüft (`parseMarketJson` +
 * Schema), und eine unlesbare Spalte wird zu einer leeren Liste statt zu einem
 * Fehler: ein Kandidat mit kaputtem Profil soll in der Liste stehen, damit man
 * ihn neu laufen lassen kann.
 */

const STATUSES: readonly MarketCompetitorStatus[] = ['pending', 'reading', 'fetched', 'excluded', 'failed']
const REASONS: readonly MarketExclusionReason[] = ['robots', 'tdm', 'noText', 'unreachable']

function asStatus(value: string | undefined): MarketCompetitorStatus {
  return STATUSES.find(status => status === value) ?? 'pending'
}

function asReason(value: string | undefined): MarketExclusionReason | undefined {
  return REASONS.find(reason => reason === value)
}

function asSource(value: string | undefined): MarketCandidateSource {
  return MARKET_CANDIDATE_SOURCES.find(source => source === value) ?? 'website'
}

/**
 * Die ROLLE (MV1 M4, market-004). Ein unbekannter oder fehlender Wert ist
 * `competitor` — das ist der Bestand aus M1–M3 und die sichere Richtung: eine
 * Zeile, die versehentlich als `self` gälte, verschwände aus dem Feld und
 * senkte jede Quote, ohne dass irgendwo etwas fehlte.
 */
function asRole(value: string | undefined): MarketCandidateRole {
  return MARKET_CANDIDATE_ROLES.find(role => role === value) ?? 'competitor'
}

/** Die JSON-Liste `pagesFetched` — kaputt heisst „keine", nie „Fehler". */
function parsePagesFetched(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object' && typeof (entry as { url?: unknown }).url === 'string') {
          return (entry as { url: string }).url
        }
        return ''
      })
      .filter(Boolean)
  }
  catch {
    return []
  }
}

export function toMarketCompetitor(
  row: MarketCompetitorRow,
  brandCheck?: MarketBrandCheck | null,
): MarketCompetitor {
  const pagesRead = parsePagesFetched(row.pagesFetched)
  const reason = asReason(row.excludedReason)
  return {
    id: row.$id,
    name: row.name,
    url: row.url ?? '',
    status: asStatus(row.status),
    ...(reason ? { excludedReason: reason } : {}),
    ...(pagesRead.length ? { pagesRead } : {}),
    ...(row.fetchedAt ? { fetchedAt: row.fetchedAt } : {}),
    source: asSource(row.sourceKind),
    role: asRole(row.role),
    ...(row.sourceRef ? { sourceRefId: row.sourceRef } : {}),
    // `brandCheck` reicht der Aufrufer herein (MV1 M3, §7.3): der BESTEHENDE
    // Brand-Check-Score, nachgeschlagen über die Adresse. Liegt keiner vor,
    // bleibt das Feld WEG — eine Hülle mit Nullen sähe aus wie ein gemessener
    // Wert, und der Marktvergleich rechnet keinen Score.
    ...(brandCheck ? { brandCheck } : {}),
  }
}

export function toMarketProfile(row: MarketProfileRow): MarketProfile {
  return {
    competitorId: row.competitorId,
    fields: parseMarketJson<MarketProfileField[]>(row.fields, marketFieldsSchema) ?? [],
  }
}

export function toMarketAiView(row: MarketProfileRow): MarketAiView | null {
  const statements = parseMarketJson<MarketAiStatement[]>(row.aiOutsideView, marketAiViewSchema)
  if (!statements?.length) return null
  return { competitorId: row.competitorId, statements }
}

/**
 * DAS JÜNGSTE PROFIL JE KANDIDAT. `listMarketProfiles` liefert absteigend
 * sortiert (jüngste zuerst), der erste Treffer je `competitorId` gewinnt —
 * die älteren sind der Verlauf (Anhang B: „ein neuer Abrufstand legt ein neues
 * Profil an").
 */
export function latestProfilesByCompetitor(rows: readonly MarketProfileRow[]): Map<string, MarketProfileRow> {
  const latest = new Map<string, MarketProfileRow>()
  for (const row of rows) {
    if (!latest.has(row.competitorId)) latest.set(row.competitorId, row)
  }
  return latest
}
