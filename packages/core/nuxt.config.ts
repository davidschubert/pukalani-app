import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { FETCH_ERROR_HOOK } from './shared/fetchErrorBridge'
import { clearNitroRouteTypes } from './build/nitroRouteTypes'

const currentDir = dirname(fileURLToPath(import.meta.url))

/**
 * Die Zeile in Nuxts `fetch.mjs`, an der wir uns einhängen — und zugleich die
 * Sollbruchstelle: findet sie sich nicht mehr, bleibt die Vorlage unverändert.
 */
const FETCH_TEMPLATE_EXPORT = 'export const $fetch = globalThis.$fetch'

/**
 * DER EINE INTERCEPTOR (M13-Wechselwirkung, Befund 1).
 *
 * Ersetzt die Export-Zeile durch dieselbe Zeile MIT einem umhüllten Client-
 * `$fetch`. Warum das nicht in einem Plugin gehen kann, steht ausführlich in
 * `shared/fetchErrorBridge.ts` — kurz: der Export ist eine Momentaufnahme, ein
 * Plugin kommt zu spät.
 *
 * NUR IM BROWSER: auf dem Server ist `globalThis` prozessweit und über alle
 * Requests geteilt; ein Haken dort gehörte niemandem. `import.meta.client` wäre
 * hier ein Vite-Define — `typeof window` ist unabhängig davon und stimmt auch,
 * wenn diese Vorlage einmal woanders ausgewertet wird.
 *
 * FAIL-SOFT IN BEIDE RICHTUNGEN: ohne gesetzten Haken passiert nichts, und ein
 * werfender Haken darf niemals den `$fetch`-Aufruf kaputt machen, den er nur
 * kommentiert.
 */
const FETCH_TEMPLATE_WRAP = `
if (typeof window !== 'undefined' && !globalThis.${FETCH_ERROR_HOOK}Wrapped) {
  globalThis.${FETCH_ERROR_HOOK}Wrapped = true
  const __pukalaniBase = globalThis.$fetch
  globalThis.$fetch = __pukalaniBase.create({
    onResponseError(context) {
      try {
        globalThis.${FETCH_ERROR_HOOK}?.({
          status: context.response?.status ?? 0,
          reason: context.response?._data?.reason ?? '',
        })
      }
      catch {
        // Ein Hinweis darf nie zum Fehler werden
      }
    },
  })
}
${FETCH_TEMPLATE_EXPORT}`

// Build-Identität für /api/health (Deploy-Verifikation, A.5-Härtung):
// zur BUILD-Zeit aus git gelesen — ploi baut aus dem Repo, CI ebenso.
// Kein git verfügbar (z. B. Docker-Kontext ohne .git) → '' (Health zeigt null).
function resolveBuildSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: currentDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  }
  catch {
    return ''
  }
}

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/image', '@pinia/nuxt', '@nuxtjs/i18n'],

  // Bild-Naht Schritt 2 (C14). Im Layer, damit JEDE App `<NuxtImg>` erbt —
  // dasselbe Muster wie @nuxt/fonts, das über @nuxt/ui mitkommt.
  //
  // DER DEFAULT-ANBIETER IST `appwrite`, UND ZWAR GLOBAL — nicht nur je
  // Aufrufstelle. Zwei Gründe, beide wichtig:
  //  1. Ohne gesetzten Anbieter fällt @nuxt/image auf `ipx` zurück und
  //     registriert einen `/_ipx/**`-Handler, der Bilder AUF DEM APP-SERVER
  //     rechnet (module.js:363). Genau das soll hier nie passieren — der
  //     Server steht neben sieben Apps, und `ipx`/`sharp` sind deshalb in
  //     pnpm-workspace.yaml ausgeschlossen. Ein App-eigenes
  //     `image.provider: 'ipx'` würde den Build brechen; das ist die
  //     gewünschte Lautstärke.
  //  2. Der Anbieter ist gutmütig: was keine Appwrite-Datei ist (statische
  //     Bilder, fremde CDNs), reicht er unverändert durch. Global gesetzt
  //     kostet er also nichts und fängt trotzdem jede Aufrufstelle ein.
  //
  // AVIF steht BEWUSST NICHT in `format`: die Messung (2026-07-31, Zahlen an
  // STORAGE_PREVIEW_DEFAULT_FORMAT) hat den Aufpreis nicht getragen. Damit
  // erzeugt auch `<NuxtPicture>` nur WebP-Quellen; wer AVIF will, sagt es je
  // Bild (`format="avif"`).
  //
  // `densities: [1, 2]` ist der Nuxt-Default, hier nur festgehalten, weil er
  // die Kosten bestimmt: jede Breite × jede Dichte ist EINE Variante, die
  // Appwrite einmal rechnen und dauerhaft cachen muss. Aufrufstellen sollen
  // deshalb wenige `sizes`-Stufen nennen, nicht alle Bildschirmklassen.
  image: {
    provider: 'appwrite',
    providers: {
      appwrite: {
        name: 'appwrite',
        // Absoluter Pfad — relative Angaben löst @nuxt/image gegen die APP auf,
        // nicht gegen den Layer (dasselbe Problem wie bei `css` weiter unten).
        provider: join(currentDir, './app/providers/appwrite.ts'),
      },
    },
    quality: 78,
    format: ['webp'],
    densities: [1, 2],
  },

  // i18n: en ist Default/Fallback und liegt OHNE Prefix unter '/...'; alle anderen
  // Sprachen sind geprefixt (/de/*). Die gewählte Sprache steckt damit in der URL;
  // der Cookie (i18n_redirected) hält die zuletzt gewählte Sprache geräteweit.
  // redirectOn: 'all' → JEDE Seite folgt beim Aufruf/Refresh dem Cookie (nicht nur
  // '/'), sonst behalten Nicht-Wurzel-Seiten wie /dashboard ihre URL-Sprache und
  // laufen aus dem Tritt. Tradeoff: ein Deep-Link in einer anderen als der
  // gespeicherten Sprache wird auf die Präferenz umgeleitet. Layer bleibt lokal im
  // Monorepo (Remote-Layer-i18n-Bug); das Modul lädt bewusst in jeder App.
  i18n: {
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    // hreflang/canonical-Basis für useLocaleHead (SEO-Zweisprachigkeit trotz
    // Cookie-Redirects): Skeleton leer — die App setzt zur Laufzeit
    // NUXT_PUBLIC_I18N_BASE_URL (= ihre öffentliche URL). Ohne Wert bleiben
    // die Alternate-Links relativ (lokal ok, Prod setzt die Env).
    baseUrl: '',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'all',
      // BEWUSST kein fallbackLocale: Requests OHNE Signal (kein Cookie, kein
      // Accept-Language — v. a. Crawler) wurden sonst auch auf /de/* auf EN
      // gezwungen (falsches og:locale/canonical, EN-Content unter /de).
      // Ohne Fallback bleibt die URL-Locale die Autorität; Besucher mit
      // Cookie/Browser-Sprache verhalten sich unverändert.
    },
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
    ],
  },

  // Absoluter Pfad statt ~/ — Aliases würden relativ zur App aufgelöst
  css: [join(currentDir, './app/assets/css/main.css')],

  // stores/ wird im Layer nicht automatisch gescannt (nur composables/ + utils/)
  imports: {
    dirs: [join(currentDir, './app/stores')],
  },

  // Stabiles Fehler-Envelope für /api (server/error.ts) — externe API-Konsumenten.
  //
  // ACHTUNG (Audit-Befund B2, 2026-07-27): NICHT als `nitro: { errorHandler }`
  // setzen! @nuxt/nitro-server 4.4.8 registriert seinen EIGENEN Nitro-Handler
  // (der die gebrandete error.vue rendert) nur, wenn das Feld noch leer ist
  // (dist/index.mjs:402: `if (!nitroConfig.errorHandler && …)`). Ein Wert in
  // der nuxt.config verdrängte ihn also — übrig blieb Nitros eingebauter
  // `internal/error/prod`, der IMMER rohes JSON schickt (nitropack 2.13.4).
  // Damit gab es faktisch keine 404-Seite. Deshalb hängen wir uns hier VOR
  // die bestehende Kette: `nitro:config` läuft NACH Nuxts Zuweisung
  // (callHook in @nuxt/nitro-server erst später), Nitro erlaubt ein Array und
  // ruft die Handler in Reihenfolge, bis einer geantwortet hat (event.handled).
  hooks: {
    /**
     * `#build/fetch.mjs` um den EINEN Interceptor erweitern (s. o. und
     * shared/fetchErrorBridge.ts). Bewusst als STRING-ERSETZUNG auf Nuxts
     * eigener Ausgabe statt als neu geschriebene Vorlage: so bleibt alles
     * andere Nuxts Sache.
     *
     * ABER LAUT SCHEITERN (Regel aus der Glocken-Falle, CLAUDE.md): greift die
     * Ersetzung nicht — etwa weil ein Nuxt-Bump die Zeile umbenennt —, dann
     * fehlt der Hinweis „Community ist schreibgeschützt" ERSATZLOS, und niemand
     * merkt es, weil alles andere weiterläuft. Ein stiller Ausfall ist hier
     * schlimmer als ein lauter, deshalb Warnung mit Anleitung statt Schweigen.
     */
    'app:templates': (app) => {
      const template = app.templates.find(entry => entry.filename === 'fetch.mjs')
      const original = template?.getContents
      if (!template || typeof original !== 'function') {
        console.warn('⚠️  [pukalani/core] Vorlage `fetch.mjs` nicht gefunden — der $fetch-Interceptor hängt NICHT. Folge: gesperrte Communities melden sich Mitgliedern nicht mehr (fetchErrorBridge.ts).')
        return
      }
      template.getContents = async (context) => {
        const source = String(await original(context))
        if (!source.includes(FETCH_TEMPLATE_EXPORT)) {
          console.warn(`⚠️  [pukalani/core] \`${FETCH_TEMPLATE_EXPORT}\` steht nicht mehr in Nuxts fetch.mjs — der $fetch-Interceptor hängt NICHT. Neue Zeile nachsehen und FETCH_TEMPLATE_EXPORT anpassen (fetchErrorBridge.ts).`)
          return source
        }
        return source.replace(FETCH_TEMPLATE_EXPORT, FETCH_TEMPLATE_WRAP)
      }
    },

    'nitro:config': (nitroConfig) => {
      const ownHandler = join(currentDir, './server/error.ts')
      const existing = nitroConfig.errorHandler
      const chain = existing === undefined
        ? []
        : (Array.isArray(existing) ? existing : [existing])
      if (chain.includes(ownHandler)) return
      nitroConfig.errorHandler = [ownHandler, ...chain]
    },

    /**
     * NITROS ROUTEN-TYPISIERUNG IST AUS (2026-08-14). Der Grund ist gemessen,
     * nicht geschätzt — und er ist der EINZIGE Grund, warum eine neue
     * Server-Route zuletzt fremde Dateien umwarf (`TS2589`).
     *
     * WAS NITRO NORMAL TUT: es schreibt `.nuxt/types/nitro-routes.d.ts` mit
     * EINEM Eintrag je Route — `'/api/x': { get: Simplify<Serialize<Awaited<
     * ReturnType<typeof import('…').default>>>> }`. Diese `InternalApi`-Map
     * lässt `$fetch('/api/x')` seinen Antworttyp aus dem Handler ABLEITEN.
     *
     * WARUM DAS HIER NICHT MEHR GEHT: `$fetch` löst an JEDER Aufrufstelle den
     * Routen-Literal gegen `keyof InternalApi` auf (`MatchedRoutes` verteilt
     * über ALLE Schlüssel). Die Kosten sind damit
     * `Aufrufstellen × Routen` — bei ~370 Aufrufstellen und 210 Routen in
     * `platform` waren das **6,9 Mio. der 7,5 Mio. Typ-Instanziierungen (92 %)**.
     * TypeScript bricht bei 5 Mio. in einem Ausdruck mit `TS2589` ab; der
     * Fehler erscheint dann an einer BELIEBIGEN Aufrufstelle — zuletzt in
     * `packages/core/app/plugins/analytics.ts`, einer Datei, die niemand
     * angefasst hatte. Zwölf zusätzliche Probe-Routen genügten, um ihn erneut
     * auszulösen.
     *
     * WAS NICHT HILFT (beides gemessen, 2026-08-14): explizite
     * Rückgabe-Annotationen an den Handlern. Ersetzt man testweise JEDEN
     * Routen-Rückgabetyp durch ein flaches Objekt, fallen die
     * Instanziierungen von 7.505.010 auf 7.430.076 — **1 %**. Die Tiefe der
     * Rückgabetypen ist NICHT das Problem, die ANZAHL der Schlüssel ist es.
     * Wer diese Zeilen also durch „wir annotieren die Handler" ersetzen will,
     * misst bitte vorher.
     *
     * DER PREIS: `$fetch('/api/x')` liefert `unknown` statt des abgeleiteten
     * Typs. Das kostete beim Umstellen GENAU 6 Stellen in 2 Dateien — 98 %
     * aller Aufrufstellen nennen ihren Typ ohnehin selbst (`$fetch<T>(…)`),
     * und ein selbst genannter Typ hat die Ableitung nie benutzt: `$fetch<T>`
     * kürzt `TypedInternalResponse` sofort auf `T` ab, OHNE gegen den Handler
     * zu prüfen. Wir geben hier also fast nichts auf, was wir hatten.
     * Gegenzug: ESLint verlangt in `app/**` ein Typ-Argument an `$fetch`/
     * `useFetch` (eslint.config.mjs) — sonst käme `unknown` still durch.
     *
     * WIRKUNG: 7.505.010 → 618.515 Instanziierungen (−92 %), Check-Zeit
     * 10,7 s → 5,6 s. Der Abstand zur 5-Mio.-Grenze ist damit wieder ~8×
     * statt ~0. Eine neue Route kostet jetzt NICHTS.
     *
     * `types:extend` läuft, BEVOR Nitro die Dateien schreibt, und
     * `generateRoutes()` liest `types.routes` erst beim Schreiben (lazy) —
     * das Leeren hier ist deshalb der vorgesehene Weg, kein Eingriff in eine
     * fertige Datei.
     */
    'nitro:init': (nitro) => {
      nitro.hooks.hook('types:extend', clearNitroRouteTypes)
    },
  },

  // Skeleton mit Leer-Defaults (Typ-Inferenz) — echte Werte aus .env der App.
  // Der API Key ist server-only und gehört NIE in public.*
  runtimeConfig: {
    appwriteKey: '',
    // server-only! Env-Mapping: NUXT_AI_KEY — API-Key für aiComplete()
    // (OpenRouter- oder anderer OpenAI-kompatibler Anbieter, Gate: pukalani.ai).
    // SEIT 2026-08-18 der ZWEITE Weg: der erste ist der Eintrag über die
    // Betreiber-Konsole (instance_secrets, system-036). DB schlägt Env —
    // Begründung in server/utils/instanceSecrets.ts.
    aiKey: '',
    // server-only! Umschlag-Schlüssel für `instance_secrets` (64 Hex-Zeichen,
    // `openssl rand -hex 32`). Ohne ihn bleibt das Schlüssel-Feld in der
    // Konsole zu und es gilt allein die Env — die Oberfläche sagt das auch.
    instanceSecretsKey: '',
    // server-only! SMTP für E-Mail-Notifications (server/utils/mailer.ts) —
    // leerer Host = Mail-Versand aus. Env: NUXT_SMTP_HOST/PORT/USER/PASS/FROM
    // (lokal: Mailpit localhost:1025 ohne Auth).
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    // server-only! Env: NUXT_TURNSTILE_SECRET — Secret Key von Cloudflare
    // Turnstile (Bot-Beweis an signup/otp/recovery, Vorfall 2026-10-27).
    // Leer = aus, ZUSAMMEN mit `public.turnstileSiteKey` der Schalter
    // (shared/turnstile.ts: beide leer = aus, beide gesetzt = an, nur einer =
    // Fehlkonfiguration, laut im Log). Prüfung: server/utils/turnstile.ts.
    turnstileSecret: '',
    // server-only! Entitlement-Zustellung (F3/M8-Vorbereitung): URL des
    // Control-Plane-Dokuments (leer = Pull aus, Gates neutral) + kid→Public-
    // Key-Map (JSON, SPKI-DER base64). Env: NUXT_ENTITLEMENTS_URL /
    // NUXT_ENTITLEMENTS_PUBLIC_KEYS — Keys erzeugt scripts/entitlements-keygen.mjs
    entitlementsUrl: '',
    entitlementsPublicKeys: '',
    // server-only! Alert-Empfänger für Betriebs-Mails (L6: Health-Sweep-
    // Statuswechsel im Control; Beschluss 2026-07-17: mail@davidschubert.com).
    // Leer = keine Alert-Mails. Env: NUXT_ALERT_EMAIL — Versand best-effort
    // über den Core-Mailer (ohne SMTP still no-op).
    alertEmail: '',
    // server-only! Geteilter Rate-Limit-Store (OPEN-ITEMS #8, Beschluss
    // 2026-07-22: Redis auf app-prod). Leer = In-Memory pro Instanz (Dev/
    // Single-Instanz unverändert). Env: NUXT_REDIS_URL, z. B.
    // redis://127.0.0.1:6379 — ALLE Sites eines Servers teilen die Instanz,
    // die Keys sind pro Appwrite-Projekt gescoped (keine App-Kollisionen).
    redisUrl: '',
    /**
     * server-only! Env: NUXT_ANALYTICS_PROXY_ORIGIN — biegt die Herkunft des
     * Adblock-Proxys (F47/Paket 5) auf eine andere Adresse um.
     *
     * LEER = der Normalfall: die Herkunft folgt der App-Config
     * (`pukalani.analytics.instance` bzw. der Basis aus `…analytics.src`). Die
     * Variable gibt es für den BEWEIS — sie zeigt dort auf eine Attrappe statt
     * auf die Produktions-Instanz — und als Notnagel, falls die Instanz einmal
     * unter einer anderen Adresse steht als der `<script src>` im Head.
     *
     * Sie läuft durch dieselbe Prüfung wie die Config-Werte (`http(s)://…`);
     * ein Tippfehler schaltet den Proxy ab (404), statt irgendwohin zu zeigen.
     */
    analyticsProxyOrigin: '',
    /**
     * server-only! Env: NUXT_GEO_CITY_DB_PATH — absoluter Pfad zur lokalen
     * MMDB-Datei (DB-IP City Lite), aus der die Sessions-Liste zu jeder
     * Session-IP Stadt + Region auflöst (server/utils/geoCity.ts).
     *
     * LEER = aus, und das ist der Default: die Datei ist ~124 MB und wird
     * nicht mit deployt. Ohne Pfad zeigt die Sitzungsliste exakt wie bisher
     * nur das Land, das Appwrite liefert — kein Fehler, keine Warnung.
     *
     * Der PFAD IST DER SCHALTER (kein zusätzliches app.config-Gate): eine
     * Datei, die es geben muss, ist die ehrlichere Bedingung als ein Flag,
     * das man neben ihr auch noch setzen könnte.
     */
    geoCityDbPath: '',
    /**
     * server-only! Env: NUXT_GEO_CITIES_PATH — absoluter Pfad zum lokalen
     * ORTS-VERZEICHNIS (GeoNames-Auszug als TSV, ~10 MB, erzeugt von
     * scripts/geo/build-geonames-cities.mjs), aus dem der Orts-Picker im
     * Profil seine Vorschläge nimmt (server/utils/geoCities.ts).
     *
     * NICHT ZU VERWECHSELN mit `geoCityDbPath` darüber: das ist die
     * IP-Datenbank („wo war diese Sitzung?"), das hier ist ein Namens-
     * Verzeichnis („wo wohnst du?"). Zwei Dateien, zwei Fragen, zwei
     * Lizenzen (DB-IP bzw. GeoNames, beide CC BY 4.0).
     *
     * LEER = der Picker ist AUS: das Feld findet dann nichts. Der PFAD IST
     * DER SCHALTER — dieselbe Regel wie eine Zeile höher.
     */
    geoCitiesPath: '',
    public: {
      // Deployter Commit (Build-Zeit aus git) — /api/health spiegelt ihn,
      // der Deploy-Workflow verifiziert damit, dass ploi den erwarteten
      // Stand wirklich gebaut hat (verschluckte Webhooks fallen sofort auf)
      buildSha: resolveBuildSha(),
      appwriteEndpoint: '',
      appwriteProjectId: '',
      appwriteDatabaseId: '',
      // Env: NUXT_PUBLIC_TURNSTILE_SITE_KEY — Site Key von Cloudflare Turnstile
      // (öffentlich, steht im Widget). Leer = kein Widget, die Formulare
      // verhalten sich wie vor dem Vorfall 2026-10-27. Gegenstück zum
      // server-only `turnstileSecret` oben.
      turnstileSiteKey: '',
      // Storage-Bucket für Profilfotos (gehört der App). Leer = Foto-Upload-UI
      // ausgeblendet, bis der Bucket existiert (NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET).
      appwriteAvatarsBucket: '',
      // Storage-Bucket für GDPR-Pre-Delete-Snapshots (gehört der App). Leer =
      // Löschung läuft OHNE Snapshot (NUXT_PUBLIC_APPWRITE_GDPR_BUCKET).
      appwriteGdprBucket: '',
      // Gegenpart zu NUXT_PUBLIC_APP_URL — ohne Skeleton-Key mappt die Env-Var ins Leere
      appUrl: '',
      // Social-Login: welche Provider hat DIESE INSTANZ wirklich belegt
      // (kommagetrennt, heute nur `google`) — NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS.
      // ZWEITE Bedingung neben `pukalani.auth.providers`: die Client-Id und das
      // Geheimnis liegen in der Appwrite-Console, nicht bei uns; eine
      // app.config gilt aber für jede Instanz, die den Layer erbt. Leer =
      // kein Knopf, und genau deshalb ist dieser Bau ohne Credentials
      // gefahrlos. Regeln + Begründung: core/shared/oauthProviders.ts
      authOauthProviders: '',
      tenancy: {
        // Kontroll-Hosts der Multi-Tenant-App (Kundenbereich/Onboarding),
        // kommagetrennt: NUXT_PUBLIC_TENANCY_CONTROL_HOSTS. Laufzeit-Override
        // von pukalani.tenancy.controlHosts — die Hosts unterscheiden sich je
        // Umgebung (lokal app.localhost, Prod app.pukalani.app).
        controlHosts: '',
        // Die Kontroll-Hosts, auf denen `/` direkt in den Anlege-Wizard führt
        // (F12), kommagetrennt: NUXT_PUBLIC_TENANCY_WIZARD_HOSTS. Laufzeit-
        // Override von pukalani.tenancy.wizardHosts — lokal heißen sie anders
        // als in Produktion (start.localhost; in Produktion gibt es seit AH-1
        // keinen eigenen Wizard-Host mehr).
        wizardHosts: '',
        // Abgeschaltete Kontroll-Host-NAMEN, die 301 auf controlHosts[0]
        // weiterleiten (AH-1), kommagetrennt:
        // NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS. Laufzeit-Override von
        // pukalani.tenancy.legacyControlHosts.
        legacyControlHosts: '',
      },
    },
  },
})
