/**
 * Migration brand-015: `brand_waitlist` bekommt das DOUBLE-OPT-IN —
 * `tokenHash`, `tokenExpiresAt`, `confirmedAt`.
 * Gemeinsame Regeln aller brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── WARUM (Davids Entscheidung) ───────────────────────────────────────────
 * „Sonst spammen die mir das Fach voll." Bis heute schrieb
 * `POST /api/brand/waitlist` sofort eine Zeile (Status 'new') und meldete
 * sofort per Mail an den Betreiber. Eine FREMDE Adresse einzutragen kostete
 * damit einen Klick — und produzierte eine Mail, die der Betreiber lesen muss,
 * und einen Listeneintrag, den der Betroffene nie beantragt hat. Ab jetzt zählt
 * eine Zeile erst, wenn jemand einen Link in SEINEM Postfach geöffnet hat; erst
 * danach geht die Meldung raus.
 *
 * ── WARUM EIN HASH UND NICHT DER TOKEN ────────────────────────────────────
 * Der rohe Token steht ausschliesslich in der Mail. Gespeichert wird sein
 * sha256 — dieselbe Regel wie bei `brand_shares.tokenHash` (brand-004) und bei
 * `community_invites`: wer die Tabelle liest, kann damit keinen Link bauen.
 * KEIN SALZ, und das ist richtig: 32 Zufalls-Bytes sind nichts, was ein
 * Wörterbuch errät, und erst ein deterministischer Hash macht die Spalte
 * abfragbar.
 *
 * ── WARUM UNBESTÄTIGTE ZEILEN LIEGEN BLEIBEN ──────────────────────────────
 * Es gibt bewusst KEINEN Sweep, der `pending`-Zeilen nach Fristablauf wegräumt.
 * Das wäre ein zweiter Schreibweg auf eine Tabelle, die niemand beobachtet,
 * für einen Gewinn (ein paar tote Zeilen weniger), der in keinem Verhältnis
 * steht. Die Zeilen sind harmlos: ohne 'confirmed' meldet sich niemand bei
 * ihnen, und ihr Token ist nach 24 Stunden wertlos. Löschung bleibt — wie schon
 * bei der GDPR-Notiz in brand-012 — ein Handgriff des Betreibers in der
 * Appwrite-Konsole.
 *
 * ── DIE SPALTEN ───────────────────────────────────────────────────────────
 *  · `tokenHash` (128, Default '') — sha256 hex ist 64 Zeichen; 128 lässt Platz
 *    für ein längeres Verfahren, ohne je wieder eine Migration zu kosten. ''
 *    heisst „kein offener Link" und ist der NORMALFALL einer bestätigten Zeile:
 *    das Bestätigen LÖSCHT den Hash, damit ein weitergeleiteter Link tot ist.
 *  · `tokenExpiresAt` (32, Default '') — ISO-Zeitstempel, 24 Stunden ab
 *    Versand. VARCHAR und nicht `createDatetimeColumn`, weil die Route ihn
 *    LEERT statt ihn zu nullen: '' und `null` nebeneinander wären zwei Wörter
 *    für „kein offener Link", und der Leser müsste beide kennen. Verglichen
 *    wird ohnehin im Code (`Date.parse`), nie in einer Abfrage.
 *  · `confirmedAt` (32, Default '') — dieselbe Form, aus demselben Grund;
 *    reine Auskunft für den Betreiber („seit wann steht die drauf?").
 *
 * ── DIE STATUS-WERTE ──────────────────────────────────────────────────────
 * `status` (brand-012, varchar 32) trägt ab jetzt:
 *   'pending'   — eingetragen, Link verschickt, NICHT bestätigt (neuer Default
 *                 des Schreibpfads; der Spalten-Default in Appwrite bleibt auf
 *                 'new' stehen, weil ein Default-Wechsel den Spaltentyp
 *                 anfassen müsste und KEIN Schreiber ihn je zieht — die Route
 *                 setzt den Wert immer explizit).
 *   'confirmed' — die Adresse hat sich selbst bestätigt. DER EINZIGE Wert, den
 *                 Code liest.
 *   'invited' | 'declined' — Betreiber-Notizen wie bisher, ohne Logik.
 * Den Altwert 'new' gibt es in Produktion NICHT (die Tabelle ist leer); der
 * Confirm-Pfad behandelt ihn trotzdem wie 'pending' — alles ausser 'confirmed'
 * heisst „noch nicht bestätigt".
 *
 * ── EIN INDEX, UND ZWAR NICHT UNIQUE ──────────────────────────────────────
 * `idx_token_hash` ist der Lesepfad der Confirm-Route (eine Abfrage je Klick).
 * UNIQUE wäre hier FALSCH und würde die Warteliste nach der zweiten Bestätigung
 * unbrauchbar machen: '' steht auf JEDER bestätigten Zeile, und ein zweiter
 * leerer Wert liefe in einen 409. Die Eindeutigkeit kommt nicht vom Index,
 * sondern vom Wert selbst — 32 Zufalls-Bytes kollidieren nicht.
 *
 * ── REIHENFOLGE ───────────────────────────────────────────────────────────
 * Diese Migration MUSS vor dem Code-Deploy laufen: beide Routen schreiben bzw.
 * lesen die drei Spalten explizit, gegen ein altes Schema wäre das ein 400 aus
 * Appwrite (die Route macht daraus 503 `waitlist_unavailable`).
 *
 * (Die Nummer 013 aus dem Auftrag war beim Bauen bereits vergeben —
 * `013-brand-steps-restarted.ts` und `014-brand-findings.ts` stehen im Baum.
 * Migrations-DATEINAMEN werden nie umbenannt, also läuft dieses Paket als 015.)
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

const WAITLIST = 'brand_waitlist'

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

console.log(`Migration brand-015 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(WAITLIST)

  // Der sha256 des offenen Links — '' heisst „keiner offen" (s. Kopf).
  await columnStep(`Column ${WAITLIST}.tokenHash`, 'tokenHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'tokenHash', size: 128, required: false, xdefault: '',
  }))
  // Die Frist des Links (ISO). Varchar, weil die Route sie LEERT (s. Kopf).
  await columnStep(`Column ${WAITLIST}.tokenExpiresAt`, 'tokenExpiresAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'tokenExpiresAt', size: 32, required: false, xdefault: '',
  }))
  // Seit wann diese Adresse bestätigt ist — Auskunft, keine Logik.
  await columnStep(`Column ${WAITLIST}.confirmedAt`, 'confirmedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'confirmedAt', size: 32, required: false, xdefault: '',
  }))

  await waitForColumns(WAITLIST)

  // Lesepfad der Confirm-Route. NICHT unique (s. Kopf): '' steht mehrfach.
  await indexStep(`Index ${WAITLIST}.idx_token_hash`, {
    tableId: WAITLIST, key: 'idx_token_hash', type: TablesDBIndexType.Key, columns: ['tokenHash'],
  })
}

console.log('✔ Migration brand-015 fertig')
