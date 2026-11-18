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
 * DERSELBE VERTRAG LIEFERT DEN AUFTRAGSTEXT (RU1 b, seit 2026-11-18). Bis
 * dahin baute der Browser den Text aus dem Ticket und schickte ihn mit; der
 * Server bestimmte nur, ob er als geprüft gilt — über einen Text, den er nie
 * gesehen hatte. Jetzt baut der Resolver den Text selbst aus dem Subjekt
 * (`promptSource`), und die Anlege-Route speichert DIESEN Text. Wie er
 * aussieht, weiß weiter nur der Layer, dem das Subjekt gehört.
 *
 * VIER REGELN, alle zur vorsichtigen Seite:
 *  1. Kein Resolver für den Typ ⇒ gefunden, aber UNGEPRÜFT und ohne Text. Ohne
 *     Auskunft gilt der vorsichtige Fall (der Lauf bleibt möglich — mit dem
 *     Text aus der Anfrage, nur ohne die weitreichenden Modi und ohne
 *     Testbefehle).
 *  2. Der Resolver wirft ⇒ 503 `subject_trust_unavailable`. Eine Prüfung, die
 *     nicht prüfen kann, lehnt ab — sie rät nicht.
 *  3. Nur ein boolesches `true` zählt als geprüft; `'true'`, `1` o. Ä. nicht.
 *  4. GEPRÜFT IST NUR EIN TEXT, DEN DER SERVER SELBST GEBAUT HAT. Meldet ein
 *     Resolver `trusted: true`, liefert aber keinen Text (leer, fehlend, kein
 *     String), gilt der Auftrag als ungeprüft: die Aussage „stammt vom
 *     Betreiber" kann niemand über einen Text treffen, der aus einer Anfrage
 *     kommt.
 *
 * Die Logik ist eine pure Map + Funktionen; Nitro braucht sie nur für die
 * Auto-Importe (`createError`), die Tests stellen das als Global
 * (tests/runSubjectTrust.test.ts).
 */

/** Die Antwort eines Resolvers über EIN Subjekt. */
export interface RunSubjectAnswer {
  trusted: boolean
  /**
   * Der fertige Auftragstext, gebaut aus dem Subjekt (für Tickets:
   * `buildTicketRunPrompt`). Fehlt er, nimmt die Anlege-Route den Text aus
   * der Anfrage — und der Lauf gilt als ungeprüft (Regel 4).
   */
  promptSource?: string
}

/** `null` = dieses Subjekt gibt es nicht. */
export type RunSubjectTrustResolver = (event: H3Event, subjectId: string) => Promise<RunSubjectAnswer | null>

export interface RunSubjectTrust {
  /** false = das Subjekt existiert nicht (die Anlege-Route antwortet 404) */
  found: boolean
  trusted: boolean
  /** Der Text des Servers; `null` = niemand hat ihn gebaut. */
  promptSource: string | null
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
  if (!resolver) return { found: true, trusted: false, promptSource: null }

  let answer: RunSubjectAnswer | null
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

  if (!answer) return { found: false, trusted: false, promptSource: null }

  const promptSource = typeof answer.promptSource === 'string' && answer.promptSource.length > 0 ? answer.promptSource : null
  return { found: true, trusted: answer.trusted === true && promptSource !== null, promptSource }
}
