import type { H3Event } from 'h3'

/**
 * „WER HAT DIESEN MENSCHEN HERGEHOLT?" — der Vertrag hinter `Campaigner` und
 * `Champion` (F57-Stufen, 2026-08-14).
 *
 * ── DAS PROBLEM, DAS DIESER VERTRAG LÖST ──────────────────────────────────
 * Die beiden Abzeichen sind im Katalog über die Vertrauensstufe der
 * EINGELADENEN definiert („3 Eingeladene wurden Basic", „5 wurden Member").
 * Das Ereignis entsteht damit WOCHEN nach der Einladung, in der Zähler-Zeile
 * eines ANDEREN Menschen — und die Wahrheit darüber, wer wen eingeladen hat,
 * liegt in `community_invites` im CONTROL PLANE, zu dem die Runtime keinen
 * Schlüssel hat.
 *
 * Drei Wege waren denkbar, zwei sind verworfen:
 *  1. **Beim Aufstieg im Control Plane nachfragen** („wer hat diesen Menschen
 *     eingeladen?"). Das wäre ein Cross-Projekt-Aufruf an jedem Stufen-
 *     Aufstieg, also an einer Stelle, die im heißen Schreibpfad hängt — für
 *     eine Antwort, die sich NIE ÄNDERT. Und eine neue Dienst-Naht dazu.
 *  2. **Die Einladungen des Einladenden durchzählen** und ihre Stufen
 *     nachschlagen. N+1 über eine Projektgrenze, je Aufstieg.
 *  3. **Den Einladenden BEI DER ANNAHME hinterlegen** — hier gebaut. Die
 *     Annahme-Route bekommt `invitedBy` ohnehin zurück (sie zählt damit schon
 *     `invitesAccepted` für `promoter`); ihn zusätzlich an die Zähler-Zeile
 *     des Eingeladenen zu stempeln kostet EINEN Schreibvorgang, EINMAL im
 *     Leben dieser Mitgliedschaft. Danach ist der Aufstiegs-Hook eine reine
 *     Runtime-Sache ohne jede Naht: die Antwort liegt in der Zeile, die er
 *     ohnehin in der Hand hält.
 *
 * ── WARUM ES NICHT ÜBER `registerUserCounterRecorder` LÄUFT ───────────────
 * Der Zähl-Vertrag bucht ZAHLEN (Deltas). Hier wird eine ZEICHENKETTE
 * hinterlegt, und zwar genau einmal — „addiere die Id" ergibt keinen Sinn.
 * Einen Vertrag zu dehnen, bis er zwei Dinge kann, ist teurer als einen
 * zweiten daneben zu stellen, der eine Sache sagt.
 *
 * ── OHNE AUTORITÄT EIN NO-OP ──────────────────────────────────────────────
 * Eine App ohne posts-Layer hat keine `member_counters` — dort gibt es weder
 * Stufen noch Abzeichen, und eine Einladung wird trotzdem angenommen. Wie bei
 * allen Verträgen dieser Familie: wirft nie, verschluckt und meldet.
 */

export interface CommunityInviterRecord {
  /** Der EINGELADENE — an SEINER Zähler-Zeile wird hinterlegt. */
  userId: string
  /** Der EINLADENDE — er bekommt später die Aufstiege gutgeschrieben. */
  inviterId: string
}

export type CommunityInviterRecorder = (
  event: H3Event,
  record: CommunityInviterRecord,
) => Promise<void> | void

let recorder: CommunityInviterRecorder | null = null

/** Von dem Layer registriert, dem die Zähler-Zeilen gehören (Nitro-Plugin). */
export function registerCommunityInviterRecorder(fn: CommunityInviterRecorder): void {
  if (recorder) {
    console.warn('[core] registerCommunityInviterRecorder: bestehende Autorität wird ersetzt — pro Deployment ist EINE vorgesehen')
  }
  recorder = fn
}

/**
 * Den Einladenden hinterlegen. Wirft nie.
 *
 * ZWEI AUSSTIEGE, beide mit Absicht:
 *  - eine leere Id (Einladung aus der Zeit vor control-019) — es gibt nichts
 *    zu hinterlegen.
 *  - `inviterId === userId` — jemand hätte seine eigene Einladung angenommen.
 *    Heute unerreichbar (`decideInvite` lehnt bestehende Mitglieder ab), aber
 *    ein Abzeichen, das man sich selbst schicken kann, ist keines. Dieselbe
 *    Grenze zieht die Annahme-Route schon für `promoter`.
 */
export async function recordCommunityInviter(
  event: H3Event,
  record: CommunityInviterRecord,
): Promise<void> {
  if (!record.userId || !record.inviterId || record.userId === record.inviterId) return
  if (!recorder) return

  try {
    await recorder(event, record)
  }
  catch (error) {
    logEvent('warn', 'community_inviter.record_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
