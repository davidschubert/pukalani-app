import { h } from 'vue'
import type { VNode } from 'vue'

/**
 * ── EINE LEERE ÜBERSCHRIFT IST KEINE ÜBERSCHRIFT (H1, 2026-09-06) ───────────
 *
 * Befund aus dem Brand-Check-Ranking: eine `UTable`-Spalte mit
 * `header: () => ''` erzeugt im Browser „Hydration completed but contains
 * mismatches" — OHNE Knoten-Warnung, also ohne jeden Hinweis darauf, WELCHE
 * Stelle gemeint ist.
 *
 * Warum: Vue schreibt einen LEEREN Text beim Server-Rendern gar nicht erst hin
 * (`<th><!--[--><!--]--></th>`), legt beim Hydrieren aber einen leeren
 * Textknoten an — das Fragment findet seinen Schluss-Anker damit an der
 * falschen Stelle. Diesen einen Fall meldet Vue leise: `hydrateFragment` ruft
 * in runtime-core `logMismatchError()` ohne `warn`. Es gibt also eine Meldung,
 * aber keinen Zeiger; genau deshalb stand der Fehler 40-mal im Baum.
 *
 * Der Ersatz ist kein Platzhalter, sondern die FEHLENDE BESCHRIFTUNG: eine
 * Spalte hat einen Namen, ein Screenreader liest ihn zu jeder Zelle mit vor
 * („Aktionen", „Auswählen"). Sichtbar bleibt der Kopf leer (`sr-only`), das
 * Layout ändert sich nicht — die Barrierefreiheit gewinnt dabei.
 *
 * LEERES LABEL WIRFT (bewusst): der Rückfall auf ein Leerzeichen wäre die
 * bequeme Wahl, würde die Falle aber genau so wieder verstecken, wie sie
 * gefunden wurde — `srOnlyHeader('')` rendert dieselbe kaputte Struktur wie
 * `header: () => ''`. Der Fehler ist ein PROGRAMMIERfehler (ein fehlender
 * i18n-Schlüssel gibt den Schlüssel zurück, nie ''), also gehört er dorthin,
 * wo er entsteht: in die Entwicklung. Geprüft wird `import.meta.dev !== false`
 * — eine UNBEKANNTE Umgebung (Vitest, ein direkt importiertes Modul) zählt als
 * Entwicklung, denn nur der Produktions-Build ersetzt `import.meta.dev`
 * statisch durch `false`. Dort fällt die Funktion still auf ein Leerzeichen
 * zurück: eine Seite wegen eines leeren Spaltennamens abstürzen zu lassen wäre
 * schlimmer als der Fehler selbst — und ein echtes Leerzeichen ist immerhin
 * ein echter Textknoten, hydriert also sauber.
 *
 * Label als FUNKTION übergeben, wo `t()` im Spiel ist: die Spaltenliste wird
 * einmal gebaut, die Sprache kann danach wechseln.
 *
 *   { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) }
 */
export function srOnlyHeader(label: string | (() => string)): () => VNode {
  return () => {
    const text = typeof label === 'function' ? label() : label
    if (!text) {
      if (import.meta.dev !== false) {
        throw new Error('srOnlyHeader: leerer Spaltenname — genau das ist der Hydration-Fehler, den dieser Helfer verhindert.')
      }
      return h('span', { class: 'sr-only' }, ' ')
    }
    return h('span', { class: 'sr-only' }, text)
  }
}
