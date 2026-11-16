import '../../../scripts/lib/assert-target.mjs'
import { Client, Query, Storage, TablesDB } from 'node-appwrite'
import { RETENTION_DAYS, evidenceDue } from './lib/reportEvidenceRule.mjs'

/**
 * ZÄHLT DEN BESTAND GEMELDETER PRIVATER NACHRICHTEN (SEC-033) — NUR LESEND.
 *
 * Wozu: bevor der Lösch-Lauf (`server/utils/reportEvidenceSweep.ts`) auf
 * `apply` gestellt wird, braucht es eine gezählte Zahl. Dieses Skript gibt
 * NUR ZAHLEN aus — keine Ids, keine Texte, keine Namen — und schreibt nichts.
 *
 *   node --env-file=<env-datei> packages/messages/scripts/report-evidence-count.mjs
 *
 * Gegen einen entfernten Endpunkt verlangt die Ziel-Prüfung
 * `PUKALANI_TARGET_CONFIRM=<Projekt-Id>` (scripts/lib/target.mjs).
 *
 * Schlüssel wie `scripts/ops/erasure-backfill.mjs`: `NUXT_APPWRITE_MIGRATIONS_KEY`,
 * sonst `NUXT_APPWRITE_KEY`. Er braucht `rows.read` und — für die letzte
 * Zeile — `files.read`; fehlt das zweite, steht dort „nicht lesbar".
 *
 * DIE REGEL steht als Kopie in `./lib/reportEvidenceRule.mjs` (ein `.mjs`
 * liest kein TypeScript ohne Build); ein Test hält Kopie und Original an
 * denselben Fällen fest.
 */

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const gdprBucket = process.env.NUXT_PUBLIC_APPWRITE_GDPR_BUCKET || 'gdpr-exports'

/** Nur in der Community der Nachricht fragen (wie der moderation-Vertrag). */
function communityScope(communityId) {
  return communityId
    ? [Query.equal('communityId', communityId)]
    : [Query.or([Query.equal('communityId', ''), Query.isNull('communityId')])]
}

async function reportState(tablesDB, communityId, messageId) {
  const base = [Query.equal('targetType', 'message'), Query.equal('targetId', messageId), ...communityScope(communityId)]
  const [open, closed] = await Promise.all([
    tablesDB.listRows({ databaseId, tableId: 'reports', queries: [...base, Query.equal('status', 'open'), Query.limit(1)] }),
    tablesDB.listRows({ databaseId, tableId: 'reports', queries: [...base, Query.notEqual('status', 'open'), Query.orderDesc('$updatedAt'), Query.limit(1)] }),
  ])
  return { open: open.total, closed: closed.total, lastClosedAt: closed.rows[0]?.$updatedAt ?? '' }
}

async function main() {
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    console.error('✗ Env unvollständig — Aufruf mit --env-file=<env-datei>')
    process.exit(1)
  }
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  const tablesDB = new TablesDB(client)
  const storage = new Storage(client)
  const now = new Date()

  const counts = { reported: 0, withText: 0, closedWithText: 0, due: 0, unreadable: 0 }
  let after = null
  while (true) {
    const { rows } = await tablesDB.listRows({
      databaseId,
      tableId: 'messages',
      queries: [
        Query.notEqual('reportedAt', ''),
        Query.orderAsc('$sequence'),
        Query.limit(100),
        ...(after ? [Query.cursorAfter(after)] : []),
      ],
    })
    for (const row of rows) {
      after = row.$id
      counts.reported += 1
      const reportedBody = row.reportedBody ?? ''
      if (reportedBody === '') continue
      counts.withText += 1
      let state
      try {
        state = await reportState(tablesDB, row.communityId ?? '', row.$id)
      }
      catch {
        counts.unreadable += 1
        continue
      }
      if (state.open > 0) continue
      counts.closedWithText += 1
      if (evidenceDue({ reportedBody, reportedAt: row.reportedAt ?? '', ...state }, now)) counts.due += 1
    }
    if (rows.length < 100) break
  }

  let bucketLine
  try {
    const files = await storage.listFiles({ bucketId: gdprBucket, queries: [Query.limit(1)] })
    bucketLine = String(files.total)
  }
  catch {
    bucketLine = 'nicht lesbar'
  }

  console.log(`Gemeldete Nachrichten gesamt:          ${counts.reported}`)
  console.log(`  mit gespeichertem Text:              ${counts.withText}`)
  console.log(`  davon ohne offene Meldung:           ${counts.closedWithText}`)
  console.log(`  davon fällig (älter als ${RETENTION_DAYS} Tage):    ${counts.due}`)
  if (counts.unreadable > 0) console.log(`  Meldungs-Stand nicht lesbar:         ${counts.unreadable}`)
  console.log(`Dateien im Bucket der Lösch-Kopien:    ${bucketLine}`)
}

await main()
