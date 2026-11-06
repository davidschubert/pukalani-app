import type { H3Event } from 'h3'
import { brandDesignPresetFromSlots } from '../../shared/brandDesignValues'
import { BRAND_DESIGN_STEP_KEYS } from '../../shared/slotRegistry'
import type { BrandDesignPreset } from '../../shared/types/brand'
import { listBrandMarkDrafts } from './brandMarkDrafts'
import {
  type BrandProfileRow,
  type BrandStepRow,
  confirmedSlotValues,
} from './brandStore'

/**
 * DAS PRESET EINER MARKE — AUS DER WAHRHEIT, NICHT AUS EINEM SPIEGEL (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Paket D8).
 *
 * ── ES WIRD NIRGENDS GESPEICHERT ──────────────────────────────────────────
 * Dieselbe Regel wie bei `buildBrandFoundation`: das Preset entsteht bei jedem
 * Aufruf neu aus den bestätigten Slot-Werten der sechs Kapitel. Es gibt keine
 * Spalte, keinen Cache und kein `updatedAt` — was sich ändert, sind die Werte,
 * und die haben ihre eigene Zustandsmaschine. Die EINZIGE eingefrorene Fassung
 * ist die im Share-Snapshot, und die ist ein ABBILD.
 *
 * ── SECHS ABGENOMMENE KAPITEL, SONST `null` ───────────────────────────────
 * Die Schranke fällt nicht Stück für Stück. Ein Preset, das nach dem dritten
 * Kapitel schon eine Farbwelt zeigt, wäre für jeden Leser (Kapitel 10,
 * Ergebnis-Board, Snapshot) eine visuelle Identität, die noch niemand
 * abgenommen hat — und der Mensch sähe im Handbuch eine Marke, über die er
 * gerade noch verhandelt. Gefragt wird der GESPEICHERTE Zustand der Zeile
 * (`state === 'done'`), also genau das, was die Abnahme setzt.
 *
 * Zusätzlich muss `buildBrandDesign` selbst zustimmen (vollständige DNA,
 * gültige Hex, bekanntes Paar, Hierarchie, Zeichen-Richtung, Tempo): sechs
 * abgenommene Kapitel mit einem von Hand kaputt korrigierten Wert ergeben
 * weiterhin `null` statt eines halben Presets.
 *
 * ── DIE ENTWÜRFE SIND PRIVAT, ABER SIE ZÄHLEN ─────────────────────────────
 * `keptDrafts` trägt die Zeilen-Ids der BEHALTENEN KI-Entwürfe (D5c). Sie
 * stehen nur im privaten Preset; der Snapshot-Schreiber nimmt dieselbe
 * Funktion und wirft sie über `brandDesignSnapshotPreset` heraus (§1.11 b).
 * Das Laden ist FAIL-SOFT: fehlt die Tabelle (Stand vor brand-023) oder
 * antwortet sie nicht, steht dort eine leere Liste — ein Kapitel 10, das
 * wegen einer Nebenauskunft ganz ausfällt, wäre die teurere Antwort.
 */

export interface BrandDesignPresetResult {
  /** `null`, solange nicht alle sechs Kapitel abgenommen sind (s. Kopf). */
  preset: BrandDesignPreset | null
  /** Wie viele der sechs Kapitel stehen — für die ruhige Sperr-Fläche. */
  done: number
  total: number
}

/**
 * DER STAND DER SCHICHT — das jüngste `$updatedAt` der sechs Kapitel-Zeilen,
 * leer, wenn es keine gibt.
 *
 * Bewusst NICHT `profile.lastActivityAt`: das bewegt sich bei jedem Tippfehler
 * in der Tagline, und ein Board, das dann ein neues Datum trägt, behauptet eine
 * Entscheidung, die niemand getroffen hat.
 */
export function brandDesignStand(stepRows: readonly BrandStepRow[]): string {
  const stamps = stepRows
    .filter(row => (BRAND_DESIGN_STEP_KEYS as readonly string[]).includes(row.stepKey))
    .map(row => row.$updatedAt)
    .filter((stamp): stamp is string => typeof stamp === 'string' && stamp.length > 0)
  return stamps.length ? stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest)) : ''
}

/** Wie viele der sechs Kapitel abgenommen sind — ohne Werte zu lesen. */
export function brandDesignStepsDone(stepRows: readonly BrandStepRow[]): number {
  const byStepKey = new Map(stepRows.map(row => [row.stepKey, row]))
  return BRAND_DESIGN_STEP_KEYS.filter(stepKey => byStepKey.get(stepKey)?.state === 'done').length
}

/**
 * Die bestätigten Werte der sechs Kapitel als EINE Karte — Slot-Id → Wert.
 *
 * Der `stepKey` der Zeile wird bewusst nicht geprüft: welchem Kapitel ein Slot
 * gehört, sagt die Registry, nicht die Zeile (dieselbe Regel wie in
 * `travellingValues` der Foundation).
 */
export function brandDesignConfirmedValues(
  stepRows: readonly BrandStepRow[],
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const row of stepRows) {
    if (!(BRAND_DESIGN_STEP_KEYS as readonly string[]).includes(row.stepKey)) continue
    for (const slot of confirmedSlotValues(row)) values[slot.slotId] = slot.value
  }
  return values
}

/**
 * DAS PRESET DIESER MARKE. `stepRows` kommt herein, weil jeder Aufrufer sie
 * ohnehin geladen hat — ein eigener Ladeweg hier wäre eine zweite Wahrheit
 * über dieselben Zeilen (dieselbe Begründung wie bei `buildBrandSnapshot`).
 */
export async function loadBrandDesignPreset(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
): Promise<BrandDesignPresetResult> {
  const done = brandDesignStepsDone(stepRows)
  const total = BRAND_DESIGN_STEP_KEYS.length
  if (done < total) return { preset: null, done, total }

  const keptDrafts = await listBrandMarkDrafts(event, profile.$id)
    .then(entries => entries.filter(entry => entry.kept).map(entry => entry.id))
    .catch(() => [] as string[])

  const preset = brandDesignPresetFromSlots({
    title: profile.title ?? '',
    contentLocale: profile.contentLocale,
    values: brandDesignConfirmedValues(stepRows),
    keptDrafts,
  })
  return { preset, done, total }
}
