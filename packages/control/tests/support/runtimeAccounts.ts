/**
 * DIE KONTEN HINTER EINEM JWT — nachgebildet für die Rollen-Tests der Naht
 * (OPS-009, BT1 b).
 *
 * `verifyIdentityAgainst` (`server/utils/onboardingService.ts`) fragt Appwrite
 * mit dem JWT nach dem Konto: `new Account(new Client().setProject(p).setJWT(j))
 * .get()`. Nachgebildet wird NUR dieser eine Ruf ins fremde Projekt — der echte
 * `Client` bleibt, und `Account.get()` antwortet aus dieser Tabelle. Ein JWT
 * gilt für GENAU EIN Projekt, wie bei Appwrite: dasselbe JWT gegen ein anderes
 * Projekt ist ein 401.
 *
 * Bewusst OHNE Import aus `node-appwrite`: die Testdateien ersetzen dort
 * `Account` per `vi.mock('node-appwrite', …)` und laden dafür diese Datei —
 * ein Import des Moduls, das gerade ersetzt wird, wäre ein Kreis.
 */

export interface RuntimeAccount {
  $id: string
  email: string
  name: string
  emailVerification: boolean
}

const accounts = new Map<string, RuntimeAccount>()

function keyOf(projectId: string, jwt: string): string {
  return `${projectId}|${jwt}`
}

/** Ein JWT für ein Konto in GENAU einem Projekt ausstellen. */
export function issueRuntimeJwt(projectId: string, jwt: string, account: RuntimeAccount): void {
  accounts.set(keyOf(projectId, jwt), account)
}

export function clearRuntimeAccounts(): void {
  accounts.clear()
}

interface ClientLike {
  config: { project?: string, jwt?: string }
}

/** Ersatz für `Account` aus `node-appwrite` — kennt nur `get()`. */
export class FakeAccount {
  constructor(private readonly client: ClientLike) {}

  async get(): Promise<RuntimeAccount> {
    const found = accounts.get(keyOf(this.client.config.project ?? '', this.client.config.jwt ?? ''))
    if (!found) throw Object.assign(new Error('Invalid JWT'), { code: 401, type: 'user_jwt_invalid' })
    return { ...found }
  }
}

/** Für `vi.mock('node-appwrite', …)`: alles echt, nur `Account` nicht. */
export function withFakeAccount<M extends object>(original: M): M {
  return { ...original, Account: FakeAccount }
}
