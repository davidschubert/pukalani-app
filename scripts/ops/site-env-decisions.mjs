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
 *  3. NOCH NICHT BEWERTET ⇒ `ENV_UNDECIDED` unten. Das war der Bestand vom
 *     2026-11-16 (36 Namen); seit dem 2026-11-17 ist er abgearbeitet und die
 *     Liste leer. Neue Namen kommen hier nicht hinein — sie bekommen gleich
 *     Antwort 1 oder 2 (der Test hält die Liste bei null fest).
 */

/** Liest der Code, muss aber auf keiner Site gesetzt sein. */
export const ENV_NOT_REQUIRED = {
  NUXT_COMMENTS_EMBED_LOCAL_ORIGINS: 'Erlaubt lokale Einbetter (localhost) für das Kommentar-Widget; nur für die Entwicklung, auf KEINEM Server setzen (BE-023).',
  NUXT_INSIGHTS_NEWSLETTER_SECRET_PREVIOUS: 'Nur während eines Wechsels des Abmelde-Geheimnisses gesetzt; leer heißt „kein Wechsel" (Runbook NEWSLETTER-ABMELDE-LINKS.md).',
  NUXT_BRAND_CARD_CACHE_DIR: 'Ordner für den Zwischenspeicher der Marken-Karten; ohne Angabe ein Ordner im Temp-Verzeichnis des Systems.',
  NUXT_DISCOVER_OG_CACHE_DIR: 'Ordner für den Zwischenspeicher der Galerie-Vorschaubilder; ohne Angabe ein Ordner im Temp-Verzeichnis des Systems.',

  // ── Bewertet am 2026-11-17 (WL1 a): der frühere Bestand „noch nicht bewertet" ──

  // Wird beim Bauen gesetzt — ein Wert auf dem Server würde den gebauten Stand überschreiben.
  NUXT_PUBLIC_BUILD_SHA: 'Entsteht beim Bauen aus dem Commit; auf KEINEM Server setzen — ein Wert dort überschriebe den echten Stand, und die Probe nach dem Ausliefern wartete vergeblich.',
  NUXT_ADMIN_SYSTEM_MANIFEST: 'Entsteht beim Bauen (Liste der Abhängigkeiten für die System-Seite); auf KEINEM Server setzen — ein Wert dort überschriebe das gebaute Manifest.',

  // Nur für Entwicklung und Beweise.
  NUXT_CUSTOM_DOMAIN_DRY_RUN: 'Trockenlauf für eigene Domains (kein Ruf an ploi, keine HTTPS-Probe); nur für Entwicklung und Beweise, auf KEINEM Server setzen.',
  NUXT_INSIGHTS_YOUTUBE_BASE_URL: 'Adresse der YouTube-Schnittstelle; der Standard ist die echte, ein anderer Wert dient nur lokalen Beweisen mit einem Ersatz-Server.',
  NUXT_ANALYTICS_PROXY_ORIGIN: 'Überschreibt die Herkunft der Reichweitenmessung aus der app.config; nur für Beweise und als Notlösung, leer ist der Normalfall.',

  // Der Standard im Code ist der Wert für Production.
  NUXT_CUSTOM_DOMAIN_SERVER_IPS: 'Adresse des App-Servers für die DNS-Prüfung eigener Domains; der Standard im Code ist der heutige Server, setzen nur bei einem Server-Umzug.',
  NUXT_CUSTOM_DOMAIN_CNAME_TARGET: 'CNAME-Ziel für eigene Domains; der Standard im Code ist der heutige Name, setzen nur bei einem Umzug.',
  NUXT_CUSTOM_DOMAIN_PLATFORM_HEALTH_URL: 'Wo die Konsole den Schalter der Platform liest (PK1 K6); leer heißt „Freigabe-Pflicht bleibt" — gesetzt wird sie auf der Konsole erst im Runbook PK1-EINSCHALTEN, Schritt B 3 (nach E1d), erst danach Pflicht-Eintrag.',
  NUXT_CUSTOM_DOMAIN_DNS_SERVERS: 'Namens-Server für die DNS-Prüfung eigener Domains; ohne Angabe fragt die App zwei öffentliche Resolver.',
  NUXT_ONBOARDING_START_URL: 'Adresse des Kundenbereichs in Einladungs-Mails; der Standard im Code ist die Adresse für Production.',
  NUXT_PLOI_BASE_URL: 'Adresse der ploi-Schnittstelle; der Standard im Code ist die echte. Pflicht sind Token, Server-Id und Site-Id.',
  NUXT_PUBLIC_CONTROL_POOL_PROJECT: 'Projekt, in dem neue Pool-Communities entstehen; ohne Angabe gilt der Wert aus der app.config des Betreiber-Layers (der für Production).',
  NUXT_PUBLIC_MARKETING_START_URL: 'Link „Loslegen" der Landing; der Standard im Code ist die Adresse für Production, ein Wert dient nur lokal oder für eine Probe-Umgebung.',
  NUXT_PUBLIC_MARKETING_SIGN_IN_URL: 'Link „Anmelden" der Landing; der Standard im Code ist die Adresse für Production.',
  NUXT_PUBLIC_MARKETING_DEMO_URL: 'Link zur Demo-Community; der Standard im Code ist die Adresse für Production.',
  NUXT_PUBLIC_MARKETING_REQUEST_URL: 'Ziel des Formulars „Zugang anfragen"; der Standard im Code ist die Adresse für Production.',
  NUXT_PUBLIC_MARKETING_GATE_URL: 'Abfrage „ist die Anmeldung offen?" der Landing; der Standard im Code ist die Adresse für Production, ohne Antwort gilt der vorsichtige Zustand.',
  NUXT_PUBLIC_TENANCY_CONTROL_HOSTS: 'Kontroll-Hosts der Platform-App; der Wert für Production steht in ihrer app.config, ein Wert hier dient nur lokal (er schlüge die app.config).',
  NUXT_PUBLIC_TENANCY_WIZARD_HOSTS: 'Eigene Hosts für den Wizard; auf Production gewollt leer (der Kundenbereich trägt ihn), setzen nur lokal.',
  NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS: 'Frühere Namen des Kundenbereichs (antworten 301); die Liste für Production steht in der app.config der Platform-App.',
  NUXT_CONTACT_EMAIL: 'Empfänger des Kontaktformulars von apps/photos; die App wird nicht ausgerollt, und der Code hat einen Standard.',

  // Eintrittskarte je Seite (PK1 E1a): optional, ohne Werte gilt „off" wie vor E1.
  NUXT_PUBLIC_CENTRAL_LOGIN: 'Schalter der zentralen Anmeldung, Prototyp PK1 E2 (off | on); leer heißt off, der Code läuft dann wie vorher. Rückweg ohne Ausliefern: auf off setzen und neu starten (Kopf von core/shared/centralLogin.ts).',
  NUXT_SITE_CARD_MODE: 'Schalter der Eintrittskarte je Seite (off | read | write); leer heißt off, der Code läuft dann wie vor E1. Rückweg ohne Ausliefern: auf off setzen und neu starten (Kopf von core/server/utils/siteCard.ts).',
  NUXT_SITE_CARD_KEY: 'Schlüssel der Eintrittskarte (32 Byte base64); nur nötig, wenn NUXT_SITE_CARD_MODE nicht off ist — ohne ihn gilt off und eine Log-Zeile site_card.config_invalid.',
  NUXT_SITE_CARD_PREVIOUS_KEY: 'Nur während eines Tauschs des Karten-Schlüssels gesetzt (nur zum Lesen); leer heißt „kein Tausch".',

  // Nur während eines Wechsels gesetzt.
  NUXT_BILLING_SETTINGS_KEY_OLD: 'Nur während eines Wechsels des Umschlag-Schlüssels für die Stripe-Einstellungen gesetzt; leer heißt „kein Wechsel" (dauerhaft gesetzt wäre es ein zweiter gültiger Schlüssel).',

  // Zweiter Weg neben der verschlüsselten Ablage — Pflicht ist der Umschlag, nicht dieser Name.
  NUXT_STRIPE_SECRET_KEY: 'Rückfall neben der verschlüsselten Ablage der Stripe-Einstellungen (die Datenbank wird zuerst gelesen); Pflicht ist der Umschlag NUXT_BILLING_SETTINGS_KEY — ein Wächter, der einen von zwei gleichwertigen Wegen anmahnt, erzieht zum Weglesen.',
  NUXT_STRIPE_WEBHOOK_SECRET: 'Rückfall neben der verschlüsselten Ablage der Stripe-Einstellungen, wie NUXT_STRIPE_SECRET_KEY; Pflicht ist der Umschlag NUXT_BILLING_SETTINGS_KEY.',
  NUXT_TICKETS_AI_KEY: 'Rückfall neben der verschlüsselten Ablage des KI-Schlüssels für Tickets; Pflicht ist der Umschlag NUXT_INSTANCE_SECRETS_KEY.',

  // Die Funktion ist heute bewusst aus — mit dem Einschalten wird der Name Pflicht.
  NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS: 'Eigener Mail-Zugang für den Newsletter; der Newsletter ist noch abgeschaltet, und ohne Angabe gilt der normale Mail-Zugang der App. Wird beim Einschalten neu bewertet.',
  NUXT_ENTITLEMENTS_URL: 'Abruf-Adresse der Lizenz-Zustellung (Empfänger-Seite); der Abruf läuft auf keiner Site (ops/timed-jobs.conf), die Produkt-Schalter bleiben neutral. Wer ihn einschaltet, setzt URL und öffentliche Schlüssel zusammen.',
  NUXT_ENTITLEMENTS_PUBLIC_KEYS: 'Öffentliche Schlüssel der Lizenz-Zustellung (Empfänger-Seite); ohne Abruf entsteht kein Dokument, das zu prüfen wäre. Gehört zu NUXT_ENTITLEMENTS_URL.',
  NUXT_ENTITLEMENTS_PRIVATE_KEY: 'Signier-Schlüssel der Lizenz-Zustellung (Aussteller-Seite); die Zustellung hat heute keinen Abrufer, ohne den Schlüssel antwortet die Ausgabe-Route 503. Wird Pflicht auf der Betreiber-Site, sobald eine Site abruft.',
  NUXT_ENTITLEMENTS_KID: 'Kennung des Signier-Schlüssels der Lizenz-Zustellung; gehört zu NUXT_ENTITLEMENTS_PRIVATE_KEY.',
}

/**
 * Pflicht-Namen, die nicht UNSER Code liest, sondern ein Nuxt-Modul — der
 * Leser findet sie deshalb in keiner `nuxt.config.ts`.
 */
export const ENV_READ_BY_MODULES = {
  NUXT_PUBLIC_I18N_BASE_URL: '@nuxtjs/i18n liest sie selbst (runtimeConfig.public.i18n.baseUrl des Moduls); auf branding.supply Pflicht für absolute hreflang- und og:url-Adressen.',
}

/**
 * Der Bestand vom 2026-11-16 (36 Namen) ist seit dem 2026-11-17 bewertet
 * (WL1 a): zehn sind Pflicht geworden, die übrigen stehen mit Grund in
 * `ENV_NOT_REQUIRED`. Die Liste bleibt leer — neue Namen kommen hier nie
 * hinein (der Test hält die Zahl fest).
 */
export const ENV_UNDECIDED = []
