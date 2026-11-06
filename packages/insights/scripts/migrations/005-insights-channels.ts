/**
 * Migration insights-005: `insights_channels` — DIE KURATIERTE KANALLISTE.
 *
 * Paket BI2 K3, Plan docs/plans/BRAND-INSIGHTS-KURATION.md §1. Gemeinsame
 * Regeln wie insights-001…004 (server-only `permissions: []` /
 * `rowSecurity: false`, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz.
 *
 * ── WARUM EINE TABELLE, WO BISHER EINE CONFIG STAND ─────────────────────
 * Die Liste stand seit I4 in `apps/branding/app/app.config.ts`, mit einer
 * ausführlichen Begründung im Kopf von `shared/insightsRadar.ts`: sie ändere
 * sich seltener als ein Deploy. Der Betrieb hat das widerlegt — an zwei Tagen
 * drei Änderungen (ein Privatkonto als vermeintliches Designbüro, zwei Kanäle
 * ohne Upload seit Jahren). Davids Entscheidung vom 2026-09-09: der Betreiber
 * pflegt die Liste selbst, im Dashboard. Was der Code-Kommentar leistete,
 * leistet jetzt die Spalte `note`.
 *
 * ── SIE IST DAS GEGENTEIL VON insights-004 ──────────────────────────────
 * `insights_topics` trägt FREMDE Zahlen, wird täglich überschrieben und nach
 * dreissig Tagen geräumt (YouTube-Policies III.E.4). Hier steht eine EIGENE
 * redaktionelle Entscheidung, und sie bleibt, bis ein Mensch sie ändert. Die
 * Felder, die von der API kommen (`title`, `handle`, `subscribers`,
 * `lastUploadAt`), sind deshalb bewusst nur ein ABBILD für die Anzeige: sie
 * werden bei jedem Abruf nachgezogen und stehen nie für sich.
 *
 * ── AUSSCHALTEN STATT LÖSCHEN ───────────────────────────────────────────
 * `active` ist der Grund, warum es diese Tabelle und nicht einfach eine
 * kürzere Liste gibt: ein Kanal, der nichts mehr liefert, bleibt mit seiner
 * Notiz stehen. Ohne die Zeile fehlte auch der Satz, warum er damals raus ist
 * — und derselbe Irrtum passierte in einem halben Jahr ein zweites Mal.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ─────────────────────────────────────
 * channelId 64 + topic 32 + title 160 + handle 64 + note 400 = 720 Zeichen.
 * Weit unter der Grenze von 16.381; `note` braucht deshalb kein MEDIUMTEXT.
 *
 * ── INDIZES ─────────────────────────────────────────────────────────────
 *  · `uq_channel_id` — die fachliche Identität. Ohne ihn stünde ein Kanal
 *    nach einem Doppelklick zweimal in der Liste und kostete jeden Lauf die
 *    doppelte Quota.
 *  · `idx_active` — die Frage des Sweeps („welche laufen mit?"). Appwrite
 *    verlangt für ein `equal` keinen Index, für die stabile Sortierung der
 *    Liste aber schon; bei fünfzig Zeilen ist er ohnehin Hygiene und nicht
 *    Leistung.
 *
 * Aufruf:
 *   pnpm migrate --app branding --layer insights
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

const CHANNELS = 'insights_channels'

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
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration insights-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${CHANNELS}`, () => tablesDB.createTable({
  databaseId, tableId: CHANNELS, name: 'Insights Channels', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(CHANNELS)

  // Die Kanal-Id (`UC` + 22 Zeichen) — die fachliche Identität. PFLICHT: eine
  // Kanal-Zeile ohne Kanal ist keine. 64 wie in insights-004, damit beide
  // Tabellen dieselbe Spaltenbreite für dieselbe Sache haben.
  await columnStep(`Column ${CHANNELS}.channelId`, 'channelId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHANNELS, key: 'channelId', size: 64, required: true,
  }))
  // Das Cluster, für das dieser Kanal steht — der GRUNDWERT der Einordnung
  // (`insightsRadarClassify`: der Kanal ist die Vorgabe, der Videotitel die
  // Korrektur). Varchar und kein Enum, wie in insights-001…004: die Wahrheit
  // über die erlaubten Werte steht im Code.
  await columnStep(`Column ${CHANNELS}.topic`, 'topic', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHANNELS, key: 'topic', size: 32, required: true,
  }))
  // Der Name, wie ihn `channels.list` zuletzt geliefert hat — NICHT von Hand
  // gepflegt (s. Kopf von `insightsChannel.ts`). 160 wie `channelTitle` in
  // insights-004.
  await columnStep(`Column ${CHANNELS}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHANNELS, key: 'title', size: 160, required: false, xdefault: '',
  }))
  // Das Handle (`thefutur`, ohne `@`) — das, was ein Mensch kennt. YouTube
  // deckelt bei 30 Zeichen, 64 ist Rand.
  await columnStep(`Column ${CHANNELS}.handle`, 'handle', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHANNELS, key: 'handle', size: 64, required: false, xdefault: '',
  }))
  // Abonnenten beim letzten Abruf — der Nenner der Popularität. 0 heisst „der
  // Kanal verbirgt seine Zahl", wie in insights-004.
  await columnStep(`Column ${CHANNELS}.subscribers`, 'subscribers', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: CHANNELS, key: 'subscribers', required: false, min: 0, xdefault: 0,
  }))
  // Läuft er mit? Vorgabe WAHR — wer einen Kanal anlegt, will ihn im Radar;
  // „erst anlegen, dann einschalten" wäre ein Handgriff ohne Gegenwert.
  await columnStep(`Column ${CHANNELS}.active`, 'active', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: CHANNELS, key: 'active', required: false, xdefault: true,
  }))
  // Der umgezogene Code-Kommentar: warum ist der drin, warum ist er aus.
  await columnStep(`Column ${CHANNELS}.note`, 'note', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHANNELS, key: 'note', size: 400, required: false, xdefault: '',
  }))
  // Der jüngste Upload beim letzten Abruf — die EINE Zahl, an der man einen
  // toten Kanal erkennt, ohne den Lauf abzuwarten. Genau sie fehlte, als
  // Ogilvy und Marketing Examples monatelang Quota kosteten und nichts
  // lieferten.
  await columnStep(`Column ${CHANNELS}.lastUploadAt`, 'lastUploadAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CHANNELS, key: 'lastUploadAt', required: false,
  }))
  // Wann wir das zuletzt nachgesehen haben. Ohne diesen Stempel wäre ein
  // leeres `lastUploadAt` nicht zu deuten: nie etwas hochgeladen, oder nie
  // geprüft?
  await columnStep(`Column ${CHANNELS}.checkedAt`, 'checkedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CHANNELS, key: 'checkedAt', required: false,
  }))

  await waitForColumns(CHANNELS)

  await indexStep(`Index ${CHANNELS}.uq_channel_id`, {
    tableId: CHANNELS, key: 'uq_channel_id', type: TablesDBIndexType.Unique, columns: ['channelId'],
  })
  await indexStep(`Index ${CHANNELS}.idx_active`, {
    tableId: CHANNELS, key: 'idx_active', type: TablesDBIndexType.Key, columns: ['active'],
  })
}

console.log('✔ Migration insights-005 fertig')
