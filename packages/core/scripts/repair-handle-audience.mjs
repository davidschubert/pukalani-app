/**
 * Bestands-Reparatur: nicht gedeckte Lese-Publika aus `account_handles` nehmen.
 *
 * ── WARUM ES DAS GIBT ──────────────────────────────────────────────────────
 * Bis zum 2026-08-12 stempelte die ANLAGE eines Konto-Namens das Publikum des
 * gerade besuchten Hosts mit (`ensureAccountHandle` →
 * `accountHandlePermissions(pool, communityId, …)`), und die Umbenennung
 * vergab es ein zweites Mal. Beide fragten NICHT nach Zugehörigkeit — das Gate
 * in `handle.get.ts` greift erst NACH dem Anlegen. Wer also die Kontoseite auf
 * einem fremden Mandanten-Host öffnete, bekam dessen `read("label:<id>")` in
 * seine Zeile und stand danach im Erwähnungs-Menü einer Community, zu der er
 * nie gehört hat. Der Code ist gefixt (die Anlage stempelt kein Label mehr,
 * die Umbenennung erbt nur noch, `ensureAccountHandleAudience` ist der einzige
 * Schreiber) — die ZEILEN von damals tragen ihr falsches Publikum aber weiter.
 * Gefunden von `verify-handle-search-boundary.mjs` (Gegenprobe 2026-08-12).
 *
 * ── WAS ER TUT ─────────────────────────────────────────────────────────────
 * Für JEDE Zeile in `account_handles` (Pool-Projekt) wird JEDES
 * `read("label:<communityId>")` gegen die Wahrheit im CONTROL PLANE geprüft:
 * gibt es dort eine `community_members`-Zeile für dieses Konto in dieser
 * Community MIT ZUGANG? Die Zugangs-Frage ist bewusst NICHT nachgebaut,
 * sondern wörtlich `hasCommunityAccess` aus
 * `packages/control/shared/communityTeam.ts`: `status === 'active'`.
 * Ein `!== 'removed'` wäre die falsche, weichere Regel — 'invited' und
 * 'suspended' haben KEINEN Zugang, und ein Reparatur-Skript, das zu wenig
 * entfernt, lässt genau die Lücke stehen, die es schließen soll.
 *
 * NICHT ANGETASTET werden `read("user:…")` (der Besitzer-Read steht in jeder
 * Zeile) und `read("users")` (Silo/Single-Tenant — dort ist das Projekt die
 * Grenze, ein Label wäre Zeremonie). Entfernt wird ausschließlich ein
 * `label:`-Read ohne Deckung; hinzugefügt wird NIE etwas — ein fehlendes
 * Publikum heilt der nächste Besuch über `ensureAccountHandleAudience`.
 *
 * ── TROCKEN IST DIE VOREINSTELLUNG ─────────────────────────────────────────
 * Ohne `--apply` wird NICHTS geschrieben. Das ist Absicht: der Lauf entfernt
 * Lese-Rechte, und die Gegenrichtung (versehentlich zu viel entfernt) macht
 * Menschen in Erwähnungs-Menüs unsichtbar, bis sie dort wieder auftauchen.
 * Erst lesen, was er vorhat, dann `--apply`.
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/core/scripts/repair-handle-audience.mjs            # trocken
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/core/scripts/repair-handle-audience.mjs --apply    # schreibt
 *
 * `--json` gibt die Befunde maschinenlesbar aus (für ein Protokoll).
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'

const APPLY = process.argv.includes('--apply')
const AS_JSON = process.argv.includes('--json')

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig, Rest aus apps/control/.env).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

const HANDLES_TABLE = 'account_handles'
const MEMBERS_TABLE = 'community_members'
const PAGE = 100

/** Wörtlich `hasCommunityAccess` (control/shared/communityTeam.ts). */
const hasCommunityAccess = status => status === 'active'

/** `read("label:<id>")` → `<id>`, alles andere → null. */
function labelOf(permission) {
  const match = /^read\("label:(.+)"\)$/.exec(permission)
  return match ? match[1] : null
}

/** Alle Zeilen einer Tabelle, seitenweise (Cursor statt offset). */
async function allRows(db, dbId, tableId, queries = []) {
  const out = []
  let cursor = null
  for (;;) {
    const page = await db.listRows({
      databaseId: dbId,
      tableId,
      queries: [...queries, Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    out.push(...page.rows)
    if (page.rows.length < PAGE) break
    cursor = page.rows[page.rows.length - 1].$id
  }
  return out
}

async function main() {
  console.log(APPLY ? '● Modus: SCHREIBEND (--apply)' : '● Modus: trocken (ohne --apply wird nichts geschrieben)')

  // 1. Die WAHRHEIT: wer gehört wohin? Einmal komplett laden statt N+1 über
  //    die Projektgrenze — die Zeilen sind klein und der Lauf ist einmalig.
  const members = await allRows(control, databaseId, MEMBERS_TABLE)
  const access = new Set()
  for (const member of members) {
    if (member.runtimeProjectId !== poolProject) continue
    if (!hasCommunityAccess(member.status)) continue
    access.add(`${member.communityId}:${member.runtimeUserId}`)
  }
  console.log(`  Mitgliedschaften im Control Plane: ${members.length} gesamt, ${access.size} mit Zugang in '${poolProject}'`)

  // 2. Jede Handle-Zeile gegen diese Wahrheit halten.
  const handles = await allRows(pool, poolDatabaseId, HANDLES_TABLE)
  const findings = []
  let labelsTotal = 0

  for (const row of handles) {
    const permissions = row.$permissions ?? []
    const strip = []
    for (const permission of permissions) {
      const communityId = labelOf(permission)
      if (!communityId) continue
      labelsTotal++
      if (!access.has(`${communityId}:${row.userId}`)) strip.push(permission)
    }
    if (strip.length) {
      findings.push({
        rowId: row.$id,
        handle: row.handle,
        userId: row.userId,
        status: row.status,
        strip,
        keep: permissions.filter(p => !strip.includes(p)),
      })
    }
  }

  const stripCount = findings.reduce((sum, f) => sum + f.strip.length, 0)

  if (AS_JSON) console.log(JSON.stringify(findings, null, 2))
  else {
    for (const f of findings) {
      console.log(`  @${f.handle} (${f.status}, ${f.rowId}) — ungedeckt: ${f.strip.join(', ')}`)
    }
  }

  console.log(`\n${handles.length} Zeilen, ${labelsTotal} Label-Reads geprüft, ${stripCount} zu entfernende Labels in ${findings.length} Zeilen.`)

  if (!APPLY) {
    console.log('Trockenlauf — nichts geschrieben. Mit --apply ausführen, wenn die Liste stimmt.')
    return
  }
  if (!stripCount) {
    console.log('Nichts zu tun.')
    return
  }

  let written = 0
  for (const f of findings) {
    // Nur die Permissions anfassen — Daten bleiben unberührt.
    await pool.updateRow({
      databaseId: poolDatabaseId,
      tableId: HANDLES_TABLE,
      rowId: f.rowId,
      permissions: f.keep,
    })
    written++
  }
  console.log(`✔ ${written} Zeilen bereinigt.`)
}

main().catch((error) => {
  console.error('✗ Abgebrochen:', error?.message ?? error)
  process.exit(1)
})
