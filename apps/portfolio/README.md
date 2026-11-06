# apps/portfolio — Pukalani Studio (Silo-Site)

Davids eigene Site. Im Code, im Deployment und in Appwrite heißt sie überall
`portfolio`; die Marke, die der Besucher sieht, ist **Pukalani Studio**
(`pukalani.brand.name` in `apps/portfolio/app/app.config.ts`) und die Adresse
ist **pukalani.studio**.

Sie ist eines der beiden **Silo-Deployments** (das andere ist `apps/branding` →
branding.supply): eigene Site, eigenes Appwrite-Projekt, kein Pool-Mandant.
Inhaltlich ein Akquise-Trichter — Leistungen, Cases, Wissensartikel — mit genau
EINEM Ziel: dem Erstgespräch (`app/pages/erstgespraech/index.vue`).

## Adressen

| Adresse | Rolle |
| --- | --- |
| `pukalani.studio` | **kanonisch** — was Besucher und Google sehen |
| `www.pukalani.studio` | 301 auf die kanonische Form |
| `portfolio.pukalani.app` | technischer Host (ploi-Site, pm2, Prod-Port 3002) — 301 auf die Kundendomain |

Die Umleitung macht NICHT nginx, sondern der `domains`-Layer im laufenden
Prozess (`packages/domains/shared/siteRedirect.ts`): kanonischer Host und
Geschwister-Formen stehen in der Datenbank, die Middleware leitet alles andere
dorthin um. Ausgenommen sind `/.well-known/acme-challenge/**`, `/api/health`
und der i18n-Selbstabruf — ein Health-Check auf `portfolio.pukalani.app`
antwortet deshalb mit 200 und beweist denselben Build wie die Kundendomain.
Die Landkarte aller Hosts: `docs/content/2.architektur/6.hosts-und-ports.md`.

## Layer

`extends` in `apps/portfolio/nuxt.config.ts`, deckungsgleich mit
`apps/portfolio/site.manifest.ts` (`pnpm check:manifests` erzwingt das):

`themes` · `admin` · `analytics` · `domains` · `pages` — dazu implizit `core`
und `system`.

`brand` stand hier bis zum Rückbau am 2026-08-31 und lebt seither in
`apps/branding` (docs/plans/BRANDING-SUPPLY-INFRA.md).

## Entwickeln

```bash
pnpm --filter portfolio dev
```

Dev-Port **3005** (Prod-Port ist 3002 — zwei getrennte Achsen, nicht
verwechseln). Zweiter Slot 3015 für parallele Worktrees; beide sind in
`.claude/launch.json` eingetragen.

Frische Appwrite-Instanz aufsetzen:

```bash
cp apps/portfolio/.env.example apps/portfolio/.env   # Projekt + Keys eintragen
pnpm --filter portfolio bootstrap
```

Migrationen später einzeln über den zentralen Runner — nie ein Layer-Skript
direkt:

```bash
pnpm migrate --app portfolio
```

Rechtsseiten (Impressum/Datenschutz) entstehen als Entwürfe im `pages`-Layer
und werden im Dashboard gefüllt und veröffentlicht; der Footer verlinkt nur
Veröffentlichtes:

```bash
pnpm --filter portfolio seed:legal
```

## Prüfen

```bash
pnpm --filter portfolio test        # Unit (vitest)
pnpm --filter portfolio typecheck
pnpm --filter portfolio lint
pnpm --filter portfolio e2e         # Playwright gegen den Dev-Server (3005)
```

Die E2E-Suite ist ein LOKALES Smoke-Netz (auth-frei, in keinem Workflow) —
Seiten, Weiterleitungen, SEO-Routen, Wizard.

## Was hier anders ist als in anderen Apps

- **Sprachrichtung gedreht.** Der Inhalt kommt aus dem alten Portfolio-Repo, wo
  Deutsch auf `/` lag. Hier gilt die Monorepo-Konvention: Englisch ohne
  Präfix, Deutsch unter `/de/*`. `/en` und `/en/**` sind darum historische,
  veröffentlichte Adressen und leiten dauerhaft (301) um — die Quell-Muster
  in `routeRules` nie mit umbenennen.
- **Kein globales `app.pageTransition`.** Mit `mode: 'out-in'` blieb im
  Dashboard nach der ersten Client-Navigation der Seitenbereich leer
  (`UDashboardPanel` ist mehrwurzelig). Der Fade läuft nur noch je Route über
  `<NuxtPage :transition>` im Layout `site`.
- **SEO-Basis aus dem Request-Host** (`pukalani.seo.originFromRequest`): ein
  Prozess bedient zwei Hosts, `i18n.baseUrl` ist aber eine Env pro App — ohne
  den Schalter zeigten canonical/hreflang/og:url auf der Kundendomain
  weiterhin auf die Pukalani-Adresse.
- **Eigenes Portfolio-Design** (`app/assets/css/portfolio.css`, Syne +
  Glibbergreen), gescopet auf `body.portfolio-site`: Login und Dashboard
  behalten den Standard-Look.
- **Inhalte liegen als Daten im Code** (`app/data/*.ts`), nicht in Appwrite —
  CMS ist nur für die Rechtsseiten im Spiel.

## Konventionen (Kurzfassung)

- CRUD nur über `server/api/*` der Layer — nie Web-SDK-CRUD im Client
- `app.config.ts` gehört in `app/` (im Package-Root wird sie ignoriert)
- Domain-Types in `shared/types/`, Zod-Schemas als Factories, i18n-Keys statt
  hartcodierter Strings — Details in CLAUDE.md und docs/CONCEPT.md
