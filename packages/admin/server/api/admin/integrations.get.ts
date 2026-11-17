import { parseMailerSettings, toMailerView } from '../../../../core/shared/mailerSettings'
import type { IntegrationsResponse, IntegrationState } from '../../../shared/types/integrations'
import { BOOTSTRAP_SECRETS, integrationSource } from '../../../shared/types/integrations'

/**
 * WELCHE DIENSTE DIESE INSTANZ BENUTZT — und woher ihr Zugang kommt
 * (Davids Entscheidung 2026-08-18: „Integrationen").
 *
 * DER WERT VERLÄSST DEN SERVER NIE. Gemeldet wird ausschliesslich die
 * HERKUNFT ('settings' | 'env' | 'none') — er ginge sonst in den
 * __NUXT__-Payload dieser Seite, und damit wäre die Verschlüsselung in der
 * Datenbank eine Verkleidung.
 *
 * ── WAS ANGEBOTEN WIRD, ENTSCHEIDET DIE INSTANZ ───────────────────────────
 * Eine Zeile erscheint nur, wenn der Dienst hier überhaupt läuft: die KI
 * hinter `pukalani.ai.enabled`, die Statistik hinter der Analytics-Config,
 * die Konsolen-KI nur dort, wo der tickets-Layer montiert ist. Eine Zeile für
 * einen Dienst, den diese Instanz nicht kennt, wäre ein Feld ins Leere — und
 * genau die Sorte Angebot, die man später für kaputt hält.
 *
 * ── DIE UNBEWEGLICHEN STEHEN TROTZDEM DA ──────────────────────────────────
 * `NUXT_APPWRITE_KEY`, der Umschlag, der Control-Plane-Schlüssel, Redis: sie
 * KÖNNEN nicht hierher (man braucht sie, um an diese Zeile zu kommen). Sie
 * werden trotzdem gelistet — mit dem Hinweis, dass sie in die Server-Env
 * gehören. Eine Seite, die „alle Zugänge" verspricht und die Hälfte
 * verschweigt, schickt beim nächsten Suchen in die Irre.
 */
export default defineEventHandler(async (event): Promise<IntegrationsResponse> => {
  requirePermission(event, 'system.manage')

  const runtime = useRuntimeConfig(event)
  const appConfig = useAppConfig() as {
    pukalani?: { ai?: { enabled?: boolean }, analytics?: { enabled?: boolean } }
  }

  const items: IntegrationState[] = []

  // ── KI (OpenRouter o. ä.) ────────────────────────────────────────────────
  if (appConfig.pukalani?.ai?.enabled) {
    items.push({
      id: 'ai',
      envName: 'NUXT_AI_KEY',
      source: integrationSource(await readInstanceSecret(event, 'ai'), runtime.aiKey),
    })
  }

  // ── Statistik (Plausible) ────────────────────────────────────────────────
  if (appConfig.pukalani?.analytics?.enabled) {
    items.push({
      id: 'analytics',
      envName: 'NUXT_ANALYTICS_STATS_API_KEY',
      source: integrationSource(await readInstanceSecret(event, 'analytics'), runtime.analyticsStatsApiKey),
    })
  }

  // ── KI der Konsole (eigenes Kontingent für die Ticket-Triage) ───────────
  // `ticketsAiKey` existiert im runtimeConfig nur dort, wo der tickets-Layer
  // montiert ist — die Anwesenheit des Schlüssels IST also die Prüfung, ob
  // diese Instanz den Dienst überhaupt kennt.
  if ('ticketsAiKey' in runtime) {
    items.push({
      id: 'tickets-ai',
      envName: 'NUXT_TICKETS_AI_KEY',
      source: integrationSource(
        await readInstanceSecret(event, 'tickets-ai'),
        runtime.ticketsAiKey as string,
      ),
    })
  }

  /**
   * ── DIE GETEILTEN NAHT-GEHEIMNISSE (A0, 2026-08-18) ─────────────────────
   *
   * Anwesenheit im `runtimeConfig` IST die Prüfung, ob diese Instanz an der
   * Naht überhaupt hängt — dasselbe Muster wie `ticketsAiKey` darüber. Und sie
   * entscheidet zugleich, WELCHER Env-Name auf der Karte steht: dieselbe Naht
   * heißt auf der Runtime-Seite `NUXT_ONBOARDING_SERVICE_SECRET` und im Control
   * Plane `NUXT_CONTROL_ONBOARDING_SECRET`. Der WERT ist derselbe, der Name
   * nicht — ein falscher Name auf der Karte schickt beim nächsten Suchen in die
   * Irre.
   *
   * Die Ablage-Sorte ist auf BEIDEN Seiten `onboarding-service`: jede Instanz
   * hat ihre eigene Zeile in ihrem eigenen Projekt, und dass beide denselben
   * Inhalt tragen sollen, ist die Aussage der Naht — nicht die einer Tabelle.
   */
  /**
   * GELESEN ÜBER EINEN CAST, und das ist kein Schludern: `in` VERENGT den Typ,
   * und weil jede App nur EINEN der beiden Schlüssel deklariert, wird der
   * andere Zweig zu `never` — der Compiler weiß hier mehr über die konkrete
   * App, als diese generische Datei wissen darf (sie läuft in beiden).
   */
  const seamRuntime = runtime as unknown as {
    controlOnboardingSecret?: string
    onboardingServiceSecret?: string
  }
  const seamEnvName = 'controlOnboardingSecret' in runtime
    ? 'NUXT_CONTROL_ONBOARDING_SECRET'
    : ('onboardingServiceSecret' in runtime ? 'NUXT_ONBOARDING_SERVICE_SECRET' : '')
  if (seamEnvName) {
    const envSecret = seamEnvName === 'NUXT_CONTROL_ONBOARDING_SECRET'
      ? seamRuntime.controlOnboardingSecret
      : seamRuntime.onboardingServiceSecret
    items.push({
      id: 'onboarding-service',
      envName: seamEnvName,
      source: integrationSource(await readInstanceSecret(event, 'onboarding-service'), envSecret),
      // DIESELBE SORTE, ZWEI ROLLEN — je nachdem, WO diese Karte gerendert
      // wird (2026-08-19 gemessen, nicht angenommen):
      //
      // Auf der BETREIBER-Instanz (`NUXT_CONTROL_ONBOARDING_SECRET`) ist die
      // Zeile beides: Annahme-Wert für platform und portfolio UND Sende-Wert
      // an portfolio (Domain-Settle). Ein Eintrag stellt hier zwangsläufig
      // auch das Senden um, und portfolio hat keine Ablage, kann also nicht
      // zwei Werte annehmen — dort entsteht das Fenster.
      //
      // Auf jeder anderen Instanz (`NUXT_ONBOARDING_SERVICE_SECRET`) wird mit
      // dieser Zeile NUR gesendet: der Empfänger `requireControlCaller` lebt
      // im `domains`-Layer, den apps/platform nicht zieht. Für sie gilt die
      // einfache, fensterlose Reihenfolge.
      shared: seamEnvName === 'NUXT_CONTROL_ONBOARDING_SECRET' ? 'two-way' : 'one-way',
    })
  }

  // ── SMTP: EIN Block, und das Passwort bleibt hier ───────────────────────
  const storedSmtp = parseMailerSettings(await readInstanceSecret(event, 'smtp'))
  const smtpView = toMailerView(storedSmtp ?? {
    host: runtime.smtpHost ?? '',
    port: String(runtime.smtpPort ?? ''),
    user: runtime.smtpUser ?? '',
    pass: runtime.smtpPass ?? '',
    from: runtime.smtpFrom ?? '',
  })

  return {
    items,
    smtp: {
      ...smtpView,
      source: storedSmtp ? 'settings' : (runtime.smtpHost ? 'env' : 'none'),
    },
    // Ohne Umschlag bleibt jedes Feld zu — die Seite sagt dann warum.
    editable: instanceSecretsConfigured(event),
    /** Nur die NAMEN, nie ein Wert: was hier steht, gehört in die Server-Env. */
    bootstrap: [...BOOTSTRAP_SECRETS],
  }
})
