import { runMarketRawSweep } from '../utils/marketRawSweep'

/**
 * DER TAKT DER 24-STUNDEN-FRIST (Plan §2.6, §2.9 Nr. 6; MV1 M5).
 *
 * Muster und Begründungen wie bei den anderen Sweeps des Projekts
 * (`email-digest.ts` im core, `guest-author-prune.ts` in comments): eine
 * Konstante je Zahl, erster Lauf kurz nach dem Boot, `setInterval` danach,
 * Single-Instanz-Annahme. Die Arbeit selbst steht in `server/utils` — dort,
 * wo der Admin-Client hingehört und wo der ESLint-Backstop gegen rohes
 * `.tablesDB` in `server/plugins/**` nicht in die Quere kommt.
 *
 * ── WARUM 30 MINUTEN UND NICHT STÜNDLICH ─────────────────────────────────
 * Die anderen Aufräum-Sweeps rechnen in TAGEN (90 Tage Melder-Adressen, 24
 * Monate Funnel), da ist eine Stunde Nachlauf belanglos. Diese Frist rechnet
 * in STUNDEN und wird nach aussen genannt („höchstens 24 Stunden",
 * Erklärseite `/market-bot`). Ein Halbstunden-Takt hält die Zusage mit
 * höchstens 30 Minuten Nachlauf ein — bei einem Stunden-Takt stünde auf der
 * Seite faktisch „bis zu 25 Stunden". Der Preis ist eine zusätzliche
 * `listRows`-Abfrage je Stunde auf einem Index, der genau dafür angelegt ist.
 *
 * ── DER ERSTE LAUF KOMMT NACH 45 SEKUNDEN ────────────────────────────────
 * Ein Deploy darf die fällige Runde nicht bis zur nächsten halben Stunde
 * verschieben — sonst hätte jeder Neustart die Frist verlängert. 45 Sekunden,
 * weil Nitro beim Start ohnehin zu tun hat und der Sweep nichts Eiliges ist.
 *
 * ── DAS PRODUKT-GATE: `getProductRegistry().has('market')` ───────────────
 * Die Frage ist „ist dieses Produkt in DIESE App einkompiliert?" — dieselbe
 * Frage, die auch `04.product-gate.ts` als Erstes stellt. Ohne sie liefe der
 * Takt in jeder App, die den Layer aus einem anderen Grund im Baum hat, und
 * fragte halbstündlich eine Tabelle ab, die es dort nicht gibt. Das Manifest
 * registriert sich in einem eigenen Nitro-Plugin; Nitro lädt Plugins in
 * alphabetischer Reihenfolge je Verzeichnis, und `product-manifest.ts` läuft
 * daher nicht garantiert vor dieser Datei — die Prüfung steht deshalb IM
 * `setTimeout`, also nach dem Start, und nicht im Plugin-Rumpf.
 *
 * ── UND WARUM NICHT AUCH `pukalani.market.enabled` / DIE NOTABSCHALTUNG ──
 * Weil eine Aufbewahrungsfrist kein Produktmerkmal ist. Wer den
 * Marktvergleich abschaltet (Build-Schalter oder
 * `app_config.products.market.enabled`), stellt das Sammeln ein — er darf
 * damit aber nicht die Lebensdauer des SCHON gesammelten fremden
 * Seitentextes verlängern. Der Takt läuft deshalb, solange der Layer im Bau
 * ist; er hat dann schlicht nichts zu tun. Die manuelle Route daneben liegt
 * anders: sie hängt unter `/api/market` und fällt mit der Notabschaltung —
 * sie ist der Handgriff, dieser Takt ist die Zusage.
 */
const SWEEP_INTERVAL_MS = 30 * 60 * 1000
const FIRST_RUN_DELAY_MS = 45 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    if (!getProductRegistry().has('market')) return
    void runMarketRawSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein halbstündliches
      // „0 Zeilen" macht das Log unlesbar. ZAHLEN, kein Inhalt.
      if (result.swept || result.errors) {
        logEvent('info', 'market.raw_swept', {
          checked: result.checked,
          swept: result.swept,
          errors: result.errors,
        })
      }
    }).catch((error) => {
      console.error('[market] Rohtext-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI, Tests, Migrations-Läufe) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
