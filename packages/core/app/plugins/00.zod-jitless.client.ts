import { z } from 'zod'

/**
 * ZOD OHNE `new Function` IM BROWSER (SE1 a, 2026-11-17).
 *
 * Zod baut für Objekt-Schemas einen schnellen Prüfer per `new Function` und
 * PROBIERT vorher, ob der Browser das erlaubt. Unter einer Skript-Regel ohne
 * `'unsafe-eval'` wirft die Probe (Zod fängt das ab und nimmt den normalen
 * Weg) — der Browser meldet sie trotzdem als Verstoß. Lokal gemessen am
 * Build: JEDER Seitenaufruf schickte so einen Bericht `script-src eval` an
 * die neue Annahme-Route, ohne dass irgendetwas falsch lief. Die Zahl im
 * täglichen Blick wäre vom ersten Tag an Rauschen gewesen.
 *
 * `jitless` lässt Probe und schnellen Prüfer weg (Zods eigener Schalter für
 * genau diesen Fall). Preis: Formulare prüfen im Browser auf dem normalen
 * Weg — nicht messbar bei den paar Feldern, die hier geprüft werden. Der
 * SERVER ist nicht betroffen (dort gilt keine Skript-Regel, und dort zählt
 * die Geschwindigkeit).
 *
 * ZWEI DINGE, DIE SO BLEIBEN MÜSSEN:
 *  - der Aufruf steht AUF MODUL-EBENE, nicht im Plugin-Rumpf: Zod liest den
 *    Schalter beim BAUEN eines Schemas, und Module werden ausgewertet, bevor
 *    das erste Plugin läuft;
 *  - der Dateiname beginnt mit `00.`: Nuxt lädt Plugins eines Layers in der
 *    Reihenfolge ihrer Namen.
 * Ein Schema, das ein früher geladenes Modul schon auf Modul-Ebene baut,
 * probiert trotzdem — Schemas für Formulare sind deshalb Fabriken
 * (`create*Schema(t)`), die erst in der Komponente laufen.
 */
z.config({ jitless: true })

export default defineNuxtPlugin({ name: 'core:zod-jitless', enforce: 'pre', setup() {} })
