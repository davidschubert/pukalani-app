import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { AppwriteException, ID, Query } from 'node-appwrite'
import type {
  MarketCompetitorRow,
  MarketProfileRow,
  MarketReportRow,
} from '../../shared/types/market'
import {
  MARKET_COMPETITORS_TABLE,
  MARKET_PROFILES_TABLE,
  MARKET_REPORTS_TABLE,
} from '../../shared/types/market'
import { MARKET_COMPETITORS_MAX } from '../../shared/marketProfile'
import { loadOwnedProfile } from '../contracts/brandContract'

/**
 * DER LESE-/SCHREIB-UNTERBAU DES market-LAYERS — alles, was mehr als eine
 * Route braucht, steht EINMAL hier (dasselbe Muster wie `brandStore.ts`).
 *
 * STAND M1: die Grundzugriffe. Es gibt noch KEINE Route, die sie ruft — sie
 * kommen mit M2 (Abruf/Extraktion) und M3 (Vergleich). Das ist Absicht: der
 * Zugriffsweg soll feststehen, BEVOR die erste Route ihn benutzt, sonst
 * schreibt jede Route ihren eigenen.
 *
 * ── KEIN `tenantDb`, UND DAS IST KEINE ABKÜRZUNG ──────────────────────────
 * Dieselbe Lage wie im brand-Layer: `market` läuft ausschliesslich auf der
 * Single-Tenant-Instanz `branding`, seine Tabellen tragen kein `communityId`,
 * und der ESLint-Backstop gegen rohes `.tablesDB` gilt den GEPOOLTEN Layern.
 *
 * ── DIE GRENZE IST DAS BRANDING, NICHT DIE ZEILE ──────────────────────────
 * Alle market_*-Tabellen sind server-only (Permissions `[]`) — es gibt keine
 * Row-Permission, die im Zweifel noch abfinge. Die EINZIGE Grenze zwischen
 * zwei Konten ist deshalb `requireOwnedMarketProfile`: sie fragt den
 * brand-Vertrag, ob dieses `profileId` dem Aufrufer gehört, und wirft sonst
 * 404 (nicht 403 — ein 403 bestätigte die Existenz eines fremden Brandings).
 * Jede Route ruft sie VOR dem ersten Zugriff, und jede Abfrage hier trägt
 * `profileId` im Filter. Ein `getRow` auf eine market-Zeile OHNE anschliessende
 * Zugehörigkeits-Prüfung gibt es bewusst nicht: genau daran ist die
 * Mandanten-Isolation am 2026-07-26 an drei Moderations-Routen gescheitert
 * (CLAUDE.md, „Eine Datentür").
 *
 * ── `Query.limit()` IST IMMER EXPLIZIT ────────────────────────────────────
 * Appwrites Vorgabe ist 25; eine Liste, die still bei 25 endet, sieht aus wie
 * ein leeres Ende. Die Deckel stehen deshalb als Konstanten hier — der der
 * Kandidaten kommt aus dem Produktvertrag (`MARKET_COMPETITORS_MAX`, §2.9
 * Nr. 8), damit „fünf Wettbewerber" nicht an zwei Stellen verschieden heisst.
 */

/**
 * DER NAME DIESES LAYERS in den Registries des Fundaments — GDPR-Contributor
 * (core) und Profil-Kaskade (brand). Einmal, weil zwei getippte Zeichenketten
 * in zwei Registries irgendwann auseinanderlaufen und der Unterschied dann nur
 * in einer Log-Zeile sichtbar wäre.
 */
export const MARKET_LAYER_ID = 'market'

/** Wie viele Berichte die Verlaufs-Liste höchstens zeigt. */
export const MARKET_REPORTS_LIMIT = 50
/**
 * Wie viele Marktprofile je Branding gelesen werden. Fünf Kandidaten × ihre
 * Historie — 200 deckt viele Läufe ab und bleibt eine Abfrage.
 */
export const MARKET_PROFILES_LIMIT = 200

export function marketDb(event: H3Event) {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)
  return { tablesDB, databaseId }
}

/**
 * „Die Zeile (oder die Tabelle) gibt es nicht."
 *
 * Der brand-Layer hat dieselbe Prüfung als `isAppwriteNotFound` — sie heisst
 * hier ABSICHTLICH anders. Beide `server/utils` werden von Nitro
 * auto-importiert; zwei gleichnamige Exporte wären eine „Duplicated
 * imports"-Meldung und, schlimmer, eine stille Schattierung: der brand-Layer
 * bekäme unsere Fassung untergeschoben. Ein Name, der nicht kollidieren kann,
 * ist billiger als die Regel, das nicht zu vergessen.
 */
export function isMarketRowMissing(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

/**
 * Die Besitz-Prüfung des market-Layers — die EINE Stelle, an der er fragt,
 * ob ein Branding dem Aufrufer gehört (s. Kopf). Sie gibt die brand-Zeile
 * zurück, weil der Aufrufer sie ohnehin braucht (Inhaltssprache, Pfad-Art).
 */
export async function requireOwnedMarketProfile(event: H3Event, userId: string, profileId: string) {
  return await loadOwnedProfile(event, userId, profileId)
}

// ── market_competitors ──────────────────────────────────────────────────────

/** Die Kandidaten eines Brandings, älteste zuerst (Eingabereihenfolge). */
export async function listMarketCompetitors(
  event: H3Event,
  profileId: string,
): Promise<MarketCompetitorRow[]> {
  const { tablesDB, databaseId } = marketDb(event)
  const { rows } = await tablesDB.listRows<MarketCompetitorRow>({
    databaseId,
    tableId: MARKET_COMPETITORS_TABLE,
    queries: [
      Query.equal('profileId', profileId),
      Query.orderAsc('$createdAt'),
      // Der Deckel ist die PRODUKTREGEL, nicht eine Seitengrösse: mehr als
      // `MARKET_COMPETITORS_MAX` WETTBEWERBER darf es gar nicht geben. Wäre er
      // höher, verschwiege die Liste einen Verstoss, statt ihn zu zeigen.
      //
      // SEIT MV1 M4 EINE ZEILE MEHR: die eigene alte Website (`role: 'self'`,
      // §7.2 Nr. 2) zählt NICHT gegen den Deckel — sie ist kein Mitbewerber.
      // Ohne das Plus verschwände sie bei fünf Wettbewerbern still aus der
      // Liste, und „still" ist bei einer Abfrage-Grenze immer die falsche Art
      // zu fehlen.
      Query.limit(MARKET_COMPETITORS_MAX + 1),
    ],
  })
  return rows
}

/**
 * Einen Kandidaten anlegen. Die Zugehörigkeit wird GESTEMPELT und nie aus dem
 * Body übernommen — dieselbe Regel wie an der Datentür der gepoolten Layer:
 * eine durchgereichte Id schriebe in ein fremdes Branding.
 */
export async function createMarketCompetitor(
  event: H3Event,
  profileId: string,
  data: Omit<Partial<MarketCompetitorRow>, keyof Models.Row | 'profileId'> & { name: string },
): Promise<MarketCompetitorRow> {
  const { tablesDB, databaseId } = marketDb(event)
  return await tablesDB.createRow<MarketCompetitorRow>({
    databaseId,
    tableId: MARKET_COMPETITORS_TABLE,
    rowId: ID.unique(),
    // `status` steht VOR dem Spread: die Spalte hat zwar den Appwrite-Default
    // 'pending', aber der Aufrufer soll ihn nicht mitschreiben müssen — und
    // der Typ der Zeile sagt „status ist immer da", weil das beim LESEN wahr
    // ist. Beides gleichzeitig geht nur so.
    data: { status: 'pending', ...data, profileId },
    // Server-only: KEINE Row-Permissions. Die Tabelle trägt `permissions: []`,
    // und wer hier eine Leseregel setzte, öffnete fremde Marktprofile für den
    // Browser.
    permissions: [],
  })
}

/**
 * Einen Kandidaten ändern — NUR über sein Branding erreichbar. Der `profileId`
 * im Filter ist die Zugehörigkeits-Prüfung; ein `updateRow` allein auf die
 * Zeilen-Id wäre die Lücke, gegen die der Kopf argumentiert.
 */
export async function updateMarketCompetitor(
  event: H3Event,
  profileId: string,
  competitorId: string,
  data: Omit<Partial<MarketCompetitorRow>, keyof Models.Row | 'profileId'>,
): Promise<MarketCompetitorRow> {
  const row = await loadMarketCompetitor(event, profileId, competitorId)
  const { tablesDB, databaseId } = marketDb(event)
  return await tablesDB.updateRow<MarketCompetitorRow>({
    databaseId, tableId: MARKET_COMPETITORS_TABLE, rowId: row.$id, data,
  })
}

/** Einen Kandidaten laden und dabei belegen, dass er zu diesem Branding gehört. */
export async function loadMarketCompetitor(
  event: H3Event,
  profileId: string,
  competitorId: string,
): Promise<MarketCompetitorRow> {
  const { tablesDB, databaseId } = marketDb(event)
  let row: MarketCompetitorRow
  try {
    row = await tablesDB.getRow<MarketCompetitorRow>({
      databaseId, tableId: MARKET_COMPETITORS_TABLE, rowId: competitorId,
    })
  }
  catch (error) {
    if (isMarketRowMissing(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw toH3Error(error, 'Market competitor could not be loaded')
  }
  // 404 und nicht 403 — s. Kopf.
  if (row.profileId !== profileId) throw createError({ status: 404, statusText: 'Not Found' })
  return row
}

// ── market_profiles ─────────────────────────────────────────────────────────

/** Die Marktprofile eines Brandings, jüngste zuerst. */
export async function listMarketProfiles(
  event: H3Event,
  profileId: string,
): Promise<MarketProfileRow[]> {
  const { tablesDB, databaseId } = marketDb(event)
  const { rows } = await tablesDB.listRows<MarketProfileRow>({
    databaseId,
    tableId: MARKET_PROFILES_TABLE,
    queries: [
      Query.equal('profileId', profileId),
      Query.orderDesc('$createdAt'),
      Query.limit(MARKET_PROFILES_LIMIT),
    ],
  })
  return rows
}

export async function createMarketProfile(
  event: H3Event,
  profileId: string,
  competitorId: string,
  data: Omit<Partial<MarketProfileRow>, keyof Models.Row | 'profileId' | 'competitorId'>,
): Promise<MarketProfileRow> {
  const { tablesDB, databaseId } = marketDb(event)
  return await tablesDB.createRow<MarketProfileRow>({
    databaseId,
    tableId: MARKET_PROFILES_TABLE,
    rowId: ID.unique(),
    data: { ...data, profileId, competitorId },
    permissions: [],
  })
}

// ── market_reports ──────────────────────────────────────────────────────────

/**
 * Der jüngste Bericht zu EINEM Stand (§2.3 Nr. 5) — oder `undefined`, wenn es
 * ihn nicht gibt. Das ist der Kostendeckel: gleicher Schlüssel ⇒ kein
 * Modell-Aufruf. `Query.limit(1)`, weil der Leser ohnehin nur den jüngsten
 * nimmt.
 */
export async function findMarketReport(
  event: H3Event,
  profileId: string,
  revisionKey: string,
): Promise<MarketReportRow | undefined> {
  const { tablesDB, databaseId } = marketDb(event)
  const { rows } = await tablesDB.listRows<MarketReportRow>({
    databaseId,
    tableId: MARKET_REPORTS_TABLE,
    queries: [
      Query.equal('profileId', profileId),
      Query.equal('revisionKey', revisionKey),
      Query.orderDesc('$createdAt'),
      Query.limit(1),
    ],
  })
  return rows[0]
}

/** Der Verlauf der Berichte eines Brandings, jüngste zuerst. */
export async function listMarketReports(
  event: H3Event,
  profileId: string,
): Promise<MarketReportRow[]> {
  const { tablesDB, databaseId } = marketDb(event)
  const { rows } = await tablesDB.listRows<MarketReportRow>({
    databaseId,
    tableId: MARKET_REPORTS_TABLE,
    queries: [
      Query.equal('profileId', profileId),
      Query.orderDesc('$createdAt'),
      Query.limit(MARKET_REPORTS_LIMIT),
    ],
  })
  return rows
}

export async function createMarketReport(
  event: H3Event,
  profileId: string,
  revisionKey: string,
  data: Omit<Partial<MarketReportRow>, keyof Models.Row | 'profileId' | 'revisionKey'>,
): Promise<MarketReportRow> {
  const { tablesDB, databaseId } = marketDb(event)
  return await tablesDB.createRow<MarketReportRow>({
    databaseId,
    tableId: MARKET_REPORTS_TABLE,
    rowId: ID.unique(),
    data: { ...data, profileId, revisionKey },
    permissions: [],
  })
}

// ── Kaskade ─────────────────────────────────────────────────────────────────

/**
 * Alles löschen, was der market-Layer an EINEM Branding hängen hat.
 *
 * Aufgerufen wird das von zwei Stellen im brand-Layer über die Registry
 * (`registerBrandProfileCascade`): der Löschroute eines Brandings und dem
 * GDPR-Contributor. Deshalb steht die Reihenfolge fest: Berichte → Profile →
 * Kandidaten, also Kinder zuerst — dieselbe Begründung wie im Kopf der
 * brand-Löschroute (ein Abbruch soll SICHTBAREN Rest hinterlassen, keinen
 * unsichtbaren; ein Kandidat ohne Bericht taucht in der Liste auf, ein Bericht
 * ohne Kandidaten nirgends).
 *
 * IDEMPOTENT: jede Löschung verzeiht ein 404, und eine fehlende TABELLE
 * ebenfalls — auf einer Instanz ohne market-Migration hat dieser Layer nichts,
 * und ein Löschlauf darf daran nicht scheitern.
 */
export async function removeMarketProfileData(event: H3Event, profileId: string): Promise<number> {
  const { tablesDB, databaseId } = marketDb(event)
  let removed = 0

  for (const tableId of [MARKET_REPORTS_TABLE, MARKET_PROFILES_TABLE, MARKET_COMPETITORS_TABLE]) {
    let rows: Models.Row[]
    try {
      rows = await listAllRows<Models.Row>(tablesDB, databaseId, tableId, [Query.equal('profileId', profileId)])
    }
    catch (error) {
      if (isMarketRowMissing(error)) continue
      throw error
    }
    for (const row of rows) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id })
        removed++
      }
      catch (error) {
        if (!isMarketRowMissing(error)) throw error
      }
    }
  }

  return removed
}
