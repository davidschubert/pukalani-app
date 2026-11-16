#!/usr/bin/env node
/**
 * BE-015 — BESTAND ÜBERNEHMEN: jedes Konto, das heute eine Community besitzt,
 * hatte seine Testphase schon.
 *
 * Seit control-039 gibt es die Testphase einmal je Konto: eine Zeile in
 * `trial_claims` mit fester Id aus Projekt + Konto. Für Konten, die VOR der
 * Migration angelegt haben, fehlt diese Zeile — ohne Übernahme bekämen sie mit
 * der nächsten Community eine zweite Testphase. Dieses Skript legt die Zeile
 * für JEDES Konto mit einer `community_members`-Zeile `role: 'owner'` an (jeder
 * Status, auch entfernte und stillgelegte), mit:
 *
 *  - `source: 'adopted'`,
 *  - `communityId` der ÄLTESTEN Owner-Zeile dieses Kontos,
 *  - `claimedAt` = `$createdAt` genau dieser Zeile.
 *
 * Es schreibt NICHTS sonst: laufende Testphasen bleiben, wie sie sind
 * (`communities.trialEndsAt` wird nicht angefasst). Eine schon vorhandene Zeile
 * (409) wird gezählt, nicht überschrieben — ein zweiter Lauf ändert nichts.
 *
 * AUSGABE NUR ZAHLEN: gefundene Owner-Zeilen, verschiedene Konten, schon
 * vorhandene Zeilen, (anzulegende bzw.) angelegte Zeilen. Nie eine Adresse,
 * nie eine Konto-Id.
 *
 * ═══ AUFRUF ════════════════════════════════════════════════════════════
 *
 * Gegen die CONTROL-PLANE-Instanz (dort liegen `community_members` und
 * `trial_claims`), aus packages/control. ERST NACH Migration control-039.
 *
 *   node --env-file=../../apps/control/.env scripts/backfill-trial-claims.mjs          # zählt nur
 *   node --env-file=../../apps/control/.env scripts/backfill-trial-claims.mjs --apply  # schreibt
 *
 * Gegen Production zusätzlich `PUKALANI_TARGET_CONFIRM=<Projekt-Id>` (Ziel-
 * Prüfung, scripts/lib/target.mjs) — und Davids Ja je Lauf.
 *
 * Exit 1 bei jedem unerwarteten Fehler (auch mitten im Lauf; bis dahin
 * angelegte Zeilen bleiben, ein erneuter Lauf setzt fort).
 */
import '../../../scripts/lib/assert-target.mjs'
import { createHash } from 'node:crypto'
import { AppwriteException, Client, Query, TablesDB } from 'node-appwrite'

const apply = process.argv.includes('--apply')

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<control-.env> aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const MEMBERS = 'community_members'
const CLAIMS = 'trial_claims'
const PAGE = 100

/** Dieselbe feste Id wie `trialClaimRowId` (server/utils/trialClaims.ts). */
function trialClaimRowId(runtimeProjectId, runtimeUserId) {
  return `tc${createHash('sha256').update(`${runtimeProjectId}:${runtimeUserId}`, 'utf8').digest('hex').slice(0, 32)}`
}

function isCode(error, code, types) {
  return error instanceof AppwriteException && error.code === code && (!types || types.includes(error.type))
}

try {
  console.log(`Instanz: ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)
  console.log(apply ? 'Modus  : SCHREIBEN (--apply)\n' : 'Modus  : nur zählen (ohne --apply wird nichts geschrieben)\n')

  // ── 1. Alle Owner-Zeilen, älteste zuerst (Cursor, festes Limit) ──────────
  /** Konto-Schlüssel → älteste Owner-Zeile. */
  const oldest = new Map()
  let ownerRows = 0
  let skipped = 0
  let cursor
  for (;;) {
    const { rows } = await tablesDB.listRows({
      databaseId,
      tableId: MEMBERS,
      queries: [
        Query.equal('role', 'owner'),
        Query.orderAsc('$createdAt'),
        Query.limit(PAGE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })
    for (const row of rows) {
      ownerRows++
      if (!row.runtimeProjectId || !row.runtimeUserId || !row.communityId) {
        skipped++
        continue
      }
      const key = `${row.runtimeProjectId}:${row.runtimeUserId}`
      const known = oldest.get(key)
      if (!known || Date.parse(row.$createdAt) < Date.parse(known.$createdAt)) oldest.set(key, row)
    }
    if (rows.length < PAGE) break
    cursor = rows.at(-1).$id
  }

  // ── 2. Je Konto: schon da? sonst (mit --apply) anlegen ───────────────────
  let present = 0
  let missing = 0
  let created = 0
  for (const row of oldest.values()) {
    const rowId = trialClaimRowId(row.runtimeProjectId, row.runtimeUserId)
    if (!apply) {
      try {
        await tablesDB.getRow({ databaseId, tableId: CLAIMS, rowId })
        present++
      }
      catch (error) {
        if (!isCode(error, 404, ['row_not_found', 'document_not_found'])) throw error
        missing++
      }
      continue
    }
    try {
      await tablesDB.createRow({
        databaseId,
        tableId: CLAIMS,
        rowId,
        data: {
          runtimeProjectId: row.runtimeProjectId,
          runtimeUserId: row.runtimeUserId,
          communityId: row.communityId,
          source: 'adopted',
          claimedAt: row.$createdAt,
        },
      })
      created++
    }
    catch (error) {
      if (!isCode(error, 409)) throw error
      present++
    }
  }

  console.log(`Owner-Zeilen gefunden          : ${ownerRows}`)
  console.log(`  davon ohne Konto/Community   : ${skipped}`)
  console.log(`Verschiedene Konten            : ${oldest.size}`)
  console.log(`Testphasen-Zeile schon da      : ${present}`)
  if (apply) console.log(`Testphasen-Zeile angelegt      : ${created}`)
  else console.log(`Würden angelegt                : ${missing}`)
  console.log(apply ? '\n✔ Fertig.' : '\n↷ Nur gezählt — mit --apply schreiben.')
  process.exit(0)
}
catch (error) {
  const detail = error instanceof AppwriteException
    ? `${error.code} ${error.type}`
    : (error instanceof Error ? error.message : String(error))
  console.error(`\n✗ Abbruch: ${detail}`)
  if (isCode(error, 404, ['table_not_found', 'collection_not_found'])) {
    console.error('  Die Tabelle fehlt — erst Migration control-039 fahren.')
  }
  process.exit(1)
}
