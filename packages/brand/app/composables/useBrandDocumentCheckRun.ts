import { RUN_LEASE_POLL_MS } from '../../../core/shared/runLease'
import { BRAND_RUN_POLL_TIMEOUT_MS, type BrandRunView, noBrandRunView } from '../../shared/brandRun'
import type { BrandCheckHistoryResponse } from '../../shared/types/brand'

/**
 * DEN FUNDAMENT-CHECK-LAUF EINER MARKE ABWARTEN (LL1 b, 2026-11-17).
 *
 * Der Start antwortet `202` und rechnet hinter der Antwort; der Stand steht
 * am Verlauf der Marke (`GET …/checks`, Feld `documentRun`). Die Score-Seite
 * fragt ihn mit `useRunPolling` ab (dort steht der Verlauf ohnehin). Die
 * ÜBERSICHT aller Marken hat ihn nicht — sie wartet mit dieser Hilfe auf das
 * Ende des EINEN Laufs, den sie gerade gestartet hat, und lädt dann ihre
 * Tabelle neu.
 *
 * Sie wirft nie: eine Abfrage, die scheitert oder hängen bleibt (Frist je
 * Abfrage), wird beim nächsten Takt wiederholt. Nach `maxMs` gibt sie den
 * letzten bekannten Stand zurück — dann rechnet der Lauf womöglich noch, und
 * die Seite sagt das auch so.
 */
export async function awaitBrandDocumentCheckRun(
  profileId: string,
  options: { maxMs?: number } = {},
): Promise<BrandRunView> {
  const deadline = Date.now() + (options.maxMs ?? 5 * 60_000)
  let last: BrandRunView = { ...noBrandRunView(), state: 'running' }
  for (;;) {
    try {
      const history = await $fetch<BrandCheckHistoryResponse>(
        `/api/brand/profiles/${encodeURIComponent(profileId)}/checks`,
        { timeout: BRAND_RUN_POLL_TIMEOUT_MS },
      )
      last = history.documentRun ?? noBrandRunView()
      if (last.state !== 'running') return last
    }
    catch {
      // Ein Aussetzer ist kein Ausgang — der nächste Takt fragt wieder.
    }
    if (Date.now() > deadline) return last
    await new Promise(resolve => setTimeout(resolve, RUN_LEASE_POLL_MS))
  }
}
