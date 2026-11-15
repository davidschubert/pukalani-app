import type { H3Event } from 'h3'
import { AI_DISABLED_CODE } from '../../shared/aiProviderRouting'
import type { AiRunContext } from './aiLog'
import { aiLogLine } from './aiLog'

/**
 * EIN RIEGEL VOR JEDEM BEZAHLTEN KI-AUFRUF (P17, BE-006, 2026-11-15).
 *
 * Bis hierher fragte jede Route ihren Abschalter SELBST — und zwei Check-Wege
 * von brand vergassen es, ausgerechnet der öffentliche ohne Anmeldung. Jetzt
 * melden Layer ihren Schalter hier an (Nitro-Plugin, Muster wie
 * `registerUserDataContributor`), und jeder der fünf Transporte fragt den
 * Riegel VOR dem Senden. Damit erreicht ein Schalter auch künftige Routen und
 * die Core-Konsumenten (Übersetzung, Moderations-Hilfe), ohne dass jemand
 * daran denken muss. Eine App ohne den Layer lädt dessen Plugin nicht — dann
 * ist das Register leer und der Riegel offen.
 *
 * FAIL-CLOSED: ein Schalter, der wirft, zählt als AUS. Gelesen wird je
 * Ereignis EINMAL (ein Lauf mit mehreren Modell-Aufrufen fragt die Zeile
 * sonst mehrfach) — eine neue Anfrage liest neu.
 *
 * Eine Route, die VOR einer Buchung fragen muss (damit bei „aus" nichts
 * gebucht wird), ruft `aiSwitchedOn` selbst; der Transport fragt trotzdem.
 */

export type AiKillSwitch = (event: H3Event) => Promise<boolean> | boolean

const switches = new Map<string, AiKillSwitch>()
const decided = new WeakMap<H3Event, Promise<boolean>>()

/** Gleicher Name ersetzt (HMR, Doppel-Plugin) — kein Doppeleintrag. */
export function registerAiKillSwitch(name: string, isEnabled: AiKillSwitch): void {
  switches.set(name, isEnabled)
}

/** Nur für Beweise/Tests: das Register leeren. */
export function clearAiKillSwitches(): void {
  switches.clear()
}

async function readAll(event: H3Event): Promise<boolean> {
  const answers = await Promise.all([...switches.values()].map(async (isEnabled) => {
    try {
      return (await isEnabled(event)) === true
    }
    catch {
      return false
    }
  }))
  return answers.every(Boolean)
}

/** `true`, wenn ALLE angemeldeten Schalter Ja sagen; ohne Schalter ⇒ `true`. */
export function aiSwitchedOn(event: H3Event): Promise<boolean> {
  if (switches.size === 0) return Promise.resolve(true)
  // Ohne Objekt kein Merken (WeakMap) — dann eben jedes Mal lesen.
  if (!event || typeof event !== 'object') return readAll(event)
  const known = decided.get(event)
  if (known) return known
  const answer = readAll(event)
  decided.set(event, answer)
  return answer
}

/** 503 `ai_disabled`, wenn ein Schalter „aus" sagt — eine Zeile mit Kennungen, kein Inhalt. */
export async function assertAiSwitchedOn(event: H3Event, ctx?: AiRunContext): Promise<void> {
  if (await aiSwitchedOn(event)) return
  console.error(aiLogLine(ctx?.label ?? 'core', 'KI abgeschaltet', { model: ctx?.model, run: ctx?.run }))
  throw createError({ status: 503, statusText: 'AI switched off', data: { code: AI_DISABLED_CODE } })
}
