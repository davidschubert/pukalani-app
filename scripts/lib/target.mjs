/**
 * Ziel-Prüfung für Skripte mit Schreibzugriff (OPS-002, GA1 P21).
 *
 * WARUM ES DAS GIBT: jedes Skript mit einem Schlüssel schrieb dorthin, wohin
 * die Umgebung gerade zeigte. Am 2026-08-31 legte ein Lauf mit der falschen
 * Env-Datei 18 fremde Tabellen im Projekt `branding` an — die Sicherung war
 * das Tippen des richtigen Dateinamens. Sicherungen gehören in die
 * Schnittstelle, nicht in die Disziplin.
 *
 * DIE EINE REGEL, für alle Skripte gleich:
 *   • Lokaler Endpunkt (localhost, 127.0.0.1, ::1, *.localhost) ⇒ durch.
 *   • Jeder andere Endpunkt ⇒ nur mit ausdrücklicher Bestätigung:
 *       – der Migrations-Runner verlangt `--prod` UND vergleicht die
 *         Projekt-Id mit `appwriteProjects` aus dem `site.manifest.ts` der
 *         App; danach reicht er die geprüfte Projekt-Id als
 *         `PUKALANI_TARGET_CONFIRM` an jede Migration weiter;
 *       – jedes andere Skript verlangt `PUKALANI_TARGET_CONFIRM=<Projekt-Id>`.
 *         Wer es setzt, NENNT das Projekt, das er meint — zeigt die Env-Datei
 *         auf ein anderes, bricht das Skript ab und nennt beide.
 *   • Ist eine Liste erlaubter Projekte bekannt, gilt sie IMMER, auch lokal.
 *
 * Eine Migration, die jemand direkt startet (`node --env-file=… 026-x.ts`),
 * läuft lokal weiter; gegen Production scheitert sie ohne Bestätigung. Der
 * vorgesehene Weg ist der Runner:
 *   node scripts/migrate.mjs --app <app> --env-file <datei> --prod [--only <layer>-<NNN>]
 *
 * Wächter: `packages/core/tests/scriptTargetGuard.test.ts` — jedes Skript, das
 * einen Schlüssel in die Hand nimmt, ruft diese Prüfung oder steht mit Grund
 * auf der Ausnahmeliste.
 *
 * Keine Abhängigkeiten, kein Schlüssel: geprüft werden nur Endpunkt und
 * Projekt-Id, beides öffentliche Angaben.
 */

/** Name der Variable, mit der ein Mensch (oder der Runner) das Ziel bestätigt. */
export const CONFIRM_ENV = 'PUKALANI_TARGET_CONFIRM'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** Zeigt der Endpunkt auf diesen Rechner? Unlesbares gilt als NICHT lokal. */
export function isLocalEndpoint(endpoint) {
  let url
  try {
    url = new URL(String(endpoint ?? ''))
  }
  catch {
    return false
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost')
}

/**
 * Pure Entscheidung — keine Ausgabe, kein Abbruch (dafür `assertTarget`).
 *
 * @param {object} input
 * @param {string | undefined} input.endpoint          Appwrite-Endpunkt
 * @param {string | undefined} input.projectId         Projekt-Id aus der Umgebung
 * @param {string[] | undefined} [input.allowedProjects] erlaubte Projekt-Ids (z. B. aus dem Site-Manifest)
 * @param {true | string | undefined} [input.confirmed]  `true` = ausdrücklich bestätigt (Runner mit `--prod`);
 *                                                       Zeichenkette = die Projekt-Id, die der Aufrufer MEINT
 * @returns {{ ok: true, local: boolean } | { ok: false, reason: 'incomplete' | 'project_not_allowed' | 'confirm_mismatch' | 'remote_unconfirmed', message: string }}
 */
export function checkTarget({ endpoint, projectId, allowedProjects, confirmed }) {
  if (!endpoint || !projectId) {
    return {
      ok: false,
      reason: 'incomplete',
      message: 'Endpunkt oder Projekt-Id fehlt in der Umgebung (NUXT_PUBLIC_APPWRITE_ENDPOINT, NUXT_PUBLIC_APPWRITE_PROJECT_ID) — ohne beides lässt sich das Ziel nicht prüfen.',
    }
  }
  if (Array.isArray(allowedProjects) && !allowedProjects.includes(projectId)) {
    const erlaubt = allowedProjects.length > 0 ? allowedProjects.map(id => `„${id}"`).join(', ') : 'keines (die App hat keine eigene Appwrite-Instanz)'
    return {
      ok: false,
      reason: 'project_not_allowed',
      message: `Falsches Ziel: die Umgebung zeigt auf das Projekt „${projectId}" (${endpoint}), erlaubt ist hier ${erlaubt}.`,
    }
  }
  const local = isLocalEndpoint(endpoint)
  if (typeof confirmed === 'string' && confirmed !== projectId) {
    return {
      ok: false,
      reason: 'confirm_mismatch',
      message: `Falsches Ziel: bestätigt wurde das Projekt „${confirmed}" (${CONFIRM_ENV}), die Umgebung zeigt aber auf „${projectId}" (${endpoint}).`,
    }
  }
  if (local) return { ok: true, local: true }
  if (confirmed === true || confirmed === projectId) return { ok: true, local: false }
  return {
    ok: false,
    reason: 'remote_unconfirmed',
    message: `Der Endpunkt ist nicht lokal: ${endpoint} (Projekt „${projectId}"). Schreiben dorthin braucht eine ausdrückliche Bestätigung: ${CONFIRM_ENV}=${projectId} voranstellen — bei Migrationen stattdessen den Runner mit --prod nehmen (node scripts/migrate.mjs --app <app> --env-file <datei> --prod).`,
  }
}

/**
 * Prüft das Ziel und BEENDET den Prozess (Exit 1), wenn es nicht stimmt.
 * Ohne Angaben liest sie Endpunkt, Projekt und Bestätigung aus der Umgebung —
 * so reicht in den meisten Skripten eine Zeile vor dem ersten Client.
 *
 * @param {object} [options]
 * @param {string} [options.script]             Name für die Meldung
 * @param {string} [options.endpoint]           Standard: NUXT_PUBLIC_APPWRITE_ENDPOINT
 * @param {string} [options.projectId]          Standard: NUXT_PUBLIC_APPWRITE_PROJECT_ID
 * @param {string[]} [options.allowedProjects]  erlaubte Projekt-Ids
 * @param {true | string} [options.confirmed]   Standard: Wert von PUKALANI_TARGET_CONFIRM
 * @param {boolean} [options.quiet]             keine Erfolgszeile bei entferntem Ziel
 * @returns {{ endpoint: string, projectId: string, local: boolean }}
 */
export function assertTarget(options = {}) {
  const endpoint = options.endpoint ?? process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const projectId = options.projectId ?? process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const confirmed = options.confirmed ?? (process.env[CONFIRM_ENV] || undefined)
  const result = checkTarget({ endpoint, projectId, allowedProjects: options.allowedProjects, confirmed })
  if (!result.ok) {
    console.error(`✗ ${options.script ? `${options.script}: ` : ''}${result.message}`)
    process.exit(1)
  }
  if (!result.local && !options.quiet) {
    console.error(`Ziel bestätigt: ${endpoint} · Projekt „${projectId}"`)
  }
  return { endpoint, projectId, local: result.local }
}

/**
 * Dasselbe für Stripe: dort gibt es kein Projekt, sondern Test- und
 * Live-Modus, und der Modus steckt nur im Präfix des Schlüssels. Ein
 * Live-Schlüssel verlangt die ausdrückliche Angabe (`--live`), eine Angabe
 * `--live` mit Test-Schlüssel ist genauso ein Abbruch — beides heißt, dass
 * Aufruf und Schlüssel nicht zusammenpassen.
 *
 * @param {object} input
 * @param {string | undefined} input.key    Stripe-Schlüssel (wird nie ausgegeben)
 * @param {boolean} input.live              hat der Aufrufer den Live-Modus ausdrücklich verlangt?
 * @returns {{ ok: true, mode: 'live' | 'test' } | { ok: false, message: string }}
 */
export function checkStripeTarget({ key, live }) {
  if (!key) return { ok: false, message: 'Stripe-Schlüssel fehlt.' }
  const isLive = /^(sk|rk)_live_/.test(key)
  if (isLive && !live) {
    return { ok: false, message: 'Der Stripe-Schlüssel ist ein LIVE-Schlüssel. Schreiben in den Live-Modus braucht die ausdrückliche Angabe --live.' }
  }
  if (!isLive && live) {
    return { ok: false, message: '--live angegeben, aber der Stripe-Schlüssel ist ein Test-Schlüssel — Aufruf und Schlüssel passen nicht zusammen.' }
  }
  return { ok: true, mode: isLive ? 'live' : 'test' }
}
