/**
 * „NIE DER LETZTE AKTIVE ADMIN" — der fachliche Grund, geteilt von Server und
 * Browser. Die Route wirft 409 mit `data: { code: LAST_ADMIN_CODE }`, der
 * zentrale Handler hebt ihn als `reason` ins Envelope, der Browser liest
 * `error.data.reason` (Muster `last_owner`, CLAUDE.md).
 */
export const LAST_ADMIN_CODE = 'last_admin'

/** Das Betreiber-Label, das geschützt wird (`hasCapability`). */
export const ADMIN_LABEL = 'admin'

/** Ein `$fetch`-Fehler mit diesem Grund? */
export function isLastAdminError(error: unknown): boolean {
  return (error as { data?: { reason?: unknown } } | null)?.data?.reason === LAST_ADMIN_CODE
}
