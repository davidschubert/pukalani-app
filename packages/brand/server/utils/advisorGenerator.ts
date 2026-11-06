import type { H3Event } from 'h3'
import { techniqueForStep } from '../../shared/brandAdvisors'
import {
  brandChoiceContract,
  brandChoiceFallbackQuestion,
  checkBrandChoiceDraft,
  swapBrandChoiceValueLine,
} from '../../shared/brandChoiceOptions'
import type { BrandSlot, BrandTeamKind } from '../../shared/slotRegistry'
import type {
  BrandGeneratorContext,
  BrandGeneratorResult,
  BrandSlotDependency,
  BrandSlotGenerator,
} from './brandGenerators'
import {
  type BrandSlotInstructionOptions,
  brandPromptToday,
  formatGeorgeInputs,
  georgeSystemPrompt,
} from './georgePrompt'
import { createGeorgeTurnScrubber, parseGeorgeTurn } from './georgeTurn'
import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'

/**
 * DER ZUSAMMENBAU EINES BERATER-GENERATORS — einmal, für alle (P3.1).
 *
 * ── WARUM EINE FABRIK UND NICHT DREI DATEIEN ──────────────────────────────
 * Bis P3.1 stand dieser Ablauf genau einmal (in `george-context.ts`), und das
 * war richtig, solange es einen Baustein gab. Mit Vera und Milo wären daraus
 * drei fast gleiche Kopien geworden — und „fast gleich" ist hier teuer: in
 * diesem Ablauf stecken die DATENSCHUTZ-BEDINGUNGEN (`zdr`,
 * `dataCollection: 'deny'`, `allowFallbacks: false`), der Strom-Putzer, der
 * Rückfall auf das verlangte Modell und die Regel, dass ein Anbieter-Fehler
 * ungefangen durchfliegt. Fehlt eine davon in einer der Kopien, sieht man dem
 * Ergebnis nichts an — der Entwurf kommt trotzdem, nur eben von einem Anbieter,
 * der ihn behalten darf.
 *
 * Was je Baustein WIRKLICH verschieden ist, sind drei Dinge: die Aufgabe je
 * Slot (`instruction`), die Prompt-Fassung (`promptVersion`) und — neu — eine
 * Nachprüfung des Feldwerts (`verify`). Genau die drei nimmt die Fabrik
 * entgegen; WIE hier gefragt wird, fragt sie selbst bei der Registry
 * (`techniqueForStep(context.stepKey)`), damit ein Generator, der sich morgen
 * für einen zweiten Baustein registriert, dort automatisch dessen Technik
 * bekommt. WER spricht, ist keine Frage mehr: George, überall.
 *
 * ── WAS HIER STEHT UND WAS NICHT ──────────────────────────────────────────
 * Hier steht der ZUSAMMENBAU: Prompt holen, Transport rufen, Ergebnis in den
 * Vertrag übersetzen. Die Prompts liegen pur nebenan (`georgePrompt.ts`,
 * `veraPrompt.ts`, `miloPrompt.ts`), das Streamen liegt im Core
 * (`aiCompleteStream`), die Drosseln, die Sperre, die Persistenz und jedes
 * Ereignis liegen in der Route. Diese Datei hat keine eigene Politik.
 *
 * ── DIE MODELL-KETTE IST IN PHASE 1 VEREINFACHT ───────────────────────────
 * `app_config.aiModel > pukalani.ai.model` — genau das, was
 * `getEffectiveAiConfig()` liefert. Das mittlere Glied `pukalani.brand.ai` aus
 * dem Plan (BRAND-WIZARD-PHASE-1, §6) EXISTIERT NICHT als Config-Feld und wird
 * hier auch nicht erfunden: ein Feld, das nur dieser Aufruf kennt, wäre eine
 * Einstellung ohne Oberfläche und ohne Wächter.
 *
 * ── FEHLER WERDEN NICHT GESCHLUCKT ────────────────────────────────────────
 * `aiCompleteStream()` wirft 503 (kein Schlüssel) und 502 (Anbieter kaputt,
 * Fehler-Frame, Zeitüberschreitung). Beides fliegt hier UNGEFANGEN durch: die
 * Route fängt es, meldet `provider_error` im Strom und lässt den bisherigen
 * Stand unangetastet (§9b.5). Ein `catch` hier machte aus einem kaputten
 * Anbieter einen leeren Entwurf — und `empty_result` ist die falsche Auskunft
 * für „der Anbieter antwortet nicht".
 *
 * EIN ABBRUCH IST KEIN FEHLER: er kommt als `aborted: true` zurück und wird
 * unverändert durchgereicht. Die Route verwirft dann, nichts wird gespeichert.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Hier wird NICHTS geloggt. Der Transport loggt inhaltsfrei (Status, Label),
 * die Route loggt generationId/Slot/Modell/Dauer/Fehlercode. Eine zusätzliche
 * Zeile hier hätte nur eine Sache Neues zu sagen — den Prompt —, und genau die
 * darf sie nicht sagen.
 */

/**
 * DIE DATENSCHUTZ-BEDINGUNGEN DES LAUFS — fail-closed, wörtlich so gesendet;
 * sie stehen seit dem Brand-Check in `brandProviderRouting.ts`, weil DREI
 * Aufrufer sie teilen (Strom, Prüf-Urteil, Aussen-Check).
 *
 * Eine geprüfte `only`-Allowlist fehlt noch bewusst: sie wäre eine Liste ohne
 * Pflege, und eine veraltete Allowlist ist ein Ausfall, den niemand erklärt.
 */

/**
 * Grosszügig, weil ein Manifest-langer Entwurf im Strom Minuten dauern darf —
 * der Mensch SIEHT ihn ja entstehen. Abgebrochen wird von aussen (Stopp-Knopf,
 * geschlossene Verbindung), nicht von der Uhr.
 */
const BRAND_STREAM_TIMEOUT_MS = 120_000

/**
 * Token-Budget aus dem Zeichen-Deckel des Slots: grob drei Zeichen je Token,
 * mit Unter- und Obergrenze. Zu klein bricht den Entwurf mitten im Satz ab
 * (und `clampDraft` in der Route sähe das nicht — sie kürzt nur), zu gross
 * kostet ohne Nutzen.
 */
export function georgeMaxTokens(maxLength: number): number {
  return Math.min(2_000, Math.max(300, Math.ceil(maxLength / 3)))
}

function personaName(): string | undefined {
  const config = useAppConfig() as { pukalani?: { brand?: { persona?: { name?: string } } } }
  return config.pukalani?.brand?.persona?.name
}

export interface AdvisorStreamRequest {
  event: H3Event
  /** Der System-Prompt (Regeln + Berater-Schicht) — gebaut vom Aufrufer. */
  system: string
  /** Auftrag + Eingaben. */
  prompt: string
  maxTokens: number
  signal: AbortSignal
  onDelta: (text: string) => Promise<void> | void
}

export interface AdvisorStreamResult {
  /** Der ROHE Text des Modells, Marker eingeschlossen — die Lese-Seite gehört dem Aufrufer. */
  text: string
  model: string
  provider: string
  aborted: boolean
}

/**
 * DER EINE WEG ZUM ANBIETER, für JEDEN Zug eines Beraters — Entwurf wie
 * Gespräch (P3.2).
 *
 * Hier und nur hier stehen die Datenschutz-Bedingungen (`zdr`,
 * `dataCollection: 'deny'`, `allowFallbacks: false`), die Modell-Kette und der
 * Marker-Putzer für den Strom. Der Konversations-Zug ist der zweite Aufrufer
 * geworden, und genau deshalb steht das hier: eine zweite Kopie dieser vier
 * Zeilen wäre eine zweite Chance, dass Markeninhalte über einen Anbieter gehen,
 * der sie behalten darf — und dem Ergebnis sähe man das nie an.
 *
 * DER PUTZER LÄUFT AUCH IM GESPRÄCH, obwohl dort kein Marker verlangt wird:
 * dasselbe Modell schreibt in anderen Zügen mit `BASIS:`/`ASK:`, und ein
 * verirrtes Etikett in der Sprechblase wäre ein Protokoll-Leck. Für Text ohne
 * Marker ist das Putzen wirkungslos.
 *
 * FEHLER FLIEGEN UNGEFANGEN DURCH (503 kein Schlüssel, 502 Anbieter kaputt) —
 * die Route macht daraus `provider_error` und lässt den Stand unangetastet.
 */
export async function streamAdvisorTurn(request: AdvisorStreamRequest): Promise<AdvisorStreamResult> {
  // app_config.aiModel > pukalani.ai.model (s. Kopf).
  const requested = (await getEffectiveAiConfig(request.event)).model
  const scrub = createGeorgeTurnScrubber()

  const result = await aiCompleteStream(request.event, request.prompt, {
    system: request.system,
    model: requested,
    label: 'brand',
    maxTokens: request.maxTokens,
    timeoutMs: BRAND_STREAM_TIMEOUT_MS,
    providerRouting: { ...BRAND_PROVIDER_ROUTING },
    signal: request.signal,
    onDelta: async (text: string) => {
      const visible = scrub(text)
      if (visible) await request.onDelta(visible)
    },
  })

  return {
    text: result.text,
    // Was der Anbieter über sich sagt, sonst das, was wir VERLANGT haben —
    // beides ist wahr, ein erfundener Name wäre es nicht. Sagt er nichts über
    // sich selbst, bleibt `provider` leer statt geraten.
    model: result.model || requested,
    provider: result.provider,
    aborted: result.aborted,
  }
}

/**
 * DAS ERGEBNIS EINER NACHPRÜFUNG: entweder ein (ggf. normalisierter) Feldwert
 * oder eine Rückfrage STATT eines Entwurfs.
 *
 * Es gibt bewusst keinen dritten Ausgang „nimm es trotzdem, aber merk es dir":
 * ein Feldwert, der seinen Vertrag verfehlt, ist im Brand-Dokument nicht von
 * einem gültigen zu unterscheiden — und der Mensch, der ihn dort findet, hat
 * keine Möglichkeit mehr zu erkennen, dass er nie geprüft wurde.
 */
export type AdvisorSlotVerdict =
  | { readonly draft: string }
  | { readonly question: string }

export interface AdvisorSlotVerifyInput {
  slot: BrandSlot
  /** Der Feldwert, wie ihn `parseGeorgeTurn` aus dem DRAFT-Block gelesen hat. */
  draft: string
  /** Sprache der OBERFLÄCHE — eine Rückfrage ist Chat und folgt Regel 9. */
  uiLocale: string
  /**
   * Die Anrede-Weiche der Marke (BW1-Inhaltsrunde 2026-09-09) — eine
   * Rückfrage ist Chat, und Chat spricht die Person an: bei „Nur ich" mit
   * „du", im Team mit „ihr". Fehlt sie, bleibt es bei der Team-Fassung, die
   * vor dieser Runde die einzige war.
   */
  team?: BrandTeamKind
  /**
   * DIE QUELL-SLOTS DIESES FELDES — dieselben, die auch in den Prompt gingen
   * (K5).
   *
   * Bis K5 kam die Nachprüfung mit dem Entwurf allein aus: eine geschlossene
   * Auswahl misst sich an ihrem eigenen Vertrag. Die zwei Entwurfs-Sessions
   * der dritten Schicht messen sich an einem ANDEREN Feld — `m.patterns` an
   * den gewählten Typen (`m.types`), `n.guardrails` an den Meiden-Listen —,
   * und ohne diese Zeile müsste jede Prüfung sich ihre Quelle selbst holen:
   * ein zweiter Appwrite-Zugriff mitten in einer puren Rechnung, mit der
   * Chance, einen ANDEREN Stand zu sehen als der Prompt eine Sekunde vorher.
   *
   * Es ist dieselbe Liste, kein Abbild — der Aufrufer reicht `context.dependencies`
   * unverändert durch.
   */
  dependencies: readonly BrandSlotDependency[]
}

/** Der Wert eines Quell-Slots aus der Liste — '' heisst „leer oder nicht dabei". */
export function advisorDependencyValue(
  dependencies: readonly BrandSlotDependency[],
  slotId: string,
): string {
  return dependencies.find(entry => entry.slotId === slotId)?.value ?? ''
}

/**
 * DIE AUSWAHL-NACHPRÜFUNG — einmal, für JEDEN Baustein mit `choice`-Slots.
 *
 * Sie stand bis zum 2026-09-04 im Vera-Plugin und galt damit nur für B/B2. Das
 * war nie eine Aussage über Vera, sondern der Zustand „es gibt erst einen
 * Baustein mit einer Auswahl": mit `d.primary`/`d.secondary` hat der
 * Archetyp-Baustein zwei weitere, und eine zweite Kopie dieser sechs Zeilen
 * wäre eine zweite Chance, dass ein erfundener Wert ungeprüft ins
 * Brand-Dokument geht — und dort ist er von einem echten nicht mehr zu
 * unterscheiden.
 *
 * Ein Slot OHNE Vertrag geht unverändert durch: nicht jeder Baustein hat eine
 * geschlossene Menge, und eine Prüfung, die sich eine ausdenkt, wäre schlimmer
 * als keine.
 */
export function verifyBrandChoiceSlot(input: {
  slot: { id: string }
  draft: string
  uiLocale: string
  /** Anrede der Marke — s. `AdvisorSlotVerifyInput.team` (BW1-Inhaltsrunde). */
  team?: BrandTeamKind
}): AdvisorSlotVerdict {
  const contract = brandChoiceContract(input.slot.id)
  if (!contract) return { draft: input.draft }

  const check = checkBrandChoiceDraft(contract, input.draft)
  return check.ok
    ? { draft: check.value }
    : { question: brandChoiceFallbackQuestion(contract, input.uiLocale, input.team) }
}

export interface AdvisorSlotGeneratorOptions {
  /** Steht in jedem Generations-Eintrag; steigt mit jeder inhaltlichen Änderung. */
  promptVersion: string
  /** Die Aufgabe je Slot. Wirft für einen Slot ohne Auftrag (⇒ `provider_error`). */
  instruction: (slotId: string, options: BrandSlotInstructionOptions) => string
  /**
   * Nachprüfung des Feldwerts, bevor er ein Entwurf wird. Ohne Angabe wird
   * nicht geprüft — das ist das Verhalten von Baustein A und bleibt es.
   */
  verify?: (input: AdvisorSlotVerifyInput) => AdvisorSlotVerdict
}

/** Baut den Generator EINES Beraters — s. Kopf. */
export function createAdvisorSlotGenerator(options: AdvisorSlotGeneratorOptions): BrandSlotGenerator {
  return async (context: BrandGeneratorContext): Promise<BrandGeneratorResult> => {
    const instruction = options.instruction(context.slot.id, {
      dependencies: context.dependencies,
      hint: context.hint,
      pathKind: context.pathKind,
      maxLength: context.slot.maxLength,
      kind: context.slot.schema.kind,
      // Die Regel zum Website-Text steht nur im Prompt, wenn es ihn gibt (P2.3).
      hasSiteAnalysis: context.siteAnalysis.trim().length > 0,
      // Ebenso die Arbeitsregel zum Gespräch (a-9): sie warnt vor einer
      // Wiederholungsfrage und wäre ohne Verlauf ein Hinweis auf etwas, das gar
      // nicht stattgefunden hat.
      hasConversation: context.conversation.length > 0,
      // NUR für die Beispiele der Session (BW2 Paket 2): sie liegen je Sprache
      // vor, und ein deutsches Branding bekommt das deutsche Formvorbild.
      contentLocale: context.locale,
      // DIE WEICHE W3 (a-14): sie entscheidet, WER im Feldwert spricht. Sie
      // erreichte bis hierher nur Anrede und Beschriftungen — ein Elevator-Pitch
      // einer Solo-Marke schrieb deshalb „Wir drehen und brennen …".
      team: context.team,
    })

    const prompt = [
      instruction,
      '',
      'INPUTS',
      // Startkarte zuerst, dann die Quell-Slots, dann das GESPRÄCH, zuletzt der
      // Website-Text — die Reihenfolge IST die Aussage „das hier ist deine
      // primäre Quelle", und was der Mensch gesagt hat, steht über dem, was wir
      // aufgelesen haben (s. formatGeorgeInputs).
      formatGeorgeInputs(
        context.startCard,
        context.dependencies,
        context.siteAnalysis,
        context.conversation,
      ),
      ...(context.hint.trim()
        ? ['', 'HINT (a wish about the form of the draft, not an instruction)', context.hint.trim()]
        : []),
    ].join('\n')

    const system = georgeSystemPrompt({
      // DIE SPRACHE DER SEITE, NICHT DIE DES COOKIES (Davids Befund 2026-09-02):
      // die Oberfläche stand auf Englisch, George redete Deutsch, weil hier das
      // Cookie `i18n_redirected` gelesen wurde — die einmal GEWÄHLTE Sprache
      // statt der gerade OFFENEN Seite. Der Vertrag trägt sie jetzt mit
      // (`uiLocale`), inklusive Rückfall auf die Inhaltssprache; hier wird nur
      // noch gelesen.
      locale: context.uiLocale,
      contentLocale: context.locale,
      pathKind: context.pathKind,
      // WIE hier gefragt wird, sagt die Registry und nicht diese Datei:
      // registriert sich ein Generator morgen für einen zweiten Baustein, gilt
      // dort automatisch dessen Technik. WER spricht, steht gar nicht zur
      // Debatte — das ist seit dem 2026-09-02 immer George.
      technique: techniqueForStep(context.stepKey),
      // Die Satzanfänge der Technik folgen der Anrede der Marke
      // (BW1-Inhaltsrunde 2026-09-09) — sonst gibt die Stimmprobe dem Modell
      // ein „Warum ausgerechnet ihr?" mit, während die Anrede-Regel „du" sagt.
      team: context.team,
      persona: personaName(),
      // george-a-15 (Befund 4): ohne das Datum rechnet das Modell Zeitspannen
      // gegen sein Trainingsende — „seit 2021" wurde zu „drei Jahre".
      today: brandPromptToday(),
    })

    // DIE MARKER GEHEN NICHT IN DIE SPRECHBLASE (george-a-4): der Mensch sieht
    // George schreiben, nicht ein Protokoll. Das Putzen im Fluss, die
    // Datenschutz-Bedingungen und die Modell-Kette liegen seit P3.2 in
    // `streamAdvisorTurn` — für Entwurf und Gespräch dieselbe eine Stelle.
    const result = await streamAdvisorTurn({
      event: context.event,
      system,
      prompt,
      maxTokens: georgeMaxTokens(context.slot.maxLength),
      signal: context.signal,
      onDelta: context.onDelta,
    })

    // Ein Zug, zwei Ergebnisse: der Feldwert und der Chat-Zug. Ohne Marker fällt
    // beides auf den ganzen Text zurück — genau das Verhalten von `george-a-3`.
    const turn = parseGeorgeTurn(result.text)

    const base = {
      model: result.model,
      provider: result.provider,
      promptVersion: options.promptVersion,
      aborted: result.aborted,
    }

    /**
     * DIE NACHPRÜFUNG LÄUFT NUR AUF EINEM ENTWURF, und nur auf einem
     * VOLLSTÄNDIGEN: eine Rückfrage hat keinen Feldwert, und ein abgebrochener
     * Lauf hat einen halben — den verwirft die Route ohnehin, und ihn hier
     * durch die Formprüfung zu schicken erzeugte eine Rückfrage, die niemand
     * gestellt hat.
     */
    if (options.verify && turn.outcome === 'draft' && !result.aborted) {
      const verdict = options.verify({
        slot: context.slot,
        draft: turn.draft,
        uiLocale: context.uiLocale,
        team: context.team,
        dependencies: context.dependencies,
      })
      if ('question' in verdict) {
        return { ...base, draft: '', message: verdict.question, outcome: 'question' }
      }
      return {
        ...base,
        draft: verdict.draft,
        // Der ZUG bleibt, wie das Modell ihn geschrieben hat — auch wenn der
        // Feldwert normalisiert wurde (aus „House of Brands" wird die Id
        // `house-of-brands`). Der Chat spricht Menschensprache, das Feld trägt
        // den stabilen Wert; das ist dieselbe Entscheidung in zwei Registern
        // und keine Abweichung. EINE Ausnahme (Live-Fund 2026-09-04): steht in
        // der Sprechblase die WERT-Zeile selbst — bei einem Choice-Slot die
        // rohe Id („sage") —, tauscht die GETEILTE Regel genau diese Zeile
        // gegen die Anzeige der Seite. Dieselbe Regel läuft im Browser auf der
        // gestreamten Blase (`slot.ready`) — die Begründung steht bei ihr
        // (`swapBrandChoiceValueLine`).
        message: swapBrandChoiceValueLine(context.slot.id, turn.message, context.uiLocale),
        outcome: 'draft',
      }
    }

    return { ...base, draft: turn.draft, message: turn.message, outcome: turn.outcome }
  }
}

