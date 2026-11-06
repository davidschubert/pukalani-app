import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { ID, Query } from 'node-appwrite'
import { type BrandInviteFacts, decideBrandInvite } from '../../shared/brandInvite'
import { BRAND_INVITES_TABLE, brandDb, isAppwriteNotFound } from './brandStore'

/**
 * DER EINLADUNGS-CODE: nachschlagen und beurteilen — die ENTSCHEIDUNG selbst
 * liegt pur in `shared/brandInvite.ts`.
 *
 * ── GESPEICHERT WIRD NUR DER HASH ─────────────────────────────────────────
 * `brand_invites.codeHash` ist sha256 des rohen Codes (M9-Muster von
 * `workspace_invites`/`community_invites`). Der rohe Code existiert genau
 * zweimal: in der Versand-Mail und in der Ausgabe von `pnpm brand:invite`. Wer
 * die Datenbank liest, kann keine Einladung benutzen.
 *
 * ── EIN LESEFEHLER IST EIN NEIN ───────────────────────────────────────────
 * Fehlende Tabelle (vor der Migration), Netzfehler, kaputte Zeile: alles ergibt
 * `null` bzw. eine Ablehnung. Fail-closed, weil die Gegenrichtung — bei Störung
 * durchlassen — aus einem Zugangsschutz eine Hintertür machte.
 */

export type BrandInviteRow = Models.Row & BrandInviteFacts & {
  createdByUserId?: string
  redeemedByUserId?: string | null
}

/** sha256-hex des rohen Codes. Der Code selbst wird NIE geloggt. */
export function hashBrandInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/** `null` = kein Treffer ODER nicht lesbar — der Aufrufer unterscheidet das nicht. */
export async function findBrandInviteByCode(event: H3Event, code: string): Promise<BrandInviteRow | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandInviteRow>({
      databaseId,
      tableId: BRAND_INVITES_TABLE,
      // `uq_code_hash` ist UNIQUE — mehr als eine Zeile kann es nicht geben.
      queries: [Query.equal('codeHash', hashBrandInviteCode(code)), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.invite_lookup_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

export interface BrandInviteEvaluation {
  valid: boolean
  invite: BrandInviteRow | null
}

/**
 * Der EINE Weg von „hier ist ein Code" zu „ja/nein" — benutzt von der
 * Vorab-Prüfung, der Einlösung UND dem Signup-Provider. Drei Aufrufer, EINE
 * Regel: sonst hätte der Signup irgendwann andere Grenzen als die Route.
 *
 * `emailLower` bleibt `null`, solange die Adresse unbekannt ist (Prüfung vor
 * dem Login) — die Bindung wird dann übersprungen, nie geraten.
 */
export async function evaluateBrandInvite(
  event: H3Event,
  code: string,
  emailLower: string | null,
): Promise<BrandInviteEvaluation> {
  const mode = await readBrandAdmissionMode(event)
  const invite = await findBrandInviteByCode(event, code)
  const decision = decideBrandInvite({
    mode,
    invite: invite
      ? {
          emailLower: invite.emailLower,
          expiresAt: invite.expiresAt,
          revokedAt: invite.revokedAt ?? null,
          redeemedAt: invite.redeemedAt ?? null,
        }
      : null,
    now: new Date().toISOString(),
    emailLower,
  })
  return { valid: decision.valid, invite: decision.valid ? invite : null }
}

/**
 * ── EINEN CODE AUSGEBEN ───────────────────────────────────────────────────
 *
 * Die Erzeugung, die es bisher NUR als Skript gab (`packages/brand/scripts/
 * invite.mjs`, Plan §3e „Operator-Werkzeug Phase 1 als SKRIPTE"). Sie zieht
 * hier herüber, weil die Warteliste im Dashboard denselben Code braucht — und
 * ZWEI Erzeugungen wären zwei Formate, von denen eines irgendwann nicht mehr
 * einlösbar ist. Das Skript bleibt trotzdem: es ist der Weg für einen
 * Nachschlag an eine Adresse, die gar nicht auf der Liste steht.
 *
 * IDENTISCH ZUM SKRIPT, und das ist der Punkt: 32 Zufalls-Bytes als hex,
 * gespeichert wird ausschliesslich `sha256` davon (`codeHash`), gebunden an
 * `emailLower`, Frist als ISO-Zeichenkette. Wer hier ein Format „vereinfacht",
 * bricht keine Kompilierung, sondern eine Einlösung.
 *
 * DER ROHE CODE WIRD ZURÜCKGEGEBEN, NICHT GELOGGT. Er existiert danach genau
 * einmal — in der Mail. Der Aufrufer trägt die Pflicht, ihn nirgendwo sonst
 * hinzuschreiben; deshalb steht in dieser Funktion selbst KEIN `logEvent`.
 */
export const BRAND_INVITE_DEFAULT_DAYS = 30

export interface CreatedBrandInvite {
  inviteId: string
  code: string
  expiresAt: string
}

export async function createBrandInviteForEmail(
  event: H3Event,
  input: { emailLower: string, createdByUserId: string, days?: number },
): Promise<CreatedBrandInvite> {
  const { tablesDB, databaseId } = brandDb(event)
  const days = input.days ?? BRAND_INVITE_DEFAULT_DAYS
  const code = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const row = await tablesDB.createRow({
    databaseId,
    tableId: BRAND_INVITES_TABLE,
    rowId: ID.unique(),
    // Alle Spalten explizit (CLAUDE.md): eine neue Spalte in brand_invites soll
    // hier eine Entscheidung erzwingen und nicht still auf ihrem Default landen.
    data: {
      emailLower: input.emailLower,
      codeHash: hashBrandInviteCode(code),
      createdByUserId: input.createdByUserId,
      expiresAt,
    },
  })

  return { inviteId: row.$id, code, expiresAt }
}

/**
 * DEN GERADE ERZEUGTEN CODE WIEDER WEGNEHMEN — die Rücknahme für den Fall,
 * dass die Mail NICHT rausging.
 *
 * GELÖSCHT statt `revokedAt` gestempelt, und das ist der Unterschied zu
 * `pnpm brand:revoke`: dort wird eine Einladung zurückgezogen, die jemand in
 * der Hand hat (die Zeile ist Protokoll). Hier hat sie NIE jemand gesehen —
 * ohne Mail gibt es den Klartext nicht mehr, die Zeile wäre ein Eintrag über
 * ein Ereignis, das nicht stattgefunden hat.
 *
 * FAIL-SOFT: schlägt auch das Löschen fehl, bleibt eine unbenutzbare Zeile
 * stehen (niemand kennt ihren Code) — das ist folgenlos und darf die
 * Fehlermeldung an den Betreiber nicht überdecken.
 */
export async function deleteBrandInvite(event: H3Event, inviteId: string): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_INVITES_TABLE, rowId: inviteId })
  }
  catch (error) {
    logEvent('warn', 'brand.invite_cleanup_failed', {
      inviteId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
