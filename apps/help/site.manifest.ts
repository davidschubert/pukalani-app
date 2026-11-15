import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl der öffentlichen Hilfe-Site.
 *
 * Host: **help.pukalani.app** — LIVE seit 2026-07-27. Die Deploy-Kette läuft
 * vollständig mit: pm2-Slot `helppukalaniapp` (ops/ecosystem-help.config.cjs,
 * Port 3006), Release-Slot `releases/help`, beide App-Schleifen in
 * .github/workflows/deploy.yml, DNS/TLS über das Wildcard `*.pukalani.app`
 * (kein eigenes Zertifikat — Lineage-Falle). Details:
 * docs/content/2.architektur/6.hosts-und-ports.md, Go-Live-Protokoll:
 * docs/archiv/HELP-GO-LIVE.md.
 *
 * Der Ordner heißt `help` (nicht `docs`), weil `docs/` am Repo-Rand schon die
 * INTERNE Entwickler-Doku ist (Port 4000, kein Layer, keine App). Zwei „docs"
 * im selben Baum haben in der Merge-Review sofort verwirrt.
 *
 * KEINE Produkt-Layer mit Datenmodell: die Seite ist öffentlich, statisch und
 * schreibt nichts — ihre Inhalte liegen als Markdown in `content/` und werden
 * von @nuxt/content gerendert. core + system sind implizit immer dabei
 * (Fundament); einziger Eintrag ist der Chrome-Layer `marketing` (s. unten).
 *
 * Warum überhaupt ein Manifest (und damit core + system), wo die interne
 * Entwickler-Doku unter `docs/` bewusst OHNE Layer auskommt: `check-manifests`
 * scannt ausnahmslos jeden Ordner unter `apps/` und verlangt dort ein
 * Site-Manifest samt passendem `extends` (= Produkte + core + system). Eine
 * „reine Content-App" unter apps/ ist damit nicht vorgesehen — entweder
 * außerhalb von apps/ (wie `docs/`, Port 4000) oder als reguläre App wie hier.
 * Die Entscheidung fiel auf „reguläre App", weil die Hilfe ein öffentlicher
 * Prod-Host ist und dieselbe Behandlung wie die anderen Sites bekommt
 * (Fehlerseite, Security-Header, i18n-Fundament, /api/health).
 */
export default {
  siteId: 'help',
  // `marketing` ist der Chrome-Layer der Marke (tier 'foundation', keine
  // Tables): er liefert MarketingHeader/-Footer und die puka-Farbwelt, damit
  // pukalani.app und diese Hilfe EINE Kopf-/Fußzeile teilen (Davids
  // Entscheidung 2026-08-18). Produkt-Layer mit Datenmodell bleiben bewusst
  // draußen — die Seite liest nichts aus Appwrite.
  products: ['marketing'],
  // Keine eigene Appwrite-Instanz (die Seite liest nichts aus Appwrite) —
  // der Migrations-Runner lehnt jede Env-Datei ab (OPS-002).
  appwriteProjects: [],
} satisfies SiteManifest
