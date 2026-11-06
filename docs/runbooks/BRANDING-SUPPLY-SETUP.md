# branding.supply — Einrichtung (Runbook)

Stand: 2026-09-01 — Site LIVE, Beta im Invite-Modus. Ausführung des abgenommenen Plans
[BRANDING-SUPPLY-INFRA.md](../plans/BRANDING-SUPPLY-INFRA.md).
Arbeitsteilung: **Schritt 1 klickt David** (Konsole, ~5 min — es gibt
bewusst keinen Script-Console-Zugang), den Rest fährt Claude. Häkchen
sind ECHT — je Durchlauf abhaken.

## 1 · Appwrite-Projekt `branding` (Konsolen-Klicks: David)

Konsole der Prod-Appwrite öffnen (dieselbe wie für portfolio/admin).

- [x] **Projekt anlegen:** Create project → Name „Branding Supply",
      **Project-Id MANUELL auf `branding`** stellen (Ids sind
      unveränderlich — NICHT die Auto-Id nehmen!), Team = dein
      Pukalani-Team (dasselbe wie portfolio/admin/account).
- [x] **Database anlegen:** Databases → Create → **Id MANUELL `main`**,
      Name „main". (Die Migrationen legen KEINE Database an —
      AH-4c-Falle.)
- [x] **Web-Platform 1:** Overview → Add platform → Web → Name
      „branding.supply", Hostname `branding.supply`.
- [x] **Web-Platform 2:** ebenso für Hostname `www.branding.supply`.
      (F45-Lehre: ohne Platform ist jeder Browser-Flow des Hosts tot.)
- [x] **Key 1 „nuxt-ssr-prod" (Runtime):** API keys → Create, Ablauf
      „Never". Scopes: EXAKT die 10 Häkchen des bestehenden
      `nuxt-ssr-prod`-Keys im Projekt `admin` spiegeln (dort ablesen —
      das ist die beim admin-Cutover verengte, geprobte Liste; KEIN
      „Select all", das ist die 84-Scope-Falle).
- [x] **Key 2 „migrations" (Migrationen):** ebenso, Scopes exakt wie der
      `migrations`-Key im Projekt `admin` (12 Häkchen).
- [x] **Ablage (file-to-file, nie in den Chat):** erledigt 2026-09-01 —
      mit Umweg: zuerst lag in BEIDEN Dateien der Migrations-Key und auf dem
      Server ein SMTP-Hostfragment in der Key-Zeile; erkannt rein über
      Scope-Signaturen (users/health/tablesdb-HTTP-Codes, nie Werte).
      `~/.appwrite-secrets/migrations/branding.env` anlegen mit den vier
      Zeilen des bekannten Formats (wie `migrations/admin.env`):
      Endpoint der Prod-Appwrite, `NUXT_PUBLIC_APPWRITE_PROJECT_ID=branding`,
      `NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`, `NUXT_APPWRITE_KEY=<Key 2>`.
      Den Runtime-Key (Key 1) zusätzlich in
      `~/.appwrite-secrets/branding-runtime.key` ablegen (eine Zeile) —
      er wandert in Schritt 5 in die Server-.env der Site.
- [x] Claude Bescheid geben („Projekt steht").

## 2 · Migrationen (Claude, nach Schritt 1)

- [x] `pnpm migrate --app branding` gegen die Prod-Instanz: 53 Migrationen
      grün, Zweitlauf 178× ↷ (Idempotenz-Beweis). ACHTUNG, dabei live
      erwischt und gefixt: `--app X --env-file Y` verlor den App-Kontext
      (resolveEnvFile gab `app` nicht zurück) — der Manifest-Filter griff
      nicht und der Erstlauf legte 18 Fremd-Tabellen (comments/posts/events)
      + Bucket an, bevor er an files.read starb. Fremd-Anlagen gelöscht
      (alle 0 Zeilen), Fix in scripts/migrate.mjs.
- [x] app_config-Row `global` da; brand-Flags null ⇒ fail-closed.
- [x] `pnpm ops:schema-parity` grün — branding 21/21; die neuen
      system-Spalten (brandAdmissionMode/brandAiEnabled) auf
      account/admin/portfolio nachgefahren.

### 2b · Nachzügler-Migrationen (je Produkt, mit Davids Ja)

Neue Produkt-Layer im Site-Manifest kommen NICHT durch Schritt 2 mit — jeder
bringt seine eigenen Migrationen mit, und die REIHENFOLGE ist nicht
verhandelbar: **erst die Migration auf `branding`, dann der Code-Deploy.**
Sonst zeigt der Fuß auf eine Route, deren Tabelle es nicht gibt.

- [x] `market` (MV1 M1, 2026-09-06): brand-018/019 + market-001…004.
- [x] **`pages` (BS1 R1; Prod-Migration GEFAHREN 2026-09-07 mit Davids Ja — pages-001…006, Kontrolllauf identisch, Seed 6 Gerüst-Seiten, Parität 30/30):**

      ```
      pnpm migrate --app branding --layer pages    # sechs Migrationen
      pnpm --filter branding seed:legal            # das Entwurfs-Gerüst
      pnpm ops:schema-parity                       # `pages` steht im BRANDING_SOLL
      ```

      Gate-Reihenfolge: **Davids Ja** → Migration → Seed → Code-Deploy →
      `curl https://branding.supply/api/health` (Build-SHA) → die sechs Routen
      (`/imprint`, `/privacy`, `/terms` und `/de/*`) einmal aufrufen.

      Drei Dinge, die dabei nicht überraschen sollen:

      1. **Der Seed ist ein eigenes Skript der App**
         (`apps/branding/scripts/seed-legal-pages.ts`), nicht das des Layers:
         dessen Vorlagen sprechen einen Community-Betreiber an und kennen
         keine AGB. Idempotent je slug+locale — ein zweiter Lauf lässt
         gefüllte Seiten unberührt.
      2. **Die Zeilen entstehen `published`**, mit dem Hinweis „Entwurf, in
         anwaltlicher Prüfung" und `noindex` (`pukalani.pages.draftNotice`).
         Das ist Davids Entscheidung 7 und beabsichtigt: der AGB-Link am
         Registrier-Häkchen darf nicht ins 404 zeigen.
      3. **pages-003 und pages-006 sind ein PAAR.** 003 legt `tenantId` an,
         006 zieht `communityId` nach und löscht `tenantId` wieder — bei jedem
         Lauf. Das Ergebnis konvergiert (Zweitlauf endet im selben Zustand),
         die Ausgabe ist nur nicht still. Kein Datenrisiko: 006 backfillt
         zuerst und prüft gegen.

- [x] **`brand-021` — die Erstgespräch-Anfragen (BS1 Z0, wartet auf Davids Ja):**

      ```
      pnpm migrate --app branding --layer brand    # legt brand_intro_requests an
      pnpm ops:schema-parity                       # die Tabelle steht im BRAND_TABLES-Soll
      ```

      Gate-Reihenfolge wie immer: **Davids Ja** → Migration → Code-Deploy →
      `curl https://branding.supply/api/health` (Build-SHA) → `/erstgespraech`
      und `/de/erstgespraech` einmal aufrufen und eine Testanfrage abschicken.

      Ohne die Tabelle ANTWORTET die Route trotzdem (die Bestätigungs-Mail ist
      der zweite, entkoppelte Zustellweg) — die Anfrage lebte dann aber nur in
      einem Postfach und stünde nicht unter `/dashboard/intro-calls`. Genau
      deshalb Migration zuerst.

      **Danach ein Handgriff für David, wenn er die Anfragen im Postfach will:**
      `introCallNotify: 'seine@adresse'` in `apps/branding/app/app.config.ts`
      (Default `''` = keine Betreiber-Mail). Der Absender bekommt seine
      Bestätigung unabhängig davon.

## 3 · Monorepo (Claude — läuft bereits parallel)

- [x] apps/branding (**Dev**-Port 3010 — anfangs 3006, das kollidierte
      lokal mit platform und wurde am 2026-09-01 verschoben) +
      portfolio-Rückbau + Wächter-Listen, CI grün. (Infra-Plan §2.)

## 4 · DNS + ploi + TLS (Claude)

- [x] ~~**D2 (David):** Cloudflare-Token mit Scope für die Zone
      branding.supply~~ — **NICHT NÖTIG GEWESEN.** Beide Namen sind
      eigene Domains DIESER ploi-Site und grau (nicht proxied), also
      antwortet Port 80 für sie und **HTTP-01 hat gereicht**. Die
      DNS-01-Pflicht der Zone pukalani.app kommt von Wildcards und
      Aliassen — die gibt es hier nicht.
- [x] DNS: `branding.supply` A → 49.13.211.173 (grau) · `www` CNAME
      auf den Apex (grau).
- [x] ploi-Site branding.supply (**Id 402929**) auf Server app-prod
      (118713) → **Port 3007** (D3: freigegeben).
      **NICHT 3006:** Dev- und Prod-Portachse sind getrennt, und auf dem
      SERVER hält help die 3006 (Portkarte: 3002 portfolio · 3003 admin ·
      3004 platform · 3005 www/marketing · 3006 help · 3007 branding).
      Der Plan hatte die beiden Achsen verwechselt.
- [x] Zertifikat branding.supply + www (eigene Lineage `branding.supply`,
      HTTP-01); nginx www→Apex 301.
- [x] verify-tls.mjs um beide Hosts erweitern.

## 5 · Deploy (Claude)

- [x] **Server-.env der Site gefüllt** (2026-09-01; ops:site-env grün,
      11/11). Pflichtliste = der `branding`-Block in
      `scripts/ops/verify-site-env.mjs`: `NUXT_APPWRITE_KEY`,
      `NUXT_PUBLIC_APPWRITE_ENDPOINT`, `NUXT_PUBLIC_APPWRITE_PROJECT_ID`,
      `NUXT_PUBLIC_APPWRITE_DATABASE_ID`, `NUXT_SMTP_HOST/PORT/USER/PASS/FROM`,
      `NUXT_PUBLIC_APP_URL=https://branding.supply`,
      `NUXT_PUBLIC_I18N_BASE_URL=https://branding.supply`.
      Der Migrations-Key gehört NICHT auf den Server.
- [x] deploy.yml + ecosystem-branding.config.cjs (pm2 `brandingsupply`,
      Port 3007), Release-Slot `releases/branding`, Health-Probe.
- [x] Erster Deploy (2026-09-01, Build d9dd981c): `/` 200 ·
      `/api/health` 200 · `/api/brand/profiles` 404 · invite/check
      {valid:false} · www→Apex 301. ZWEI Erst-Deploy-Fallen dabei:
      (1) rsync legt nur die letzte Pfadebene an — `releases/branding`
      fehlte, Lauf starb NACH dem Flip der fünf Alt-Apps (Fix:
      `--mkpath` in deploy.yml); (2) danach hielt die Change-Detection
      (Basis = platform-Build) alles für erledigt und übersprang — die
      Kur war `gh workflow run deploy.yml` (deployt immer); Härtung als
      Task offen (ältester Build ALLER Probe-Hosts als Basis).
- [x] production-watch nachziehen (der `server`-Job fährt
      `ops:site-env` täglich — der neue Block wird dort automatisch
      mitgeprüft, sobald die .env steht).

## 6 · Beta öffnen (Claude + David)

- [x] `pnpm brand:access --mode invite` (closed → invite).
- [x] `pnpm brand:invite` → Code für David ausgestellt (mail-gebunden,
      30 Tage; Live-Gegenprobe: invite/check {valid:true}). Aufruf im
      Worktree: `node --env-file=$HOME/.appwrite-secrets/migrations/
      branding.env packages/brand/scripts/<invite|access>.mjs` — das
      pnpm-Skript erwartet apps/branding/.env, die es dort nicht gibt.
- [x] David hat sich registriert, verifiziert und eingelöst (2026-09-01,
      brand_access-Zeile 08:39 UTC; Einladung 3 ms später gestempelt —
      die Erst-Zeile-dann-Stempel-Reihenfolge hielt). DABEI GEFUNDEN UND
      GEFIXT: die Zweiter-Tab-Falle — die Mail-Bestätigung landet in
      einem neuen Tab, das Dashboard löste nicht ein und der /invite-Tab
      bekam die Verifizierung nie mit (Fokus-Refresh + noAccess-Knopf,
      Commit 95ced9cf). George antwortet erst mit P2 — der Generator
      bleibt auf Prod bewusst ohne Dev-Stub.
