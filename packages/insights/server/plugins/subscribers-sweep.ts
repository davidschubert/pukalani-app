import { runInsightsSubscribersSweep } from '../utils/insightsSubscribersSweep'

/**
 * DER TAKT DER ZWEI NEWSLETTER-FRISTEN (BI1 I5a).
 *
 * Muster und Begründungen wortgleich wie beim Fristen-Sweep der Korrekturen
 * (`corrections-sweep.ts`) — und das ist Absicht: die Sweeps dieses Projekts
 * sollen sich gleich verhalten, damit ein Betreiber nicht je Layer eine andere
 * Mechanik lernen muss. Eine Konstante je Zahl, erster Lauf kurz nach dem
 * Boot, `setInterval` danach, Single-Instanz-Annahme. Die Arbeit selbst steht
 * in `server/utils` — dort, wo der Admin-Client hingehört.
 *
 * ── WARUM EINMAL AM TAG ─────────────────────────────────────────────────
 * Die eine Frist rechnet in 30 Tagen, die andere in 12 Monaten. Ein Tag
 * Nachlauf ist dort belanglos, und mehr als zwei `listRows` täglich auf einer
 * Liste, die an einem gewöhnlichen Tag gar nichts Fälliges enthält, wäre
 * reine Last ohne Gegenwert.
 *
 * ── DER ERSTE LAUF KOMMT NACH 90 SEKUNDEN ───────────────────────────────
 * Ein Deploy darf die fällige Runde nicht bis zum nächsten Tagestakt
 * verschieben — sonst hätte jeder Neustart die Frist verlängert. 90 Sekunden
 * und nicht 60 wie beim Korrektur-Sweep: beide Takte laufen in DERSELBEN App
 * (`branding`), und zwei Sweeps, die sich im Boot-Fenster treffen, wären zwei
 * Stapel Appwrite-Last in derselben Sekunde. Eilig ist keiner von beiden.
 *
 * ── DAS PRODUKT-GATE: `getProductRegistry().has('insights')` ────────────
 * Die Frage ist „ist dieses Produkt in DIESE App einkompiliert?". Ohne sie
 * liefe der Takt in jeder App, die den Layer aus einem anderen Grund im Baum
 * hat, und fragte täglich eine Tabelle ab, die es dort nicht gibt. Die
 * Prüfung steht IM `setTimeout` und nicht im Plugin-Rumpf: Nitro lädt Plugins
 * alphabetisch je Verzeichnis, `product-manifest.ts` läuft also nicht
 * garantiert vorher.
 *
 * ── UND WARUM NICHT AUCH DER PRODUKT-SCHALTER ODER DER RIEGEL ───────────
 * Weil eine Aufbewahrungsfrist kein Produktmerkmal ist — und weil der
 * Newsletter-Riegel (`pukalani.insights.newsletter.enabled`) in der Zeit NACH
 * einer Abschaltung genau das Falsche täte: wer den Newsletter zumacht, stellt
 * das EINTRAGEN ein; er darf damit nicht die Lebensdauer der schon
 * hinterlassenen Adressen verlängern. Der Takt läuft deshalb, solange der
 * Layer im Bau ist — er hat dann schlicht nichts zu tun.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 90 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    if (!getProductRegistry().has('insights')) return
    void runInsightsSubscribersSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein tägliches
      // „0 Zeilen" macht das Log unlesbar. ZAHLEN, kein Inhalt.
      if (result.deleted || result.cleared || result.errors) {
        logEvent('info', 'insights.subscribers_swept', {
          checkedPending: result.checkedPending,
          deleted: result.deleted,
          checkedUnsubscribed: result.checkedUnsubscribed,
          cleared: result.cleared,
          errors: result.errors,
        })
      }
    }).catch((error) => {
      console.error('[insights] Newsletter-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI, Tests, Migrations-Läufe) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
