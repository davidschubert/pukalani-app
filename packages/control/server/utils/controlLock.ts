/**
 * Die Sperre für Regeln „erst lesen, dann schreiben" (BE-013) — seit
 * 2026-11-23 im Core (`core/server/utils/ruleLock.ts`), weil auch der Core sie
 * braucht („nie der letzte aktive Admin"). Hier stehen nur noch die alten
 * Namen, damit die Control-Routen und ihre Tests unverändert bleiben.
 */
export {
  RULE_LOCK_BUSY_CODE as CONTROL_LOCK_BUSY_CODE,
  RULE_LOCK_PAUSES_MS as CONTROL_LOCK_PAUSES_MS,
  RULE_LOCK_STALL_MS as CONTROL_LOCK_STALL_MS,
  RULE_LOCK_TABLE as CONTROL_LOCK_TABLE,
  ruleLockStore as controlLockStore,
  ruleLockSubject as controlLockSubject,
  withRuleLock as withControlLock,
} from '../../../core/server/utils/ruleLock'
export type { RuleLockOptions as ControlLockOptions } from '../../../core/server/utils/ruleLock'
