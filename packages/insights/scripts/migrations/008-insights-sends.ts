/**
 * Migration insights-008: `insights_sends` — DAS PROTOKOLL EINES VERSANDS.
 *
 * Paket BI1 I5b („Newsletter — Versenden"), Plan docs/plans/BRAND-INSIGHTS.md
 * §9.9. Gemeinsame Regeln wie insights-001…007 (server-only `permissions: []` /
 * `rowSecurity: false`, kein `communityId`, Indizes NUR über `createIndexSteps`,
 * idempotent 409 → skip); sie läuft ausschliesslich auf der `branding`-Instanz.
 *
 * (`insights_subscribers` ist die 006 und `insights_watchlist` die 007 — beide
 * standen zum Zeitpunkt dieses Laufs auf `origin/main`. Diese Tabelle ist
 * deshalb die 008.)
 *
 * ── WARUM ES DIESE TABELLE ÜBERHAUPT GIBT ───────────────────────────────
 * Weil ein Versand ABBRECHEN kann. Stirbt der Vorgang nach 300 von 500 Mails
 * — Prozess weg, Deploy, SMTP-Zeitüberschreitung — und jemand drückt den Knopf
 * erneut, dann bekommen 300 Menschen dieselbe Mail ZWEIMAL. Das ist der eine
 * Fehler, den man nicht zurückholt: eine Mail ist draussen, sobald sie draussen
 * ist. Diese Zeile ist deshalb kein Bericht, sondern der FORTSCHRITTSSTAND — sie
 * entsteht VOR der ersten Mail und wird nach JEDEM Stapel geschrieben.
 *
 * ── HIER STEHT KEINE EINZIGE ADRESSE ────────────────────────────────────
 * Die Zeile ZÄHLT, sie nennt niemanden: `recipients`, `sent`, `failed` sind
 * Zahlen, `cursor` ist eine ZEILEN-ID aus `insights_subscribers` (keine
 * Adresse, kein Hash einer Adresse). Eine Empfängerliste gehört hier NICHT
 * hinein — auch nicht „nur die fehlgeschlagenen", auch nicht gehasht: ein Hash
 * ist wieder ein Personenbezug (man kann eine vermutete Adresse dagegen
 * prüfen), und `insights_subscribers` hat eine Löschfrist, die eine Kopie
 * daneben aushebeln würde. Wer wissen will, wer auf der Liste steht, fragt die
 * Liste.
 *
 * ── DIE SPALTEN ─────────────────────────────────────────────────────────
 *  · `postId` (64, Pflicht, **UNIQUE**) — die Zeilen-Id des Beitrags. Der
 *    Unique-Index `uq_post_id` IST die Sicherung gegen den zweiten Versand:
 *    ein Beitrag, eine Mail (Davids Entscheidung 2026-10-27). Eine
 *    Vorab-Abfrage allein wäre ein Rennen zwischen zwei offenen Reitern; der
 *    Index ist die Wahrheit, das 409 ihre saubere Antwort.
 *  · `subject` (200, Default '') — der Betreff, wie er verschickt WURDE. Er
 *    entsteht aus dem Titel des Beitrags, und der Titel kann sich danach
 *    ändern: ohne diese Spalte könnte niemand mehr sagen, was in den
 *    Postfächern steht.
 *  · `intro` (1000, Default '') — die zwei, drei eigenen Sätze über dem
 *    Vorspann. Dieselbe Begründung wie beim Betreff, plus eine zweite: beim
 *    FORTSETZEN nach einem Abbruch muss die zweite Hälfte denselben Text
 *    bekommen wie die erste.
 *  · `locale` (8, Default 'en') — die GRUNDSPRACHE des Beitrags zum Zeitpunkt
 *    des Versands. Sie ist NICHT die Sprache der Mails: die ist die des
 *    EMPFÄNGERS (`insights_subscribers.locale`, aufgelöst über
 *    `insightsPublicFassung`). Sie steht hier, weil sie sagt, auf welche
 *    Fassung ein Rückfall ging — ändert die Redaktion später die
 *    Grundsprache, wäre das sonst nicht mehr nachvollziehbar.
 *  · `state` (16, Default 'running') — `running` · `done` · `failed`. Drei
 *    Werte, und `decideInsightsSendStart` (`shared/insightsNewsletter.ts`)
 *    macht daraus die drei Antworten: weiter, fortsetzen, 409.
 *  · `cursor` (64, Default '') — die `$id` des zuletzt ERFOLGREICH bedienten
 *    Empfängers. Fortsetzen heisst `Query.greaterThan('$id', cursor)`.
 *  · `recipients` / `sent` / `failed` (Integer, Default 0) — gezählt beim
 *    Start bzw. mitgeschrieben je Stapel.
 *  · `startedAt` / `finishedAt` (32, Default '') — ISO-Zeitstempel. VARCHAR
 *    und nicht `datetime`, weil `finishedAt` LEER beginnt und die Route es
 *    beim Abschluss setzt (dieselbe Begründung wie bei den vier Stempeln von
 *    `insights_subscribers`): '' und `null` nebeneinander wären zwei Wörter
 *    für „noch nicht fertig". Verglichen wird im Code, nie in einer Abfrage.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ─────────────────────────────────────
 * postId 64 + subject 200 + intro 1.000 + locale 8 + state 16 + cursor 64 +
 * startedAt 32 + finishedAt 32 = 1.416 Zeichen. Weit unter 16.381.
 *
 * ── EIN INDEX, UND ZWAR GENAU EINER ─────────────────────────────────────
 * `uq_post_id` (UNIQUE) ist Lesepfad UND Sicherung in einem: jede Frage an
 * diese Tabelle lautet „gibt es für DIESEN Beitrag schon einen Versand?".
 * Einen Index auf `state` gibt es BEWUSST nicht — es gibt keinen Leser, der
 * „alle laufenden Versände" sucht (es kann nur einer je Beitrag geben, und die
 * Oberfläche steht immer vor genau einem Beitrag). Ein Index ohne Leser ist
 * Schreiblast.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer insights
 *
 * Sie MUSS vor dem Code-Deploy laufen: die zwei Routen lesen und schreiben die
 * Spalten explizit, gegen ein altes Schema wäre das ein 400 aus Appwrite (die
 * Routen machen daraus 503 `storage_unavailable`).
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

const SENDS = 'insights_sends'

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
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration insights-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${SENDS}`, () => tablesDB.createTable({
  databaseId, tableId: SENDS, name: 'Insights Sends', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(SENDS)

  // Die fachliche Identität — trägt den UNIQUE-Index (s. Kopf).
  await columnStep(`Column ${SENDS}.postId`, 'postId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'postId', size: 64, required: true,
  }))
  // Der Betreff, wie er verschickt WURDE (der Titel darf sich danach ändern).
  await columnStep(`Column ${SENDS}.subject`, 'subject', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'subject', size: 200, required: false, xdefault: '',
  }))
  // Die eigenen zwei, drei Sätze — auch der zweite Stapel braucht sie (s. Kopf).
  await columnStep(`Column ${SENDS}.intro`, 'intro', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'intro', size: 1000, required: false, xdefault: '',
  }))
  // Die GRUNDSPRACHE des Beitrags — nicht die Sprache der Mails (s. Kopf).
  await columnStep(`Column ${SENDS}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'locale', size: 8, required: false, xdefault: 'en',
  }))
  // running · done · failed — `decideInsightsSendStart` liest sie.
  await columnStep(`Column ${SENDS}.state`, 'state', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'state', size: 16, required: false, xdefault: 'running',
  }))
  // Die `$id` des zuletzt ERFOLGREICH bedienten Empfängers (s. Kopf).
  await columnStep(`Column ${SENDS}.cursor`, 'cursor', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'cursor', size: 64, required: false, xdefault: '',
  }))
  // Drei Zahlen, keine Namen.
  await columnStep(`Column ${SENDS}.recipients`, 'recipients', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: SENDS, key: 'recipients', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${SENDS}.sent`, 'sent', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: SENDS, key: 'sent', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${SENDS}.failed`, 'failed', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: SENDS, key: 'failed', required: false, min: 0, xdefault: 0,
  }))
  // Varchar, weil `finishedAt` LEER beginnt und gesetzt wird (s. Kopf).
  await columnStep(`Column ${SENDS}.startedAt`, 'startedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'startedAt', size: 32, required: false, xdefault: '',
  }))
  await columnStep(`Column ${SENDS}.finishedAt`, 'finishedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SENDS, key: 'finishedAt', size: 32, required: false, xdefault: '',
  }))

  await waitForColumns(SENDS)

  // Lesepfad UND Sicherung gegen den zweiten Versand in einem (s. Kopf).
  await indexStep(`Index ${SENDS}.uq_post_id`, {
    tableId: SENDS, key: 'uq_post_id', type: TablesDBIndexType.Unique, columns: ['postId'],
  })
}

console.log('✔ Migration insights-008 fertig')
