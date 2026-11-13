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
    // HERKUNFTSPRÜFUNG (SEC-004): eine neue App startet MIT ihr. Alle Hosts
    // unter `*.pukalani.app` sind same-site zueinander, `SameSite=Lax` schützt
    // dort nicht. Ausnahmen nur als einzelne Route mit Grund in
    // core/shared/csrfOriginExempt.ts, nie durch Abschalten.
    security: { csrfOriginCheck: true },
  },
  ui: {},
})
