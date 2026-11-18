import { RUN_LEASE_POLL_MS } from '../../../core/shared/runLease'
import {
  BRAND_CHECK_RUN_STORAGE_KEY,
  BRAND_CHECK_RUN_WAIT_MS,
  type BrandCheckRunEnd,
  type PendingBrandCheckRun,
  brandCheckRunEnd,
  parsePendingBrandCheckRun,
  serializePendingBrandCheckRun,
} from '../../shared/brandCheckRunClient'
import { BRAND_RUN_POLL_TIMEOUT_MS, type BrandRunView, noBrandRunView } from '../../shared/brandRun'
import type { BrandCheckRunStateResponse } from '../../shared/types/brand'

/**
 * DEN LAUF DES ÖFFENTLICHEN BRAND-CHECKS ABWARTEN (LL1 b, 2026-11-18).
 *
 * Der Start (`POST /api/brand/check`) antwortet `202` mit einem Kennzeichen
 * und rechnet hinter der Antwort. Drei Seiten starten ihn — das öffentliche
 * Formular, die Score-Seite einer Marke und die Übersicht aller Marken — und
 * alle drei warten mit DIESER Hilfe auf sein Ende. Die Regeln (was gemerkt
 * wird, wie ein Lauf endet) stehen pur in `shared/brandCheckRunClient.ts`.
 *
 * `awaitBrandCheckRun` wirft nie: eine Abfrage, die scheitert oder hängen
 * bleibt (Frist je Abfrage), wird beim nächsten Takt wiederholt. Nur das 404
 * ist eine Antwort — zu diesem Kennzeichen gibt es keinen Lauf (mehr). Nach
 * der Wartezeit gibt sie den letzten bekannten Stand zurück; dann rechnet der
 * Lauf womöglich noch, und die Seite sagt das auch so.
 */
export async function awaitBrandCheckRun(
  token: string,
  options: { maxMs?: number } = {},
): Promise<BrandCheckRunEnd> {
  const deadline = Date.now() + (options.maxMs ?? BRAND_CHECK_RUN_WAIT_MS)
  let last: BrandRunView = { ...noBrandRunView(), state: 'running' }
  for (;;) {
    try {
      const state = await $fetch<BrandCheckRunStateResponse>(
        `/api/brand/check/runs/${encodeURIComponent(token)}`,
        { timeout: BRAND_RUN_POLL_TIMEOUT_MS },
      )
      last = state.run
      if (last.state !== 'running') return brandCheckRunEnd(last)
    }
    catch (error) {
      const value = error as { status?: number, statusCode?: number, response?: { status?: number } } | null
      const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
      if (status === 404) return { kind: 'gone' }
      // Alles andere ist ein Aussetzer, kein Ausgang — der nächste Takt fragt wieder.
    }
    if (Date.now() > deadline) return brandCheckRunEnd(last)
    await new Promise(resolve => setTimeout(resolve, RUN_LEASE_POLL_MS))
  }
}

/**
 * Der EINE gemerkte Lauf im Speicher des Browsers (s. Kopf von
 * `brandCheckRunClient.ts`). Jeder Zugriff ist fail-soft: ein abgeschalteter
 * oder voller Speicher kostet nur das Wiederaufnehmen nach einem Neuladen,
 * nie den Check.
 */
export function rememberBrandCheckRun(entry: Pick<PendingBrandCheckRun, 'token' | 'url'>): void {
  try {
    localStorage.setItem(BRAND_CHECK_RUN_STORAGE_KEY, serializePendingBrandCheckRun({ ...entry, at: Date.now() }))
  }
  catch {
    // Kein Speicher ⇒ kein Wiederaufnehmen. Der Lauf selbst ist davon unberührt.
  }
}

export function pendingBrandCheckRun(): PendingBrandCheckRun | null {
  try {
    return parsePendingBrandCheckRun(localStorage.getItem(BRAND_CHECK_RUN_STORAGE_KEY), Date.now())
  }
  catch {
    return null
  }
}

/** Den Merker löschen — nur, wenn er (noch) zu diesem Kennzeichen gehört. */
export function forgetBrandCheckRun(token: string): void {
  try {
    const current = parsePendingBrandCheckRun(localStorage.getItem(BRAND_CHECK_RUN_STORAGE_KEY), Date.now())
    if (!current || current.token === token) localStorage.removeItem(BRAND_CHECK_RUN_STORAGE_KEY)
  }
  catch {
    // s. o.
  }
}
