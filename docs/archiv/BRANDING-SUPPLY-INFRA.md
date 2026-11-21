# branding.supply — Infra-Plan (Horizont 2 vorgezogen)

> **Archiviert am 2026-11-21 (Q17).** Gebaut: branding.supply ist seit dem 2026-09-01 live. Betrieb: [BRANDING-SUPPLY-SETUP.md](../runbooks/BRANDING-SUPPLY-SETUP.md).

Stand: 2026-08-31. **DAVIDS ENTSCHEIDUNG (2026-08-31, Kehrtwende zu
Plan §6 „Zwei Horizonte" und §9.2):** der Brand-Wizard bekommt JETZT
sein eigenes Appwrite-Projekt UND seine eigene Domain — branding.supply
startet als eigene App, nicht erst nach der Beta. Damit entfällt der
Einzug in `portfolio` (P1b hatte fail-closed dorthin eingehängt; wird
zurückgebaut). Der kundenförmige Grund im Sinne der Silo-Regel ist
diese Entscheidung selbst: das Produkt soll von Tag eins unter seiner
eigenen Marke mit eigenem Konten-Stamm leben.

**DAVID-GATE: dieser Plan braucht deine Abnahme, bevor ich Projekt,
DNS, Site oder Deploy anfasse.** Die P1c-UI-Arbeit läuft parallel
weiter — der Layer ist host-agnostisch, sie hängt nicht daran.

## 0. Ist-Stand (gemessen 2026-08-31)

- Zone branding.supply ist bei Cloudflare DELEGIERT (bonnie/clint-NS
  aktiv), noch ohne Einträge, kein HTTPS. Grundlage steht.
- P1b-Code komplett auf main; brand-Routen laufen fail-closed auf
  pukalani.studio (wird zurückgebaut, §6-Rückbau in Schritt 3).
- Prod-Appwrite: KEINE brand_*-Tabellen irgendwo (bewusst gewartet).
- Der Cloudflare-DNS-Token für die ACME-Prüfung ist zonen-gescopet auf
  pukalani.app — für branding.supply bräuchte es Scope-Erweiterung oder
  einen eigenen Token (**David**, Punkt D2). ~~offen~~ **Erledigt ohne
  Token (2026-08-31):** HTTP-01 hat gereicht, s. §4/D2.

## 1. Konsequenzen der Kehrtwende (Produkt-Ebene)

| Punkt | Vorher (Plan §6) | Jetzt |
| --- | --- | --- |
| Wizard-Host | pukalani.studio | **branding.supply** |
| Konten | portfolio-Konten (Davids Login existiert) | **eigener Konten-Stamm im Projekt `branding`** — jeder Beta-Nutzer registriert dort neu (Einladung öffnet die Registrierung, P1a-Naht) |
| Erstgespräch-CTA | gleiche Domain | **cross-domain** auf pukalani.studio/erstgespraech — `completionCta` ist dafür schon Config (§3e-Form); Analytics-Ziel prüfen (D4) |
| Hauptsprache | en (Plan §3c) | passt erst recht (SaaS-Domain) |
| pukalani.studio | Wizard-Einstieg | nur noch Studio-Trichter; optionaler Teaser-Link auf branding.supply (D5) |

Nicht betroffen: der komplette brand-Layer (Registry, Zustandsmaschine,
Routen, Skripte), die Content-Spez, George, alle Dummy-Entscheidungen —
alles host-agnostisch gebaut.

## 2. App-Zuschnitt (Monorepo)

- Neue dünne App **`apps/branding`** (Workspace-Name `branding`),
  extends: brand vor core (blueprint nur, falls die Wizard-Seiten
  Chrome daraus brauchen — nach P1c-Stand entscheiden).
- `site.manifest.ts`: products `['brand']`; check:manifests.
- **Dev-Port 3010** (3000–3009 lokal vergeben; die erste Wahl 3006 aus
  diesem Plan kollidierte LOKAL mit platform — auch die Dev-Portkarte
  war hier falsch gezählt, am 2026-09-01 aufgelöst). **PROD-Port ist
  3007** — das sind ZWEI Achsen, und dieser Plan hat beide ursprünglich
  falsch belegt: die Portkarte des SERVERS ist eine eigene Liste (3002
  portfolio · 3003 admin · 3004 platform · 3005 www/marketing · 3006
  **help** · 3007 branding), dort hält help die 3006 seit 2026-07-28.
  nginx der ploi-Site proxyt auf 3007, `ops/ecosystem-branding.config.cjs`
  setzt 3007; der Dev-Port steht in `apps/branding/nuxt.config.ts`.
- apps/portfolio: brand aus extends + site.manifest wieder RAUS
  (eigener Commit „Rückbau P1b-Einhängung"; die Routen ziehen mit dem
  Layer um — kein toter Code).
- Der `.playground` des Layers bleibt der Dummy-Anker (Port 3009).

## 3. Appwrite-Projekt `branding`

- Neues Projekt **`branding`** auf der BESTEHENDEN self-hosted Instanz
  (gleicher Appwrite-Server wie portfolio; Neuanlage nach dem
  Provisioner-Rezept — Fallen bekannt: keys brauchen keyId,
  Membership-Secret muss NULL bleiben).
- Web-Platform: `branding.supply` (+ `www.branding.supply`) — F45-Lehre:
  ohne Platform ist jeder Web-SDK-/Cookie-Flow des Hosts tot.
- Session-Cookie `a_session_branding`; zwei Keys (Runtime + Migrations),
  Ablage nach der Migrations-Konvention (~/.appwrite-secrets/migrations/
  plus Server-.env).
- Database `main`; Migrationen: **system-001…038 komplett** (der
  system-Layer läuft auf jeder Instanz) + **brand-001…008** +
  app_config-Row. Alles idempotent über `pnpm migrate --app branding`.
- Paritäts-Wächter: neues `BRANDING_SOLL` (system+brand-Tabellen) in
  verify-schema-parity.mjs; brand_* aus `PORTFOLIO_SOLL` wieder raus.
- SMTP: NUXT_SMTP_* setzen (F44-Lehre — sonst gehen Verifizierungs-Mails
  still verloren; die Beta-Einladung HÄNGT an E-Mail-Verifizierung!).

## 4. DNS / TLS / ploi

- DNS: `branding.supply` A auf den Maui-Server (grau/nicht proxied wie
  alle App-Hosts außer dem pukalani.app-Apex) · `www` CNAME auf den Apex.
- Neue ploi-Site **branding.supply** (Id 402929) auf **Port 3007**
  (Server-Portkarte, s. §2); Verzeichnis `/home/ploi/branding.supply/`.
- TLS: Zertifikat `branding.supply` + `www.branding.supply`. NEUE ZONE =
  EIGENE LINEAGE — die Apex+Wildcard-Falle der pukalani.app-Zone gilt
  hier nicht (kein Wildcard nötig, keine Mandanten). **HTTP-01 hat
  gereicht** (beides eigene Domains DIESER Site, beide grau/nicht
  proxied — Port 80 antwortet für sie); der DNS-01-Weg und damit der
  Cloudflare-Token D2 waren NICHT nötig. Danach verify-tls.mjs um die
  zwei Hosts erweitern.
- nginx: www auf Apex per 301; Standard-Proxy auf 3007.

## 5. Deploy / Betrieb

- deploy.yml: App `branding` ergänzen (Release-Slot `releases/branding`,
  rsync, pm2-Prozess `brandingsupply`, Health
  `https://branding.supply/api/health`).
- ecosystem-branding.config.cjs; pm2-Name-Match-Falle beachten.
- ops:site-env: Pflicht-Envs für die neue Site eintragen (Appwrite-Keys
  + Database-Id, SMTP, NUXT_PUBLIC_APP_URL und
  NUXT_PUBLIC_I18N_BASE_URL=https://branding.supply). SMTP ist hier
  Pflicht statt Ablage-Sache: ohne den `admin`-Layer gibt es keinen
  Reiter „Integrationen", also nur den Env-Weg.
- production-watch: TLS-Wächter deckt die neuen Hosts (§4).
- `pukalani.brand.enabled` bleibt Build-Schalter; brandAdmissionMode
  startet `closed` (Default) — geöffnet wird erst per
  `pnpm brand:access --mode invite` nach dem Rauchtest.

## 6. Reihenfolge der Ausführung (nach deiner Abnahme)

1. Appwrite-Projekt `branding` anlegen (Keys, Platform, SMTP-Check).
2. Migrationen system+brand gegen `branding` (zweimal —
   Idempotenz-Beweis) + app_config-Row.
3. Monorepo: apps/branding anlegen, portfolio-Rückbau, Wächter-Listen;
   CI grün, lokaler Dev-Beweis gegen ein lokales Dev-Projekt `branding`.
4. DNS-Einträge + ploi-Site + Zertifikat + nginx.
5. Server-.env füllen, deploy.yml erweitern, erster Deploy, Health +
   Proben (invite/check neutral, profiles 404, Startseite 200).
6. Wächter nachziehen (site-env, tls, schema-parity) und einmal fahren.
7. Beta-Code für dich ausstellen (`pnpm brand:invite`), Modus `invite`.

## 7. Bei David (D-Punkte)

- **D1:** Diesen Plan abnehmen.
- ~~**D2:** Cloudflare-DNS-Token für die neue Zone~~ — **HINFÄLLIG
  (2026-08-31):** das Zertifikat kam über HTTP-01, weil beide Namen
  eigene Domains DIESER ploi-Site sind (Port 80 antwortet für sie). Die
  DNS-01-Pflicht der pukalani.app-Zone kommt von Wildcards und Aliassen,
  die es hier nicht gibt.
- **D3:** ploi-Site-Anlage bestätigen (kann ich über den ploi-Zugang
  anlegen; Server = der bestehende Maui-Server).
- **D4:** Erstgespräch-CTA cross-domain ok? (Plausible-Ziel für den
  Sprung branding.supply → pukalani.studio/erstgespraech einplanen.)
- **D5:** Soll pukalani.studio einen Wizard-Teaser behalten?
