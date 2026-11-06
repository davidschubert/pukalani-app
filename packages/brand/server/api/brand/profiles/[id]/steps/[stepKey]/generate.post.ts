import { ID } from 'node-appwrite'
import { createBrandGenerateSchema } from '../../../../../../../schemas/brandGeneration'
import {
  type BrandGenerationCompletedData,
  type BrandGenerationEventDataMap,
  type BrandGenerationEventName,
  type BrandGenerationFailureCode,
  type BrandGenerationOutcome,
  findBrandGenerationByKey,
  packBrandGenerations,
  serializeBrandGenerationEvent,
} from '../../../../../../../shared/brandGeneration'
import { resolveBrandJourney } from '../../../../../../../shared/brandJourney'
import { slotReadiness } from '../../../../../../../shared/brandSlotReadiness'
import { BRAND_STEP_KEYS, slotById } from '../../../../../../../shared/slotRegistry'
import { resolveBrandUiLocale } from '../../../../../../../shared/brandUiLocale'
import type { BrandGenerationEntry } from '../../../../../../../shared/types/brand'
import {
  BRAND_MESSAGES_TABLE,
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  brandSlotRecordConfirmed,
  brandSlotStoredValue,
  loadBrandStepContext,
  loadStepRow,
  loadStepRows,
  mergeStepSlotRecords,
  parseGenerations,
  parseSlotRecords,
  profileFacts,
  profileSiteAnalysisText,
  profileStartCard,
  resolveProfileProgress,
  serializeSlotRecords,
  toStepFacts,
  touchProfile,
} from '../../../../../../utils/brandStore'
import {
  type BrandGeneratorContext,
  type BrandGeneratorResult,
  acquireBrandGenerationLock,
  brandGenerationInputHash,
  collectSlotDependencies,
  readBrandAiEnabled,
  resolveBrandSlotGenerator,
  retainBrandGeneration,
} from '../../../../../../utils/brandGenerators'
import { labelSlotDependencies } from '../../../../../../utils/brandSlotPromptLabels'
import { parseGeorgeOptions } from '../../../../../../utils/georgeTurn'
import { loadBrandConversationHistory } from '../../../../../../utils/brandConversationHistory'
import { bookBrandAiQuota } from '../../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'

/**
 * DAS §3e-STREAMING-PROTOKOLL, SERVERSEITIG.
 *
 * `POST /api/brand/profiles/:id/steps/:stepKey/generate` antwortet
 * `text/event-stream` und sendet fünf Ereignisse: `generation.started` ·
 * `message.delta` · `slot.ready` · `generation.completed` ·
 * `generation.failed`. Jedes trägt seine `generationId`; die Serialisierung
 * (und die Lese-Seite) liegen als pure Regel in `shared/brandGeneration.ts`.
 *
 * ── ZWEI ERGEBNISSE SEIT `george-a-4` ─────────────────────────────────────
 * Ein Lauf endet als ENTWURF oder als RÜCKFRAGE (`outcome`, Audit-Befund B3).
 * Die Rückfrage schreibt KEINEN Slot-Wert, kein `slot.ready`, keinen
 * `inputHash` — nur eine Zeile im Verlauf und einen Eintrag in der Historie.
 * Der Client erfährt den Unterschied im `generation.completed`-Frame und nicht
 * an der Abwesenheit eines Frames: „nichts gekommen" ist auch der Zustand
 * eines abgerissenen Stroms.
 *
 * Ausserdem trägt der Zug seit a-4 eine RAHMUNG (Befund B2) — worauf sich der
 * Entwurf stützt, der Entwurf, eine Frage. Der Chat-Text und der Feld-Text sind
 * damit zwei verschiedene Zeichenketten; welche wohin gehört, entscheidet
 * `parseGeorgeTurn` im Generator, nicht diese Route.
 *
 * ── ZWEI ARTEN, NEIN ZU SAGEN — UND DER UNTERSCHIED IST ABSICHT ───────────
 * VOR dem Strom wird mit HTTP abgewiesen: kein Beta-Zugang (404, Datentür),
 * fremdes Profil (404), gesperrter Baustein (403), unbekannter/deaktivierter
 * Slot oder ein Slot, den George gar nicht entwirft (400), und seit dem
 * Bereitschafts-Gate auch „dafür ist zu wenig da" (409, `not_ready`). Das sind
 * Fehler bzw. Voraussetzungen des AUFRUFERS — sie gehören in den Status, nicht
 * in einen Datenstrom, den ein `fetch` ohne Weiteres für einen Erfolg hält.
 *
 * IM Strom wird abgewiesen, was ein ZUSTAND ist: KI abgeschaltet
 * (`ai_disabled`), kein Generator registriert (`no_generator`), hier läuft schon
 * einer (`generation_active`), Anbieter kaputt, abgebrochen, leer. Der Mensch
 * hat den Knopf gedrückt, der Server hat zugehört — er bekommt eine Antwort im
 * selben Kanal, und die Oberfläche macht daraus einen ruhigen Hinweis. Der Stand
 * bleibt in JEDEM dieser Fälle voll bearbeitbar (§9b.5).
 *
 * ── PERSISTENZ VOR `completed` (Plan §6, wörtlich) ────────────────────────
 * Erst `brand_steps.slots` (latestDraft; `firstDraft` nur, wenn noch keiner da
 * war) + Generations-Eintrag + `brand_messages`-Zeile, DANN das
 * `generation.completed`-Frame. Ein Client, der „fertig" gesehen hat, muss den
 * Entwurf nach einem Reload wiederfinden — die andere Reihenfolge verspräche
 * etwas, das ein Absturz eine Zeile später zur Lüge macht.
 *
 * ABBRUCH UND FEHLER LASSEN DEN BISHERIGEN ENTWURF UNANGETASTET: nichts
 * Partielles erreicht `brand_steps`. Deltas fliessen nur in die Oberfläche.
 *
 * ── DIE ZEILE WIRD FRISCH GELESEN, BEVOR GESCHRIEBEN WIRD ─────────────────
 * Zwischen dem Gate und dem Ende des Streams vergehen Sekunden, und der
 * Autosave des Menschen läuft weiter. Geschrieben wird deshalb auf der Fassung,
 * die JETZT in der Tabelle steht — sonst überschriebe der Entwurf still, was
 * der Mensch währenddessen getippt hat.
 *
 * ── DIE `revision` STEIGT, UND DER CLIENT ERFÄHRT DIE NEUE ────────────────
 * Der Entwurf ist eine Änderung wie jede andere. Ohne die neue `revision` im
 * `completed`-Frame liefe der nächste Autosave in einen 409 — also in den
 * Konflikt-Dialog, den niemand ausgelöst hat. `useBrandGeneration()` übernimmt
 * sie deshalb; wer hier ein Feld entfernt, baut den 409 wieder ein.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Logzeilen und `brand_events` tragen generationId, Slot-Id, Modell, Dauer und
 * Fehlercode — NIE Prompt, NIE Hinweis, NIE erzeugten Text.
 *
 * ── DIE DROSSEL (P2.1) STEHT VOR DEM STROM, UND ZWAR AUS EINEM GRUND ──────
 * Die vier Deckel aus Plan §6 (Burst 2 · 10/Tag je Brand × Slot-Typ · 200/Tag
 * je Konto · Instanz-Deckel) werden gebucht, SOLANGE DIE ANTWORT NOCH KEIN SSE
 * IST — als 429 mit `data.code`. Ein Nein im Strom wäre für einen Deckel die
 * falsche Form: `fetch` hielte die Antwort für einen Erfolg, kein Proxy und
 * kein Log sähe die Ablehnung, und `Retry-After` hätte keinen Platz.
 *
 * DAFÜR WANDERN DREI DINGE VOR DEN `writeHead`: der Kill-Switch, die
 * Generator-Wahl und die Idempotenz-Prüfung. Sie MÜSSEN davor stehen —
 * gebucht werden darf nur, was wirklich Geld kostet:
 *   · `brandAiEnabled` aus (Kill-Switch) ⇒ gar nichts, auch keine Buchung.
 *   · Kein Generator ⇒ nichts zu bezahlen.
 *   · Der Dev-Stub (`chargesQuota: false`) ⇒ er ruft keinen Anbieter.
 *   · Ein Idempotenz-Treffer ⇒ Cache-Treffer, „was nichts kostet, kostet kein
 *     Kontingent" (Plan §6).
 * GEMELDET werden Kill-Switch und fehlender Generator weiterhin IM Strom
 * (`ai_disabled`, `no_generator`) — sie sind Zustände, keine Aufruferfehler,
 * und die Oberfläche macht daraus einen ruhigen Hinweis. Nur der ZEITPUNKT der
 * Prüfung hat sich verschoben, nicht ihre Form.
 */

/** Was der Entwurf höchstens sein darf — die Registry sagt es je Slot. */
function clampDraft(draft: string, maxLength: number): string {
  const trimmed = draft.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

/**
 * B4, MECHANISCH (Davids Live-Fund 2026-09-03): die Tonalitäts-Ableitung kam
 * mit `**Fett-Markern**` an, und die Log-Karte zeigt Slot-Text als reinen
 * Text — der Mensch las wörtlich die Sternchen. Die Prompt-Regel („kein
 * Markdown ausser der Vertragsform") bleibt; hier fällt, was trotzdem
 * durchkommt. NUR der SLOT-Wert wird bereinigt, nie der Chat-Zug — und nur
 * `**`-Paare: einzelne Sterne können Inhalt sein (Fussnoten, Mathe).
 */
function stripBoldMarkers(draft: string): string {
  return draft.replace(/\*\*([^*]+)\*\*/g, '$1')
}

export default defineEventHandler(async (event) => {
  const started = Date.now()
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepKey, stepRow, stepRows } = await loadBrandStepContext(event, userId, betaAccount)

  // ── HTTP-Gates: Fehler des Aufrufers (s. Kopf) ───────────────────────────
  const parsed = createBrandGenerateSchema().safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid generation payload', data: { code: 'invalid_body' } })
  }
  const body = parsed.data

  const candidate = slotById(body.slotId)
  if (!candidate || candidate.deactivated) {
    throw createError({ status: 400, statusText: 'Unknown slot', data: { code: 'unknown_slot' } })
  }
  // Ab hier ist der Slot bekannt. Eine eigene Konstante statt fortlaufender
  // `!`-Behauptungen: die Verengung eines `const` überlebt den Sprung in eine
  // Closure (`fail`, `persist`) nicht zuverlässig, und ein `!` wäre genau dort
  // eine Behauptung ohne Beweis.
  const slot = candidate
  if (slot.stepId !== stepKey) {
    throw createError({ status: 400, statusText: 'Slot belongs to another step', data: { code: 'slot_foreign' } })
  }
  if (slot.generator === 'none') {
    // Eine reine Menschenfrage hat keinen Entwurf — und ein Knopf, der trotzdem
    // einen erzeugte, machte aus einer Frage eine Vorlage.
    throw createError({ status: 400, statusText: 'Slot is not generated', data: { code: 'slot_not_generated' } })
  }

  /**
   * ── WAS VOR DEM STROM FESTSTEHEN MUSS (s. Kopf) ──────────────────────────
   * Kill-Switch, Generator-Wahl und Idempotenz-Prüfung — die drei Fragen, die
   * entscheiden, ob dieser Lauf überhaupt etwas KOSTET. Gemeldet werden sie
   * unverändert im Strom; hier wird nur gerechnet, nicht gesendet.
   *
   * Die Werte stammen aus DERSELBEN `stepRow`-Aufnahme, die der Strom ohnehin
   * benutzt — vorgezogen wird die Rechnung, nicht die Wahrheit.
   */
  const aiEnabled = await readBrandAiEnabled(event)
  const choice = aiEnabled ? resolveBrandSlotGenerator(stepKey) : null

  /**
   * ── ZWEI AUFNAHMEN, ZWEI FRAGEN (P3.1) ───────────────────────────────────
   * `records` ist die Zeile DIESES Bausteins — sie beantwortet die Frage nach
   * dem Slot, der gerade geschrieben werden soll (ist er bestätigt?), und sie
   * ist die Zeile, in die nachher geschrieben wird.
   *
   * `allRecords` ist der Stand ALLER neun Bausteine. Er beantwortet die Frage
   * nach den QUELLEN — und die zeigen laut Registry ausdrücklich über
   * Baustein-Grenzen hinweg (`b.purpose` ← `a.pitch`). Bis P3.1 gab es nur die
   * erste Aufnahme, also kamen fremde Quellen leer bei George an und der
   * inputHash sah ihre Änderungen nicht.
   *
   * Es kostet KEINE zusätzliche Abfrage: `loadBrandStepContext` hat die neun
   * Zeilen für die Journey ohnehin schon mit EINEM `listRows` geholt.
   */
  const records = parseSlotRecords(stepRow.slots)
  const allRecords = mergeStepSlotRecords(stepRows)
  // Die Labels reisen NUR in den Prompt (george-a-6) — der inputHash liest
  // slotId+value und bleibt von ihnen unberührt.
  const dependencies = labelSlotDependencies(
    collectSlotDependencies(slot.id, allRecords),
    profile.contentLocale,
    profileFacts(profile, betaAccount).pathKind,
    profileFacts(profile, betaAccount).team,
  )
  const inputHash = brandGenerationInputHash(slot.id, profile.contentLocale, dependencies)
  const stored = parseGenerations(stepRow.generations)
  const reused = findBrandGenerationByKey(stored.items, body.idempotencyKey)

  /**
   * ── DIE BESTÄTIGUNGS-SPERRE (Davids Entscheidung 2026-09-02) ─────────────
   * Ein bestätigter Slot wird nicht überschrieben — auch nicht von George.
   * Sie steht VOR jeder Buchung, denn sie kostet nichts, und sie steht
   * UNBEDINGT, anders als das Bereitschafts-Gate eine Zeile weiter unten: das
   * ist ein RAT über das vorhandene Material und schweigt deshalb, wenn ohnehin
   * nicht generiert würde (abgeschaltete KI, Cache-Treffer); dies hier ist eine
   * SPERRE über den Zustand des Slots, und die gilt in jeder Betriebslage.
   * Sonst hinge die Unversehrtheit des bestätigten Textes daran, ob gerade ein
   * Kill-Switch gesetzt ist.
   *
   * Der Weg zurück ist derselbe wie überall: „Korrigieren" (der Autosave hebt
   * die Bestätigung auf), danach entwirft George wieder.
   */
  if (brandSlotRecordConfirmed(records[slot.id])) {
    throw createError({
      status: 409,
      statusText: 'Slot is confirmed',
      data: { code: 'slot_confirmed' },
    })
  }

  /**
   * ── DAS BEREITSCHAFTS-GATE (Davids „zu wenig ist zu wenig") ──────────────
   * Es steht VOR der Sperre und vor jeder Buchung, denn es sagt etwas, das
   * schon vor dem Klick feststand: aus dieser Ausgangslage kann kein ehrlicher
   * Entwurf entstehen. Es kostet keinen Anbieter-Aufruf und keine Zeile in der
   * Datenbank — deshalb ist es ein HTTP-Nein (409, `not_ready`) und kein
   * Zustand im Strom.
   *
   * Geprüft wird nur, was auch WIRKLICH generiert würde: kein Cache-Treffer,
   * kein abgeschalteter Dienst, kein fehlender Generator. Sonst bekäme ein
   * Mensch bei ausgeschalteter KI die falsche Auskunft — nämlich die über sein
   * Material statt die über den Dienst.
   *
   * DIE QUELLEN SIND DIESELBEN, die gleich in den Generator-Vertrag wandern
   * (Startkarte, Website-Text, Slot-Werte ALLER Bausteine — seit P3.1). Ein
   * Gate, das mehr oder weniger sieht als der Prompt, widerspricht George
   * irgendwann öffentlich.
   */
  if (aiEnabled && choice && !reused?.draft) {
    const readiness = slotReadiness(slot.id, {
      startCard: profileStartCard(profile),
      hasSiteAnalysis: profileSiteAnalysisText(profile).trim().length > 0,
      records: Object.fromEntries(
        Object.keys(allRecords).map(id => [id, brandSlotStoredValue(allRecords[id])]),
      ),
      // Der Server kennt ALLE neun Zeilen und darf deshalb über jede Quelle
      // urteilen; die Werkstatt reicht nur den offenen Baustein herein.
      coveredSteps: BRAND_STEP_KEYS,
    })
    if (!readiness.ready) {
      logEvent('info', 'brand.generation_not_ready', {
        slotId: slot.id, stepKey, missing: readiness.missing,
      })
      // Nur der CODE reist (der zentrale Handler hebt ihn als `reason`); WAS
      // fehlt, rechnet die Werkstatt aus denselben Daten selbst — sie zeigt es
      // ohnehin schon, bevor der Knopf gedrückt wird.
      throw createError({
        status: 409,
        statusText: 'Not enough material for a draft',
        data: { code: 'not_ready' },
      })
    }
  }

  const generationId = ID.unique()

  /**
   * DIE SPERRE WIRD VOR DER BUCHUNG GEZOGEN, obwohl sie erst im Strom gemeldet
   * wird: ein Lauf, der ohnehin an `generation_active` scheitert, darf kein
   * Kontingent verbrauchen. Ohne Kill-Switch und ohne Generator wird sie gar
   * nicht erst gezogen — sonst bliebe sie auf den beiden Ausgängen liegen, die
   * gleich danach kommen.
   */
  const lock = aiEnabled && choice
    ? acquireBrandGenerationLock(profile.$id, stepKey, generationId)
    : null

  /**
   * KONTINGENT KOSTET NUR EIN ECHTER ANBIETER-LAUF: kein Dev-Stub
   * (`chargesQuota: false`), kein Cache-Treffer, kein Lauf, den der
   * Kill-Switch verhindert, und keiner, der an der Sperre hängen bleibt.
   *
   * BELEGT WIRD DER BURST-PLATZ VOR DER BUCHUNG, nicht danach — die Begründung
   * steht in `brandAiQuota.ts` (zwischen Zählen und Belegen lägen sonst drei
   * `await`). Ein Nein gibt ihn sofort wieder frei.
   */
  const charges = Boolean(choice?.chargesQuota) && !reused?.draft && Boolean(lock)
  const burst = charges ? retainBrandGeneration(userId) : null
  if (charges) {
    const rejection = await bookBrandAiQuota(event, {
      userId,
      profileId: profile.$id,
      kind: 'slot',
      slotId: slot.id,
    })
    if (rejection) {
      burst?.release()
      lock?.release()
      logEvent('info', 'brand.generation_throttled', { slotId: slot.id, stepKey, code: rejection.code })
      setHeader(event, 'Retry-After', rejection.retryAfterSec)
      // Der GRUND reist mit: `data.code` wird vom zentralen Fehler-Handler als
      // `reason` ins Envelope gehoben, und die Werkstatt sagt „gleich wieder"
      // oder „morgen wieder" — nicht dasselbe für beides.
      throw createError({
        status: 429,
        statusText: 'Brand generation limit reached',
        data: { code: rejection.code },
      })
    }
  }

  // ── Ab hier läuft der Strom ──────────────────────────────────────────────
  const res = event.node.res
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Ohne diesen Kopf puffert nginx den Strom und der Mensch sieht am Ende
    // alles auf einmal — das Streaming wäre dann reine Zierde.
    'X-Accel-Buffering': 'no',
  })

  function send<N extends BrandGenerationEventName>(type: N, data: BrandGenerationEventDataMap[N]): void {
    if (res.writableEnded) return
    res.write(serializeBrandGenerationEvent(type, data))
  }

  function fail(code: BrandGenerationFailureCode): void {
    send('generation.failed', { generationId, code })
    logEvent('warn', 'brand.generation_failed', {
      generationId, slotId: slot.id, stepKey, code, ms: Date.now() - started,
    })
    void recordBrandEvent(event, {
      type: 'generation.failed',
      profileId: profile.$id,
      userId,
      payload: { slotId: slot.id, stepKey, code },
    })
    res.end()
  }

  if (!aiEnabled) return fail('ai_disabled')
  if (!choice) return fail('no_generator')

  if (!lock) return fail('generation_active')

  // Der Abbruch hat zwei Auslöser: der Mensch drückt „Stopp" (der Client bricht
  // den fetch ab, die Verbindung schliesst) oder das Netz fällt weg. Beide
  // enden hier — der Generator hört auf, nichts wird gespeichert.
  const abort = new AbortController()
  event.node.req.on('close', () => abort.abort())

  try {
    send('generation.started', { generationId, slotId: slot.id, stepKey })
    void recordBrandEvent(event, {
      type: 'generation.requested',
      profileId: profile.$id,
      userId,
      payload: { slotId: slot.id, stepKey, hasHint: Boolean(body.hint) },
    })

    // WIEDERVERWENDUNG statt zweitem KI-Aufruf: derselbe Idempotenzschlüssel,
    // derselbe Entwurf. Ein doppelt abgeschickter Knopfdruck (Doppelklick,
    // Wiederholung nach Netzhänger) kostet so kein Kontingent — „was nichts
    // kostet, kostet kein Kontingent" (Plan §6). Entschieden wurde das schon
    // oben (`charges`), damit dieser Fall gar nicht erst gebucht wird.
    if (reused?.draft) {
      send('message.delta', { generationId, text: reused.draft })
      send('slot.ready', { generationId, slotId: slot.id, draft: reused.draft })
      send('generation.completed', {
        generationId,
        slotId: slot.id,
        revision: stepRow.revision ?? 0,
        messageId: null,
        model: reused.model,
        promptVersion: reused.promptVersion,
        createdAt: reused.createdAt,
        reused: true,
        // Wiederverwendet wird nur, was einen Entwurf HAT
        // (`findBrandGenerationByKey` verlangt ihn) — eine Rückfrage landet
        // deshalb nie in diesem Zweig.
        outcome: 'draft',
      })
      res.end()
      return
    }

    /**
     * DER VERLAUF DIESES BAUSTEINS (a-9) — die Antworten, die der Mensch auf
     * Georges Rückfragen in den Chat getippt hat.
     *
     * ER WIRD ERST HIER GELESEN, nach dem Wiederverwendungs-Zweig: ein
     * Cache-Treffer braucht ihn nicht, und was nichts kostet, soll auch keine
     * Abfrage kosten. FAIL-SOFT — ein unlesbarer Verlauf gibt ein leeres Array
     * und kostet den Lauf nicht (s. `brandConversationHistory.ts`).
     *
     * ER GEHT NICHT IN DEN `inputHash`: der beschreibt den Stand der
     * Quell-SLOTS, und dafür ist `collectSlotDependencies` die einzige Quelle.
     * Dieselbe bewusste Grenze wie bei Startkarte und Website-Text — eine neue
     * Chat-Antwort macht einen bestehenden Entwurf nicht still „veraltet"; die
     * Neuerzeugung stösst der Mensch selbst an.
     */
    // Der Verlaufs-Schnitt gilt auch hier (brand-013): ein Entwurf, der aus
    // dem verworfenen Gespräch schöpft, wäre genau die Erinnerung, die
    // ein Neubeginn beseitigen sollte.
    const conversation = await loadBrandConversationHistory(
      event, profile.$id, stepKey, undefined, stepRow.restartedAt,
    )

    const context: BrandGeneratorContext = {
      event,
      stepKey,
      slot,
      locale: profile.contentLocale,
      // Georges ANSPRACHE folgt der Seite, sein INHALT der Marke (s. Vertrag).
      // Der Rückfall auf die Inhaltssprache passiert HIER, damit kein
      // Generator ihn je selbst bauen muss.
      uiLocale: resolveBrandUiLocale(body.uiLocale, profile.contentLocale),
      pathKind: profileFacts(profile, betaAccount).pathKind,
      // DIE WEICHE W3 (george-a-14, Davids Entscheidung 2026-09-09): sie
      // entscheidet, WER im Markentext spricht. Die Beschriftungen bekamen sie
      // schon (`labelSlotDependencies`, oben), der Entwurfs-Auftrag nicht —
      // deshalb sprach der Pitch einer Solo-Marke von „unserer Werkstatt".
      team: profileFacts(profile, betaAccount).team,
      // Die STARTKARTE aus dem PROFIL (§2.1) — sie geht NICHT in den
      // `inputHash`: der beschreibt den Stand der Quell-SLOTS, und dafür ist
      // `collectSlotDependencies` die einzige Quelle. Eine Änderung an der
      // Karte macht einen Entwurf deshalb heute nicht „veraltet".
      startCard: profileStartCard(profile),
      // Der gelesene Website-Text (P2.3) — leer, solange niemand „Website
      // lesen" gedrückt hat. Er geht wie die Startkarte NICHT in den
      // `inputHash` (Begründung im Vertrag, `brandGenerators.ts`).
      siteAnalysis: profileSiteAnalysisText(profile),
      hint: body.hint ?? '',
      dependencies,
      conversation,
      signal: abort.signal,
      onDelta: (text: string) => { send('message.delta', { generationId, text }) },
    }

    let result: BrandGeneratorResult
    try {
      result = await choice.generator(context)
    }
    catch (error) {
      logEvent('error', 'brand.generation_provider_error', {
        generationId,
        slotId: slot.id,
        // Die MELDUNG des Anbieters, nicht der Prompt und nicht die Antwort.
        message: error instanceof Error ? error.message : String(error),
      })
      return fail('provider_error')
    }

    if (result.aborted || abort.signal.aborted) return fail('aborted')

    /**
     * ── ZWEI AUSGÄNGE STATT EINEM (george-a-4, Befund B3) ─────────────────
     * `draft` ist der FELD-Wert, `chat` der Zug im Verlauf. Bis a-3 waren das
     * dieselbe Zeichenkette; seit der Rahmung sind es zwei, und bei einer
     * RÜCKFRAGE gibt es den ersten gar nicht.
     *
     * Der Rückfall `result.message ?? result.draft` ist der Vertrag für jeden
     * Generator, der die Rahmung nicht kennt (Dev-Stub, künftige Bausteine):
     * dann ist der Zug wieder der Entwurf, wie vorher.
     */
    const outcome: BrandGenerationOutcome = result.outcome ?? 'draft'

    /**
     * ANTWORT-MÖGLICHKEITEN GIBT ES NUR ZUR RÜCKFRAGE (Davids Anforderung
     * 2026-09-04). Ein ENTWURFS-Zug endet laut Vertrag mit „passt das?" — dafür
     * sind zwei Knöpfe die falsche Form, denn die Antwort darauf ist entweder
     * eine Bestätigung (die hat ihren eigenen Knopf) oder eine Korrektur (die
     * ist Text). Sein ASK-Zweig bleibt deshalb unangetastet.
     *
     * GELESEN WIRD VOR DEM KLEMMEN: `clampDraft` schneidet auf den Slot-Deckel,
     * und die `OPTION:`-Zeilen stehen ganz am Ende — nach dem Klemmen wären sie
     * bei einem langen Zug die ersten, die fehlen.
     */
    const spoken = outcome === 'question'
      ? parseGeorgeOptions(result.message ?? result.draft)
      : { message: result.message ?? result.draft, options: [] as string[] }
    const chat = clampDraft(spoken.message, slot.maxLength)
    const draft = outcome === 'question' ? '' : clampDraft(stripBoldMarkers(result.draft), slot.maxLength)

    // Bei einer Rückfrage ist der ZUG das Ergebnis; bei einem Entwurf das FELD.
    // Ein leerer Zug wäre in beiden Fällen nichts, was man speichern sollte.
    if (!chat || (outcome === 'draft' && !draft)) return fail('empty_result')

    // KEIN `slot.ready` für eine Rückfrage: das Frame IST die Anweisung an den
    // Client, ein Feld zu füllen und es als Entwurf zu markieren.
    if (outcome === 'draft') send('slot.ready', { generationId, slotId: slot.id, draft })

    const completed = await persist({
      draft,
      chat,
      options: spoken.options,
      outcome,
      inputHash,
      generationId,
      result,
      entryBase: {
        slotId: slot.id,
        schemaVersion: 1,
        locale: profile.contentLocale,
        idempotencyKey: body.idempotencyKey,
      },
    })
    if (!completed) return fail('persist_failed')

    send('generation.completed', completed)
    logEvent('info', 'brand.generation_completed', {
      generationId,
      slotId: slot.id,
      stepKey,
      outcome,
      model: result.model,
      provider: result.provider,
      ms: Date.now() - started,
    })
    void recordBrandEvent(event, {
      type: 'generation.completed',
      profileId: profile.$id,
      userId,
      // `outcome` ist eine KENNZAHL, kein Inhalt (Log-Regel §6): „wie oft musste
      // George nachfragen" ist die Frage, an der man merkt, ob der Startbogen
      // genug erhebt.
      payload: { slotId: slot.id, stepKey, outcome, model: result.model, ms: Date.now() - started },
    })
    res.end()
  }
  finally {
    lock.release()
    // Der Burst-Platz gehört diesem Lauf, nicht seinem Ausgang: Erfolg,
    // Anbieterfehler und Abbruch geben ihn gleichermassen frei.
    burst?.release()
  }

  /**
   * Schreiben, in dieser Reihenfolge: frische Zeile lesen → Slot + Historie
   * fortschreiben → `brand_messages` → Fortschritts-Cache. Erst danach darf der
   * Aufrufer `generation.completed` senden.
   *
   * Scheitert etwas, gibt es `null` — und der Aufrufer meldet `persist_failed`
   * statt eines Abschlusses, den niemand wiederfindet.
   */
  async function persist(input: {
    /** Der FELD-Wert. Bei einer Rückfrage leer — dann bleiben die Slots unberührt. */
    draft: string
    /** Der Zug im Verlauf (gerahmter Entwurf bzw. die Rückfrage). */
    chat: string
    /** Antwort-Möglichkeiten zur Rückfrage — leer heisst „keine Chips". */
    options: readonly string[]
    outcome: BrandGenerationOutcome
    inputHash: string
    generationId: string
    result: { model: string, provider: string, promptVersion: string }
    entryBase: {
      slotId: string
      schemaVersion: number
      locale: string
      idempotencyKey: string | undefined
    }
  }): Promise<BrandGenerationCompletedData | null> {
    try {
      const fresh = await loadStepRow(event, profile.$id, stepKey) ?? stepRow
      const records = parseSlotRecords(fresh.slots)
      const now = new Date().toISOString()

      const before: BrandSlotRecord = records[input.entryBase.slotId] ?? {}
      const written: BrandSlotRecord = {
        ...before,
        // Der ERSTE Wert bleibt für immer stehen — aus dem Verhältnis von
        // `firstDraft` zu `confirmed` entstehen die beiden Übernahmequoten
        // (Audit 2). Eine Regeneration darf ihn nicht mitziehen.
        firstDraft: before.firstDraft ?? input.draft,
        latestDraft: input.draft,
        updatedAt: now,
      }
      // Ein NEUER Entwurf nimmt der Zeile ihre Abnahme (§5a): `accepted` ist
      // eine Aussage über einen gelesenen Wortlaut, und der ist jetzt ein
      // anderer. Der Server tut das, nie die Oberfläche.
      delete written.accepted
      const next: Record<string, BrandSlotRecord> = {
        ...records,
        [input.entryBase.slotId]: written,
      }

      const history = parseGenerations(fresh.generations)
      const entry: BrandGenerationEntry = {
        generationId: input.generationId,
        slotId: input.entryBase.slotId,
        schemaVersion: input.entryBase.schemaVersion,
        promptVersion: input.result.promptVersion,
        model: input.result.model,
        provider: input.result.provider,
        locale: input.entryBase.locale,
        inputHash: input.inputHash,
        createdAt: now,
        ...(input.entryBase.idempotencyKey ? { idempotencyKey: input.entryBase.idempotencyKey } : {}),
        // EINE RÜCKFRAGE HAT KEINEN `draft`, und das ist mehr als Sparsamkeit:
        // die Fassungs-Wiederherstellung bietet jeden Eintrag mit Text zum
        // Übernehmen an — eine Frage im Feld wäre dort ein Angebot, das
        // niemand annehmen will. Der Lauf steht trotzdem in der Historie
        // (`outcome`), sonst fehlte in der Herkunft ein bezahlter Aufruf.
        ...(input.outcome === 'question' ? { outcome: 'question' as const } : { draft: input.draft }),
      }
      const packed = packBrandGenerations([...history.items, entry], history.count + 1)

      const revision = (fresh.revision ?? 0) + 1
      const { tablesDB, databaseId } = brandDb(event)
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: fresh.$id,
        data: {
          generations: packed.json,
          revision,
          // NUR ein Entwurf fasst Slots und `inputHash` an. Der Hash sagt
          // „woraus ist der aktuelle Entwurf entstanden" — nach einer Rückfrage
          // gibt es keinen neuen, und ihn trotzdem fortzuschreiben machte einen
          // veralteten Entwurf stillschweigend wieder „aktuell".
          ...(input.outcome === 'draft'
            ? { slots: serializeSlotRecords(next), inputHash: input.inputHash }
            : {}),
        },
      })

      // Georges Zug im Verlauf — dieselbe `generationId` wie die Slot-Generation
      // (§3e: „Chat-Nachricht und Slot-Generation referenzieren dieselbe
      // generationId").
      let messageId: string | null = null
      try {
        const message = await tablesDB.createRow({
          databaseId,
          tableId: BRAND_MESSAGES_TABLE,
          rowId: ID.unique(),
          data: {
            profileId: profile.$id,
            stepKey,
            // DIE SESSION IST DAS FELD (brand-011): ein Entwurfs-Zug gehört in
            // den Faden des Feldes, das er entwirft — sonst stünde er im
            // Kapitel-Verlauf und in keiner Session.
            sessionKey: input.entryBase.slotId,
            role: 'george',
            body: input.chat,
            // `options` liegt ADDITIV daneben (Davids Anforderung 2026-09-04):
            // der `body` trägt sie NICHT — dort stünden die Beschriftungen als
            // roher Text in der Sprechblase.
            parts: JSON.stringify({
              kind: input.outcome,
              slotId: input.entryBase.slotId,
              ...(input.options.length ? { options: input.options } : {}),
            }),
            generationId: input.generationId,
          },
        })
        messageId = message.$id
      }
      catch (error) {
        // Der VERLAUF ist die Beilage, der ENTWURF ist die Sache. Eine
        // fehlgeschlagene Nachricht darf einen gespeicherten Entwurf nicht zu
        // `persist_failed` machen — der Mensch verlöre Text, um eine Zeile im
        // Chat zu retten.
        logEvent('warn', 'brand.generation_message_failed', {
          generationId: input.generationId,
          message: error instanceof Error ? error.message : String(error),
        })
      }

      // Der Fortschritts-Cache am Profil zieht mit (ein Entwurf zählt schon —
      // `stepProgress` rechnet mit `hasValue`, nicht mit `confirmed`).
      const mergedRows = (await loadStepRows(event, profile.$id)).map(row => (row.$id === fresh.$id
        ? { ...row, slots: JSON.stringify(next) }
        : row))
      const progress = resolveProfileProgress(
        resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(mergedRows)),
      )
      await touchProfile(event, profile.$id, {
        progressPct: progress.progressPct,
        currentStepKey: progress.currentStepKey,
      })

      return {
        generationId: input.generationId,
        slotId: input.entryBase.slotId,
        revision,
        messageId,
        model: input.result.model,
        promptVersion: input.result.promptVersion,
        createdAt: now,
        reused: false,
        outcome: input.outcome,
        // Rückwärts-Vertrag: fehlt das Feld, gibt es keine Chips — also genau
        // das Verhalten von vor dieser Runde.
        ...(input.options.length ? { options: input.options } : {}),
      }
    }
    catch (error) {
      logEvent('error', 'brand.generation_persist_failed', {
        generationId: input.generationId,
        slotId: input.entryBase.slotId,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
})
