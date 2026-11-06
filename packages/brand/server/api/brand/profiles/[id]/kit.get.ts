import type { BrandKitManifest } from '../../../../../shared/types/brandKit'
import {
  brandKitManifestBundle,
  brandKitManifestChapters,
  brandKitManifestFiles,
  brandKitManifestMarks,
  loadBrandKitContext,
} from '../../../../utils/brandKit'

/**
 * DAS MANIFEST DER LIEFERSEITE (`GET /api/brand/profiles/:id/kit`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.9, Paket K2).
 *
 * ── SEIT K6 NENNT ES AUCH ZEICHEN, BÜNDEL UND KAPITEL ───────────────────
 * `marks` ist die je Setzung gerechnete Menge (leer ohne Preset), `bundle` der
 * Name des Zips mit seinem Eimer-Gewicht und der Zahl der fehlenden Kacheln,
 * `chapters` der Zustand der drei Kit-Kapitel aus DERSELBEN Journey wie der
 * Rail. Das Bündel trägt bewusst KEINE Bytes: es zu wiegen hiesse, es zu
 * packen, und das ist die einzige teure Rechnung des Produkts (§2.11).
 *
 * ── ES IST DIE EHRLICHE LISTE, NICHT DIE SCHÖNE ──────────────────────────
 * Es nennt ALLE sieben Dateien des Konzepts (§2.6), auch die, die es noch
 * nicht gibt — mit `available: false` und Grund. Ein Manifest, das nur zeigt,
 * was heute fertig ist, sähe wie ein vollständiges Kit aus drei Dateien aus;
 * mit dem Grund daneben sieht ein Mensch, ob eine Datei FEHLT (`design_missing`
 * — dann kann er etwas tun) oder ob sie NOCH NICHT GEBAUT ist
 * (`not_built_yet` — dann können nur wir etwas tun).
 *
 * ── ES ZÄHLT NICHT AUF DEN DOWNLOAD-EIMER (§2.11) ────────────────────────
 * Es ist die Seite, nicht die Datei. Zählte es mit, verbrauchte schon das
 * Neuladen der Lieferseite das Kontingent.
 *
 * ── ES SCHREIBT NICHTS UND RUFT NICHTS AN ────────────────────────────────
 * Zwei Abfragen, dann reine Rechnung — dieselbe Form wie das Ergebnis-Board
 * (D8). Kein Ereignis: `kit.viewed` gehört zur SEITE und kommt mit ihr (K6);
 * hier wäre es eine Kennzahl über Datenabrufe.
 *
 * Zugang, Besitz und Schranke stehen in `loadBrandKitContext` (fremd ⇒ 404,
 * ohne Freischaltung ⇒ 403 `derivation_locked`).
 */
export default defineEventHandler(async (event): Promise<BrandKitManifest> => {
  const context = await loadBrandKitContext(event)

  // Das Manifest ist so privat wie die Dateien selbst — es nennt Marke, Stand
  // und Dateinamen. Kein Zwischenspeicher, nirgends (§2.9).
  setHeader(event, 'Cache-Control', 'private, no-store')

  const files = brandKitManifestFiles(context)

  return {
    profileId: context.profile.$id,
    title: context.profile.title ?? '',
    stand: context.stand,
    foundationStand: context.foundationStand,
    designStand: context.designStand,
    designReady: !!context.preset,
    contentLocale: context.profile.contentLocale,
    files,
    marks: brandKitManifestMarks(context),
    bundle: brandKitManifestBundle(context, files),
    chapters: brandKitManifestChapters(context),
  }
})
