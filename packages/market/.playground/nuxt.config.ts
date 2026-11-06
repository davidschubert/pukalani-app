/**
 * DER PROTOTYP DES MARKTVERGLEICHS (Paket M0, Plan §2.11).
 *
 * DIE REIHENFOLGE DES `extends` IST DIE PRIORITÄT (früher = höher):
 * `..` ist der market-Layer selbst, dann `brand` (die Werkstatt-Optik, ihre
 * Komponenten und ihr Sprachkatalog), zuletzt `core` als Fundament. Dieselbe
 * Kette wie im brand-Playground, nur um eine Stufe verlängert.
 *
 * ── WARUM DER PLAYGROUND `brand` ERWEITERT UND DER LAYER NICHT ───────────
 * Der Prototyp soll die Werkstatt ZEIGEN — Leiste, Bühne, Stand, Chips —, und
 * dafür braucht er `BwWorkspace` und `brand.css`. Der PRODUKT-Layer `market`
 * hängt dagegen über einen expliziten Vertrag an `brand` (CONCEPT A14, Plan
 * §2.1), und den zieht erst M1. Ein Playground darf die Abkürzung nehmen, ein
 * Layer nicht: hier hängt keine App dran.
 *
 * SPRACHE: Englisch ist die Hauptsprache (Core-Default, `/`), Deutsch liegt
 * unter `/de/*`. Der brand-Playground dreht das um (dort ist Deutsch die
 * abgenommene Demo-Sprache) — hier bleibt es bei der Regel der Plattform.
 */
export default defineNuxtConfig({
  extends: ['..', '../../brand', '../../core'],

  devServer: {
    port: 3012,
  },
})
