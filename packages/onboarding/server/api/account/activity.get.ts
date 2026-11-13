import {
  ACCOUNT_EVENTS_SOURCE_ID,
  groupAccountActivityByCommunity,
  mergeAccountActivity,
  type AccountActivityEntry,
  type AccountActivityResponse,
} from '../../../../core/shared/accountActivity'
import type { AccountEventsSection } from '../../../../core/shared/accountEvents'

/**
 * `GET /api/account/activity` — die eigene Aktivität über alle Communities
 * (AH-3, `/profile/activity`).
 *
 * WARUM EIN NEUER PRÄFIX IN `pukalani.tenancy.controlApiPrefixes`: auf einem
 * Kontroll-Host gibt es keinen Mandanten, deshalb lässt `01.control-center.ts`
 * dort NUR ausdrücklich erlaubte API-Pfade durch (alles andere 404). Der
 * Eintrag ist der EXAKTE Pfad `/api/account/activity`, kein Verzeichnis-Präfix
 * wie `/api/account/` — der Vergleich läuft an der Segmentgrenze, ein
 * Verzeichnis-Präfix würde also jede künftige Route unter `/api/account/`
 * blind mit-öffnen. Genau das ist der Fehler, den Audit-Befund 9 (2026-08-02)
 * gefunden hat, nur eine Ebene höher.
 *
 * DIE DREI SICHERUNGEN, warum hier kein fremder Inhalt lesbar ist:
 *  1. Die `userId` kommt AUSSCHLIESSLICH aus `event.context.user.$id`, also aus
 *     dem Session-Cookie. Es gibt keinen Query- und keinen Body-Parameter —
 *     nichts, was ein Aufrufer benennen könnte (dieselbe Regel wie
 *     „die Mandanten-Id kommt nie vom Aufrufer").
 *  2. Jeder Contributor filtert seine Tabelle HART auf diese `userId`
 *     (`Query.equal` + Nachprüfung an der Zeile) — der Vertrag in
 *     core/server/utils/accountActivity.ts schreibt beides vor.
 *  3. Es gibt keinen Weg, an Zeilen ANDERER zu kommen: die Antwort enthält
 *     ausschließlich, was die Contributors zurückgeben, und die geben nur
 *     Eigenes zurück. Der Admin-Client, mit dem sie lesen, ist nötig, weil auf
 *     dem Kontroll-Host keine Datentür existiert, die scopen könnte — und
 *     ersetzt wird sie durch die Besitz-Spalte, nicht durch Vertrauen.
 *
 * DER ABSCHNITT „KONTO UND SICHERHEIT" (seit 2026-11-13) hängt an denselben
 * drei Sicherungen: `listAccountEvents` (core) bekommt dieselbe `userId` aus
 * der Session, filtert das Protokoll hart auf `actorId` und prüft jede Zeile
 * nach. Er läuft NICHT über die Contributor-Registry — warum, steht in
 * core/shared/accountEvents.ts — und reist trotzdem in DIESER Antwort mit:
 * eine zweite Route bräuchte einen zweiten Eintrag in `controlApiPrefixes`
 * und die Seite zwei Abrufe für eine Ansicht.
 *
 * WAS DIE ANTWORT ABSICHTLICH NICHT TUT: sie prüft NICHT, ob der Nutzer heute
 * noch Mitglied der jeweiligen Community ist. Es sind seine eigenen Texte, und
 * eine Selbstauskunft, die entfernten Mitgliedern ihre eigene Vergangenheit
 * verschweigt, wäre schlechter als eine, die sie zeigt. Die GRENZE bleibt
 * trotzdem gewahrt: fremder Inhalt taucht nie auf, und der Host einer
 * `abuse`-gesperrten oder stillgelegten Community wird gar nicht erst
 * aufgelöst — der Eintrag steht dann ohne Klickziel da.
 */

/**
 * Budget. Klein gehalten, weil hier VIER Tabellen gleichzeitig angefragt
 * werden und die Seite eine Übersicht ist, kein Archiv. Ohne Paginierung —
 * v1 zeigt das Neueste und SAGT, dass es mehr gibt (`truncated`), statt eine
 * abgeschnittene Liste als vollständig auszugeben.
 */
const PER_CONTRIBUTOR = 20
const TOTAL = 50
/**
 * Konto-Ereignisse: ein eigenes, kleineres Fenster. Sie sind selten (An- und
 * Abmeldungen zählen nicht dazu), und der Abschnitt steht ÜBER den
 * Communities — zwanzig Zeilen dort schöben die eigentliche Aktivität aus dem
 * Bild.
 */
const ACCOUNT_EVENTS = 10

export default defineEventHandler(async (event): Promise<AccountActivityResponse> => {
  // Diese Seite gehört dem Kundenbereich. Auf einem Mandanten-Host hat sie
  // nichts zu suchen (dort ist die Aktivität eine Community-Sache) — dieselbe
  // Doppelsperre wie bei den Nachbarrouten: Seite UND Route.
  if (!event.context.controlCenter) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const userId = event.context.user.$id
  const contributors = listAccountActivityContributors()

  /**
   * FAIL-SOFT MIT ANSAGE. `allSettled`, damit ein Layer mit einem Problem
   * (fehlender Index, 500) nicht die ganze Seite nimmt — aber der Ausfall
   * WIRD gemeldet. Ein stilles `catch(() => [])` liest sich als „du hast dort
   * nichts getan", und das ist eine andere Aussage als „konnte nicht laden".
   */
  const [settled, accountSettled] = await Promise.all([
    Promise.allSettled(
      contributors.map(contributor => contributor.listAccountActivity(event, userId, PER_CONTRIBUTOR)),
    ),
    // Dieselbe Regel für den Konto-Abschnitt: sein Ausfall nimmt weder die
    // Communities mit noch verschwindet er still.
    listAccountEvents(event, userId, ACCOUNT_EVENTS).then(
      (value): { ok: true, value: AccountEventsSection } => ({ ok: true, value }),
      (reason: unknown): { ok: false, reason: unknown } => ({ ok: false, reason }),
    ),
  ])

  const batches: AccountActivityEntry[][] = []
  const unavailable: string[] = []
  settled.forEach((result, index) => {
    const id = contributors[index]!.id
    if (result.status === 'fulfilled') {
      batches.push(result.value)
      return
    }
    unavailable.push(id)
    console.error(`[account/activity] Contributor '${id}' fehlgeschlagen:`, result.reason)
  })

  let account: AccountEventsSection = { events: [], truncated: false }
  if (accountSettled.ok) {
    account = accountSettled.value
  }
  else {
    unavailable.push(ACCOUNT_EVENTS_SOURCE_ID)
    console.error('[account/activity] Konto-Ereignisse fehlgeschlagen:', accountSettled.reason)
  }

  const entries = mergeAccountActivity(batches, TOTAL)
  const total = batches.reduce((sum, batch) => sum + batch.length, 0)

  /**
   * Der Host je Community über den GEBÜNDELTEN Resolver-Vertrag
   * (`registerCommunityHostResolver`) — eine Abfrage für alle Communities,
   * kein N+1 über die Projektgrenze. Fehlt ein Host, bleibt er leer
   * (fail-soft, siehe AccountActivityGroup.host).
   */
  const hosts = await resolveCommunityHosts(entries.map(entry => entry.communityId))

  return {
    account,
    groups: groupAccountActivityByCommunity(entries, hosts),
    // Zwei Gründe, ehrlich zu sein: mehr Einträge als das Gesamtbudget, ODER
    // ein Layer, der sein eigenes Fenster voll ausgeschöpft hat (dann liegt
    // dort mit hoher Wahrscheinlichkeit noch mehr).
    truncated: total > TOTAL || batches.some(batch => batch.length >= PER_CONTRIBUTOR),
    unavailable,
  }
})
