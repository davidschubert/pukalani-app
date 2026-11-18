import type { RunLeaseState } from '../../core/shared/runLease'

/**
 * DER LAUF DES ÖFFENTLICHEN BRAND-CHECKS, VOM BROWSER AUS GESEHEN (LL1 b,
 * 2026-11-18) — die puren Regeln; das Abfragen selbst steht in
 * `app/composables/useBrandCheckRun.ts`.
 *
 * ── WAS DER BROWSER SICH MERKT, UND WARUM ─────────────────────────────────
 * Der Start antwortet `202` mit einem Kennzeichen; das Ergebnis entsteht bis
 * zu zwei Minuten später. Lädt jemand in dieser Zeit die Seite neu, wäre das
 * Kennzeichen weg — und mit ihm der Weg zum Ergebnis. Der Browser hält
 * deshalb GENAU EINEN offenen Lauf fest (Kennzeichen, eingegebene Adresse,
 * Zeitpunkt), bis dieser zu Ende ist. Das Formular nimmt ihn beim Öffnen
 * wieder auf: es zeigt denselben Wartezustand und führt am Ende auf dasselbe
 * Ergebnis.
 *
 * Der Server braucht diesen Merker NICHT, um doppelte Läufe zu verhindern —
 * das tut die Sperre (ein zweiter Start desselben Besuchers bekommt das
 * Kennzeichen des laufenden Laufs). Der Merker ist nur der Komfort, nach
 * einem Neuladen nicht noch einmal auf den Knopf drücken zu müssen.
 *
 * ── EIN MERKER HAT EIN ALTER ──────────────────────────────────────────────
 * Ein Lauf ist nach spätestens rund vier Minuten entschieden (zwei Minuten
 * Arbeit, zwei Minuten bis ein abgebrochener als abgebrochen gilt). Ein
 * Merker, der älter ist als `BRAND_CHECK_RUN_REMEMBER_MS`, wird nicht mehr
 * aufgenommen: wer am nächsten Tag wiederkommt, soll ein leeres Formular
 * sehen und nicht unvermittelt auf ein altes Ergebnis springen.
 *
 * ── DER PARSER KLEMMT, ER WIRFT NICHT ─────────────────────────────────────
 * Der Speicher des Browsers gehört dem Menschen davor — er kann leer,
 * abgeschaltet oder von Hand verändert sein. Alles, was nicht genau die
 * erwartete Form hat, heisst „kein offener Lauf".
 */

/** Der eine Schlüssel im Speicher des Browsers. */
export const BRAND_CHECK_RUN_STORAGE_KEY = 'pukalani.brand-check.run'

/** Wie lange ein gemerkter Lauf wieder aufgenommen wird. */
export const BRAND_CHECK_RUN_REMEMBER_MS = 15 * 60_000

/** Wie lange eine Seite höchstens auf das Ende eines Laufs wartet. */
export const BRAND_CHECK_RUN_WAIT_MS = 5 * 60_000

/** Die Form eines Kennzeichens (dieselbe wie auf dem Server). */
const TOKEN_PATTERN = /^r[0-9a-f]{31}\.[\w-]{43}$/

/** Der Deckel der Spalte `brand_checks.url` — länger ist keine Eingabe. */
const URL_MAX = 512

export interface PendingBrandCheckRun {
  token: string
  /** Die Adresse, wie sie im Feld stand — nur für die Anzeige beim Aufnehmen. */
  url: string
  /** Wann der Lauf gemerkt wurde (Uhr des Browsers, ms). */
  at: number
}

export function serializePendingBrandCheckRun(entry: PendingBrandCheckRun): string {
  return JSON.stringify({ token: entry.token, url: entry.url.slice(0, URL_MAX), at: entry.at })
}

/** Der gemerkte Lauf — oder `null`, wenn es keinen (mehr) gibt (s. Kopf). */
export function parsePendingBrandCheckRun(raw: string | null | undefined, nowMs: number): PendingBrandCheckRun | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const { token, url, at } = value as Record<string, unknown>
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  // Aus der Zukunft (verstellte Uhr) oder zu alt ⇒ nicht mehr aufnehmen.
  if (at > nowMs + 60_000 || nowMs - at > BRAND_CHECK_RUN_REMEMBER_MS) return null
  return { token, url: typeof url === 'string' ? url.slice(0, URL_MAX) : '', at }
}

/**
 * WIE EIN LAUF FÜR DIE SEITE ENDET — eine Antwort statt fünf verstreuter
 * Fallunterscheidungen in drei Seiten.
 *
 *  - `done`        das Ergebnis steht, `id` ist seine Adresse.
 *  - `failed`      der Lauf nennt einen kurzen Grund (`reason`) — dieselben
 *                  Wörter, die früher der Fehler-Code der Anfrage waren.
 *  - `interrupted` abgebrochen (Ausliefern, Absturz): noch einmal starten.
 *  - `running`     nach der Wartezeit noch unterwegs — die Seite sagt das so.
 *  - `gone`        zu diesem Kennzeichen gibt es keinen Lauf (mehr).
 */
export type BrandCheckRunEnd =
  | { kind: 'done', id: string }
  | { kind: 'failed', reason: string }
  | { kind: 'interrupted' }
  | { kind: 'running' }
  | { kind: 'gone' }

export function brandCheckRunEnd(view: { state: RunLeaseState, failure: string, ref: string }): BrandCheckRunEnd {
  if (view.state === 'done') {
    // Fertig, aber ohne Ergebnis-Id: das kann nur eine beschädigte Zeile sein.
    return view.ref ? { kind: 'done', id: view.ref } : { kind: 'failed', reason: 'failed' }
  }
  if (view.state === 'failed') return { kind: 'failed', reason: view.failure || 'failed' }
  if (view.state === 'stalled') return { kind: 'interrupted' }
  if (view.state === 'running') return { kind: 'running' }
  return { kind: 'gone' }
}
