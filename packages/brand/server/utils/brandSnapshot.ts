import { BRAND_DESIGN_PRESET_VERSION } from '../../shared/brandDesign'
import { BRAND_DIRECTIONS_VERSION, brandDirectionById } from '../../shared/brandDirections'
import { resolveBrandJourney } from '../../shared/brandJourney'
import { brandShareableSlotValues, isBrandChapterShareable } from '../../shared/brandSharing'
import type { BrandDesignSnapshotPreset, BrandShareSnapshot } from '../../shared/types/brand'
import {
  type BrandProfileRow,
  type BrandStepRow,
  confirmedSlotValues,
  profileFacts,
  toStepFacts,
  toStoryView,
} from './brandStore'

/**
 * DAS EINGEFRORENE ABBILD EINER MARKE — EINE Stelle, zwei Aufrufer.
 *
 * ── WARUM ES DIESE DATEI GIBT (Discover D1) ───────────────────────────────
 * Der Share-Link (`share.post.ts`) und die Veröffentlichung
 * (`publication.post.ts`) frieren DENSELBEN Stand ein: Brand Story plus die
 * bestätigten Kapitel, gefiltert nach `sensitivity`. Zwei Kopien dieser
 * Rechnung wären genau die Sorte Doppelung, die man erst bemerkt, wenn eine
 * davon einen neuen Filter bekommt und die andere nicht — und die andere ist
 * hier die ÖFFENTLICHE, dauerhaft indexierbare. Der Preis für ein Versehen
 * wäre also nicht ein Anzeigefehler, sondern eine Wettbewerber-Notiz auf einer
 * Seite, die Google liest.
 *
 * Die vollständige Begründung, WAS hineindarf und was nicht, steht weiterhin
 * im Kopf von `share.post.ts` (Audit 3, MV1 M5, Paket G1/G4). Hier steht die
 * Rechnung.
 *
 * ── ES WIRD NICHTS GELESEN, WAS DER AUFRUFER NICHT SCHON HAT ─────────────
 * Profil und Baustein-Zeilen kommen als Argumente herein: beide Aufrufer haben
 * sie ohnehin geladen (Besitz-Prüfung bzw. Voraussetzungs-Prüfung), und ein
 * eigener Ladeweg hier wäre eine zweite Wahrheit über dieselben Zeilen.
 */

/**
 * Fassung der Snapshot-FORM — steigt, wenn sich der Aufbau ändert. Ein alter
 * Link muss danach weiter lesbar bleiben; deshalb steht die Zahl IM Snapshot
 * und nicht in einer Spalte, die man beim Lesen erst nachschlagen müsste.
 */
export const BRAND_SNAPSHOT_SCHEMA_VERSION = 2

/** Zod-Zusage aus Schema-Anhang §4 — dieselbe Grenze für beide Aufrufer. */
export const BRAND_SNAPSHOT_MAX = 400_000

/**
 * DIE GEWÄHLTE RICHTUNG (Paket G4). DIE EINE WAHRHEIT IST DER BESTÄTIGTE
 * SLOT-WERT `result.direction` — nicht `brand_profiles.designPresetId` (die
 * zwei Spalten stehen seit Migration 001 in der Tabelle und werden bewusst
 * nicht geschrieben). Eingefroren wird nur eine Id, die der Katalog KENNT: ein
 * durchgereichter Freitext aus einem von Hand korrigierten Feld hätte in einem
 * öffentlich abrufbaren Abbild nichts verloren.
 */
function directionPreset(resultRow: BrandStepRow | undefined): { presetId: string, presetVersion: string } {
  const chosen = resultRow
    ? confirmedSlotValues(resultRow).find(slot => slot.slotId === 'result.direction')?.value ?? ''
    : ''
  const direction = brandDirectionById(chosen.trim())
  return direction
    ? { presetId: direction.id, presetVersion: String(BRAND_DIRECTIONS_VERSION) }
    : { presetId: '', presetVersion: '' }
}

export interface BrandSnapshotResult {
  snapshot: BrandShareSnapshot
  /** Die serialisierte Form — genau das, was in die Spalte geht. */
  payload: string
}

/**
 * Baut das Abbild und WIRFT bei Überlänge (413 `snapshot_too_large`).
 *
 * Der Deckel gehört hierher und nicht in die Routen: er ist eine Eigenschaft
 * der Spalte, nicht der Handlung, und zwei Routen mit zwei Zahlen wären eine
 * Grenze, die je nach Knopf woanders liegt.
 */
export interface BrandSnapshotOptions {
  /**
   * DAS EINGEFRORENE PRESET (Brand Design D8, §2.8) — OHNE die behaltenen
   * KI-Entwürfe.
   *
   * Der TYP lässt `keptDrafts` nicht zu (`BrandDesignSnapshotPreset`), also
   * kann kein Aufrufer sie versehentlich durchreichen; wer ein volles Preset
   * hat, schickt es durch `brandDesignSnapshotPreset()`.
   *
   * Es kommt als OPTION herein und wird hier nicht selbst geladen: von den
   * zwei Aufrufern reicht es heute nur das TEILEN durch. Die VERÖFFENTLICHUNG
   * (Discover) lässt es bewusst weg — sie ist dauerhaft und indexierbar, und
   * ob eine Marke ihre volle visuelle Identität so ins Netz stellt, ist eine
   * eigene Entscheidung und nicht der Nebeneffekt eines Formatschritts.
   */
  readonly design?: BrandDesignSnapshotPreset
  /**
   * DIE BETA-TATSACHE DES EIGENTÜMERS (K1, §2.8) — ohne Vorgabewert und
   * deshalb Pflicht: das Abbild entsteht aus der JOURNEY, und die kennt seit
   * Schicht 3 eine Sperre, die nicht an der Zeile hängt. Ein stiller Default
   * hätte einem Beta-Konto die Kapitel der dritten Schicht aus dem geteilten
   * Abbild genommen, ohne dass irgendwo etwas rot wird.
   */
  readonly betaAccount: boolean
}

export function buildBrandSnapshot(
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  options: BrandSnapshotOptions,
): BrandSnapshotResult {
  const journey = resolveBrandJourney(profileFacts(profile, options.betaAccount), toStepFacts(stepRows))
  const byStepKey = new Map(stepRows.map(row => [row.stepKey, row]))

  const snapshot: BrandShareSnapshot = {
    schemaVersion: BRAND_SNAPSHOT_SCHEMA_VERSION,
    title: profile.title ?? '',
    contentLocale: profile.contentLocale,
    story: toStoryView(profile).body,
    /**
     * DIE KAPITEL — OHNE DIE SECHS VON BRAND DESIGN (D9, Davids Entscheidung
     * 2026-09-09). Ihr Ergebnis reist als `design`-Preset; roh reisen sie
     * NIE, auch nicht ohne Preset. Die ganze Begründung steht bei
     * `isBrandChapterShareable` — hier steht nur der Aufruf, damit es die eine
     * Stelle bleibt.
     *
     * `state !== 'skipped'` daneben ist die ANDERE Frage: „liegt das Kapitel
     * überhaupt auf dem Weg dieser Marke?".
     */
    chapters: journey
      .filter(step => step.state !== 'skipped' && isBrandChapterShareable(step.stepKey))
      .map((step) => {
        const row = byStepKey.get(step.stepKey)
        return {
          stepKey: step.stepKey,
          slots: row ? brandShareableSlotValues(confirmedSlotValues(row)) : [],
        }
      })
      // Ein Kapitel ohne bestätigten Inhalt hat nichts zu zeigen — es fehlt,
      // statt als leere Überschrift dazustehen.
      .filter(chapter => chapter.slots.length > 0),
    ...directionPreset(byStepKey.get('result')),
    /**
     * MIT PRESET GEWINNT DAS PRESET (D8, §2.8): `presetId` wird
     * `design:<profileId>` und `presetVersion` die Fassung des PRESET-FORMATS.
     *
     * Die Felder tragen bis dahin die gewählte RICHTUNG — und das ist kein
     * Namenskonflikt, sondern eine Reihenfolge: die Richtung war die Ansage,
     * das Preset ist das Gebaute. Der Renderer der Share-Seite reicht
     * `presetId` als Richtung weiter; ein `design:…` kennt der Richtungs-
     * Katalog nicht, also fällt die Richtung dort still heraus — genau
     * richtig, denn Kapitel 10 zeigt dann das volle Ergebnis und nicht die
     * Ansage davor.
     */
    ...(options.design
      ? {
          design: options.design,
          presetId: `design:${profile.$id}`,
          presetVersion: String(BRAND_DESIGN_PRESET_VERSION),
        }
      : {}),
  }

  const payload = JSON.stringify(snapshot)
  if (payload.length > BRAND_SNAPSHOT_MAX) {
    throw createError({
      status: 413,
      statusText: 'Snapshot too large',
      data: { code: 'snapshot_too_large' },
    })
  }

  return { snapshot, payload }
}
