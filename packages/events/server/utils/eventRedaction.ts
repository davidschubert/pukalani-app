import { AppwriteException } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_COVERS_BUCKET, type EventRow } from '../../shared/types/event'

/**
 * DIE SCHWÄRZUNG EINES TERMINS — EINE Quelle für die zwei Wege, die den Text
 * eines Termins entfernen (SEC-032, 2026-11-15):
 *  - die Moderation (`api/events/[id]/redact.post.ts`, F46): ein abgesagter
 *    Termin mit anstößigem Text;
 *  - die Kontolöschung (`eventsUserData.ts`, Davids Entscheidung 2026-11-15
 *    „Termine einer gelöschten Person: absagen und Texte leeren").
 * Vorher stand die Liste der Felder nur in der Route, und die Kontolöschung
 * leerte NUR den Namen — Titel, Beschreibung, Ort, Adresse, Links,
 * Übersetzungen und Titelbild blieben.
 *
 * Was NICHT hier steht, bleibt beim Aufrufer: Meldungen auflösen (nur die
 * Moderation hat einen Anlass), Status und Organisator (nur die Löschung).
 */

/**
 * Jeder Text, den der Autor gewählt hat (Davids Entscheidung 2026-08-03,
 * Begründung im Kopf von `redact.post.ts`): Titel, Beschreibung, Ort,
 * Adresse, Ortshinweise UND die beiden Links. Dazu `coverFileId` (das Bild
 * wird gelöscht, die Zeile zeigt danach auf nichts mehr).
 *
 * DER ÜBERSETZUNGS-CACHE GEHÖRT ZUM TEXT (events-013, 2026-08-18): er trägt
 * Titel und Beschreibung wortgleich in bis zu sechs Sprachen. Ihn stehen zu
 * lassen wäre keine Schwärzung, sondern eine Schwärzung mit Kopie daneben —
 * der Knopf „Übersetzen" gäbe den Text als Cache-Treffer sofort wieder
 * heraus. Wer diese Zeile entfernt, hebt F46 auf.
 *
 * `organizerName` steht bewusst NICHT hier: für die Moderation ist er
 * Identität, nicht Inhalt (Zurechenbarkeit). Die Kontolöschung leert ihn
 * selbst — dort ist die Person weg.
 */
export const EVENT_REDACTED_FIELDS = {
  title: '',
  description: '',
  location: null,
  address: null,
  locationNotes: null,
  url: null,
  replayUrl: null,
  coverFileId: null,
  translations: '',
} as const

export interface RedactEventOptions {
  /**
   * Schreibt die Felder in die Zeile — der Aufrufer wählt die Klinke: die
   * Moderation die Datentür (`tenantDb`, Operator), die Kontolöschung den
   * Admin-Client (mandantenübergreifend, außerhalb der Tür).
   */
  write: (data: Record<string, unknown>) => Promise<unknown>
  /** Weitere Felder im SELBEN Schreibvorgang (Marker, Status, Organisator). */
  extra?: Record<string, unknown>
  /**
   * Was ein gescheitertes Löschen des Titelbilds bedeutet:
   *  - `'log'` (Moderation): weiter, mit Log-Zeile — die Schwärzung soll
   *    nicht an einer Datei scheitern, ein zweiter Klick ist idempotent;
   *  - `'throw'` (Kontolöschung): Abbruch VOR dem Schreiben der Zeile. Die
   *    Zeile trägt dann noch `organizerId` und `coverFileId`, ein zweiter Lauf
   *    findet beides wieder — sonst bliebe eine Datei zurück, auf die nichts
   *    mehr zeigt, und das Konto wäre trotzdem gelöscht.
   * In beiden Fällen ist 404 („schon weg") Erfolg.
   */
  coverFailure: 'log' | 'throw'
}

/**
 * Schwärzt einen Termin. REIHENFOLGE MIT GRUND: erst die Datei, dann die
 * Zeile, dann der Feed.
 *
 * Datei zuerst, weil die Zeile der einzige Weg zur Datei ist: wäre
 * `coverFileId` schon geleert und das Löschen der Datei danach gescheitert,
 * fände sie niemand mehr (bei der Kontolöschung wäre zudem `organizerId`
 * weg, der Termin also für einen zweiten Lauf unauffindbar). Scheitert
 * dagegen nach gelöschter Datei das Schreiben der Zeile, zeigt sie kurz auf
 * ein fehlendes Bild — ein zweiter Versuch bekommt 404, also Erfolg.
 *
 * Text und Marker in EINEM Schreibvorgang: sie sind dieselbe Aussage; ein
 * zweiter Schritt könnte scheitern und hinterließe leeren Text ohne
 * Erklärung oder eine Erklärung ohne Wirkung.
 *
 * Der Feed zuletzt: seine Einträge tragen einen eigenen Schnappschuss des
 * Titels ('event.published', 'event.replay_published'), der jede Änderung an
 * der Zeile überlebt. Best-effort im Core-Vertrag (wirft nie, loggt).
 */
export async function redactEventContent(
  event: H3Event,
  row: Pick<EventRow, '$id' | 'coverFileId'>,
  options: RedactEventOptions,
): Promise<void> {
  if (row.coverFileId) {
    await createAdminClient(event).storage
      .deleteFile({ bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId })
      .catch((error: unknown) => {
        if (error instanceof AppwriteException && error.code === 404) return
        if (options.coverFailure === 'throw') throw error
        console.error(`[events] Titelbild ${row.coverFileId} des geschwärzten Events ${row.$id} konnte nicht gelöscht werden — die Datei bleibt im Bucket abrufbar:`, error)
      })
  }

  await options.write({ ...EVENT_REDACTED_FIELDS, ...options.extra })

  await removeActivitiesForObject(event, { objectType: 'event', objectId: row.$id })
}
