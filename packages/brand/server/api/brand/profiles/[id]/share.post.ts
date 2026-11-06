import { randomBytes } from 'node:crypto'
import { ID } from 'node-appwrite'
import { createBrandSharePublishSchema } from '../../../../../schemas/brandAccess'
import type { BrandSharePublishResponse } from '../../../../../shared/types/brand'
import {
  BRAND_SHARES_TABLE,
  brandDb,
  listActiveShares,
  loadOwnedProfile,
  loadStepRows,
  requireProfileIdParam,
} from '../../../../utils/brandStore'
import { brandDesignSnapshotPreset } from '../../../../../shared/brandDesignValues'
import { loadBrandDesignPreset } from '../../../../utils/brandDesignPreset'
import { buildBrandSnapshot } from '../../../../utils/brandSnapshot'
import { hashBrandShareToken } from '../../../../utils/brandShares'
import { recordBrandEvent } from '../../../../utils/brandEvents'

/**
 * VERÖFFENTLICHEN — einen Lese-Link auf ein EINGEFRORENES Abbild erzeugen.
 *
 * ── DER SNAPSHOT WIRD KOPIERT, NICHT VERLINKT ─────────────────────────────
 * Die Zeile trägt den Inhalt selbst (Schema-Anhang §4). Ein Link auf die
 * lebenden Daten wäre billiger und falsch: „Momentaufnahme" heisst, dass
 * spätere Änderungen erst nach erneutem Veröffentlichen sichtbar werden — wer
 * seinen Entwurf an einen Kunden schickt, soll nicht mittendrin einen anderen
 * Text zeigen. Aus demselben Grund reisen `presetId`/`presetVersion` mit: eine
 * spätere Theme-Anpassung darf das Eingefrorene nicht umfärben.
 *
 * ── WAS HINEIN DARF (Audit 3) ─────────────────────────────────────────────
 * Brand Story + die BESTÄTIGTEN Kapitel. NIE Chats, nie Entwürfe, nie
 * Metriken. `confirmedSlotValues` liest deshalb ausschliesslich das Feld
 * `confirmed` — `latestDraft` steht direkt daneben und wäre der eine Griff, mit
 * dem ein halbfertiger Gedanke öffentlich würde.
 *
 * ── UND SEIT MV1 M5: NICHTS `internal` (BF1 §3a Nr. 7) ────────────────────
 * `brandShareableSlotValues` wirft raus, was die Registry als nicht-öffentlich
 * führt — heute die vier Sessions `a.competitors`, `a.complaints`,
 * `a.challenge`, `a.facts`. SEIT PAKET G1 kommt die zweite Bedingung dazu
 * (`sessionTravels`: öffentlich UND `audience: 'foundation'`): auch jede
 * ROHANTWORT bleibt draussen — `a.origin` ist nicht vertraulich und trotzdem
 * kein Inhalt eines Abbilds, das die MARKE beschreibt (BF-Leseansicht §2.3).
 * Der Snapshot trägt damit dasselbe, was die Leseansicht zeigt; die zweite
 * Hälfte des Doppelnetzes ist der Renderer (`shared/brandFoundation.ts`), der
 * dieselbe Frage noch einmal stellt — Snapshots von VOR dieser Zeile tragen
 * alles Bestätigte. Die Zusage stand seit BF1 im Typ
 * (`sensitivity`: „Was per Share-Link und Export standardmässig NICHT
 * reist"), gelesen hat sie hier niemand: ein Schnappschuss trug bis dahin die
 * NAMEN der Wettbewerber samt notierter Schwäche in einen dreissig Tage lang
 * öffentlich abrufbaren Link. Begründung und Fail-closed-Regel stehen in
 * `shared/brandSharing.ts`.
 *
 * BEFUNDE reisen weiterhin GAR NICHT mit — auch keine der Art `market`. Das
 * ist keine Auslassung, sondern die Form dieses Snapshots: er zeigt die
 * bestätigte Marke, nicht die Arbeit daran. Ein Feld dafür gibt es in
 * `BrandShareSnapshot` nicht, und `tests/brandSharing.test.ts` nagelt das fest.
 *
 * ÜBERSPRUNGENE BAUSTEINE FEHLEN, ihre Daten bleiben aber liegen: die Kapitel
 * kommen aus der JOURNEY, nicht aus der Zeilenmenge.
 *
 * ── DER TOKEN EXISTIERT GENAU EINMAL ──────────────────────────────────────
 * 32 Zufallsbytes (256 Bit, Vorgabe ≥128), gespeichert wird nur sein
 * sha256-Hash. Er steht in dieser Antwort — danach nirgends mehr, auch nicht im
 * Log. Wer ihn verliert, veröffentlicht neu; das ist die ROTATION: neue Zeile,
 * alte widerrufen (nie dieselbe Zeile umschreiben, sonst hätte ein bereits
 * verschickter Link plötzlich einen anderen Inhalt).
 *
 * ── AUCH VOR DEM ABSCHLUSS ERLAUBT ────────────────────────────────────────
 * Es gibt bewusst keine Vollständigkeits-Bedingung (Plan §6). Ein Zwischenstand
 * zu teilen ist ein legitimer Arbeitsschritt — sichtbar wird ohnehin nur, was
 * bestätigt wurde.
 */

/** Standard-Ablauf 30 Tage (Plan §6). */
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * DIE RECHNUNG SELBST WOHNT IN `server/utils/brandSnapshot.ts` (Discover D1) —
 * Fassung, Deckel und Filter stehen dort, weil die VERÖFFENTLICHUNG dasselbe
 * Abbild einfriert. Zwei Kopien wären die Stelle, an der eines Tages der eine
 * Snapshot einen neuen Filter bekommt und der andere nicht — und der andere
 * ist der dauerhaft indexierbare.
 */

export default defineEventHandler(async (event): Promise<BrandSharePublishResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  await readValidatedBody(event, createBrandSharePublishSchema().parse)

  const stepRows = await loadStepRows(event, profileId)

  /**
   * DAS PRESET REIST MIT — OHNE DIE BEHALTENEN ENTWÜRFE (D8, §2.8/§1.11 b).
   *
   * Der Empfänger eines Links soll die visuelle Identität SEHEN (das ist der
   * halbe Grund, ihn zu verschicken); die KI-Entwürfe soll er nie sehen. Beides
   * hält `brandDesignSnapshotPreset` — und der Typ dahinter lässt das Feld gar
   * nicht erst zu, statt sich auf Disziplin zu verlassen.
   *
   * Ohne fertige Schicht 2 ist `preset` null, und der Snapshot bleibt inhaltlich
   * das, was er vor D8 war (nur mit `schemaVersion: 2`).
   */
  const { preset } = await loadBrandDesignPreset(event, profile, stepRows)
  const { snapshot, payload } = buildBrandSnapshot(profile, stepRows, {
    betaAccount,
    ...(preset ? { design: brandDesignSnapshotPreset(preset) } : {}),
  })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + SHARE_TTL_MS).toISOString()
  const token = randomBytes(32).toString('hex')

  const { tablesDB, databaseId } = brandDb(event)

  // ROTATION: erst die alten widerrufen, dann die neue anlegen. Andersherum
  // gäbe es einen Moment mit ZWEI gültigen Links, und der ältere wäre der, den
  // jemand gerade offen hat.
  const previous = await listActiveShares(event, profileId)
  for (const row of previous) {
    await tablesDB.updateRow({
      databaseId, tableId: BRAND_SHARES_TABLE, rowId: row.$id, data: { revokedAt: now.toISOString() },
    }).catch((error: unknown) => {
      logEvent('warn', 'brand.share_rotate_failed', {
        shareId: row.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  let shareId: string
  try {
    const created = await tablesDB.createRow({
      databaseId,
      tableId: BRAND_SHARES_TABLE,
      rowId: ID.unique(),
      data: {
        profileId,
        tokenHash: hashBrandShareToken(token),
        snapshot: payload,
        publishedAt: now.toISOString(),
        expiresAt,
      },
    })
    shareId = created.$id
  }
  catch (error) {
    throw toH3Error(error, 'Brand share could not be published')
  }

  await recordBrandEvent(event, {
    type: 'share.published',
    profileId,
    userId,
    // Umfang, nicht Inhalt.
    payload: { chapters: snapshot.chapters.length, bytes: payload.length },
  })

  return { shareId, token, publishedAt: now.toISOString(), expiresAt }
})
