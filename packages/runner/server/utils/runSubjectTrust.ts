import type { H3Event } from 'h3'

/**
 * „Gilt der Auftragstext dieses Subjekts als geprüft?" — der Vertrag, über den
 * der SERVER `runs.promptTrusted` bestimmt (SEC-038, docs/plans/AI-RUNNER.md
 * § 8.2).
 *
 * WARUM EINE REGISTRY (A14): `runner` kennt `tickets` nicht. Die Antwort
 * („woher stammt der Text dieses Tickets?") kann nur der Layer geben, dem das
 * Subjekt gehört, und verdrahtet wird sie in der App, die beide Layer
 * komponiert (`apps/control/server/plugins/runner-ticket-trust.ts`). Derselbe
 * Aufbau wie `registerDependencyTicketCreator` im Core.
 *
 * VORHER rechnete der Browser den Wert aus und die Anlege-Route glaubte ihn —
 * ein Wert, der aus einem Body kommt, ist keine Prüfung.
 *
 * DREI REGELN, alle zur vorsichtigen Seite:
 *  1. Kein Resolver für den Typ ⇒ gefunden, aber UNGEPRÜFT. Ohne Auskunft gilt
 *     der vorsichtige Fall (der Lauf bleibt möglich, nur ohne die
 *     weitreichenden Modi und ohne Testbefehle).
 *  2. Der Resolver wirft ⇒ 503 `subject_trust_unavailable`. Eine Prüfung, die
 *     nicht prüfen kann, lehnt ab — sie rät nicht.
 *  3. Nur ein boolesches `true` zählt als geprüft; `'true'`, `1` o. Ä. nicht.
 *
 * Die Logik ist eine pure Map + Funktionen; Nitro braucht sie nur für die
 * Auto-Importe (`createError`), die Tests stellen das als Global
 * (tests/runSubjectTrust.test.ts).
 */

/** `null` = dieses Subjekt gibt es nicht. */
export type RunSubjectTrustResolver = (event: H3Event, subjectId: string) => Promise<{ trusted: boolean } | null>

export interface RunSubjectTrust {
  /** false = das Subjekt existiert nicht (die Anlege-Route antwortet 404) */
  found: boolean
  trusted: boolean
}

const resolvers = new Map<string, RunSubjectTrustResolver>()

/** Vom Plugin der App registriert — EINE Autorität je Subjekt-Typ. */
export function registerRunSubjectTrustResolver(subjectType: string, resolver: RunSubjectTrustResolver): void {
  if (resolvers.has(subjectType)) {
    console.warn(`[runner] registerRunSubjectTrustResolver: Resolver für '${subjectType}' wird ersetzt — je Typ ist EINE Autorität vorgesehen`)
  }
  resolvers.set(subjectType, resolver)
}

/** Nur für Tests: Registry leeren. */
export function __resetRunSubjectTrustResolvers(): void {
  resolvers.clear()
}

export async function resolveRunSubjectTrust(event: H3Event, subjectType: string, subjectId: string): Promise<RunSubjectTrust> {
  const resolver = resolvers.get(subjectType)
  if (!resolver) return { found: true, trusted: false }

  let answer: { trusted: boolean } | null
  try {
    answer = await resolver(event, subjectId)
  }
  catch (error) {
    // Ins Log, nicht in die Antwort: der Grund ist ein Appwrite-Fehler, und
    // dessen Details gehören nicht zum Client.
    console.warn(`[runner] Herkunft von ${subjectType}/${subjectId} nicht prüfbar:`, error)
    throw createError({
      status: 503,
      statusText: 'Subject trust unavailable',
      data: { code: 'subject_trust_unavailable' },
    })
  }

  if (!answer) return { found: false, trusted: false }
  return { found: true, trusted: answer.trusted === true }
}
