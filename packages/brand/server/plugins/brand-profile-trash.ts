import { brandProfileTrashMode, runBrandProfileTrash } from '../utils/brandProfileTrash'

/**
 * DER TAKT DES PAPIERKORBS (WH1): Marken 90 Tage nach dem Löschen endgültig
 * löschen. Was der Lauf tut und was er NIE tut, steht bei
 * `runBrandProfileTrash` (`server/utils/brandProfileTrash.ts`).
 *
 * SCHALTER `pukalani.brand.profileTrash` ('off' | 'count' | 'apply';
 * Layer-Default 'off'). Bei 'off' gibt es keinen Timer — die Hand-Route
 * `POST /api/brand/admin/profile-trash/run` kann trotzdem zählen.
 *
 * TAKT STÜNDLICH, obwohl die Frist in Tagen rechnet: ein täglicher Takt
 * verlängerte die Zusage bei jedem Neustart um bis zu einen Tag. ERSTER LAUF
 * NACH 12 MINUTEN, versetzt zu den anderen Läufen des Layers (Ereignisse 1,
 * Prüfergebnisse 6, Warteliste 8, Gesprächsanfragen 10 Minuten).
 *
 * DIE KENNUNG steht als Literal, weil die Wächter sie im Quelltext lesen
 * (`timedJobGuard.test.ts`, `verifyAppSignals.test.ts`); dass sie gleich
 * `BRAND_PROFILE_TRASH_JOB` ist, hält `brandProfileTrash.test.ts`.
 *
 * DAS PRODUKT-GATE steht IM Takt und nicht im Plugin-Rumpf: `product-manifest.ts`
 * läuft nicht garantiert vor dieser Datei.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 12 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = brandProfileTrashMode()
  if (mode === 'off') return

  const tick = retentionTick(() => runBrandProfileTrash(mode))
  defineTimedJob({
    name: 'brand-profile-trash',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: async () => {
      if (!getProductRegistry().has('brand')) return 'skipped'
      return tick()
    },
  })
})
