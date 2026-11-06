import { runInsightsCorrectionsSweep } from '../utils/insightsCorrectionsSweep'

/**
 * DER TAKT DER 12-MONATS-FRIST (Plan §9.3 „Retention und Kaskaden").
 *
 * Muster und Begründungen wortgleich wie beim Ereignis-Sweep des brand-Layers
 * (`brand/server/plugins/brand-events-sweep.ts`) — und das ist Absicht: die
 * Sweeps dieses Projekts (`email-digest.ts` im core, `guest-author-prune.ts`
 * in comments, `raw-text-sweep.ts` in market) sollen sich gleich verhalten,
 * damit ein Betreiber nicht je Layer eine andere Mechanik lernen muss. Eine
 * Konstante je Zahl, erster Lauf kurz nach dem Boot, `setInterval` danach,
 * Single-Instanz-Annahme. Die Arbeit selbst steht in `server/utils` — dort,
 * wo der Admin-Client hingehört.
 *
 * ── WARUM EINMAL AM TAG ──────────────────────────────────────────────────
 * Die Frist rechnet in MONATEN. Ein Tag Nachlauf ist dort belanglos, und mehr
 * als ein `listRows` täglich auf einer Tabelle, die an einem gewöhnlichen Tag
 * gar nichts Fälliges enthält, wäre reine Last ohne Gegenwert.
 *
 * ── DER ERSTE LAUF KOMMT NACH 60 SEKUNDEN ────────────────────────────────
 * Ein Deploy darf die fällige Runde nicht bis zum nächsten Tagestakt
 * verschieben — sonst hätte jeder Neustart die Frist verlängert, und bei
 * einem Tagestakt wäre das kein Rundungsfehler mehr. 60 Sekunden, weil Nitro
 * beim Start ohnehin zu tun hat und der Sweep nichts Eiliges ist.
 *
 * ── DAS PRODUKT-GATE: `getProductRegistry().has('insights')` ─────────────
 * Die Frage ist „ist dieses Produkt in DIESE App einkompiliert?" — dieselbe,
 * die auch `04.product-gate.ts` als Erstes stellt. Ohne sie liefe der Takt in
 * jeder App, die den Layer aus einem anderen Grund im Baum hat, und fragte
 * täglich eine Tabelle ab, die es dort nicht gibt. Das Manifest registriert
 * sich in einem eigenen Nitro-Plugin; Nitro lädt Plugins in alphabetischer
 * Reihenfolge je Verzeichnis, und `product-manifest.ts` läuft daher nicht
 * garantiert vor dieser Datei — die Prüfung steht deshalb IM `setTimeout`,
 * also nach dem Start, und nicht im Plugin-Rumpf.
 *
 * ── UND WARUM NICHT AUCH DER PRODUKT-SCHALTER ───────────────────────────
 * Weil eine Aufbewahrungsfrist kein Produktmerkmal ist. Wer die Redaktion
 * abschaltet (`app_config.products.insights.enabled = false`), stellt das
 * VERÖFFENTLICHEN ein; er darf damit aber nicht die Lebensdauer der schon
 * hinterlassenen Kontakt-Adressen verlängern. Der Takt läuft deshalb, solange
 * der Layer im Bau ist — er hat dann schlicht nichts zu tun.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 60 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    if (!getProductRegistry().has('insights')) return
    void runInsightsCorrectionsSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein tägliches
      // „0 Zeilen" macht das Log unlesbar. ZAHLEN, kein Inhalt.
      if (result.cleared || result.errors) {
        logEvent('info', 'insights.corrections_swept', {
          checked: result.checked,
          cleared: result.cleared,
          errors: result.errors,
        })
      }
    }).catch((error) => {
      console.error('[insights] Fristen-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI, Tests, Migrations-Läufe) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
