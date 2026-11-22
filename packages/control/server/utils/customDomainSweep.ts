import { Query } from 'node-appwrite'
import type { TablesDB } from 'node-appwrite'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import {
  acquireRunLease,
  dropRunLease,
  keepRunLeaseAlive,
  type RunLeaseStore,
} from '../../../core/server/utils/runLease'
import { RUN_LEASE_BUSY_CODE } from '../../../core/shared/runLease'
import { customDomainNoticesDue } from '../../shared/customDomainNotice'
import {
  customDomainSweepHeldByUnknownApproval,
  decideCustomDomainSweep,
  resolveCustomDomainSweepMode,
  type CustomDomainSweepAction,
  type CustomDomainSweepItem,
  type CustomDomainSweepMode,
  type CustomDomainSweepReport,
} from '../../shared/customDomainSweep'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { controlLockStore } from './controlLock'
import { customDomainApprovalWaiverState, type CustomDomainApprovalWaiverState } from './customDomainApprovalWaiver'
import { clearCustomDomainEntry } from './customDomainRemoval'
import { normalizePloiConfig, type PloiConfig } from './ploi'

/**
 * DER FRISTEN-LAUF DER EIGENEN DOMAIN (BE-014, Davids Entscheidung vom
 * 2026-11-16) — das Control Plane STEMPELT und SCHALTET, die Platform-App
 * meldet (`packages/onboarding/server/utils/customDomainNotice.ts`). Dieselbe
 * Arbeitsteilung wie beim Zahlungsverzug (`pastDueSweep.ts` ↔
 * `pastDueNotice.ts`): keine neue Naht, kein neues Geheimnis, keine Tabelle.
 *
 * WAS ER TUT, entscheidet die pure Regel `decideCustomDomainSweep`
 * (shared/customDomainSweep.ts): Frist beginnen, Frist räumen (Kauf kam an),
 * abschalten, Eintrag stempeln, verfallenen Eintrag leeren.
 *
 * ZUERST NUR ZÄHLEN (Davids Vorgabe): `dry-run` schreibt GAR NICHTS — auch
 * keine Lauf-Sperre — und liefert dieselben Zahlen, die `apply` erzeugen
 * würde. Scharf wird er erst, wenn David die Zahlen gesehen hat
 * (`pukalani.control.customDomainSweep`).
 *
 * `apply` LÄUFT UNTER EINER SPERRE (`system_runs`, Art `custom-domain-sweep`,
 * Gegenstand `all`): ein zweiter gleichzeitiger Lauf (zweiter Prozess, Takt
 * während eines Deploys) bekommt `run_running` und meldet `skipped`. Am Ende
 * wird die Sperr-Zeile GELÖSCHT (`dropRunLease`, wie `withControlLock`) und
 * nicht beendet stehen gelassen: der Lauf kommt stündlich, beendete Zeilen
 * wären 8.760 im Jahr ohne Leser — das Ergebnis steht im Log (`job.run` und
 * eine Zeile je Handlung). Ein später Zweiter, der die freie Kennung nach dem
 * Löschen anlegt, fährt den Lauf eben noch einmal — er ist idempotent (jede
 * Handlung prüft vor dem Schreiben die frisch gelesene Zeile).
 *
 * JE COMMUNITY EIN EIGENER VERSUCH: ein Fehlschlag hält die anderen nicht
 * auf, wird gezählt (`counts.failed`) und als `custom_domain.sweep_failed`
 * mit der Community-Id geloggt; der Zeit-Lauf wirft danach, damit der Alarm
 * ihn als gescheitert zählt.
 */

export const CUSTOM_DOMAIN_SWEEP_LEASE_SCOPE = 'custom-domain-sweep'
export const CUSTOM_DOMAIN_SWEEP_LEASE_SUBJECT = 'all'

export interface CustomDomainSweepDeps {
  tablesDB: TablesDB
  databaseId: string
  ploi: PloiConfig
  /** `null` = ohne Sperre (nur `dry-run`). */
  leaseStore: RunLeaseStore | null
  /**
   * Entfällt die Freigabe-Pflicht (PK1 K6), und kam die Frage zustande? Ohne
   * Angabe: Pflicht gilt, Frage beantwortet — der Lauf wie vor K6.
   */
  approvalWaiver?: () => Promise<CustomDomainApprovalWaiverState>
}

/** Der Schalter aus der app.config — unbekannt ⇒ `off`. */
export function customDomainSweepConfiguredMode(): CustomDomainSweepMode {
  const appConfig = useAppConfig() as { pukalani?: { control?: { customDomainSweep?: unknown } } }
  return resolveCustomDomainSweepMode(appConfig.pukalani?.control?.customDomainSweep)
}

function defaultDeps(mode: 'dry-run' | 'apply'): CustomDomainSweepDeps {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  return {
    tablesDB: admin.tablesDB,
    databaseId: config.public.appwriteDatabaseId,
    ploi: normalizePloiConfig(config as unknown as Record<string, unknown>),
    leaseStore: mode === 'apply' ? controlLockStore() : null,
    approvalWaiver: () => customDomainApprovalWaiverState(),
  }
}

function isRunBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { data?: { code?: unknown } }).data?.code === RUN_LEASE_BUSY_CODE
}

/** Aktive Owner je Community — EINE Abfrage je 100 Communities (`Query.equal`
 *  nimmt höchstens 100 Werte), kein N+1. */
async function countActiveOwners(
  tablesDB: TablesDB,
  databaseId: string,
  communityIds: string[],
): Promise<Map<string, number>> {
  const owners = new Map<string, number>()
  for (let i = 0; i < communityIds.length; i += 100) {
    const chunk = communityIds.slice(i, i + 100)
    const rows = await listAllRows<CommunityMemberRow>(tablesDB, databaseId, COMMUNITY_MEMBERS_TABLE, [
      Query.equal('communityId', chunk),
      Query.equal('role', 'owner'),
      Query.equal('status', 'active'),
    ])
    for (const row of rows) owners.set(row.communityId, (owners.get(row.communityId) ?? 0) + 1)
  }
  return owners
}

const LOG_EVENT: Record<Exclude<CustomDomainSweepAction, 'none'>, { level: 'info' | 'warn', name: string }> = {
  start_grace: { level: 'warn', name: 'custom_domain.grace_started' },
  clear_grace: { level: 'info', name: 'custom_domain.grace_cleared' },
  pause: { level: 'warn', name: 'custom_domain.paused' },
  stamp_claim: { level: 'info', name: 'custom_domain.claim_stamped' },
  expire_claim: { level: 'info', name: 'custom_domain.claim_expired' },
}

const COUNT_KEY: Record<Exclude<CustomDomainSweepAction, 'none'>, keyof Omit<CustomDomainSweepReport['counts'], 'failed'>> = {
  start_grace: 'startGrace',
  clear_grace: 'clearGrace',
  pause: 'pause',
  stamp_claim: 'stampClaim',
  expire_claim: 'expireClaim',
}

export async function runCustomDomainSweep(
  options: { mode: 'dry-run' | 'apply', now?: number },
  deps: CustomDomainSweepDeps = defaultDeps(options.mode),
): Promise<CustomDomainSweepReport | { skipped: true }> {
  const now = options.now ?? Date.now()
  const apply = options.mode === 'apply'

  // Sperre NUR im scharfen Lauf: `dry-run` schreibt nichts, auch keine
  // Sperr-Zeile — und ein zählender Lauf neben einem scharfen schadet nicht.
  const store = apply ? deps.leaseStore : null
  if (apply && !store) throw new Error('custom-domain-sweep: apply ohne Lauf-Sperre')
  let lease: Awaited<ReturnType<typeof acquireRunLease>>['lease'] | null = null
  if (store) {
    try {
      ({ lease } = await acquireRunLease(store, {
        scope: CUSTOM_DOMAIN_SWEEP_LEASE_SCOPE,
        subject: CUSTOM_DOMAIN_SWEEP_LEASE_SUBJECT,
        nowMs: now,
      }))
    }
    catch (error) {
      if (isRunBusy(error)) return { skipped: true }
      throw error
    }
  }
  const heartbeat = store && lease ? keepRunLeaseAlive(store, lease) : null

  try {
    const { tablesDB, databaseId } = deps
    // EINMAL je Lauf gefragt, gilt für jede Zeile (PK1 K6).
    const waiver = deps.approvalWaiver ? await deps.approvalWaiver() : { waived: false, answered: true }
    const sweepOptions = { approvalWaived: waiver.waived, approvalUnknown: !waiver.answered }
    // VOLLSTÄNDIG, nicht die erste Seite (listAllRows, Index idx_custom_domain).
    // `!= ''` schließt auch `null` aus (Bestand von vor control-035) — beides
    // heißt „keine Domain".
    const rows = await listAllRows<TenantRow>(tablesDB, databaseId, COMMUNITIES_TABLE, [
      Query.notEqual('customDomain', ''),
    ])
    // Kam die Frage nicht zustande, hält der Lauf Zeilen an, denen NUR die
    // Freigabe fehlt (keine neue Schonfrist, keine Abschaltung) — gezählt in
    // EINER Zeile, damit ein dauerhafter Ausfall auffällt.
    if (!waiver.answered) {
      const held = rows.filter(row => customDomainSweepHeldByUnknownApproval(row, now)).length
      logEvent('warn', 'custom_domain.sweep_approval_unknown', { held, checked: rows.length })
    }

    const report: CustomDomainSweepReport = {
      mode: options.mode,
      checked: rows.length,
      counts: { startGrace: 0, clearGrace: 0, pause: 0, stampClaim: 0, expireClaim: 0, failed: 0 },
      mails: { start: 0, ending: 0 },
      items: [],
    }

    for (const listed of rows) {
      if (heartbeat?.lost()) {
        // Ohne Herzschlag kann ein anderer Prozess die Sperre übernommen
        // haben — nicht parallel weiterschreiben.
        logEvent('error', 'custom_domain.sweep_lease_lost', { checked: rows.length })
        report.counts.failed++
        break
      }
      try {
        const decision = decideCustomDomainSweep(listed, now, sweepOptions)
        if (decision.action === 'none') {
          // Keine Handlung — aber vielleicht die Erinnerung „in drei Tagen".
          if (resolveDomainActive(listed) && customDomainNoticesDue(listed.customDomainGraceEndsAt, now).includes('ending')) {
            report.items.push(itemFor(listed, 'remind', listed.customDomainGraceEndsAt ?? null))
          }
          continue
        }

        if (apply) {
          // FRISCH LESEN, NEU ENTSCHEIDEN: zwischen Liste und Schreiben kann ein
          // Kauf angekommen sein (Webhook) oder der Owner die Domain entfernt
          // haben. Geschrieben wird nur, wenn die Entscheidung dieselbe bleibt.
          const fresh = await tablesDB.getRow<TenantRow>({ databaseId, tableId: COMMUNITIES_TABLE, rowId: listed.$id })
          const again = decideCustomDomainSweep(fresh, now, sweepOptions)
          if (again.action === 'none' || again.action !== decision.action) continue

          if (again.action === 'expire_claim') {
            await clearCustomDomainEntry({ tablesDB, databaseId, row: fresh, ploi: deps.ploi })
          }
          else {
            await tablesDB.updateRow<TenantRow>({
              databaseId, tableId: COMMUNITIES_TABLE, rowId: fresh.$id, data: { ...again.patch },
            })
          }
          const log = LOG_EVENT[again.action]
          logEvent(log.level, log.name, { communityId: fresh.$id, host: fresh.host })
        }

        report.counts[COUNT_KEY[decision.action]]++
        const graceEndsAt = 'customDomainGraceEndsAt' in decision.patch
          ? decision.patch.customDomainGraceEndsAt ?? null
          : listed.customDomainGraceEndsAt ?? null
        report.items.push(itemFor(listed, decision.action, graceEndsAt))
      }
      catch {
        report.counts.failed++
        logEvent('error', 'custom_domain.sweep_failed', { communityId: listed.$id })
      }
    }

    // Wer bekäme die Hinweis-Mails? (die Zahl, die David sehen will)
    if (report.items.length) {
      try {
        const owners = await countActiveOwners(tablesDB, databaseId, [...new Set(report.items.map(item => item.communityId))])
        for (const item of report.items) {
          item.owners = owners.get(item.communityId) ?? 0
          if (item.action === 'start_grace') report.mails.start += item.owners
          if (item.action === 'remind') report.mails.ending += item.owners
        }
      }
      catch {
        report.counts.failed++
        logEvent('error', 'custom_domain.sweep_owner_count_failed', { items: report.items.length })
      }
    }

    if (!apply) {
      logEvent('info', 'custom_domain.sweep_dry_run', {
        checked: report.checked,
        ...report.counts,
        mailsStart: report.mails.start,
        mailsEnding: report.mails.ending,
      })
    }
    return report
  }
  finally {
    heartbeat?.stop()
    if (store && lease) await dropRunLease(store, lease)
  }
}

function resolveDomainActive(row: TenantRow): boolean {
  return row.status === 'active' && row.mode === 'pool' && Boolean(row.customDomain) && row.customDomainStatus === 'active'
}

function itemFor(row: TenantRow, action: CustomDomainSweepItem['action'], graceEndsAt: string | null): CustomDomainSweepItem {
  return {
    communityId: row.$id,
    host: row.host,
    domain: row.customDomain ?? '',
    action,
    graceEndsAt,
    owners: 0,
  }
}
