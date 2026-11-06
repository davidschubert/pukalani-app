/**
 * Migration brand-011: `brand_messages.sessionKey` — der Verlauf hängt an der
 * SESSION, nicht mehr nur am Kapitel (docs/archiv/BRAND-WIZARD-SESSIONS.md §12,
 * Paket 3a). Gemeinsame Regeln aller brand_*-Tabellen: Kopf von
 * `001-brand-profiles.ts`.
 *
 * ── WARUM ─────────────────────────────────────────────────────────────────
 * Seit BW2 ist eine Session (ein FELD) die Arbeitseinheit und nicht mehr das
 * Kapitel: elf Sessions in Baustein A, jede mit eigenem Ziel, eigener Leiter
 * und eigenem Nachfrage-Deckel. Ein Verlaufs-Fenster über das ganze Kapitel
 * schöbe George die letzten sechs Züge FREMDER Sessions vor — er hakte bei der
 * Herkunftsgeschichte nach, während die Frage längst „was loben eure Kunden"
 * lautet. Der Schlüssel daneben schneidet das Fenster auf die eine Session zu.
 *
 * ── LEER IST EIN WERT, KEIN FEHLER ────────────────────────────────────────
 * `required: false` + `xdefault: ''`: jede Bestands-Zeile liest '' — und ''
 * heisst genau eine Sache, nämlich „Kapitel-Verlauf aus der Zeit vor BW2".
 * Die Leseseite (`loadBrandConversationHistory`) zählt diese Zeilen zum
 * Verlauf der ERSTEN Session ihres Kapitels; ohne diese Regel stünde ein
 * Bestands-Branding nach dem Deploy ohne Gedächtnis da.
 *
 * ── DER INDEX ─────────────────────────────────────────────────────────────
 * `(profileId, stepKey, sessionKey)` — der Lesepfad wird um eine Spalte
 * länger. Der bestehende `idx_profile_step` BLEIBT: die Kapitel-Abfrage
 * (Verlaufs-Seite ohne `?session=`, GDPR-Export) fragt weiter nur nach den
 * ersten beiden Spalten, und ein Präfix des neuen Index bedient sie zwar,
 * aber einen funktionierenden Index zu löschen ist kein Teil dieser Migration.
 *
 * Index-Anlage NUR über `createIndexSteps` (CLAUDE.md): der Index-Endpunkt
 * liest die Spaltenliste aus Appwrites Metadaten-Cache, der dem Spalten-Status
 * hinterherhinkt — Warten allein reicht nicht, es braucht den Schreib-Anstoss.
 *
 * ── REIHENFOLGE ───────────────────────────────────────────────────────────
 * Diese Migration MUSS vor dem Code-Deploy laufen: die Konversations-Route
 * schreibt `sessionKey` explizit mit, und die Leseseite filtert danach — gegen
 * ein altes Schema wäre beides ein 400 aus Appwrite.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const MESSAGES = 'brand_messages'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert listColumns 25. */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration brand-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const label = `Column ${MESSAGES}.sessionKey`
  const cols = await existingColumnKeys(MESSAGES)
  if (cols.has('sessionKey')) {
    console.log(`↷ ${label} (existiert bereits)`)
  }
  else {
    try {
      // 32 wie `stepKey`: die längste Slot-Id des Katalogs hat 25 Zeichen
      // (`b.positioningFirstChoice`), und die Ids sind unveränderlich.
      await tablesDB.createVarcharColumn({
        databaseId, tableId: MESSAGES, key: 'sessionKey', size: 32, required: false, xdefault: '',
      })
      console.log(`✔ ${label}`)
    }
    catch (error) {
      if (hasCode(error, 409)) console.log(`↷ ${label} (existiert bereits)`)
      else throw error
    }
  }

  await waitForColumns(MESSAGES)

  await indexStep(`Index ${MESSAGES}.idx_profile_step_session`, {
    tableId: MESSAGES,
    key: 'idx_profile_step_session',
    type: TablesDBIndexType.Key,
    columns: ['profileId', 'stepKey', 'sessionKey'],
  })
}

console.log('✔ Migration brand-011 fertig')
