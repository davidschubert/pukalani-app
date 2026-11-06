import type { H3Event } from 'h3'
import { resolveDerivationAccess } from '../../shared/brandDerivation'
import { brandDesignSnapshotPreset } from '../../shared/brandDesignValues'
import type { BrandFoundationView } from '../../shared/brandFoundation'
import { resolveBrandJourney } from '../../shared/brandJourney'
import {
  BRAND_KIT_BUILDERS,
  type BrandKitBuildInput,
  brandKitAvailability,
  brandKitBundleName,
  brandKitDownloadName,
  brandKitSlug,
} from '../../shared/brandKitFiles'
import { renderBrandMarkFiles } from '../../shared/brandKitMarks'
import type { BrandKitZipEntry } from '../../shared/brandKitZip'
import { BRAND_KIT_ZIP_WEIGHT } from '../../shared/brandKitLimits'
import type { BrandDesignSnapshotPreset } from '../../shared/types/brand'
import type { BrandJourneyStep } from '../../shared/brandJourney'
import { isBrandDesignStep, isBrandKitStep } from '../../shared/slotRegistry'
import type {
  BrandKitFile,
  BrandKitManifestBundle,
  BrandKitManifestChapter,
  BrandKitManifestFile,
  BrandKitManifestMark,
  BrandKitMarkFile,
} from '../../shared/types/brandKit'
import { BRAND_KIT_FILES } from '../../shared/brandKitFiles'
import { brandDesignStand, loadBrandDesignPreset } from './brandDesignPreset'
import { buildBrandFoundationView } from './brandFoundationView'
import {
  type BrandProfileRow,
  type BrandStepRow,
  loadOwnedProfile,
  loadStepRows,
  profileFacts,
  requireProfileIdParam,
  toStepFacts,
} from './brandStore'

/**
 * DER GEMEINSAME ZUGANG ZUM KIT (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.9/§2.12, Paket K2) — EINE Stelle für Besitz, Schranke und Preset.
 *
 * ── DREI TÜREN, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  1. `requireBrandAccess` — das Zugangs-Gate jeder privaten `/api/brand/**`-
 *     Route (404 ohne Beta-Zulassung, Datentür-Muster). Es liefert nebenbei
 *     die BETA-TATSACHE, die die Schranke unten braucht.
 *  2. `loadOwnedProfile` — fremdes oder erfundenes Branding ⇒ 404 (§2.12
 *     Nr. 3). Der Download ist eine EIGENTÜMER-Route.
 *  3. `resolveDerivationAccess` — die Ableitung muss freigeschaltet sein
 *     (K1). Hier steht bewusst 403 mit `data.code` und nicht 404: die
 *     Oberfläche soll die Schranke ZEIGEN können („Teil der Ableitung"), und
 *     dass es diese Marke gibt, weiß der Eigentümer ohnehin.
 *
 * Die Reihenfolge ist der Punkt: die Schranke wird erst gefragt, wenn Besitz
 * belegt ist. Andersherum verriete eine 403 an einer fremden Marke, dass es
 * sie gibt.
 *
 * ── DAS PRESET KOMMT ALS SNAPSHOT ────────────────────────────────────────
 * `brandDesignSnapshotPreset` nimmt die behaltenen KI-Entwürfe heraus
 * (§1.11 b: Entwürfe reisen nie in Snapshot, Share — oder Kit). Für die
 * Tokens spielt das keine Rolle, für `marks/*.svg` in K6 sehr wohl; die
 * Entscheidung gehört an diese eine Stelle und nicht in jeden Erzeuger.
 *
 * ── GERECHNET, NIE GESPEICHERT ───────────────────────────────────────────
 * Es gibt keine Spalte, keinen Cache, keine Datei (§2.6). Zwei Abfragen
 * (Profil, Kapitel-Zeilen), der Rest ist reine Rechnung.
 */
export interface BrandKitContext {
  profile: BrandProfileRow
  stepRows: BrandStepRow[]
  /** `null`, solange Schicht 2 nicht abgenommen ist. */
  preset: BrandDesignSnapshotPreset | null
  /**
   * DER STAND DES KITS — jüngstes `$updatedAt` ALLER beteiligten Kapitel
   * (Foundation, Design, Kit), nicht nur der Design-Kapitel.
   *
   * K3 hat den Design-Stand geerbt und damit einen ehrlichen Fehler
   * mitgenommen: eine Marke OHNE Preset trug gar keinen Stand — `brand.md`
   * und `brand.json` gab es trotzdem, und sie änderten sich mit jedem
   * Foundation-Kapitel. Ein Kit ohne Datum an einer Datei, die sich täglich
   * ändert, ist die schlechtere Auskunft als ein Datum ohne Preset. Der
   * DESIGN-Stand bleibt daneben unverändert (`designStand`): er beantwortet
   * eine andere Frage („wann wurde die visuelle Identität zuletzt bewegt")
   * und steht an Board und Kapitel 10.
   */
  stand: string
  /** Nur die Kapitel der Foundation — für die Auskunft auf der Lieferseite. */
  foundationStand: string
  /** Nur die sechs Design-Kapitel; '' ohne Preset (unverändert seit K3). */
  designStand: string
  /** Der Dateinamens-Stamm dieser Marke (Allowlist `[a-z0-9-]`). */
  slug: string
  /**
   * DIE ZEICHEN-DATEIEN (K6) — leer ohne Preset.
   *
   * Sie stehen IM KONTEXT und nicht in jedem Leser, weil drei sie brauchen
   * (Manifest, Zeichen-Route, Bündel) und sie aus derselben einen Rechnung
   * kommen müssen: fiele die Liste je Leser anders aus, böte das Manifest
   * einen Namen an, den die Route nicht kennt.
   */
  marks: BrandKitMarkFile[]
  /** Die Journey dieser Marke — sie sagt den Zustand der drei Kit-Kapitel. */
  journey: readonly BrandJourneyStep[]
  /**
   * DIE LESEANSICHT DES FUNDAMENTS (K3) — dieselbe, die das Book rendert.
   *
   * Sie steht IM Kontext und nicht in jedem Erzeuger, weil sie einmal je
   * Abruf gebaut wird und drei Dateien sie lesen (`brand.md`, `brand.json`
   * und, über die Verfügbarkeit, die README).
   */
  view: BrandFoundationView
  userId: string
}

export function brandDerivationLocked(): Error {
  return createError({
    status: 403,
    statusText: 'Derivation is locked',
    data: { code: 'derivation_locked' },
  })
}

export async function loadBrandKitContext(event: H3Event): Promise<BrandKitContext> {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const access = resolveDerivationAccess({
    betaAccount,
    unlockedAt: profile.derivationUnlockedAt,
    via: profile.derivationUnlockedVia,
  })
  if (!access.unlocked) throw brandDerivationLocked()

  const stepRows = await loadStepRows(event, profile.$id)
  const { preset } = await loadBrandDesignPreset(event, profile, stepRows)
  const snapshotPreset = preset ? brandDesignSnapshotPreset(preset) : null
  const journey = resolveBrandJourney(
    profileFacts(profile, betaAccount),
    toStepFacts(stepRows),
  )
  const slug = brandKitSlug(profile.title ?? '')

  return {
    profile,
    stepRows,
    preset: snapshotPreset,
    journey,
    marks: renderBrandMarkFiles(snapshotPreset, { title: profile.title ?? '', slug }),
    /*
     * DIESELBE ANSICHT WIE DAS BOOK (K4) — ein Funktionsaufruf, kein Zwilling.
     * Bis K3 stand die Rechnung hier ein zweites Mal und übersprang die
     * Kapitel der dritten Schicht ANDERS als die Route; die Begründung dafür
     * steht jetzt im Kopf von `brandFoundationView.ts`. `derivationUnlocked`
     * ist an dieser Stelle immer `true`: ohne Freischaltung ist der Kontext
     * oben schon mit 403 abgebrochen.
     */
    view: buildBrandFoundationView({
      profile,
      stepRows,
      journey,
      design: snapshotPreset,
      derivationUnlocked: true,
    }),
    stand: brandKitStand(stepRows),
    foundationStand: brandFoundationStand(stepRows),
    // Ohne Preset kein DESIGN-Stand — dieselbe Regel wie am Ergebnis-Board
    // (D8): ein Datum an einer Sperr-Fläche behauptete eine Entscheidung.
    designStand: preset ? brandDesignStand(stepRows) : '',
    slug,
    userId,
  }
}

/**
 * DER STAND DES KITS — jüngstes `$updatedAt` ALLER Kapitel-Zeilen der Marke.
 *
 * ── WARUM „ALLE" UND NICHT „DIE BETEILIGTEN" ─────────────────────────────
 * Weil jede Zeile beteiligt IST: `brand.md` liest die Foundation, `tokens.json`
 * das Design, die README beides, und die drei Kit-Kapitel kuratieren, was in
 * `brand.json` reist. Eine Auswahl zu treffen hiesse, je Datei einen eigenen
 * Stand zu führen — und der Dateiname trägt genau einen.
 *
 * ── ER ERSETZT `brandDesignStand` NICHT ──────────────────────────────────
 * Jener beantwortet „wann wurde die visuelle Identität zuletzt bewegt" und
 * steht am Ergebnis-Board und in Kapitel 10. Er bleibt unverändert; seine
 * Aufrufer merken von dieser Funktion nichts.
 */
export function brandKitStand(stepRows: readonly BrandStepRow[]): string {
  return latestStamp(stepRows)
}

/** Der Stand der Foundation allein — alles, was weder Design noch Kit ist. */
export function brandFoundationStand(stepRows: readonly BrandStepRow[]): string {
  return latestStamp(stepRows.filter(row =>
    !isBrandDesignStep(row.stepKey) && !isBrandKitStep(row.stepKey)))
}

function latestStamp(rows: readonly BrandStepRow[]): string {
  const stamps = rows
    .map(row => row.$updatedAt)
    .filter((stamp): stamp is string => typeof stamp === 'string' && stamp.length > 0)
  return stamps.length ? stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest)) : ''
}

/** Die Eingabe der puren Erzeuger aus dem geladenen Zustand. */
export function brandKitBuildInput(context: BrandKitContext): BrandKitBuildInput {
  return {
    preset: context.preset,
    view: context.view,
    title: context.profile.title ?? '',
    stand: context.stand,
    locale: context.profile.contentLocale,
  }
}

/**
 * DER INHALT EINER DATEI — `null`, wenn ihr Erzeuger fehlt oder das Preset
 * fehlt. Die ROUTE entscheidet, was daraus wird (409 mit Grund); hier steht
 * nur die Rechnung, damit das Manifest dieselbe benutzen kann.
 */
export function brandKitFileContent(file: BrandKitFile, context: BrandKitContext): string | null {
  const availability = brandKitAvailability(file, !!context.preset)
  if (!availability.available) return null
  const builder = BRAND_KIT_BUILDERS[file.id]
  return builder ? builder(brandKitBuildInput(context)) : null
}

/**
 * DAS MANIFEST — je Datei Name, Verfügbarkeit, Grund und Größe.
 *
 * Die Größe wird GERECHNET, indem die Datei gebaut wird. Das ist Absicht: eine
 * geschätzte Zahl neben einem Download-Knopf ist eine Zahl, die irgendwann
 * nicht mehr stimmt, und die drei Dateien dieses Pakets sind reine
 * String-Arbeit über einem schon geladenen Preset. Sobald in K6 das Bündel
 * dazukommt, bekommt es seine eigene Antwort — es ist die einzige teure
 * Rechnung (§2.11).
 */
export function brandKitManifestFiles(context: BrandKitContext): BrandKitManifestFile[] {
  return BRAND_KIT_FILES.map((file) => {
    const availability = brandKitAvailability(file, !!context.preset)
    const filename = brandKitDownloadName(file, context.slug, context.stand)
    if (!availability.available) {
      return { id: file.id, filename, available: false, reason: availability.reason }
    }
    const content = brandKitFileContent(file, context)
    if (content === null) {
      // Kann nach `brandKitAvailability` nicht mehr vorkommen — steht trotzdem
      // da, damit ein künftiger Erzeuger, der `null` liefert, nicht eine
      // Datei mit 0 Bytes verspricht.
      return { id: file.id, filename, available: false, reason: 'not_built_yet' }
    }
    return {
      id: file.id,
      filename,
      available: true,
      bytes: Buffer.byteLength(content, 'utf8'),
    }
  })
}

/**
 * DIE ZEICHEN-DATEIEN IM MANIFEST — Name, Setzung, Variante, Bytes UND SVG.
 *
 * Warum ausgerechnet sie ihren Inhalt mitbringen, steht am Typ
 * (`BrandKitManifestMark`): acht Kacheln je Seitenaufruf einzeln zu holen
 * kostete acht der sechzig Tages-Abrufe. Der Server zahlt nichts dafür — die
 * Setzungen stehen ohnehin schon im Kontext.
 */
export function brandKitManifestMarks(context: BrandKitContext): BrandKitManifestMark[] {
  return context.marks.map(mark => ({
    id: mark.id,
    filename: mark.filename,
    setting: mark.setting,
    variant: mark.variant,
    ...(mark.primary === undefined ? {} : { primary: mark.primary }),
    bytes: Buffer.byteLength(mark.svg, 'utf8'),
    svg: mark.svg,
  }))
}

/**
 * DAS BÜNDEL IM MANIFEST — OHNE `bytes` (§2.11).
 *
 * `missing` zählt, wie viele KACHELN der Lieferseite heute leer bleiben: jede
 * nicht verfügbare Registry-Datei einzeln, die Zeichen als EINE Einheit (sie
 * sind eine Kachel, nicht acht). Damit kann die Seite „drei Kacheln fehlen"
 * sagen, ohne die Verfügbarkeits-Rechnung ein zweites Mal anzustellen.
 */
export function brandKitManifestBundle(
  context: BrandKitContext,
  files: readonly BrandKitManifestFile[],
): BrandKitManifestBundle {
  const missingFiles = files.filter(file => !file.available).length
  return {
    filename: brandKitBundleName(context.slug, context.stand),
    available: true,
    weight: BRAND_KIT_ZIP_WEIGHT,
    missing: missingFiles + (context.marks.length === 0 ? 1 : 0),
  }
}

/**
 * DER ZUSTAND DER DREI KIT-KAPITEL — aus der JOURNEY, nicht aus den Zeilen.
 *
 * Dieselbe Rechnung wie die Leiste und die Werkstatt (`resolveBrandJourney`):
 * eine zweite Zustandslogik neben der puren Regel wäre genau der Zwilling, der
 * irgendwann eine andere Antwort gibt als der Rail daneben.
 */
export function brandKitManifestChapters(context: BrandKitContext): BrandKitManifestChapter[] {
  return context.journey
    .filter(entry => isBrandKitStep(entry.stepKey))
    .map(entry => ({ stepKey: entry.stepKey as BrandKitManifestChapter['stepKey'], state: entry.state }))
}

/**
 * DIE EINTRÄGE DES BÜNDELS — Registry-Dateien mit ihrem BÜNDEL-Namen plus
 * `marks/*.svg` (§2.6).
 *
 * Im Zip heisst eine Datei, wie sie heisst (`tokens.json`), nicht wie ihr
 * Download (`kailua-coffee-co-tokens-2026-09-09.json`): der Marken-Stamm steht
 * am ZIP, und ihn in jedem Eintrag zu wiederholen machte aus einem entpackten
 * Ordner eine Liste von Wiederholungen.
 *
 * Nicht verfügbare Dateien fehlen einfach — die README sagt, welche und warum.
 */
export function brandKitZipEntries(context: BrandKitContext): BrandKitZipEntry[] {
  const entries: BrandKitZipEntry[] = []
  for (const file of BRAND_KIT_FILES) {
    const content = brandKitFileContent(file, context)
    if (content === null) continue
    entries.push({ path: file.filename, content })
  }
  for (const mark of context.marks) {
    entries.push({ path: mark.id, content: mark.svg })
  }
  return entries
}
