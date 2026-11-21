/**
 * Der SOLL-STAND der Bühne: was `pnpm buehne up` über die zwei
 * Probe-Communities zusagt, und ob es nach einem Skript noch stimmt.
 *
 * ANLASS (2026-11-21, Issue „Bühne rot"): `courses/verify-pool-isolation`
 * stellte den Plan beider Communities am Ende auf „leer" statt auf den
 * vorgefundenen Stand. Das Skript selbst war grün, 40 Skripte später fehlten
 * einem Browser-Test die Menüpunkte „Feed", „Discussions" und „Events" — ohne
 * Plan gilt `basic`, und diese Produkte gibt es erst ab `personal`. Der rote
 * Test nannte also weder den Verursacher noch den Grund.
 *
 * DESHALB PRÜFT DER LÄUFER NACH JEDEM SKRIPT (`run.mjs`): weicht eine der zwei
 * Zeilen in `communities` vom Soll ab, ist DIESES Skript rot („Bühne
 * verändert: B plan (leer) statt pro"), auch wenn alle seine Prüfungen
 * bestanden haben — dieselbe Idee wie das Nachzählen bei branding.supply.
 * Danach stellt der Läufer die Felder zurück und wartet, bis der
 * Platform-Server den Stand neu gelesen hat; die folgenden Skripte sehen
 * wieder die zugesagte Bühne. `pnpm buehne e2e` prüft dasselbe einmal VOR den
 * Browser-Tests (dort ohne Rot: der Verursacher ist dann nicht mehr bekannt).
 *
 * WAS ZUM SOLL GEHÖRT — nur, was `up` selbst setzt und worauf sich ein Skript
 * oder ein Browser-Test verlassen darf: `status` (active), `plan`,
 * `audience`, `openRegistration` und `suspension` (keine). Alles andere an
 * der Zeile (Name, Farben, Domain, Testphase) gehört dem Skript, das es
 * ändert, und seinem eigenen Aufräumen.
 *
 * EIN SKRIPT DARF DIESE FELDER ÄNDERN — es stellt sie im `finally` auf den
 * VORGEFUNDENEN Wert zurück, nie auf einen festen.
 */
import { isNotFound } from '../lib/probe-stage.mjs'

/** Felder der Zeile in `communities`, die zum Soll-Stand gehören. */
export const BASELINE_FIELDS = ['status', 'plan', 'audience', 'openRegistration', 'suspension']

/**
 * So lange hält der Platform-Server eine Auflösung fest (Microcache des
 * Resolvers, 30 s) — nach dem Zurückstellen eine Sekunde länger warten.
 */
export const RESOLVER_SETTLE_MS = 31_000

const blank = value => value === null || value === undefined || value === ''
const show = value => (blank(value) ? '(leer)' : String(value))

/**
 * Der Soll-Stand je Community aus dem Stand der Bühne. Rein.
 *
 * @param {{ communities?: Record<string, { communityId: string, plan?: string, audience?: string, openRegistration?: boolean }> } | null | undefined} state
 * @returns {Array<{ letter: string, communityId: string, soll: Record<string, unknown> }>}
 */
export function stageBaseline(state) {
  return Object.entries(state?.communities ?? {}).map(([letter, site]) => ({
    letter: letter.toUpperCase(),
    communityId: site.communityId,
    soll: {
      status: 'active',
      plan: site.plan ?? 'pro',
      audience: site.audience ?? 'public',
      openRegistration: site.openRegistration ?? true,
      suspension: '',
    },
  }))
}

/**
 * Welche Soll-Felder weichen in dieser Zeile ab? Rein. „Leer" ist leer, ob als
 * `null`, fehlend oder `''` — Appwrite gibt eine nie gesetzte Spalte als
 * `null` zurück, ein Skript setzt sie mit `''` zurück.
 *
 * @param {Record<string, unknown>} soll
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {Array<{ field: string, soll: unknown, ist: unknown }>}
 */
export function baselineDrift(soll, row) {
  const drift = []
  for (const field of BASELINE_FIELDS) {
    const ist = row?.[field]
    if (blank(soll[field]) && blank(ist)) continue
    if (soll[field] !== ist) drift.push({ field, soll: soll[field], ist })
  }
  return drift
}

/**
 * Eine Abweichung als Wort für Tabelle und Protokoll. Rein, ohne Ids.
 *
 * @param {string} letter
 * @param {{ field: string, soll: unknown, ist: unknown }} entry
 */
export function driftText(letter, entry) {
  return `${letter} ${entry.field} ${show(entry.ist)} statt ${show(entry.soll)}`
}

/**
 * Liest beide Zeilen und vergleicht sie mit dem Soll. Mit `repair` (Standard)
 * werden abweichende Felder zurückgestellt — nur diese, nichts sonst.
 *
 * Eine FEHLENDE Zeile ist eine Abweichung (nicht reparierbar). Ein Lesefehler
 * ist keine: er steht in `unreadable`, damit eine Störung der Datenbank nicht
 * dem Skript angelastet wird, das gerade lief.
 *
 * @param {{
 *   control: { getRow: Function, updateRow: Function },
 *   databaseId: string,
 *   state: Parameters<typeof stageBaseline>[0],
 *   repair?: boolean,
 * }} input
 * @returns {Promise<{ drift: string[], repaired: boolean, unreadable: string[] }>}
 */
export async function checkStageBaseline({ control, databaseId, state, repair = true }) {
  /** @type {string[]} */
  const drift = []
  /** @type {string[]} */
  const unreadable = []
  let repaired = false
  for (const { letter, communityId, soll } of stageBaseline(state)) {
    let row
    try {
      row = await control.getRow(databaseId, 'communities', communityId)
    }
    catch (error) {
      if (isNotFound(error)) drift.push(`${letter} fehlt`)
      else unreadable.push(letter)
      continue
    }
    const entries = baselineDrift(soll, row)
    if (!entries.length) continue
    drift.push(...entries.map(entry => driftText(letter, entry)))
    if (!repair) continue
    try {
      await control.updateRow(databaseId, 'communities', communityId, Object.fromEntries(entries.map(entry => [entry.field, entry.soll])))
      repaired = true
    }
    catch {
      unreadable.push(`${letter} (zurückstellen)`)
    }
  }
  return { drift, repaired, unreadable }
}
