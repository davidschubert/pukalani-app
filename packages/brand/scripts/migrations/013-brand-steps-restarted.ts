/**
 * Migration brand-013: `brand_steps.restartedAt` — der Verlaufs-Schnitt nach
 * „Nochmal von vorn" (docs/archiv/BRAND-WIZARD-SESSIONS.md §5a/§12, Paket 3b).
 * Gemeinsame Regeln aller brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── WARUM ─────────────────────────────────────────────────────────────────
 * Seit BW2 §5a heisst „Nochmal von vorn" wirklich von vorn: die Slots des
 * Kapitels werden geleert, Konfidenz und Abnahmen fallen weg. Die NACHRICHTEN
 * bleiben stehen — die Retention-Regel aus brand-003 sagt „dauerhaft", und ein
 * Löschen wäre der eine Weg, der sich nicht zurücknehmen lässt. Genau deshalb
 * braucht es diesen Zeitstempel: der Verlauf lädt nur noch Züge NACH ihm, im
 * Prompt-Fenster wie auf der Seite. Ohne ihn erinnerte George sich an ein
 * Gespräch, das der Mensch gerade verworfen hat, und „von vorn" wäre eine Lüge.
 *
 * Für den Betreiber bleibt alles rekonstruierbar: die Zeilen liegen weiter da,
 * und der Schnappschuss des gelöschten Kapitels steht als `brand_events`-
 * Eintrag `step.restarted` daneben (24 Monate).
 *
 * ── ADDITIV UND OPTIONAL ──────────────────────────────────────────────────
 * `required: false`, kein Default — jede Bestands-Zeile liest `null`, und
 * `null` heisst genau eine Sache: dieses Kapitel wurde nie neu begonnen. Ein
 * Datumsfeld mit erfundener Vorgabe hiesse das Gegenteil und schnitte jedem
 * Bestands-Branding seinen Verlauf ab.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Gelesen wird der Wert IMMER über eine Zeile, die man ohnehin schon hat
 * (`brand_steps` hat eine deterministische Row-Id, s. `brandStepRowId`), und
 * gefiltert wird danach nie. Die Nachrichten-Abfrage filtert auf `$createdAt`
 * — ein internes Attribut, auf das dieses Projekt nirgends Indizes legt
 * (ausgeschrieben in brand-007). Ein Index hier wäre eine Zeile, die niemand
 * je benutzt.
 *
 * ── REIHENFOLGE ───────────────────────────────────────────────────────────
 * Diese Migration MUSS vor dem Code-Deploy laufen: die Restart-Route schreibt
 * `restartedAt` explizit mit, und drei Leser filtern danach — gegen ein altes
 * Schema wäre beides ein 400 aus Appwrite.
 *
 * (Die Nummer 012 ist bewusst frei: dort entsteht `brand_findings`, Paket 4.)
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 */
import { Client, Query, TablesDB } from 'node-appwrite'

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

const STEPS = 'brand_steps'

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

console.log(`Migration brand-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const label = `Column ${STEPS}.restartedAt`
  const cols = await existingColumnKeys(STEPS)
  if (cols.has('restartedAt')) {
    console.log(`↷ ${label} (existiert bereits)`)
  }
  else {
    try {
      await tablesDB.createDatetimeColumn({
        databaseId, tableId: STEPS, key: 'restartedAt', required: false,
      })
      console.log(`✔ ${label}`)
    }
    catch (error) {
      if (hasCode(error, 409)) console.log(`↷ ${label} (existiert bereits)`)
      else throw error
    }
  }

  await waitForColumns(STEPS)
}

console.log('✔ Migration brand-013 fertig')
