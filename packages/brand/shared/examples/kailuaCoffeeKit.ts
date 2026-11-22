import type { BrandKitFileId } from '../types/brandKit'

/**
 * DAS ÖFFENTLICHE BEISPIEL-KIT VON „KAILUA COFFEE CO." — die Eckdaten
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.7 „Beispiel", §2.9, Paket K7).
 *
 * Hier stehen nur die LEICHTEN Angaben, die auch die Seite braucht (welche
 * Anatomie den Abschnitt „Das Kit" zeigt, welche Kacheln es gibt). Gerechnet
 * wird das Kit auf dem Server (`server/utils/brandKitExample.ts`): das Bündel
 * zieht `fflate` mit, und das gehört nicht in den Browser.
 *
 * ── WARUM DER STAND FEST IST ─────────────────────────────────────────────
 * Das Beispiel ist eingefroren (Snapshot `KAILUA_COFFEE_EXAMPLE` +
 * `KAILUA_COFFEE_DESIGN`). Ein „jetzt" als Stand gäbe jeden Tag einen anderen
 * Dateinamen und andere Zip-Bytes für denselben Inhalt — und damit einen
 * öffentlichen Zwischenspeicher, der nie trifft.
 */
export const KAILUA_COFFEE_KIT = {
  /** Die Anatomie, die den Abschnitt zeigt (`/discover/<slug>`). */
  discoverSlug: 'kailua-coffee-co',
  /** Stand des Beispiels — Tag der Freigabe des Kit-Prototyps. */
  stand: '2026-09-09T12:00:00.000Z',
} as const

/**
 * DIE VIER KACHELN DER ANATOMIE — Reihenfolge = Anzeige.
 * `file` ist eine Registry-Id (`BRAND_KIT_FILES`) oder `bundle` für das ganze
 * Kit; die Zeichen gibt es nur im Bündel (die öffentliche Route liefert keine
 * Einzel-SVGs — eine Liste weniger, die offen im Netz steht).
 */
export const KAILUA_COFFEE_KIT_TILES: readonly { key: string, file: BrandKitFileId | 'bundle', icon: string }[] = [
  { key: 'context', file: 'brand.md', icon: 'i-ph-file-text' },
  { key: 'tokens', file: 'tokens.json', icon: 'i-ph-palette' },
  { key: 'css', file: 'tokens.css', icon: 'i-ph-brackets-curly' },
  { key: 'marks', file: 'bundle', icon: 'i-ph-shapes' },
]

/** Die öffentliche Adresse einer Kachel. */
export function kailuaCoffeeKitHref(file: BrandKitFileId | 'bundle'): string {
  return file === 'bundle' ? '/api/brand/example/kit.zip' : `/api/brand/example/kit/${file}`
}
