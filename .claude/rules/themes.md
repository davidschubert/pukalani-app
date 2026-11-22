---
paths:
  - "packages/themes/**"
  - "packages/system/**"
  - "packages/admin/**"
  - "packages/onboarding/**"
  - "packages/core/app/plugins/**"
  - "packages/core/shared/communityBranding*"
  - "packages/core/server/utils/communityBranding*"
  - "packages/core/**/*ommunityFavicon*"
  - "packages/core/**/*community-favicon*"
  - "packages/core/app/composables/useCommunitySettings*"
  - "packages/core/shared/types/settings-tab.ts"
  - "packages/control/server/api/control/community/**"
---

## Themes (Layer themes; Tables besitzt system, Admin-Routen admin — A14)
- KATALOG: `themes/theme.catalog.ts` ist der EINZIGE Input —
  `pnpm --filter @pukalani/themes generate -- --write` erzeugt
  `themes/public/themes/*.css` + `themes/app/utils/themeRegistry.gen.ts`
  (committet). CI-Gate `pnpm --filter @pukalani/themes check:themes`
  (`.github/workflows/lint.yml`): Regenerieren darf keinen Diff erzeugen. Ramps
  ankern die Basisfarbe auf Stufe 500; das Kontrast-Gate verschiebt die
  `--ui-primary`-Stufen selbst. Öffentlicher Picker = `ThemePickerModal`. CSS
  und Registry NIE von Hand editieren.
- AUSNAHME `default`: steht NICHT im Katalog, sondern handgepflegt in
  `themes/app/utils/themeRegistry.ts`. Label „Aloha" ≠ Key: die Id bleibt
  `default` (communities.theme, data-theme, CSS-Dateinamen, gespeicherte
  Configs) — Theme-Namen nie über die Id umbenennen. Theme-Namen sind
  Eigennamen und laufen NICHT über i18n (de = en).
- SCHRIFT-KONTRAST (Q07): der Generator schreibt zusätzlich
  `themes/public/themes/contrast.css` — `--ui-text-dimmed`/`--ui-text-muted` je
  neutraler Palette und `--ui-error`/`--ui-success`, hell und dunkel, gerechnet
  aus der handgepflegten `themes/public/themes/neutral.css` (Logik + Gate:
  `themes/shared/textContrast.ts`). Farbton bleibt, die Helligkeit rückt nur so
  weit, bis die Farbe als SCHRIFT 4,5 zu 1 erreicht (Seite, gedämpfte und
  erhöhte Fläche, Status auch auf der eigenen 10-Prozent-Fläche); darunter
  bricht der Generator ab. Wer `neutral.css` ändert, erzeugt neu (`--check`
  merkt es). Die Datei ist unlayered: JEDER helle Block nennt sein dunkles
  Gegenstück, sonst schlüge `:root` auch `.dark`. Die getönte Palette eines
  Custom Themes bekommt dieselbe Rechnung zur Laufzeit (`customThemeCss`).
  Gelb und Blau (`--ui-warning`/`--ui-info`) laufen wie Rot und Grün; dazu die
  Fokus-Rahmen in voller Deckkraft (Nuxt UI: 25 Prozent).
- HAUPTFARBE ALS SCHRIFT (Bahn 7): `--ui-primary` jeder Farbwelt erreicht als
  Schrift 4,5 zu 1 auf den Flächen ALLER neun Paletten (`primaryTokens`,
  Gate `auditPrimaryTokens`, Wächter `themes/tests/primaryContrast.test.ts`).
  Katalog-Feld `keepFill: true` (Gelb/Orange): die FLÄCHE bleibt, die Schrift
  darauf wird dunkel, nur `--ui-primary` als Schrift rückt — über einen
  Flächen-Block mit `PRIMARY_FILL_SELECTOR` (Nuxt-UI-Klassen, beim
  Nuxt-UI-Update gegen `.nuxt/ui/*.ts` halten). Custom Themes: die Farbe des
  Owners bleibt als Fläche EXAKT, nur die Schrift wird gewählt; Paletten zur
  Laufzeit aus `themes/shared/neutralPalettes.gen.ts` (erzeugt, `--check`).
  Apps OHNE themes-Layer (help, marketing) sehen die Datei nicht — die Hilfe hat
  eigene Werte in `apps/help/app/assets/css/help.css`.
- CUSTOMIZE THEME: `/dashboard/themes` (Galerie), Editor als Vollseite (`/new`,
  `/:id` — Dock: Boxen „Farben" + „Schriften", je EIN „Erweitert"), Schriften
  unter `/dashboard/themes/fonts`. Konzept + bewusste Ablehnungen:
  `docs/referenz/THEMES-CONCEPT-V2.md` — Einfachheit ist Leitprinzip (wenige
  Entscheidungen, kein Slot-/Regler-Zoo).
- CUSTOM THEMES: Table `custom_themes` (system-Migrationen 009–013), Ramp zur
  Laufzeit aus EINER Basisfarbe (`themes/shared/ramp.ts`, OKLCH + Tests).
  config-JSON NUR ADDITIV erweitern (kein version-Feld): neutral 'tinted',
  font/fontHeading, darkAlias, headingWeight/Tracking/Uppercase, radius.
- `<html>`-ATTRIBUTE per SSR-Head (`themes/app/plugins/theme.ts`, flash-frei):
  data-theme ('c-<rowId>'), data-variant, data-neutral, data-font,
  data-font-heading. Die Draft-Vorschau im Editor setzt sie direkt und stellt
  beim Verlassen den LIVE-Zustand aus `useTheme()` wieder her.
- WESSEN FARBWELT GILT? (B5, Davids Entscheidung): auf einem MANDANTEN-Host
  gewinnt die Community, nicht der Besucher. EINE pure Regel
  `resolveThemeSelection` (`themes/shared/themeSelection.ts`), `useTheme()` legt
  nur Cookies + Registry-Validierung darum. Mandanten-Host ⇒
  `communities.theme/variant` (`useCommunitySettings`), ohne eigene Wahl ('')
  die Instanz-Einstellung — das Theme-Cookie wird dort GAR NICHT gelesen; sonst
  (Silo, Kontroll-Host, Playground) Cookie ⇒ Instanz ⇒ Core-Default. Flash-frei,
  weil die Einstellungen im SSR-Payload reisen und der Server data-theme + CSS-
  Datei schon stempelt. Der Theme-WÄHLER verschwindet auf Mandanten-Hosts
  (`canChooseTheme`: `DisplaySettingsMenu`, Dashboard-Kontomenü, Hinweis im
  Customize theme) — ein Wähler ohne Wirkung wäre eine Lüge. Die Community-Farbe
  setzt der Owner unter `/dashboard/community/branding`.
- NEUTRAL-PALETTE (B5): `data-neutral` ist eine EIGENE Achse —
  `communities.neutral` (control-020, '' = keine eigene Wahl). Eigene pure
  Funktionen `resolveNeutralSelection` + `visitorMayChooseNeutral` NEBEN
  resolveThemeSelection, kein viertes Feld im Theme-Ergebnis (die Herkunft darf
  abweichen: Kontroll-Host = Theme aus der Instanz, Palette vom Besucher). Eine
  Instanz-Einstellung für die Palette gibt es BEWUSST NICHT; Default ist die
  Registry-Voreinstellung. Gesetzt als Zeile „Grundton" (Chips, weil '' nicht in
  ein USelectItem darf), geprüft gegen `NEUTRAL_REGISTRY`. `neutral` im
  PATCH-Body ist OPTIONAL (platform und control sind zwei Deployments, ein
  Pflichtfeld hieße 400 bei Versatz): fehlendes Feld = „nicht angefasst", nie
  ''. Der Wähler verschwindet auf Mandanten-Hosts (`canChooseNeutral`).
  Besucher-Wahl BLEIBEN: Hell/Dunkel (useColorMode), Seitenleiste, Sprache.
  Beweis: `packages/onboarding/scripts/verify-site-branding.mjs`.
- LIVE-BRANDING ÜBER EINEN SPIEGEL (D6): die Wahrheit bleibt
  `communities.theme/variant/neutral` im Control-Plane-Projekt (dort hat der
  Browser weder Session noch Leserecht). `PATCH /api/community/branding`
  schreibt den BESTÄTIGTEN Zustand zusätzlich in `community_branding`
  (system-028, EINE Row je Community, rowId = `communities.$id`, read(any), kein
  Index) — `mirrorCommunityBranding()`
  (`core/server/utils/communityBrandingMirror.ts`), NACH dem Control Plane und
  FAIL-SOFT. Der Client abonniert GENAU seine Row
  (`core/app/plugins/realtime-branding.client.ts`, `useSiteId()` +
  `mirrorBelongsToCommunity` als Netz) und schreibt sie in
  `useCommunitySettings()`; danach rechnen die B5-Resolver wie immer. Ohne
  Community-Id (Kontroll-Host, Silo, Playground) abonniert das Plugin NICHTS.
  DREI REGELN, nicht „vereinfachen": (1) KEIN `upsertRow` — schreibt, publiziert
  aber kein Realtime-Event: `updateRow`, bei 404 `createRow`. (2) Der Spiegel
  wird NIE zum Rendern gelesen — SSR fragt weiter den Resolver, ein
  fehlgeschlagenes Spiegeln heilt der nächste Seitenaufbau. (3)
  `themeSettings.defaultThemeId` (Tab-Farbe, Favicon, og:image) morpht BEWUSST
  nicht mit (würde die Instanz-Voreinstellung überschreiben, beim Zurücksetzen
  auf '' nicht rückrechenbar).
- REALTIME-FALLE „Invalid Origin": jedes Appwrite-Projekt braucht seinen Host
  als Web-Platform (`account` deckt per Wildcard jeden Mandanten-Subhost; eine
  Kundendomain trägt `core/server/utils/appwritePlatform.ts` ein). Die
  Dev-Appwrite kennt nur `localhost` — auf `kunde-a.localhost` bricht der
  Socket ab („Realtime disconnected"); das ist die Testumgebung, kein
  Code-Fehler. DIAGNOSE: der WS-Handshake antwortet `101` auch für einen
  abgewiesenen Origin, die Ablehnung kommt als erste Nachricht IM Socket
  (`code 1008`). Billiger Test: `curl -H "Origin: https://<host>"
  <endpoint>/v1/account` — `403 general_unknown_origin` = Host unbekannt, `401`
  = akzeptiert. Den Socket mitlesen nur mit `--http1.1` (über HTTP/2 scheitert
  der Upgrade mit 400).
- COMMUNITY-FAVICON (U15): Upload unter `/dashboard/community/branding`, nur
  PNG, 32–512 px Kante, ≤ 1 MB, Magic-Bytes statt MIME (Grenzen:
  `core/shared/communityFavicon.ts`) — gilt im Tab UND als App-Icon; og:image
  bleibt generiert, ohne Upload gilt das Initial-SVG. Die WAHRHEIT ist die
  DATEI: Bucket `favicons` (system-037, permissions [], Server-only), fileId =
  communityId; Existenz + `$updatedAt` ersetzen jede communities-Spalte und
  jedes Spiegel-Feld (`community_branding` bleibt bei drei Farb-Feldern!).
  `$updatedAt` bricht als Teil von `uploadedBrandIconKey` die immutable
  `/icon/<key>.png`-URLs. SSR-Kopf über die Kette
  `core/server/utils/communityFaviconStore.ts` →
  `core/server/middleware/10.community-favicon.ts` →
  `core/app/plugins/community-favicon.server.ts` →
  `core/app/composables/useCommunityFavicon.ts`; `themes/app/plugins/theme.ts`
  unterdrückt bei Upload den favicon.svg-Link. Routen im onboarding-Layer
  (`/api/community/branding/favicon`, `branding.manage`); Auslieferung durch die
  BESTEHENDE Icon-Route (`apps/platform/server/routes/icon/[key].get.ts`). Bewusst
  KEINE Live-Propagation. Beweis:
  `packages/onboarding/scripts/verify-community-favicon.mjs`.
- NEUE communities-SPALTE: `createRow<TenantRow>` verlangt ALLE Spalten
  explizit (bewusst) ⇒ Entscheidung an ZWEI Anlegestellen:
  `control/server/api/control/tenants/index.post.ts` +
  `control/server/utils/onboardingProvision.ts`. Die Migration MUSS vor dem
  Code-Deploy laufen, sonst bricht das Anlegen einer Community.
- SCHRIFTEN, 2 Rollen (Text + Überschriften, + fixe Mono — nie mehr als 3):
  Registry-Einzelfamilien in `themes/app/assets/css/fonts.css`
  (build-prozessiert → @nuxt/fonts self-hostet; NIE nach `public/`) +
  WOFF2-Uploads (Bucket 'fonts', Magic-Bytes-Check, 'cf-<rowId>', @font-face zur
  Laufzeit im Head). Legacy-Paar-Ids (editorial …) mappt `resolveThemeFonts()`.
- LIVE-PROPAGATION custom_themes/custom_fonts/app_config: Table-read(any) →
  `themes/app/plugins/realtime-themes.client.ts` refetcht debounct, offene
  Fenster (auch Gäste) morphen ohne Reload.
- Injizierte Theme-Styles sind unlayered und schlagen Tailwind-@layer-Utilities
  BEWUSST (z. B. headingWeight vs. font-bold).
- Admin-Nav-Registry (`pukalani.admin.modules`) kann children (Unterpunkte,
  RBAC-gefiltert, `exact` für Index-Einträge).
- COMMUNITY-SETTINGS-HUB + SWITCHER (F50/F51): ZWEI Reiter-Hüllen desselben
  Typs/Resolvers (`core/shared/types/settings-tab.ts`, inkl.
  productKey/planProduct/configFlag-Gates) — `pukalani.admin.settingsTabs` =
  Konto (`/dashboard/settings`), `pukalani.admin.communityTabs` = Community
  (`/dashboard/community`, sichtbar nur mit gefiltertem Inhalt).
  Community-Seiten LEBEN als Kinder unter `/dashboard/community/*` in ihren
  Layern; Alt-Pfade 301. Der Plan-Reiter ist Stripe-Rückkehr-Ziel
  (`apps/control/server/utils/communityCheckout.ts`) — Umbenennen nur mit
  Weiterleitung. Betreiber-Reiter im Silo-Hub hängen ZUSÄTZLICH an
  `configFlag: 'admin.instanceTabs'` (scopeVisibleAt('operator') gälte sonst
  auch in control/photos).
- SWITCHER (`pukalani.chrome.communitySwitcher`, nur platform) springt über die
  EINE `sealCommunityHandoff()` (onboarding) — Ziel-Host IMMER aus der
  Mitgliedschaftsliste, nie vom Aufrufer; nur Team-Rollen
  (owner/admin/moderator/editor), viewer bewusst nicht. Die zwei AUSGÄNGE
  („Community anlegen" → `/start`, „Communities verwalten" → `/communities`,
  beide auf dem Kontroll-Host) springen GESIEGELT:
  `POST /api/community/control-handoff` + `sealControlHostHandoff()` —
  Ziel-Host aus der CONFIG (`controlExitTarget` in
  `onboarding/shared/controlExit.ts`, controlHosts/wizardHosts), kein
  Control-Plane-Ruf; `sealHandoffToken` normalisiert die Audience SELBST, kein
  Wrapper nötig. `switch` + `control-handoff` sind gedrosselt (Bucket
  `onboarding:communities`). Beweis:
  `packages/onboarding/scripts/verify-control-exit.mjs`.
