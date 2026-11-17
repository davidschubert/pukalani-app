import type { H3Event } from 'h3'

/**
 * WELCHE ABLAGEN DIE SPEICHER-SEITE LÖSCHEN DARF — eine ERLAUBNISLISTE
 * (BE-021, 2026-11-16), seit BP1 (c) (2026-11-17) gekürzt auf EINE Ablage:
 * die Profilbilder (`avatars`, bzw. die Id aus `appwriteAvatarsBucket`).
 *
 * WARUM NUR DIE: an den Dateien aller anderen Ablagen hängt eine Zeile oder
 * ein Verweis — Schriften (`custom_fonts`), Favicons (Datei = Community),
 * Medien (`media.fileId`), Event-Cover (`events.coverFileId`),
 * Marken-Entwürfe und -Inspiration, Runner- und Ticket-Dateien. Wer dort über diese
 * Seite eine Datei löscht, lässt die Zeile ohne Datei zurück (kaputtes Bild, toter
 * Download). Diese Dateien löscht weiter der Weg des jeweiligen Produkts, der
 * die Zeile mitnimmt; auf der Speicher-Seite sind sie nur zum Ansehen.
 * Profilbilder hängen an keiner Zeile, sondern an `prefs.avatarUrl` des
 * Kontos — die Seite erkennt verwaiste Dateien selbst und warnt vor dem
 * Löschen einer verknüpften (storage.get.ts).
 *
 * Eine NEUE Ablage ist zuerst nur-lesend. `gdpr-exports` bleibt immer
 * draußen, auch unter einer anderen Id aus der Config: die Kopien vor einer
 * Löschung haben ihre eigene Frist (30 Tage, stündlicher Lauf) und ihre
 * eigene Seite samt Protokoll (`/api/admin/gdpr-exports`).
 *
 * Server (`storage/[bucket]/[fileId].delete.ts`) und Seite
 * (`storage.get.ts` → `readOnly`) fragen BEIDE diese Funktion — die Seite
 * bietet also nichts an, was der Server ablehnt.
 */
const DELETABLE_BUCKETS: ReadonlySet<string> = new Set(['avatars'])

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
