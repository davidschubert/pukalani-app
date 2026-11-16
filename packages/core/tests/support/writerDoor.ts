import type { H3Event } from 'h3'
import type { TenantContext } from '../../shared/types/tenant'
import { COMMUNITY_SUSPENDED_CODE, memberWritesAllowedFor } from '../../shared/communitySuspension'
import { actorFacesContentLock, type TenantDbActor } from '../../server/utils/tenantDb'
import { tenantRowPermissionsFor, type TenantRowPermissionOptions } from '../../server/utils/tenantRowPermissions'
import type { FakeDoor, FakeRow, Handle } from './doorFake'

/**
 * DIE NACHGEBAUTE TÜR MIT PROTOKOLL DER SCHREIBVORGÄNGE (SEC-002, GA1 P13).
 *
 * Legt sich um `fakeDoor` und hält je Schreibvorgang fest, mit welcher Klinke
 * (`as`) und für welchen Handelnden (`actor`) er lief und — beim Anlegen —
 * welche Rechte die Zeile bekäme. Die Rechte bildet dieselbe Regel wie in der
 * echten Tür (`tenantRowPermissionsFor`), es sei denn, die Route nennt eigene
 * `permissions`.
 *
 * Die INHALTS-SPERRE (M13) bildet sie nach wie die echte Tür: ein Handelnder,
 * der ihr unterliegt (`actorFacesContentLock`), bekommt in einer gesperrten
 * Community bei jedem Schreibvorgang 403 `community_suspended`; die Klinke
 * selbst spielt dafür keine Rolle, nur `actor` (Standard: `as`).
 */

export const DOOR_WRITES = ['create', 'update', 'remove', 'increment', 'decrement', 'updatePermissions'] as const

export interface WriteRecord {
  handle: Handle
  actor: TenantDbActor
  method: string
  table: string
  id?: string
  /** Nur beim Anlegen: die Rechte, die die Zeile bekäme. */
  permissions?: string[]
}

type Options = { as?: Handle, actor?: TenantDbActor }
type CreateOptions = TenantRowPermissionOptions & { permissions?: string[], rowId?: string }

function suspended(): Error {
  return Object.assign(new Error('Community is read-only'), {
    status: 403, statusCode: 403, statusText: 'Community is read-only', data: { code: COMMUNITY_SUSPENDED_CODE },
  })
}

export function writerDoor(door: FakeDoor) {
  const writes: WriteRecord[] = []
  const tenantDb = (event: H3Event, options?: Options) => {
    const handle: Handle = options?.as === 'operator' ? 'operator' : 'member'
    const actor: TenantDbActor = options?.actor ?? handle
    const tenant = (event.context as { tenant?: TenantContext | null }).tenant ?? null
    const inner = door.tenantDb(event, options) as Record<string, (...args: unknown[]) => Promise<unknown>>
    const lock = () => {
      if (actorFacesContentLock(actor) && !memberWritesAllowedFor(tenant)) throw suspended()
    }
    const wrapped: Record<string, unknown> = { ...inner }
    for (const method of DOOR_WRITES) {
      wrapped[method] = async (table: string, ...rest: unknown[]) => {
        if (method === 'create') {
          const createOptions = (rest[1] ?? {}) as CreateOptions
          const { permissions, rowId: _rowId, ...permissionOptions } = createOptions
          writes.push({ handle, actor, method, table, permissions: permissions ?? tenantRowPermissionsFor(tenant, permissionOptions) })
          lock()
          return inner.create!(table, rest[0])
        }
        writes.push({ handle, actor, method, table, id: rest[0] as string })
        lock()
        if (method === 'updatePermissions') {
          const row = (door.rows[table] ?? []).find(r => r.$id === rest[0]) as FakeRow | undefined
          if (row) row.$permissions = rest[1] as string[]
          return row ? { ...row } : undefined
        }
        return inner[method]!(table, ...rest)
      }
    }
    return wrapped
  }
  return { tenantDb, writes }
}

/** Nur die Schreibvorgänge auf `table`. */
export function writesTo(writes: WriteRecord[], table: string): WriteRecord[] {
  return writes.filter(w => w.table === table)
}

/** Trägt eine Rechte-Liste ein Schreibrecht (für irgendwen)? */
export function grantsWrite(permissions: string[] = []): boolean {
  return permissions.some(p => /^(update|delete|write|create)\(/.test(p))
}
