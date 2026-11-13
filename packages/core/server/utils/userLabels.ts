import type { H3Event } from 'h3'

/**
 * DER EINE SCHREIBER FÜR KONTO-LABELS (SEC-024, seit 2026-11-13).
 *
 * Labels sind bei uns zwei Dinge in EINEM Feld: Betreiber-Rollen
 * (`admin`/`moderator`, hasCapability) und das Lese-Publikum je Community
 * (`<communityId>`, `mod<communityId>` — communityLabel.ts). Appwrite kennt
 * dafür nur `users.updateLabels`, und das setzt die GANZE Liste. Wer schreibt,
 * muss also lesen, rechnen und zurückschreiben — und zwei Schreiber, die vom
 * selben alten Stand ausgehen, überschreiben einander (wer zuletzt schreibt,
 * gewinnt). Bis SEC-024 gab es vier solche Stellen mit je eigener Vorsicht,
 * und ein gescheiterter ENTZUG landete nur im Log, während die Route `ok`
 * sagte.
 *
 * Deshalb läuft JEDER Schreibvorgang auf Konto-Labels über diese Funktion:
 *
 *  1. SERIALISIERT je Konto im Prozess — eine Kette je `userId`. Zwei
 *     Schreiber im selben Prozess lesen nie denselben alten Stand.
 *     GRENZE: das gilt nur INNERHALB eines Prozesses. Auf Production fährt pm2
 *     je App genau einen Prozess (`instances: 1`), aber Platform-App und
 *     Betreiber-Konsole sind zwei Prozesse, die beide Labels schreiben können
 *     (Rollen-Route vs. Community-Label). Zwischen Prozessen bleibt das
 *     Fenster „lesen → schreiben" offen; Schritt 3 erkennt einen dort
 *     verlorenen ENTZUG oder eine verlorene Vergabe des eigenen Aufrufs, nicht
 *     aber, dass der fremde Prozess danach den eigenen Stand überschreibt.
 *     Dafür gibt es den stündlichen Abgleich (onboarding/labelReconcile.ts)
 *     und die Selbstheilung in 06.community-label.ts.
 *  2. FRISCH lesen, rechnen, schreiben — nur die genannten Labels kommen
 *     hinzu oder fallen weg; alles andere bleibt WÖRTLICH und in seiner
 *     Reihenfolge stehen.
 *  3. NACHLESEN: steht ein zu entfernendes Label noch da (oder fehlt ein
 *     hinzuzufügendes), wird EINMAL wiederholt. Höchstens zwei
 *     Schreibvorgänge, drei Lesevorgänge.
 *  4. Das ERGEBNIS zurückgeben — nie nur loggen. Was der Aufrufer daraus macht
 *     (Fehler an die Oberfläche, still weiter, zählen), entscheidet er.
 *
 * Wirft NIE: auch ein unerreichbares Appwrite ist ein Ergebnis
 * (`ok: false`). Grundsatz (Davids Entscheidung zu SEC-024): eine Sicherung,
 * die nicht prüfen kann, lehnt ab — sie sagt nicht „ok".
 */

/** Was dieser Schreiber von Appwrites Users-API braucht (Admin-Client oder Attrappe). */
export interface UserLabelsApi {
  get: (args: { userId: string }) => Promise<{ labels?: string[] }>
  updateLabels: (args: { userId: string, labels: string[] }) => Promise<unknown>
}

export interface UserLabelChange {
  add?: readonly string[]
  remove?: readonly string[]
}

export type UserLabelsFailure = 'not_found' | 'invalid_label' | 'unavailable' | 'verify_failed'

export type UserLabelsResult =
  | { ok: true, changed: boolean, labels: string[] }
  | { ok: false, reason: UserLabelsFailure, message?: string }

/** Appwrite speichert nur alphanumerische Labels bis 36 Zeichen. */
const APPWRITE_LABEL = /^[a-zA-Z0-9]{1,36}$/

/** Höchstens so viele Schreibvorgänge je Aufruf (der erste + EINE Wiederholung). */
const MAX_WRITES = 2

/** Die Kette je Konto. Ein Eintrag lebt nur, solange noch ein Aufruf wartet. */
const chains = new Map<string, Promise<void>>()

function serialize<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(userId) ?? Promise.resolve()
  // Läuft nach dem Vorgänger — egal, ob der gelang. `task` selbst wirft nie,
  // aber die Kette darf auch an einem unerwarteten Fehler nicht reißen.
  const run = previous.then(task, task)
  const tail: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  ).then(() => {
    // Nur aufräumen, wenn niemand sich inzwischen hinten angestellt hat.
    if (chains.get(userId) === tail) chains.delete(userId)
  })
  chains.set(userId, tail)
  return run
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 404
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isUsersApi(source: H3Event | UserLabelsApi | undefined): source is UserLabelsApi {
  return !!source && typeof (source as UserLabelsApi).updateLabels === 'function'
}

/** Ist der gewünschte Zustand erreicht? */
function satisfied(labels: readonly string[], add: readonly string[], remove: readonly string[]): boolean {
  return remove.every(label => !labels.includes(label)) && add.every(label => labels.includes(label))
}

/** Neue Liste: Weggefallenes raus, Fehlendes hinten an — alles andere wörtlich. */
function nextLabels(labels: readonly string[], add: readonly string[], remove: readonly string[]): string[] {
  const next = labels.filter(label => !remove.includes(label))
  for (const label of add) if (!next.includes(label)) next.push(label)
  return next
}

/**
 * Konto-Labels ändern — NUR die genannten, mit Serialisierung und Nachprüfung.
 *
 * `source`: ein `H3Event` (dann der Admin-Client dieses Requests), eine
 * Users-API (Tests, Abgleich-Lauf) oder `undefined` (Admin-Client ohne
 * Request, z. B. aus einem Intervall-Plugin).
 */
export async function mutateUserLabels(
  source: H3Event | UserLabelsApi | undefined,
  userId: string,
  change: UserLabelChange,
): Promise<UserLabelsResult> {
  const add = [...new Set(change.add ?? [])]
  const remove = [...new Set(change.remove ?? [])]
  const invalid = [...add, ...remove].find(label => !APPWRITE_LABEL.test(label))
  if (!userId || invalid !== undefined) {
    return { ok: false, reason: 'invalid_label', message: userId ? 'label not storable' : 'missing user id' }
  }
  if (add.some(label => remove.includes(label))) {
    return { ok: false, reason: 'invalid_label', message: 'label both added and removed' }
  }

  let users: UserLabelsApi
  try {
    users = isUsersApi(source) ? source : createAdminClient(source).users
  }
  catch (error) {
    return { ok: false, reason: 'unavailable', message: messageOf(error) }
  }

  return await serialize(userId, async (): Promise<UserLabelsResult> => {
    let changed = false
    let lastError = ''
    for (let attempt = 0; attempt <= MAX_WRITES; attempt++) {
      let labels: string[]
      try {
        labels = [...((await users.get({ userId })).labels ?? [])]
      }
      catch (error) {
        if (isNotFound(error)) return { ok: false, reason: 'not_found' }
        lastError = messageOf(error)
        continue
      }

      // Der Zustand stimmt — beim ersten Lesen heißt das „nichts zu tun",
      // danach ist es die NACHPRÜFUNG eines eigenen Schreibvorgangs.
      if (satisfied(labels, add, remove)) return { ok: true, changed, labels }
      // Nach dem letzten erlaubten Schreibvorgang wird nur noch nachgelesen.
      if (attempt === MAX_WRITES) break

      if (attempt > 0) {
        logEvent('warn', 'user_labels.retry', { userId, add: add.join(','), remove: remove.join(',') })
      }
      try {
        await users.updateLabels({ userId, labels: nextLabels(labels, add, remove) })
        changed = true
      }
      catch (error) {
        if (isNotFound(error)) return { ok: false, reason: 'not_found' }
        lastError = messageOf(error)
      }
    }
    return lastError
      ? { ok: false, reason: 'verify_failed', message: lastError }
      : { ok: false, reason: 'verify_failed' }
  })
}
