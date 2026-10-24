# 🏗️ Pukalani Core Layer – Nuxt Monorepo

> **Stand:** Konzept v2.1 (Juni 2026, Realitäts-Abgleich nach Phasen 1–10), in Teilen
> nachgezogen am **2026-08-16**.
>
> **Was aktuell ist:** die Ebenen-Darstellung (inkl. Kompositions-Layer `blueprint`),
> Stack & Katalog, Verzeichnisstruktur (24 Layer, 8 Apps), Layer-Tabelle,
> A9 (Deployment), A10 (Migrations), A11–A13, **A14 (Layer-Grenzen-Matrix, alle 24
> Layer + Durchsetzung inkl. Datentür-Backstop)**, **A15 (Mandanten-Architektur:
> Pool/Silo, Datentür, Publikum, Sperr-Stufen)**, Stolperfallen.
>
> **Was hier bewusst nicht steht:** die Betriebs-Wirklichkeit — welche Hosts es gibt,
> welche Site auf welchem Port läuft, TLS-Lineages, Cutover-Historie. Das ändert sich
> zu schnell für ein Konzept; dafür sind die **CLAUDE.md** (Hosts-Abschnitt),
> `docs/runbooks/` und `docs/content/2.architektur/6.hosts-und-ports.md` zuständig.

## Projektbeschreibung

Das Pukalani-Monorepo (Ordner und GitHub-Repo heißen weiterhin `maui-monorepo`) ist die gemeinsame Basis für alle Pukalani-Projekte. Ein zentraler Nuxt Layer (`packages/core`) liefert Auth, Appwrite-Integration, Design-Fundament, Typen und Utilities — einmal implementiert, per `extends` in beliebig viele Apps eingebunden. Darüber liegt eine **Feature-Layer-Ebene** (Themes, Comments, Admin, Billing, …), aus der sich Apps ihre Funktionalität zusammenstellen.

---

## Architektur: Drei Ebenen

```
packages/core            ← Ebene 1: Fundament (besitzt KEINE Appwrite Tables!)
packages/system             system = Schema-Eigentümer der Infra-Tabellen
packages/moderation         moderation = generisches Melde-System
                            Fundament-Layer hängen NIE von Produkten ab.

packages/blueprint       ← Ebene 2: KOMPOSITION („Bauplan")
                            Der EINZIGE Layer, der mehrere Produkt-Layer kennen
                            darf. Produkt-Kompositionen (Feed + Kommentare, …)
                            existieren genau EINMAL hier — nie je App.

packages/comments        ← Ebene 3: Produkt-Layer (eigenes Datenmodell
packages/posts              und/oder eigene UI-Welt)
packages/events
…

apps/*                   ← Ebene 4: dünne Apps, komponieren via extends
```

```ts
// apps/comments/nuxt.config.ts — eine App mit EINEM Produkt
export default defineNuxtConfig({
  extends: [
    '../../packages/comments',   // früher gelistet = höhere Priorität
    '../../packages/core',
  ],
})
```

**`blueprint` gehört in `extends` VOR die Produkt-Layer** — sonst gewinnt die
einzelne Produkt-Seite gegen die Komposition, und Pool und Silo zeigen
unterschiedliches Produktverhalten. Die echte Reihenfolge einer Mehr-Produkt-App:

```ts
// apps/platform/nuxt.config.ts (gekürzt)
extends: [
  '../../packages/themes',
  '../../packages/admin',
  '../../packages/blueprint',    // ← vor allen Produkt-Layern
  '../../packages/comments', '../../packages/posts', '../../packages/events',
  '../../packages/media', '../../packages/courses', '../../packages/activity',
  '../../packages/messages', '../../packages/pages', '../../packages/onboarding',
  '../../packages/analytics', '../../packages/moderation',
  '../../packages/core',
  '../../packages/system',       // ← Fundament zuletzt = niedrigste Priorität
]
```

Jeder Layer bringt ein `product.manifest.ts` mit, jede App ein `site.manifest.ts`
(Single Source der Produkt-Wahl). `pnpm check:manifests` erzwingt, dass beide zu
`extends`, `package.json` und der Migrations-Reihenfolge passen — neue Layer und
Apps immer mit Manifest anlegen.

**Kompositions-Regeln:**
- In `extends` haben **früher gelistete Layer Vorrang** vor späteren; die App selbst überschreibt alles
- Feature Layers extenden den Core **nicht** selbst — sie setzen seine Konventionen voraus, die App komponiert beides (hält Feature Layers entkoppelt und einzeln testbar)
- Apps werden dünn: `apps/comments` ist nur noch Komposition + Branding, die Logik lebt in `packages/comments`

**Entscheidungs-Framework — was gehört in den Core?**

| Code-Art | Kosten wenn ungenutzt | Konsequenz |
|---|---|---|
| Components, Composables, Types, Schemas, Utils | ~Null (tree-shaked, nur gebundelt was genutzt wird) | Core darf großzügig sein |
| Module, Plugins, globales CSS, Server Middleware | Laufen in **jeder** App | Core muss streng sein |

Vier Prüffragen pro Feature:
1. Braucht das praktisch jede App? (>90%)
2. Ist es produktneutral (keine Domain-Logik)?
3. **Hat es eigene Appwrite Tables? → Wenn ja: niemals Core** (härteste Regel)
4. Zieht es ein Modul/Plugin rein, das immer lädt? → Nur in den Core wenn Frage 1 = Ja

---

## Stack & Tooling

Verbindlich ist der **pnpm-Katalog** in `pnpm-workspace.yaml`, nicht diese Tabelle —
sie ist eine Momentaufnahme (Stand 08/2026) und veraltet zwangsläufig.

| Technologie | Version | Rolle |
|---|---|---|
| Nuxt | ^4.5.1 | Framework (Composition API, SSR) |
| Nuxt UI | ^4.10.0 | UI-Komponentenbibliothek (inkl. `UAuthForm`, `UEditor`) |
| Appwrite (self-hosted) | 2.6.1 dev/CI (seit 2026-10-23), prod noch 2.0.0 — MariaDB | Backend: Auth, TablesDB, Storage, Realtime, Presences |
| Pinia | ^4.0.2 (`@pinia/nuxt` ^1.0.1) | State Management — die beiden sind fest gekoppelt, nur gemeinsam bumpen |
| node-appwrite | ^26.2.0 | **Server SDK** — Auth + TablesDB via Server Routes |
| appwrite (Web SDK) | ^26.2.0 | **Nur Realtime** im Browser |
| Tailwind CSS | ^4.3.2 | Styling |
| Zod | ^4.4.3 | Schema Validation |
| @nuxtjs/i18n | ^10.6.0 | Internationalisierung (de + en) — gehört zur Nuxt-Generation (10.6 ↔ 4.5) und wird **mit Nuxt zusammen** gezogen |
| TypeScript | ^5.9.3, strict | Typsicherheit |
| pnpm Workspaces | Node 22 | Monorepo-Verwaltung |

> **Eine Caret-Range pinnt nichts** (`^4.4.8` erlaubt 4.5.1). Die wirkliche Version
> steht nur im Lockfile: `node -p "require('./apps/<app>/node_modules/<pkg>/package.json').version"`.
> Eine Version je Kernabhängigkeit erzwingt das CI-Gate `pnpm check:single-copy` —
> zwei Kopien brechen Typen oder Build, und welche gewinnt, entscheidet pnpms
> Hoisting, nicht das Lockfile.

> **SDK-Pinning:** Die SDKs werden für **Cloud**-Releases gebaut (daher Warnungen wie
> „built for 1.9.5" gegen einen älteren Server). REST ist abwärtskompatibel — dort ist
> die neueste Version okay. **Protokollnahe Features (Realtime, Presences) gegen die
> eigene Server-Version empirisch testen** — Versions-Tabellen helfen da nicht (A4).

> **Warum pnpm?** npm hoisted alles in Root `node_modules` → Phantom Dependencies → Bugs in CI/Deploy. pnpm erzwingt saubere Dependency-Deklaration pro Package, ist schneller und Standard im Nuxt/Vite Ecosystem.

> **Terminologie (Appwrite 2025+):** `Databases` → `TablesDB`, `Collections/Documents` → `Tables/Rows`. Immer die neue API nutzen (`tablesDB.createRow()` etc.) — nur sie unterstützt Transactions, Bulk Ops, Atomic Ops. Self-hosted Stand: **1.9.6** (TablesDB, neues SDK-Realtime-Protokoll + Query-gefilterte Subscriptions, Presences API, Realtime-Metriken, Resource-based API Keys, Multiple Application Domains pro Projekt, Sparse Updates — `updateRow` sendet nur geänderte Attribute).

---

## `packages/` Ordner – Strategie

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```
packages/   ← Geteilter Code — Bausteine, keine vollständigen Apps
apps/       ← Vollständige, deploybare Nuxt-Applikationen
```

| Package | Status | Inhalt |
|---|---|---|
| `packages/core` | ✅ Aktiv | Nuxt Layer: SSR-Auth, Appwrite-Fundament, RBAC, Design-Basis, Utils, GDPR-/Stats-Verträge |
| `packages/system` | ✅ Aktiv | Fundament: Schema-Owner der Infra-Tabellen (audit_logs, app_config, notifications, custom_themes, custom_fonts) + GDPR-Contributor, öffentliche Read-Routen /api/themes + /api/fonts |
| `packages/moderation` | ✅ Aktiv | Fundament: generisches Melde-/Report-System (reports-Table, Queue-Verträge, ReportButton) |
| `packages/blueprint` | ✅ Aktiv | **Kompositions-Layer** („Bauplan"): der EINZIGE Layer, der mehrere Produkt-Layer kennen darf — Produkt-Kompositionen (Feed + Kommentare, …) existieren genau einmal hier, damit Pool und Silo identisch funktionieren. Keine Produkt-Logik, keine Tables, kein `server/`. In `extends` VOR den Produkt-Layern |
| `packages/onboarding` | ✅ Aktiv | Fundament des Selbstbedienungs-Trichters: Wizard (`/start`), Einladungen + Beitritt (`/join`), Mitglieder-Verwaltung, Community-Einstellungen, Plan/Abo-Seiten. Besitzt die Service-Naht zum Control Plane |
| `packages/marketing` | ✅ Aktiv | **Chrome-Layer** der Marke Pukalani: Kopf- und Fußbereich der öffentlichen Seiten (pukalani.app + help.pukalani.app), Link-Auflösung `useMarketingSite()`, Marken-CSS und die i18n-Schlüssel beider Bauteile — keine Tables, keine Migrationen, keine Produkt-Logik |
| `packages/themes` | ✅ Aktiv | Theme-Studio (Galerie + Editor), Built-in-Katalog 26 × 11 (286 generierte Varianten, Quelle `theme.catalog.ts`, CI-Gate `check:themes`) + Custom Themes (OKLCH-Ramp-Generator), 2 Schrift-Rollen inkl. WOFF2-Uploads, Live-Propagation — Konzept: docs/referenz/THEMES-CONCEPT-V2.md |
| `packages/comments` | ✅ Aktiv | Kommentarsystem: targetId/targetType, Votes, Realtime — Spec: [[reddit-comment-system-setup]] |
| `packages/admin` | ✅ Aktiv | Dashboard (RBAC-Capabilities), User-Verwaltung, Moderations-Queue, Changelog, Audit, GDPR-Exporte, Theme-/Font-Admin-Routen |
| `packages/posts` | ✅ Aktiv | Community-Feed: Posts, Multiple-Choice-Polls (verdeckte Ergebnisse), offene Fragen, Scheduled Questions (publish-on-read), zweiphasiges Hide, Kommentare via `#comments`-Slot |
| `packages/events` | ✅ Aktiv | Event-Kalender: RSVP mit server-autoritativem Zähler, Landing Pages, Monats-Kalender, „Join live", Replays, Reminder ohne Cron, Paid-Tickets via billing-Vertrag — Plan: docs/archiv/EVENTS-V2.md |
| `packages/activity` | ✅ Aktiv | Activity-Feed: UI zum Core-Vertrag `recordActivity()` (Cursor-Pagination, Realtime, Gruppierung, 9 Ereignis-Typen). Seiten `/activity` + `/dashboard/community/activity`, Capability `activity.manage`. Hieß bis zur Umbenennung `packages/feed` — ältere Dokumente nennen ihn noch so |
| `packages/feedback` | ✅ Aktiv | Feedback-Widget: Button unten links, Popup (Gäste + Rate-Limit), Admin-Sichtung (`feedback.manage`) |
| `packages/billing` | ✅ Aktiv | Stripe: hosted Checkout/Portal, Webhook (Signatur/Allowlist/Stale-Guard), Entitlements + `useBilling` (Realtime), Fulfillment-Vertrag `registerCheckoutFulfillment` — Plan: docs/archiv/BILLING-STRIPE.md |
| `packages/courses` | ✅ Aktiv | LMS v1: Markdown-Lektionen, Enrollment + server-autoritativer Fortschritt, Builder mit Edit-Awareness, Zugang free/members/paid via `registerCourseAccessGuard` (billing-Entitlements) |
| `packages/media` | ✅ Aktiv | Verwaltete Bild-Galerie: Upload, Bildunterschriften, Sortierung, Publish-Status — die Inhalts-Quelle für Foto- und Portfolio-Seiten |
| `packages/messages` | ✅ Aktiv | Private 1:1-Nachrichten zwischen Mitgliedern derselben Community — mit Meldeweg, Sperre, Vertrauensstufen-Schwelle und Owner-Schalter (`requires: moderation, posts`) |
| `packages/pages` | ✅ Aktiv | Editierbare Inhaltsseiten (Impressum, AGB, Datenschutz) mit Editor und Sprachversionen; `body` als MEDIUMTEXT (off-row, kein Zeilenbudget) |
| `packages/tickets` | ✅ Aktiv | Support-Ticket-Board (Kanban): Listen + Karten mit DnD, Zuweisung, Checklisten, Anhänge, Kommentare via comments-Vertrag `operatorTargets`, Benachrichtigungen, optionale KI-Triage |
| `packages/analytics` | ✅ Aktiv | Cookielose Besucherstatistik via Plausible: Script-Id der eigenen Site eintragen, die Seiten melden sich selbst |
| `packages/domains` | ✅ Aktiv | Eigene Domain je Community: eintragen, DNS-Besitznachweis, Zertifikat bestellen, umschalten — die Pukalani-Adresse bleibt als Rückfall |
| `packages/brand` | ✅ Aktiv | Brand-Wizard „George" (KI-Markenberater): geführte Brand Foundation — Purpose, Werte, Archetyp, Stimme, Manifest. Sieben `brand_*`-Tabellen, server-only (Permissions `[]`) und nur auf der `branding`-Instanz (branding.supply) — Plan: docs/plans/BRAND-WIZARD-PHASE-1.md |
| `packages/runner` | ✅ Aktiv | AI-Runner-Board (nur Betreiber-Konsole): führt Tickets als Claude-Code-Läufe auf einem registrierten Rechner aus — Board-UI + Naht zum Daemon `tools/ai-runner`, Tables `runners`/`runs`/`run_events`, Capability `runner.manage` (nur admin) — Konzept: docs/plans/AI-RUNNER.md |
| `packages/control` | ✅ Aktiv | **Control Plane** (nur auf der Betreiber-Site `admin.pukalani.app`): Register der Communities (`communities`, `community_members`, `community_invites`), Provisionierung, Health-Übersicht, Entitlements, Stripe-Webhook. Migrationen `control-NNN` |
| `packages/appwrite-functions` | 🔜 Zukunft | Appwrite Functions (Webhooks, CRON, Events) — `functions/changelog-draft` existiert bereits standalone |

> v2.1: `packages/types`, `packages/utils` und `packages/config` gestrichen — zehn
> Phasen haben sie nicht gebraucht (`shared/types` im Core + Root-ESLint-Config decken
> das ab). Kein vorzeitiges Aufteilen — bei echtem Bedarf wieder aufnehmen.

**Feature-Layer-Begründungen:**
- **`themes`** — Das Multi-Theme-System (26 Themes × 11 Farbvariationen, Cookie-Persistenz) ist zu viel fürs Fundament. Core liefert Token-Struktur + ein Default Theme; wer Theme-Switching braucht, extended `themes`. Ein Kundenprojekt hat genau ein Branding.
- **`comments`** — Eigenes Datenmodell (comments, votes Tables) → Regel 3. Components, Server Routes, Realtime-Anbindung, Migrations, Types — alles im Layer, in jede App einbindbar.
- **`admin`** — Braucht den `AdminClient` mit erweiterten Rechten, viel UI, nicht jede App hat einen Admin-Bereich. Das `dashboard.vue` Layout zieht hierher um.
- **`billing`** — Eigene Tables (subscriptions), schwere Dependency (Stripe SDK). Webhooks laufen als Nitro Server Route im jeweiligen Layer (revidiert 2026-07-08, BILLING-STRIPE B1 — gleiche Codebasis/Verträge, Stripe retryt 3 Tage).
- Zukünftige SaaS-Bausteine (Forum, News, Polls) → je ein eigener Feature Layer.

> **Für jetzt:** Erst `core` bauen, dann `comments`. `themes`/`admin` entstehen wenn gebraucht — kein vorzeitiges Aufteilen.

---

## Dependency- & Kompositions-Strategie

### Third-Party-Bibliotheken sind keine Packages

`packages/` ist nur für **eigenen geteilten Code**. Nuxt UI, Pinia, Zod etc. sind npm-Dependencies — im Core installiert und als Modul registriert:

```ts
// packages/core/nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],
})
```

Module aus Layern werden in jeder extendenden App **mitgeladen** — wer den Core extended, hat Nuxt UI automatisch. Komponenten landen aber nur im Bundle wenn genutzt (tree-shaked): `UAuthForm` und pures Tailwind können problemlos nebeneinander auf derselben Page leben.

⚠️ Wegen `shamefully-hoist=false` müssen geteilte Dependencies (z.B. `@nuxt/ui`) **zusätzlich in der `package.json` jeder App** deklariert sein, nicht nur im Core.

### pnpm Catalogs — eine Version für alle

Damit Core, Feature Layers und Apps nie auf unterschiedlichen Versionen laufen, werden geteilte Dependencies zentral definiert:

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
catalog:
  nuxt: ^4.5.1
  '@nuxt/ui': ^4.10.0
  '@nuxtjs/i18n': ^10.6.0     # gehört zur Nuxt-Generation — mit Nuxt zusammen bumpen
  pinia: ^4.0.2
  '@pinia/nuxt': ^1.0.1       # fest an pinia 4 gekoppelt (0.11.x ↔ pinia 3)
  zod: ^4.4.3
  node-appwrite: ^26.2.0
  appwrite: ^26.2.0
```

```jsonc
// packages/core/package.json + apps/*/package.json
{ "dependencies": { "@nuxt/ui": "catalog:" } }
```

Versions-Bump = eine Stelle (`pnpm-workspace.yaml`), garantiert konsistent über das gesamte Monorepo.

### Drei Kompositions-Stufen pro Projekt

| Stufe | `extends` | Wann |
|---|---|---|
| **App mit Core** | `[features..., core]` | Braucht Auth / Appwrite / Design-Basis. Nuxt UI ist da, Tailwind pur trotzdem jederzeit möglich. |
| **App ohne Core** | keins / leer | Z.B. Landingpage ohne Backend — lebt trotzdem im Monorepo (profitiert von Catalogs, Tooling, Deploy-Workflow), pures Nuxt + Tailwind. |
| **Standalone** | — | One-Pager / Spezialfälle (z.B. GSAP-Page à la PUK) außerhalb des Monorepos. |

Keine Einbahnstraße: Braucht die Landingpage später Auth oder ein Formular mit Backend, genügt eine Zeile `extends: ['../../packages/core']` — und das Fundament ist da.

---

## Monorepo Verzeichnisstruktur

```
maui-monorepo/
│
├── packages/
│   │
│   ├── core/                              # ✅ Nuxt Layer – Fundament
│   │   ├── app/
│   │   │   ├── assets/css/main.css        # Tailwind 4 Basis + @source
│   │   │   ├── components/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginForm.vue      # UForm, UAuthForm als Vorlage (docs/referenz/AUTH-FORMS.md)
│   │   │   │   │   ├── RegisterForm.vue   # UForm, UAuthForm als Vorlage (docs/referenz/AUTH-FORMS.md)
│   │   │   │   │   └── LogoutButton.vue
│   │   │   │   ├── user/
│   │   │   │   │   ├── UserAvatar.vue
│   │   │   │   │   ├── UserMenu.vue
│   │   │   │   │   └── UserProfileForm.vue
│   │   │   │   ├── consent/
│   │   │   │   │   └── CookieBanner.vue   # rendert nur wenn config-gated aktiv
│   │   │   │   └── core/
│   │   │   │       └── ErrorPage.vue      # Fehlerseiten-Markup — error.vue wird
│   │   │   │                              # NICHT aus Layern aufgelöst, jede App
│   │   │   │                              # hat eine 3-Zeilen-error.vue als Wrapper
│   │   │   ├── composables/
│   │   │   │   ├── useCurrentUser.ts      # User-State (SSR-hydratisiert)
│   │   │   │   ├── useRealtimeRows.ts     # Realtime Wrapper (Web SDK, client-only)
│   │   │   │   ├── usePresence.ts         # Presences API (siehe Hinweis unten)
│   │   │   │   ├── useStorage.ts          # Appwrite Storage via Server Routes
│   │   │   │   ├── useSeo.ts
│   │   │   │   ├── useAnalytics.ts        # config-gated
│   │   │   │   ├── useCookieConsent.ts    # config-gated
│   │   │   │   ├── usePagination.ts
│   │   │   │   ├── useFormatDate.ts       # DE: dd.MM.yyyy (pure Utils in utils/format.ts)
│   │   │   │   └── useFormatCurrency.ts   # 1.234,56 € — useToast kommt aus Nuxt UI
│   │   │   │                              # (eigener Re-Export würde Auto-Import schatten)
│   │   │   ├── stores/                    # Layer-stores werden NICHT auto-gescannt —
│   │   │   │   └── useAuthStore.ts        # via imports.dirs (absoluter Pfad) registrieren
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                # Route Middleware → /login
│   │   │   │   └── guest.ts               # → / wenn eingeloggt
│   │   │   ├── layouts/
│   │   │   │   ├── default.vue            # Nav + Footer
│   │   │   │   └── auth.vue               # zentriert, kein Nav
│   │   │   ├── pages/
│   │   │   │   ├── login.vue              # Apps funktionieren out-of-the-box
│   │   │   │   └── register.vue           # (beides überschreibbar)
│   │   │   ├── plugins/
│   │   │   │   ├── auth.server.ts         # hydratisiert User aus h3 context
│   │   │   │   └── analytics.ts           # universal (SSR-Script-Tag!), doppeltes
│   │   │   │                              # Gate: enabled UND Consent
│   │   │   ├── utils/
│   │   │   │   └── appwrite.client.ts     # Web SDK Client (nur Realtime)
│   │   │   └── app.config.ts              # Pukalani Theme + pukalani.* Defaults — MUSS in
│   │   │                                  # app/ liegen (Package-Root wird ignoriert!)
│   │   │
│   │   ├── server/
│   │   │   ├── lib/
│   │   │   │   └── appwrite.ts            # createAdminClient + createSessionClient
│   │   │   ├── utils/
│   │   │   │   └── appwrite.ts            # Re-Export der lib — Nitro auto-importiert
│   │   │   │                              # server/utils ALLER Layer: Feature-Layer-
│   │   │   │                              # Routes nutzen die Clients ohne Importpfad
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts                # event.context.user pro Request
│   │   │   └── api/auth/
│   │   │       ├── signup.post.ts
│   │   │       ├── login.post.ts
│   │   │       ├── logout.post.ts
│   │   │       └── oauth/
│   │   │           ├── index.get.ts
│   │   │           └── callback.get.ts
│   │   │
│   │   ├── shared/
│   │   │   └── types/
│   │   │       ├── h3.d.ts                # H3EventContext.user Augmentation
│   │   │       └── appwrite.ts            # Base Types auf Models.Row
│   │   │
│   │   ├── schemas/
│   │   │   └── auth.ts                    # Zod: loginSchema, registerSchema
│   │   ├── i18n/
│   │   │   └── locales/                   # Modul-Konvention: i18n/locales/
│   │   │       ├── de.json                # Shared Strings — '@' als {'@'} escapen!
│   │   │       └── en.json
│   │   ├── scripts/migrations/
│   │   │   └── README.md                  # nur Konvention — Core hat KEIN Schema!
│   │   ├── .playground/                   # isolierte Dev-Umgebung (Port 3000)
│   │   ├── vitest.config.ts               # Unit Tests (tests/, explizite Imports)
│   │   ├── nuxt.config.ts                 # Module, runtimeConfig Skeleton, imports.dirs
│   │   └── package.json
│   │
│   ├── system/                            # Fundament-Layer (Infra-Tabellen)
│   ├── moderation/                        # Fundament-Layer (Reports)
│   ├── onboarding/                        # Fundament-Layer (Trichter, Mitglieder, Naht)
│   ├── marketing/                         # Chrome-Layer (Marken-Kopf/Fuß, keine Tables)
│   ├── blueprint/                         # KOMPOSITIONS-Layer — der einzige, der
│   │                                      # mehrere Produkt-Layer kennen darf;
│   │                                      # in extends VOR den Produkt-Layern
│   ├── themes/                            # Produkt-Layer
│   ├── comments/                          # Produkt-Layer (eigene Tables!)
│   ├── admin/                             # Produkt-Layer
│   ├── posts/                             # Produkt-Layer (Discussions)
│   ├── events/                            # Produkt-Layer
│   ├── activity/                          # Produkt-Layer (Activity Feed; hieß feed)
│   ├── messages/                          # Produkt-Layer (private Nachrichten)
│   ├── media/                             # Produkt-Layer (Galerie)
│   ├── pages/                             # Produkt-Layer (Inhaltsseiten)
│   ├── courses/                           # Produkt-Layer (LMS)
│   ├── tickets/                           # Produkt-Layer (Ticket-Board)
│   ├── feedback/                          # Produkt-Layer
│   ├── analytics/                         # Produkt-Layer (Plausible)
│   ├── domains/                           # Produkt-Layer (eigene Domain)
│   ├── billing/                           # Produkt-Layer (Stripe)
│   ├── brand/                             # Produkt-Layer (Brand-Wizard, nur branding-Instanz)
│   ├── runner/                            # Betriebs-Layer (AI-Runner-Board, nur Betreiber-Site)
│   └── control/                           # Control Plane (nur Betreiber-Site)
│
├── apps/                                  # dünn: Komposition + Branding
│   ├── comments/                          # extends: [comments, core] — der E2E-Anker
│   │   ├── app/                           # nur Overrides + app-spezifische Pages
│   │   ├── e2e/                           # Playwright (7 Specs, laufen in der CI)
│   │   ├── scripts/migrations/
│   │   ├── app.config.ts                  # Theme-Override + pukalani.* Gates
│   │   ├── site.manifest.ts               # Single Source der Produkt-Wahl
│   │   ├── nuxt.config.ts
│   │   ├── .env                           # eigene Appwrite-Instanz!
│   │   └── package.json
│   ├── platform/                          # Mehr-Mandanten-App (Pool + Kundenbereich)
│   ├── control/                           # Betreiber-Konsole (admin.pukalani.app)
│   ├── portfolio/                         # Davids eigene Site (Silo-Deployment)
│   ├── branding/                          # Brand-Wizard-Site branding.supply (Silo-Deployment)
│   ├── photos/ · marketing/ · help/       # weitere Apps
│   └── _template/                         # Vorlage für neue Apps
│
├── .github/workflows/                     # typecheck, lint, deploy
├── .nvmrc                                 # Node 22
├── pnpm-workspace.yaml
├── package.json                           # Root: nur dev tooling
├── tsconfig.json
└── .npmrc                                 # shamefully-hoist=false
```

---

## Architektur-Entscheidungen

### A1 — Core besitzt null Tables (verschärft)

**Der Core Layer stellt ausschließlich Code bereit — keine Daten, keine Tables, kein Schema.** Jede App hat ihre **eigene Appwrite-Instanz** (eigene Project ID, eigene Database), konfiguriert via `.env`. Sobald etwas ein eigenes Datenmodell mitbringt, ist es ein Feature Layer oder App-Code.

User-Profile: über Appwrite Account `prefs` lösen — keine `profiles` Table im Core.

- Kundenprojekte: Daten von Kunde A nie in derselben Instanz wie Kunde B (DSGVO)
- Eigene Projekte: saubere Trennung, unabhängige Deployments/Backups
- Lokal: OrbStack · Eigene Projekte: Hetzner · Kundenprojekte: Appwrite Cloud auf Kundenaccount
- Lokale Mails: Mailpit als SMTP-Sink (`_APP_SMTP_HOST=mailpit.local`, Port 1025,
  in der `.env` der Appwrite-INSTALLATION — nicht in der Console; die verwaltet nur
  Templates). UI: http://mailpit.local — Verifizierungs-/Recovery-Mails landen dort.

### A2 — SSR-Architektur mit zwei Clients ✨ neu

Der Core ist SSR-first (`ssr: true`). CRUD läuft **nie** direkt vom Browser gegen Appwrite, sondern über Nuxt Server Routes:

- **`createAdminClient()`** — API Key (`runtimeConfig.appwriteKey`, server-only). Für privilegierte Operationen: Signup, Admin-Aktionen, Rate-Limit-Bypass. Seit 1.9.0: **Resource-based API Keys** nutzen — Key nur mit den Scopes ausstatten, die der Core braucht (z.B. `sessions.write`), kein Vollzugriff.
- **`createSessionClient(event)`** — pro Request neu erstellt, liest das Session-Cookie. Agiert als der User.
- **Web SDK im Browser: nur Realtime.** Kein CRUD aus `<script setup>` (Doppel-Fetch, Hydration-Probleme).

**Kritische Regel:** Clients nie über Requests teilen — sonst leakt eine User-Session in fremde Responses.

Pattern: typisierter Appwrite-Call → typisierter `defineEventHandler` → typisierter `useFetch` auf der Page. SDK-Generics nutzen: `tablesDB.listRows<Comment>(...)` statt Casting.

**Key-Trennung (v2.1):** Ein Key sammelt sonst schleichend Scopes (Phase 3–11: von 4
auf ~17). Empfohlen sind **zwei Keys pro App-Instanz**:
- **Runtime-Key** (`nuxt-ssr-<env>`): `sessions.write`, `users.read/write`,
  `rows.read/write` (server-autoritative Zähler), `health.read` — liegt in der `.env`
- **Migrations-Key** (`migrations-<env>`): `databases.*`, `tables.*`, `columns.*`,
  `indexes.*` — nur für Migrationsläufe, kann nach Gebrauch rotiert/widerrufen werden

**Cross-Layer-Zugriff:** Feature Layer importieren die Client-Factories NICHT über
Cross-Package-Pfade — der Core re-exportiert sie in `server/utils/appwrite.ts`, und
Nitro auto-importiert `server/utils` aller Layer in alle Server Routes.

**✅ Rate Limiting (Phase 12):** Die Login-Route nutzt den AdminClient und umgeht
damit Appwrites Rate Limits — `server/middleware/05.rate-limit.ts` im Core drosselt
deshalb POST `/api/auth/login` auf 5 Versuche/Minute/IP (429 + Retry-After,
in-memory). ⚠️ Multi-Instanz-Produktion braucht einen geteilten Store (z.B. Redis
via Nitro Storage).

### A3 — Session-Cookie: `a_session_<PROJECT_ID>` ✨ neu

Cookie-Name **`a_session_<PROJECT_ID>`** statt Custom Name. Präzisiert (v2.1): JS kann
das httpOnly-Cookie nicht „lesen" — der **Browser sendet es automatisch** bei Requests
und WebSocket-Handshakes an die Appwrite-Domain (gemeinsame Root-Domain!), und der
**Appwrite-Server akzeptiert es unter diesem Namen** als Session → **Realtime läuft
authentifiziert** statt anonym. Genau der Use Case des Kommentarsystems.

Voraussetzungen:
- Appwrite-Endpoint auf einer **Subdomain derselben Root-Domain** wie die App (z.B. App `comments.example.com`, Appwrite `api.example.com`) — Custom Domain pro Projekt auf die self-hosted Instanz legen
- Cookie auf der Root-Domain setzen (`Domain=.example.com`)
- Immer `httpOnly: true, secure: true, sameSite` setzen (XSS-Schutz)
- 1.9.0 unterstützt **Multiple Application Domains pro Projekt** (CORS + OAuth) — pro App alle Domains in der Appwrite Console registrieren (auch `localhost` für Dev)

Fallback dokumentiert: Custom Name (`app-session`) wenn kein authentifiziertes Browser-Realtime nötig (einfacher, keine Custom Domain).

### A4 — Realtime & Presences ✨ aktualisiert 2026-07-05 (P1/P2 umgesetzt seit 2026-07-01)

- **Eine geteilte, JWT-authentifizierte SDK-Realtime** im Core
  (`core/app/composables/useRealtimeClient.ts`): `useRealtimeRows`, Presence
  und Config-Flags multiplexen über DENSELBEN Socket
  (`Channel.tablesdb().table().row()`, optional server-seitige `queries`;
  der client-seitige `where`-Filter bleibt als Sicherheitsnetz).
  JWT via `GET /api/auth/realtime-token` (15 min, Client refresht);
  **Cookie-Client NIE mit JWT mischen** → Appwrite-403.
- **AUSNAHME:** `useRealtimeAccount` bleibt bewusst cookie-nativer WS —
  Instant-Session-Revoke hängt am Cookie-Close-Signal. NICHT konsolidieren.
- **Presences API: self-hosted seit 1.9.5, vollständig umgesetzt** — EINE
  Presence pro User (`presenceId=userId`, metadata trägt scope/action/typing);
  der WRITE läuft server-seitig (`POST /api/presence/heartbeat`, Admin-Client),
  weil der Browser in der SSR-Cookie-Architektur keine SDK-Session hat.
  Details: CLAUDE.md + OPEN-ITEMS (Phase 18).
- ⚠️ **Channel-Prefix ≠ Event-Prefix:** Subscription-Channels nutzen `tablesdb.…`, die Event-Strings im Payload weiterhin `databases.…` — beim Filtern auf Suffix matchen (`.create`, `.update`, `.delete`).
- Realtime braucht einen gesunden `appwrite-realtime`-Container (Swoole-Crash
  → `docker compose up -d --no-deps appwrite-realtime`).
- **Historie (v2.1, Phasen 10–31):** Bis Server 1.9.0 war das neue SDK-Protokoll
  Cloud-only („Missing channels", `queries[]` ignoriert) — `useRealtimeRows`
  lief auf einem nativen WebSocket-Client mit Legacy-URL-Protokoll und
  client-seitigem `where`-Filter. Mit dem 1.9.5-Upgrade (Phase 28) und dem
  P1-Rückbau (Phase 32) abgelöst.

### A5 — Analytics & DSGVO-Consent: im Core, config-gated ✨ neu

Code liegt einmal im Core, ist aber tot bis die App ihn aktiviert:

```ts
// apps/<app>/app.config.ts
export default defineAppConfig({
  pukalani: {
    analytics: { enabled: true, provider: 'plausible' },
    consent: { enabled: true },
  },
})
```

Core-Default: `enabled: false`. Das `analytics.client.ts` Plugin prüft das Gate **bevor** irgendein Script lädt. Internes Tool = komplett clean, öffentliche Seite = drei Zeilen.

### A6 — Breaking Changes im Core

1. Additive Changes bevorzugen (neue Props mit Default statt umbenennen/entfernen)
2. Core-Änderungen immer in eigenem Commit (`BREAKING CHANGE(core):` Prefix)
3. Vor Core-Update alle Apps lokal kurz starten

Kein formales semver solange solo — Git-Tags als optionale Checkpoints, mittelfristig CHANGELOG.md.

### A7 — Override-Strategie

App > früher gelisteter Layer > später gelisteter Layer. `app.config.ts` wird tief gemergt — App überschreibt nur was nötig. Der Core ist kein Gefängnis: jede App kann gezielt Components, Layouts, Pages ersetzen (wichtig für Kunden-Branding).

### A8 — Kundenprojekte: Monorepo oder separat?

| Szenario | Empfehlung |
|---|---|
| Kunde bekommt keinen Code-Zugriff | Im Monorepo unter `apps/` |
| Kunde bekommt eigenes Repo | Separates Repo, Core als Git Submodule |
| Kunde deployed/wartet selbst | Separates Repo, Core als privates npm Package |

Für jetzt: alles im Monorepo. Migration raus ist einfacher als rein.

### A9 — Deployment: CI baut, ploi hält die Sites

**Seit 2026-07-23 baut der App-Server nichts mehr.** GitHub Actions (`deploy.yml`) baut
alle Apps und schiebt nur das fertige `.output` per rsync auf den Server
(Symlink-Flip + `pm2 reload`, Zero-Downtime Stufe 2). Feuert nur, wenn der
Test-Workflow auf `main` grün war.

Grund: der App-Server ist eine CX23 (2 Cores / 3,7 GB) — zwei parallele Nuxt-Builds
haben ihn per OOM-Kill (137) zerlegt. Diese RAM-Regel betrifft heute nur noch den
Fallback.

**Fallback** (Actions down): die ploi-Deploy-Scripts der Sites sind unverändert
funktionsfähig und bauen auf dem Server —

```
Root Path:      apps/<app>
Build Command:  pnpm --filter <app> build
Start Command:  node apps/<app>/.output/server/index.mjs
```

Env Vars in ploi.io als Server Environment Variables je Site (nie als Datei, nie im
Repo). ploi „Quick Deploy" bleibt AUS. Die `control`-Site hat bewusst kein
Repository — für sie gibt es keinen ploi-Fallback, sondern das Runbook.

### A10 — Migrations

Appwrite hat kein eingebautes Migrations-System → manuelle Scripts, nie automatisch im Deploy. **Core hat kein Schema** — nur die Konvention + README. Feature Layers und Apps bringen eigene Migrations mit (z.B. `packages/comments/scripts/migrations/002-target-architecture.ts`). Beim Server-Upgrade (z.B. 1.8→1.9) immer die Appwrite-Migration sauber durchlaufen lassen.

**Konventionen:**
- **Aufruf IMMER über den zentralen Runner:** `pnpm migrate --app <app>`
  (`scripts/migrate.mjs`). Bei mehreren Apps ist `--app` **Pflicht** — genau dafür
  gibt es ihn: ein direkter `node --env-file=apps/<app>/.env …`-Aufruf auf ein
  Layer-Script trifft bei einem Tippfehler die falsche Instanz.
- **Idempotent**: 409 (existiert bereits) → loggen und überspringen; Scripts sind
  beliebig oft wiederholbar, kein Migrations-State nötig
- **Indizes NUR über die Fabrik** `scripts/migrations-lib/indexRetry.mts` — einmal je
  Datei `const { indexStep } = createIndexSteps(tablesDB, databaseId)`, dann
  `await indexStep('Index x.idx_y', { tableId, key, type, columns })`. Sie ruft
  `createIndex` selbst und bringt Retry + Cache-Anstoß mit. **Auf `available` zu
  pollen reicht nicht:** der Index-Endpunkt liest die Spaltenliste aus Appwrites
  Metadaten-Cache, der dem Spalten-Status hinterherhinkt (in der CI zweimal live
  erwischt). Rohes `tablesDB.createIndex` in `packages/*/scripts/migrations/**`
  verbietet ESLint — der einzige greifende Wächter, weil diese Scripts in keiner
  tsconfig liegen.
- Ein Script pro Schema-Änderung, fortlaufend nummeriert; läuft mit dem Migrations-Key (A2)
- **Kein Migrations-Register in der DB** — die Labels (`control-019`, `system-021`, …)
  sind reine Anzeige, die Idempotenz kommt vom 409. „Welche Migration lief hier?" ist
  damit nicht beantwortbar, wohl aber, was dabei herauskam: `pnpm ops:schema-parity`
  vergleicht die Spalten über alle Instanzen und meldet, wo eine fehlt.

### A11 — Environment Variables

```bash
# apps/<app>/.env.example
NUXT_APPWRITE_KEY=                          # server-only! API Key, nie public
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.<app-domain>/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=
NUXT_PUBLIC_APPWRITE_DATABASE_ID=
NUXT_PUBLIC_APP_URL=https://<app-domain>
```

`runtimeConfig` im Core mit Leer-Defaults definieren (Typ-Inferenz), echte Werte aus `.env`/Host. **Der API Key gehört nie in `runtimeConfig.public`.** Nie `.env` committen, nur `.env.example`. ⚠️ Jede `NUXT_*`-Variable braucht ihren Gegenpart im runtimeConfig-Skeleton — sonst mappt sie ins Leere (Beispiel: `NUXT_PUBLIC_APP_URL` ↔ `public.appUrl`). Dazu `NUXT_APPWRITE_MIGRATIONS_KEY` für den separaten Migrations-Key (A2).

> **Eine fehlende Env-Variable wird nicht rot.** `platform` hatte kein `NUXT_SMTP_*`,
> also ging für jede Kunden-Community nie eine Benachrichtigungs-Mail raus — die App
> lief, die Seiten antworteten, nur die Mail blieb aus. Zwei Netze: `pnpm ops:site-env`
> liest über ssh die Schlüssel**namen** jeder Server-`.env` (Werte bleiben dort) und
> hält sie gegen eine Pflicht-Liste; zur Laufzeit schreibt der Mailer beim ersten
> verworfenen Versand einmal ins Log. Neue Pflicht-Variable ⇒ in die Liste im Skript.

### A12 — Node.js, Ports, Git

- `.nvmrc`: Node 22 (nvm lokal, ploi.io + GitHub Actions via `node-version-file`)
- Ports (fest je App in ihrer `package.json`): Core-Playground 3000 · comments 3001 ·
  _template 3002 · photos 3003 · control 3004 · portfolio 3005 · platform 3006 ·
  marketing 3007 · help 3008 · Docs-Site 4000 (`pnpm dev:docs`).
  Parallel: `pnpm --parallel -r dev`
- **Eigener Port im Worktree:** `pnpm --filter <app> dev -- --port N` wirkt **nicht**
  (das `dev`-Skript hat `--port` fest verdrahtet) — richtig ist
  `pnpm --filter <app> exec nuxi dev --port N`. Nuxt weicht bei belegtem Port still
  auf einen anderen aus, ein „Beweis" misst dann den falschen Server.
- Branches: `main` / `dev` / `feature/*` / `fix/*` · Conventional Commits
- `.gitignore`: `.env*` (außer `.env.example`), `.nuxt/`, `.output/`, `node_modules/`

### A13 — Testing

Vitest Unit Tests (`pnpm -r test`) für Composables und pure Regeln ohne
Browser-Abhängigkeit. Component Tests weiterhin nicht (Nuxt Component Testing mit
Layers fehleranfällig).

**E2E mit Playwright ist gebaut** (die frühere Bedingung „erst wenn Core stabil" ist
eingelöst): 7 Specs in `apps/comments/e2e`, Base-URL über `PW_BASE_URL`
überschreibbar. Die CI (`e2e.yml`) fährt dafür eine echte Wegwerf-Appwrite. Zwei
Dinge, die man nicht ändern sollte: Tests laufen gegen den **Dev**-Server (der jede
Seite beim ersten Zugriff kompiliert → großzügige Budgets statt der 30-s-Standards),
und Playwrights **gebündeltes Chromium** statt `channel: 'chrome'` — System-Chrome
weckt auf macOS einen Updater, dessen Prozess die Worker-Sockets erbt und den
Teardown nie beenden lässt.

### A14 — Layer-Grenzen-Matrix & Durchsetzung ✨ neu

Jeder Layer ist ein **Vertrag**: was er besitzen darf und was nie. Eine Datei erbt den
Vertrag ihres Layers — Regeln stehen auf **Layer-Ebene**, nicht pro Component (sonst
veralten sie beim Verschieben). Eine Component in `themes/` ist „kein Appwrite" nicht weil
in ihrer Datei eine Regel steht, sondern weil sie im Themes-Layer liegt.

**Fundament** — hängt nie von einem Produkt ab:

| Layer | darf besitzen | darf nie | hängt ab von |
|---|---|---|---|
| `core` | Auth, Client-Factories, RBAC-Matrix, SSR-Session, **Datentür `tenantDb`**, Registry-Verträge (`notify`, `sendMail`, `aiComplete`, GDPR-/Stats-/Join-/Host-Contributors), Base-UI, Shared-Utils | Produkt-Domäne, **eigene Tables** (A1) | — |
| `system` | `audit_logs`, `app_config`, `app_secrets`, `notifications`, `activities`, `custom_themes`, `custom_fonts`, `community_branding`, `community_navigation`, `community_redirects`, `community_seo`, `account_handles`, `community_handles` (+ Bucket `fonts`) | Produkt-Domäne, UI-Welt | core |
| `moderation` | `reports`, Melde-Erfassung + Queue + Lifecycle, generische Melde-UI | Domänen-Wissen, Konsequenz-Logik | core |
| `marketing` | Kopf- und Fußbereich der Marke Pukalani (Chrome der öffentlichen Seiten), Link-Auflösung `useMarketingSite()`, Marken-CSS, i18n-Schlüssel beider Bauteile | Tables, Migrationen, Produkt-Logik; ein Produkt voraussetzen (der Chrome muss auf jeder Silo-Site tragen) | core |

**Komposition:**

| Layer | darf besitzen | darf nie | hängt ab von |
|---|---|---|---|
| `blueprint` | Die Verdrahtung mehrerer Produkte (Layouts, Chrome, Kompositions-Seiten) — genau einmal, für Pool **und** Silo | Produkt-Logik, Tables, **`server/`** | posts, comments, events, courses (+ core) |

**Plattform & Betrieb** — laufen nicht auf Mandanten-Hosts:

| Layer | darf besitzen | darf nie | hängt ab von |
|---|---|---|---|
| `control` | `communities`, `community_members`, `community_invites`, `websites`, `entitlements`, `product_catalog`, `community_plans`, `invite_codes`, `invite_requests`, `provisioning_jobs`, `abuse_reports`, `customer_feedback*` | Auf einem Mandanten-Host laufen; Pool-Daten direkt lesen (kein Pool-Schlüssel) | core, system |
| `onboarding` | Trichter/Wizard, `/join`, Mitglieder-Verwaltung, Community-Einstellungen — **und die Service-Naht zum Control Plane** | Eigene Tables (die Wahrheit liegt im Control Plane) | core, (control über die Naht) |
| `runner` | `runners`, `runs`, `run_events` — AI-Runner-Board + Naht zum Daemon `tools/ai-runner`; Capability `runner.manage` (nur admin) | Auf Mandanten-Hosts laufen; selbst committen/pushen oder Modi/Modelle/Budget entscheiden (Allowlist und Commit gehören dem Daemon auf dem Mac) | core |

**Produkt-Layer:**

| Layer | darf besitzen | darf nie | hängt ab von |
|---|---|---|---|
| `themes` | Tokens, CSS, Theme-Studio, Ramp-Generator, Color-Mode | Appwrite-Tables (die gehören `system`), Auth, Business-Logik | core, system |
| `admin` | `changelog`, Dashboard-Shell + Nav-Registry, Moderations-Queue-UI | Produkt-interne Imports, Produkt-Domänen-Logik | core, (moderation, system) |
| `comments` | `comments`, `comment_votes`, `guest_authors`, `embed_sites` | Admin-Logik, fremde Produkt-Tables | core, moderation |
| `posts` | `community_posts`, `post_votes`, `poll_votes` | — | core, moderation |
| `events` | `events`, `event_rsvps`, `event_votes`, `event_tickets` | Stripe-Code (nur Vertrag + `lookup_key`) | core, (billing über den Vertrag) |
| `courses` | `courses`, `lessons`, `enrollments`, `lesson_progress` | Stripe-Code (nur `registerCourseAccessGuard`) | core, (billing über den Vertrag) |
| `messages` | `conversations`, `conversation_members`, `messages`, `message_blocks`, `message_settings` | — | core, moderation, posts |
| `media` | `media_items` | — | core |
| `pages` | `pages` | — | core |
| `tickets` | `tickets`, `ticket_lists`, `ticket_files`, `ticket_watchers` | — | core, (comments über `operatorTargets`) |
| `analytics` | `analytics_settings` | Eigenen Tracker bauen (nur Plausible-Script-Id) | core |
| `billing` | `billing_customers`, `billing_subscriptions`, `stripe_settings` | Produkt-Wissen (Fulfillment nur über `registerCheckoutFulfillment`) | core |
| `brand` | `brand_profiles`, `brand_steps`, `brand_messages`, `brand_shares`, `brand_invites`, `brand_access`, `brand_events` — **server-only** (Permissions `[]`, `rowSecurity: false`) und nur auf der `branding`-Instanz | Andere Produkt-Layer kennen; eigene Theme-Tokens/Presets erfinden (Design-Richtungen werden aus `themes` KONSUMIERT, nie dort geschrieben); KI-Transport selbst bauen | core, system, (themes über den Preset-Vertrag) |
| `activity` | **keine eigene Table** — liest `activities` (system) über den Core-Vertrag `recordActivity()` | Eigenes Schema | core, system |
| `feedback` | Widget + Admin-Sichtung + Naht — **keine eigene Table** (`customer_feedback*` liegen im Control Plane) | Eigenes Schema | core, (control über die Naht) |
| `domains` | Oberfläche + Prüfweg — **keine eigene Table** (die Domain steht an `communities`/`websites`) | Eigenes Schema, TLS-Anforderung selbst auslösen | core, (control über die Naht) |

> **Vier Layer besitzen bewusst keine Tabelle** (`activity`, `feedback`, `domains`,
> `marketing`) und einer bewusst kein `server/` (`blueprint`). Das ist kein Rückstand, sondern die
> Aussage der Matrix: ein Layer darf eine Oberfläche haben, ohne Schema-Eigentümer zu
> sein — wer das „nachrüstet", bricht die Grenze.

> **`brand` ist der erste Produkt-Layer, dessen Tabellen auf genau EINER Instanz
> stehen** — seit der Kehrtwende vom 2026-08-31 (docs/plans/BRANDING-SUPPLY-INFRA.md)
> ist das `branding` (branding.supply, vorher P1b: `portfolio`) — sie stehen deshalb
> im `BRANDING_SOLL` von `verify-schema-parity.mjs` und NICHT in der instanzweiten
> Spalten-Parität.
> Nach oben hängt er an drei Nähten und an keiner vierten: `signupAdmission`
> (core-Registry — der Einladungscode entscheidet über die Kontoanlage),
> `aiComplete()` (KI-Transport; die Gates und die Antwort-Klemmung bleiben beim
> Konsumenten) und die Theme-**Presets** aus `themes` als EXPLIZITER Vertrag —
> gelesen, nie geschrieben. Zu keinem anderen Produkt-Layer gibt es eine
> Verbindung; die Beta-Zulassung (`brand_access` + `app_config.brandAdmissionMode`)
> ist eine eigene Grenze und nicht die Rollen-/Capability-Matrix.

**Durchsetzung — dreistufig** (Stufen 1–2 ausführlich:
[MODERATION-AND-LAYER-BOUNDARIES.md](referenz/MODERATION-AND-LAYER-BOUNDARIES.md);
Stufe 3 kam 2026-07-27 dazu und steht dort noch nicht):

1. **Architektonisch (primär):** Cross-Layer-Kopplung läuft heute implizit über Auto-Import
   bzw. String (`tableId: 'comments'`). Neue Abhängigkeiten werden als **explizite, typisierte
   Verträge** gebaut (Konsument importiert sichtbar aus dem Eigentümer-Layer) — sichtbar,
   typsicher, lint-bar. Bestehende Verträge: `notify()` (Feature → core-Notification),
   `pukalani.admin.modules` (Feature → admin-Dashboard-Nav), `myOpenReportTargetIds()`
   (comments → moderation) und `registerUserDataContributor` (Feature-Layer registrieren
   GDPR-Export/-Löschung ihrer Daten bei core — core orchestriert `exportUserCompletely`/
   `deleteUserCompletely` ohne Feature-Schema-Wissen; seit 2026-07-02) sowie
   `registerDashboardStatsContributor` (Feature-Layer liefern ihre Dashboard-
   Kennzahlen — admin/stats kennt keine Feature-Tabellen mehr; seit 2026-07-02).
   Seit 2026-07-09/10 dazu: `openReportsForTarget()`/`resolveReportsForTarget()`
   (moderation-Verträge für Assist/Resolve/Bulk), `registerReportEscalationHandler`
   (moderation zählt Meldungen, der Target-Owner zieht die Konsequenz — comments
   nutzt ihn für den Auto-Hide-Threshold `pukalani.comments.autoHideReports`),
   `registerEmbeddableRoute` (core setzt `frame-ancestors 'self'` auf alle SSR-
   Seiten; framebare Routen wie comments `/embed` registrieren sich mit ihrer
   Origin-Allowlist), `hideCommentRow`/`hideCommentDescendants` (comments-Owner-
   Vertrag fürs Zweiphasen-Hide + Cascade — admin-Routen und Auto-Hide teilen ihn)
   sowie die Core-Bausteine `aiComplete()`/`aiCompleteJson()` (KI-Transport, Gate
   `pukalani.ai` + `NUXT_AI_KEY`; Policy beim Konsumenten), `sendMail()`/`notify()`-
   E-Mail-Zweig (SMTP via `NUXT_SMTP_*`, Opt-in-Prefs, Digest-Sweep) und
   `createMicrocache()` (user-agnostische GET-Antworten, Single-Instanz).
   Dokumentierte Matrix-Ausnahme: core SCHREIBT die system-Tabellen `audit_logs`
   (authAudit) und `notifications` (notify) sowie liest `app_config` — bewusste
   Fundament→Fundament-Nutzung, system bleibt reiner Schema-Owner + GDPR/Stats-Anbieter.
2. **ESLint `no-restricted-imports` (Backstop):** pro `files`-Scope in `eslint.config.mjs` —
   themes verbietet `*appwrite*`/`@pukalani/*`, Produkt-Layer verbieten andere
   `@pukalani/`-Produkt-Layer, Fundament-Layer (core/moderation) verbieten jeden
   Produkt-Import. Fängt *künftige* explizite Kopplung; die implizite löst Stufe 1.

3. **ESLint `no-restricted-syntax` — die harte Grenze (seit 2026-07-27):** in
   `server/api/**` **und** `server/plugins/**` der gepoolten Layer ist rohes
   `.tablesDB` verboten; Datenzugriff läuft über die Datentür `tenantDb(event)`.
   Sie gilt heute für `comments`, `posts`, `pages`, `moderation`, `events`,
   `courses`, `media`, `messages`, `activity`, `analytics` und `admin` — **neue
   Pool-Layer gehören in die Liste**, sobald ihre Tabellen `communityId` tragen.
   `server/plugins/**` kam nachträglich dazu: wer einen `H3Event` bekommt, bedient
   einen Request und gehört hinter dieselbe Tür wie eine Route (ein Stats-Contributor
   zählte sonst pool-weit in eine Kunden-Ansicht). Eventlose Sweeps brauchen eine
   begründete `eslint-disable`-Zeile, keine Aufweichung der Regel.

   **`admin` steht mit im Scope, obwohl der Layer keine mandantenfähige Tabelle
   besitzt** — seine Routen LESEN fremde (die Nutzer-Detailseite zog `comments`
   ungescopt pool-weit). Wer in einer host-gebundenen Ansicht fremde Zeilen liest,
   gehört hinter dieselbe Tür wie ihr Eigentümer. Besitz ist hier also nicht das
   Kriterium, sondern Zugriff.

   Zweiter Wächter derselben Familie: rohes `tablesDB.createIndex` in
   `packages/*/scripts/migrations/**` (A10). Er ist dort der **einzige** greifende —
   Migrations-Scripts liegen in keiner tsconfig und werden von `pnpm -r typecheck`
   nie gesehen.

> **`system` und `moderation` existieren** (2026-06-27). Der `system`-Layer besitzt die
> Infra-Tabellen, die core nutzt (Auth-Audit, Config, Notifications) — die frühere
> core→admin-Inversion ist damit aufgelöst (Schema-Ownership liegt nicht mehr im admin-Feature).
> `moderation` besitzt das generische Melde-/Report-Modell.
> Seit 2026-07: eine `presence`-TABELLE gibt es nicht mehr (Presence läuft komplett über
> die Appwrite Presences API, A4); dafür besitzt system die Theme-Tabellen `custom_themes`/
> `custom_fonts` (Migrationen 009–013) und serviert sie über die öffentlichen Read-Routen
> `GET /api/themes` + `/api/fonts` — die Control-UI liegt im themes-Layer, die Admin-CRUD-Routen
> im admin-Layer (Schema-Owner ≠ UI-Welt bleibt gewahrt).

### A15 — Mandanten-Architektur: eine Datentür ✨ neu 2026-08-16

#### Zwei Betriebsarten, drei Zustände

`event.context.tenant` (`core/shared/types/tenant.ts`) beschreibt den Mandanten
**pro Request**:

| Modus | Bedeutung | Isolation durch |
|---|---|---|
| `pool` | Viele Communities in **einem** Appwrite-Projekt (der Normalfall) | Zeilen-Scope + Row-Permissions |
| `silo` | Eine Community mit **eigenem** Projekt/Deployment | Das Projekt selbst |
| *kein Kontext* | Single-Tenant-Betrieb (Playground, `help`, `marketing`) | Entfällt |

**Die Silo-Regel** (Davids Entscheidung 2026-08-04): Isolation im **Code** und im
**Deployment** sind zwei Entscheidungen. Ein neues Produkt bekommt **immer** einen
eigenen Layer, aber standardmäßig **keine** eigene Site/Instanz — jede Instanz
kostet Migrationen, Env-Drift, TLS und Schema-Parität. Eine eigene Site nur mit
kundenförmigem Grund.

#### Wo die Wahrheit liegt

Die Community selbst (`communities`, `community_members`, `community_invites`,
Plan, Abo, Domain) lebt im **Control-Plane-Projekt**; die Inhalte leben im
**Runtime-Projekt**. Beide Projekte haben getrennte Schlüssel und sehen einander
nicht — deshalb läuft alles, was Mitglieder, Rollen oder Vertrag betrifft, über
die **Service-Naht** (`onboarding` → `control`, s. A14), und deshalb kann das
Control Plane z. B. kein Pool-Label vergeben.

#### Die Datentür

In `server/api/**` mandantenfähiger Layer läuft Datenzugriff über
`tenantDb(event)` — **nicht** über `createAdminClient().tablesDB` oder
`createSessionClient().tablesDB`:

- `list` / `find` / `count` hängen den Mandanten-Filter **immer** an
- `get` / `update` / `remove` belegen die Zugehörigkeit **vor** der Aktion
- `create` stempelt den Mandanten **und** setzt die Row-Permissions

Warum eine Tür statt Disziplin: Isolation hing vorher an drei Dingen, an die man
sich erinnern musste. Am 2026-07-26 hat genau das versagt — drei Moderations-Routen
lasen fremde Zeilen per ID.

**Zwei Fragen, zwei Felder** (seit 2026-08-02):

- `as` = **welcher Client** zugreift (`'member' | 'operator'`) — Technik:
  Row-Permissions, Admin-Sicht für Moderation
- `actor` = **wer handelt** (`'member' | 'guest' | 'operator'`, Default = `as`) —
  Fachlichkeit: daran hängen die Sperre (`actorFacesContentLock`) und der
  Beitritt-durch-Schreiben (`actorJoinsByWriting`)

Getrennt, weil viele Routen `'operator'` nur wegen der Permissions wählen —
gehandelt hat trotzdem ein Mitglied. Solange beides ein Feld war, meldeten sich
diese Routen still von der Sperre ab. Drei Actor-Werte, weil ein **Gast**-Kommentar
Inhalt ist (Sperre gilt) und trotzdem niemanden zum Mitglied macht (kein Konto).

> **Die Mandanten-Id kommt NIE vom Aufrufer.** `stripTenantKey()` entfernt sie aus
> jedem Body — sonst schreibt ein durchgereichtes Objekt in einen fremden Mandanten.

#### `tenantId` ≠ `communityId` — die teuerste Verwechslung

Beide stehen im Kontext und meinen Verschiedenes:

- **`tenantId`** ist der **Wert im Zeilen-Stempel**. Die Spalte heißt seit E8-3
  `communityId`, der Kontext-Wert blieb `tenant.tenantId` —
  `scopeRowFor()` schreibt also `communityId: tenant.tenantId`. Das sieht wie ein
  Fehler aus und ist keiner.
- **`communityId`** ist `communities.$id`, die kanonische Site-Id. Sie trägt das
  **Lese-Publikum** (`read(label:<communityId>)`) und wird von
  `requireCommunityPermission` verlangt (fehlt sie → fail-closed).

#### Publikum statt Sichtbarkeits-Flag

`tenantRowPermissionsFor()` kennt drei Publika: `'members'` (Default) →
`read(label:<communityId>)`; `'public'` → `read(any)` **nur**, wenn die Community
öffentlich ist, sonst fällt es auf `members` zurück; `'moderators'` → das
Moderatoren-Label. Ohne `communityId` gibt es **kein** Read statt `any` —
fail-closed.

**Das Site-Label heißt „ist Mitglied dieser Community"** (A5, seit 2026-07-29):
`06.community-label.ts` vergibt es genau dem, der eine `community_members`-Zeile
mit Zugang hat. Ein Label ist ein **Lese-Publikum, keine Rolle** — autorisiert
wird über `requireCommunityPermission`. Mitgliedschaft entsteht durch genau zwei
Ereignisse: Kontoanlage auf dem Mandanten-Host und den **ersten eigenen
Schreibvorgang** (abgefangen in der Datentür, statt in zwanzig Routen). Ein
Seitenaufruf löst bewusst nichts aus — sonst wäre jeder Vorbeisurfer Mitglied und
„Zugang entziehen" wirkungslos.

#### Sperren: zwei Stufen, zwei Wirkungen

`communities.suspension` (`core/shared/communitySuspension.ts`):

- **`'abuse'`** → der Resolver nimmt die Community vom Netz: **404** wie ein
  unbekannter Host, Seite und API.
- **`'billing'`** → **nur-lesend**, und zwar **an der Datentür**, nur an der Klinke
  `member`. Zu ist damit jeder **Inhalt**. Offen bleiben bewusst alle
  Owner-Einstellungen und die **Moderation** — die laufen über die Service-Naht,
  nicht durch die Tür.

Grund für den Zuschnitt: die Sperre soll zum Zahlen bewegen, nicht den Owner aus
seiner Community aussperren. Eine gesperrte Community, die niemand mehr moderieren
kann, wird zum Problem des Betreibers. **Eine neue Owner-Einstellung gehört also
nicht hinter die Sperre; eine neue Inhalts-Route muss nichts tun.**

#### Außerhalb der Tür — und was trotzdem gilt

Per Definition mandantenübergreifend und damit erlaubt: Migrationen, Sweeps und
Intervall-Plugins, die GDPR-Orchestrierung, das Control Plane.

Was auch dort gilt: **jeder Microcache auf einer mandantenfähigen App muss den
Mandanten im Schlüssel tragen** (`tenantCacheScopeFor`) — sonst liefert er die
Antwort von Kunde A an Kunde B; im Silo sogar aus einem anderen Appwrite-Projekt.

> Durchgesetzt wird die Tür von ESLint (A14, Stufe 3) — nicht von Typen. Ein
> `H3Event` in der Hand heißt: hinter die Tür.

---

## Core Layer – Detailspezifikation

### Auth (SSR)

**Server (`server/`):**
- `lib/appwrite.ts` — `createAdminClient()` + `createSessionClient(event)`, lazy `get`-Accessors für Services
- `middleware/02.auth.ts` — setzt `event.context.user` pro Request (try/catch, undefined wenn keine Session)
- `api/auth/signup.post.ts` — Account erstellen (AdminClient) + Session + Cookie in einem Request
- `api/auth/login.post.ts` / `logout.post.ts` / `oauth/*` — `createOAuth2Token` → Callback → `createSession`

**App:**
- `plugins/auth.server.ts` — hydratisiert User aus h3 context in den Store (kein Client-Fetch beim Start)
- `useCurrentUser()` + Pinia `useAuthStore` (user, isLoggedIn)
- `LoginForm.vue` / `RegisterForm.vue` — **`UAuthForm`** (Nuxt UI 4) als Vorlage; real bewusst eigene `UForm`-Implementierungen (2-Schritt-OTP, Security-Phrase, geteilter E-Mail-State, AGB-Gate) — Entscheidung + Details in docs/referenz/AUTH-FORMS.md
- Route Middleware `auth.ts` / `guest.ts`
- `pages/login.vue` + `register.vue` — out-of-the-box, überschreibbar

**Shared:**
- `shared/types/h3.d.ts` — `H3EventContext.user?: Models.User<Models.Preferences>`
- Zod Schemas (`loginSchema`, `registerSchema`) — deutsche Fehlermeldungen via i18n keys

### TablesDB-Zugriff

Kein generischer Client-CRUD-Composable mehr. Stattdessen das dokumentierte **Server-Route-Pattern**, das Feature Layers kopieren:

```
shared/types/<entity>.ts     →  interface X extends Models.Row
server/api/<entity>/*.ts     →  createSessionClient(event) + tablesDB.listRows<X>()
app/pages/…                  →  useFetch('/api/<entity>')
```

Immer explizites `Query.limit(...)` setzen (Default 25 → stille Trunkierung).

### Design-Fundament

- `app.config.ts` — Pukalani Default Theme (Nuxt UI: primary, neutral, radius, fonts)
- `main.css` — Tailwind 4 `@import` + `@source` + CSS Custom Properties
- Color Tokens: primary / secondary / neutral / success / warning / error / info
- Das Multi-Theme-System lebt in `packages/themes` (9 Built-ins + Custom Themes aus einer Basisfarbe, Schrift-Rollen, `useTheme`) — Konzept: docs/referenz/THEMES-CONCEPT-V2.md

### Utilities

`useSeo` (OG/Twitter Defaults) · `usePagination` · `useToast` · `useFormatDate` (dd.MM.yyyy) · `useFormatCurrency` (1.234,56 €) · `useStorage` (Upload/Preview/Delete via Server Routes)

### i18n

`@nuxtjs/i18n` im Core (Modul lädt in jeder App). Strategie `prefix_except_default`: `defaultLocale: 'en'` liegt OHNE Prefix unter `/...`, alle anderen Sprachen sind geprefixt (`/de/*`). Beim Aufruf von `/` entscheidet `detectBrowserLanguage` mit Cookie-Persistenz: Cookie (zuletzt gewählte Sprache) > Browser-Sprache (falls de) > en (bleibt auf `/`). Interne Links und Redirects IMMER über `localePath()` (gibt für en `/...`, für de `/de/...`). Sprachwahl per `ULocaleSelect` im `ThemeSwitcher`. Shared Strings in `i18n/de.json`/`en.json` (Validierung, Auth, generische UI), Apps ergänzen eigene. Layer lokal im Monorepo halten (Remote-Layer-Bug).

---

## Implementierungs-Roadmap

> **✅ AUSGEFÜHRT — Historie (Stand 2026-07-28).** Diese Roadmap beschreibt den
> Bau des Monorepos von Phase 1 an; sie ist abgearbeitet, das Produkt läuft auf
> sieben Hosts. Die Punkte stehen deshalb als Aufzählung, nicht als Kästchen:
> als **Chronik** bleiben sie nützlich (sie erklärt, warum die Layer so liegen,
> wie sie liegen), als **To-do-Liste** waren sie irreführend. Aktuelle offene
> Punkte: [OPEN-ITEMS.md](OPEN-ITEMS.md).

> **Status v2.1:** Phasen 1–10 sind abgeschlossen (✅ 2026-06-09/10) — Nachweise und
> Erkenntnisse pro Phase in **docs/GOALS.md**. Offen aus den Checklisten unten sind
> nur Produktions-TODOs: Custom Domain für den Appwrite-Endpoint (A3, Phase 3) und
> das ploi.io-Setup (A9, Phase 9 — deploy.yml liegt als dokumentiertes Skeleton bereit).

### Phase 1 – Monorepo Setup
- Root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc` (22), Root `tsconfig.json`
- pnpm Catalog für geteilte Dependencies definieren (nuxt, @nuxt/ui, pinia, zod, appwrite SDKs)
- `packages/core/` als Nuxt Layer initialisieren (`nuxi init --template layer`)
- `.playground/` einrichten (Port 3000)
- `apps/comments/` initialisieren, `extends` einbinden (Port 3001)
- Smoke Test: Komponente aus Core in App rendern, HMR prüfen

### Phase 2 – Design-Fundament
- Nuxt UI 4 in Core installieren + konfigurieren
- Pukalani Default Theme in `app.config.ts`
- `main.css` mit Tailwind 4 + `@source` für Layer-Pfad
- Override-Test: App-`app.config.ts` überschreibt Core Theme

### Phase 3 – Appwrite SSR-Fundament
- `node-appwrite` (Server) + `appwrite` (Web, Realtime) installieren
- `server/lib/appwrite.ts` — AdminClient + SessionClient
- `runtimeConfig` Skeleton (`appwriteKey` privat + `public.*`)
- `server/middleware/02.auth.ts` + `shared/types/h3.d.ts`
- `app/utils/appwrite.client.ts` (Web SDK, nur Realtime)
- `useRealtimeRows()` mit SSR-Guard
- Custom Domain für Appwrite-Endpoint einrichten (A3), CORS-Plattformen registrieren
- `.env.example` pro App

### Phase 4 – Auth
- Server Routes: signup, login, logout, OAuth
- Session-Cookie `a_session_<PROJECT_ID>` (httpOnly, secure, sameSite, Root-Domain)
- `plugins/auth.server.ts` + `useAuthStore` + `useCurrentUser()`
- Zod Schemas
- `LoginForm`/`RegisterForm` auf `UAuthForm`-Basis + `LogoutButton`
- Route Middleware + `pages/login.vue`/`register.vue`
- End-to-End-Test in comments: Browser-Realtime läuft authentifiziert

### Phase 5 – Layouts & User Components
- `layouts/default.vue` + `auth.vue` (dashboard → später `packages/admin`)
- `UserAvatar`, `UserMenu`, `UserProfileForm` (prefs statt eigener Table)
- `pages/error.vue`

### Phase 6 – Utilities, SEO, Analytics-Gate
- `useSeo`, `usePagination`, `useToast`, `useFormatDate`, `useFormatCurrency`, `useStorage`
- `pukalani.*` Defaults in Core `app.config.ts` (analytics/consent: false)
- `analytics.client.ts` Plugin mit Config-Gate + `useAnalytics` + `CookieBanner` + `useCookieConsent`
- Test: App ohne Gate lädt kein Script

### Phase 7 – i18n
- `@nuxtjs/i18n` in Core, `de.json` + `en.json`
- Test: App übernimmt Core Translations + ergänzt eigene

### Phase 8 – Testing
- Vitest in Core, Unit Tests für Format-/Pagination-Composables

### Phase 9 – CI / Deployment
- `typecheck.yml`, `lint.yml`, `deploy.yml` (mit `node-version-file: .nvmrc`)
- ploi.io: Root Path + Build Command pro App, Env Vars

### Phase 10 – `packages/comments` Feature Layer ✨ neu
- Layer-Struktur: Components, Server Routes, `shared/types/comment.ts`
- Migration: comments + votes Tables (eigene Instanz der App)
- Realtime via `useRealtimeRows<Comment>` mit Query-Filter auf postId
- In `apps/comments` komponieren — App bleibt dünn

### Phase 11 – Reddit Comment System App
- Weiter mit [[reddit-comment-system-setup]] Roadmap
- `usePresence()` nachrüsten sobald Presences self-hosted verfügbar

---

## Bekannte Stolperfallen & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Session leakt zwischen Usern | Appwrite Client über Requests geteilt | Pro `H3Event` neuen `SessionClient` erstellen |
| Doppel-Fetch / Hydration-Bugs | Web SDK CRUD aus `<script setup>` | CRUD immer über `server/api/*`, Web SDK nur Realtime |
| API Key geleakt | Key in `runtimeConfig.public` | Key nur in privatem `runtimeConfig.appwriteKey` |
| Web SDK blockiert | CORS-Plattform nicht registriert | `localhost` + Prod-Domain in Appwrite Console |
| Listen still abgeschnitten | Query-Default-Limit 25 | Immer explizites `Query.limit(...)` |
| Realtime-Events matchen nicht | Channel-Prefix `tablesdb.` vs. Event-Prefix `databases.` | Auf Event-Suffix matchen (`.create` etc.) |
| Realtime crasht den Build | WebSocket im SSR-Kontext | `import.meta.server` Guard im Composable |
| Browser-Realtime läuft anonym | Custom Cookie-Name, Web SDK liest ihn nicht | `a_session_<PROJECT_ID>` + Custom Domain (A3) |
| Types im Server nicht sichtbar | Types in `app/types/` | Domain-Types in `shared/types/` |
| HMR funktioniert nicht im Layer | Layer-Pfad falsch / `tsconfig.json` im Layer | Layer in `packages/`, kein eigenes `tsconfig.json` |
| Tailwind-Klassen aus Layer ignoriert | Tailwind scannt Layer-Pfad nicht | `@source "../../../packages/core"` in App-`main.css` |
| `~/`/`@/` Alias im Layer kaputt | Aliases relativ zur App aufgelöst | Im Layer nur relative Pfade |
| Dependency in App nicht gefunden | Nur im Core deklariert | Shared Dependencies auch in App-`package.json` |
| i18n bricht im Layer | Remote Layer Path Bug | Layer lokal im Monorepo halten |
| ploi deployed falsches Verzeichnis | Root Path nicht gesetzt | `apps/<app-name>` als Root Path |
| Auth bricht nach Appwrite-Upgrade | Migration nicht durchgelaufen | Beim Server-Upgrade immer `migrate` ausführen |
| Port-Konflikt | Alle Apps auf 3000 | Eigener Port pro App in `package.json` |
| app.config.ts wird ignoriert | Datei liegt im Package-Root | Nuxt 4: MUSS in `app/` liegen (srcDir) |
| Fehlerseite greift nicht | error.vue in einem Layer | Wird nicht aus Layern aufgelöst → Markup als Core-Komponente (`CoreErrorPage`), dünne `app/error.vue` pro App; neue error.vue braucht Dev-Server-Neustart |
| Layer-Store nicht gefunden | `app/stores/` wird in Layern nicht gescannt | In Layer-nuxt.config: `imports.dirs` mit absolutem Pfad |
| Kompletter Locale-Load bricht | `@` in einer Message = vue-i18n Linked-Syntax | Literal escapen: `du{'@'}example.com` ("Invalid linked format" killt die GANZE Datei) |
| Realtime disconnected im Loop | **Historisch** (Server 1.9.0): SDK ≥25.x sprach ein Protokoll, das der Server nicht konnte. Seit 1.9.5 erledigt — die Lösung von damals (nativer WebSocket-Client) wurde mit P1 abgelöst, s. A4 | Heute: gesunden `appwrite-realtime`-Container prüfen; bei einem unbekannten Host greift `startWhenHostResolves()` |
| Realtime tot auf einem neuen Host, Handshake sieht aber okay aus | Im Appwrite-Projekt fehlt die **Web-Platform** für diesen Host. Der WS-Handshake antwortet `101` auch für einen abgewiesenen Origin — die Ablehnung kommt als erste Nachricht IM Socket (`code 1008`) | `curl -H "Origin: https://<host>" …/v1/account` → `403 general_unknown_origin` = Host unbekannt, `401` = akzeptiert. Platform im Projekt nachtragen (Wildcard deckt neue Mandanten) |
| ESLint findet Config-Pakete nicht | Flat-Config-Imports lösen vom Config-Ort auf | `@nuxt/eslint-config` auch im Root-package.json deklarieren |
| multi-word-Rule schlägt auf Layer-Dateien an | Nuxt-Ausnahmen matchen `packages/*/app/…` nicht | Regel für `**/app/pages/**`, `**/app/layouts/**`, `**/app/error.vue` deaktivieren |
| Index-Erstellung schlägt fehl (400 `column_not_available`) | Der Index-Endpunkt liest die Spaltenliste aus Appwrites Metadaten-Cache, der dem Spalten-Status hinterherhinkt — **Pollen auf `available` reicht nicht** | Index-Anlage nur über `createIndexSteps()` aus `scripts/migrations-lib/indexRetry.mts` (Retry + Cache-Anstoß); rohes `createIndex` ist in Migrations ESLint-verboten (A10) |
| Spalte steht für immer auf `processing` | Appwrite räumt den Cache, während ein Leser noch seinen alten Stand hält — Warten hilft dann nie mehr (23 Versuche ohne Bewegung) | Nur ein Schreibzugriff auf die Tabelle räumt ihn (`tableCacheNudge`) — steckt in derselben Fabrik |

---

## Claude Code – CLAUDE.md

> **Single Source of Truth ist `CLAUDE.md` im Repo-Root** — die frühere Referenz-Kopie
> an dieser Stelle wurde in v2.1 entfernt (Doppelpflege funktioniert nicht; die Kopie
> war bereits gedriftet). Die /goal-Texte aller Phasen leben in `docs/GOALS.md`.

---

## Verknüpfte Projekte

- [[reddit-comment-system-setup]] – wird als `packages/comments` Feature Layer umgesetzt
- [[design-system]] – wird als `packages/themes` Feature Layer umgesetzt

---

## Notizen & Entscheidungen

- **2026-08-16:** Faktischer Nachzug (kein v3). Korrigiert, weil es zu falschem
  Handeln führen konnte: **A10** beschrieb den direkten Layer-Script-Aufruf mit
  hartem `--env-file` statt des zentralen Runners `pnpm migrate --app <app>` (dessen
  Sinn „nie die falsche Instanz" ist) und nannte das Pollen auf `available` als
  ausreichend vor der Index-Anlage — das ist es nicht (Fabrik `createIndexSteps`,
  Cache-Anstoß); **A9** beschrieb den Server-Build über ploi, obwohl seit
  2026-07-23 die CI baut und nur `.output` rsynct. Dazu Stack + Katalog-Beispiel
  auf die echten Versionen, Verzeichnisstruktur auf 21 Layer und 8 Apps (`feed`
  hieß längst `activity`), Ports, A11–A13, und zwei Stolperfallen-Zeilen, die dem
  eigenen A4 widersprachen.
- **2026-08-16 (zweiter Durchgang):** **A14** auf alle 21 Layer erweitert —
  Tabellenbesitz aus den Migrationen und Konstanten gegriffen, nicht geschätzt;
  gruppiert nach Rolle (Fundament / Komposition / Plattform+Betrieb / Produkt).
  Drei Layer besitzen bewusst keine Tabelle (`activity`, `feedback`, `domains`),
  einer bewusst kein `server/` (`blueprint`) — das steht jetzt als Aussage da, damit
  es niemand „nachrüstet". Durchsetzung um die **Datentür** ergänzt (ESLint
  `no-restricted-syntax` auf `server/api/**` + `server/plugins/**` von 11 Layern,
  dazu das `createIndex`-Verbot in Migrationen). Die Ebenen-Darstellung kennt jetzt
  `blueprint` und die Regel, dass er in `extends` VOR den Produkt-Layern steht.
- **2026-08-16 (dritter Durchgang):** **A15 — Mandanten-Architektur** neu. Pool/Silo
  + Single-Tenant, die Silo-Regel (Code-Isolation ≠ Deployment-Isolation), die
  Trennung Control-Plane-Projekt / Runtime-Projekt, die **Datentür** `tenantDb`
  samt `as` (welcher Client) vs. `actor` (wer handelt), die Publikums-Regel der
  Row-Permissions, das Site-Label als Mitgliedschaft und die zwei Sperr-Stufen
  (`abuse` = 404, `billing` = nur-lesend an der Klinke `member`). Ausdrücklich
  aufgeschrieben ist die Verwechslung, die am meisten kostet: `scopeRowFor()`
  schreibt **`communityId: tenant.tenantId`** — die Spalte wurde umbenannt, der
  Kontext-Wert nicht. Betriebs-Wirklichkeit (Hosts, Ports, TLS) bleibt bewusst
  draußen (s. Kopf).
- **2026-06-10:** Konzept v2.1 — Realitäts-Abgleich nach Phasen 1–10: A4 korrigiert
  (SDK-Realtime-Protokoll + Query-Subscriptions sind Cloud-only → nativer
  WebSocket-Client im Core), Strukturfixes (app/app.config.ts, CoreErrorPage-Pattern,
  i18n/locales, useToast aus Nuxt UI, server/utils-Re-Export), Key-Trennung
  Runtime/Migrations empfohlen, Rate-Limit-TODO für Login dokumentiert,
  9 neue Stolperfallen, CLAUDE.md-Referenzkopie entfernt (Single Source: Repo-Root),
  spekulative Packages (types/utils/config) gestrichen. comments-Layer auf
  targetId/targetType-Spec ausgerichtet (siehe [[reddit-comment-system-setup]]).
- **2026-06-09:** Konzept v2 — Projekt umbenannt (fleava → maui). SSR-Architektur mit zwei Clients beschlossen, TablesDB-Terminologie, Cookie `a_session_<PROJECT_ID>` + Custom Domain, Analytics/Consent config-gated im Core, Feature-Layer-Ebene (themes/comments/admin/billing) eingezogen, Core-Regel verschärft: null Tables. Presences API noch nicht self-hosted (nur Cloud) — usePresence optional.

---

## Referenzen

- [Nuxt Layers Docs](https://nuxt.com/docs/4.x/guide/going-further/layers)
- [Nuxt 4 Docs](https://nuxt.com/docs/4.x/getting-started/introduction)
- [Nuxt UI Docs](https://ui.nuxt.com) · [UAuthForm](https://ui.nuxt.com/docs/components/auth-form)
- [Appwrite SSR Auth](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Appwrite Nuxt SSR Tutorial](https://appwrite.io/docs/tutorials/nuxt-ssr-auth)
- [Appwrite TablesDB Rows](https://appwrite.io/docs/products/databases/rows)
- [Appwrite Realtime](https://appwrite.io/docs/apis/realtime)
- [Appwrite Custom Domains](https://appwrite.io/docs/advanced/platform/custom-domains)
- [pnpm Workspaces](https://pnpm.io/workspaces) · [Zod](https://zod.dev) · [Nuxt i18n](https://i18n.nuxtjs.org)
- [Offizielles Nuxt Monorepo Beispiel](https://github.com/nuxt/example-layers-monorepo)
- [Conventional Commits](https://www.conventionalcommits.org)
