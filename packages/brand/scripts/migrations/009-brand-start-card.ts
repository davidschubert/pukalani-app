/**
 * Migration brand-009: die STARTKARTE bekommt ihre vier Spalten
 * (`websiteUrl`, `industry`, `about`, `audience` auf `brand_profiles`).
 *
 * ── WARUM SIE IN 001 FEHLTEN ──────────────────────────────────────────────
 * Der Schema-Anhang §1 beschreibt den Profil-Kopf als ANLAGE-Daten (Pfad,
 * Weichen, Sprache, Titel). Die STARTKARTE steht nur in der Content-Spec §2.1
 * — vier Felder, „Mehr erhebt Schritt 0 NICHT" — und war bis heute reine
 * Spezifikation: keine Spalte, kein Formularfeld, kein Wert im Prompt.
 *
 * Sichtbar wurde die Lücke mit P2.2: Bausteine A's Slots haben laut Registry
 * KEINE `dependencies`, weil sie aus der Startkarte schöpfen. Ohne diese
 * Spalten bekam George also buchstäblich nichts — `formatDependencies([])`
 * schrieb ihm „(no earlier answers were handed to you)" in den Prompt, und der
 * erste Entwurf einer neuen Marke entstand aus Pfad und Sprache allein.
 *
 * ── ADDITIV, ALLE VIER MIT '' ─────────────────────────────────────────────
 * `required: false` + `xdefault: ''` für JEDE der vier — auch für die drei, die
 * das FORMULAR als Pflicht erhebt. Das ist kein Widerspruch, sondern die
 * Trennung von Spalte und Erhebung: es gibt BESTANDS-Zeilen (Davids Profil),
 * die vor dieser Migration angelegt wurden, und für die ist '' die einzige
 * wahre Auskunft. Die Pflicht lebt deshalb im Zod-Schema der Anlage-Route
 * (`createBrandProfileCreateSchema`), nicht in der Spalte — dieselbe Bauart wie
 * bei `title`.
 *
 * Die Regel aus CLAUDE.md gilt unverändert: diese Migration MUSS vor dem
 * Code-Deploy laufen, sonst bricht das ANLEGEN eines Profils (die Anlage-Route
 * schreibt die vier Felder explizit).
 *
 * ── VARCHAR, NICHT MEDIUMTEXT — UND ZWAR WEGEN DES DEFAULTS ───────────────
 * `about` sind zwei bis drei Sätze; 2.000 Zeichen sind dafür grosszügig und
 * genau der Deckel, den die Registry für ihre KURZEN Slots setzt (`SHORT`).
 * MEDIUMTEXT wäre für so wenig Text nicht nur unnötig (das ~65-KB-Zeilenbudget
 * von MariaDB trägt die vier Spalten locker), sondern schädlich: MariaDB
 * erlaubt auf TEXT-Spalten KEINEN Default (s. Kopf von brand-001, `storyBody`),
 * und ohne Default läse eine Bestands-Zeile `undefined` statt ''.
 *
 * Grössen: websiteUrl 256 · industry 120 · about 2.000 · audience 500. Dieselben
 * Zahlen stehen als Zod-Deckel in `packages/brand/schemas/brandProfile.ts`; wer
 * eine ändert, ändert beide.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Nach keinem der vier Felder wird je gefiltert oder sortiert — sie werden mit
 * dem Profil gelesen und wandern in Georges Prompt. Ein Index darauf wäre
 * Schreiblast ohne Leser (dieselbe Begründung wie bei brand-008).
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
const PROFILES = 'brand_profiles'

/** Spaltenname → Grösse. Die Reihenfolge ist die der Startkarte (§2.1). */
const START_CARD_COLUMNS: readonly { key: string, size: number }[] = [
  { key: 'websiteUrl', size: 256 },
  { key: 'industry', size: 120 },
  { key: 'about', size: 2_000 },
  { key: 'audience', size: 500 },
]

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

console.log(`Migration brand-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  for (const column of START_CARD_COLUMNS) {
    const label = `Column ${PROFILES}.${column.key}`
    if (cols.has(column.key)) {
      console.log(`↷ ${label} (existiert bereits)`)
      continue
    }
    try {
      await tablesDB.createVarcharColumn({
        databaseId,
        tableId: PROFILES,
        key: column.key,
        size: column.size,
        required: false,
        xdefault: '',
      })
      console.log(`✔ ${label}`)
    }
    catch (error) {
      if (hasCode(error, 409)) console.log(`↷ ${label} (existiert bereits)`)
      else throw error
    }
  }
}

console.log('✔ Migration brand-009 fertig')
