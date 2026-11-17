import { ACCOUNT_EVENT_PROFILE_FIELDS } from '../../core/shared/accountEvents'
import type { AccountEventProfileField } from '../../core/shared/accountEvents'
import type { AdminUserActivity } from './types/admin'

/**
 * AKTIVITÄT EINES KONTOS in der Admin-Nutzeransicht — Form und REGELN (AL1).
 *
 * Bis Appwrite 2.5 kam die Liste aus `users.listLogs`; den Endpunkt gibt es
 * nicht mehr, die Liste war seitdem immer leer. Davids Entscheidung: sie wird
 * GEFÜLLT, und zwar aus dem vorhandenen Betreiber-Protokoll `audit_logs` —
 * keine neue Quelle, kein neuer Schreiber, keine Migration.
 *
 * Zwei Sorten Zeilen gehören zu EINEM Konto:
 *  - SELBST (`origin: 'self'`): was die Person selbst tat — `logAuthEvent`
 *    (core) schreibt sie mit `actorId` = Konto und LEERER `targetId`.
 *  - BETREIBER (`origin: 'operator'`): was ein Betreiber an dem Konto tat —
 *    `recordAudit` (admin) schreibt sie mit `targetType: 'user'` und
 *    `targetId` = Konto.
 * Eine Zeile mit `actorId` = Konto UND einer Ziel-Id ist eine Betreiber-Aktion,
 * die DIESES Konto an JEMAND ANDEREM ausführte — sie gehört in die Ansicht des
 * anderen Kontos, nicht hierher.
 *
 * Unterschied zur Selbst-Sicht (`core/shared/accountEvents.ts`): der Betreiber
 * sieht MEHR — An- und Abmeldungen, die IP-Adresse und alles, was andere
 * Betreiber am Konto taten. Bewusst AUSGELASSEN sind nur die reinen Ansichten
 * (`user.viewed`, `user.list_viewed`): das Öffnen genau dieser Seite schreibt
 * selbst `user.viewed`, die Liste zeigte sonst vor allem sich selbst.
 *
 * Hier steht nur, was ohne Appwrite und ohne H3 gilt — das Lesen liegt in
 * `server/utils/userActivity.ts`.
 */

/** Höchstens so viele Einträge zeigt die Karte. */
export const USER_ACTIVITY_LIMIT = 20

/**
 * Aktionen, die NIE in der Liste stehen — die ABFRAGE filtert darauf, damit
 * die Ansichten nicht das Budget aufzehren (ein Filter erst nach dem Lesen
 * zeigte nach ein paar Seitenaufrufen nichts anderes mehr).
 */
export const USER_ACTIVITY_HIDDEN_ACTIONS = ['user.viewed', 'user.list_viewed'] as const

/**
 * Aktion → Text-Schlüssel unter `admin.users.detail.activity.event.*`.
 *
 * Eine EXPLIZITE Liste, kein Zerlegen des Punktpfades: ein geratener Text ist
 * schlimmer als der rohe Name. WAS NICHT IN DER LISTE STEHT, BLEIBT SICHTBAR,
 * roh und monospace — kein Rückfall auf „Unbekannt", der ein Loch unsichtbar
 * macht. Jeder Eintrag braucht einen Text in de UND en (Wächter-Test
 * `tests/userActivity.test.ts`).
 *
 * Nicht dabei, mit Grund: `user.joined` ist KEINE Protokoll-Aktion, sondern
 * eine Art des Aktivitäts-Feeds (`signup.post.ts`, OAuth, OTP) — in
 * `audit_logs` steht sie nie. `user.bulk_block`/`user.bulk_unblock` tragen
 * eine LEERE `targetId` (die Ids stehen pseudonymisiert in `metadata`) und
 * erreichen die Liste deshalb gar nicht.
 */
export const USER_ACTIVITY_ACTION_KEYS: Readonly<Record<string, string>> = {
  // Selbst (logAuthEvent, core/server/utils/authAudit.ts)
  'user.login': 'login',
  'user.logout': 'logout',
  'user.self_deleted': 'selfDeleted',
  'user.password_changed': 'passwordChanged',
  'user.recovery_requested': 'recoveryRequested',
  'user.email_verified': 'emailVerified',
  'user.profile_updated': 'profileUpdated',
  'user.mfa_enabled': 'mfaEnabled',
  'user.mfa_disabled': 'mfaDisabled',
  'user.mfa_challenge_failed': 'mfaChallengeFailed',
  // Betreiber (recordAudit, targetType 'user')
  'user.created': 'created',
  'user.block': 'blocked',
  'user.unblock': 'unblocked',
  'user.roles_updated': 'rolesUpdated',
  'user.role_granted': 'roleGranted',
  'user.role_revoked': 'roleRevoked',
  'user.sessions_cleared': 'sessionsCleared',
  'user.exported': 'exported',
  'user.deleted': 'deleted',
}

/**
 * Text-Schlüssel-Suffix für eine Zeile, oder `null` (⇒ roh anzeigen).
 * `user.password_changed` mit `method: 'recovery'` ist für den Menschen ein
 * anderer Vorgang („kam über den Link aus der Mail hinein") — eigener Text.
 */
export function userActivityTextKey(action: string, method: string): string | null {
  if (action === 'user.password_changed' && method === 'recovery') return 'passwordReset'
  return USER_ACTIVITY_ACTION_KEYS[action] ?? null
}

/** Was von einer `audit_logs`-Zeile gebraucht wird — mehr liest hier niemand. */
export interface UserActivityAuditRow {
  $id: string
  $createdAt: string
  actorId: string
  actorName?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  metadata?: string | null
  ip?: string | null
}

export type UserActivityOrigin = AdminUserActivity['origin']

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }
  catch {
    // Kaputtes JSON ist kein Grund, den Eintrag zu verschweigen — nur seine
    // Details fehlen dann.
    return {}
  }
}

/** Methoden sind kurze Kennungen (`password`, `otp`, `totp+login`) — nie Freitext. */
const METHOD_PATTERN = /^[a-z0-9_+-]{1,32}$/

/**
 * Zu welcher Sorte gehört die Zeile für DIESES Konto — oder gar nicht (`null`).
 *
 * DIE ZUGEHÖRIGKEIT WIRD AN DER GELESENEN ZEILE NACHGEPRÜFT, nicht nur in der
 * Abfrage: hält, falls jemand die Abfrage je „optimiert".
 */
export function userActivityOrigin(row: UserActivityAuditRow, userId: string): UserActivityOrigin | null {
  if (!userId) return null
  if ((USER_ACTIVITY_HIDDEN_ACTIONS as readonly string[]).includes(row.action)) return null
  if (row.targetType === 'user' && row.targetId === userId) return 'operator'
  if (row.actorId === userId && !row.targetId) return 'self'
  return null
}

/**
 * EINE Protokoll-Zeile → ein Eintrag der Liste, oder `null`.
 *
 * IP und Ort einer BETREIBER-Zeile gehören dem Betreiber, nicht der Person —
 * sie werden nicht weitergegeben. `place` reicht der Aufrufer herein (aus der
 * IP der Zeile aufgelöst), so bleibt diese Funktion pur.
 */
export function userActivityFromAuditRow(
  row: UserActivityAuditRow,
  userId: string,
  place = '',
): AdminUserActivity | null {
  const origin = userActivityOrigin(row, userId)
  if (!origin) return null

  const metadata = parseMetadata(row.metadata)
  const method = typeof metadata.method === 'string' && METHOD_PATTERN.test(metadata.method) ? metadata.method : ''
  // Über die ERLAUBTE Liste laufen, nicht über die gelesene: ein unbekannter
  // Name kann so gar nicht durchkommen.
  const written: unknown[] = row.action === 'user.profile_updated' && Array.isArray(metadata.fields) ? metadata.fields : []
  const fields: AccountEventProfileField[] = ACCOUNT_EVENT_PROFILE_FIELDS.filter(field => written.includes(field))

  return {
    id: row.$id,
    action: row.action,
    createdAt: row.$createdAt,
    origin,
    operatorName: origin === 'operator' ? (row.actorName ?? '') : '',
    ip: origin === 'self' ? (row.ip ?? '') : '',
    place: origin === 'self' ? place : '',
    method,
    fields,
  }
}

/**
 * Beide Abfragen zusammenführen: nur zugehörige Zeilen, nach `$id`
 * entdoppelt, neueste zuerst, auf `limit` gedeckelt.
 *
 * `truncated` ist eine TATSACHE: jede Abfrage las eine Zeile mehr als
 * `limit`. Liegt nach dem Zusammenführen mehr als `limit` vor, gibt es
 * Älteres, das nicht mehr gezeigt wird.
 */
export function mergeUserActivityRows(
  lists: ReadonlyArray<readonly UserActivityAuditRow[]>,
  userId: string,
  limit: number,
): { rows: UserActivityAuditRow[], truncated: boolean } {
  if (!userId || limit <= 0) return { rows: [], truncated: false }

  const byId = new Map<string, UserActivityAuditRow>()
  for (const list of lists) {
    for (const row of list) {
      if (!userActivityOrigin(row, userId)) continue
      if (!byId.has(row.$id)) byId.set(row.$id, row)
    }
  }

  const sorted = [...byId.values()].sort((a, b) => {
    const diff = Date.parse(b.$createdAt) - Date.parse(a.$createdAt)
    if (diff !== 0 && !Number.isNaN(diff)) return diff
    return a.$id < b.$id ? 1 : a.$id > b.$id ? -1 : 0
  })

  return { rows: sorted.slice(0, limit), truncated: sorted.length > limit }
}
