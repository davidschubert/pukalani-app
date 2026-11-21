import type { H3Event } from 'h3'

/**
 * DER ERSTE INHALT EINER NEUEN COMMUNITY (U4 Teil 5 / Benchmark-E2).
 *
 * Zwei Fragen, die nur ein Layer beantworten kann, der ein FEED-Produkt
 * mitbringt — und die zwei Layer stellen, die selbst keines haben:
 *
 *  1. der Wizard-Abschluss (`onboarding`) will beim Anlegen EINEN Beispiel-
 *     Beitrag säen, damit der erste Zustand nicht leer ist;
 *  2. die Willkommens-Checkliste (`onboarding`) will wissen, ob inzwischen
 *     jemand SELBST etwas geschrieben hat — die eigene Saat darf dabei nicht
 *     mitzählen, sonst hakt die Liste ihren ersten Punkt selbst ab.
 *
 * ── WARUM EINE REGISTRY UND KEIN IMPORT ────────────────────────────────────
 * Weil A14 es verlangt und der ESLint-Backstop es durchsetzt: `onboarding` ist
 * ein NAHT-Layer und darf die Control-Plane-Verträge, `pages` und `themes`
 * kennen — sonst KEINEN Produkt-Layer (`pukalani/no-cross-layer-relative`).
 * Ein `import { seedWelcomePost } from '…/posts/…'` sieht neben dem
 * bestehenden `seedHomePage`-Import völlig harmlos aus und ist trotzdem etwas
 * anderes: `pages` ist ausdrücklich erlaubt, `posts` nicht. Beim Bau von U4
 * genau so passiert — die Regel hat es gefangen, nicht der Mensch.
 *
 * Dieselbe Bauart wie `registerCommunityUsageCounter`,
 * `registerDashboardStatValueProvider` und `registerUserDataContributor`: der
 * Produkt-Layer meldet sich per Nitro-Plugin selbst an, der Konsument fragt.
 *
 * ── EIN VERTRAG MIT ZWEI METHODEN, NICHT ZWEI REGISTRIES ───────────────────
 * Säen und Wiedererkennen hängen an DERSELBEN Zeile: wer das eine ändert, muss
 * das andere anfassen. Als zwei getrennte Registries könnte ein Layer die eine
 * verdrahten und die andere vergessen — und der Schaden wäre unsichtbar (die
 * Checkliste gratulierte still zu einem Beitrag, den niemand geschrieben hat).
 * Dieselbe Begründung wie beim `CommunityJoinDatesResolver`.
 *
 * Eine App ohne Feed-Produkt hat keinen Anbieter: dann wird nichts gesät, und
 * die Frage nach dem ersten Beitrag hat keine Antwort (`null`) — beides ist
 * der gewollte Normalfall, kein Fehler.
 */

export interface CommunityFirstContentSeed {
  /** Zeilen-Scope der frischen Community (`communities.tenantId`). */
  tenantId: string
  /** Appwrite-Id des Owners — Autor des Beispiels und damit der, der es löschen darf. */
  ownerUserId: string
  /** Anzeigename des Owners (leer erlaubt). */
  ownerName: string
  /** Name der Community aus dem Wizard. */
  siteName: string
  /** Beschreibung aus dem Wizard (optional). */
  description?: string
  /** Kategorie-Schlüssel aus dem Wizard (optional). */
  category?: string
  /** Sprache des Wizards ('de' | 'en'). */
  locale: string
}

export interface CommunityFirstContentProvider {
  /**
   * Beispiel-Inhalt anlegen. Wird NUR bei einer echten Neuanlage gerufen und
   * muss idempotent sein (ein Doppelklick auf „Community anlegen" darf kein
   * zweites Beispiel erzeugen).
   */
  seed: (event: H3Event, input: CommunityFirstContentSeed) => Promise<void>
  /**
   * Hat in dieser Community jemand SELBST etwas geschrieben — die Saat
   * ausdrücklich NICHT mitgezählt?
   *
   * `null` heißt „weiß ich nicht" (Tabelle fehlt, Appwrite antwortet nicht)
   * und ist bewusst von `false` unterschieden: der Konsument entscheidet
   * selbst, wie er mit Unwissen umgeht.
   */
  hasAuthored: (event: H3Event) => Promise<boolean | null>
}

let provider: CommunityFirstContentProvider | null = null

export function registerCommunityFirstContentProvider(next: CommunityFirstContentProvider): void {
  provider = next
}

/**
 * Beispiel-Inhalt säen — ohne Anbieter passiert nichts.
 *
 * WIRFT NICHT: die Community existiert zu diesem Zeitpunkt bereits, an einem
 * misslungenen Beispiel darf ihre Anlage nicht scheitern. Derselbe fail-soft-
 * Grundsatz wie bei den Seiten-Saaten, nur hier schon eingebaut statt an jeder
 * Aufrufstelle wiederholt.
 */
export async function seedCommunityFirstContent(event: H3Event, input: CommunityFirstContentSeed): Promise<void> {
  if (!provider) return
  try {
    await provider.seed(event, input)
  }
  catch (error) {
    logEvent('error', 'community.first_content_seed_failed', {
      tenantId: input.tenantId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Hat jemand selbst geschrieben? `null` = kein Anbieter oder keine Auskunft. */
export async function communityHasAuthoredContent(event: H3Event): Promise<boolean | null> {
  if (!provider) return null
  try {
    return await provider.hasAuthored(event)
  }
  catch {
    return null
  }
}
