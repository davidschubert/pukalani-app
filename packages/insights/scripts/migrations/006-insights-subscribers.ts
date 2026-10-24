/**
 * Migration insights-006: `insights_subscribers` — DIE NEWSLETTER-LISTE MIT
 * EIGENEM DOUBLE-OPT-IN.
 *
 * Paket I5a („Sammeln"), Plan docs/plans/BRAND-INSIGHTS.md §9.3a. Muster:
 * `brand_waitlist` (brand-012) samt seinem Opt-in (brand-015). Gemeinsame
 * Regeln wie insights-001 (server-only `permissions: []` / `rowSecurity:
 * false`, kein `communityId`, Indizes NUR über `createIndexSteps`, idempotent
 * 409 → skip); sie läuft ausschliesslich auf der `branding`-Instanz.
 *
 * ── DIE WARTELISTE WIRD NICHT WEITERBENUTZT ─────────────────────────────
 * §9.3a ist eindeutig, und es ist keine Bequemlichkeit, sondern dieselbe
 * Regel, die DB1 für `marketVisibility` gezogen hat: *eine Zustimmung gilt nur
 * für das, wofür sie gegeben wurde.* „Sag mir Bescheid, wenn das Produkt
 * öffnet" (`brand_waitlist`) ist keine Einwilligung in einen redaktionellen
 * Newsletter. Es gibt deshalb KEINEN Import, KEINEN Abgleich und KEINE
 * gemeinsame Tabelle — wer beides will, trägt sich zweimal ein. Übernommen
 * wird das MUSTER, nicht die Adressen.
 *
 * ── DER RIEGEL DAVOR IST KEIN SCHEMA, ABER ER GEHÖRT HIERHER GESAGT ─────
 * Diese Tabelle darf existieren, bevor eine einzige Adresse hineindarf:
 * `pukalani.insights.newsletter.enabled` ist Layer-Default `false`, weil die
 * Rechtstexte von branding.supply Entwurf sind (BS1 R2/R3) — ohne einen
 * Datenschutz-Abschnitt „Newsletter" wird nichts erhoben („erst Text, dann
 * Schalter"). Die Migration vorher zu fahren ist richtig: die Routen
 * antworten sonst 503, wo sie 404 oder 200 sagen sollten.
 *
 * ── DIE SPALTEN (wörtlich aus §9.3a) ────────────────────────────────────
 *  · `emailLower` (256, Pflicht, UNIQUE) — der VERGLEICHSWERT, getrimmt und
 *    kleingeschrieben vom Zod-Schema. Er trägt den Unique-Index; ohne ihn
 *    wäre ein zweiter Eintrag derselben Person eine zweite Zeile, und zwei
 *    Zeilen hiessen zwei Mails je Ausgabe. Er ist ZUGLEICH der Lesepfad des
 *    GDPR-Contributors („welche Zeile gehört der Adresse dieses Kontos?").
 *  · `email` (256, Pflicht) — dieselbe Adresse in ihrer Original-Schreibweise.
 *    Zwei Spalten für eine Adresse ist Absicht: verglichen wird technisch
 *    (klein), angeschrieben wird so, wie jemand sich selbst geschrieben hat.
 *  · `locale` (8, Default 'en') — die Sprache der Seite, auf der sich jemand
 *    eingetragen hat. Sie entscheidet, in welcher Sprache geschrieben wird.
 *  · `tokenHash` (128, Default '') — sha256 hex ist 64 Zeichen; 128 lässt
 *    Platz für ein längeres Verfahren, ohne je wieder eine Migration zu
 *    kosten. '' heisst „kein offener Link" und ist der NORMALFALL einer
 *    bestätigten Zeile: das Bestätigen LÖSCHT den Hash, damit ein
 *    weitergeleiteter Link tot ist.
 *  · `tokenExpiresAt` (32, Default '') — ISO-Zeitstempel, 24 Stunden ab
 *    Versand. VARCHAR und nicht `datetime`, weil die Routen ihn LEEREN statt
 *    ihn zu nullen (dieselbe Begründung wie brand-015): '' und `null`
 *    nebeneinander wären zwei Wörter für „kein offener Link". Verglichen wird
 *    im Code (`Date.parse`), nie in einer Abfrage.
 *  · `confirmedAt` (32, Default '') — seit wann diese Adresse bestätigt ist.
 *    Sie ist die EINE Kennzahl aus §9.7 („bestätigte Eintragungen je Woche");
 *    die unbestätigte Zahl wird nie berichtet, sie ist keine.
 *  · `unsubscribedAt` (32, Default '') — seit wann abgemeldet. Die Zeile
 *    bleibt als Nachweis „hat eingewilligt und sich abgemeldet".
 *  · `source` (64, Default '') — WO der Eintrag entstand ('list',
 *    'post:<slug>'). Freier String statt Aufzählung: eine neue Stelle soll
 *    eine Zeile im Markup sein, keine Migration. Er ist die Zahl, die später
 *    sagt, welches Format Leser bringt (§9.7).
 *  · `ipHash` (64, Default '') — NUR für den Deckel, sha256 mit Tages-Salz,
 *    nie die rohe IP (wörtlich wie `insights_corrections.ipHash`).
 *
 * ── UND EINE SPALTE, DIE §9.3a NICHT NENNT: `retentionAt` ───────────────
 * Eine Frist ohne Mechanik ist nur ein Satz (die Lehre aus `brand_events`, wo
 * die 24 Monate ein Jahr lang im Migrationskopf standen und der Sweep
 * fehlte). Diese Tabelle hat deshalb dieselbe Vorrichtung wie
 * `insights_corrections`: der Zeitpunkt, AB DEM die personenbezogenen Felder
 * geleert werden, steht BEIM ABMELDEN als Datum IN der Zeile
 * (`insightsNewsletterRetentionAt`, Frist als EINE Konstante
 * `INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS = 365` in
 * `shared/insightsNewsletter.ts`). Zwei Gewinne, beide gemessen am
 * Alternativ-Entwurf „über `$updatedAt` rechnen":
 *  1. Der Sweep braucht keinen Kalender, nur einen Vergleich — und sein
 *     Lesepfad ist der INDEX `idx_retention` statt eines Scans über alle
 *     Zeilen.
 *  2. Ein späterer Wechsel der Frist verlängert NICHT rückwirkend, was schon
 *     zugesagt wurde.
 * Sie ist ein echtes `datetime` (nicht varchar 32 wie die drei Stempel
 * darüber), und das ist der EINE bewusste Unterschied zu §9.3a: der Sweep
 * FRAGT über sie ab (`lessThanEqual`) und NULLT sie beim Leeren. Ein leerer
 * String wäre lexikografisch kleiner als jedes Datum — jede schon geleerte
 * Zeile bliebe damit für immer fällig, füllte mit `SWEEP_BATCH` = 200 jeden
 * Stapel, und jede neu fällige Zeile dahinter würde nie mehr erreicht. Genau
 * dieser Fehler ist in I1 einmal passiert (OPEN-ITEMS-COMPLETE „BI1 I1"); mit
 * `datetime` + `null` fällt eine geleerte Zeile aus der Abfrage heraus.
 *
 * ── DREI INDIZES, EINER DAVON UNIQUE ────────────────────────────────────
 *  · `uq_email_lower` (UNIQUE) — Lesepfad JEDES Eintrags („gibt es die
 *    Adresse schon?") UND die Garantie, dass zwei gleichzeitige Anfragen
 *    derselben Adresse keine Dublette bauen. Die Vorab-Abfrage allein wäre ein
 *    Rennen; der Index ist die Wahrheit, die 409 ihre saubere Antwort.
 *  · `idx_confirmed_at` — zwei Leser: der Versand in I5b („wer hat
 *    bestätigt?") und die erste Sweep-Regel („wer hat NICHT bestätigt?",
 *    `confirmedAt` = ''). Nicht unique: '' steht auf jeder wartenden Zeile.
 *  · `idx_retention` — der Lesepfad der zweiten Sweep-Regel (s. o.).
 * Einen Index auf `tokenHash` gibt es BEWUSST NICHT: der Bestätigungs-Weg
 * schlägt genau eine Zeile nach, und zwar über denselben Unique-Index wie der
 * Eintrag — die Mail trägt neben dem Token auch nichts, was eine zweite
 * Abfrage bräuchte. (Gesucht wird über `Query.equal('tokenHash', …)`; ohne
 * Index ist das ein Scan über eine Tabelle, die auf absehbare Zeit in die
 * Hunderte geht. Sollte sie wachsen, ist ein `idx_token_hash` eine
 * Ein-Zeilen-Migration — ein Index, den heute niemand braucht, ist
 * Schreiblast ohne Leser.)
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer insights
 *
 * Sie MUSS vor dem Code-Deploy laufen: die drei Routen schreiben bzw. lesen
 * die Spalten explizit, gegen ein altes Schema wäre das ein 400 aus Appwrite
 * (die Routen machen daraus 503 `storage_unavailable`).
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

const SUBSCRIBERS = 'insights_subscribers'

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

console.log(`Migration insights-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${SUBSCRIBERS}`, () => tablesDB.createTable({
  databaseId, tableId: SUBSCRIBERS, name: 'Insights Subscribers', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(SUBSCRIBERS)

  // Der Vergleichswert (kleingeschrieben) — trägt den UNIQUE-Index.
  await columnStep(`Column ${SUBSCRIBERS}.emailLower`, 'emailLower', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'emailLower', size: 256, required: true,
  }))
  // Dieselbe Adresse, wie sie eingetippt wurde — für die Anrede.
  await columnStep(`Column ${SUBSCRIBERS}.email`, 'email', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'email', size: 256, required: true,
  }))
  // Die Sprache der Mails (s. Kopf).
  await columnStep(`Column ${SUBSCRIBERS}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'locale', size: 8, required: false, xdefault: 'en',
  }))
  // Der sha256 des offenen Bestätigungs-Links — '' heisst „keiner offen".
  await columnStep(`Column ${SUBSCRIBERS}.tokenHash`, 'tokenHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'tokenHash', size: 128, required: false, xdefault: '',
  }))
  // Die Frist des Links (ISO). Varchar, weil die Routen sie LEEREN (s. Kopf).
  await columnStep(`Column ${SUBSCRIBERS}.tokenExpiresAt`, 'tokenExpiresAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'tokenExpiresAt', size: 32, required: false, xdefault: '',
  }))
  // Die EINE Kennzahl aus §9.7 — und der Filter des Versands in I5b.
  await columnStep(`Column ${SUBSCRIBERS}.confirmedAt`, 'confirmedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'confirmedAt', size: 32, required: false, xdefault: '',
  }))
  // Abgemeldet — die Zeile bleibt als Nachweis stehen (s. Kopf).
  await columnStep(`Column ${SUBSCRIBERS}.unsubscribedAt`, 'unsubscribedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'unsubscribedAt', size: 32, required: false, xdefault: '',
  }))
  // WO der Eintrag entstand (s. Kopf) — frei, nicht aufgezählt.
  await columnStep(`Column ${SUBSCRIBERS}.source`, 'source', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'source', size: 64, required: false, xdefault: '',
  }))
  // Nur für den Deckel — sha256 mit Tages-Salz, nie die rohe IP (s. Kopf).
  await columnStep(`Column ${SUBSCRIBERS}.ipHash`, 'ipHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'ipHash', size: 64, required: false, xdefault: '',
  }))
  // Ab hier werden `email`, `emailLower` und `ipHash` geleert. `datetime` und
  // nicht varchar — der Sweep fragt darüber ab und NULLT sie (s. Kopf).
  await columnStep(`Column ${SUBSCRIBERS}.retentionAt`, 'retentionAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: SUBSCRIBERS, key: 'retentionAt', required: false,
  }))

  await waitForColumns(SUBSCRIBERS)

  // Lesepfad JEDES Eintrags UND die Dubletten-Garantie in einem (s. Kopf).
  await indexStep(`Index ${SUBSCRIBERS}.uq_email_lower`, {
    tableId: SUBSCRIBERS, key: 'uq_email_lower', type: TablesDBIndexType.Unique, columns: ['emailLower'],
  })
  // Zwei Leser: der Versand (I5b) und die erste Sweep-Regel. NICHT unique.
  await indexStep(`Index ${SUBSCRIBERS}.idx_confirmed_at`, {
    tableId: SUBSCRIBERS, key: 'idx_confirmed_at', type: TablesDBIndexType.Key, columns: ['confirmedAt'],
  })
  // Der Lesepfad der zweiten Sweep-Regel (12-Monats-Frist).
  await indexStep(`Index ${SUBSCRIBERS}.idx_retention`, {
    tableId: SUBSCRIBERS, key: 'idx_retention', type: TablesDBIndexType.Key, columns: ['retentionAt'],
  })
}

console.log('✔ Migration insights-006 fertig')
