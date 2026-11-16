import { decideMailBatch } from '../../../../../../core/shared/mailBudget'
import {
  createInsightsNewsletterSendSchema,
  decideInsightsSendStart,
  INSIGHTS_NEWSLETTER_BATCH,
  insightsNewsletterLocaleOf,
} from '../../../../../shared/insightsNewsletter'
import { INSIGHTS_RUNS_TABLE } from '../../../../../shared/insightsRows'
import type { InsightsNewsletterSendBatchResponse } from '../../../../../shared/types/insightsApi'
import type { RunLeaseRow, RunLeaseStore } from '../../../../../../core/server/utils/runLease'

/**
 * DEN NEWSLETTER ZU DIESEM BEITRAG SCHICKEN (`insights.manage`, BI1 I5b) —
 * EINEN Stapel je Aufruf.
 *
 * ── NUR VON HAND, NIE AUTOMATISCH (Davids Entscheidung 2026-10-27) ──────
 * Diese Route ist der EINZIGE Weg nach draussen. Es gibt keine Auslösung bei
 * der Freigabe, keinen Sweep und kein Intervall-Plugin, und das ist keine
 * Sparmaßnahme: §3.3 sagt wörtlich „ohne Davids Zeichen erscheint auch in
 * einer Woche nichts", und ein Versand an echte Menschen, den ein
 * Zustandswechsel auslöst, ist genau der Unfall, den man nicht zurückholt
 * (ein falsch gesetztes `published` wäre dann fünfhundert Mails). Der
 * Wochentakt aus §3.3 ist eine Zusage an die REDAKTION, kein Automatismus.
 *
 * ── DER RIEGEL GILT AUCH HIER ───────────────────────────────────────────
 * `pukalani.insights.newsletter.enabled` aus ⇒ 404. Ist das Anmelde-Formular
 * dunkel, geht auch nichts raus.
 *
 * ── DREI NEIN, DREI GRÜNDE ──────────────────────────────────────────────
 *  · `not_public` (409) — ein Entwurf hat keine öffentliche Adresse.
 *  · `no_public_address` (409) — der Beitrag ist freigegeben, hat draussen
 *    aber keine Seite: gesperrtes Format oder ein Markenprofil ohne
 *    Marken-Zeile. Eine Mail darauf wären fünfhundert Klicks in eine
 *    Fehlerseite.
 *  · `already_sent` (409) — dieser Beitrag ist durch. DAS ist die Regel „ein
 *    Beitrag, eine Mail"; ein zweiter Versand ist eine Entscheidung, die
 *    niemand getroffen hat.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ──────────────────────────────────────
 *  1. Recht, Riegel, Adresse — bevor irgendetwas geschrieben wird.
 *  2. Sende-Zeile lesen und entscheiden (`decideInsightsSendStart`).
 *  3. Beim START: Empfänger ZÄHLEN, dann die Zeile anlegen — VOR der ersten
 *     Mail (Begründung an `createInsightsSendRow`). Ein 409 aus dem
 *     Unique-Index ist das Rennen zweier offener Reiter: die Zeile wird neu
 *     gelesen und der Lauf FORTGESETZT, nicht ein zweiter gestartet.
 *  4. DIE LAUF-SPERRE nehmen (BE-010, `insights_runs`) — ein zweiter
 *     gleichzeitiger Aufruf bekommt 409 `run_running` — und die Sende-Zeile
 *     UNTER der Sperre neu lesen und neu entscheiden.
 *  5. EINEN Stapel abarbeiten (höchstens 50, höchstens 40 s), schreiben,
 *     Sperre beenden, antworten.
 *
 * ── DIE EINLEITUNG KOMMT NUR BEIM START AUS DEM FORMULAR ────────────────
 * Beim Fortsetzen steht sie in der Sende-Zeile, und von dort wird sie gelesen.
 * Sonst bekäme die zweite Hälfte der Liste einen anderen Text als die erste —
 * und zwar ohne dass es jemandem auffällt, weil niemand zwei Postfächer
 * vergleicht. Ein mitgeschickter `intro` beim Fortsetzen wird also bewusst
 * IGNORIERT; das Formular zeigt das Feld dann nicht mehr an.
 *
 * ── DIE SEITE RUFT, BIS `done` ──────────────────────────────────────────
 * So steht keine Route minutenlang offen (Begründung an
 * `INSIGHTS_NEWSLETTER_BATCH`), und der Mensch sieht einen Balken statt eines
 * hängenden Knopfes. `aborted` sagt der Seite, dass sie AUFHÖREN soll zu
 * rufen: dann fehlt der Mailer, und jeder weitere Aufruf scheiterte gleich.
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterSendBatchResponse> => {
  requirePermission(event, 'insights.manage')
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, createInsightsNewsletterSendSchema().parse)

  const target = await resolveInsightsSendTarget(event, id)
  if (target.blocked === 'not_public') {
    throw createError({ status: 409, statusText: 'Post not public', data: { code: 'not_public' } })
  }
  if (target.blocked) {
    throw createError({ status: 409, statusText: 'Post without public address', data: { code: 'no_public_address' } })
  }

  let row = await loadInsightsSendRow(event, id)
  const decision = decideInsightsSendStart(row)
  if (decision === 'already_sent') throw insightsSendAlreadySent()

  /**
   * DIE MAIL-BREMSE (RS1 a, Davids Entscheidung 2026-11-08) — VOR dem ersten
   * Schreibvorgang.
   *
   * Wir bleiben auf dem freien Resend-Tarif (100 Mails am Tag für ALLES, auch
   * OTP und Verifizierung) und halten stattdessen hier an. Die Prüfung steht
   * mit Absicht VOR dem `start`-Zweig: ein angehaltener Versand legt dann
   * KEINE Sende-Zeile an, der Beitrag bleibt unberührt, und die Redaktion
   * drückt morgen denselben Knopf zum ersten Mal.
   *
   * Nach den Nein des BEITRAGS (nicht öffentlich, keine Adresse, schon raus):
   * die sind lokal, genauer und kosten keinen Ruf nach draussen.
   *
   * `allowed` ist der Rest des Tages, gedeckelt auf die Stapelgröße — ein
   * TEIL-Stapel ist der Normalfall an einem engen Tag, nicht ein Fehler
   * (Begründung an `decideMailBatch`).
   */
  const budget = decideMailBatch({
    remaining: await mailDailyRemaining(event),
    batchSize: INSIGHTS_NEWSLETTER_BATCH,
  })
  if (!budget.go) {
    // Ein FACHLICHER Grund: er reist als `reason` im Envelope zum Client
    // (`budget_unknown` = kein Schlüssel gesetzt, `budget_exhausted` = der Tag
    // ist voll) und steht dort als eigener Satz in der Oberfläche.
    throw createError({
      status: 409,
      statusText: 'Mail budget not available',
      data: { code: budget.code },
    })
  }

  if (decision === 'start') {
    const recipients = await countInsightsNewsletterRecipients(event)
    try {
      row = await createInsightsSendRow(event, {
        postId: id,
        subject: insightsSendSubjectPreview(target.post),
        intros: { introDe: body.introDe, introEn: body.introEn },
        locale: insightsNewsletterLocaleOf(target.post.baseLocale),
        recipients,
      })
    }
    catch (error) {
      // Das Rennen zweier offener Reiter. Es gibt jetzt eine Zeile; wer sie
      // angelegt hat, ist gleichgültig — gearbeitet wird auf ihr.
      if (!isInsightsRowConflict(error)) throw error
      row = await loadInsightsSendRow(event, id)
      if (!row) throw insightsStorageError(error, `newsletter send race ${id}`)
      if (decideInsightsSendStart(row) === 'already_sent') throw insightsSendAlreadySent()
    }
  }

  // Nach jedem Zweig oben steht eine Zeile. Fehlt sie trotzdem, ist das kein
  // Fall, über den man hinwegsehen darf: ohne Fortschrittsstand gibt es keinen
  // Versand (sonst schickt der nächste Druck alles erneut).
  if (!row) throw insightsStorageError(new Error('send row missing'), `newsletter send ${id}`)

  /**
   * DIE LAUF-SPERRE (BE-010, Davids Entscheidung: „Der Newsletter-Versand
   * sperrt sich gegen einen zweiten gleichzeitigen Start").
   *
   * Der Unique-Index oben verhindert zwei VERSÄNDE, nicht zwei STAPEL: zwei
   * gleichzeitige Aufrufe (zweiter Reiter, ein erneuter Klick nach einer
   * abgerissenen Antwort) lasen denselben Cursor und schickten dieselben bis
   * zu fünfzig Mails zweimal. Die Sperre ist eine Zeile mit fester Id je
   * (Sende-Zeile, Nummer) in `insights_runs` (Kopf von
   * `core/server/utils/runLease.ts`); der Verlierer bekommt 409
   * `run_running`, und die Seite zeigt dafür einen ruhigen Hinweis.
   */
  const leases = appwriteRunLeaseStore({ ...insightsDb(event), tableId: INSIGHTS_RUNS_TABLE })
  const { lease } = await acquireRunLease(leases, { scope: 'newsletter', subject: row.$id })

  /**
   * ERST MIT DER SPERRE DIE ZEILE NEU LESEN — sonst ist die Sperre nur halb.
   *
   * Ein Aufruf, der seine Zeile VOR dem Ende eines Vorgängers gelesen hat und
   * die Sperre erst DANACH bekommt, hielte einen veralteten Cursor in der
   * Hand und schickte von dort aus noch einmal. Nach dem Nehmen der Sperre
   * kann niemand mehr schreiben; was jetzt gelesen wird, gilt.
   */
  let fresh: Awaited<ReturnType<typeof loadInsightsSendRow>>
  try {
    fresh = await loadInsightsSendRow(event, id)
  }
  catch (error) {
    await endLease(leases, lease, 'failed')
    throw error
  }
  if (!fresh) {
    await endLease(leases, lease, 'failed')
    throw insightsStorageError(new Error('send row missing'), `newsletter send ${id}`)
  }
  if (decideInsightsSendStart(fresh) === 'already_sent') {
    await endLease(leases, lease, 'rejected')
    throw insightsSendAlreadySent()
  }
  row = fresh

  /**
   * Der Herzschlag hält die Sperre, solange der Stapel läuft. Stirbt der
   * Prozess mitten im Stapel, bleibt er stehen, und nach zwei Minuten ist der
   * Versand von selbst wieder startbar (gerechnet, kein Aufräumer). Der
   * Cursor steht dann am Stapel-ANFANG — die bekannte Grenze aus dem Kopf von
   * `insightsNewsletterSend.ts` („begrenzt den Schaden eines Abbruchs auf
   * fünfzig"; den Rest fängt der `Resend-Idempotency-Key` je Mail).
   */
  const alive = keepRunLeaseAlive(leases, lease)
  let outcome = 'failed'
  let result: Awaited<ReturnType<typeof runInsightsNewsletterBatch>>
  try {
    result = await runInsightsNewsletterBatch(event, {
      postId: id,
      post: target.post,
      href: target.href,
      // Beim Fortsetzen gilt der Text der Zeile, nicht der des Formulars (s. Kopf).
      intros: { introDe: row.introDe ?? '', introEn: row.introEn ?? '' },
      row,
      maxBatch: budget.allowed,
      leaseLost: () => alive.lost(),
    })
    outcome = result.aborted ? 'failed' : 'done'
  }
  finally {
    alive.stop()
    await endLease(leases, lease, outcome)
  }

  const remaining = result.done ? 0 : await countInsightsNewsletterRecipients(event, result.cursor)

  return {
    sent: result.sent,
    failed: result.failed,
    remaining,
    done: result.done,
    aborted: result.aborted,
    send: result.state,
  }
})

/**
 * DIE SPERRE BEENDEN — und dabei nie die eigentliche Antwort verdecken.
 *
 * Scheitert das Schreiben des Endes, steht der Lauf weiter auf „läuft", bis
 * sein Herzschlag zwei Minuten alt ist; danach ist der Versand von selbst
 * wieder startbar. Das ist lästig, aber kein Grund, einer Redaktion einen
 * gelungenen Stapel als Fehler zu melden. Ins Log nur die Meldung.
 */
async function endLease(
  store: RunLeaseStore,
  lease: Pick<RunLeaseRow, '$id'>,
  outcome: string,
): Promise<void> {
  try {
    await finishRunLease(store, lease, { outcome })
  }
  catch (error) {
    console.error('[insights] Versand-Sperre nicht beendet:', error instanceof Error ? error.message : 'unknown')
  }
}
