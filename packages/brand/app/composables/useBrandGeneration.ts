import type { MaybeRefOrGetter } from 'vue'
import {
  type BrandAiRejectionCode,
  isBrandAiRejectionCode,
} from '../../shared/brandAiLimits'
import {
  type BrandGenerationFailureCode,
  type BrandGenerationOutcome,
  decodeBrandGenerationChunk,
} from '../../shared/brandGeneration'
import { isBrandUiLocale } from '../../shared/brandUiLocale'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DER STREAMING-CLIENT (§3e) — er hört zu, während George schreibt.
 *
 * `fetch` + `ReadableStream`, nicht `EventSource`: ein `EventSource` kann nur
 * GET und trüge weder Rumpf noch Abbruch. Gelesen wird mit
 * `decodeBrandGenerationChunk()` aus `shared/` — derselben puren Regel, mit der
 * der Server schreibt.
 *
 * ── VIER ZUSTÄNDE, UND KEIN FÜNFTER ───────────────────────────────────────
 * `idle → streaming → done | failed`. Was schiefging, steht in `failureCode`
 * und ist entweder einer der Server-Codes oder `request_rejected` (ein Gate hat
 * schon vor dem Strom mit HTTP abgewiesen). Die Oberfläche macht daraus einen
 * ruhigen Hinweis — `ai_disabled` und `no_generator` sind BETRIEBSZUSTÄNDE, kein
 * Unglück: der Stand bleibt voll bearbeitbar (§9b.5), und ein Fehler-Toast
 * behauptete das Gegenteil.
 *
 * ── ERST SPEICHERN, DANN GENERIEREN ───────────────────────────────────────
 * Der Server baut den Prompt aus den GESPEICHERTEN Quell-Slots. Läuft noch eine
 * entprellte Eingabe, entwürfe George aus einem Stand, den der Mensch gerade
 * überholt hat. Deshalb `beforeGenerate` — die Seite reicht `autosave.flush`
 * herein.
 *
 * ── DIE NEUE `revision` WIRD ÜBERNOMMEN, UND ZWAR HIER ────────────────────
 * Die Route hat den Entwurf schon geschrieben (Persistenz vor `completed`,
 * Plan §6) und damit `brand_steps.revision` erhöht. Ohne `applyGenerationRevision`
 * schickte der nächste Autosave die ALTE Fassung — und der Mensch bekäme den
 * 409-Konfliktdialog für eine Änderung, die er selbst ausgelöst hat.
 *
 * ── DER ENTWURF IST EINE LOKALE EINGABE ───────────────────────────────────
 * `slot.ready` schreibt in `localEdits`, MARKIERT als Georges Entwurf
 * (§3b.3) — nicht in `serverSlots`. Zwei Fassungen bleiben zwei Fassungen: der
 * 409-Vertrag hängt genau daran, und ein Entwurf, der sich als Serverfassung
 * ausgäbe, machte den nächsten echten Konflikt unauflösbar.
 */

export type BrandGenerationStatus = 'idle' | 'streaming' | 'done' | 'failed'

/**
 * Server-Codes, die vier Drossel-Gründe und der eine Fall, den es nur beim
 * Client gibt (`request_rejected` = irgendein Gate hat vor dem Strom mit HTTP
 * abgewiesen, ohne uns einen Grund zu nennen).
 */
export type BrandGenerationClientFailure =
  | BrandGenerationFailureCode
  | BrandAiRejectionCode
  | 'request_rejected'
  /** Das Bereitschafts-Gate hat abgelehnt (409) — zu wenig Material (george-a-4). */
  | 'not_ready'
  /**
   * Die Bestätigungs-Sperre hat abgelehnt (409) — der Slot ist zu, bis
   * „Korrigieren" ihn öffnet. Ein eigener Code neben `not_ready`, weil beide
   * 409 sind und VERSCHIEDENE Dinge sagen: „hol mehr Material" gegen „du hast
   * das schon entschieden".
   */
  | 'slot_confirmed'

export interface UseBrandGenerationOptions {
  /** Vor dem Start ausführen — die Seite reicht hier `autosave.flush` herein. */
  beforeGenerate?: () => Promise<void> | void
}

/**
 * Der Grund aus dem Fehler-Envelope (`{ ok, code, message, reason }`) — roh.
 * `null`, wenn dort nichts steht: ein alter Server, ein Proxy-Fehler oder eine
 * leere Antwort fallen so auf den allgemeinen Text zurück.
 */
async function envelopeReason(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null) as { reason?: unknown } | null
  return typeof body?.reason === 'string' ? body.reason : null
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`
}

export function useBrandGeneration(
  profileId: MaybeRefOrGetter<string>,
  options: UseBrandGenerationOptions = {},
) {
  const store = useBrandWorkspaceStore()
  /**
   * DIE SPRACHE DER SEITE — sie reist im Rumpf mit (Davids Befund 2026-09-02).
   * Der Server las sie bis dahin aus `i18n_redirected` und traf damit die
   * einmal gewählte statt der gerade offenen: englische Werkstatt, deutscher
   * George. `locale` aus `useI18n()` folgt der ROUTE (`prefix_except_default`)
   * und ist damit genau die Auskunft, die dort fehlte.
   */
  const { locale } = useI18n()

  const status = ref<BrandGenerationStatus>('idle')
  const activeSlotId = ref<string | null>(null)
  const failureCode = ref<BrandGenerationClientFailure | null>(null)
  /**
   * WAS DER LETZTE LAUF WAR (george-a-4): ein Entwurf oder eine Rückfrage.
   *
   * Er wird aus dem `generation.completed`-Frame übernommen und NICHT aus dem
   * Ausbleiben eines `slot.ready` geschlossen — ein abgerissener Strom sähe
   * sonst aus wie eine Rückfrage. Für den Slot ist ohnehin nichts zu tun:
   * `slot.ready` ist die einzige Stelle, die einen Editor füllt, und bei einer
   * Rückfrage kommt es gar nicht erst. Die Frage steht dann als gewöhnlicher
   * Zug im Verlauf — kein Fehler, kein Hinweis, kein Toast.
   */
  const lastOutcome = ref<BrandGenerationOutcome | null>(null)

  let controller: AbortController | null = null

  const streaming = computed(() => status.value === 'streaming')

  /** Läuft für DIESEN Slot gerade etwas? Die Knöpfe der anderen bleiben aktiv. */
  function isStreamingSlot(slotId: string): boolean {
    return streaming.value && activeSlotId.value === slotId
  }

  function stop(): void {
    controller?.abort()
  }

  async function generate(slotId: string, hint = ''): Promise<void> {
    // Eine Generierung zur Zeit — dieselbe Regel wie auf dem Server
    // (`generation_active`), nur früher und ohne Roundtrip.
    if (streaming.value) return

    await options.beforeGenerate?.()

    const stepKey = store.stepKey
    if (!stepKey) return

    controller = new AbortController()
    status.value = 'streaming'
    activeSlotId.value = slotId
    failureCode.value = null
    lastOutcome.value = null

    let generationId = ''

    try {
      const response = await fetch(
        `/api/brand/profiles/${toValue(profileId)}/steps/${stepKey}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          body: JSON.stringify({
            slotId,
            // Nur eine BEKANNTE Sprache wird mitgeschickt; alles andere lehnt
            // das Schema ab (400), und der Rückfall auf die Inhaltssprache
            // gehört ohnehin dem Server.
            ...(isBrandUiLocale(locale.value) ? { uiLocale: locale.value } : {}),
            ...(hint.trim() ? { hint: hint.trim() } : {}),
            // Ein Schlüssel je Knopfdruck: wiederholt der Client denselben
            // Aufruf (Netzhänger), liefert der Server den bereits erzeugten
            // Entwurf zurück, statt ein zweites Mal zu generieren.
            idempotencyKey: newIdempotencyKey(),
          }),
          signal: controller.signal,
        },
      )

      if (!response.ok || !response.body) {
        // Ein Gate hat vor dem Strom abgewiesen (400/403/404). Der GRUND bleibt
        // beim Server — die Oberfläche sagt nur, dass es gerade nicht geht.
        //
        // MIT EINER AUSNAHME: die Drossel (429) nennt ihren Grund im Envelope
        // (`reason`), und die vier Gründe sagen VERSCHIEDENE Dinge — „gleich
        // wieder", „morgen wieder", „nicht an dir". Ein gemeinsames „hat nicht
        // geklappt" schickte den Menschen zurück an denselben Knopf.
        status.value = 'failed'
        // Zwei Ausnahmen von „der Grund bleibt beim Server": die Drossel (429)
        // sagt WANN es wieder geht, die 409-Gates sagen WORAN es liegt.
        // Beides schickt den Menschen sonst zurück an denselben Knopf.
        //
        // DIE BEIDEN 409 WERDEN UNTERSCHIEDEN, und zwar am `reason`, nicht am
        // Status: „zu wenig Material" und „das hast du schon bestätigt" führen
        // zu verschiedenen nächsten Handgriffen. Ein alter Server ohne
        // `reason` fällt auf `not_ready` zurück — das war bis heute die einzige
        // Bedeutung dieses Status.
        const reason = response.status === 429 || response.status === 409
          ? await envelopeReason(response)
          : null
        failureCode.value = (response.status === 429 && isBrandAiRejectionCode(reason) ? reason : null)
          ?? (response.status === 409 ? (reason === 'slot_confirmed' ? 'slot_confirmed' : 'not_ready') : null)
          ?? 'request_rejected'
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
          generationId = item.generationId
          if (item.type === 'generation.started') {
            store.beginGeorgeMessage(item.generationId)
          }
          else if (item.type === 'message.delta') {
            store.appendGeorgeDelta(item.generationId, item.text)
          }
          else if (item.type === 'slot.ready') {
            store.applyGeorgeDraft(item.slotId, item.draft, item.generationId)
            // Die GESTREAMTE Blase zeigt bei einem Choice-Slot die Wert-Zeile
            // roh (`sage`, Live-Fund 2026-09-04) — hier ist der Strom fertig,
            // und die geteilte Regel tauscht sie gegen die Anzeige der Seite.
            store.localizeGeorgeChoiceMessage(item.generationId, item.slotId, locale.value)
          }
          else if (item.type === 'generation.completed') {
            lastOutcome.value = item.outcome ?? 'draft'
            // Eine RÜCKFRAGE darf Antwort-Möglichkeiten tragen (Davids
            // Anforderung 2026-09-04); ein Entwurf nie — die Route schickt sie
            // dort gar nicht erst mit.
            if (item.options?.length) store.setGeorgeMessageOptions(item.generationId, item.options)
            store.applyGenerationRevision(item.revision)
            store.endGeorgeMessage(item.generationId)
            status.value = 'done'
          }
          else {
            store.endGeorgeMessage(item.generationId)
            failureCode.value = item.code
            status.value = 'failed'
          }
        }
      }

      // Der Strom endete ohne Abschluss-Frame (Server weg, Proxy dazwischen).
      // Das ist ein Fehlschlag und wird auch so genannt — ein hängendes
      // „schreibt gerade …" wäre die schlechtere Lüge.
      if (status.value === 'streaming') {
        if (generationId) store.endGeorgeMessage(generationId)
        status.value = 'failed'
        failureCode.value = 'provider_error'
      }
    }
    catch {
      // Abbruch UND Netzfehler landen hier. Beide lassen den bisherigen Entwurf
      // unangetastet (§3e) — geschrieben hat der Server ohnehin nichts.
      if (generationId) store.endGeorgeMessage(generationId)
      status.value = 'failed'
      failureCode.value = controller?.signal.aborted ? 'aborted' : 'provider_error'
    }
    finally {
      controller = null
      activeSlotId.value = null
    }
  }

  /** Den Hinweis wegräumen, sobald der Mensch ihn gesehen hat. */
  function dismissFailure(): void {
    failureCode.value = null
    if (status.value === 'failed') status.value = 'idle'
  }

  if (import.meta.client) {
    onBeforeUnmount(() => stop())
  }

  return {
    status,
    streaming,
    activeSlotId,
    failureCode,
    lastOutcome,
    isStreamingSlot,
    generate,
    stop,
    dismissFailure,
  }
}
