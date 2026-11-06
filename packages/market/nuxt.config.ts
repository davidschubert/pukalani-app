/**
 * market-Layer — Marktvergleich (Plan: docs/archiv/BRAND-MARKTVERGLEICH.md).
 *
 * STAND: **M1 „Layer + Vertrag"**. Der Layer trägt die Komponenten-Vorlagen
 * aus dem Prototyp (`app/components`, `Mk*`), den Produkt-Vertrag
 * (`shared/marketProfile.ts`), den Ablage-Vertrag (`shared/types/market.ts`),
 * die drei Migrationen (`scripts/migrations`) und den Server-Unterbau
 * (`server/utils`, `server/plugins`). Es gibt weiterhin KEINE Route und
 * KEINEN KI-Aufruf — sie kommen mit M2/M3 und übernehmen genau diese
 * Bausteine („nichts wird zweimal gebaut", §2.11).
 *
 * ── WARUM HIER FÜR `server/` NICHTS STEHT ────────────────────────────────
 * Nitro scannt `server/api`, `server/utils` und `server/plugins` eines
 * erweiterten Layers von selbst — der brand-Layer hat dafür ebenfalls keine
 * Zeile Konfiguration. Eine Angabe wäre nicht falsch, aber sie behauptete,
 * hier gäbe es etwas zu entscheiden.
 *
 * KEIN `extends`: der Layer hängt am brand-Layer über einen EXPLIZITEN
 * Vertrag (Plan §2.1, CONCEPT A14) und nicht über die Kette. Der Vertrag ist
 * seit M1 gebaut und liegt an EINER Stelle
 * (`server/utils/brandContract.ts`) — nur sie greift über die Paketgrenze,
 * alle anderen market-Dateien importieren von dort. Die Komponenten bleiben
 * unberührt: die Beschriftung der EIGENEN Felder reicht die Seite weiterhin
 * als Prop herein (`fieldLabels`), statt dass eine Komponente die
 * brand-Registry auflöst — die Grenze bleibt damit auch in der Oberfläche
 * sichtbar.
 *
 * DER KOMPONENTEN-PRÄFIX `Mk` STEHT IM DATEINAMEN, nicht in einer
 * `components`-Angabe — dieselbe Lösung wie `Bw*` im brand-Layer. Eine
 * `prefix`-Angabe zusätzlich zum Dateinamen ergäbe `MkMkEvidence`.
 *
 * KEIN eigenes Stylesheet: die Werkstatt-Optik ist der Token-Satz `.bw-root`
 * aus `packages/brand/app/assets/css/brand.css`. Zwei Token-Sätze für dieselbe
 * Werkstatt wären zwei Wahrheiten über dieselbe Farbe — der Prototyp erbt sie
 * über das `extends` seines Playgrounds, die Umsetzung über die App
 * (`apps/branding` listet `brand` und `market` gemeinsam).
 *
 * Der Prototyp läuft im `.playground` — Punkt-Ordner erfasst weder der
 * Manifest-Scan noch `extends`.
 */
export default defineNuxtConfig({
  // Layer-stores gibt es (noch) keine; die Locales aber schon: sie mergen
  // über den gleichen Sprachcode mit Core-, brand- und App-Katalog.
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
