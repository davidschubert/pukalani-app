# apps/_template — Kopiervorlage für neue Pukalani-Apps

Dünne App-Hülle, die alle Layer komponiert (`themes`, `admin`, `comments`,
`moderation`, `core`, `system`). Der Unterstrich-Prefix hält sie aus dem
Migrations-Runner heraus (`scripts/migrate.mjs` ignoriert `_*`).

## Neue App erstellen

1. **Kopieren + benennen**
   ```bash
   cp -R apps/_template apps/<name>
   ```
   - `package.json`: `"name": "<name>"` setzen und im `bootstrap`-Skript
     `--app _template` durch `--app <name>` ersetzen (sonst zielen die
     Migrationen auf die Vorlage; `pnpm create-site <name>` erledigt beides)
   - `nuxt.config.ts`: `devServer.port` eindeutig vergeben (3002+, siehe CLAUDE.md)
   - `.env.example` → `NUXT_PUBLIC_APP_URL` an den Port anpassen
   - Nicht benötigte Produkt-Layer aus `extends` UND `package.json` entfernen
     (`core` + `system` bleiben immer)

2. **Appwrite-Instanz vorbereiten** (jede App hat ihre EIGENE Instanz)
   - Instanz starten, in der Console: Account + Projekt + zwei API-Keys anlegen
     (Runtime-Key + Migrations-Key, Scopes siehe `.env.example`)
   - `cp apps/<name>/.env.example apps/<name>/.env` und ausfüllen

3. **Installieren + Bootstrap**
   ```bash
   pnpm install
   pnpm --filter <name> bootstrap   # DB + Bucket + Platform + alle Migrationen
   ```
   Das ist EIN Skript für alle Apps (`scripts/bootstrap.mjs --app <name>`) und
   nur für FRISCHE Instanzen: es prüft vor dem ersten Schreibzugriff, ob die
   Datenbank leer ist, und bricht sonst ab (`--check` prüft nur, `--force`
   erzwingt).
   Migrationen später einzeln: `pnpm migrate --app <name>`
   (nie ohne `--app`, sobald mehrere Apps existieren — der Runner erzwingt das).

4. **Starten**
   ```bash
   pnpm --filter <name> dev
   ```

5. **Anpassen**
   - `app/app.config.ts`: Config-Gates (`pukalani.analytics`, `pukalani.auth.*`, …)
   - `i18n/locales/*.json`: App-Texte (Core-Keys werden gemergt)
   - `app/pages/`: eigene Seiten; Layout-Overrides optional unter `app/layouts/`
     (Core bringt `default` + `auth` mit)

## Konventionen (Kurzfassung)

- CRUD nur über `server/api/*` der Layer — nie Web-SDK-CRUD im Client
- `app.config.ts` gehört in `app/` (im Package-Root wird sie ignoriert)
- Domain-Types in `shared/types/`, Zod-Schemas als Factories, i18n-Keys statt
  hartcodierter Strings — Details in CLAUDE.md und docs/CONCEPT.md

## Was hier anders ist als in der Vorlage

- **Kein globales `app.pageTransition`.** Die App bindet das Dashboard ein
  (`packages/admin`); mit `mode: 'out-in'` bliebe dort nach der ersten
  Client-Navigation der Seitenbereich leer (`UDashboardPanel` ist
  mehrwurzelig). Der Fade läuft nur je Route über `<NuxtPage :transition>` im
  Layout `site` (`app/app.vue`) — dasselbe Muster wie `apps/portfolio`.
