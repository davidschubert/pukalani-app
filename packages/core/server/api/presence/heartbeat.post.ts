import type { H3Event } from 'h3'
import { presenceHeartbeatSchema } from '../../../schemas/presence'
import { type PresencePrioritySnapshot, yieldsToForeignVisiblePresence } from '../../../shared/presencePriority'

/**
 * Presence-Heartbeat (SSR-Cookie-Architektur): Der Browser kann seine eigene
 * Presence NICHT selbst schreiben — der Web-SDK-Client hat keine Session
 * (httpOnly-Cookie authentifiziert weder den Realtime-WS noch PUT /presences),
 * daher upserten wir sie hier server-seitig mit dem Admin-Client. Der Reader
 * (usePresence) liest weiterhin direkt über die Presences-API (Cookie-GET).
 *
 * Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
 * typing. Kurze Expiry (`PRESENCE_TTL_MS`, 240 s) → verlässt der User die Seite,
 * räumt der Server ab.
 */
// Server-Expiry > Frische-Fenster (180s): eine „frische" Presence darf nie schon
// abgelaufen sein, sonst würde sie zwischen zwei gedrosselten Heartbeats server-
// seitig verschwinden (Flackern). 240s hält Puffer über die Drossel-Lücke.
const PRESENCE_TTL_MS = 240_000

/**
 * Der aktuell gespeicherte Zustand der eigenen Presence — für die Vorfahrts-
 * Regel (shared/presencePriority.ts). NUR im away-Fall gerufen, also ~1×/Minute
 * je verstecktem Tab; der 20-s-Normalfall bekommt KEIN zusätzliches GET.
 *
 * Beide Ausgänge enden in `null` und damit im Alt-Verhalten (normal schreiben):
 * „gibt es noch nicht" (404) und „Abfrage fehlgeschlagen". Das ist Absicht —
 * die Dämpfung ist eine Zusatzschicht, sie darf nie der Grund sein, dass ein
 * Heartbeat ausfällt.
 */
async function readPresenceSnapshot(event: H3Event, userId: string): Promise<PresencePrioritySnapshot | null> {
  try {
    const { presences } = createAdminClient(event)
    const existing = await presences.get({ presenceId: userId })
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>
    return {
      updatedAt: existing.$updatedAt,
      away: metadata.away === true,
      tenantId: typeof metadata.tenantId === 'string' ? metadata.tenantId : '',
    }
  }
  catch {
    return null
  }
}

/** „Gehört das Konto zur Community dieses Hosts?" — still, mit Rückfall aufs Label (s. u.). */
async function belongsToThisCommunity(event: H3Event, communityId: string, user: { $id: string, labels?: string[] }): Promise<boolean> {
  try {
    return await resolveCommunityMembership(event)
  }
  catch {
    return Boolean(communityId)
      && (user.labels ?? []).includes(communityId)
      && !communityAccessRecentlyDenied(communityId, user.$id)
  }
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  // Zod statt loser typeof-Checks: metadata ist für alle eingeloggten User
  // lesbar — Längen-Caps verhindern Bloat/Appwrite-Limit-Fehler (422 bei Junk).
  const body = await readValidatedBody(event, presenceHeartbeatSchema.parse)

  const prefs = user.prefs as { avatarUrl?: string } | undefined
  const metadata: Record<string, unknown> = { userName: user.name }
  // Mandant (Audit B1): im Pool teilen sich ALLE Communities ein Appwrite-
  // Projekt und damit EINEN Presences-Raum. Ohne dieses Merkmal kann kein Leser
  // fremde Anwesende aussortieren. NIE aus dem Body (der Zod-Parse verwirft
  // unbekannte Felder ohnehin) — nur aus dem serverseitig aufgelösten Kontext.
  // Silo/kein Tenant: NICHT setzen — die Leser erwarten dort „ohne tenantId".
  const tenant = useTenant(event)

  /**
   * ANWESENHEIT NUR FÜR MITGLIEDER (BT1 e, 2026-11-18).
   *
   * Ein Konto im Pool ist auf JEDEM Community-Host angemeldet. Diese Route
   * schreibt mit dem Admin-Client und gibt der Zeile das Lese-Publikum der
   * Community des Hosts — ohne die Frage „gehört das Konto hierher?" stünde
   * ein fremdes Konto mit Namen und Bild in der Anwesenheit einer Community,
   * der es nicht angehört. Dieselbe Frage wie beim Übersetzen
   * (`resolveCommunityMembership`), aber STILL: der Takt läuft alle 20 s in
   * jedem offenen Reiter, ein 403 wäre dort nur Lärm. Kein Mitglied ⇒ nichts
   * lesen, nichts schreiben, `ok`. Außerhalb des Pools (Einzel-Instanz,
   * Kontroll-Host) ist jedes angemeldete Konto Mitglied.
   *
   * KANN DIE FRAGE NICHT BEANTWORTET WERDEN (das Control Plane antwortet
   * nicht), entscheidet das Label am Konto: wer es trägt und nicht gerade
   * entfernt wurde, bleibt sichtbar — eine Störung soll nicht die Anwesenheit
   * aller Mitglieder löschen.
   */
  if (tenant?.mode === 'pool' && !(await belongsToThisCommunity(event, tenant.communityId ?? '', user))) {
    return { ok: true }
  }

  if (tenant?.mode === 'pool') metadata.tenantId = tenant.tenantId
  if (typeof prefs?.avatarUrl === 'string' && prefs.avatarUrl) metadata.avatarUrl = prefs.avatarUrl
  if (body.scope) metadata.scope = body.scope
  if (body.action) metadata.action = body.action
  if (body.typing === true) metadata.typing = true
  if (body.page) metadata.page = body.page
  if (body.replyingTo) metadata.replyingTo = body.replyingTo
  if (body.near) metadata.near = body.near
  if (body.away === true) metadata.away = true

  // VORFAHRT (2026-08-18): ein Tab im Hintergrund überschreibt keine frische,
  // SICHTBARE Presence eines ANDEREN Mandanten. Zwei Dashboards verschiedener
  // Communities sind zwei Origins — im Browser koordinieren sie sich nie, hier
  // auf dem Server ist die Frage in einem GET beantwortet. Begründung jeder
  // Bedingung: shared/presencePriority.ts.
  if (body.away === true) {
    const existing = await readPresenceSnapshot(event, user.$id)
    const writerTenantId = tenant?.mode === 'pool' ? tenant.tenantId : ''
    // Nicht schreiben — und auch nichts verlängern: der sichtbare Tab des
    // anderen Mandanten erneuert die Expiry ohnehin alle 20 s selbst.
    if (yieldsToForeignVisiblePresence(existing, writerTenantId, Date.now())) return { ok: true }
  }

  try {
    const { presences } = createAdminClient(event)
    await presences.upsert({
      presenceId: user.$id,
      userId: user.$id,
      status: 'online',
      // DIE GRENZE (A4, seit 2026-07-29 — Weg (c) aus
      // docs/archiv/PRESENCE-GRENZE.md, David entschieden):
      // Pool → read("label:<communityId>"), Silo/Single-Tenant → read("users") wie
      // bisher. Vorher stand hier im Pool `read("users")` — im geteilten
      // Projekt also JEDER eingeloggte User ALLER Communities: wer
      // presences.list() von Hand gegen Appwrite rief, sah userId + userName +
      // avatarUrl aller Online-User aller Mandanten (Audit B1). Der
      // tenantId-Filter (presenceFilter.ts / usePresence.ts) war dagegen nur
      // ANWENDUNGSLOGIK; jetzt zieht Appwrite die Grenze selbst und der Filter
      // ist das Netz darunter (Gürtel und Hosenträger — NICHT entfernen).
      //
      // `tenantRowPermissionsFor` ist bewusst DERSELBE Bauer wie für alle
      // anderen Zeilen (tenantDb.create) — keine Presence-Sonderregel. Das
      // Label trägt, wer MITGLIED ist (A5: server/middleware/06.community-label.ts).
      // Pool ohne communityId (Datenfehler) → kein read: fail-closed.
      //
      // update/delete für den Owner: Appwrites Realtime-Presence-Handler
      // (Presences/State.php) UPDATEt die Presence beim WS-Verarbeiten — ohne
      // diese Rechte wirft er „No permissions for action 'update'" und der
      // Realtime-Pfad bricht ab (nur read würde die Owner-Defaults verdrängen).
      permissions: tenantRowPermissionsFor(tenant, { read: 'members', ownerUserId: user.$id }),
      expiresAt: new Date(Date.now() + PRESENCE_TTL_MS).toISOString(),
      metadata,
    })
  }
  catch (error) {
    // best effort — Presence ist eine flüchtige Zusatzschicht, kein Kernpfad.
    // AUSSER beim Scope-Fehler: der ist ein Konfigurationsfehler des Keys und
    // wird EINMAL gemeldet (AH-1 live erwischt — sonst „0 online" ohne Spur).
    warnPresenceScopeMissingOnce(error, 'presence.heartbeat')
  }

  return { ok: true }
})
