import type { MaybeRefOrGetter } from 'vue'
import {
  type BrandAiRejectionCode,
  isBrandAiRejectionCode,
} from '../../shared/brandAiLimits'
import { decodeBrandGenerationChunk } from '../../shared/brandGeneration'
import { isBrandUiLocale } from '../../shared/brandUiLocale'
import type { BrandNextSessionRef } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE ANTWORT-SEITE DES GESPRÄCHS (P3.2) — der Berater reagiert auf das, was
 * der Mensch getippt hat.
 *
 * Sie ist die kleine Schwester von `useBrandGeneration()` und teilt deren
 * Protokoll, deren Leser (`decodeBrandGenerationChunk`) und deren
 * Store-Aktionen. Was fehlt, ist alles, was mit einem FELD zu tun hat: kein
 * `slot.ready`, keine Entwurfs-Markierung. Ein Zug ist eine Sprechblase, sonst
 * nichts.
 *
 * ── DIE `revision` REIST TROTZDEM MIT, UND SIE MUSS ÜBERNOMMEN WERDEN ─────
 * (Kailua-Befund 2, 2026-09-08 — der teuerste Fehler dieser Datei.)
 *
 * „Ein Zug schreibt keinen Slot" stimmt, „ein Zug bewegt die `revision` nie"
 * stimmt NICHT: die Sammel-Session schreibt ihren Zwischenstand, und der
 * „hat mitgelesen"-Stempel (`briefDelivered`) schreibt die Kapitel-Zeile —
 * beide erhöhen sie, und der Abschluss-Frame sagt es ausdrücklich („GELESEN,
 * nicht erhöht — AUSSER …", converse.post.ts). Dieser Leser hat die Zahl bis
 * hierher WEGGEWORFEN. Der nächste Autosave schickte damit eine Fassung, die
 * der Server längst überholt hatte, kassierte 409 — und der Mensch bekam in
 * einem EINZIGEN offenen Tab den Dialog „woanders geändert" über eine
 * Serverfassung, die für sein Feld leer war. Wer „Serverfassung laden" drückte,
 * verlor seine Eingabe. Dahinter blieben Bestätigungen unbemerkt liegen
 * (Befund 3: 10/10 angezeigt, 1/10 gespeichert).
 *
 * `applyGenerationRevision` nimmt nur GRÖSSERE Zahlen an — ein Zug, der die
 * gelesene Fassung meldet (der Normalfall), ändert damit nichts.
 *
 * ── DREI ARTEN, NICHTS ZU TUN — UND ZWEI DAVON SIND STILL ────────────────
 * 1. `{ conversed: false }` (kein Strom): der Kill-Switch ist aus, der Zug lief
 *    schon oder der Baustein ist gerade belegt. Die Werkstatt verhält sich
 *    exakt wie vor P3.2 — die Antwort steht im Feld, die nächste Frage
 *    erscheint. KEIN Hinweis: es ist nichts schiefgegangen.
 * 2. Ein abgerissener Strom, ein kaputter Anbieter, ein leerer Zug: die
 *    angefangene Sprechblase verschwindet (`endGeorgeMessage` wirft leere Züge
 *    weg), und mehr passiert nicht. Auch hier kein Hinweis — die Antwort des
 *    Menschen ist gespeichert, die Arbeit geht weiter, und ein roter Balken
 *    über eine ausgefallene Reaktion wäre lauter als der Verlust.
 * 3. Die DROSSEL (429) ist die eine Ausnahme. Sie sagt etwas, das der Mensch
 *    sonst selbst herausfinden müsste, nachdem der Berater dreimal geschwiegen
 *    hat: „nicht kaputt, sondern für heute genug". Deshalb reist ihr Grund als
 *    `failureCode` nach oben und wird zu einer ruhigen Zeile.
 *
 * ── DER DOPPEL-SENDE-SCHUTZ STEHT AN ZWEI STELLEN ────────────────────────
 * Hier (`pending` — ein zweiter Aufruf kehrt sofort um) und in der Oberfläche
 * (der Senden-Knopf ist währenddessen aus). Zwei, weil sie verschiedene Dinge
 * tun: der Knopf verhindert den Griff, dieser hier den Wettlauf. Der Server hat
 * noch einen dritten (Idempotenzschlüssel + Baustein-Sperre) — der ist die
 * einzige Sicherung, die auch über zwei Browser-Tabs hinweg greift.
 */

/** Nur die Drossel wird gemeldet; alles andere bleibt still (s. Kopf). */
export type BrandConversationFailure = BrandAiRejectionCode

/**
 * DIE ZWEI ABLEHNUNGEN, DIE EIN MENSCH ZU SEHEN BEKOMMT (BW2 3c-i).
 *
 * Sie sind die Ausnahme von „alles andere bleibt still": beide sagen etwas
 * über die SESSION, die der Mensch gerade angeklickt hat — ein stiller
 * Abbruch sähe hier aus wie ein kaputter Knopf. Alles Übrige bleibt bei der
 * Regel im Kopf: ein ausgefallener Zug ist kein Unglück.
 */
export type BrandConversationSessionFailure = 'session_locked' | 'session_foreign'

export interface BrandConverseInput {
  /** Was der Mensch getippt hat — beim ERÖFFNUNGSZUG hat niemand etwas gesagt. */
  text?: string
  /**
   * ERÖFFNUNGSZUG: George spricht als Erster in dieser Session (§6). Die Route
   * ist idempotent — hat die Session schon einen Berater-Zug, antwortet sie
   * `{ conversed: false, skipped: true }`.
   */
  opening?: true
  /**
   * ABSCHLUSSZUG: die Session ist bestätigt, George würdigt sie in einem Satz
   * und sagt, wohin es weitergeht (Davids Entscheidung 2026-09-09). Die Route
   * prüft die Bestätigung selbst und antwortet sonst
   * `{ conversed: false, skipped: true }` — sie glaubt dem Rumpf nicht.
   */
  closing?: true
  /** Die Session, in der dieser Zug stattfindet (BW2 §6) — seit 3c-i immer gesetzt. */
  sessionKey?: string
  /** Der Frage-Slot, dessen Antwort das war — bei einer freien Frage keiner. */
  slotId?: string
  /** Wortlaut dieser Frage, wie er im Panel stand. */
  question?: string
  /** Der Slot, dessen Frage das Panel als nächste zeigt. */
  nextSlotId?: string
  nextQuestion?: string
  /** Lokal übersprungene Slots („Weiß ich nicht") — ohne sie rechnet der Server anders. */
  skipped?: readonly string[]
}

export interface UseBrandConversationOptions {
  /** Vor dem Zug ausführen — die Seite reicht hier `autosave.flush` herein. */
  beforeSend?: () => Promise<void> | void
}

async function envelopeReason(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null) as { reason?: unknown } | null
  return typeof body?.reason === 'string' ? body.reason : null
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`
}

export function useBrandConversation(
  profileId: MaybeRefOrGetter<string>,
  options: UseBrandConversationOptions = {},
) {
  const store = useBrandWorkspaceStore()
  // Die Sprache der SEITE, nicht die des Cookies — dieselbe Begründung wie bei
  // der Generierung (`shared/brandUiLocale.ts`).
  const { locale } = useI18n()

  /** Schreibt der Berater gerade? Daran hängt der Schreibindikator im Panel. */
  const pending = ref(false)
  const failureCode = ref<BrandConversationFailure | null>(null)

  /**
   * KAM ÜBERHAUPT EIN ZUG? — und WELCHE Frage hat er gestellt?
   *
   * Beides braucht die Werkstatt für genau eine Entscheidung: ob unter dem Zug
   * noch die Katalog-Frage stehen soll. Hat der Berater sie gerade in eigenen
   * Worten gestellt, wäre sie ein zweites Mal genau das Formular-Gefühl, gegen
   * das diese Runde gebaut ist.
   *
   * Der Server sagt es im Abschluss-Frame (`slotId`), und er sagt es GENAU
   * dann, wenn er dem Berater den Wortlaut auch wirklich gegeben hat — bei
   * einem überholten Stand steht dort `''`, der Berater hat auf die Frage
   * daneben verwiesen, und die Katalog-Frage gehört sichtbar hin. Aus dem
   * AUSBLEIBEN eines Frames lässt sich das nicht schliessen: „nichts gekommen"
   * ist auch der Zustand eines abgerissenen Stroms.
   */
  const spoke = ref(false)
  const coveredSlotId = ref<string | null>(null)

  /**
   * HAT DIESER ZUG AUF DEM SERVER ETWAS GESCHRIEBEN? (Kailua-Befund 4)
   *
   * Genau dann, wenn die gemeldete `revision` grösser ist als die gelesene.
   * Heute gibt es dafür zwei Auslöser (Sammel-Session, „hat mitgelesen"-
   * Stempel), und der erste ist der teure: der zusammengelegte Wert von
   * `a.facts` entsteht IM SERVER, und kein Frame trägt ihn. Ohne diese Flanke
   * sähe die Bühne ihn nie — sie zeigte weiter den Rohtext, den der Mensch als
   * ERSTEN Teil getippt hat.
   */
  const wrote = ref(false)

  /**
   * ES KAM GAR KEIN ZUG ZUSTANDE (Kailua-Befund 4, Absicherung).
   *
   * Gesetzt, wenn die Route vor dem Strom umkehrt: Kill-Switch aus,
   * Baustein-Sperre belegt, wiederholter Schlüssel, Drossel, eine
   * Session-Ablehnung. In ALL diesen Fällen ist auch der Sammel-Schritt nicht
   * gelaufen — die Route bucht und schreibt ihn erst hinter diesen Toren.
   *
   * Die Werkstatt braucht die Auskunft für genau eine Entscheidung: die
   * Antwort auf einen Sammel-Teil gehört normalerweise dem Server. Läuft dort
   * nichts, gäbe es niemanden, der sie aufhebt — dann schreibt der Browser sie
   * doch, und die Werkstatt verhält sich wie vor P3.2. Ein abgerissener STROM
   * zählt ausdrücklich NICHT dazu: dort kann der Server den Teil längst
   * gespeichert haben, und ein zweiter Schreiber machte daraus zwei Wahrheiten.
   */
  const noTurn = ref(false)

  /**
   * WOHIN ES NACH DIESEM ZUG WEITERGEHT (Auto-Weiter, §5) — der Wegweiser aus
   * dem Abschluss-Frame, gerechnet auf dem SERVER-Stand. `null` heisst „bleib,
   * wo du bist"; die Entscheidung DARF ich jetzt wechseln trifft nicht dieser
   * Leser, sondern `decideAutoAdvance` (shared).
   */
  const nextStop = ref<BrandNextSessionRef | null>(null)

  /**
   * DIE SESSION-ABLEHNUNG (400/409) — der eine Fall, in dem die Werkstatt
   * etwas SAGEN muss (s. `BrandConversationSessionFailure`).
   */
  const sessionFailure = ref<BrandConversationSessionFailure | null>(null)

  let controller: AbortController | null = null

  async function converse(input: BrandConverseInput): Promise<void> {
    if (pending.value) return

    // ERST SPEICHERN, DANN REDEN: der Server baut den Zug aus dem GESPEICHERTEN
    // Stand des Bausteins und rechnet daraus auch, welche Frage als nächste
    // dran ist. Ohne dieses Ausspülen hielte er die gerade gegebene Antwort für
    // noch offen und liesse den Berater dieselbe Frage ein zweites Mal stellen.
    await options.beforeSend?.()

    const stepKey = store.stepKey
    if (!stepKey) return

    controller = new AbortController()
    pending.value = true
    failureCode.value = null
    sessionFailure.value = null
    spoke.value = false
    coveredSlotId.value = null
    wrote.value = false
    noTurn.value = false
    nextStop.value = null

    let turnId = ''

    try {
      const response = await fetch(
        `/api/brand/profiles/${toValue(profileId)}/steps/${stepKey}/converse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          body: JSON.stringify({
            // BEIM ERÖFFNUNGS- UND BEIM ABSCHLUSSZUG DARF KEIN `text`
            // MITREISEN: das Schema weist beides ausdrücklich ab (drei Formen,
            // ein Rumpf).
            ...(input.opening
              ? { opening: true }
              : input.closing ? { closing: true } : { text: input.text }),
            ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
            ...(input.slotId ? { slotId: input.slotId } : {}),
            ...(input.question?.trim() ? { question: input.question.trim() } : {}),
            ...(input.nextSlotId ? { nextSlotId: input.nextSlotId } : {}),
            ...(input.nextQuestion?.trim() ? { nextQuestion: input.nextQuestion.trim() } : {}),
            ...(input.skipped?.length ? { skipped: [...input.skipped] } : {}),
            ...(isBrandUiLocale(locale.value) ? { uiLocale: locale.value } : {}),
            idempotencyKey: newIdempotencyKey(),
          }),
          signal: controller.signal,
        },
      )

      if (!response.ok || !response.body) {
        // Nur die Drossel nennt ihren Grund; jedes andere Nein bleibt still —
        // AUSSER den zwei Session-Ablehnungen, die von der Wahl des Menschen
        // handeln (`session_locked` 409, `session_foreign` 400).
        const reason = response.status === 429 || response.status === 409 || response.status === 400
          ? await envelopeReason(response)
          : null
        failureCode.value = response.status === 429 && isBrandAiRejectionCode(reason) ? reason : null
        sessionFailure.value = reason === 'session_locked' || reason === 'session_foreign'
          ? reason
          : null
        noTurn.value = true
        return
      }

      // `{ conversed: false }` — kein Strom, kein Zug, kein Hinweis (s. Kopf).
      // Erkannt am Kopf und nicht am Rumpf: den Rumpf zu lesen hiesse, den
      // Strom anzufassen, bevor klar ist, dass es einer ist.
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        noTurn.value = true
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const step = decodeBrandGenerationChunk(buffer, decoder.decode(value, { stream: true }))
        buffer = step.buffer
        for (const item of step.events) {
          turnId = item.generationId
          if (item.type === 'generation.started') store.beginGeorgeMessage(item.generationId)
          else if (item.type === 'message.delta') store.appendGeorgeDelta(item.generationId, item.text)
          else if (item.type === 'generation.completed') {
            spoke.value = true
            coveredSlotId.value = item.slotId || null
            // s. Kopf: der Zug kann die Fassung bewegt haben (Sammel-Session,
            // „hat mitgelesen"-Stempel). `wrote` sagt der Seite, dass es einen
            // neuen SERVER-Stand gibt, den nur ein Abruf zeigen kann.
            wrote.value = item.revision > store.revision
            store.applyGenerationRevision(item.revision)
            // ANTWORT-MÖGLICHKEITEN, falls der Zug eine Wahl anbietet (Davids
            // Anforderung 2026-09-04). VOR dem Abschluss gesetzt, damit der Zug
            // in EINEM Schritt fertig und beknopft wird — sonst rendert die
            // Bühne für einen Wimpernschlag eine Frage ohne ihre Knöpfe.
            if (item.options?.length) store.setGeorgeMessageOptions(item.generationId, item.options)
            // Das BESTÄTIGUNGS-Angebot (Davids Entscheidung 2026-09-09) — aus
            // demselben Grund vor dem Abschluss: der Zug wird in EINEM Schritt
            // fertig und beknopft.
            if (item.confirm) store.setGeorgeMessageConfirm(item.generationId)
            // Der Wegweiser des Servers (§5) — gelesen, nie gerechnet.
            nextStop.value = item.next ?? null
            store.endGeorgeMessage(item.generationId)
          }
          // `slot.ready` kommt hier NIE — die Route hat keinen Pfad dorthin.
          // Ein Zweig dafür wäre ein Angebot an den nächsten Umbau.
          else store.endGeorgeMessage(item.generationId)
        }
      }

      // Der Strom endete ohne Abschluss-Frame. Die Sprechblase darf nicht mit
      // blinkendem Cursor stehen bleiben; ein Hinweis ist es trotzdem nicht.
      if (turnId) store.endGeorgeMessage(turnId)
    }
    catch {
      // Abbruch UND Netzfehler: die angefangene Blase schliessen, sonst nichts.
      if (turnId) store.endGeorgeMessage(turnId)
    }
    finally {
      controller = null
      pending.value = false
    }
  }

  function stop(): void {
    controller?.abort()
  }

  function dismissFailure(): void {
    failureCode.value = null
  }

  /** Der Toast ist gezeigt — die Meldung darf nicht ein zweites Mal feuern. */
  function dismissSessionFailure(): void {
    sessionFailure.value = null
  }

  if (import.meta.client) {
    onBeforeUnmount(() => stop())
  }

  /** Beim Baustein-Wechsel beginnt ein neues Gespräch (§3e). */
  function reset(): void {
    spoke.value = false
    coveredSlotId.value = null
    wrote.value = false
    noTurn.value = false
    failureCode.value = null
    sessionFailure.value = null
    nextStop.value = null
  }

  return {
    pending,
    failureCode,
    sessionFailure,
    spoke,
    coveredSlotId,
    wrote,
    noTurn,
    nextStop,
    converse,
    stop,
    dismissFailure,
    dismissSessionFailure,
    reset,
  }
}
