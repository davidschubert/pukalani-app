/**
 * Migration system-031: Table `account_handles` — der @name JE KONTO (AH-7).
 *
 * Davids Entscheidung vom 2026-08-11 (DECISION-LOG Punkt 11): eine
 * Pukalani-ID, EIN Handle, überall. Bis hierher galt ein Name je Community
 * (`community_handles`, system-029, eindeutig je `(communityId, handleLower)`);
 * derselbe Mensch konnte in A `@david` und in B `@dave` heissen, und zwei
 * verschiedene Menschen konnten in A und B beide `@david` sein.
 *
 * ── DER EINDEUTIGE SCHLÜSSEL TRÄGT KEINEN MANDANTEN MEHR ──────────────────
 * `handleLower` ALLEIN, global. Das ist die bewusste Ausnahme von der
 * Pool-Unique-Regel aus CLAUDE.md („tenant-RELATIVE Schlüssel brauchen
 * communityId"): ein Handle ist ab jetzt eben KEIN tenant-relativer Schlüssel,
 * sondern eine Eigenschaft des Kontos — wie die E-Mail-Adresse, die im
 * geteilten Projekt auch instanzweit eindeutig ist. Die Folge ist gewollt: die
 * erste Community entscheidet mit, welche Namen anderswo noch frei sind.
 *
 * VERGLICHEN WIRD KLEIN, ANGEZEIGT WIE GEWÄHLT: deshalb zwei Spalten.
 * `handleLower` trägt den Index (`@David` und `@david` kollidieren), `handle`
 * ist die Schreibweise, die der Mensch gewählt hat.
 *
 * ── ALTE NAMEN BLEIBEN STEHEN (unverändert aus system-029) ────────────────
 * Eine Änderung legt eine NEUE Zeile an und setzt die alte auf
 * `status: 'former'` — sie wird NICHT gelöscht. Der alte Name bleibt belegt,
 * UND eine Erwähnung in einem zwei Jahre alten Beitrag zeigt weiterhin auf
 * denselben Menschen.
 *
 * ── PERMISSIONS: DAS PUBLIKUM STEHT AN DER ZEILE, ALS LISTE ───────────────
 * Keine Tabellen-Rechte, `rowSecurity: true`. Eine konto-weite Zeile kann
 * keine `communityId`-Spalte mehr tragen, also trägt sie EINE Lese-Rolle JE
 * Mitgliedschaft (`read("label:<communityId>")`) plus `read("user:<id>")` für
 * den Menschen selbst. Regeln, Begründung und die drei Leser, die daran
 * hängen: packages/core/shared/accountHandleAudience.ts.
 *
 * ── INDIZES ──────────────────────────────────────────────────────────────
 *  - `uq_account_handle` (unique, handleLower): die Vergabe schreibt blind,
 *    ein 409 heisst „schon vergeben". Bedient zugleich die häufigste
 *    Leseabfrage (Erwähnung auflösen).
 *  - `idx_account_user` (key, userId+status): „wie heisst dieser Mensch" —
 *    die zweite und letzte Abfrage. `status` hängt hinten dran, damit 'active'
 *    ohne zweiten Zugriff herausfällt.
 * Ein dritter Index wäre Schreiblast ohne Leser.
 *
 * ── DIE ÜBERNAHME LÄUFT HIER MIT (Schritt am Ende dieser Datei) ───────────
 * Bestehende `community_handles` ziehen um, nach Davids Regel „wer zuerst kam,
 * behält". Sie steht als PURE Rechnung in
 * packages/core/shared/handleAdoption.ts (unit-getestet), damit sie prüfbar
 * ist statt geglaubt; hier wird sie nur ausgeführt. Ein zweiter Lauf ist
 * harmlos: geschrieben wird blind, ein 409 heisst „hat schon einen".
 *
 * ADDITIV — diese Migration MUSS VOR dem Code-Deploy laufen (die neuen Routen
 * und der Dienst lesen `account_handles`); sie ändert an system-029 nichts und
 * kann gefahrlos vor dem Deploy stehen. `community_handles` bleibt vollständig
 * erhalten und wird weiterhin GELESEN (Alt-Bestand, Lese-Fallback).
 *
 *   pnpm migrate --app <app> --layer system
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'
import { planHandleAdoption } from '../../../core/shared/handleAdoption.ts'
import { accountHandlePermissions, communityHandleReadRole, labelSafeCommunityId } from '../../../core/shared/accountHandleAudience.ts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const TABLE = 'account_handles'
const LEGACY_TABLE = 'community_handles'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}

async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 600; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-031 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId: db,
  tableId: TABLE,
  name: 'Account Handles (@name, konto-weit)',
  // Keine Tabellen-Rechte: das Publikum steht an der Zeile (siehe Kopf).
  permissions: [],
  rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

// 36 = Länge einer Appwrite-Id.
await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))

// 24 = HANDLE_MAX_LENGTH (packages/core/shared/handles.ts). Absichtlich NICHT
// grosszügiger: die Spalte ist die letzte Sperre, wenn eine künftige Route
// die Prüfung vergisst.
for (const key of ['handle', 'handleLower']) {
  await columnStep(`Column ${TABLE}.${key}`, key, cols, () => tablesDB.createVarcharColumn({
    databaseId: db, tableId: TABLE, key, size: 24, required: false, xdefault: '',
  }))
}

// 'active' | 'former' — siehe Kopf. Kein Enum-Typ, weil ein späterer dritter
// Wert sonst eine Schema-Änderung statt einer Code-Änderung wäre.
await columnStep(`Column ${TABLE}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'status', size: 16, required: false, xdefault: 'active',
}))

// ISO-Zeitstempel; '' heisst „noch nie geändert" und verbraucht die
// Sperrfrist nicht (handleChangeAvailableAt gibt dafür null zurück).
await columnStep(`Column ${TABLE}.changedAt`, 'changedAt', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'changedAt', size: 32, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

// Die eigentliche Mechanik der Vergabe: blind anlegen, 409 heisst „vergeben".
// GLOBAL, ohne Mandanten-Spalte — der Kern von AH-7.
await indexStep(`Unique-Index ${TABLE}.uq_account_handle`, {
  tableId: TABLE, key: 'uq_account_handle', type: TablesDBIndexType.Unique,
  columns: ['handleLower'],
})

// „Wie heisst dieser Mensch?" — die zweite und letzte Abfrage.
await indexStep(`Index ${TABLE}.idx_account_user`, {
  tableId: TABLE, key: 'idx_account_user', type: TablesDBIndexType.Key,
  columns: ['userId', 'status'],
})

/* ─────────────────────────────────────────────────────────────────────────────
 * ÜBERNAHME der bestehenden Community-Handles.
 *
 * Die REGEL steht in packages/core/shared/handleAdoption.ts und ist dort
 * getestet; hier steht nur das Lesen, Schreiben und Zählen. Wörtlich:
 *
 *   Je Konto der ÄLTESTE eigene AKTIVE Handle ist der Kandidat. Die Kandidaten
 *   werden nach derselben Anlage-Zeit vergeben. Ist `handleLower` global schon
 *   vergeben (ein Früherer war da), bekommt das Konto KEINEN Eintrag — es
 *   wählt später selbst im Formular. Es wird nichts umbenannt und nichts
 *   gelöscht.
 *
 * `community_handles` bleibt unangetastet und wird weiter gelesen: alte
 * Erwähnungen lösen darüber auch dann noch auf, wenn ein Konto hier leer
 * ausgegangen ist.
 * ────────────────────────────────────────────────────────────────────────── */

interface LegacyRow extends Models.Row {
  communityId: string
  userId: string
  handle: string
  handleLower: string
  status: string
}

/**
 * ALLE Alt-Zeilen, seitenweise. Cursor statt `offset`, weil die Übernahme
 * über eine Tabelle läuft, in die parallel geschrieben werden kann — ein
 * Offset überspränge dann Zeilen. `orderAsc($id)` ist die stabile Ordnung
 * dafür; die fachliche Reihenfolge macht ohnehin `planHandleAdoption`.
 */
async function listAllLegacyRows(): Promise<LegacyRow[]> {
  const all: LegacyRow[] = []
  let cursor: string | undefined
  for (let page = 0; page < 500; page++) {
    const { rows } = await tablesDB.listRows<LegacyRow>({
      databaseId: db,
      tableId: LEGACY_TABLE,
      queries: [
        Query.limit(100),
        Query.orderAsc('$id'),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })
    all.push(...rows)
    if (rows.length < 100) break
    cursor = rows[rows.length - 1]?.$id
    if (!cursor) break
  }
  return all
}

const legacyRows = await listAllLegacyRows().catch((error) => {
  // Eine Instanz ohne system-029 (oder ohne je vergebene Namen) hat nichts zu
  // übernehmen — das ist kein Fehlschlag der Migration.
  if (hasCode(error, 404)) return [] as LegacyRow[]
  throw error
})

if (legacyRows.length === 0) {
  console.log('↷ Übernahme: keine Community-Handles vorhanden')
}
else {
  const plan = planHandleAdoption(legacyRows.map(row => ({
    userId: row.userId,
    handle: row.handle,
    handleLower: row.handleLower,
    status: row.status,
    createdAt: row.$createdAt,
    communityId: row.communityId,
  })))

  // Pool oder Silo? Die Frage entscheidet das PUBLIKUM der übernommenen Zeile,
  // und sie wird an den Daten beantwortet statt geraten: trägt irgendeine
  // Alt-Zeile eine communityId, ist dies eine Pool-Instanz. Ein Konto ohne
  // jede communityId bekommt dort NUR den Besitzer-Read (fail-closed) — nie
  // `read("users")`, das im geteilten Projekt „alle Kunden" hiesse.
  const pool = legacyRows.some(row => !!row.communityId)

  let adopted = 0
  let skipped = 0
  for (const candidate of plan.candidates) {
    // NUR label-taugliche Ids werden zu Rollen (S2, 2026-08-19): eine
    // tenantId (`t-…`) in einer Alt-Zeile ergäbe `read("label:t-…")`, und
    // Appwrite prüft Permissions VOR dem Unique-Index — der Lauf stürbe mit
    // 400 statt im idempotenten 409, und zwar bei JEDER Wiederholung. Eine
    // übersprungene Rolle ist nur ein engeres Publikum (der Runtime-Nachtrag
    // `ensureAccountHandleAudience` heilt es beim nächsten Besuch); ein
    // Abbruch blockiert dagegen die gesamte system-Kette der Instanz.
    const labelSafe = candidate.communityIds.filter(labelSafeCommunityId)
    const dropped = candidate.communityIds.filter(id => !labelSafeCommunityId(id))
    for (const id of dropped) {
      console.warn(`⚠ Übernahme: communityId "${id}" ist kein gültiges Label (Konto ${candidate.userId}) — Rolle übersprungen, Zeile in ${LEGACY_TABLE} gehört korrigiert`)
    }
    const permissions = labelSafe.length > 0
      ? [
          ...accountHandlePermissions(true, null, candidate.userId),
          ...labelSafe.map(communityHandleReadRole),
        ]
      : accountHandlePermissions(pool, null, candidate.userId)

    try {
      await tablesDB.createRow({
        databaseId: db,
        tableId: TABLE,
        rowId: 'unique()',
        data: {
          userId: candidate.userId,
          handle: candidate.handle,
          handleLower: candidate.handleLower,
          status: 'active',
          // LEER, nicht die Zeit der Übernahme: die 30-Tage-Sperrfrist darf
          // niemand verbrauchen, der nichts getan hat.
          changedAt: '',
        },
        permissions,
      })
      adopted++
    }
    catch (error) {
      // 409 = dieses Konto hat schon eine Zeile (zweiter Lauf) ODER der Name
      // ist inzwischen anderweitig vergeben. Beides ist der gewünschte
      // Ausgang, nicht ein Fehler.
      if (hasCode(error, 409)) {
        skipped++
        continue
      }
      throw error
    }
  }

  console.log(`✔ Übernahme: ${adopted} übernommen, ${skipped} übersprungen (bereits vergeben), `
    + `${plan.collisions.length} Konten ohne Eintrag (Name war schon weg)`)
  for (const collision of plan.collisions) {
    console.log(`  · ${collision.userId} → @${collision.handleLower} (wählt neu im Profil)`)
  }
}

console.log('✔ Migration system-031 fertig')
