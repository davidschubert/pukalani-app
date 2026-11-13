export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // pukalani: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  // HERKUNFTSPRÜFUNG (SEC-004): gilt im Core für jede App, auch diese —
  // kein Schalter. Ausnahmen nur als einzelne Route mit Grund in
  // core/shared/csrfOriginExempt.ts.
  pukalani: {},
  ui: {},
})
