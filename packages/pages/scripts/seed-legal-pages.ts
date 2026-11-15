/**
 * Rechtsseiten-Vorlagen einer SILO-INSTANZ anlegen (Impressum + Datenschutz).
 *
 * GILT FÜR JEDE Silo-Instanz mit dem Produkt `pages` — nicht nur für
 * `portfolio`, wo es entstanden ist. Deshalb wohnt es seit dem Review hier im
 * pages-Layer, neben `seed-demo.mjs`: eine App darf keinen Layer besitzen, und
 * ein Skript, das ausschließlich die Vorlagen DIESES Layers ausrollt, ist
 * Layer-Sache. Die nächste Silo-Site erbt es damit, statt es zu kopieren.
 *
 * Das Pool-Nachrüst-Skript (packages/control/scripts/backfill-legal-templates.mjs)
 * überspringt Silo-Instanzen bewusst — es hat für deren eigene Appwrite-Projekte
 * keinen Schlüssel. Dieses Skript ist das Silo-Gegenstück: dieselben Vorlagen
 * (packages/pages/shared/legalTemplates.ts, EINE Quelle), dieselben Regeln:
 *
 *  - ENTWURF, nie veröffentlicht — ein Rechtstext voller Platzhalter darf die
 *    öffentliche Route nicht verlassen; gefüllt und veröffentlicht wird im
 *    Dashboard (/dashboard/pages).
 *  - IDEMPOTENT je slug+locale: vorhandene Zeilen (auch Kundentexte) bleiben
 *    unberührt, ein 409 aus einem Wettlauf gilt als „schon da".
 *  - KEIN communityId-Stempel: im Silo läuft die Datentür ungescopt, die
 *    Dashboard-Routen stempeln hier ebenfalls nichts. Für eine POOL-Instanz
 *    ist es damit das falsche Werkzeug — dort gilt die Pflicht-Entscheidung
 *    `--community` (Muster `seed-demo.mjs` nebenan).
 *
 * Aufruf — IMMER mit der `.env` der Ziel-App (die Env sagt, welche Instanz
 * gemeint ist; ohne sie bricht das Skript unten ab):
 *   pnpm --filter portfolio seed:legal   # gegen apps/portfolio/.env
 *   # andere Instanz (z. B. Prod): node --experimental-strip-types \
 *   #   --env-file=<pfad> packages/pages/scripts/seed-legal-pages.ts
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, ID, Query, TablesDB } from 'node-appwrite'
import { LEGAL_TEMPLATE_LOCALES, legalTemplates } from '../shared/legalTemplates.ts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY ?? process.env.NUXT_APPWRITE_MIGRATIONS_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — NUXT_PUBLIC_APPWRITE_{ENDPOINT,PROJECT_ID,DATABASE_ID} + NUXT_APPWRITE_KEY setzen (--env-file).')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

console.log(`Rechtsseiten-Vorlagen anlegen — ${projectId} @ ${endpoint}`)

let created = 0
let skipped = 0

for (const locale of LEGAL_TEMPLATE_LOCALES) {
  for (const template of legalTemplates(locale)) {
    const existing = await tablesDB.listRows({
      databaseId,
      tableId: 'pages',
      queries: [
        Query.equal('slug', template.slug),
        Query.equal('locale', locale),
        Query.limit(1),
      ],
    })
    if (existing.rows[0]) {
      console.log(`↷ ${template.slug} (${locale}) existiert — unberührt`)
      skipped++
      continue
    }

    try {
      await tablesDB.createRow({
        databaseId,
        tableId: 'pages',
        rowId: ID.unique(),
        data: {
          slug: template.slug,
          locale,
          title: template.title,
          body: template.body,
          status: 'draft',
          sortOrder: template.sortOrder,
        },
      })
      console.log(`✔ ${template.slug} (${locale}) als Entwurf angelegt`)
      created++
    }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 409) {
        console.log(`↷ ${template.slug} (${locale}) — 409, Wettlauf: schon da`)
        skipped++
        continue
      }
      throw error
    }
  }
}

console.log(`\nFertig: ${created} angelegt, ${skipped} übersprungen.`)
