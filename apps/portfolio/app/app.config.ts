export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // pukalani: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  pukalani: {
    /**
     * SEITEN 60 s FERTIG HALTEN (Q22, Davids Entscheidung R3 vom 2026-11-21,
     * DECISION-LOG): NUR die öffentlichen Seiten (Layout `site`) — Anmeldung und Dashboard
     * dieser App tragen Konten und bleiben frisch; das Erstgespräch meldet sich
     * per `definePageMeta` ab. Regeln und Grenzen: `packages/core/shared/pageCache.ts`.
     */
    pageCache: {
      enabled: true,
      layouts: ['site'],
    },
    // STRUKTURIERTE FEHLERZEILEN (OPS-011, 2026-11-16): 5xx-Zeilen am
    // zentralen Fehler-Hook UND die Browser-Fehler-Annahme
    // (POST /api/telemetry/error, je Prozess gedeckelt) — ein täglicher
    // Wächter zählt diese Zeilen in den pm2-Logs.
    observability: { enabled: true, clientErrors: true },
    // Profilbilder ohne Profil (KE3): der Lauf LÖSCHT ('apply') seit dem
    // 2026-11-17 — Davids Ja zur gezählten Zahl (über alle drei Apps mit
    // Bucket: 1 Datei, deren Konto es nicht mehr gibt). Log `retention.run`,
    // `job: avatar-orphan-sweep`. Rückweg: 'count' (zählt nur) oder 'off';
    // Gelöschtes kommt damit nicht wieder.
    storage: { avatarOrphanSweep: 'apply' },
    /**
     * DER FRISTEN-LAUF DES KONTO-PROTOKOLLS LÖSCHT (EL1 c): 'apply' seit dem
     * 2026-11-17 — Davids Ja zur gezählten Zahl (0 Einträge älter als 12
     * Monate an diesem Tag). Stündlich fällt jeder Eintrag in `audit_logs`,
     * der älter als 12 Monate ist (`retention.run`,
     * `job: audit-log-retention`). Rückweg: 'count' (zählt nur) oder 'off'
     * (dann auch die Zeile in ops/timed-jobs.conf löschen); Gelöschtes kommt
     * damit nicht wieder.
     */
    audit: { retention: 'apply' },
    /**
     * DER FRISTEN-LAUF DER GESPRÄCHSANFRAGEN LÖSCHT (EL1 c, Davids
     * Entscheidung 2026-11-15) — 'off' | 'count' | 'apply'. Stündlich: jede
     * Anfrage in `intro_requests` 12 Monate nach dem Eingang löschen
     * (`server/utils/introRequestRetentionRun.ts`, Regel in
     * `shared/introRequestRetention.ts`). Einen Layer-Default gibt es nicht —
     * fehlt der Wert, heisst das 'off'.
     *
     * 'apply' seit dem 2026-11-17 — Davids Ja zur gezählten Zahl (0 Anfragen
     * älter als 12 Monate an diesem Tag); Log `retention.run`,
     * `job: intro-request-retention`. Rückweg: 'count' (liest mit derselben
     * Auswahl und zählt nur) oder 'off' (dann auch die Zeile in
     * ops/timed-jobs.conf löschen); Gelöschtes kommt damit nicht wieder. Ein
     * unbekannter Wert gilt als 'off' und schreibt eine Fehlerzeile.
     */
    portfolio: { introRequestRetention: 'apply' },
    /**
     * DER NAME, DEN DER BESUCHER SIEHT (2026-08-12).
     *
     * `useBrandName()` im Core geht die Kette Mandanten-Name → App-Marke →
     * Rückfall „Pukalani". Diese Site ist ein Silo, hat also keinen
     * Mandanten-Namen — und ohne diesen Eintrag stand im Tab-Titel jeder
     * CMS-Seite „Impressum · **Pukalani**", während Fußzeile, Structured Data
     * und `og:site_name` überall „Pukalani Studio" sagen. Der Rückfall ist der
     * PLATTFORM-Name; die Marke DIESER Site ist das Studio.
     *
     * Wirkt auf Seitentitel und Social-Tags (useBrandTitle) sowie auf die
     * Fehlerseite (CoreErrorPage). Kopf- und Fußzeile tragen ihre eigene
     * Wortmarke und bleiben unberührt.
     */
    brand: { name: 'Pukalani Studio' },
    /**
     * „WEBSITE-EINSTELLUNGEN" STATT „COMMUNITY-EINSTELLUNGEN" (Davids
     * Entscheidung 2026-09-08, DECISION-LOG „Navigation anpassen"): portfolio
     * ist ein Silo ohne Community; der Schalter benennt die Hülle um und hängt
     * die vier Betreiber-Reiter hinein — wie in apps/comments und
     * apps/branding (Begründung an `instanceTabs` in
     * packages/core/app/app.config.ts).
     */
    admin: { instanceTabs: true },
    /**
     * SEO-BASIS AUS DEM REQUEST-HOST (control-036, 2026-08-07).
     *
     * Sobald diese Site eine eigene Domain hat, bedient DERSELBE Prozess zwei
     * Hosts — die Pukalani-Adresse und die Kundendomain. `i18n.baseUrl` ist
     * aber EINE Env pro App (`NUXT_PUBLIC_I18N_BASE_URL`): canonical, alle
     * hreflang-Alternates und og:url zeigten damit auf der neuen Domain
     * weiterhin auf die alte. Das ist wortwörtlich Audit-Befund B1, nur in
     * Silo-Gestalt — und es hiesse, dass Google die Kundendomain nicht
     * indexiert.
     *
     * Mit diesem Schalter kommen Host und Port aus dem Request und NUR das
     * Schema aus der Env (core/shared/seoOrigin.ts). Damit ist nach der
     * Freischaltung KEIN Handgriff in einer Env noetig: die vorhandene
     * `NUXT_PUBLIC_I18N_BASE_URL` liefert weiterhin `https` und darf so
     * stehen bleiben, wie sie ist.
     *
     * Gefahrlos, weil die Middleware des `domains`-Layers dafuer sorgt, dass
     * Seiten nur unter der kanonischen Adresse gerendert werden — jeder
     * andere bekannte Host leitet vorher um.
     */
    seo: { originFromRequest: true },
    /**
     * Plausible (self-hosted, plausible.hawaii.studio) — cookielos, deshalb
     * kein Consent-Banner. v3-Snippet: die Site-Zuordnung zu
     * portfolio.pukalani.app steckt in der Script-Id (pa-…); Outbound-Links/
     * Downloads/Formulare sind serverseitig an der Id konfiguriert.
     */
    analytics: {
      enabled: true,
      provider: 'plausible' as const,
      snippet: 'v3' as const,
      src: 'https://plausible.hawaii.studio/js/pa-lXh3V4rHPB9Z2yPCDk6eK.js',
      /**
       * SELBSTBEDIENUNG (2026-08-04): erlaubt den Wechsel der Plausible-Site
       * unter /dashboard/community/analytics ohne Deployment. Eine dort hinterlegte
       * Script-Id schlägt das `src` oben; ohne Eintrag bleibt alles wie hier.
       */
      instance: 'https://plausible.hawaii.studio',
    },
  },
  ui: {},
})
