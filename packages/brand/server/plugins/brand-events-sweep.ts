import { runBrandEventsSweep } from '../utils/brandEventsSweep'

/**
 * DER TAKT DER 24-MONATS-FRIST (BS1 R1b; Kopf von
 * `scripts/migrations/007-brand-events.ts`).
 *
 * Muster und Begründungen wie bei den anderen Sweeps des Projekts
 * (`email-digest.ts` im core, `guest-author-prune.ts` in comments,
 * `raw-text-sweep.ts` in market): eine Konstante je Zahl, erster Lauf kurz nach
 * dem Boot, `setInterval` danach, Single-Instanz-Annahme. Die Arbeit selbst
 * steht in `server/utils` — dort, wo der Admin-Client hingehört.
 *
 * ── WARUM EINMAL AM TAG ──────────────────────────────────────────────────
 * Die Frist rechnet in MONATEN. Ein Tag Nachlauf ist dort belanglos, und mehr
 * als ein `listRows` täglich auf einer Tabelle, die an einem gewöhnlichen Tag
 * gar nichts Fälliges enthält, wäre reine Last ohne Gegenwert. (Der
 * Rohtext-Sweep nebenan taktet halbstündlich, weil SEINE Frist in Stunden
 * rechnet und nach aussen genannt wird — dieselbe Überlegung, andere
 * Grössenordnung.)
 *
 * ── DER ERSTE LAUF KOMMT NACH 60 SEKUNDEN ────────────────────────────────
 * Ein Deploy darf die fällige Runde nicht bis zum nächsten Tagestakt
 * verschieben — sonst hätte jeder Neustart die Frist verlängert, und bei einem
 * Tagestakt wäre das kein Rundungsfehler mehr. 60 Sekunden, weil Nitro beim
 * Start ohnehin zu tun hat und der Sweep nichts Eiliges ist.
 *
 * ── DAS PRODUKT-GATE: `getProductRegistry().has('brand')` ────────────────
 * Die Frage ist „ist dieses Produkt in DIESE App einkompiliert?" — dieselbe,
 * die auch `04.product-gate.ts` als Erstes stellt. Ohne sie liefe der Takt in
 * jeder App, die den Layer aus einem anderen Grund im Baum hat, und fragte
 * täglich eine Tabelle ab, die es dort nicht gibt. Das Manifest registriert
 * sich in einem eigenen Nitro-Plugin; Nitro lädt Plugins in alphabetischer
 * Reihenfolge je Verzeichnis, und `product-manifest.ts` läuft daher nicht
 * garantiert vor dieser Datei — die Prüfung steht deshalb IM `setTimeout`,
 * also nach dem Start, und nicht im Plugin-Rumpf.
 *
 * ── UND WARUM NICHT AUCH DER PRODUKT-SCHALTER ────────────────────────────
 * Weil eine Aufbewahrungsfrist kein Produktmerkmal ist. Wer den Wizard
 * abschaltet, stellt das MESSEN ein; er darf damit aber nicht die Lebensdauer
 * der schon gemessenen Ereignisse verlängern. Der Takt läuft deshalb, solange
 * der Layer im Bau ist — er hat dann schlicht nichts zu tun.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 60 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    if (!getProductRegistry().has('brand')) return
    void runBrandEventsSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein tägliches
      // „0 Zeilen" macht das Log unlesbar. ZAHLEN, kein Inhalt.
      if (result.deleted || result.errors) {
        logEvent('info', 'brand.events_swept', {
          checked: result.checked,
          deleted: result.deleted,
          errors: result.errors,
        })
      }
    }).catch((error) => {
      console.error('[brand] Ereignis-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI, Tests, Migrations-Läufe) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
