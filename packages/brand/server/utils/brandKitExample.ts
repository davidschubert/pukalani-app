import { buildBrandFoundation } from '../../shared/brandFoundation'
import {
  BRAND_KIT_BUILDERS,
  BRAND_KIT_FILES,
  brandKitAvailability,
  brandKitSlug,
  type BrandKitBuildInput,
} from '../../shared/brandKitFiles'
import { renderBrandMarkFiles } from '../../shared/brandKitMarks'
import { buildBrandKitZip, type BrandKitZipEntry } from '../../shared/brandKitZip'
import { KAILUA_COFFEE_EXAMPLE } from '../../shared/examples/kailuaCoffee'
import { KAILUA_COFFEE_DESIGN } from '../../shared/examples/kailuaCoffeeDesign'
import { KAILUA_COFFEE_KIT } from '../../shared/examples/kailuaCoffeeKit'
import type { BrandKitFile } from '../../shared/types/brandKit'

/**
 * DAS ÖFFENTLICHE BEISPIEL-KIT (Paket K7, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7 „Beispiel", §2.9).
 *
 * ── DIESELBEN ERZEUGER WIE DAS KIT EINER ECHTEN MARKE ───────────────────
 * Die Dateien kommen aus `BRAND_KIT_BUILDERS`, die Zeichen aus
 * `renderBrandMarkFiles`, das Bündel aus `buildBrandKitZip` — dieselben
 * Funktionen wie hinter `/api/brand/profiles/:id/kit/*`. Nur die EINGABE ist
 * eine andere: der eingefrorene Snapshot statt der Zeilen einer Marke. Ein
 * Beispiel aus einem zweiten Renderer wäre Werbung, kein Beweis.
 *
 * ── EINMAL GERECHNET, DANN GEHALTEN ──────────────────────────────────────
 * Die Eingabe ist konstant, also auch das Ergebnis: es wird beim ersten Abruf
 * gerechnet und im Prozess gehalten. Darum braucht die öffentliche Route keinen
 * Tages-Deckel wie das Kit einer Marke — es gibt nichts, was ein Abruf teuer
 * machen könnte.
 *
 * ── KEIN KONTO, KEINE ZEILE ─────────────────────────────────────────────
 * Hier wird nichts gelesen außer zwei Konstanten im Code. Der Snapshot
 * `KAILUA_COFFEE_EXAMPLE` enthält nur, was reist (sein Kopf und
 * `kailuaCoffeeExample.test.ts` sagen das zu).
 */
export interface BrandKitExample {
  title: string
  slug: string
  stand: string
  files: ReadonlyMap<BrandKitFile['id'], string>
  zipEntries: readonly BrandKitZipEntry[]
  zip: Uint8Array
}

let cached: BrandKitExample | null = null

export function brandKitExample(): BrandKitExample {
  if (cached) return cached

  const title = KAILUA_COFFEE_EXAMPLE.title
  const slug = brandKitSlug(title)
  const stand = KAILUA_COFFEE_KIT.stand
  const preset = KAILUA_COFFEE_DESIGN ?? null
  const input: BrandKitBuildInput = {
    preset,
    view: buildBrandFoundation(KAILUA_COFFEE_EXAMPLE),
    title,
    stand,
    locale: KAILUA_COFFEE_EXAMPLE.contentLocale,
  }

  const files = new Map<BrandKitFile['id'], string>()
  const zipEntries: BrandKitZipEntry[] = []
  for (const file of BRAND_KIT_FILES) {
    if (!brandKitAvailability(file, !!preset).available) continue
    const content = BRAND_KIT_BUILDERS[file.id]?.(input) ?? null
    if (content === null) continue
    files.set(file.id, content)
    zipEntries.push({ path: file.filename, content })
  }
  for (const mark of renderBrandMarkFiles(preset, { title, slug })) {
    zipEntries.push({ path: mark.id, content: mark.svg })
  }

  cached = { title, slug, stand, files, zipEntries, zip: buildBrandKitZip(zipEntries, stand) }
  return cached
}

/** Für die öffentliche Antwort: eine Stunde, auch in geteilten Zwischenspeichern (§2.9). */
export const BRAND_KIT_EXAMPLE_CACHE_CONTROL = 'public, max-age=3600'
