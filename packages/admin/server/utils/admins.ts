import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Wirft, wenn die Aktion den LETZTEN Admin entfernen/aussperren würde.
 * Es muss immer mindestens ein Admin übrig bleiben.
 *
 * GEZÄHLT WERDEN NUR AKTIVE KONTEN (BE-021, 2026-11-16): ein gesperrtes Konto
 * mit dem Label `admin` kann sich nicht anmelden und rettet niemanden. Bis
 * dahin zählte es mit — zwei Admins, einer davon gesperrt, und der andere
 * ließ sich trotzdem aussperren oder herabstufen.
 */
export async function assertNotLastAdmin(event: H3Event, targetUserId: string): Promise<void> {
  const admin = createAdminClient(event)

  // Server-seitig nach Label UND Status filtern statt alle User zu
  // paginieren: total > 1 heißt, es bliebe in jedem Fall ein aktiver Admin
  // übrig. Nur beim einzigen aktiven Admin muss geprüft werden, ob er das
  // Ziel der Aktion ist.
  const res = await admin.users.list({
    queries: [Query.contains('labels', 'admin'), Query.equal('status', true), Query.limit(2)],
  })
  if (res.total > 1) return

  const only = res.users[0]
  if (only && only.$id === targetUserId) {
    throw createError({ status: 400, statusText: 'At least one admin must remain', data: { code: 'last_admin' } })
  }
}
