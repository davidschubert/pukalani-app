import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { forgetInstanceRead } from '../../../core/server/utils/instanceReadCache'

/**
 * EIN SCHREIBER FÜR `app_config/global`, WENN EINE ROUTE ERST LIEST UND DANN
 * EIN FELD AUS DEM GELESENEN NEU BERECHNET (BP1 d, 2026-11-17).
 *
 * Der Befund: die Produkt-Schalter (`products`, ein JSON über alle Produkte)
 * und die Theme-Einstellungen (`themeSettings`, ein JSON über Default und alle
 * Built-ins) lasen den Stand, änderten einen Teil und schrieben die ganze
 * Spalte zurück — der Produkt-Schalter sogar aus einem bis zu 5 s alten
 * Zwischenspeicher. Zwei Betreiber im selben Augenblick: der zweite schrieb
 * den Stand von VOR dem ersten zurück, die erste Änderung war weg.
 *
 * Die Regel: `mutateAppConfig()` stellt die Aufrufe IM PROZESS hintereinander
 * (Kette je Zeile, dasselbe Muster wie `mutateUserLabels` in
 * core/server/utils/userLabels.ts je Konto). Innerhalb der Kette wird die
 * Zeile FRISCH gelesen (kein Cache), `compute` rechnet aus genau diesem Stand
 * die neuen Spalten, dann wird geschrieben — 404 ⇒ die Zeile wird angelegt,
 * wie bisher. Wirft `compute` (z. B. 409 „wird noch gebraucht"), wird nichts
 * geschrieben, und die Kette läuft für den Nächsten weiter.
 *
 * BEKANNTE GRENZE: die Kette gilt je PROZESS. Das trägt, weil jede App genau
 * einen Prozess fährt (pm2 `instances: 1`) und zwei Apps sich diese Zeile
 * nicht teilen (jede App hat ihr eigenes Projekt). Läuft eine App je einmal
 * mit mehreren Prozessen, braucht es eine Sperre in der Datenbank.
 *
 * Wer nur EIGENE Spalten mit Werten aus dem Body setzt, braucht die Kette
 * nicht: `updateRow` ändert nur die genannten Spalten (tickets/
 * settings.patch.ts). Dort liegt der Schutz darin, dass die SEITE nur sendet,
 * was sich geändert hat. config.patch.ts tut beides — Teil-Objekt UND Kette —,
 * damit es für diese Zeile genau einen Schreibweg gibt.
 */

export type AppConfigRow = Models.Row & Record<string, unknown>

export interface AppConfigMutation<T> {
  /** Nur diese Spalten werden geschrieben. */
  data: Record<string, unknown>
  /** Was der Aufrufer zurückbekommt. */
  result: T
}

const TABLE_ID = 'app_config'
const ROW_ID = 'global'

/** Die Kette je Zeile. Ein Eintrag lebt nur, solange noch ein Aufruf wartet. */
const chains = new Map<string, Promise<void>>()

function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()
  // Läuft nach dem Vorgänger — egal, ob der gelang oder abgelehnt wurde.
  const run = previous.then(task, task)
  const tail: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  ).then(() => {
    // Nur aufräumen, wenn sich inzwischen niemand hinten angestellt hat.
    if (chains.get(key) === tail) chains.delete(key)
  })
  chains.set(key, tail)
  return run
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException
    ? error.code === 404
    : (error as { code?: unknown } | null)?.code === 404
}

/**
 * Liest `app_config/global` frisch, lässt `compute` die neuen Spalten
 * berechnen und schreibt genau diese — alles in der Kette dieser Zeile.
 * `current` ist `null`, wenn die Zeile fehlt. `failText` ist der feste
 * `statusText` bei einem Lese- oder Schreibfehler (keine Appwrite-Details).
 */
export function mutateAppConfig<T>(
  event: H3Event,
  compute: (current: AppConfigRow | null) => AppConfigMutation<T> | Promise<AppConfigMutation<T>>,
  failText: string,
): Promise<T> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  return serialize(`${databaseId}/${TABLE_ID}/${ROW_ID}`, async () => {
    const admin = createAdminClient(event)

    let current: AppConfigRow | null
    try {
      current = await admin.tablesDB.getRow<AppConfigRow>({ databaseId, tableId: TABLE_ID, rowId: ROW_ID })
    }
    catch (error) {
      if (!isNotFound(error)) throw toH3Error(error, failText)
      current = null
    }

    const { data, result } = await compute(current)

    try {
      await admin.tablesDB.updateRow({ databaseId, tableId: TABLE_ID, rowId: ROW_ID, data })
    }
    catch (error) {
      // NUR wenn die Zeile fehlt anlegen — andere Fehler nicht verschlucken.
      if (!isNotFound(error)) throw toH3Error(error, failText)
      await admin.tablesDB.createRow({ databaseId, tableId: TABLE_ID, rowId: ROW_ID, data })
        .catch((createFailure: unknown) => { throw toH3Error(createFailure, failText) })
    }
    finally {
      // Auch ein gescheiterter Versuch kann geschrieben haben (Q12).
      forgetInstanceRead('app_config')
    }
    return result
  })
}
