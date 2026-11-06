---
paths:
  - "packages/themes/**"
  - "packages/system/**"
  - "packages/admin/**"
  - "packages/onboarding/**"
  - "packages/core/app/plugins/**"
  - "packages/core/app/composables/useTheme*"
  - "packages/core/shared/theme*"
  - "packages/control/server/api/control/community/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Themes (Layer themes; Tables besitzt system, Admin-Routen admin — A14)
- Built-in-Katalog 26×11 (seit 2026-07-24): theme.catalog.ts ist der EINZIGE
  Input — `pnpm --filter @pukalani/themes generate -- --write` erzeugt
  public/themes/*.css + themeRegistry.gen.ts (committet; CI-Gate
  `check:themes` in lint.yml: Regenerieren darf kein Diff erzeugen). Ramps
  ankern die Basisfarbe fest auf Stufe 500; Kontrast-Gate verschiebt
  --ui-primary-Stufen selbst. Öffentlicher Picker = ThemePickerModal
  (Grid + sticky Varianten-Reihe), NIE CSS/Registry von Hand editieren.
  AUSNAHME `default`: steht bewusst NICHT im Katalog, sondern handgepflegt in
  app/utils/themeRegistry.ts. Sein Anzeige-Label ist seit 2026-07-29
  „**Aloha**" (davor „Sunrise" — klang neben der Katalog-Welt „Sunset"
  verwandt, B3; davor „Maui" — interner Produktname vor Kunden, N6). Label
  ≠ Key: die Id bleibt `default` (communities.theme, data-theme, CSS-Dateinamen,
  gespeicherte Configs) — Theme-Namen nie über die Id umbenennen. Theme-Namen
  sind Eigennamen und laufen NICHT über i18n (de = en).
- Customize theme: /dashboard/themes (Galerie, Zweispalten), Editor als Vollseite
  (/new, /:id — Dock: Boxen „Farben"+„Schriften", je EIN „Erweitert"),
  Schriften-Verwaltung /dashboard/themes/fonts. Konzept + bewusste
  Ablehnungen: docs/referenz/THEMES-CONCEPT-V2.md — Einfachheit ist Leitprinzip
  (Standardansicht = wenige Entscheidungen, kein Slot-/Regler-Zoo)
- Custom Themes: Table custom_themes (system-Migrationen 009–013), Ramp zur
  Laufzeit aus EINER Basisfarbe (themes/shared/ramp.ts, OKLCH + Tests).
  config-JSON NUR ADDITIV erweitern (kein version-Feld): neutral 'tinted',
  font/fontHeading, darkAlias, headingWeight/Tracking/Uppercase, radius
- <html>-Attribute (SSR-Head via theme-Plugin, flash-frei; Draft-Vorschau
  im Editor setzt sie direkt und stellt beim Verlassen den LIVE-Zustand aus
  useTheme() wieder her): data-theme ('c-<rowId>'), data-variant,
  data-neutral, data-font, data-font-heading
- WESSEN FARBWELT GILT? (B5, seit 2026-07-29 — Davids Entscheidung): auf einem
  MANDANTEN-Host gewinnt die Community, nicht der Besucher. EINE pure Regel in
  `themes/shared/themeSelection.ts` (`resolveThemeSelection`, 11 Fälle
  getestet), `useTheme()` legt nur Cookies + Registry-Validierung darum:
  Mandanten-Host ⇒ `communities.theme/variant` (useTenantBranding), ohne eigene
  Wahl ('') die Instanz-Einstellung — das Theme-Cookie wird dort GAR NICHT
  gelesen; sonst (Silo, Kontroll-Host, Playground) weiter Cookie ⇒ Instanz ⇒
  Core-Default. Flash-frei, weil `branding` aus dem SSR-Payload kommt und der
  Server schon das richtige data-theme + die richtige CSS-Datei stempelt.
  Der Theme-WÄHLER verschwindet auf Mandanten-Hosts (`canChooseTheme` aus
  useTheme() — öffentliches DisplaySettingsMenu, Dashboard-Kontomenü, Hinweis
  im Customize theme): ein Wähler ohne Wirkung wäre eine Lüge, und die
  Community-Farbe setzt der Owner unter /dashboard/settings/community.
  DIE NEUTRAL-PALETTE FOLGT MIT (B5-Rest, 2026-07-29 — Davids Entscheidung):
  `data-neutral` ist eine EIGENE Achse und blieb nur Besucher-Wahl, weil es
  dafür keine Community-Einstellung gab. Jetzt: `communities.neutral` (Migration
  **control-020**, additiv, '' = keine eigene Wahl). Zweite pure Funktion
  `resolveNeutralSelection` + `visitorMayChooseNeutral` NEBEN
  resolveThemeSelection — kein viertes Feld im Theme-Ergebnis, weil die Herkunft
  abweichen DARF (Kontroll-Host: Theme aus der Instanz, Palette vom Besucher).
  Eine Instanz-Einstellung für die Palette gibt es BEWUSST NICHT; Default ist die
  Registry-Voreinstellung. Gesetzt als EINE Zeile „Grundton" unter
  /dashboard/settings/community (Chips, weil '' nicht in ein USelectItem darf),
  geprüft gegen NEUTRAL_REGISTRY. `neutral` im PATCH-Body ist OPTIONAL, und das
  ist Betrieb statt Geschmack: platform und control sind zwei Deployments —
  Pflichtfeld hieße 400 auf jedes Umfärben, solange eine neue control neben
  einer alten platform läuft; fehlendes Feld heißt „nicht angefasst", nie ''.
  Der Wähler verschwindet auf Mandanten-Hosts überall (`canChooseNeutral`).
  NICHT betroffen und Besucher-Wahl bleibend: Hell/Dunkel (useColorMode),
  Seitenleiste, Sprache. Beweis: verify-site-branding.mjs (40/40).
- LIVE-PROPAGATION für Community-Branding läuft über einen SPIEGEL (D6, seit
  2026-08-01). Die Wahrheit bleibt `communities.theme/variant/neutral` im
  Control-Plane-PROJEKT — dort hat der Browser weder Session noch Leserecht.
  Deshalb schreibt `PATCH /api/community/branding` den BESTÄTIGTEN Zustand
  zusätzlich in `community_branding` (system-028, EINE Row je Community,
  rowId = `communities.$id`, read(any), kein Index) — `mirrorCommunityBranding()`
  in core/server/utils, NACH dem Control Plane und FAIL-SOFT. Der Client
  abonniert GENAU seine Row (core/app/plugins/realtime-branding.client.ts,
  `useSiteId()` + `mirrorBelongsToCommunity` als Netz) und schreibt sie in
  `useTenantBranding()`; ab da rechnen resolveThemeSelection/
  resolveNeutralSelection (B5) und der Head-Getter wie immer. Ohne Community-Id
  (Kontroll-Host, Silo, Playground) abonniert das Plugin GAR NICHTS.
  DREI REGELN, die man nicht „vereinfachen" darf: (1) **kein `upsertRow`** —
  Appwrite 1.9.6 schreibt damit korrekt, publiziert aber KEIN Realtime-Event
  (2026-08-01 live erwischt; der Spiegel wäre eine Attrappe): `updateRow`, bei
  404 `createRow`. (2) Der Spiegel wird NIE gelesen, um zu rendern — SSR fragt
  weiter den Resolver (≤30 s Cache), ein fehlgeschlagenes Spiegeln heilt der
  nächste Seitenaufbau. (3) `themeSettings.defaultThemeId` (Tab-Farbe, Favicon,
  og:image) morpht BEWUSST nicht mit: das Nachziehen würde die
  Instanz-Voreinstellung überschreiben und wäre beim Zurücksetzen auf '' nicht
  mehr rückrechenbar. custom_themes/custom_fonts/app_config morphen weiter über
  das realtime-themes-Plugin (Refetch), weil sie im Runtime-Projekt liegen.
  LOKAL TESTEN: die Dev-Appwrite kennt nur `localhost` als Web-Platform — auf
  `kunde-a.localhost` & Co. bricht der WS-Handshake mit „Invalid Origin" ab
  (Client loggt nur „Realtime disconnected"). Sieht wie ein Code-Fehler aus, ist
  die Testumgebung. DASSELBE IN PROD (F45, 2026-08-03): im Projekt `control`
  stand GAR KEINE Web-Platform, also war auf der Betreiber-Konsole jede Realtime
  tot — Sofort-Abmeldung, Glocke, Live-Theme. Jedes Appwrite-Projekt braucht
  seinen Host dort (`account` hat ein Wildcard `*.pukalani.app` und deckt damit
  jeden neuen Mandanten automatisch). DIAGNOSE: der WS-**Handshake** verrät
  nichts, er antwortet `101` auch für einen abgewiesenen Origin — die Ablehnung
  kommt als erste Nachricht IM Socket (`code 1008`). Billiger Test:
  `curl -H "Origin: https://<host>" .../v1/account` — `403
  general_unknown_origin` = Host unbekannt, `401` = akzeptiert. Wer stattdessen
  den Socket mitlesen will, braucht `--http1.1` (über HTTP/2 scheitert der
  Upgrade mit 400 und man misst sein eigenes Werkzeug).
- COMMUNITY-FAVICON-UPLOAD (2026-08-18, Davids Zuschnitt): eine Pool-Community
  lädt unter /dashboard/community/branding ein eigenes PNG-Favicon hoch (nur
  PNG, 32–512 px Kante, ≤ 1 MB, Magic-Bytes statt MIME) — gilt im Tab UND als
  App-Icon; og:image bleibt generiert, ohne Upload gilt das Initial-SVG. Die
  WAHRHEIT ist die DATEI selbst: Bucket `favicons` (system-037, permissions
  [], Server-only), fileId = communityId, Existenz + `$updatedAt` ersetzen
  jede communities-Spalte und jedes Spiegel-Feld (`community_branding` bleibt
  bei drei Farb-Feldern!); `$updatedAt` bricht als Teil von
  `uploadedBrandIconKey` die immutable `/icon/<key>.png`-URLs. SSR-Kopf über
  die U15-Kette (core: communityFaviconStore → 10.community-favicon →
  Payload-Plugin → useCommunityFavicon; themes/theme.ts unterdrückt bei Upload
  den favicon.svg-Link). Routen im onboarding-Layer
  (/api/community/branding/favicon, branding.manage); Auslieferung durch die
  BESTEHENDE Icon-Route (getFilePreview Center-Crop, getFileView-Fallback).
  Bewusst KEINE Live-Propagation (wie themeSettings.defaultThemeId). Beweis:
  `packages/onboarding/scripts/verify-community-favicon.mjs` (14, Gegenproben).
- `createRow<TenantRow>` verlangt ALLE Spalten explizit (bewusst) — eine neue
  communities-Spalte erzwingt eine Entscheidung an DREI Anlegestellen:
  control/tenants/index.post.ts + onboardingProvision.ts (der DATEIname blieb)
  + `scripts/ops/f3-lib/rules.mts` (`communityRowData`, das F3-Werkzeug — hier
  stand bis 2026-08-17 „BEIDEN", und die dritte Stelle fand nur der Wächter
  `packages/control/tests/f3CommentsToPool.test.ts`, der genau diese Liste
  gegen die Route nagelt). Folge: die Migration MUSS vor dem Code-Deploy
  laufen, sonst bricht das Anlegen einer Community.
- Schriften, 2 Rollen (Text + Überschriften, + fixe Mono — nie mehr als 3):
  Registry-Einzelfamilien in app/assets/css/fonts.css (build-prozessiert →
  @nuxt/fonts self-hostet; NIE nach public/) + WOFF2-Uploads (Bucket 'fonts',
  Magic-Bytes-Check, 'cf-<rowId>', @font-face zur Laufzeit im Head).
  Legacy-Paar-Ids (editorial …) mappt resolveThemeFonts()
- Live-Propagation: custom_themes/custom_fonts/app_config sind Table-read(any)
  → realtime-themes-Plugin refetcht debounct, Head reagiert — offene Fenster
  (auch Gäste) morphen ohne Reload
- Injizierte Theme-Styles sind unlayered und schlagen Tailwind-@layer-
  Utilities BEWUSST (z. B. headingWeight vs. font-bold)
- Admin-Nav-Registry (pukalani.admin.modules) kann children (Unterpunkte,
  RBAC-gefiltert, exact für Index-Einträge)
- COMMUNITY-SETTINGS-HUB + SWITCHER (F50/F51, seit 2026-08-08): ZWEI
  Reiter-Hüllen desselben Typs/Resolvers (settings-tab.ts, inkl.
  productKey/planProduct/configFlag-Gates) — `pukalani.admin.settingsTabs` =
  Konto (/dashboard/settings), `pukalani.admin.communityTabs` = Community
  (/dashboard/community, Menüpunkt unten links, sichtbar nur mit gefiltertem
  Inhalt). Community-Seiten LEBEN als Kinder unter /dashboard/community/* in
  ihren Layern; Alt-Pfade 301. Der Plan-Reiter ist Stripe-Rückkehr-Ziel
  (communityCheckout.ts) — Umbenennen nur mit Weiterleitung. Betreiber-Reiter
  im Silo-Hub hängen ZUSÄTZLICH an `configFlag: 'admin.instanceTabs'`
  (scopeVisibleAt('operator') gälte sonst auch in control/photos). Der
  Switcher (pukalani.chrome.communitySwitcher, nur platform) springt über
  die EINE `sealCommunityHandoff()` (onboarding) — Ziel-Host IMMER aus der
  Mitgliedschaftsliste, nie vom Aufrufer (Audit 2026-08-02); nur Team-Rollen
  (owner/admin/moderator/editor), viewer bewusst nicht. Auch die zwei
  AUSGÄNGE („Community anlegen" → start.*, „Communities verwalten" → my.*)
  springen GESIEGELT (F50-Nachtrag 2026-08-08): `POST /api/community/
  control-handoff` + `sealControlHostHandoff()` — Ziel-Host aus der CONFIG
  (`controlExitTarget`, controlHosts/wizardHosts), kein Control-Plane-Ruf
  (die Audience normalisiert `sealHandoffToken` SELBST — kein Wrapper nötig).
  `switch` + `control-handoff` sind gedrosselt (Bucket
  `onboarding:communities`, wie der Kundenbereichs-Handoff).
  Beweis: packages/onboarding/scripts/verify-control-exit.mjs.
