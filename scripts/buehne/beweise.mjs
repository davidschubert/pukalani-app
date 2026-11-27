/**
 * Die Einteilung aller Beweis-Skripte: wann läuft welches? (OPS-009, GA1 P27, Etappe 3)
 *
 * EINE Zeile je Skript (`verify-*.mjs`, `acceptance-*.mjs` unter
 * `packages/*\/scripts` und `apps/*\/scripts`). Der Läufer
 * (`pnpm buehne run`, scripts/buehne/run.mjs) liest diese Liste, die erzeugte
 * Übersicht in `docs/referenz/LIVE-BEWEISE.md` zeigt sie, und zwei Wächter
 * halten sie vollständig (`pnpm check:live-beweise` und
 * `packages/core/tests/proofScriptManifest.test.ts`): ein neues Skript ohne
 * Zeile ist rot.
 *
 * `lauf` sagt, WANN ein Skript läuft:
 *   - `e2e`    — läuft schon in `.github/workflows/e2e.yml` (eigener Schritt).
 *   - `buehne` — bei jedem Pull Request und auf main, auf der Bühne.
 *   - `nacht`  — nur im nächtlichen Lauf (ab rund 60 s oder mit Wartezeiten).
 *   - `hand`   — läuft nicht automatisch; `grund` sagt in einem ganzen Satz, warum.
 *
 * `env` sagt, welche Env-Datei das Skript bekommt: `platform`
 * (apps/platform/.env — dazu ersetzt der Läufer den Control-Schlüssel der
 * Platform-App durch einen des Control Plane mit Schreibrecht), `control`
 * (apps/control/.env), `einzel` (apps/comments/.env — die Einzel-Instanz)
 * oder `keine`. `dauer` ist die zuletzt gemessene Laufzeit in Sekunden
 * (daraus folgt die Zeitgrenze), `braucht` die Dienste, die laufen müssen,
 * `vars` feste Zusatz-Variablen.
 *
 * DIE EINZEL-INSTANZ (`braucht: ['einzel']`): `apps/comments` als dritter
 * Server mit eigenem Projekt, ohne Mandanten. In der CI steht sie nur im
 * nächtlichen Lauf (`buehne.yml`), lokal nur mit `--einzel-port`. Fehlt sie,
 * meldet der Läufer das Skript als „übersprungen" — nicht als rot. Das Skript
 * bekommt `EINZEL_URL` und `EINZEL_PORT`.
 *
 * BRANDING.SUPPLY (`braucht: ['branding']`, seit 2026-11-18): `apps/branding`
 * als vierter Server mit eigenem Projekt `branding`. Wie die Einzel-Instanz
 * nur im nächtlichen Lauf und lokal nur mit `--branding-port`; fehlt sie, ist
 * das Skript „übersprungen". Das Skript bekommt die Env-Datei der App und
 * `BRANDING_PORT` / `BRANDING_HOST` / `BRANDING_URL`. Der Server läuft dort
 * mit GESTELLTEN ANTWORTEN — kein Skript mit `env: 'branding'` ruft eine
 * echte KI, Stripe oder eine fremde Website (je Skript vor dem Einzug
 * geprüft; die Schalter stehen in `.github/workflows/buehne.yml`).
 *
 * Wer ein Skript von `hand` nach `buehne`/`nacht` zieht, hat es vorher auf der
 * Bühne grün gesehen (`pnpm buehne run --only <name>`) und trägt die Dauer ein.
 */

/**
 * @typedef {'appwrite' | 'platform' | 'control' | 'mailpit' | 'einzel' | 'branding' | 'browser'} Dienst
 * @typedef {{
 *   skript: string,
 *   lauf: 'e2e' | 'buehne' | 'nacht' | 'hand',
 *   env?: 'platform' | 'control' | 'einzel' | 'branding' | 'keine',
 *   grund?: string,
 *   dauer?: number,
 *   braucht?: Dienst[],
 *   vars?: Record<string, string>,
 * }} Beweis
 */

const E2E = 'läuft als eigener Schritt in .github/workflows/e2e.yml'

// branding.supply steht seit dem 2026-11-18 nachts als vierter Server; seit dem
// 2026-11-19 laufen dort elf der zwölf Skripte mit (die Design-Vorlage der drei
// Design-Skripte steht jetzt an einer Stelle: packages/brand/scripts/lib/designProbe.mjs).
// Seit dem 2026-11-27 (BT1 a) laufen auch `verify-geo-cities` (kleiner Orts-Auszug
// scripts/buehne/fixtures/geo-cities.tsv, von buehne-setup.mjs eingetragen),
// `verify-notification-mail-links` (der Server stößt denselben Sammel-Lauf ohnehin
// zwei Minuten nach dem Start selbst an) und nachts `verify-composer-editor` mit.

/** @type {Beweis[]} */
export const BEWEISE = [
  // ── activity ──
  { skript: 'packages/activity/scripts/verify-pool-isolation.mjs', lauf: 'buehne', env: 'platform', dauer: 1, braucht: ['appwrite'] },

  // ── brand (branding.supply — vierter Server, nur nachts, gestellte Antworten) ──
  { skript: 'packages/brand/scripts/verify-brand-check-robots.mjs', lauf: 'nacht', env: 'branding', dauer: 25, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-brand-context.mjs', lauf: 'hand', grund: 'Braucht einen echten KI-Aufruf bei einem fremden Anbieter, der Geld kostet.' },
  { skript: 'packages/brand/scripts/verify-brand-design.mjs', lauf: 'nacht', env: 'branding', dauer: 74, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-brand-events-sweep.mjs', lauf: 'nacht', env: 'branding', dauer: 1, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-brand-intro-call.mjs', lauf: 'nacht', env: 'branding', dauer: 3, braucht: ['appwrite', 'branding', 'mailpit'] },
  { skript: 'packages/brand/scripts/verify-brand-kit.mjs', lauf: 'nacht', env: 'branding', dauer: 8, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-brand-sessions.mjs', lauf: 'nacht', env: 'branding', dauer: 90, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-brand-share.mjs', lauf: 'nacht', env: 'branding', dauer: 3, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/brand/scripts/verify-workshop-hydration.mjs', lauf: 'nacht', env: 'branding', dauer: 40, braucht: ['appwrite', 'branding', 'browser'] },
  { skript: 'packages/brand/scripts/verify-brand-tokens.mjs', lauf: 'hand', grund: 'Lädt beim Lauf ein Werkzeug aus dem Netz, und das soll kein automatischer Lauf tun.' },

  // ── comments ──
  { skript: 'packages/comments/scripts/verify-comment-reactions.mjs', lauf: 'nacht', env: 'einzel', dauer: 4, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/comments/scripts/verify-embed-boundary.mjs', lauf: 'buehne', env: 'control', dauer: 7, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/comments/scripts/verify-pool-isolation.mjs', lauf: 'e2e', grund: E2E },

  // ── control ──
  { skript: 'packages/control/scripts/verify-account-bell.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/control/scripts/verify-audience-flip.mjs', lauf: 'e2e', grund: E2E },
  { skript: 'packages/control/scripts/verify-invite-requests.mjs', lauf: 'buehne', env: 'control', dauer: 3, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/control/scripts/verify-invite-stock.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control', 'mailpit'] },
  { skript: 'packages/control/scripts/verify-onboarding.mjs', lauf: 'buehne', env: 'control', dauer: 1, braucht: ['appwrite', 'control'] },
  { skript: 'packages/control/scripts/verify-silo-domain.mjs', lauf: 'hand', grund: 'Braucht drei eigens eingestellte Server: die Betreiber-App im Trockenlauf mit eigenem Namens-Server, die Einzel-Instanz mit Naht zum Control Plane und portfolio gegen eine tote Naht — der nächtliche Lauf startet keinen davon so.' },

  // ── core ──
  { skript: 'packages/core/scripts/verify-business-confirmation.mjs', lauf: 'hand', grund: 'Braucht ZWEI Apps nebeneinander (branding.supply und die Studio-Site, jede mit eigenem Projekt), und die Bühne hat keinen Server der Studio-Site. Das Skript selbst ist seit dem 2026-11-19 nachgezogen (27 von 27 lokal) — es kann einziehen, sobald die Studio-Site auf der Bühne steht.' },
  { skript: 'packages/core/scripts/verify-geo-cities.mjs', lauf: 'buehne', env: 'platform', dauer: 5, braucht: ['appwrite', 'platform'] },
  { skript: 'packages/core/scripts/verify-handle-search-boundary.mjs', lauf: 'buehne', env: 'control', dauer: 4, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/core/scripts/verify-mfa.mjs', lauf: 'nacht', env: 'einzel', dauer: 120, braucht: ['appwrite', 'einzel', 'mailpit'] },
  { skript: 'packages/core/scripts/verify-notification-mail-links.mjs', lauf: 'buehne', env: 'platform', dauer: 5, braucht: ['appwrite', 'platform', 'mailpit'] },
  { skript: 'packages/core/scripts/verify-otp-availability.mjs', lauf: 'buehne', env: 'control', dauer: 1, braucht: ['appwrite', 'platform'] },
  { skript: 'packages/core/scripts/verify-presence-away-priority.mjs', lauf: 'buehne', env: 'platform', dauer: 2, braucht: ['appwrite', 'platform'] },
  { skript: 'packages/core/scripts/verify-presence-boundary.mjs', lauf: 'e2e', env: 'platform', dauer: 3, braucht: ['appwrite', 'platform'], grund: E2E },
  { skript: 'packages/core/scripts/verify-rate-limits.mjs', lauf: 'buehne', env: 'keine', dauer: 1, braucht: ['platform'] },
  { skript: 'packages/core/scripts/verify-server-only-writes.mjs', lauf: 'buehne', env: 'platform', dauer: 1, braucht: ['appwrite'] },
  // PK1 E1c: nur nachts im Modus write (zwei Resolver-Wartezeiten); ohne write ⇒ „übersprungen".
  { skript: 'packages/core/scripts/verify-site-card.mjs', lauf: 'nacht', env: 'control', dauer: 75, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/core/scripts/verify-session-ip.mjs', lauf: 'hand', grund: 'Braucht die Standort-Datenbank (DB-IP im Binärformat, nicht im Repo; einen kleinen Auszug kann man ohne neues Paket nicht schreiben) und eine geänderte Proxy-Einstellung der Datenbank, die die Bühne nicht setzt.' },
  { skript: 'packages/core/scripts/verify-timezone.mjs', lauf: 'nacht', env: 'einzel', dauer: 5, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/core/scripts/verify-ugc-translation.mjs', lauf: 'hand', grund: 'Braucht einen echten KI-Aufruf bei einem fremden Anbieter, der Geld kostet.' },

  // ── courses ──
  { skript: 'packages/courses/scripts/verify-manage-entrypoints.mjs', lauf: 'nacht', env: 'einzel', dauer: 4, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/courses/scripts/verify-pool-isolation.mjs', lauf: 'nacht', env: 'platform', dauer: 116, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/courses/scripts/verify-silo-unchanged.mjs', lauf: 'nacht', env: 'einzel', dauer: 3, braucht: ['appwrite', 'einzel'] },

  // ── domains ──
  { skript: 'packages/domains/scripts/verify-domain-settle.mjs', lauf: 'hand', grund: 'Braucht eine zweite Einzel-Instanz mit absichtlich beschnittenem Schlüssel und eigener Naht; die Einzel-Instanz des nächtlichen Laufs hat den vollen Schlüssel.' },

  // ── events ── (verify-site-authz wartet einmal den Resolver-Cache aus, wenn es die Pläne hebt)
  { skript: 'packages/events/scripts/verify-manage-entrypoints.mjs', lauf: 'nacht', env: 'einzel', dauer: 4, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/events/scripts/verify-paid-ticket.mjs', lauf: 'e2e', grund: E2E },
  { skript: 'packages/events/scripts/verify-pool-isolation.mjs', lauf: 'nacht', env: 'platform', dauer: 62, braucht: ['appwrite', 'platform'] },
  { skript: 'packages/events/scripts/verify-site-authz.mjs', lauf: 'buehne', env: 'platform', dauer: 32, braucht: ['appwrite', 'platform'] },

  // ── market (branding.supply — gestellte Antworten, Probe-Websites liefert das Skript selbst aus) ──
  { skript: 'packages/market/scripts/verify-market-fetch.mjs', lauf: 'nacht', env: 'branding', dauer: 4, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/market/scripts/verify-market-report.mjs', lauf: 'nacht', env: 'branding', dauer: 9, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/market/scripts/verify-market-retention.mjs', lauf: 'nacht', env: 'branding', dauer: 3, braucht: ['appwrite', 'branding'] },
  { skript: 'packages/market/scripts/verify-market-ui.mjs', lauf: 'nacht', env: 'branding', dauer: 8, braucht: ['appwrite', 'branding'] },

  // ── media ──
  { skript: 'packages/media/scripts/verify-index-nudge.mjs', lauf: 'e2e', grund: E2E },
  { skript: 'packages/media/scripts/verify-pool-isolation.mjs', lauf: 'buehne', env: 'platform', dauer: 1, braucht: ['appwrite'] },

  // ── messages ── (ohne MESSAGES_PORT nur Teil A, der ohne Server auskommt)
  { skript: 'packages/messages/scripts/verify-messages.mjs', lauf: 'buehne', env: 'platform', dauer: 1, braucht: ['appwrite'] },

  // ── moderation ──
  { skript: 'packages/moderation/scripts/verify-report-boundary.mjs', lauf: 'buehne', env: 'platform', dauer: 3, braucht: ['appwrite', 'platform'] },

  // ── onboarding ──
  { skript: 'packages/onboarding/scripts/acceptance-onboarding.mjs', lauf: 'nacht', env: 'control', dauer: 129, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-account-events.mjs', lauf: 'nacht', env: 'platform', dauer: 30, braucht: ['appwrite', 'platform'] },
  { skript: 'packages/onboarding/scripts/verify-community-export.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-community-favicon.mjs', lauf: 'buehne', env: 'control', dauer: 3, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-community-suspension.mjs', lauf: 'nacht', env: 'control', dauer: 175, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-control-exit.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-control-host.mjs', lauf: 'buehne', env: 'keine', dauer: 1, braucht: ['platform'] },
  { skript: 'packages/onboarding/scripts/verify-custom-domain.mjs', lauf: 'hand', env: 'control', grund: 'Braucht eine Betreiber-App im Trockenlauf mit eigenem Namens-Server (NUXT_CUSTOM_DOMAIN_DRY_RUN, NUXT_CUSTOM_DOMAIN_DNS_SERVERS), die die Bühne nicht startet, misst in Abschnitt 5 gegen echte öffentliche DNS-Einträge (Weiterleitung an 1.1.1.1, ein Fremddienst) und kennt die Freigabe durch den Betreiber (BE-014) noch nicht.' },
  { skript: 'packages/onboarding/scripts/verify-dashboard-access.mjs', lauf: 'buehne', env: 'control', dauer: 5, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-member-invites.mjs', lauf: 'nacht', env: 'control', dauer: 68, braucht: ['appwrite', 'platform', 'control', 'mailpit'] },
  { skript: 'packages/onboarding/scripts/verify-members-map.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-my-overview.mjs', lauf: 'buehne', env: 'control', dauer: 4, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-past-due-notice.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control', 'mailpit'] },
  { skript: 'packages/onboarding/scripts/verify-removed-notifications.mjs', lauf: 'buehne', env: 'control', dauer: 15, braucht: ['appwrite', 'platform', 'control', 'mailpit'] },
  { skript: 'packages/onboarding/scripts/verify-profile-signal.mjs', lauf: 'buehne', env: 'control', dauer: 34, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-site-authz.mjs', lauf: 'nacht', env: 'control', dauer: 82, braucht: ['appwrite', 'platform', 'control', 'mailpit'] },
  { skript: 'packages/onboarding/scripts/verify-site-branding.mjs', lauf: 'nacht', env: 'control', dauer: 67, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/onboarding/scripts/verify-trial-notice.mjs', lauf: 'nacht', env: 'control', dauer: 94, braucht: ['appwrite', 'platform', 'control'] },

  // ── pages ──
  { skript: 'packages/pages/scripts/verify-community-navigation.mjs', lauf: 'nacht', env: 'control', dauer: 65, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/pages/scripts/verify-community-redirects.mjs', lauf: 'buehne', env: 'control', dauer: 4, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/pages/scripts/verify-community-seo.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'packages/pages/scripts/verify-page-languages.mjs', lauf: 'buehne', env: 'control', dauer: 3, braucht: ['appwrite', 'platform', 'control'] },

  // ── posts ──
  { skript: 'packages/posts/scripts/verify-composer-editor.mjs', lauf: 'nacht', env: 'einzel', dauer: 112, braucht: ['appwrite', 'einzel', 'browser'] },
  { skript: 'packages/posts/scripts/verify-handles-mentions.mjs', lauf: 'nacht', env: 'einzel', dauer: 55, braucht: ['appwrite', 'einzel', 'browser'] },
  { skript: 'packages/posts/scripts/verify-like-limit.mjs', lauf: 'nacht', env: 'einzel', dauer: 40, braucht: ['appwrite', 'einzel'], vars: { LIKE_LIMIT: '50' } },
  { skript: 'packages/posts/scripts/verify-mention-menu.mjs', lauf: 'nacht', env: 'einzel', dauer: 40, braucht: ['appwrite', 'einzel', 'browser'] },
  { skript: 'packages/posts/scripts/verify-new-topic-entry.mjs', lauf: 'nacht', env: 'einzel', dauer: 5, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/posts/scripts/verify-pool-isolation.mjs', lauf: 'e2e', grund: E2E },
  { skript: 'packages/posts/scripts/verify-reactions.mjs', lauf: 'nacht', env: 'einzel', dauer: 3, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/posts/scripts/verify-topic-links.mjs', lauf: 'nacht', env: 'einzel', dauer: 5, braucht: ['appwrite', 'einzel'] },
  { skript: 'packages/posts/scripts/verify-trust-levels.mjs', lauf: 'buehne', env: 'platform', dauer: 1, braucht: ['appwrite'] },
  { skript: 'packages/posts/scripts/verify-trust-perks.mjs', lauf: 'nacht', env: 'control', dauer: 117, braucht: ['appwrite', 'platform', 'control'] },

  // ── runner ──
  { skript: 'packages/runner/scripts/verify-runner-boundary.mjs', lauf: 'buehne', env: 'control', dauer: 1, braucht: ['appwrite', 'control'] },

  // ── apps ──
  { skript: 'apps/control/scripts/verify-docs-access.mjs', lauf: 'buehne', env: 'control', dauer: 1, braucht: ['appwrite', 'control'] },
  { skript: 'apps/control/scripts/verify-run-prompt.mjs', lauf: 'buehne', env: 'control', dauer: 2, braucht: ['appwrite', 'control'] },
  { skript: 'apps/platform/scripts/verify-community-search-pages.mjs', lauf: 'buehne', env: 'platform', dauer: 35, braucht: ['appwrite', 'platform', 'control'] },
  { skript: 'apps/platform/scripts/verify-og-image.mjs', lauf: 'buehne', env: 'keine', dauer: 1, braucht: ['platform'] },
]

/** Die vier Klassen in fester Reihenfolge, mit ihrem Namen in der Übersicht. */
export const LAEUFE = /** @type {const} */ ({
  e2e: 'E2E-Lauf',
  buehne: 'Bühne (jeder Lauf)',
  nacht: 'Bühne (nachts)',
  hand: 'von Hand',
})

export const DIENSTE = ['appwrite', 'platform', 'control', 'mailpit', 'einzel', 'branding', 'browser']
export const ENVS = ['platform', 'control', 'einzel', 'branding', 'keine']
/** Die Dienste, die nicht in jedem Lauf stehen — ohne sie wird übersprungen. */
export const OPTIONALE_DIENSTE = ['einzel', 'branding']
/** Mindestlänge eines Grundes — ein ganzer Satz, kein Stichwort. */
export const GRUND_MIN = 30

/**
 * Was an der Einteilung nicht stimmt — leer = in Ordnung. Rein: bekommt die
 * Liste der Skripte im Repo, die Einträge und die (kommentarfreie) e2e.yml
 * samt Erkennungs-Funktion, liest selbst nichts.
 *
 * @param {{ scripts: string[], beweise: Beweis[], runsInE2e: (path: string) => boolean }} input
 * @returns {string[]}
 */
export function manifestProblems({ scripts, beweise, runsInE2e }) {
  const problems = []
  const inRepo = new Set(scripts)
  const seen = new Map()
  for (const entry of beweise) {
    seen.set(entry.skript, (seen.get(entry.skript) ?? 0) + 1)
  }
  for (const path of scripts) {
    if (!seen.has(path)) problems.push(`${path}: fehlt in scripts/buehne/beweise.mjs — eine Zeile mit \`lauf\` eintragen.`)
  }
  for (const [path, n] of seen) {
    if (n > 1) problems.push(`${path}: steht ${n}-mal in scripts/buehne/beweise.mjs.`)
    if (!inRepo.has(path)) problems.push(`${path}: in scripts/buehne/beweise.mjs, aber die Datei gibt es nicht (umbenannt oder gelöscht?).`)
  }
  for (const entry of beweise) {
    const { skript, lauf } = entry
    if (!(lauf in LAEUFE)) {
      problems.push(`${skript}: unbekannter lauf „${lauf}" (erlaubt: ${Object.keys(LAEUFE).join(', ')}).`)
      continue
    }
    if (lauf === 'hand' && (typeof entry.grund !== 'string' || entry.grund.trim().length < GRUND_MIN)) {
      problems.push(`${skript}: lauf „hand" braucht einen Grund (ganzer Satz, mindestens ${GRUND_MIN} Zeichen).`)
    }
    if ((lauf === 'buehne' || lauf === 'nacht') && !ENVS.includes(entry.env ?? '')) {
      problems.push(`${skript}: lauf „${lauf}" braucht \`env\` (${ENVS.join(' | ')}).`)
    }
    if (entry.env !== undefined && !ENVS.includes(entry.env)) problems.push(`${skript}: unbekanntes env „${entry.env}".`)
    for (const dienst of entry.braucht ?? []) {
      if (!DIENSTE.includes(dienst)) problems.push(`${skript}: unbekannter Dienst „${dienst}" in braucht.`)
    }
    // Die Env-Datei der Einzel-Instanz ohne die Instanz (oder umgekehrt) wäre
    // ein Skript, das gegen den falschen Server läuft — oder nie übersprungen wird.
    if (entry.env === 'einzel' && !(entry.braucht ?? []).includes('einzel')) {
      problems.push(`${skript}: env „einzel" braucht \`braucht: [..., 'einzel']\` — sonst läuft es auch, wenn die Einzel-Instanz fehlt.`)
    }
    if (entry.lauf === 'buehne' && (entry.braucht ?? []).includes('einzel')) {
      problems.push(`${skript}: die Einzel-Instanz steht nur im nächtlichen Lauf — lauf „nacht" eintragen.`)
    }
    // Dasselbe für branding.supply.
    if (entry.env === 'branding' && !(entry.braucht ?? []).includes('branding')) {
      problems.push(`${skript}: env „branding" braucht \`braucht: [..., 'branding']\` — sonst läuft es auch, wenn branding.supply fehlt.`)
    }
    if (entry.lauf === 'buehne' && (entry.braucht ?? []).includes('branding')) {
      problems.push(`${skript}: branding.supply steht nur im nächtlichen Lauf — lauf „nacht" eintragen.`)
    }
    if (entry.dauer !== undefined && !(Number.isFinite(entry.dauer) && entry.dauer >= 0)) {
      problems.push(`${skript}: dauer muss eine Zahl in Sekunden sein.`)
    }
    if (inRepo.has(skript)) {
      const inE2e = runsInE2e(skript)
      if (lauf === 'e2e' && !inE2e) problems.push(`${skript}: lauf „e2e", steht aber nicht in .github/workflows/e2e.yml.`)
      if (lauf !== 'e2e' && inE2e) problems.push(`${skript}: steht in .github/workflows/e2e.yml, hat aber lauf „${lauf}" — dort „e2e" eintragen.`)
    }
  }
  return problems
}

/**
 * Ob ein Skript in e2e.yml läuft. Dort steht der Pfad ganz
 * (`packages/media/scripts/…`) oder als `cd packages/<layer>` mit
 * `scripts/<datei>` im selben Schritt. Kommentarzeilen zählen nicht.
 *
 * @param {string} e2eYaml Inhalt von .github/workflows/e2e.yml
 * @returns {(path: string) => boolean}
 */
export function e2eDetector(e2eYaml) {
  const e2e = e2eYaml.split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
  return (path) => {
    if (e2e.includes(path)) return true
    const [group, name, , file] = path.split('/')
    let at = e2e.indexOf(`scripts/${file}`)
    while (at !== -1) {
      const before = e2e.slice(Math.max(0, at - 400), at)
      const cd = [...before.matchAll(/\bcd\s+((?:packages|apps)\/[a-z0-9_-]+)/g)].at(-1)?.[1]
      if (cd === `${group}/${name}`) return true
      at = e2e.indexOf(`scripts/${file}`, at + 1)
    }
    return false
  }
}
