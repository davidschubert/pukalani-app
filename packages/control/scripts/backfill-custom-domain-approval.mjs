#!/usr/bin/env node
/**
 * SEC-022 — BESTAND ÜBERNEHMEN: heute aktive eigene Domains gelten als
 * freigegeben (Davids Entscheidung vom 2026-11-16).
 *
 * Seit control-040 ist eine eigene Domain nur mit der Freigabe des Betreibers
 * je Community aktiv (`communities.customDomainApproved === true`). Für
 * Communities, deren Domain VOR der Migration aktiv wurde, fehlt diese
 * Freigabe — ohne Übernahme scheiterte ihr nächster Prüf-Klick mit
 * `approval_required`, und der spätere Fristen-Lauf behandelte sie wie
 * unfreigegeben. Dieses Skript schreibt genau zwei Dinge:
 *
 *  1. Zeilen mit Status `active` und Freigabe nicht `true`:
 *     `customDomainApproved: true`, `customDomainApprovedAt: jetzt`.
 *  2. Zeilen MIT eingetragener Domain, aber ohne `customDomainClaimedAt`:
 *     `customDomainClaimedAt: jetzt` — damit der Verfall eines Eintrags ohne
 *     Nachweis (14 Tage) ab heute zählt und nicht ab einem geratenen Datum.
 *
 * NICHTS SONST: kein Status, keine Frist, keine Abschaltung. Ein zweiter Lauf
 * findet nichts mehr und schreibt nichts.
 *
 * AUSGABE NUR ZAHLEN: Zeilen mit eigener Domain je Status, und je betroffener
 * Zeile ihr Status und Plan. Nie ein Domain-Name, nie eine Id.
 *
 * ═══ AUFRUF ════════════════════════════════════════════════════════════
 *
 * Gegen die CONTROL-PLANE-Instanz (dort liegt `communities`), aus
 * packages/control. ERST NACH Migration control-040.
 *
 *   node --env-file=../../apps/control/.env scripts/backfill-custom-domain-approval.mjs          # zählt nur
 *   node --env-file=../../apps/control/.env scripts/backfill-custom-domain-approval.mjs --apply  # schreibt
 *
 * Gegen Production zusätzlich `PUKALANI_TARGET_CONFIRM=<Projekt-Id>` (Ziel-
 * Prüfung, scripts/lib/target.mjs) — und Davids Ja je Lauf.
 *
 * Exit 1 bei jedem unerwarteten Fehler (auch mitten im Lauf; bis dahin
 * geschriebene Zeilen bleiben, ein erneuter Lauf setzt fort).
 */
import '../../../scripts/lib/assert-target.mjs'
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

const COMMUNITIES = 'communities'
const PAGE = 100
/** Dieselben Werte wie `CUSTOM_DOMAIN_STATUSES` (shared/customDomain.ts) —
 *  fail-closed auf 'none' gelesen, wie `resolveCustomDomainStatus`. */
const STATUSES = ['none', 'pending_dns', 'pending_cert', 'pending_platform', 'active', 'error', 'paused']
const statusOf = value => (STATUSES.includes(value ?? '') ? value : 'none')
/** Dieselbe Lesart wie `normalizeTenantPlan` für die Anzeige: Altwerte auf die heutigen Namen. */
const PLAN_ALIASES = { '': 'basic', free: 'basic', business: 'pro' }
const planOf = value => PLAN_ALIASES[value ?? ''] ?? value ?? 'basic'

try {
  console.log(`Instanz: ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)
  console.log(apply ? 'Modus  : SCHREIBEN (--apply)\n' : 'Modus  : nur zählen (ohne --apply wird nichts geschrieben)\n')

  const byStatus = new Map()
  const toApprove = []
  const toStamp = []
  let total = 0
  let cursor
  for (;;) {
    const { rows } = await tablesDB.listRows({
      databaseId,
      tableId: COMMUNITIES,
      queries: [
        Query.select(['$id', 'plan', 'customDomain', 'customDomainStatus', 'customDomainApproved', 'customDomainClaimedAt']),
        Query.orderAsc('$createdAt'),
        Query.limit(PAGE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })
    for (const row of rows) {
      total++
      if (!row.customDomain) continue
      const status = statusOf(row.customDomainStatus)
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
      if (status === 'active' && row.customDomainApproved !== true) toApprove.push({ id: row.$id, status, plan: planOf(row.plan) })
      if (!row.customDomainClaimedAt) toStamp.push({ id: row.$id, status, plan: planOf(row.plan) })
    }
    if (rows.length < PAGE) break
    cursor = rows.at(-1).$id
  }

  console.log(`Communities gelesen                : ${total}`)
  console.log(`  davon mit eigener Domain         : ${[...byStatus.values()].reduce((sum, n) => sum + n, 0)}`)
  for (const status of STATUSES) {
    if (byStatus.has(status)) console.log(`    ${status.padEnd(30)}: ${byStatus.get(status)}`)
  }
  console.log(`Aktiv, noch nicht freigegeben      : ${toApprove.length}`)
  toApprove.forEach((row, index) => console.log(`    ${String(index + 1).padStart(3)}. Status ${row.status}, Plan ${row.plan}`))
  console.log(`Mit Domain, ohne Eintragsdatum     : ${toStamp.length}`)
  toStamp.forEach((row, index) => console.log(`    ${String(index + 1).padStart(3)}. Status ${row.status}, Plan ${row.plan}`))

  if (!apply) {
    console.log('\n↷ Nur gezählt — mit --apply schreiben.')
    process.exit(0)
  }

  const now = new Date().toISOString()
  let approved = 0
  let stamped = 0
  const stampIds = new Set(toStamp.map(row => row.id))
  for (const row of toApprove) {
    await tablesDB.updateRow({
      databaseId,
      tableId: COMMUNITIES,
      rowId: row.id,
      data: {
        customDomainApproved: true,
        customDomainApprovedAt: now,
        ...(stampIds.has(row.id) ? { customDomainClaimedAt: now } : {}),
      },
    })
    approved++
    if (stampIds.delete(row.id)) stamped++
  }
  for (const id of stampIds) {
    await tablesDB.updateRow({ databaseId, tableId: COMMUNITIES, rowId: id, data: { customDomainClaimedAt: now } })
    stamped++
  }

  console.log(`\nFreigegeben                        : ${approved}`)
  console.log(`Eintragsdatum gesetzt              : ${stamped}`)
  console.log('\n✔ Fertig.')
  process.exit(0)
}
catch (error) {
  const detail = error instanceof AppwriteException
    ? `${error.code} ${error.type}`
    : (error instanceof Error ? error.message : String(error))
  console.error(`\n✗ Abbruch: ${detail}`)
  if (error instanceof AppwriteException && error.code === 400 && error.type === 'general_query_invalid') {
    console.error('  Eine Spalte fehlt — erst Migration control-040 fahren.')
  }
  process.exit(1)
}
