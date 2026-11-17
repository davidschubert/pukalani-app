/**
 * EINE ENTSCHEIDUNG JE EINSTELLUNG (OPS-012, GA1 P20).
 *
 * Der Code liest rund 70 `NUXT_…`-Einstellungen (gelesen aus dem Code:
 * `scripts/lib/env-inventory.mjs`). Für jede gilt genau eine von drei
 * Antworten — der Test `packages/core/tests/verifySiteEnv.test.ts` wird rot,
 * wenn eine NEUE Einstellung ohne Antwort dazukommt:
 *
 *  1. PFLICHT auf mindestens einer Site ⇒ steht in `required` in
 *     `verify-site-env.mjs` (der Wächter prüft sie täglich auf dem Server).
 *     Reihenfolge: erst ausliefern, dann den Wert setzen, DANN eintragen.
 *  2. KEINE PFLICHT, mit Grund ⇒ `ENV_NOT_REQUIRED` unten.
 *  3. NOCH NICHT BEWERTET ⇒ `ENV_UNDECIDED` unten. Das ist der Bestand vom
 *     2026-11-16: für diese Namen hat noch niemand nachgesehen, ob sie auf
 *     einer Site gesetzt sein müssen. Die Liste darf nur KÜRZER werden — wer
 *     einen Namen bewertet, zieht ihn nach 1 oder 2 um. Neue Namen kommen
 *     hier nicht hinein (der Test hält die Liste fest).
 */

/** Liest der Code, muss aber auf keiner Site gesetzt sein. */
export const ENV_NOT_REQUIRED = {
  NUXT_COMMENTS_EMBED_LOCAL_ORIGINS: 'Erlaubt lokale Einbetter (localhost) für das Kommentar-Widget; nur für die Entwicklung, auf KEINEM Server setzen (BE-023).',
  NUXT_INSIGHTS_NEWSLETTER_SECRET_PREVIOUS: 'Nur während eines Wechsels des Abmelde-Geheimnisses gesetzt; leer heißt „kein Wechsel" (Runbook NEWSLETTER-ABMELDE-LINKS.md).',
  NUXT_BRAND_CARD_CACHE_DIR: 'Ordner für den Zwischenspeicher der Marken-Karten; ohne Angabe ein Ordner im Temp-Verzeichnis des Systems.',
  NUXT_DISCOVER_OG_CACHE_DIR: 'Ordner für den Zwischenspeicher der Galerie-Vorschaubilder; ohne Angabe ein Ordner im Temp-Verzeichnis des Systems.',
}

/**
 * Pflicht-Namen, die nicht UNSER Code liest, sondern ein Nuxt-Modul — der
 * Leser findet sie deshalb in keiner `nuxt.config.ts`.
 */
export const ENV_READ_BY_MODULES = {
  NUXT_PUBLIC_I18N_BASE_URL: '@nuxtjs/i18n liest sie selbst (runtimeConfig.public.i18n.baseUrl des Moduls); auf branding.supply Pflicht für absolute hreflang- und og:url-Adressen.',
}

/** Bestand vom 2026-11-16, noch nicht bewertet. Darf nur kürzer werden. */
export const ENV_UNDECIDED = [
  'NUXT_ADMIN_SYSTEM_MANIFEST',
  'NUXT_ALERT_EMAIL',
  'NUXT_ANALYTICS_PROXY_ORIGIN',
  'NUXT_BILLING_SETTINGS_KEY_OLD',
  'NUXT_CONTACT_EMAIL',
  'NUXT_CUSTOM_DOMAIN_CNAME_TARGET',
  'NUXT_CUSTOM_DOMAIN_DNS_SERVERS',
  'NUXT_CUSTOM_DOMAIN_DRY_RUN',
  'NUXT_CUSTOM_DOMAIN_SERVER_IPS',
  'NUXT_ENTITLEMENTS_KID',
  'NUXT_ENTITLEMENTS_PRIVATE_KEY',
  'NUXT_ENTITLEMENTS_PUBLIC_KEYS',
  'NUXT_ENTITLEMENTS_URL',
  'NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS',
  'NUXT_INSIGHTS_YOUTUBE_BASE_URL',
  'NUXT_ONBOARDING_START_URL',
  'NUXT_PLOI_BASE_URL',
  'NUXT_PLOI_SERVER_ID',
  'NUXT_PLOI_SITE_ID',
  'NUXT_PLOI_TOKEN',
  'NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET',
  'NUXT_PUBLIC_APPWRITE_GDPR_BUCKET',
  'NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS',
  'NUXT_PUBLIC_BUILD_SHA',
  'NUXT_PUBLIC_CONTROL_POOL_PROJECT',
  'NUXT_PUBLIC_MARKETING_DEMO_URL',
  'NUXT_PUBLIC_MARKETING_GATE_URL',
  'NUXT_PUBLIC_MARKETING_REQUEST_URL',
  'NUXT_PUBLIC_MARKETING_SIGN_IN_URL',
  'NUXT_PUBLIC_MARKETING_START_URL',
  'NUXT_PUBLIC_TENANCY_CONTROL_HOSTS',
  'NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS',
  'NUXT_PUBLIC_TENANCY_WIZARD_HOSTS',
  'NUXT_STRIPE_SECRET_KEY',
  'NUXT_STRIPE_WEBHOOK_SECRET',
  'NUXT_TICKETS_AI_KEY',
]
