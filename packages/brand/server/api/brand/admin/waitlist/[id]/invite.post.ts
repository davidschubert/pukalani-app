import { decideBrandWaitlistInvite, normalizeBrandWaitlistStatus } from '../../../../../../shared/brandWaitlistAdmin'
import type { BrandWaitlistInviteResponse } from '../../../../../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, brandDb } from '../../../../../utils/brandStore'
import { createBrandInviteForEmail, deleteBrandInvite } from '../../../../../utils/brandInvites'
import { sendBrandInviteMail } from '../../../../../utils/brandInviteMail'
import {
  brandWaitlistUnavailable,
  loadBrandWaitlistRow,
  requireBrandWaitlistId,
  requireBrandWaitlistOperator,
} from '../../../../../utils/brandWaitlistAdmin'

/**
 * BETREIBER: EINEN BETA-CODE AN EINE WARTELISTE-ZEILE SCHICKEN (`users.manage`).
 *
 * Der Vorgang, der bisher `pnpm brand:invite <adresse>` hieß — jetzt mit der
 * Liste davor, aus der die Adresse kommt. Die ERZEUGUNG ist dieselbe
 * (`createBrandInviteForEmail`, hergeleitet aus dem Skript): 32 Zufalls-Bytes,
 * gespeichert nur als sha256, gebunden an `emailLower`, 30 Tage gültig. Ein
 * zweites Code-Format hätte irgendwann eine nicht einlösbare Einladung ergeben.
 *
 * ── DIE REIHENFOLGE, UND WARUM SIE SO HERUM IST ───────────────────────────
 * Code anlegen → Mail schicken → Status stempeln.
 *
 * Erst stempeln und dann schicken wäre die falsche Richtung: bei einem
 * SMTP-Ausfall stünde „eingeladen" an einer Zeile, deren Mensch nie etwas
 * bekommen hat — und die Fläche gibt einer `invited`-Zeile bewusst keinen
 * zweiten Code (`decideBrandWaitlistInvite`). Der Mensch wäre damit still
 * ausgeschlossen. Deshalb: kein Code ohne Mail — schlägt sie fehl, wird die
 * frisch angelegte Einladung GELÖSCHT (nicht `revokedAt` gestempelt: ihren
 * Klartext hat nie jemand gesehen, sie ist kein Protokoll) und der Status
 * bleibt `confirmed`. Der Betreiber sieht 503 `invite_mail_failed` und kann es
 * schlicht noch einmal versuchen.
 *
 * Der SELTENE Rest bleibt: Mail raus, Stempel scheitert. Dann steht der Code
 * draußen und die Zeile weiter auf `confirmed` — ein zweiter Klick schickte
 * eine zweite Einladung. Das ist bewusst so gelassen: die Alternative (Code
 * nach zugestellter Mail zurücknehmen) macht aus einem Anzeigefehler einen
 * echten Ausschluss. Das Log sagt es deutlich (`brand.waitlist_invite_unstamped`).
 *
 * ── ZWEI ABSAGEN, ZWEIMAL 409 ─────────────────────────────────────────────
 * `not_confirmed` (noch kein Klick aus der Mail) und `already_invited` (Code ist
 * längst raus) sind zwei verschiedene Sätze auf der Seite — die Regel dafür ist
 * pur und getestet (`shared/brandWaitlistAdmin.ts`), diese Route setzt sie nur
 * durch.
 *
 * ── DER ROHE CODE STEHT IN DER MAIL UND SONST NIRGENDS ────────────────────
 * Nicht in der Antwort, nicht im Log — auch nicht gekürzt. Genau deshalb kann
 * die Fläche keinen „Code noch einmal anzeigen"-Knopf haben: wir kennen ihn
 * selbst nicht mehr.
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistInviteResponse> => {
  const user = requireBrandWaitlistOperator(event)
  const id = requireBrandWaitlistId(event)

  const row = await loadBrandWaitlistRow(event, id)
  const decision = decideBrandWaitlistInvite(normalizeBrandWaitlistStatus(row.status))
  if (!decision.ok) {
    throw createError({
      status: 409,
      statusText: decision.code === 'already_invited' ? 'Already invited' : 'Not confirmed yet',
      data: { code: decision.code },
    })
  }

  let invite
  try {
    invite = await createBrandInviteForEmail(event, {
      emailLower: row.emailLower,
      createdByUserId: user.$id,
    })
  }
  catch (error) {
    throw brandWaitlistUnavailable(error, { rowId: row.$id, stage: 'invite_create' })
  }

  const sent = await sendBrandInviteMail(event, {
    to: row.email || row.emailLower,
    code: invite.code,
    locale: row.locale || 'en',
  })
  if (!sent) {
    await deleteBrandInvite(event, invite.inviteId)
    logEvent('warn', 'brand.waitlist_invite_mail_failed', { rowId: row.$id })
    throw createError({
      status: 503,
      statusText: 'Invite mail failed',
      data: { code: 'invite_mail_failed' },
    })
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      rowId: row.$id,
      // NUR der Status. Notiz, Name und Herkunft gehören dem Betreiber bzw. dem
      // Formular — eine Aktions-Route, die daran rührt, überschreibt Arbeit.
      data: { status: 'invited' },
    })
  }
  catch (error) {
    // Der Code ist draußen (s. Kopf) — das gehört ins Log, nicht in einen
    // Rollback.
    logEvent('error', 'brand.waitlist_invite_unstamped', {
      rowId: row.$id,
      inviteId: invite.inviteId,
    })
    throw brandWaitlistUnavailable(error, { rowId: row.$id, stage: 'invite_stamp' })
  }

  logEvent('info', 'brand.waitlist_invited', {
    rowId: row.$id,
    source: row.source,
    locale: row.locale,
    expiresAt: invite.expiresAt,
  })
  return { ok: true, status: 'invited' }
})
