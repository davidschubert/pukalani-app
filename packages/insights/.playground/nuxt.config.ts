/**
 * DER PROTOTYP VON BRAND INSIGHTS (Paket I0, Plan §9.9).
 *
 * DIE REIHENFOLGE DES `extends` IST DIE PRIORITÄT (früher = höher):
 * `..` ist der insights-Layer selbst, dann `brand` (die Werkstatt-Optik
 * `.bw-root`, `BwScoreRing`, `BwSiteFooter` und der brand-Sprachkatalog),
 * zuletzt `core` als Fundament. Dieselbe Kette wie im market-Playground.
 *
 * ── WARUM DER PLAYGROUND `brand` ERWEITERT UND DER LAYER NICHT ───────────
 * Der Prototyp soll die Seiten ZEIGEN, wie sie auf branding.supply aussähen —
 * und dafür braucht er die Farbtoken und den Score-Ring. Der PRODUKT-Layer
 * `insights` hängt dagegen über einen expliziten Vertrag an `brand` (CONCEPT
 * A14, Plan §9.1), und den zieht erst I1. Ein Playground darf die Abkürzung
 * nehmen, ein Layer nicht: hier hängt keine App dran.
 *
 * SPRACHE: Englisch ist die Hauptsprache (Core-Default, `/`), Deutsch liegt
 * unter `/de/*` — die Regel der Plattform. Der brand-Playground dreht das um
 * (dort ist Deutsch die abgenommene Demo-Sprache); hier bleibt es bei der
 * Regel, weil die öffentlichen Insights-Seiten später genauso adressiert sind
 * (§9.2: `prefix_except_default`).
 *
 * PORT 3013: 3009 gehört dem brand-Playground, 3012 dem market-Playground,
 * 3010 der branding-App im Dev. Vor jedem Beweis `lsof` — ein belegter Port
 * lässt Nuxt STILL auf einen anderen ausweichen (CLAUDE.md, Worktree-Beweise).
 */
export default defineNuxtConfig({
  extends: ['..', '../../brand', '../../core'],

  devServer: {
    port: 3013,
  },
})
