#!/usr/bin/env node
/**
 * Seed: der LAUNCH-INHALT von Brand Insights, Stufe 1 (BI1 I6,
 * docs/plans/BRAND-INSIGHTS.md §9.8).
 *
 * WOZU: Die Mengen-Bremse aus Entscheidung 1 sagt „kein Format geht live,
 * bevor es EINEN vollständig redigierten Beispiel-Beitrag hat". Dieses Skript
 * legt genau diese vier an — ein Markenprofil (Nike), ein Duell (adidas vs.
 * Nike), einen Artikel (IKEA) und ein Ranking (Ausgabe 1) — samt den sechs
 * Marken-Zeilen, die sie nennen (Prüfregel 6: jede genannte Marke hat eine
 * Zeile). Die INHALTE stehen getrennt unter `launch/` als reine Daten; dieses
 * Skript kennt sie nur über `LAUNCH_BRANDS` / `LAUNCH_POSTS`.
 *
 * WARUM ALLES ALS ENTWURF: Nichts geht ohne Davids Zeichen live (§3.2 — der
 * Zustand ist die Sicherung, nicht die Disziplin). Marken-Zeilen entstehen als
 * `draft`, Beiträge als `draft`; die Übersetzung trägt
 * `translationReviewed: false`, ist also selbst nach einer Freigabe nicht
 * öffentlich, bis jemand sie redigiert hat. Den Weg nach `review` geht die
 * Redaktion im Dashboard — dort läuft das volle Gate MIT Beleg-Abruf.
 *
 * IDEMPOTENT über den `slug` (Unique-Index `uq_slug` in beiden Tabellen):
 *  · fehlt die Zeile ⇒ anlegen;
 *  · steht sie als `draft` da ⇒ Inhalt aktualisieren, die Felder der
 *    Redaktion und des Servers bleiben (`LAUNCH_KEPT_*` in `launch-check.mjs`:
 *    Zustand, Freigabe-Stempel, Übersetzungs-Herkunft, Brief, Slug-Historie);
 *    ändert sich nichts, wird nicht geschrieben;
 *  · `review`/`published`/`updated` bzw. eine Marke `published`/`removed` ⇒
 *    NICHT anfassen, nur melden — was jemand freigegeben hat, überschreibt
 *    kein Seed;
 *  · gehört der Slug einem Beitrag eines ANDEREN Formats ⇒ melden, nicht
 *    anfassen.
 * Verweise stehen im Inhalt als Marken-SLUGS und werden hier zu Ids. Neue
 * Zeilen bekommen ihre Id schon beim PLANEN (`ID.unique()` hier statt beim
 * Anlegen) — damit stehen `relations`, `brandRefs` und Ranking-Plätze fest,
 * bevor geschrieben wird, und ein zweiter Schreib-Durchgang für die
 * Beziehungen entfällt (`relations` ist JSON, kein Fremdschlüssel; die
 * Reihenfolge des Anlegens spielt keine Rolle).
 *
 * VOR JEDEM SCHREIBEN: Schema (`insightsBrandSchema` / `insightsPostSchema`)
 * und die sechs Prüfregeln (`insightsReviewIssues`) ohne Quelltexte, mit dem
 * Namensfilter über ALLE Marken-Zeilen der Instanz. Der Lauf plant zuerst
 * alles, prüft alles und schreibt erst dann — ein Treffer bricht ab, bevor die
 * erste Zeile entsteht. Der Beleg-Abruf (steht das Zitat wörtlich auf der
 * Seite?) bleibt dem Server-Gate vorbehalten (s. Kopf von `launch-check.mjs`).
 *
 * WARUM DIE RANKING-SCORES AUS `brand_checks` KOMMEN: Entscheidung 7 — „eine
 * Zahl je Marke, dieselbe wie im Produkt", und §2.4: die Liste speist sich
 * „ausschliesslich" aus Brand-Check-Scores. Eine Zahl von Hand wäre eine
 * zweite Skala. Gelesen wird wie in `findBrandCheckForUrl` (brand-Layer):
 * die JÜNGSTE Zeile zum `urlKey` der Homepage, und ist DIE ausgeblendet, gilt
 * die Marke als ungeprüft — derselbe Befund wie auf der öffentlichen
 * Profilseite. Fehlt ein Check, steht der Platz mit Score 0 da, die Marke
 * wird gemeldet und an `noteInternal` angehängt (lokal der Normalfall).
 *
 * DER EINE QUER-IMPORT: `brandCheckUrlKey` aus `packages/brand/shared/
 * brandCheck.ts`. Der Layer greift sonst nur über `server/contracts/
 * brandContract.ts` in den brand-Layer — aber das ist eine Nitro-Datei (sie
 * zieht den SSRF-festen Abruf samt Auto-Imports), und ein Skript hat kein
 * Nitro. `brandCheckUrlKey` ist eine pure Funktion ohne Laufzeit-Abhängigkeit;
 * sie zu importieren statt abzuschreiben hält den Schlüssel EINE Wahrheit.
 * ESLint erlaubt `insights → brand` ausdrücklich.
 *
 * Aufruf lokal (Dev-Projekt aus apps/branding/.env):
 *   pnpm --filter @pukalani/insights seed:launch [--dry-run] [--only <slug>]
 * Aufruf Produktion — NUR mit Davids Ja, mit der Prod-Migrations-Env von
 * branding:
 *   node --env-file=<prod-env> packages/insights/scripts/seed-launch.mjs
 *
 * `--dry-run` liest die Instanz, plant und prüft, schreibt nichts.
 * `--only <slug>` beschränkt auf einen Beitrag oder eine Marke (Marken-Slug
 * ODER Beitrags-Slug); die Marken, die ein Beitrag braucht, müssen dann schon
 * existieren oder werden mitgeplant, aber nur der genannte Slug wird geschrieben.
 */
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Client, ID, Query, TablesDB } from 'node-appwrite'
import { LAUNCH_BRANDS, LAUNCH_POSTS } from './launch/index.mjs'

/**
 * Der Layer-Quelltext importiert OHNE Dateiendung (Bundler-Auflösung), Node
 * in ESM kennt das nicht. Derselbe Schritt wie in
 * `packages/events/scripts/verify-paid-ticket.mjs`: relative Endungslose
 * zeigen auf `.ts`. So läuft der ECHTE Vertrag, keine Nachbildung. Die
 * TS-Module werden deshalb erst NACH dem Hook dynamisch geladen.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.startsWith('file:')) {
      const abs = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
      for (const candidate of [`${abs}.ts`, `${abs}/index.ts`]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { launchBrandFromContent, launchFlaggedSentences, launchPostFromContent, launchPostIssues }
  = await import('./launch-check.mjs')
const { fromInsightsBrand, fromInsightsPost, toInsightsBrand, toInsightsPost, INSIGHTS_BRANDS_TABLE, INSIGHTS_POSTS_TABLE }
  = await import('../shared/insightsRows.ts')
const { brandCheckUrlKey } = await import('../../brand/shared/brandCheck.ts')
const { brandPublicationSlug } = await import('../../brand/shared/brandPublication.ts')

const BRAND_CHECKS_TABLE = 'brand_checks'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<branding-.env> aufrufen.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? '') : ''
if (onlyIndex >= 0 && !only) {
  console.error('✗ --only braucht einen Slug.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

/** Heute als YYYY-MM-DD — der Stand des Rankings ist der Tag, an dem die Scores gelesen wurden. */
const today = new Date().toISOString().slice(0, 10)

// ── Inhalt gegen sich selbst ────────────────────────────────────────────────

for (const brand of LAUNCH_BRANDS) {
  if (brandPublicationSlug(brand.name) !== brand.slug) {
    console.error(`✗ Marke ${brand.name}: Slug „${brand.slug}" ≠ brandPublicationSlug („${brandPublicationSlug(brand.name)}").`)
    process.exit(1)
  }
}
if (only && !LAUNCH_BRANDS.some(b => b.slug === only) && !LAUNCH_POSTS.some(p => p.slug === only)) {
  console.error(`✗ --only ${only}: kein Slug im Launch-Inhalt.`)
  process.exit(1)
}

// ── Lesen ───────────────────────────────────────────────────────────────────

async function findBySlug(tableId, slug) {
  const res = await tablesDB.listRows({ databaseId, tableId, queries: [Query.equal('slug', slug), Query.limit(1)] })
  return res.rows[0] ?? null
}

/** Alle Marken-Zeilen der Instanz — der Namensfilter prüft gegen JEDE (wie das Gate). */
async function allBrandRows() {
  const rows = []
  let cursor = null
  for (;;) {
    const queries = [Query.limit(100), Query.orderAsc('$id')]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await tablesDB.listRows({ databaseId, tableId: INSIGHTS_BRANDS_TABLE, queries })
    rows.push(...res.rows)
    if (res.rows.length < 100) return rows
    cursor = res.rows[res.rows.length - 1].$id
  }
}

/** Wie `findBrandCheckForUrl`: die jüngste Zeile, ausgeblendet ⇒ keine. */
async function latestBrandCheck(homepage) {
  const urlKey = brandCheckUrlKey(homepage)
  if (!urlKey) return null
  try {
    const res = await tablesDB.listRows({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [Query.equal('urlKey', urlKey), Query.orderDesc('$createdAt'), Query.limit(1)],
    })
    const row = res.rows[0]
    if (!row || row.hidden === true) return null
    return { checkId: row.$id, score: row.score ?? 0 }
  }
  catch (error) {
    console.warn(`  ⚠ brand_checks nicht lesbar (${error?.code ?? '?'}) — Score 0 für ${homepage}`)
    return null
  }
}

/** Ein JSON-Vergleich der Spalten — „nichts geändert" schreibt nicht. */
function sameRow(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── 1. Marken planen ─────────────────────────────────────────────────────────

const dbBrandRows = await allBrandRows()
/** slug → { id, row|null, content, action, brand } */
const brandPlan = new Map()
for (const content of LAUNCH_BRANDS) {
  const row = dbBrandRows.find(r => r.slug === content.slug) ?? null
  const id = row ? row.$id : ID.unique()
  let action = row ? (row.state === 'draft' ? 'update' : 'skip') : 'create'
  if (only && only !== content.slug && action !== 'skip') action = row ? 'keep' : 'create-needed'
  brandPlan.set(content.slug, { id, row, content, action })
}

// Relationen erst, wenn alle Ids feststehen (neue Zeilen haben vorab eine).
for (const plan of brandPlan.values()) {
  if (plan.action === 'skip' || plan.action === 'keep') continue
  const relations = plan.content.relationSlugs.map((slug) => {
    const target = brandPlan.get(slug) ?? (() => {
      const r = dbBrandRows.find(row => row.slug === slug)
      return r ? { id: r.$id } : null
    })()
    if (!target) throw new Error(`Marke ${plan.content.slug}: Beziehung „${slug}" hat keine Zeile.`)
    return target.id
  })
  plan.brand = launchBrandFromContent(plan.content, { relations, existing: plan.row ? toInsightsBrand(plan.row) : null })
}

/** Alle Marken-Zeilen, wie sie NACH dem Lauf dastehen — für Regel 4 und 6. */
const brandRowsAfter = [
  ...dbBrandRows
    .filter(row => ![...brandPlan.values()].some(plan => plan.id === row.$id))
    .map(row => ({ id: row.$id, name: row.name, homepage: row.homepage ?? '', state: row.state })),
  ...[...brandPlan.values()].map(plan => ({
    id: plan.id,
    name: plan.brand?.name ?? plan.row?.name ?? plan.content.name,
    homepage: plan.brand?.homepage ?? plan.row?.homepage ?? plan.content.homepage,
    state: plan.row?.state ?? 'draft',
  })),
]

function brandOf(slug) {
  const plan = brandPlan.get(slug)
  if (!plan) throw new Error(`Verweis auf „${slug}" — keine Marke im Launch-Inhalt.`)
  return { id: plan.id, libraryKey: plan.content.libraryKey }
}

// ── 2. Beiträge planen (inkl. Ranking-Scores) ─────────────────────────────────

const postPlan = []
for (const content of LAUNCH_POSTS) {
  if (only && only !== content.slug) continue
  const row = await findBySlug(INSIGHTS_POSTS_TABLE, content.slug)
  if (row && row.format !== content.format) {
    postPlan.push({ content, row, action: 'conflict' })
    continue
  }
  if (row && row.state !== 'draft') {
    postPlan.push({ content, row, action: 'skip' })
    continue
  }

  let rankingEntries = null
  let noteInternal = null
  if (content.ranking) {
    const scored = []
    const missing = []
    for (const [order, entry] of content.ranking.entries.entries()) {
      const brand = brandPlan.get(entry.brandSlug)
      const homepage = brand?.brand?.homepage ?? brand?.row?.homepage ?? brand?.content.homepage ?? ''
      const check = await latestBrandCheck(homepage)
      if (!check) {
        missing.push(entry.brandSlug)
        console.warn(`  ⚠ Brand-Check für ${homepage} fehlt — Score 0`)
      }
      scored.push({ order, entry, check })
    }
    // Score absteigend; Gleichstand behält die Reihenfolge des Inhalts.
    scored.sort((a, b) => (b.check?.score ?? 0) - (a.check?.score ?? 0) || a.order - b.order)
    rankingEntries = scored.map(({ entry, check }, index) => ({
      rank: index + 1,
      brandId: brandOf(entry.brandSlug).id,
      checkId: check?.checkId ?? '',
      score: check?.score ?? 0,
      reasonDe: entry.reasonDe,
      reasonEn: entry.reasonEn,
      removed: false,
    }))
    noteInternal = missing.length
      ? `${content.noteInternal} · Brand-Check fehlt: ${missing.join(', ')}`.slice(0, 500)
      : content.noteInternal
  }

  const post = launchPostFromContent(content, {
    brandOf,
    rankingEntries,
    asOf: today,
    noteInternal,
    existing: row ? toInsightsPost(row) : null,
  })
  postPlan.push({ content, row, post, action: row ? 'update' : 'create' })
}

// ── 3. Prüfen — ALLES, bevor irgendetwas geschrieben wird ─────────────────────

let blocked = false
for (const plan of postPlan) {
  if (!plan.post) continue
  const issues = launchPostIssues(plan.post, brandRowsAfter)
  if (issues.length) {
    blocked = true
    console.error(`✗ ${plan.content.slug}: ${issues.length} Prüfregel-Treffer`)
    for (const issue of issues) console.error(`    ${JSON.stringify(issue)}`)
    for (const sentence of launchFlaggedSentences(plan.post, brandRowsAfter)) console.error(`    ↳ „${sentence.slice(0, 160)}"`)
  }
}
if (blocked) {
  console.error('✗ Abbruch — nichts geschrieben.')
  process.exit(1)
}

// ── 4. Schreiben ──────────────────────────────────────────────────────────────

const tag = dryRun ? ' (dry-run)' : ''

for (const plan of brandPlan.values()) {
  const label = `Marke ${plan.content.slug}`.padEnd(58)
  if (plan.action === 'skip') {
    console.log(`– ${label} übersprungen (state=${plan.row.state})`)
    continue
  }
  if (plan.action === 'keep') {
    console.log(`· ${label} bestehend, nicht Teil von --only`)
    continue
  }
  const data = fromInsightsBrand(plan.brand)
  if (plan.row) {
    if (sameRow(data, fromInsightsBrand(toInsightsBrand(plan.row)))) {
      console.log(`= ${label} unverändert  ${plan.id}`)
      continue
    }
    if (!dryRun) await tablesDB.updateRow({ databaseId, tableId: INSIGHTS_BRANDS_TABLE, rowId: plan.id, data })
    console.log(`↷ ${label} aktualisiert${tag}  ${plan.id}`)
    continue
  }
  if (!dryRun) await tablesDB.createRow({ databaseId, tableId: INSIGHTS_BRANDS_TABLE, rowId: plan.id, data })
  console.log(`✔ ${label} angelegt${tag}  ${dryRun ? '(neue Id)' : plan.id}`)
}

for (const plan of postPlan) {
  const label = `${plan.content.format} ${plan.content.slug}`.padEnd(58)
  if (plan.action === 'conflict') {
    console.log(`– ${label} übersprungen (Slug gehört format=${plan.row.format}, ${plan.row.$id})`)
    continue
  }
  if (plan.action === 'skip') {
    console.log(`– ${label} übersprungen (state=${plan.row.state})`)
    continue
  }
  const data = fromInsightsPost(plan.post)
  if (plan.row) {
    if (sameRow(data, fromInsightsPost(toInsightsPost(plan.row)))) {
      console.log(`= ${label} unverändert  ${plan.row.$id}`)
      continue
    }
    if (!dryRun) await tablesDB.updateRow({ databaseId, tableId: INSIGHTS_POSTS_TABLE, rowId: plan.row.$id, data })
    console.log(`↷ ${label} aktualisiert${tag}  ${plan.row.$id}`)
    continue
  }
  const rowId = ID.unique()
  if (!dryRun) await tablesDB.createRow({ databaseId, tableId: INSIGHTS_POSTS_TABLE, rowId, data })
  console.log(`✔ ${label} angelegt${tag}  ${dryRun ? '(neue Id)' : rowId}`)
}

console.log(dryRun ? 'Dry-run — nichts geschrieben.' : 'Fertig — alles als Entwurf; Freigabe im Dashboard.')
