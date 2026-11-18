import { vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import type { InsightsBrand, InsightsPost } from '../../shared/insightsPost'
import { insightsBrandSchema, insightsPostSchema } from '../../shared/insightsPost'
import type { InsightsCorrection } from '../../shared/insightsCorrection'
import {
  INSIGHTS_BRANDS_TABLE,
  INSIGHTS_CORRECTIONS_TABLE,
  INSIGHTS_POSTS_TABLE,
  fromInsightsBrand,
  fromInsightsCorrection,
  fromInsightsPost,
} from '../../shared/insightsRows'
import { createMicrocache } from '../../../core/server/utils/microcache'
import * as insightsAi from '../../server/utils/insightsAi'
import * as insightsChannelsAdmin from '../../server/utils/insightsChannelsAdmin'
import * as insightsCorrectionsAdmin from '../../server/utils/insightsCorrectionsAdmin'
import * as insightsPostsAdmin from '../../server/utils/insightsPostsAdmin'
import * as insightsPublic from '../../server/utils/insightsPublic'
import * as insightsReview from '../../server/utils/insightsReview'
import * as insightsStore from '../../server/utils/insightsStore'
import * as insightsWatchlistAdmin from '../../server/utils/insightsWatchlistAdmin'
import type { RoleExpectation } from '../../../core/tests/support/participationHarness'

/**
 * GEMEINSAMES WERKZEUG DER ROLLEN-TESTS DES insights-LAYERS (OPS-009, BT1 b).
 *
 * Drei Dinge, die jede Test-Datei sonst selbst nachbauen müsste:
 *
 *  1. `INSIGHTS_MANAGE_ONLY` — die Erwartung an das Tor `insights.manage`,
 *     AUSGESCHRIEBEN (nie aus `shared/authz.ts` berechnet, Beweis-Regel 1):
 *     nur der Betreiber, keine Community-Rolle.
 *  2. `insightsRouteGlobals()` — Nitros Auto-Imports, die die Routen dieses
 *     Layers rufen: die ECHTEN Server-Utils des Layers (nicht nachgebaut), die
 *     Laufzeit-Konfiguration und zwei Core-Hilfen. Die Datentür ist der
 *     Admin-Client hinter `insightsDb()`; der Prüfstand zählt sein Öffnen.
 *  3. `fakeInsightsTables()` — eine kleine Ablage für Routen, die ERST lesen
 *     und DANN entscheiden (öffentliche Seiten, Korrekturen, Löschen). Sie
 *     wertet `equal`/`contains`/`limit` der Abfragen aus und zählt jeden
 *     Zugriff — damit lässt sich zeigen, dass eine Ablehnung VOR dem Lesen
 *     oder Schreiben kommt.
 */

export const INSIGHTS_MANAGE_ONLY: RoleExpectation = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
}

/** Alle Formate öffentlich — der Riegel offen, damit nur der ZUSTAND entscheidet. */
export const ALL_PUBLIC_FORMATS = ['profile', 'duel', 'article', 'ranking'] as const

export interface InsightsGlobalsOptions {
  /** Öffentliche Formate (`pukalani.insights.publicFormats`). Standard: alle. */
  publicFormats?: readonly string[]
  /** Eine Ablage statt der echten Datentür (sonst endet die Probe dort). */
  tablesDB?: unknown
}

export function insightsRouteGlobals(options: InsightsGlobalsOptions = {}): Record<string, unknown> {
  const globals: Record<string, unknown> = {
    ...insightsStore,
    ...insightsPostsAdmin,
    ...insightsChannelsAdmin,
    ...insightsCorrectionsAdmin,
    ...insightsWatchlistAdmin,
    ...insightsReview,
    ...insightsPublic,
    ...insightsAi,
    useRuntimeConfig: () => ({
      appwriteKey: 'test-salt',
      insightsYoutubeKey: 'test-key',
      insightsYoutubeBaseUrl: 'http://youtube.invalid',
      public: { appwriteDatabaseId: 'db' },
    }),
    useAppConfig: () => ({
      pukalani: { insights: { publicFormats: [...(options.publicFormats ?? ALL_PUBLIC_FORMATS)] } },
    }),
    createMicrocache,
    trustedClientIp: () => '203.0.113.7',
  }
  if (options.tablesDB) globals.createAdminClient = () => ({ tablesDB: options.tablesDB })
  return globals
}

// ── Die Ablage ──────────────────────────────────────────────────────────────

export interface FakeRow {
  $id: string
  $tableId: string
  $createdAt: string
  $updatedAt: string
  [key: string]: unknown
}

interface ParsedQuery {
  method: string
  attribute?: string
  values?: unknown[]
}

function matches(row: FakeRow, query: ParsedQuery): boolean {
  const attribute = String(query.attribute ?? '')
  const values = query.values ?? []
  if (query.method === 'equal') return values.includes(row[attribute])
  if (query.method === 'contains') return values.some(value => String(row[attribute] ?? '').includes(String(value)))
  return true
}

export interface FakeTables {
  tablesDB: {
    listRows: (args: { tableId: string, queries?: string[] }) => Promise<{ rows: FakeRow[], total: number }>
    getRow: (args: { tableId: string, rowId: string }) => Promise<FakeRow>
    createRow: (args: { tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<FakeRow>
    updateRow: (args: { tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<FakeRow>
    deleteRow: (args: { tableId: string, rowId: string }) => Promise<Record<string, never>>
  }
  rows: FakeRow[]
  /** Wie oft gelesen bzw. geschrieben wurde. */
  reads: () => number
  writes: () => number
}

export function fakeInsightsTables(seed: FakeRow[] = []): FakeTables {
  const rows = seed.map(row => ({ ...row }))
  const listRows = vi.fn(async ({ tableId, queries }: { tableId: string, queries?: string[] }) => {
    const parsed = (queries ?? []).map(query => JSON.parse(query) as ParsedQuery)
    let found = rows.filter(row => row.$tableId === tableId && parsed.every(query => matches(row, query)))
    const limit = parsed.find(query => query.method === 'limit')
    if (limit) found = found.slice(0, Number(limit.values?.[0] ?? found.length))
    return { rows: found, total: found.length }
  })
  const getRow = vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = rows.find(entry => entry.$tableId === tableId && entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  })
  const createRow = vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const now = new Date().toISOString()
    const row: FakeRow = { $id: rowId, $tableId: tableId, $createdAt: now, $updatedAt: now, ...data }
    rows.push(row)
    return row
  })
  const updateRow = vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row = rows.find(entry => entry.$tableId === tableId && entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  })
  const deleteRow = vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const at = rows.findIndex(entry => entry.$tableId === tableId && entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
    return {}
  })
  return {
    tablesDB: { listRows, getRow, createRow, updateRow, deleteRow },
    rows,
    reads: () => listRows.mock.calls.length + getRow.mock.calls.length,
    writes: () => createRow.mock.calls.length + updateRow.mock.calls.length + deleteRow.mock.calls.length,
  }
}

const STAMP = '2026-09-01T10:00:00.000Z'

/** Eine Beitrags-Zeile, wie die Migration sie speichert. */
export function postRow(id: string, overrides: Partial<InsightsPost> = {}): FakeRow {
  const post = insightsPostSchema.parse({
    format: 'article',
    slug: `beitrag-${id}`,
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Was kostet ein Rebranding?',
    titleEn: 'What does a rebrand cost?',
    dekDe: 'Vier Posten.',
    dekEn: 'Four items.',
    bodyDe: 'Text auf Deutsch.',
    bodyEn: 'Text in English.',
    publishedAt: STAMP,
    reviewedAt: STAMP,
    reviewedBy: 'u-redaktion',
    noteInternal: 'INTERN: noch gegenlesen',
    brief: 'INTERN: Auftrag an die Redaktion',
    briefModel: 'intern/modell',
    draftModel: 'intern/modell',
    draftPromptVersion: 'v3',
    translationModel: 'intern/modell',
    translationPromptVersion: 'v2',
    readingMinutes: 4,
    ...overrides,
  })
  return { $id: id, $tableId: INSIGHTS_POSTS_TABLE, $createdAt: STAMP, $updatedAt: STAMP, ...fromInsightsPost(post) }
}

/** Eine Marken-Zeile, wie die Migration sie speichert. */
export function brandRow(id: string, overrides: Partial<InsightsBrand> = {}): FakeRow {
  const brand = insightsBrandSchema.parse({
    slug: `marke-${id}`,
    name: `Marke ${id}`,
    state: 'published',
    publicationId: 'INTERN-pub',
    claimedBy: 'u-intern',
    ...overrides,
  })
  return { $id: id, $tableId: INSIGHTS_BRANDS_TABLE, $createdAt: STAMP, $updatedAt: STAMP, ...fromInsightsBrand(brand) }
}

/** Eine Korrektur-Zeile (Arbeitsliste der Redaktion). */
export function correctionRow(id: string, overrides: Partial<InsightsCorrection> & { ipHash?: string } = {}): FakeRow {
  const { ipHash = 'hash-fremd', ...rest } = overrides
  const correction: InsightsCorrection = {
    targetKind: 'post',
    targetId: 'p1',
    kind: 'correction',
    field: 'titleDe',
    proposed: 'Neuer Titel',
    reason: '',
    contactEmail: 'fremde-person@example.test',
    status: 'open',
    decisionNote: '',
    ...rest,
  }
  return {
    $id: id,
    $tableId: INSIGHTS_CORRECTIONS_TABLE,
    $createdAt: STAMP,
    $updatedAt: STAMP,
    ...fromInsightsCorrection(correction),
    ipHash,
    decidedAt: null,
    retentionAt: STAMP,
  }
}

/** Liest alle Schlüssel eines Antwort-Objekts, tief — für „kein internes Feld". */
export function deepKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) deepKeys(entry, into)
  }
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key)
      deepKeys(entry, into)
    }
  }
  return into
}

/** Wurde ein Wert irgendwo in der Antwort ausgeliefert? */
export function leaks(value: unknown, needle: string): boolean {
  return JSON.stringify(value ?? null).includes(needle)
}
