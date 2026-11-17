/**
 * DER SESSION-CLIENT FÜR `requireRecentAuth` — nachgebildet (OPS-009).
 *
 * `requireRecentAuth` (Core, `server/utils/recentAuth.ts`) fragt Appwrite nach
 * der aktuellen Sitzung und vergleicht ihr Alter. Nachgebildet wird nur diese
 * Auskunft: eine Testdatei ersetzt `core/server/lib/appwrite` per
 * `vi.mock(…, () => import('./support/sessionClient'))`, und der Prüfstand
 * stellt je Probe das Alter der Sitzung ein (`setSessionCreatedAt`).
 * Dieselbe Bauart wie `packages/control/tests/support/sessionClient.ts`.
 */

let sessionCreatedAt = new Date().toISOString()

export function setSessionCreatedAt(iso: string): void {
  sessionCreatedAt = iso
}

export function createSessionClient() {
  return {
    account: {
      getSession: async () => ({ $id: 'current', $createdAt: sessionCreatedAt }),
    },
  }
}
