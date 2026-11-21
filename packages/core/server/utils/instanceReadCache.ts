import type { H3Event } from 'h3'

/**
 * Instanz-Lesungen kurz merken (Q12, PERF-005).
 *
 * Drei Lesungen liefen bei JEDEM Seitenaufruf, auch wenn alle anderen
 * Zwischenspeicher gefüllt waren: die Zeile `app_config/global`
 * (Produkt-Schalter, Wartung, Theme-Einstellungen), die eigenen Farbwelten
 * (`custom_themes`) und die eigenen Schriften (`custom_fonts`). Alle drei
 * gehören der INSTANZ, nicht einer Person und nicht einer Community — die
 * Mandanten-Werte (Vibe einer Community) setzt die Route erst NACH dem Lesen
 * darüber. Damit passen sie zur Regel des Microcache (nur personen-unabhängige
 * Werte).
 *
 * - Höchstens `INSTANCE_READ_TTL_MS` alt; gleichzeitige Lesungen teilen sich
 *   eine Abfrage; Fehler werden nicht gemerkt (der Aufrufer behält seinen
 *   Rückfall, z. B. `softFail`).
 * - Schlüssel: Projekt + Name (eine App fährt ein Projekt; der Name allein
 *   wäre bei einem zweiten Projekt im selben Prozess falsch).
 * - JEDER SCHREIBER räumt: `forgetInstanceRead('app_config')` nach
 *   `mutateAppConfig`, den Ticket-Einstellungen und dem Onboarding-Schalter;
 *   `'custom_themes'` / `'custom_fonts'` nach den Betreiber-Routen. Im selben
 *   Prozess gilt eine Änderung damit sofort; offene Browser bekommen sie wie
 *   bisher über die Live-Verbindung.
 * - Jeder Treffer ist eine Kopie — eine Route, die das Ergebnis verändert
 *   (Mandanten-Vibe), verändert nicht den Eintrag.
 */
export const INSTANCE_READ_TTL_MS = 15_000

export type InstanceReadName = 'app_config' | 'custom_themes' | 'custom_fonts'

interface Entry { value: unknown, expires: number }

const entries = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
let epoch = 0

function keyFor(event: H3Event | undefined, name: InstanceReadName): string {
  const config = useRuntimeConfig(event)
  return `${config.public.appwriteProjectId}:${name}`
}

export async function cachedInstanceRead<T>(event: H3Event | undefined, name: InstanceReadName, read: () => Promise<T>): Promise<T> {
  const key = keyFor(event, name)
  const hit = entries.get(key)
  if (hit && hit.expires > Date.now()) return structuredClone(hit.value as T)
  let pending = inflight.get(key) as Promise<T> | undefined
  if (!pending) {
    const startedAt = epoch
    pending = read().then(
      (value) => {
        if (inflight.get(key) === pending) inflight.delete(key)
        // Was VOR einem Räumen gelesen wurde, kommt nicht mehr in den Speicher.
        if (startedAt === epoch) entries.set(key, { value, expires: Date.now() + INSTANCE_READ_TTL_MS })
        return value
      },
      (error: unknown) => {
        if (inflight.get(key) === pending) inflight.delete(key)
        throw error
      },
    )
    inflight.set(key, pending)
  }
  return structuredClone(await pending)
}

/** Nach jedem Schreiben in die genannte Tabelle. */
export function forgetInstanceRead(name: InstanceReadName): void {
  epoch++
  for (const key of [...entries.keys(), ...inflight.keys()]) {
    if (key.endsWith(`:${name}`)) {
      entries.delete(key)
      inflight.delete(key)
    }
  }
}
