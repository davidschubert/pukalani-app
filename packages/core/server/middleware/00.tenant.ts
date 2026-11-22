/**
 * Horizont-3 Naht 1 — Mandanten-Auflösung pro Request (Blueprint 00.tenant.ts).
 *
 * RUHEND per Config-Gate: pukalani.tenancy.enabled ist Core-Default AUS — dann ist
 * diese Middleware ein sofortiger No-Op (heutiger Single-Tenant-Betrieb).
 * Aktiv (Platform-App) gilt die Spike-Semantik (s5-pool-silo):
 *  - KEIN Resolver    → 503 `tenant_resolver_missing` für jeden Host und Pfad
 *    (SEC-025, s. unten) — bis 2026-11-13 stand hier „dokumentiertes
 *    fail-open": die App lief dann ohne Trennung weiter
 *  - bekannter Host  → event.context.tenant = TenantContext (pool | silo)
 *  - unbekannter Host → 404 (KEINE Default-Site — nichts leakt an Fremd-Hosts);
 *    AUSNAHME ist Nuxts interner Fehlerseiten-Renderpass, s. unten (C12b)
 *  - Resolver-Fehler  → 500 (fail-loud; NIE still aufs Default-Projekt fallen,
 *    sonst landet Mandanten-Traffic unbemerkt im falschen Datenraum)
 * Muss alphabetisch VOR auth.ts laufen (00.-Prefix): die Client-Factories
 * (Naht 2) lesen den Tenant bereits beim Session-Lookup.
 */
import type { H3Event } from 'h3'
// shared/*.ts wird im server-Verzeichnis NICHT auto-importiert (nur
// shared/utils + shared/types) — deshalb explizit.
import { isControlHost } from '../../shared/controlCenter'
import {
  TENANT_RESOLVER_MISSING_CODE,
  TENANT_RESOLVER_MISSING_STATUS_TEXT,
  UNKNOWN_HOST_CODE,
  UNKNOWN_HOST_STATUS_TEXT,
  isErrorPageRenderPass,
} from '../../shared/unknownHost'
import { canonicalRedirectStatus, canonicalRedirectTarget } from '../../shared/canonicalHost'
import { accountAreaUrl, isAccountAreaPagePath, isManagementPagePath, staysOnPukalaniAddress } from '../../shared/customDomainScope'
import { isCustomDomainHost } from '../../shared/siteCard'
import { siteCardSettings } from '../utils/siteCard'

/** Die Fehlerzeile „Trennung ohne Resolver" steht EINMAL je Prozess im Log. */
let resolverMissingReported = false

export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as {
    pukalani?: { tenancy?: { enabled?: boolean, controlHosts?: string[] } }
  }
  if (appConfig.pukalani?.tenancy?.enabled !== true) return

  // Host-unabhängige Infra-Pfade — tenant-agnostisch, nichts leakt. Sie stehen
  // VOR der Resolver-Prüfung, weil sie auch im Fehlerfall antworten MÜSSEN:
  // - /api/health: Deploy-Verify + Monitoring pollen den kanonischen Site-Host,
  //   der selbst KEIN Tenant ist (buildSha/Uptime). Ohne Resolver meldet sie
  //   `ok:false` mit Grund — der Fehler wird so SICHTBAR, statt als Ausfall
  //   ohne Erklärung zu erscheinen.
  // - /_i18n/: nuxt-i18n lädt Locale-Messages im Prod-Build per INTERNEM
  //   self-fetch OHNE Host-Header — ein 404 hier ließe jede Seite mit rohen
  //   i18n-Keys rendern (Prod-Befund 2026-07-23). Inhalte sind build-statisch.
  // - /api/_nuxt_icon/: dieselbe Sorte Aufruf (WA1 e, gemessen 2026-11-17).
  //   Ein Symbol, dessen Name erst beim Rendern feststeht (aus der app.config
  //   oder berechnet), holt @nuxt/icon beim Server-Rendern über einen INTERNEN
  //   self-fetch — und der trägt die Kopfzeilen der Anfrage NICHT (das Modul
  //   nimmt `useRequestFetch().native`, das es an Nitros `event.$fetch` nicht
  //   gibt, und fällt auf den nackten lokalen Abruf zurück). Ohne Host endete
  //   er hier im 404 für unbekannte Hosts: je Symbol und Seitenaufruf eine
  //   Zeile „[Icon] failed to load" im Fehler-Log (29.512 in neun Tagen, nur
  //   auf der App mit Trennung), und das Symbol kam erst im Browser nach. Die
  //   Route liefert SVG-Pfade aus dem Iconify-Paket, fasst keine Datenbank an
  //   und kennt keinen Mandanten (dieselbe Begründung wie für den
  //   Kontroll-Host, `controlApiPrefixes`).
  const path = event.path.split('?')[0] ?? ''
  if (path === '/api/health' || path.startsWith('/_i18n/') || path.startsWith('/api/_nuxt_icon/')) {
    markHostUnproven(event)
    return
  }

  const resolver = getTenantResolver()
  /**
   * SEC-025 (2026-11-13, Davids Entscheidung): „Eine Sicherung, die nicht
   * prüfen kann, lehnt ab." Gate an, aber KEIN Resolver registriert (die
   * Platform-App ohne vollständige `NUXT_PLATFORM_CONTROL_*`) ⇒ 503 für JEDEN
   * Host und JEDEN Pfad.
   *
   * Bis dahin kehrte die Middleware hier stumm zurück („dokumentiertes
   * fail-open"): kein Mandant, kein 404 für fremde Hosts, kein Kontroll-Host
   * — und weil die Datentür ohne Mandant nichts scopt, lief die App OHNE
   * Trennung der Communities weiter, während `/api/health` grün meldete.
   *
   * Es gibt bewusst KEINEN Schalter, der das wieder abstellt. Der
   * Kontroll-Host kommt ebenfalls nicht durch: er wird erst NACH dieser
   * Prüfung erkannt, und ohne Resolver kann auch niemand belegen, dass ein
   * Host KEIN Mandant ist.
   *
   * Durch kommt nur Nuxts interner Fehlerseiten-Durchgang (C12b, dieselbe
   * Begründung wie unten beim unbekannten Host): sonst gäbe Nuxt seinen
   * Renderer auf, und statt der gebrandeten CoreErrorPage stünde sein
   * Notfall-Template vor dem Besucher.
   */
  if (!resolver) {
    if (isErrorPageRenderPass(path)) {
      markHostUnproven(event)
      return
    }
    if (!resolverMissingReported) {
      resolverMissingReported = true
      // Die NAMEN der fehlenden Variablen nennt das Plugin der App beim Start
      // (apps/platform/server/plugins/tenant-resolver.ts); der Core kennt sie
      // nicht (A14) und sagt deshalb nur, was jetzt passiert.
      logEvent('error', 'tenancy.resolver_missing', {
        message: 'pukalani.tenancy.enabled ist an, aber kein Tenant-Resolver registriert — alle Anfragen außer /api/health werden mit 503 abgelehnt',
      })
    }
    throw createError({
      status: 503,
      statusText: TENANT_RESOLVER_MISSING_STATUS_TEXT,
      data: { code: TENANT_RESOLVER_MISSING_CODE },
    })
  }

  const host = normalizeHost(getHeader(event, 'host'))

  // KONTROLL-Hosts (Kundenbereich/Onboarding, z. B. app.pukalani.app): bewusst
  // KEIN Mandant — hier wird eine Community erst erzeugt. Ohne diese Ausnahme
  // liefe der Host in den 404 für unbekannte Hosts. Weil ohne Mandanten aber
  // NICHTS gescopt ist, engt 01.control-center.ts die erlaubten Pfade
  // fail-closed ein (die Ausnahme ist also kein Loch, sondern ein anderer,
  // engerer Modus).
  if (isControlHost(host, controlHosts(event))) {
    event.context.controlCenter = true
    return
  }

  const tenant = await resolver(host)
  if (!tenant) {
    // C12b: Nuxt rendert seine Fehlerseite über einen INTERNEN Request auf
    // /__nuxt_error — der läuft durch DIESE Middleware erneut, mit demselben
    // unbekannten Host. Würde hier wieder geworfen, gäbe Nuxt den Renderer auf
    // und fiele auf sein eingebautes Template zurück („500 - Unknown host"
    // über einer 404-Antwort). Also: den Render-Durchgang durchlassen, damit
    // die gebrandete CoreErrorPage entsteht. Ohne Mandant heißt hier ohne
    // Community-Branding — genau richtig, die Adresse gehört ja zu keiner.
    // Kein Loch: /__nuxt_error beantwortet Nuxts Renderer nur intern
    // (shared/unknownHost.ts), und es rendert ausschließlich die Fehlerseite.
    if (isErrorPageRenderPass(path)) {
      markHostUnproven(event)
      return
    }

    throw createError({
      status: 404,
      statusText: UNKNOWN_HOST_STATUS_TEXT,
      data: { code: UNKNOWN_HOST_CODE },
    })
  }
  event.context.tenant = tenant

  /**
   * EIGENE DOMAIN — die Umleitung auf die kanonische Adresse (control-035,
   * Davids Entscheidung 2 vom 2026-08-07: **301**, und die Subdomain bleibt
   * Rückfall).
   *
   * Eine Community löst seit control-035 unter mehreren Hosts auf: ihrer
   * Pukalani-Subdomain, ihrer eigenen Domain und deren www-/Apex-Geschwister.
   * Genau EINER ist kanonisch (der Resolver rechnet ihn, `canonicalHostFor()`),
   * alle anderen zeigen dorthin. Ohne diese Zeilen liefe dieselbe Community
   * unter drei Adressen gleichzeitig — mit drei Session-Cookies, drei
   * Suchmaschinen-Indizes und drei `canonical`-Werten.
   *
   * SIE STEHT NACH `event.context.tenant = tenant`, und das ist Absicht: eine
   * `abuse`-Sperre (M13) hat den Resolver schon vorher `null` liefern lassen,
   * eine gesperrte Community leitet also nirgendwohin um, sondern 404et — auf
   * ALLEN ihren Hosts.
   *
   * ── DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF ────────────────────────
   *
   * (1) **308 statt 301, sobald der Request nicht GET/HEAD ist.** Ein 301 lässt
   *     Browser die Methode auf GET wechseln — ein Formular-POST auf die alte
   *     Adresse verlöre dabei stillschweigend seinen Rumpf, und der Nutzer
   *     sähe eine Seite statt einer Fehlermeldung. 308 ist derselbe
   *     „dauerhaft", nur methodenerhaltend. Davids Entscheidung („301") meint
   *     die DAUERHAFTIGKEIT, und die bleibt.
   *
   * (2) **`Cache-Control: no-store` daneben.** Ein 301 darf ein Browser für
   *     immer behalten. Genau das würde Davids zweite Zusage brechen — „die
   *     Subdomain bleibt Rückfall": nimmt der Kunde seine Domain wieder weg,
   *     stünde jeder Besucher mit gemerkter Umleitung vor einer toten Adresse.
   *     Der Header nimmt das Risiko nicht ganz weg (manche Browser merken sich
   *     301 trotzdem), aber er ist das, was von hier aus geht — der Rest steht
   *     als Prüf-Häkchen im Runbook.
   *
   * (3) **Der Pfad reist mit** (`event.path`, also inkl. Query). Eine
   *     Umleitung, die auf `/` wirft, macht aus jedem geteilten Deep-Link eine
   *     Startseite.
   */
  /**
   * VERWALTEN NUR UNTER DER PUKALANI-ADRESSE (PK1 E1b-2, nur Modus `write`).
   * Auf einer eigenen Domain führt eine Verwaltungs-Seite (`/dashboard/**`)
   * per 302 auf dieselbe Adresse unter der Pukalani-Adresse — ohne Siegel und
   * ohne Sitzung: dort meldet man sich an oder kommt aus dem Kundenbereich.
   * Umgekehrt bleiben auf der Pukalani-Adresse die Verwaltungs-Seiten, die
   * Anmelde-Seiten davor und alle Anfragen dieser Seiten stehen, statt auf die
   * eigene Domain umgeleitet zu werden (Regeln: shared/customDomainScope.ts).
   */
  const scoped = siteCardSettings().mode === 'write'
  if (scoped && tenant.pukalaniHost && isCustomDomainHost(host, tenant) && isManagementPagePath(event.path)) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return await sendRedirect(event, `https://${tenant.pukalaniHost.trim().toLowerCase()}${event.path}`, canonicalRedirectStatus(event.method, 'temporary'))
  }
  // Konto-Seiten (Profil, Einstellungen, Meine Communities) gehören in den
  // Kundenbereich — dorthin, ebenfalls ohne Siegel. Ohne Kontroll-Host bleibt
  // es beim 404 der Seite.
  if (scoped && isCustomDomainHost(host, tenant) && isAccountAreaPagePath(event.path)) {
    // Lokal (`*.localhost`) trägt der Link den Port dieser Anfrage.
    const accountArea = accountAreaUrl(controlHosts(event), (getHeader(event, 'host') ?? '').split(':')[1] ?? '')
    if (accountArea) {
      setResponseHeader(event, 'Cache-Control', 'no-store')
      return await sendRedirect(event, `${accountArea}${event.path}`, canonicalRedirectStatus(event.method, 'temporary'))
    }
  }

  const target = canonicalRedirectTarget(host, tenant.canonicalHost, event.path)
  if (target && scoped && !isCustomDomainHost(host, tenant) && staysOnPukalaniAddress(event.path)) return
  if (target) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    // (4) Eine ABGESCHALTETE eigene Domain (control-040) leitet nur
    //     VORÜBERGEHEND um (302/307) — sie kann wieder eingeschaltet werden.
    return await sendRedirect(event, target, canonicalRedirectStatus(event.method, tenant.canonicalRedirect === 'temporary' ? 'temporary' : 'permanent'))
  }
})

/**
 * PK1 E1b-2 (Gegenlesen E1a, Fund 3): diese Anfrage kommt ohne Mandanten-
 * Auflösung durch (Betriebsprüfung, i18n, Symbole, Fehlerseiten-Durchgang) —
 * ob ihr Host uns gehört, ist hier nicht belegt. Im Modus `write` gilt auf ihr
 * darum kein Klartext-Cookie als Sitzung (`core/server/utils/requestSession.ts`);
 * keiner dieser Pfade braucht eine Anmeldung.
 */
function markHostUnproven(event: H3Event): void {
  event.context.hostUnproven = true
}
