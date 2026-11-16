/**
 * DIE LÖSCH-PFLICHT, AUS DEM CODE GELESEN (OPS-012, GA1 P20).
 *
 * Regel (CLAUDE.md, GDPR): ein Layer, der Daten zu Konten hält, registriert
 * einen Beitrag für Auskunft und Löschung. Bis P20 hielt das nur der Text —
 * drei Sicherheitsfunde (SEC-015, SEC-026, SEC-032) waren die Folge. P14 hat
 * die Liste „jede Tabelle hat eine Entscheidung" gebaut
 * (`packages/core/tests/support/userDataTables.ts`); ihre Tabellen kamen aber
 * aus einer von Hand gepflegten Soll-Liste, und eine neue SPALTE mit
 * Personenbezug sah niemand.
 *
 * Jetzt drei Quellen, keine davon von Hand:
 *  - das MANIFEST sagt `userData: true | false`,
 *  - der DATEIBAUM sagt, ob der Beitrag registriert wird,
 *  - die MIGRATIONEN sagen, welche Tabellen und Spalten der Layer anlegt
 *    (`scripts/lib/migration-inventory.mjs`).
 *
 * Was daraus folgt:
 *  - `userData: true`  ⇒ das Plugin mit `registerUserDataContributor` ist da,
 *    und jede Tabelle des Layers mit einer Personen-Spalte hat in P14s Liste
 *    eine Entscheidung, die NICHT „keine Personendaten" heißt.
 *  - `userData: false` ⇒ kein Beitrag registriert, und keine Migration des
 *    Layers legt eine Personen-Spalte an.
 *
 * Ein neues Produkt mit einer Tabelle voller Konto-Ids und ohne Lösch-Weg
 * ist damit rot — gleich, was sein Manifest behauptet.
 *
 * WAS DER WÄCHTER NICHT SIEHT: Personendaten in einer Spalte mit neutralem
 * Namen (`payload`, `note`), in einer Datei-Ablage oder bei einem fremden
 * Dienst. Dafür bleibt die Liste aus P14 (jede Tabelle und jede Ablage braucht
 * eine Entscheidung) und der Blick des Menschen, der sie einträgt.
 */

/** Wer kann eine Person sein — Vorsilben für `<rolle>Id` und `<rolle>Name`. */
const PERSON_ROLES = [
  'user', 'author', 'actor', 'owner', 'recipient', 'sender', 'reporter', 'starter', 'organizer',
  'blocked', 'blocker', 'member', 'subscriber', 'participant', 'invitee', 'assignee', 'customer',
  'creator', 'moderator', 'operator', 'voter', 'watcher', 'guest', 'account',
]

/**
 * Eine Spalte zeigt auf eine Person, wenn ihr Name so aussieht:
 *  - Konto: `userId`, `…UserId`, `<rolle>Id` (authorId, ownerId, recipientId …)
 *  - wer es getan hat: `…By` (createdBy, invitedBy, resolvedBy), `…ByName`
 *  - Name einer Person: `<rolle>Name` (authorName, organizerName)
 *  - Adresse: `email`, `emailLower`, `…Email`, `phone`, `address`
 *  - Leitung: `ip`, `ipHash`
 *  - Handle: `handle`, `handleLower`
 *  - Kunde beim Zahlungsdienst: `…CustomerId`
 */
const PERSON_COLUMN = new RegExp(
  `^(${PERSON_ROLES.join('|')})(Id|Name)$|UserId$|[a-z]By(Name)?$|^(email|emailLower|phone|address|ip|ipHash|handle|handleLower)$|Email$|CustomerId$`,
)

export const isPersonColumn = column => PERSON_COLUMN.test(column)

/**
 * Spalten, die wie eine Person HEISSEN und keine sind. Je Eintrag ein Grund;
 * ein Eintrag ohne Spalte (umbenannt, gelöscht) ist rot.
 */
export const PERSON_COLUMN_EXCEPTIONS = [
  {
    table: 'insights_channels',
    column: 'handle',
    reason: 'Handle eines YouTube-KANALS aus der Kuration (öffentliche Quelle, vom Betreiber eingetragen) — kein Konto, keine Privatperson.',
  },
]

/** Wo ein Layer seinen Beitrag registriert. Der Core ist der Orchestrator selbst. */
export const CONTRIBUTOR_FILE = layer => (layer === 'core' ? 'server/utils/userData.ts' : 'server/plugins/user-data.ts')

/**
 * @param {object} input
 * @param {{ key: string, userData: boolean, hasContributor: boolean, tables: Map<string, Set<string>>, touched: Map<string, Set<string>> }[]} input.layers
 * @param {Record<string, unknown>} input.registry  P14s Liste: Tabelle ⇒ 'none' | { export, erase }
 * @param {{ table: string, column: string, reason: string }[]} [input.exceptions]
 * @returns {string[]} ein Satz je Verstoß, mit dem, was zu tun ist
 */
export function userDataDutyProblems({ layers, registry, exceptions = PERSON_COLUMN_EXCEPTIONS }) {
  const problems = []
  const used = new Set()
  const personColumns = (table, columns) => [...columns].filter((column) => {
    if (!isPersonColumn(column)) return false
    const index = exceptions.findIndex(entry => entry.table === table && entry.column === column)
    if (index === -1) return true
    used.add(index)
    return false
  })

  for (const layer of layers) {
    const manifest = `packages/${layer.key}/product.manifest.ts`
    const contributor = `packages/${layer.key}/${CONTRIBUTOR_FILE(layer.key)}`
    const found = []
    for (const [table, columns] of [...layer.tables, ...layer.touched]) {
      const hits = personColumns(table, columns)
      if (hits.length) found.push({ table, hits })
    }

    if (layer.userData === false) {
      if (layer.hasContributor) {
        problems.push(`${manifest}: \`userData: false\`, aber ${contributor} registriert einen Beitrag für Auskunft und Löschung — das Manifest auf \`userData: true\` stellen.`)
      }
      if (found.length) {
        const list = found.map(({ table, hits }) => `„${table}" (${hits.join(', ')})`).join(', ')
        problems.push(`${manifest}: \`userData: false\`, aber die Migrationen des Layers legen Spalten mit Personenbezug an: ${list}. Entweder \`userData: true\` setzen, einen Beitrag registrieren (${contributor}, Muster: packages/tickets) und die Tabelle(n) in packages/core/tests/support/userDataTables.ts eintragen — oder, wenn eine Spalte keine Person meint, sie mit Grund in PERSON_COLUMN_EXCEPTIONS (scripts/lib/user-data-duty.mjs) aufnehmen.`)
      }
      continue
    }

    if (!layer.hasContributor) {
      problems.push(`${manifest}: \`userData: true\`, aber ${contributor} fehlt oder ruft \`registerUserDataContributor(\` nicht — ohne den Beitrag erreichen Auskunft und Kontolöschung die Daten dieses Layers nicht (Muster: packages/tickets/server/plugins/user-data.ts; Regeln: docs/referenz/EXPORT-UND-LOESCHUNG.md).`)
    }
    for (const { table, hits } of found) {
      const entry = registry[table]
      if (entry === undefined) {
        problems.push(`${table} (Layer „${layer.key}"): Spalten mit Personenbezug (${hits.join(', ')}), aber kein Eintrag in packages/core/tests/support/userDataTables.ts — dort eintragen, welche Datei die Tabelle bei Auskunft und Löschung anfasst.`)
      }
      else if (entry === 'none') {
        problems.push(`${table} (Layer „${layer.key}"): in packages/core/tests/support/userDataTables.ts steht „keine Personendaten" (NONE), die Migrationen legen aber Spalten mit Personenbezug an (${hits.join(', ')}). Den Eintrag auf die Datei ändern, die die Tabelle bei Auskunft und Löschung anfasst (oder \`skip('Grund')\`) — oder die Spalte mit Grund in PERSON_COLUMN_EXCEPTIONS (scripts/lib/user-data-duty.mjs) aufnehmen.`)
      }
    }
  }

  exceptions.forEach((entry, index) => {
    if ((entry.reason ?? '').trim().length < 40) {
      problems.push(`PERSON_COLUMN_EXCEPTIONS: ${entry.table}.${entry.column} — ohne tragfähigen Grund.`)
    }
    if (!used.has(index)) {
      problems.push(`PERSON_COLUMN_EXCEPTIONS: ${entry.table}.${entry.column} nimmt nichts mehr aus (Spalte gelöscht oder umbenannt?) — Eintrag streichen.`)
    }
  })
  return problems
}
