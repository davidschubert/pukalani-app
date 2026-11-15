/**
 * Die Wache von `scripts/bootstrap.mjs` (BE-026): ist die Instanz FRISCH?
 *
 * Bootstrap legt Buckets und die Web-Plattform `localhost` an und fährt alle
 * Migrationen. Das ist für eine leere Instanz gedacht — auf einer befüllten ist
 * `pnpm migrate --app <name>` der Weg. Die Antwort kommt aus EINER lesenden
 * Anfrage, die VOR jedem Schreibzugriff läuft:
 *
 *   GET {endpoint}/tablesdb/{databaseId}/tables
 *
 * Gemessen gegen Appwrite 2.7.1: 200 `{ total, tables }` (befüllt z. B.
 * total 69), 404 `type: "database_not_found"`, solange es die Datenbank nicht
 * gibt, 401 ohne/mit falschem Schlüssel oder ohne Recht
 * (`general_unauthorized_scope`).
 *
 * Die Regel ist bewusst eng: nur ein POSITIVER Befund „leer" erlaubt den Lauf.
 * Eine Antwort, die nichts belegt (401, 403, 5xx, unlesbarer Rumpf, 200 ohne
 * Zahl, Netzfehler), ist kein Freibrief — die alte Wache wertete jeden Fehler
 * als „frisch" und hätte so auch bei fehlendem Leserecht weitergemacht.
 *
 * Rein (kein I/O), damit sie ohne Instanz getestet werden kann
 * (`packages/core/tests/bootstrapFreshness.test.ts`).
 */

/**
 * @typedef {'fresh' | 'populated' | 'unknown' | 'forced'} FreshnessVerdict
 */

/**
 * @typedef {object} FreshnessInput
 * @property {number | null | undefined} status  HTTP-Status der Antwort (fehlt bei Netzfehler)
 * @property {unknown} body                      gelesener JSON-Rumpf (`null`, wenn nicht lesbar)
 * @property {string | null | undefined} [networkError]  Meldung, wenn die Anfrage gar nicht ankam
 * @property {boolean} force                     `--force`: Wache überspringen
 * @property {string} [app]                      App-Ordner für die Hinweise (Standard `<name>`)
 */

/**
 * @typedef {object} FreshnessDecision
 * @property {boolean} proceed
 * @property {FreshnessVerdict} verdict
 * @property {string} message
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {FreshnessInput} input
 * @returns {FreshnessDecision}
 */
export function decideFreshness({ status, body, networkError, force, app }) {
  const name = app || '<name>'

  if (force) {
    return {
      proceed: true,
      verdict: 'forced',
      message: `⚠ --force: Frische-Prüfung ÜBERSPRUNGEN. Bootstrap legt Buckets und die Web-Plattform localhost an und fährt alle Migrationen — auch auf einer befüllten Instanz.`,
    }
  }

  const cannotCheck = (/** @type {string} */ detail) => ({
    proceed: false,
    verdict: /** @type {const} */ ('unknown'),
    message: `✗ Frische-Prüfung nicht möglich (${detail}). Ein Fehler ist kein Freibrief — Abbruch, nichts geschrieben.\n`
      + `  Prüfen: Adresse (NUXT_PUBLIC_APPWRITE_ENDPOINT), Projekt (NUXT_PUBLIC_APPWRITE_PROJECT_ID) und ob der Schlüssel Tabellen lesen darf (tables.read).`,
  })

  if (networkError) return cannotCheck(`keine Antwort: ${networkError}`)
  if (typeof status !== 'number') return cannotCheck('kein Status')

  if (status === 404) {
    if (isRecord(body) && body.type === 'database_not_found') {
      return { proceed: true, verdict: 'fresh', message: '✔ Instanz ist frisch (Datenbank existiert noch nicht).' }
    }
    return cannotCheck(`Status 404${isRecord(body) && typeof body.type === 'string' ? `, ${body.type}` : ''}`)
  }

  if (status === 200) {
    const total = isRecord(body) ? body.total : undefined
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
      return cannotCheck('Status 200 ohne lesbare Tabellen-Zahl')
    }
    if (total === 0) {
      return { proceed: true, verdict: 'fresh', message: '✔ Instanz ist frisch (Datenbank ohne Tabellen).' }
    }
    return {
      proceed: false,
      verdict: 'populated',
      message: `✗ Instanz ist NICHT frisch: die Datenbank hat ${total} Tabelle(n). Abbruch, nichts geschrieben.\n`
        + `  Bootstrap ist für frische Instanzen (legt Buckets und die Web-Plattform localhost an und fährt alle Migrationen).\n`
        + `  Für eine bestehende Instanz: pnpm migrate --app ${name}\n`
        + `  Erzwingen (nur wenn du weißt, warum): --force`,
    }
  }

  const type = isRecord(body) && typeof body.type === 'string' ? `, ${body.type}` : ''
  return cannotCheck(`Status ${status}${type}`)
}
