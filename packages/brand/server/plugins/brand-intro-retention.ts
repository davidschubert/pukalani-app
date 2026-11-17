import { brandIntroRetentionMode, runBrandIntroRetention } from '../utils/brandIntroRetentionRun'

/**
 * DER TAKT DES FRISTEN-LAUFS DER GESPRÄCHSANFRAGEN (EL1 c): Anfragen 12
 * Monate nach dem Eingang löschen. Was der Lauf tut und was er NIE tut, steht
 * im Kopf von `server/utils/brandIntroRetentionRun.ts`.
 *
 * SCHALTER `pukalani.brand.introRequestRetention` ('off' | 'count' | 'apply';
 * Layer-Default 'off'). Bei 'off' gibt es keinen Timer — die Hand-Route
 * `POST /api/brand/admin/intro-retention/run` kann trotzdem zählen. Ein
 * ungültiger Wert gilt als 'off' und schreibt eine Fehlerzeile
 * (`retention.invalid_mode`).
 *
 * TAKT STÜNDLICH, obwohl die Frist in Tagen rechnet — dieselbe Begründung wie
 * beim Fristen-Lauf der Warteliste: ein täglicher Takt verlängerte die Zusage
 * bei jedem Neustart um bis zu einen Tag. Ein leerer Lauf kostet eine
 * Abfrage.
 *
 * ERSTER LAUF NACH 10 MINUTEN, versetzt zu den anderen Läufen des Layers
 * (Ereignis-Sweep nach 60 Sekunden, Lösch-Lauf der Prüfergebnisse nach 6,
 * Warteliste nach 8 Minuten).
 *
 * DIE KENNUNG steht als Literal, weil die Wächter sie im Quelltext lesen
 * (`timedJobGuard.test.ts`, `verifyAppSignals.test.ts`); dass sie gleich
 * `BRAND_INTRO_RETENTION_JOB` ist, hält `brandIntroRetention.test.ts`.
 *
 * DAS PRODUKT-GATE steht IM Takt und nicht im Plugin-Rumpf: `product-manifest.ts`
 * läuft nicht garantiert vor dieser Datei.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = brandIntroRetentionMode()
  if (mode === 'off') return

  // Die Zahlen und das Scheitern meldet der Lauf selbst (`retention.*`);
  // `retentionTick` übersetzt sein Ergebnis nur für `job.run` (OPS-011).
  const tick = retentionTick(() => runBrandIntroRetention(mode))
  defineTimedJob({
    name: 'brand-intro-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: async () => {
      if (!getProductRegistry().has('brand')) return 'skipped'
      return tick()
    },
  })
})
