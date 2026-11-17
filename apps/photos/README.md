# apps/photos — Foto-Site (Einzel-Site, nicht ausgerollt)

Eine Einzel-Site mit eigenem Editorial-Design: Startseite, Galerie, „Über" und
ein Kontaktformular (`app/pages/`, Stile in `app/assets/css/photos.css`,
gescopet auf das Layout `site` — Anmeldung und Dashboard behalten den
Standard-Look). Sie ist die App, an der der `media`-Layer erprobt wird, und
das Muster für „eigene Site mit eigenem Design auf denselben Layern".

**Stand:** nur Code. Es gibt keine Site auf dem App-Server und keinen
Eintrag im Ausliefer-Lauf; ausgerollt sind heute als Einzel-Sites nur
`apps/portfolio` und `apps/branding` (CLAUDE.md, „SILO-REGEL").

## Layer

Steht in `site.manifest.ts`: `themes`, `admin`, `media` — dazu immer `core`
und `system`.

## Lokal starten

```bash
pnpm --filter photos dev   # Port 3003
```

`.env` aus `.env.example` anlegen (eigenes Appwrite-Projekt, siehe
`appwriteProjects` in `site.manifest.ts`). Migrationen:

```bash
pnpm migrate --app photos
```

## Bekannte Grenzen

- Der Zähler der Kontakt-Route (`server/api/contact.post.ts`) liegt im
  Speicher des Prozesses — vor einem Ausrollen gehört die Route in die
  Bremsen-Liste des Core (`.claude/rules/appwrite.md`, „BREMSEN").
- Keine globale `app.pageTransition` (die App bindet das Dashboard ein);
  der Übergang gilt je Route, siehe Kommentar in `nuxt.config.ts`.
