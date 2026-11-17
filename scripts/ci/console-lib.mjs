/**
 * Console-Schritte für eine FRISCHE Appwrite-Instanz der CI — die EINE Stelle,
 * an der sie stehen. Zwei Aufrufer:
 *   - `appwrite-setup.mjs` (ein Projekt für die Einzel-Instanz der E2E-Suite),
 *   - `buehne-setup.mjs`   (zwei Projekte für die Bühne: Control Plane + Pool).
 *
 * Erledigt per REST, was sonst Klicks in der Console wären: Account (erster
 * Nutzer, Whitelist ROOT), Organisation, Projekt mit fester Id, API-Schlüssel,
 * Web-Platform. Gedacht für Wegwerf-Instanzen; die Ziel-Prüfung macht der
 * Aufrufer (`assertTarget`), bevor er hier etwas ruft.
 */

/** Zugang des CI-Console-Kontos. Die Instanz lebt genau einen Lauf. */
export const CI_CONSOLE_EMAIL = 'ci@example.com'
export const CI_CONSOLE_PASSWORD = 'ci-console-password-2026'

/**
 * Alle Scopes, die ein CI-Schlüssel bekommt. Appwrite kennt keinen
 * „alle Scopes"-Schalter; die Liste ist die dokumentierte der 1.9er-Linie.
 */
export const CI_KEY_SCOPES = [
  'sessions.write', 'users.read', 'users.write', 'teams.read', 'teams.write',
  'databases.read', 'databases.write', 'collections.read', 'collections.write',
  'attributes.read', 'attributes.write', 'indexes.read', 'indexes.write',
  'documents.read', 'documents.write', 'tables.read', 'tables.write',
  'columns.read', 'columns.write', 'rows.read', 'rows.write',
  'files.read', 'files.write', 'buckets.read', 'buckets.write',
  'functions.read', 'functions.write', 'execution.read', 'execution.write',
  'targets.read', 'targets.write', 'providers.read', 'providers.write',
  'messages.read', 'messages.write', 'topics.read', 'topics.write',
  'subscribers.read', 'subscribers.write', 'locale.read', 'avatars.read',
  'health.read', 'migrations.read', 'migrations.write', 'tokens.read',
  'tokens.write', 'sites.read', 'sites.write', 'log.read', 'log.write',
  // Presences (seit 1.9.5): der Presence-Beweis schreibt Anwesenheiten mit
  // dem Admin-Client — genau so, wie es die Laufzeit tut (der Browser hat
  // dafür keine Session, siehe CLAUDE.md). Ohne diese beiden Scopes bricht
  // `verify-presence-boundary` in CI mit „missing scopes" ab, obwohl der
  // Code stimmt. Nachgetragen 2026-08-02, als der Beweis in die CI zog.
  'presences.read', 'presences.write',
  // Anmelde-Regeln des Projekts (P29): `scripts/ops/appwrite-auth-policies.mjs`
  // setzt sie nach dem Setup, damit die CI dieselben Regeln fährt wie
  // Production (Passwort-Wörterbuch, persönliche Daten, …).
  'policies.read', 'policies.write',
]

function fail(step, status, json) {
  console.error(`✗ ${step} fehlgeschlagen (${status}): ${json?.message ?? ''}`)
  process.exit(1)
}

/**
 * Meldet das CI-Konto an der Console an (legt es beim ersten Mal an) und
 * sorgt für die Organisation. Liefert die Schritte je Projekt.
 *
 * @param {string} endpoint  z. B. `http://localhost:8080/v1` (ohne Schrägstrich am Ende)
 */
export async function openConsole(endpoint) {
  let cookie = ''

  async function api(path, method = 'GET', body) {
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': 'console',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json, headers: res.headers }
  }

  // 1) Console-Account (erster User — _APP_CONSOLE_WHITELIST_ROOT=enabled)
  {
    const { status, json } = await api('/account', 'POST', {
      userId: 'ci-admin', email: CI_CONSOLE_EMAIL, password: CI_CONSOLE_PASSWORD, name: 'CI Admin',
    })
    if (status === 201) console.log('✔ Console-Account angelegt')
    else if (status === 409) console.log('↷ Console-Account existiert')
    else fail('Console-Account', status, json)
  }

  // 2) Console-Session (Cookie einsammeln)
  {
    const { status, json, headers } = await api('/account/sessions/email', 'POST', {
      email: CI_CONSOLE_EMAIL, password: CI_CONSOLE_PASSWORD,
    })
    if (status !== 201) fail('Console-Login', status, json)
    const setCookies = headers.getSetCookie?.() ?? []
    cookie = setCookies.map(c => c.split(';')[0]).join('; ')
    if (!cookie) fail('Console-Login (kein Session-Cookie)', status, json)
    console.log('✔ Console-Session')
  }

  // 3) Organisation (Team im Console-Projekt)
  {
    const { status, json } = await api('/teams', 'POST', { teamId: 'ci-org', name: 'CI' })
    if (status === 201) console.log('✔ Organisation angelegt')
    else if (status === 409) console.log('↷ Organisation existiert')
    else fail('Organisation', status, json)
  }

  return {
    /**
     * Projekt mit fester Id, ein Schlüssel mit allen Scopes, Web-Platform
     * `localhost`. Liefert das Geheimnis des Schlüssels — der Aufrufer
     * schreibt es in eine `.env`, nie in die Ausgabe.
     *
     * @param {string} projectId
     * @returns {Promise<string>}
     */
    async provisionProject(projectId) {
      // 4) Projekt mit fester ID
      {
        const { status, json } = await api('/projects', 'POST', {
          projectId, name: projectId, teamId: 'ci-org', region: 'default',
        })
        if (status === 201) console.log(`✔ Projekt '${projectId}' angelegt`)
        else if (status === 409) console.log(`↷ Projekt '${projectId}' existiert`)
        else fail('Projekt', status, json)
      }

      // 5) API-Key mit allen Scopes
      let apiKey
      {
        const { status, json } = await api(`/projects/${projectId}/keys`, 'POST', {
          // Die Schlüssel-Id gilt für die ganze Instanz, nicht je Projekt — mit
          // einer festen Id scheiterte das zweite Projekt mit 409.
          keyId: `ci-key-${projectId}`, name: 'ci-key', scopes: CI_KEY_SCOPES,
        })
        if (status !== 201) fail('API-Key', status, json)
        apiKey = json.secret
        console.log(`✔ API-Key für '${projectId}' angelegt (${CI_KEY_SCOPES.length} Scopes)`)
      }

      // 6) Web-Platform (localhost) — Realtime/Web-SDK-Origin
      {
        const { status, json } = await api(`/projects/${projectId}/platforms`, 'POST', {
          platformId: `ci-web-${projectId}`, type: 'web', name: 'ci-web', hostname: 'localhost',
        })
        if (status === 201) console.log('✔ Web-Platform localhost')
        else if (status === 409) console.log('↷ Web-Platform existiert')
        else fail('Web-Platform', status, json)
      }

      return apiKey
    },
  }
}
