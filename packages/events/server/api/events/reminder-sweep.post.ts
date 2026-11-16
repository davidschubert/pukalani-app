import { seamSecretMatches, seamSecretsFor } from '../../../../core/server/utils/sharedSeamSecret'

/**
 * Interner Sweep-Endpoint (E3) — Andockpunkt für eine scheduled Appwrite
 * Function (Scaffold Track 2B), die den Reminder-Sweep auch OHNE Seiten-
 * besuche auslöst. Key-geschützt über NUXT_EVENTS_SWEEP_KEY (server-only);
 * ohne konfigurierten Key ist der Endpoint deaktiviert (404 — kein
 * Orakel für Unbefugte).
 *
 * DER SCHLÜSSEL SAGT „WER", NICHT „WESSEN" (Audit-Befund vom 2026-08-02).
 * `sweepEventReminders` geht durch die Datentür, und die scopet nur, wenn ein
 * POOL-Mandant im Request steht. Ohne den lief der Sweep in einem
 * Multi-Tenant-Deployment über ALLE Communities auf einmal — und `notify()`
 * stempelt dann `scope: 'tenant'` mit einer leeren tenantId, die Erinnerung
 * landete also in der „unbekannt"-Ablage (C15) statt in der Glocke ihrer
 * Community. Der Aufrufer muss den Mandanten deshalb im HOST mitbringen, wie
 * jeder andere Request auch: ein Aufruf je Community-Host.
 *
 * Im Silo/Single-Tenant (Gate `pukalani.tenancy.enabled` aus) bleibt alles
 * unverändert — dort gibt es keinen Mandanten, den man verfehlen könnte, das
 * Projekt IST die Grenze.
 *
 * Der eigentliche Weg ist seit OPS-003 (2026-11-16) der Zeit-Lauf
 * `event-reminders` (server/plugins/event-reminders.ts), der stündlich ALLE
 * Communities durchgeht; diese Route bleibt nur, bis der alte Zeitplan entfernt ist.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  /**
   * ZWEI GÜLTIGE SCHLÜSSEL (A0, 2026-08-18): angenommen wird jeder Wert aus
   * {Betreiber-Konsole dieser Instanz, `NUXT_EVENTS_SWEEP_KEY`}. Der SENDER ist
   * hier kein Deployment dieses Repos, sondern ein Cron/eine Appwrite-Function
   * — rotiert wird trotzdem in derselben Reihenfolge: erst den neuen Wert HIER
   * in der Konsole hinterlegen (dann gelten alt und neu), dann den Cron
   * umstellen, danach den alten aus der `.env` nehmen. Umgekehrt schickte der
   * Cron einen Wert, den diese Seite noch nicht kennt.
   *
   * Der Vergleich läuft jetzt in KONSTANTER ZEIT (`seamSecretMatches`) — das
   * vorherige `!==` auf Zeichenketten verglich zeichenweise mit Abbruch und war
   * damit ein (kleiner, aber unnötiger) Seitenkanal.
   */
  const accepted = await seamSecretsFor(event, 'events-sweep', config.eventsSweepKey)
  if (accepted.length === 0) {
    // Ohne Schlüssel gibt es den Endpunkt nicht — kein Orakel für Unbefugte.
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!seamSecretMatches(getHeader(event, 'x-sweep-key') || '', accepted)) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  if (appConfig.pukalani?.tenancy?.enabled === true && useTenant(event)?.mode !== 'pool') {
    // 400, nicht 404: der Aufrufer ist legitimiert (er hat den Schlüssel), er
    // ruft nur die falsche Adresse. Verstecken hilft hier niemandem — der
    // Fehler soll im Cron-Log stehen, damit ihn jemand behebt.
    throw createError({
      status: 400,
      statusText: 'Sweep needs a community host — call it once per community',
      data: { code: 'tenant_required' },
    })
  }

  await sweepEventReminders(event)
  return { ok: true }
})
