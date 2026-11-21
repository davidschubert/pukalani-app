export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Hilfe-Site ist
  // öffentlich, kontenlos und datensparsam — keine Analytics, kein Consent.
  pukalani: {
    /**
     * SEITEN 60 s FERTIG HALTEN (Q22, Davids Entscheidung R3 vom 2026-11-21,
     * DECISION-LOG): die Hilfe hat keine Konten. Regeln und Grenzen: `packages/core/shared/pageCache.ts`.
     */
    pageCache: {
      enabled: true,
    },
    // Der Brand-Name ist die EINE Quelle für Seitentitel („… · Pukalani Hilfe",
    // useBrandTitle) UND die Fehlerseite/404 (CoreErrorPage über useBrandName).
    // Deshalb steht hier „Pukalani Hilfe" und nicht bloß „Pukalani": sonst
    // hießen die Seiten anders als die Site, die der Leser gerade offen hat.
    brand: { name: 'Pukalani Hilfe' },
    /**
     * KEINE REALTIME (F14, 2026-08-01) — gleiche Lage wie bei `marketing`:
     * gelesene Hilfe-Artikel, kein Konto, keine Laufzeit-Flags. Ohne diese
     * Zeile abonnierte auch diese Seite über den core-Layer `app_config`,
     * lud das Web-SDK nach und öffnete einen Gast-WebSocket.
     * Begründung + Regel: core/shared/realtimeGate.ts.
     */
    realtime: { enabled: false },
    // STRUKTURIERTE 5xx-ZEILEN (OPS-011, 2026-11-16) — ein täglicher Wächter
    // zählt sie in den pm2-Logs. BEWUSST OHNE Browser-Fehler-Annahme
    // (`clientErrors`): öffentliche Inhaltsseiten ohne Anmeldung, dort käme
    // vor allem Rauschen von Bots und Browser-Erweiterungen.
    observability: { enabled: true },
  },
  ui: {
    button: {
      compoundVariants: [
        {
          // DER GEFÜLLTE CTA trägt dunkle Tinte statt Weiß — derselbe Vertrag
          // wie auf pukalani.app (apps/marketing/app/app.config.ts, dort die
          // volle Begründung): Weiß auf der Sonne misst 1,81:1 und verfehlt
          // AA. Der Wert --puka-cta-label kommt aus puka-theme.css (marketing-
          // Layer) und gilt unter `body.marketing-site`, das diese App in
          // app.vue setzt. Hier betrifft das die Landing-Knöpfe („Zur
          // Anleitung") und alle `links` aus dem Seiten-Frontmatter.
          color: 'primary',
          variant: 'solid',
          class: 'text-(--puka-cta-label)',
        },
      ],
    },
  },
})
