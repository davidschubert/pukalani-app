import type { H3Event } from 'h3'

/**
 * WELCHE ABLAGEN DIE SPEICHER-SEITE LÖSCHEN DARF — eine ERLAUBNISLISTE
 * (BE-021, 2026-11-16), keine Sperrliste mehr.
 *
 * Bis hierher war JEDE Ablage des Projekts löschbar außer `gdpr-exports`: ein
 * neuer Bucket (eine Migration, ein Layer, ein Kunde) war damit vom ersten
 * Tag an in der Konsole leerzuräumen, ohne dass das jemand entschieden hatte.
 * Jetzt ist es umgekehrt: löschbar ist nur, was hier steht, und eine neue
 * Ablage ist zuerst nur-lesend.
 *
 * Die Liste ist genau das, was die Seite bis heute zum Löschen angeboten hat
 * — alle Buckets, die eine Migration anlegt, außer `gdpr-exports`:
 *   avatars (system-032, Id aus der Config), fonts (system-012),
 *   favicons (system-037), media (media-001), event-covers (events-002),
 *   brand-drafts (brand-023), brand-inspiration (brand-024),
 *   runner-files (runner-001), ticket-files (tickets-003).
 * `gdpr-exports` bleibt draußen: die Kopien vor einer Löschung haben ihre
 * eigene Frist (30 Tage, stündlicher Lauf) und ihre eigene Seite samt
 * Protokoll (`/api/admin/gdpr-exports`).
 *
 * Server (`storage/[bucket]/[fileId].delete.ts`) und Seite
 * (`storage.get.ts` → `readOnly`) fragen BEIDE diese Funktion — die Seite
 * bietet also nichts an, was der Server ablehnt.
 */
const DELETABLE_BUCKETS: ReadonlySet<string> = new Set([
  'avatars',
  'fonts',
  'favicons',
  'media',
  'event-covers',
  'brand-drafts',
  'brand-inspiration',
  'runner-files',
  'ticket-files',
])

/** Nie löschbar über die Speicher-Seite, auch wenn eine Config die Id anders setzt. */
const NEVER_DELETABLE: ReadonlySet<string> = new Set(['gdpr-exports'])

export function isDeletableBucket(bucketId: string, config: { avatarsBucket?: string, gdprBucket?: string } = {}): boolean {
  if (NEVER_DELETABLE.has(bucketId)) return false
  if (config.gdprBucket && bucketId === config.gdprBucket) return false
  if (config.avatarsBucket && bucketId === config.avatarsBucket) return true
  return DELETABLE_BUCKETS.has(bucketId)
}

/** Dieselbe Frage mit den Bucket-Ids aus der Laufzeit-Config der App. */
export function bucketDeletable(event: H3Event, bucketId: string): boolean {
  const config = useRuntimeConfig(event)
  return isDeletableBucket(bucketId, {
    avatarsBucket: config.public.appwriteAvatarsBucket,
    gdprBucket: config.public.appwriteGdprBucket,
  })
}
