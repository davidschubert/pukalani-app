import { ID } from 'node-appwrite'
import { createBrandConverseSchema } from '../../../../../../../schemas/brandConverse'
import {
  BRAND_DESIGN_VOICE,
  BRAND_VOICE,
  colleagueForStep,
  techniqueForStep,
} from '../../../../../../../shared/brandAdvisors'
import { BRAND_SUBSTANCE_MIN_WORDS, nextCollectPart } from '../../../../../../../shared/brandSessions'
import { formatBrandSlotStructured } from '../../../../../../../shared/brandSlotFormat'
import {
  type BrandGenerationEventDataMap,
  type BrandGenerationEventName,
  type BrandGenerationFailureCode,
  serializeBrandGenerationEvent,
} from '../../../../../../../shared/brandGeneration'
import {
  brandStepCompletion,
  resolveNextQuestion,
  resolveNextSession,
  resolveNextStop,
  skippedSessionsBetween,
} from '../../../../../../../shared/brandJourney'
import { resolveBrandUiLocale } from '../../../../../../../shared/brandUiLocale'
import {
  type BrandSlot,
  type BrandSlotStateFacts,
  isBrandDesignStep,
  slotById,
  slotIsConfirmable,
  slotsForStep,
} from '../../../../../../../shared/slotRegistry'
import type {
  BrandConverseResponse,
  BrandNextSessionRef,
} from '../../../../../../../shared/types/brand'
import {
  BRAND_MESSAGES_TABLE,
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  brandSlotRecordConfirmed,
  brandSlotStoredValue,
  loadBrandStepContext,
  parseCollectedParts,
  parseSlotRecords,
  profileFacts,
  profileStartCard,
  resolveBrandSessionStates,
  serializeSlotRecords,
  toStepFacts,
} from '../../../../../../utils/brandStore'
import { streamAdvisorTurn } from '../../../../../../utils/advisorGenerator'
import { claimBrandConverseKey } from '../../../../../../utils/brandConverse'
import {
  listBrandFindings,
  markBrandFindingsMentioned,
  toBrandFindingView,
} from '../../../../../../utils/brandFindingsStore'
import {
  hasBrandSessionAdvisorTurn,
  hasBrandStepMessage,
  loadBrandChapterAnswers,
  loadBrandConversationHistory,
} from '../../../../../../utils/brandConversationHistory'
import {
  BRAND_CONVERSE_MAX_TOKENS,
  BRAND_CONVERSE_PROMPT_VERSION,
  type BrandConverseBriefOptions,
  type BrandConverseSessionOptions,
  brandConversePrompt,
  countSessionProbes,
} from '../../../../../../utils/conversePrompt'
import { brandPromptToday, georgeSystemPrompt } from '../../../../../../utils/georgePrompt'
import {
  brandConfirmButtonLabel,
  brandDraftButtonLabel,
  brandKeepWritingButtonLabel,
  brandSessionPartLabel,
  brandSessionPartQuestion,
  brandSlotPromptLabel,
  brandSlotShortLabel,
  labelSlotDependencies,
} from '../../../../../../utils/brandSlotPromptLabels'
import {
  dropControlOptions,
  parseGeorgeConfirm,
  parseGeorgeOptions,
  stripGeorgeTurnMarkers,
} from '../../../../../../utils/georgeTurn'
import { acquireBrandGenerationLock, readBrandAiEnabled, retainBrandGeneration } from '../../../../../../utils/brandGenerators'
import { bookBrandAiQuota } from '../../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'

/**
 * DIE KONVERSATIONS-RUNDE (P3.2, Audit-Befund B5b) — der Berater REAGIERT.
 *
 * Bis hierher verschwand jede getippte Antwort ins Feld, und die nächste Frage
 * erschien mechanisch. Das Audit nannte es „Formular-Gefühl statt Gespräch";
 * Davids Leitsatz nennt den Grund: „Die Qualität der Antworten wird durchs
 * INTERVIEW bestimmt." Diese Route ist das Interview: EIN Zug nach der
 * Zug-Regel — würdigen, nachhaken oder respektvoll weitergehen, und dann die
 * nächste offene Frage in eigenen Worten.
 *
 * ── SIE SCHREIBT KEINEN SLOT. GAR KEINEN. ─────────────────────────────────
 * Es gibt in dieser Datei keinen Pfad, der `brand_steps.slots`, `inputHash`,
 * `latestDraft` oder `revision` anfasst — kein `slot.ready`-Frame, kein
 * Generations-Eintrag, keine Fassung. Der ganze Zug IST Nachricht. Die Antwort
 * des Menschen steht längst im Feld (normaler Autosave, vor diesem Aufruf
 * ausgespült); sie hier ein zweites Mal zu schreiben hiesse, zwei Wahrheiten
 * über denselben Text zu führen.
 *
 * ── DIE FRAMES SIND DIE DER GENERIERUNG, UND DAS IST KEINE ANLEIHE ────────
 * `generation.started` · `message.delta` · `generation.completed` /
 * `generation.failed` — dasselbe Protokoll, derselbe Leser
 * (`decodeBrandGenerationChunk`), dieselben Store-Aktionen im Browser. Ein
 * zweites Wire-Format für „Text tröpfelt in eine Sprechblase" hätte einen
 * zweiten Parser und eine zweite Zustandsmaschine gekostet, ohne etwas anderes
 * zu übertragen.
 *
 * `slot.ready` kommt NIE — und genau das ist der Beweis, dass hier kein Feld
 * gefüllt wird. `outcome: 'question'` im Abschluss-Frame sagt dasselbe in der
 * Sprache, die dieser Layer schon hat: „es gibt keinen Slot-Text, kein
 * `slot.ready` und keine Entwurfs-Markierung, nur einen Zug im Verlauf"
 * (`shared/brandGeneration.ts`). Die mitgeschickte `revision` ist die GELESENE
 * des Bausteins, nicht eine neue: sie kann den Autosave nie überholen.
 *
 * ── DER KILL-SWITCH ANTWORTET MIT 200, NICHT MIT EINEM FEHLER ────────────
 * Ist `brandAiEnabled` aus, gibt es kein SSE und keinen Fehler, sondern
 * `{ conversed: false }` — und die Werkstatt verhält sich exakt wie vor P3.2:
 * die Antwort steht im Feld, die nächste Frage erscheint. Ein Strom mit
 * `ai_disabled` wäre hier die falsche Form: bei der GENERIERUNG hat der Mensch
 * einen Knopf gedrückt und erwartet etwas, hier hat er eine Antwort getippt und
 * bekommt sein Formular-Verhalten von gestern. Ein Hinweis dafür wäre Lärm über
 * eine Zusatzleistung, die er nie gesehen hat.
 *
 * Dieselbe Antwort gibt es für einen WIEDERHOLTEN Idempotenzschlüssel und für
 * einen Zug, der an der Baustein-Sperre hängt (`brandConverse.ts`): `conversed:
 * false` heisst „es kommt kein Zug", und WARUM ist Sache des Servers.
 *
 * ── DIE DROSSEL BUCHT — UND ZWAR AUF IHREN EIGENEN EIMER ─────────────────
 * §6 zählt die freie Rückfrage ausdrücklich als Generierung. Gebucht wird
 * deshalb VOR dem Strom (429 mit `data.code`, wie bei der Generierung), aber
 * auf `brand-ai-talk-day:<profileId>` statt auf den Slot-Eimer der Frage — die
 * Begründung steht im Kopf von `shared/brandAiLimits.ts`. Anders als bei einem
 * Entwurf gibt es hier keinen kostenlosen Fall: jeder Zug ist ein echter
 * Anbieter-Aufruf, es gibt keinen Dev-Stub und keinen Cache-Treffer.
 *
 * ── PERSISTENZ VOR `completed`, UND DIE ANTWORT VOR DEM ZUG ──────────────
 * Erst die Nachricht des MENSCHEN, dann der Strom, dann die Nachricht des
 * BERATERS, dann das Abschluss-Frame. Die Reihenfolge ist die Lesbarkeit des
 * Verlaufs: `brand_messages` wird nach `$id` sortiert gelesen, und eine Antwort
 * vor ihrer Frage wäre ein Protokoll, das niemand mehr versteht.
 *
 * Die Nachricht des Menschen ist FAIL-SOFT (ihre Substanz steht im Feld), die
 * des Beraters nicht: sie IST das Ergebnis dieses Laufs, und ein „fertig" für
 * einen Text, den ein Reload nicht mehr findet, wäre eine Lüge — deshalb
 * `persist_failed`.
 *
 * ── LOG-REGEL §6 ─────────────────────────────────────────────────────────
 * Logzeilen und `brand_events` tragen Baustein, Slot-Id, Modell, Dauer und
 * Fehlercode — NIE den getippten Text, NIE den Prompt, NIE die Antwort.
 *
 * ── SEIT BW2 PAKET 3a: DER ZUG GEHÖRT EINER SESSION ──────────────────────
 * Ein Kapitel hat bis zu zwölf Sessions, und jede hat ihr eigenes Ziel, ihre
 * eigene Leiter und ihren eigenen Nachfrage-Deckel. Drei Dinge folgen daraus:
 *
 *  1. `sessionKey` im Rumpf (geprüft gegen die Registry, 400
 *     `session_foreign`); fehlt er, rechnet der Server die Grundfassung
 *     (`resolveNextSession`). Eine `locked`-Session wird mit 409
 *     `session_locked` abgewiesen — BEVOR irgendetwas wirkt.
 *  2. Der VERLAUF wird auf die Session geschnitten, und jede geschriebene
 *     Zeile trägt ihren Schlüssel (brand-011).
 *  3. Der ERÖFFNUNGSZUG (`opening: true`) ist ein Zug OHNE Nachricht davor:
 *     George spricht zuerst. Er ist IDEMPOTENT — hat die Session schon einen
 *     Zug des Beraters, antwortet die Route `{ conversed: false, skipped:
 *     true }` statt einen zweiten zu erzeugen.
 *
 * ── SEIT 2026-09-09: DER DRITTE ZUG, DER ABSCHLUSS (`closing`) ───────────
 * Davids Bild vom Ablauf einer Session (DECISION-LOG Punkt 10) hat drei
 * Stationen, und der Server sieht sie alle: ERÖFFNEN (`opening`) · ANTWORTEN
 * (der Normalfall, jetzt mit `sessionConfirmed`/`offerConfirm` im Auftrag) ·
 * ABSCHLIESSEN (`closing`, nach der Bestätigung). Der Abschlusszug fragt
 * nichts, schreibt nichts und trägt kein `askedSlotId`; er nennt, was jetzt
 * steht, was übersprungen wird und wohin es weitergeht — und WOHIN rechnet
 * `resolveNextStop`, nicht das Modell. Seine Bedingung ist serverseitig: die
 * Session muss bestätigt sein, sonst `{ conversed: false, skipped: true }`.
 *
 * DER SPRUNG SELBST GEHÖRT NICHT MEHR HIERHER. `next` reist weiter im
 * Abschluss-Frame — die Bühne macht daraus seit dieser Runde einen KNOPF
 * („Weiter zu …") statt einer Navigation, die von selbst passiert.
 *
 * ── DIE EINE AUSNAHME VON „SIE SCHREIBT KEINEN SLOT" ─────────────────────
 * Die SAMMEL-Session (`kind: 'collect'`, heute nur `a.facts`) sammelt ihre
 * Teile nacheinander, und es gibt kein Feld, in dem der Zwischenstand landen
 * könnte: die Antwort auf „wie viele Leute arbeiten mit" ist kein Wert, sie
 * ist ein Drittel davon. Also schreibt DIESE Route ihn — `slots[id].collected`
 * — und legt beim letzten Teil den zusammengelegten Wert als unbestätigten
 * Entwurf ab. Der Zug meldet dann die ERHÖHTE `revision`; jeder andere Zug
 * meldet weiter die gelesene. Für alles ausser `collect` gilt der Satz oben
 * unverändert, und die Gegenprobe im Beweis hängt genau daran.
 */

export default defineEventHandler(async (event): Promise<BrandConverseResponse | undefined> => {
  const started = Date.now()
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepKey, stepRow, stepRows } = await loadBrandStepContext(event, userId, betaAccount)

  const parsed = createBrandConverseSchema().safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid converse payload', data: { code: 'invalid_body' } })
  }
  const body = parsed.data

  // Der Slot ist hier nur ein ETIKETT für die Verlaufs-Zeile — geschrieben wird
  // er nicht. Trotzdem wird er geprüft: eine Zeile, die auf einen fremden
  // Baustein zeigt, wäre ein Verlauf, den kein Leser mehr zuordnen kann.
  if (body.slotId) {
    const slot = slotById(body.slotId)
    if (!slot || slot.stepId !== stepKey) {
      throw createError({ status: 400, statusText: 'Unknown slot', data: { code: 'unknown_slot' } })
    }
  }

  /**
   * WELCHE FRAGE IST DRAN — gerechnet aus der REGISTRY und dem gespeicherten
   * Stand, nie aus dem Rumpf. Der Client steuert genau eine Sache bei, die der
   * Server nicht haben kann: den lokal übersprungenen Rest („Weiß ich nicht"),
   * und der kann nur absagen, nie umordnen.
   */
  const records = parseSlotRecords(stepRow.slots)
  const skipped = new Set(body.skipped ?? [])
  const facts: Record<string, BrandSlotStateFacts> = {}
  for (const slot of slotsForStep(stepKey)) {
    facts[slot.id] = {
      hasValue: brandSlotStoredValue(records[slot.id]).length > 0 || skipped.has(slot.id),
      confirmed: brandSlotRecordConfirmed(records[slot.id]),
    }
  }
  const next = resolveNextQuestion(stepKey, facts, profileFacts(profile, betaAccount))

  /**
   * WELCHE SESSION IST DAS HIER (BW2 §6)?
   *
   * Der Client NENNT sie (er weiss, was der Mensch angeklickt hat), der Server
   * PRÜFT sie gegen die Registry — dieselbe Arbeitsteilung wie beim Wortlaut
   * der nächsten Frage. Eine Session aus einem fremden Baustein wäre ein
   * Gespräch, dessen Verlauf niemand mehr zuordnen kann, und ein Prompt, in
   * dem das Ziel eines anderen Kapitels steht.
   *
   * FEHLT der Schlüssel (jeder Client bis Paket 3c), gilt die Grundfassung:
   * die erste offene Pflicht-Session in Registry-Reihenfolge. `null` heisst
   * „hier ist gerade keine Session dran" — eine freie Frage in einem fertigen
   * Kapitel etwa; dann läuft der Zug wie vor BW2, ohne Session-Block.
   */
  let session: BrandSlot | null = null
  if (body.sessionKey) {
    const requested = slotById(body.sessionKey)
    if (!requested || requested.stepId !== stepKey || requested.deactivated) {
      throw createError({
        status: 400,
        statusText: 'Session does not belong to this step',
        data: { code: 'session_foreign' },
      })
    }
    session = requested
  }
  else {
    const fallback = resolveNextSession(stepKey, facts, profileFacts(profile, betaAccount))
    session = fallback ? slotById(fallback.slotId) ?? null : null
  }

  /**
   * EINE GESPERRTE SESSION IST NICHT BESPRECHBAR (§5 „Betreten") — 409 mit
   * `data.code`, wie jede fachliche Ablehnung dieses Layers.
   *
   * `done` und `stale` bleiben ERLAUBT: eine Vertiefung an einem bestätigten
   * Feld ist ein Gespräch, keine Korrektur — die Korrektur mit ihrem
   * Impact-Hinweis kommt mit Paket 6 und geht über die Slot-Route, nicht hier
   * durch. Gerechnet wird über die Fakten ALLER Kapitel, weil eine Session
   * über Kapitelgrenzen liest (`b.purpose` ← `a.pitch`).
   */
  const sessionStates = resolveBrandSessionStates(profileFacts(profile, betaAccount), toStepFacts(stepRows))
  if (session && sessionStates[session.id] === 'locked') {
    throw createError({
      status: 409,
      statusText: 'Session is locked',
      data: { code: 'session_locked' },
    })
  }
  /**
   * BLEIBT DIESER ZUG BEI SEINEM FELD? (converse-16, Testlauf-Befund 2 —
   * 2026-09-09.)
   *
   * ── DER BEFUND ──────────────────────────────────────────────────────────
   * Der Mensch ergänzte etwas im Gründungsimpuls; der Zug endete mit der Frage
   * der NÄCHSTEN Session („Kundenstimmen"). Die Bühne stand aber weiter auf dem
   * Gründungsimpuls (`brandStageClaim`, seit den Befunden A/G) — die Antwort
   * darauf landete deshalb in dem Feld, zu dem sie nicht gehört.
   *
   * ── DIE REGEL, SERVERSEITIG ─────────────────────────────────────────────
   * Solange die laufende Session UNBESTÄTIGT ist, gehört ihr der Zug. Der
   * Wegweiser auf die nächste Frage wird dann gar nicht erst mitgegeben — weder
   * im Auftrag (`stayField` statt `nextQuestion`-Zweig) noch in den Eingaben
   * (`[the next question]` fällt weg) noch als `askedSlotId` an die Bühne. Ein
   * Auftrag, der „frag nichts anderes" sagt, und ein Eingabe-Block, der die
   * fremde Frage danebenlegt, wären zwei Aussagen über denselben Zug.
   *
   * ── DREI AUSNAHMEN, JEDE MIT GRUND ──────────────────────────────────────
   *  1. Der ERÖFFNUNGS- und der ABSCHLUSSZUG: der eine stellt die Frage seiner
   *     eigenen Session, der andere spricht den Übergang aus — er ist die EINE
   *     Stelle, an der gewechselt wird (converse-14).
   *  2. Eine Session, die man gar nicht bestätigen kann (`d.pairs`): dort gibt
   *     es kein „erst bestätigen, dann weiter", also auch nichts festzuhalten.
   *  3. Die nächste offene Frage IST die dieser Session (dünne oder leere
   *     Antwort): sie noch einmal zu stellen ist genau das Richtige.
   */
  const staysOnSession = Boolean(
    session
    && !body.opening
    && !body.closing
    && slotIsConfirmable(session)
    && !brandSlotRecordConfirmed(records[session.id])
    && (!next || next.slotId !== session.id),
  )

  // Der Wortlaut zählt NUR, wenn er zu der Frage gehört, die der Server selbst
  // als nächste sieht. Sonst bekommt der Berater gesagt, dass er keine erfinden
  // darf (`nextQuestionKnown: false`) — die Reihenfolge gehört der Registry.
  const nextQuestion = !staysOnSession && next && body.nextSlotId === next.slotId
    ? (body.nextQuestion ?? '').trim()
    : ''

  /**
   * DIE OFFENEN PFLICHT-FELDER, sobald keine Katalog-Frage mehr dran ist
   * (converse-3, Davids Live-Fund am Krume-Archetyp): ohne sie sagte der
   * Prompt-Zweig „nichts mehr offen", während vier Ableitungs-Felder
   * unbestätigt waren — dieselbe Verwechslung von „keine Frage mehr" und
   * „nichts mehr offen", die auch der Bühnen-Satz hatte. Beschriftet wie die
   * Slot-Blöcke (Inhaltssprache, `brandSlotPromptLabel`), damit George im
   * Chat dieselben Namen benutzt wie die Karten daneben.
   */
  const openFieldLabels = next
    ? []
    : brandStepCompletion(stepKey, facts).missingRequired
        .map(slotId => brandSlotPromptLabel(
          slotId,
          profile.contentLocale,
          profileFacts(profile, betaAccount).pathKind,
          profileFacts(profile, betaAccount).team,
        ))

  /**
   * WELCHE FRAGE DIESER ZUG STELLT — für die Oberfläche, nicht für den Prompt.
   *
   * Sie reist als `slotId` in den Frames, und die Werkstatt entscheidet daran
   * die eine Sache, die sie sonst raten müsste: ob unter dem Zug noch die
   * Katalog-Frage stehen soll. Hat der Berater sie gerade selbst gestellt, wäre
   * sie eine Wiederholung; hat er (Wortlaut fehlt, Kapitel fertig) auf sie
   * verwiesen oder gar keine gestellt, steht hier `''` und die Katalog-Frage
   * bleibt sichtbar. Aus dem AUSBLEIBEN eines Frames wäre das nicht zu lesen.
   */
  // Beim ERÖFFNUNGSZUG stellt George die Frage SEINER Session — dann gehört
  // ihre Id hierher, damit die Werkstatt den Katalog-Satz nicht ein zweites
  // Mal darunter setzt. Der ABSCHLUSSZUG stellt gar keine Frage: `''`.
  const askedSlotId = body.opening
    ? (session?.id ?? '')
    : body.closing
      ? ''
      : (nextQuestion ? (next?.slotId ?? '') : '')

  const aiEnabled = await readBrandAiEnabled(event)
  if (!aiEnabled) return { conversed: false }

  /**
   * DER ERÖFFNUNGSZUG — und seine Sicherung gegen den zweiten (Plan §6).
   *
   * Der Client ruft ihn bei JEDEM Öffnen einer Session; er kann nicht wissen,
   * ob sie schon einmal offen war. Hat sie ihren ersten Zug, ist die ehrliche
   * Antwort „schon passiert" — nicht ein zweiter erster Satz und nicht ein
   * Fehler: es ist nichts schiefgegangen.
   *
   * Das KAPITEL-INTRO („eine Kollegin liest mit") fällt genau dann, wenn das
   * Kapitel noch KEINE einzige Nachricht hat. Eine EXISTENZ-Frage, keine
   * Zählung: „ist das hier der Anfang" braucht keine Zahl.
   */
  let chapterIntro = false
  if (body.opening) {
    // Ohne Session gäbe es nichts zu eröffnen — der Fall tritt ein, wenn im
    // Kapitel keine Frage mehr offen ist.
    if (!session) return { conversed: false, skipped: true }
    if (await hasBrandSessionAdvisorTurn(event, profile.$id, stepKey, session.id)) {
      return { conversed: false, skipped: true }
    }
    chapterIntro = !(await hasBrandStepMessage(event, profile.$id, stepKey))
  }

  /**
   * DER ABSCHLUSSZUG HAT EINE BEDINGUNG, UND ZWAR EINE EINZIGE: die Session
   * IST bestätigt (Davids Entscheidung 2026-09-09).
   *
   * Sie wird SERVERSEITIG geprüft und nicht geglaubt — der Rumpf sagt nur, dass
   * ein Abschlusszug gewünscht ist. Ein Abschluss über einem unbestätigten Wert
   * wäre genau die Lüge, gegen die diese Runde gebaut ist, nur mit vertauschten
   * Rollen: „Gründungsimpuls steht" über einem Feld, das noch offen ist.
   *
   * ── WARUM HIER KEIN „SCHON PASSIERT"-RIEGEL STEHT ────────────────────────
   * Der Eröffnungszug hat einen (`hasBrandSessionAdvisorTurn`), weil der Client
   * ihn bei JEDEM Öffnen ruft. Der Abschlusszug wird an genau EINER Stelle
   * ausgelöst — dem Klick auf „Bestätigen" — und darf sich wiederholen dürfen:
   * wer korrigiert und ein zweites Mal bestätigt, bekommt einen zweiten
   * Abschluss. Gegen den Doppelklick stehen die Baustein-Sperre und der
   * Idempotenzschlüssel, wie bei jedem anderen Zug.
   */
  if (body.closing) {
    if (!session) return { conversed: false, skipped: true }
    if (!brandSlotRecordConfirmed(records[session.id])) return { conversed: false, skipped: true }
  }

  /** '' NUR beim Eröffnungszug — das Schema weist jeden anderen leeren Zug ab. */
  const text = body.text ?? ''

  const turnId = ID.unique()

  /**
   * DIESELBE SPERRE WIE DIE GENERIERUNG, und das mit Absicht: in EINEM
   * Baustein spricht der Berater zu einer Zeit. Wer antwortet, während George
   * noch an einem Entwurf schreibt, bekommt keinen zweiten Zug in dieselbe
   * Spalte — seine Antwort ist trotzdem gespeichert und die nächste Frage steht
   * da. Sie wird VOR der Buchung gezogen: ein Zug, der ohnehin nicht läuft,
   * darf kein Kontingent verbrauchen.
   */
  const lock = acquireBrandGenerationLock(profile.$id, stepKey, turnId)
  if (!lock) return { conversed: false }

  /**
   * Ein wiederholter Zug kostet kein zweites Mal (s. `brandConverse.ts`) — und
   * zwar NACH der Sperre: ein Schlüssel, der schon an einer belegten Sperre
   * verbraucht würde, wäre beim nächsten ehrlichen Versuch aufgebraucht. Der
   * gleichzeitige Doppelklick fällt ohnehin schon der Sperre zum Opfer; dieser
   * Schlüssel fängt den NACHZÜGLER, der kommt, wenn alles längst durch ist.
   */
  if (!claimBrandConverseKey(userId, body.idempotencyKey)) {
    lock.release()
    return { conversed: false }
  }

  const burst = retainBrandGeneration(userId)
  const rejection = await bookBrandAiQuota(event, {
    userId,
    profileId: profile.$id,
    kind: 'talk',
  })
  if (rejection) {
    burst.release()
    lock.release()
    logEvent('info', 'brand.converse_throttled', { stepKey, code: rejection.code })
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Brand conversation limit reached',
      data: { code: rejection.code },
    })
  }

  const { tablesDB, databaseId } = brandDb(event)

  /**
   * DER VERLAUF, DEN DER BERATER SIEHT: die letzten Nachrichten dieses
   * Bausteins, älteste zuerst — fail-soft.
   *
   * Seit a-9 liegt die Abfrage in `brandConversationHistory.ts`, weil der
   * ENTWURFS-Generator denselben Verlauf braucht: eine Antwort auf Georges
   * Rückfrage erreichte den Entwurf sonst nie, und er fragte ein zweites Mal
   * dasselbe.
   */
  const history = await loadBrandConversationHistory(event, profile.$id, stepKey, session?.id, stepRow.restartedAt)

  /**
   * WAS DIE ANDEREN SESSIONS DIESES KAPITELS SCHON BEANTWORTET HABEN
   * (converse-12, Kailua-Befund 7 — Davids Entscheidung 2026-09-08).
   *
   * EIN Lesezugriff je Zug, direkt neben dem Verlauf: der ist auf die Session
   * geschnitten (brand-011, bleibt so), und ohne diesen zweiten Blick fragte
   * George eine Frage aus einer früheren Session desselben Kapitels erneut.
   * Beschriftet wird HIER — die Beschriftung braucht Inhaltssprache, Pfad und
   * Team-Weiche, und die kennt nur die Route (`brandSlotPromptLabel`).
   */
  const chapterAnswers = (await loadBrandChapterAnswers(
    event,
    profile.$id,
    stepKey,
    session?.id,
    stepRow.restartedAt,
  )).map(entry => ({
    label: brandSlotPromptLabel(
      entry.sessionKey,
      profile.contentLocale,
      profileFacts(profile, betaAccount).pathKind,
      profileFacts(profile, betaAccount).team,
    ),
    answer: entry.answer,
  }))

  /**
   * DIE SAMMEL-SESSION SCHREIBT (die eine Ausnahme, s. Kopf).
   *
   * Der Zwischenstand steht in `slots[id].collected` — Teil-Id → Antwort. Was
   * der Mensch gerade geschrieben hat, gehört dem Teil, der GERADE OFFEN ist;
   * es gibt darüber keine zweite Wahrheit und deshalb auch keine
   * KI-Einordnung, die falsch liegen könnte.
   *
   * Ist danach kein Teil mehr offen, entsteht der WERT: die Teile als
   * beschriftete Blöcke (`formatBrandSlotStructured`, die Form, auf die
   * `structured` verpflichtet ist), Beschriftung in der INHALTSSPRACHE der
   * Marke — der Wert gehört dem Dokument, nicht der Oberfläche. Er ist ein
   * unbestätigter ENTWURF: bestätigt wird auf der Bühne, wie überall.
   *
   * EIN BESTÄTIGTER SLOT WIRD NIE ANGEFASST (dieselbe Sperre wie im Autosave):
   * dort ist „Korrigieren" die einzige Tür.
   */
  const collecting = session?.kind === 'collect' && !brandSlotRecordConfirmed(records[session.id])
  const storedParts = collecting ? parseCollectedParts(records[session!.id]) : {}
  let promptParts: Record<string, string> = storedParts
  let promptPart = collecting ? nextCollectPart(session!, storedParts) : null
  let revision = stepRow.revision ?? 0
  let collectFinished = false
  /**
   * DER STAND, DEN EIN SPÄTERER SCHREIBVORGANG SEHEN MUSS. Die Sammel-Session
   * schreibt VOR dem Strom, die Merke „ausgesprochen" (Paket 4) DANACH — und
   * wer dabei die gelesenen `records` nähme, machte den Zwischenstand der
   * Sammel-Session wieder rückgängig.
   */
  let currentRecords: Record<string, BrandSlotRecord> = records

  /**
   * DER „HAT MITGELESEN"-BLOCK (Paket 4, Plan §7/§8) — was George in DIESEM
   * Zug einmal aussprechen darf.
   *
   * ── DREI ENTSCHEIDUNGEN, DIE MAN NICHT VEREINFACHEN DARF ────────────────
   * 1. DAS URTEIL GEHÖRT DER ZULETZT GESCHLOSSENEN Session dieses Kapitels,
   *    nicht der aktuellen: die aktuelle ist gerade erst aufgegangen und hat
   *    noch kein Urteil. Gewählt wird über `review.at` und nicht über die
   *    Registry-Reihenfolge — wer zurückspringt und ein früheres Feld
   *    korrigiert, soll dessen Nachtrag hören und nicht den eines Feldes,
   *    das er vor einer Woche geschlossen hat.
   * 2. NUR `goalReached: false`. Ein erfülltes Ziel braucht keinen Nachtrag,
   *    und „mir ist nichts aufgefallen" ist kein Gesprächsbeitrag.
   * 3. DIE KONFLIKTE HÄNGEN AN DER AKTUELLEN Session, nicht am Kapitel: der
   *    Mensch sitzt gerade an DIESEM Feld, und ein Konflikt zwischen zwei
   *    anderen Feldern wäre hier ein Themenwechsel. Er steht ohnehin als Chip
   *    an beiden beteiligten Blöcken (Paket 5).
   *
   * FAIL-SOFT: eine unlesbare Befund-Tabelle kostet den Hinweis, nie den Zug.
   */
  async function collectBrief(): Promise<{
    options: BrandConverseBriefOptions
    slotId: string | null
    findingIds: string[]
  } | null> {
    if (!session) return null

    const contentLocale = profile.contentLocale
    const { pathKind, team } = profileFacts(profile, betaAccount)

    let latest: { slotId: string, at: string, missing: string[] } | null = null
    for (const [slotId, record] of Object.entries(currentRecords)) {
      if (record.review?.goalReached !== false || record.briefDelivered === true) continue
      const missing = (record.review.missing ?? []).filter(entry => entry.trim().length > 0)
      if (!missing.length) continue
      const at = record.review.at ?? ''
      if (!latest || at > latest.at) latest = { slotId, at, missing }
    }

    const open = (await listBrandFindings(event, profile.$id, 'open'))
      .map(toBrandFindingView)
      .filter(view => !view.mentionedAt && view.slots.includes(session.id))
    const conflicts = open.filter(view => view.kind === 'conflict')
    /**
     * DIE MARKT-BEFUNDE (MV1 M3, Plan §2.5: „George bekommt den Bericht als
     * Block in der nächsten Session der betroffenen Felder — einmal, wie bei
     * Konflikten").
     *
     * Sie laufen durch DIESELBE Klammer wie die Konflikte: derselbe Brief,
     * dieselbe `mentionedAt`-Marke, dieselbe Beschränkung auf das Feld, an dem
     * der Mensch gerade sitzt. Genau deshalb steht hier nur ein zweiter
     * Filter und kein zweiter Weg — ein eigener Kanal hätte eine zweite
     * Antwort auf „wurde das schon gesagt?" gebraucht.
     */
    const market = open.filter(view => view.kind === 'market')

    if (!latest && !conflicts.length && !market.length) return null

    // '' in Georges eigenen Bausteinen — dort hat er selbst noch einmal
    // darüber gelesen (Begründung am Vertrag in `conversePrompt.ts`).
    const colleague = colleagueForStep(stepKey)?.name ?? ''
    return {
      options: {
        colleague,
        field: brandSlotPromptLabel(latest?.slotId ?? session.id, contentLocale, pathKind, team),
        missing: latest?.missing ?? [],
        conflicts: conflicts.map(view => ({
          fields: view.slots.map(slotId => brandSlotPromptLabel(slotId, contentLocale, pathKind, team)),
          why: view.why,
          ...(view.suggestion ? { suggestion: view.suggestion } : {}),
        })),
        market: market.map(view => ({
          // EIN Feld — ein Markt-Befund adressiert immer genau ein eigenes
          // (Plan §2.9 Nr. 5). `slots[0]` ist deshalb kein „das erste von
          // mehreren", sondern das einzige; ohne Slot bliebe die Beschriftung
          // die der laufenden Session, und das wäre geraten.
          field: brandSlotPromptLabel(view.slots[0] ?? session.id, contentLocale, pathKind, team),
          why: view.why,
          ...(view.suggestion ? { suggestion: view.suggestion } : {}),
        })),
      },
      slotId: latest?.slotId ?? null,
      findingIds: [...conflicts, ...market].map(view => view.id),
    }
  }

  if (collecting && !body.opening && promptPart && text) {
    const answered: Record<string, string> = { ...storedParts, [promptPart]: text }
    const stillOpen = nextCollectPart(session!, answered)
    const value = stillOpen
      ? null
      : formatBrandSlotStructured(session!.parts.map(part => ({
          label: brandSessionPartLabel(session!, part, profile.contentLocale),
          body: answered[part] ?? '',
        })))

    const before = records[session!.id]
    const candidate: BrandSlotRecord = { ...before, collected: answered, updatedAt: new Date().toISOString() }
    if (value) {
      // Der erste Wert bleibt stehen — dieselbe Regel wie im Autosave.
      if (candidate.firstDraft === undefined || candidate.firstDraft === null) candidate.firstDraft = value
      candidate.latestDraft = value
      // Und dieselbe Regel wie dort auch für die Abnahme: wer den WERT bewegt,
      // nimmt ihm das `accepted` (§5a) — der Server, nie die Oberfläche.
      delete candidate.accepted
    }

    try {
      const nextRevision = revision + 1
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: stepRow.$id,
        data: {
          slots: serializeSlotRecords({ ...records, [session!.id]: candidate }),
          revision: nextRevision,
        },
      })
      revision = nextRevision
      currentRecords = { ...records, [session!.id]: candidate }
      promptParts = answered
      promptPart = stillOpen
      collectFinished = Boolean(value)
    }
    catch (error) {
      // FEHLGESCHLAGEN heisst: derselbe Teil ist weiter offen, und George
      // fragt ihn in DIESEM Zug noch einmal. Den Prompt trotzdem weiterzu-
      // schieben hiesse, den nächsten Teil zu fragen und den verlorenen beim
      // übernächsten Aufruf ein zweites Mal — die verwirrendste der drei
      // möglichen Reihenfolgen.
      logEvent('warn', 'brand.converse_collect_failed', {
        stepKey,
        slotId: session!.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * DIE ANTWORT DES MENSCHEN WIRD ZUERST GESCHRIEBEN — vor dem Strom, damit sie
   * im Verlauf VOR der Reaktion steht (Sortierung nach `$id`).
   *
   * FAIL-SOFT, aus demselben Grund wie bei der Generierung: ihre SUBSTANZ steht
   * im Feld und ist über den Autosave längst gespeichert. Die Zeile hier ist das
   * Protokoll des Gesagten, nicht der Inhalt — und sie ist bewusst eine ZWEITE
   * Fassung: ändert der Mensch das Feld später, bleibt hier stehen, was er
   * damals geschrieben hat. Genau das macht die Reaktion des Beraters
   * nachvollziehbar.
   */
  let userMessageId: string | null = null
  // Beim ERÖFFNUNGS- und beim ABSCHLUSSZUG gibt es keine Antwort des Menschen —
  // eine leere Zeile im Verlauf wäre eine Äusserung, die niemand getan hat.
  // (Der Abschluss folgt auf einen KNOPF, nicht auf einen Satz.)
  if (!body.opening && !body.closing) {
    try {
      const row = await tablesDB.createRow({
        databaseId,
        tableId: BRAND_MESSAGES_TABLE,
        rowId: ID.unique(),
        data: {
          profileId: profile.$id,
          stepKey,
          // Der Faden DIESER Session (brand-011) — '' nur, wenn hier gerade
          // keine läuft (freie Frage in einem fertigen Kapitel).
          sessionKey: session?.id ?? '',
          role: 'user',
          body: text,
          // `kind: 'answer'` ist additiv neben 'draft'/'question' aus der
          // Generierung. Ohne `slotId` war es eine freie Frage.
          parts: JSON.stringify({ kind: 'answer', ...(body.slotId ? { slotId: body.slotId } : {}) }),
          generationId: turnId,
        },
      })
      userMessageId = row.$id
    }
    catch (error) {
      logEvent('warn', 'brand.converse_user_message_failed', {
        stepKey,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const res = event.node.res
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // Ohne diesen Kopf puffert nginx den Strom (s. generate.post.ts).
    'X-Accel-Buffering': 'no',
  })

  function send<N extends BrandGenerationEventName>(type: N, data: BrandGenerationEventDataMap[N]): void {
    if (res.writableEnded) return
    res.write(serializeBrandGenerationEvent(type, data))
  }

  // Gibt `undefined` zurück, damit die Ausgänge `return fail(…)` schreiben
  // können: der Rückgabetyp des Handlers ist die Kill-Switch-Antwort ODER
  // nichts, und `void` ist in einer Union kein gültiger Teilnehmer.
  function fail(code: BrandGenerationFailureCode): undefined {
    send('generation.failed', { generationId: turnId, code })
    logEvent('warn', 'brand.converse_failed', { stepKey, code, ms: Date.now() - started })
    void recordBrandEvent(event, {
      type: 'conversation.failed',
      profileId: profile.$id,
      userId,
      payload: { stepKey, code },
    })
    res.end()
    return undefined
  }

  const abort = new AbortController()
  event.node.req.on('close', () => abort.abort())

  try {
    // `slotId` ist hier die FRAGE, die dieser Zug stellt — nie ein Feld, das er
    // füllt. `''` heisst: er stellt keine aus dem Katalog (s. `askedSlotId`).
    send('generation.started', { generationId: turnId, slotId: askedSlotId, stepKey })

    // Die TECHNIK des Kapitels, nicht sein Sprecher: gesprochen wird jeder Zug
    // von George (Davids Eine-Stimme-Entscheidung 2026-09-02).
    const technique = techniqueForStep(stepKey)
    const uiLocale = resolveBrandUiLocale(body.uiLocale, profile.contentLocale)

    const system = georgeSystemPrompt({
      locale: uiLocale,
      contentLocale: profile.contentLocale,
      pathKind: profileFacts(profile, betaAccount).pathKind,
      technique,
      // Wie im Generator: die Stimmprobe der Technik spricht die Anrede der
      // Marke (BW1-Inhaltsrunde 2026-09-09).
      // Der Spalten-Wert ist ein roher String — dieselbe Engführung wie in
      // `document.get.ts` und `acceptance.get.ts`.
      team: profile.team === 'team' ? 'team' : 'solo',
      // george-a-15 (Befund 4): „seit 2021" wurde im Gespräch zu „drei Jahre".
      // Das Datum liest der SERVER, nicht der Prompt-Bauer.
      today: brandPromptToday(),
    })

    /**
     * DIE SESSION ALS AUFTRAG (§3a/§6) — Ziel, Antwort-Regeln, Leiter,
     * Qualität, Anti-Muster. Die Nachfrage-Zahl ist eine RECHNUNG über dem
     * Verlauf (`countSessionProbes`), kein gespeicherter Zähler: ein zweiter
     * Zähler neben dem Verlauf liefe bei jedem Abbruch auseinander.
     */
    const sessionOptions: BrandConverseSessionOptions | null = session
      ? {
          goal: session.goal,
          minSubstanceWords: BRAND_SUBSTANCE_MIN_WORDS[session.answers.minSubstance],
          probesLeft: Math.max(0, session.answers.maxProbes - countSessionProbes(history)),
          allowUnknown: session.answers.allowUnknown,
          allowDefer: session.answers.allowDefer,
          ladder: session.ladder,
          quality: session.quality,
          antiPatterns: session.antiPatterns,
          collect: promptPart
            ? {
                question: brandSessionPartQuestion(
                  session,
                  promptPart,
                  uiLocale,
                  profileFacts(profile, betaAccount).team,
                ),
                index: session.parts.indexOf(promptPart) + 1,
                total: session.parts.length,
              }
            : null,
        }
      : null

    /**
     * WAS DIE KOLLEGIN BEIM MITLESEN GEMERKT HAT (Paket 4, §7/§8).
     *
     * ZWEI Quellen, EIN Block: das Urteil des Schliess-Aufrufs über die zuletzt
     * geschlossene Session dieses Kapitels (`goalReached: false`) und die
     * offenen Konflikt-Befunde an DIESER Session. Beides wird genau EINMAL
     * ausgesprochen — die Marken dafür setzt der Zug, der es sagt (s. unten).
     *
     * Gelesen wird erst HIER, hinter Kill-Switch, Sperre und Buchung: ein Zug,
     * der ohnehin nicht läuft, soll keine Abfrage kosten.
     */
    const brief = await collectBrief()

    /**
     * DIE ENTWURFS-SESSION, auf die der Zug schliesst (converse-12) — die
     * Beschriftung ist die der Bühne, in der Inhaltssprache wie jede andere
     * Feld-Beschriftung im Prompt. `null` heisst „normaler Abschluss".
     */
    const sessionRecord = session ? currentRecords[session.id] : undefined
    const draftFieldLabel = session
      && session.type !== 'question'
      && session.type !== 'choice'
      && slotIsConfirmable(session)
      && !brandSlotRecordConfirmed(sessionRecord)
      && (brandSlotStoredValue(sessionRecord).length > 0 || session.generator !== 'none')
      ? brandSlotPromptLabel(
          session.id,
          profile.contentLocale,
          profileFacts(profile, betaAccount).pathKind,
          profileFacts(profile, betaAccount).team,
        )
      : ''

    /**
     * IST DIE AKTIVE SESSION BESTÄTIGT — UND DARF DIESER ZUG SIE ANBIETEN?
     * (converse-14, Davids Entscheidung 2026-09-09.)
     *
     * Beides aus den SLOT-FAKTEN, nie aus dem Rumpf. Die zweite Frage ist die
     * engere: bestätigen lässt sich nur, was bestätigbar ist UND schon einen
     * Wert trägt — sonst wiese die Bestätigungs-Route `slot_empty` ab, und der
     * Knopf wäre ein Angebot mit garantierter Absage (dieselbe Regel wie
     * `confirmEnabled` auf der Karte).
     */
    const sessionConfirmed = session ? brandSlotRecordConfirmed(sessionRecord) : false
    const offerConfirm = Boolean(
      session
      && slotIsConfirmable(session)
      && !sessionConfirmed
      && brandSlotStoredValue(sessionRecord).length > 0,
    )

    /**
     * DER ABSCHLUSSZUG BEKOMMT SEINEN WEG FERTIG GERECHNET (converse-14).
     *
     * ZIEL aus `resolveNextStop` (die Regel, nicht Georges Urteil — Davids
     * Rückfrage „wohin führt der Knopf, wenn das Nächste schon beantwortet
     * ist?"), ÜBERSPRUNGENE aus `skippedSessionsBetween`. Beide beschriftet wie
     * jedes andere Feld im Prompt (`brandSlotPromptLabel`, Inhaltssprache) —
     * eine rohe Id im Abschlusssatz wäre der Live-Fund vom 2026-09-03 an genau
     * der Stelle, an der der Mensch weiterklicken soll.
     */
    const closingOptions = body.closing && session
      ? (() => {
          const stop = resolveNextStop(stepKey, facts, sessionStates)
          /**
           * DER KURZE NAME, NICHT DIE FRAGE (Testlauf-Befund 3, 2026-09-09).
           *
           * `brandSlotPromptLabel` liefert für eine Frage-Session den
           * FRAGETEXT — der Abschlusszug zitierte deshalb wörtlich „Der
           * nächste Schritt heißt „Was sagen deine glücklichsten Kunden über
           * euch — in DEREN Worten?"". Ein Ziel wird benannt, nicht gefragt;
           * `brandSlotShortLabel` ist dieselbe Label-vor-Frage-Regel, die auch
           * die Leiste und die Log-Karten benutzen.
           */
          const label = (slotId: string) => brandSlotShortLabel(
            slotId,
            profile.contentLocale,
            profileFacts(profile, betaAccount).pathKind,
            profileFacts(profile, betaAccount).team,
          )
          const skipFacts: Record<string, { confirmed: boolean, deferred: boolean }> = {}
          for (const slot of slotsForStep(stepKey)) {
            skipFacts[slot.id] = {
              confirmed: brandSlotRecordConfirmed(currentRecords[slot.id]),
              deferred: currentRecords[slot.id]?.deferred === true,
            }
          }
          return {
            goal: session.goal,
            /**
             * DER BESTÄTIGTE WERT (Testlauf-Befund 1, 2026-09-09): ohne ihn
             * kannte der Abschluss-Auftrag den Zustand des Feldes nicht und
             * verwies am fertigen Elevator-Pitch auf den Entwurfs-Knopf. Er
             * kommt aus `currentRecords` und nicht aus dem Rumpf — bestätigt
             * hat die Bestätigungs-Route, gelesen wird der Server-Stand. Den
             * Zeichen-Deckel setzt der Prompt (`BRAND_CLOSING_VALUE_CHARS`),
             * wie bei jedem anderen Textblock dort.
             */
            value: brandSlotStoredValue(currentRecords[session.id]),
            nextLabel: stop && 'sessionKey' in stop ? label(stop.sessionKey) : '',
            acceptance: !stop || 'acceptance' in stop,
            skipped: skippedSessionsBetween(stepKey, session.id, stop, skipFacts).map(label),
          }
        })()
      : null

    const prompt = brandConversePrompt(
      {
        hasNextQuestion: Boolean(next),
        nextQuestionKnown: nextQuestion.length > 0,
        openFieldLabels,
        /**
         * DER KNOPF, DER WIRKLICH ENTWIRFT (converse-11, Befund 8): George darf
         * nie behaupten, etwas eingetragen zu haben — er darf aber sagen, wo
         * der Entwurf herkommt. Die STIMME des Kapitels entscheidet den Namen
         * (in Brand Design steht dort „Frida, entwirf das"); gerechnet wird sie
         * wie in der Werkstatt, damit im Chat und auf dem Knopf dasselbe steht.
         */
        draftButton: brandDraftButtonLabel(
          uiLocale,
          (isBrandDesignStep(stepKey) ? BRAND_DESIGN_VOICE : BRAND_VOICE).name,
        ),
        /**
         * SITZT DER MENSCH AUF EINER ENTWURFS-SESSION? (converse-12,
         * Kailua-Befund 5 — Davids „Weg B").
         *
         * Dann schliesst der Zug auf DIESEM Feld und nicht mit der Katalog-
         * Frage eines anderen. Die Bedingung ist wörtlich die der Bühne
         * (`brandStageClaim`, shared/brandStageModule.ts): keine Katalog-
         * Frage, bestätigbar, noch nicht bestätigt — und entweder steht schon
         * ein Entwurf da oder es gibt einen Knopf, der einen erzeugt. Zwei
         * verschiedene Antworten auf „was zeigt die Bühne gerade" wären genau
         * der Nebenbefund, der diese Runde ausgelöst hat.
         */
        ...(draftFieldLabel ? { draftField: draftFieldLabel } : {}),
        /**
         * UND WO ES KEINE ENTWURFS-SESSION IST: DIE UNBESTÄTIGTE FRAGE-SESSION
         * HÄLT DEN ZUG (converse-16, Befund 2 — s. `staysOnSession` oben).
         *
         * Die beiden schliessen einander aus und stehen deshalb als Kette:
         * `draftField` gehört den Feldern OHNE Katalog-Frage und schliesst auf
         * den Entwurfs-Knopf, `stayField` denen MIT Frage und schliesst auf
         * eine Nachfrage. Beides gleichzeitig zu schicken hiesse, dem Modell
         * zwei Abschlüsse für einen Zug anzubieten.
         */
        ...(!draftFieldLabel && staysOnSession && session
          ? {
              stayField: brandSlotPromptLabel(
                session.id,
                profile.contentLocale,
                profileFacts(profile, betaAccount).pathKind,
                profileFacts(profile, betaAccount).team,
              ),
            }
          : {}),
        // DIE ANREDE (converse-13, Davids Klick-Test): „alleine" heisst du,
        // „im Team" heisst ihr — dieselbe Weiche wie bei den Beschriftungen.
        team: profileFacts(profile, betaAccount).team,
        session: sessionOptions,
        // converse-14: der Zustand der Session erreicht endlich den Auftrag.
        sessionConfirmed,
        offerConfirm,
        // Der Knopf, der wirklich bestätigt — dieselbe Quelle wie `draftButton`.
        confirmButton: brandConfirmButtonLabel(uiLocale),
        ...(closingOptions ? { closing: closingOptions } : {}),
        ...(brief ? { brief: brief.options } : {}),
        ...(body.opening
          ? {
              opening: true,
              chapterIntro,
              // DER SPIEGEL (converse-14) — nur, wo es etwas zu spiegeln gibt.
              mirror: chapterAnswers.length > 0,
            }
          : {}),
        /**
         * EINE VERALTETE SESSION WIRD NEU BESPROCHEN (§9, converse-9): George
         * eröffnet mit dem GRUND, nicht mit der alten Frage. Die Quellen
         * kommen beschriftet, nicht als Ids (converse-2), und nur beim
         * Eröffnungszug — mitten im Gespräch wäre es eine Wiederholung.
         */
        ...(body.opening && session && sessionStates[session.id] === 'stale'
          ? {
              staleSources: session.inputs.slots.map(slotId => brandSlotPromptLabel(
                slotId,
                profile.contentLocale,
                profileFacts(profile, betaAccount).pathKind,
                profileFacts(profile, betaAccount).team,
              )),
            }
          : {}),
      },
      {
        startCard: profileStartCard(profile),
        // Menschliche Beschriftung statt interner Id (converse-2) — George
        // sprach `a.customerPraise` & Co. sonst wortwörtlich nach.
        slots: labelSlotDependencies(
          slotsForStep(stepKey).map(slot => ({
            slotId: slot.id,
            value: brandSlotStoredValue(records[slot.id]),
          })),
          profile.contentLocale,
          profileFacts(profile, betaAccount).pathKind,
          profileFacts(profile, betaAccount).team,
        ),
        history,
        // Leer heisst KEIN BLOCK (s. `formatBrandConverseInputs`) — die Liste
        // reist auch beim ERÖFFNUNGSZUG mit: dort hat die frische Session
        // keinen eigenen Verlauf, und genau dort wiederholt sich am ehesten
        // eine längst beantwortete Frage.
        ...(chapterAnswers.length ? { chapterAnswers } : {}),
        answeredQuestion: body.question ?? '',
        text,
        nextQuestion,
        ...(session && Object.keys(promptParts).length
          ? {
              collected: session.parts
                .filter(part => promptParts[part]?.trim())
                .map(part => ({
                  label: brandSessionPartLabel(session, part, profile.contentLocale),
                  value: promptParts[part]!,
                })),
            }
          : {}),
      },
    )

    let turn: Awaited<ReturnType<typeof streamAdvisorTurn>>
    try {
      turn = await streamAdvisorTurn({
        event,
        system,
        prompt,
        maxTokens: BRAND_CONVERSE_MAX_TOKENS,
        signal: abort.signal,
        onDelta: (text: string) => { send('message.delta', { generationId: turnId, text }) },
      })
    }
    catch (error) {
      logEvent('error', 'brand.converse_provider_error', {
        stepKey,
        // Die MELDUNG des Anbieters, nicht der Prompt und nicht die Antwort.
        message: error instanceof Error ? error.message : String(error),
      })
      return fail('provider_error')
    }

    if (turn.aborted || abort.signal.aborted) return fail('aborted')

    /**
     * ZUERST DIE ANTWORT-MÖGLICHKEITEN, DANN DAS PUTZEN (Davids Anforderung
     * 2026-09-04) — und diese Reihenfolge ist keine Geschmackssache:
     * `stripGeorgeTurnMarkers` wirft die `OPTION:`-Zeilen weg, wer danach
     * fragt, findet nichts mehr.
     *
     * Der Rest bleibt, wie er war: ein Konversations-Zug kennt keine anderen
     * Marker — hätte das Modell trotzdem welche gesetzt (es schreibt in anderen
     * Zügen mit `BASIS:`/`ASK:`), fielen sie hier weg statt in den Verlauf zu
     * wandern.
     */
    const offered = parseGeorgeConfirm(turn.text)
    const spoken = parseGeorgeOptions(offered.message)
    const message = stripGeorgeTurnMarkers(spoken.message).trim()
    if (!message) return fail('empty_result')

    /**
     * DAS ANGEBOT ENTSCHEIDET DER SERVER, NICHT DAS MODELL (Testlauf-Befund C,
     * 2026-09-09 — schärft converse-14).
     *
     * Bis hierher galt `offered.confirm && offerConfirm`: der Marker war
     * Bedingung, `offerConfirm` nur das Veto. Im Live-Test kamen die zwei
     * Knöpfe deshalb beim Gründungsimpuls sofort — und bei Kundenstimmen und
     * Größtes Hindernis NIE, weil George dort nachbohrte und den Marker
     * vergass. Der Mensch hatte damit keinen Weg, eine Antwort für gut zu
     * erklären, ausser über die Karte rechts.
     *
     * Die Wahrheit ist jetzt die ROUTE: hat die aktive Session einen Wert und
     * ist sie unbestätigt (`offerConfirm`, aus den Slot-Fakten), reist das
     * Angebot IMMER mit. Der Auftrag behält seine `CONFIRM:`-Zeile als STIL —
     * George soll in einem Nebensatz sagen, wo er steht —, aber ein
     * vergessener Marker kostet kein Bedienelement mehr. Ein übereifriger
     * ebenso wenig: ohne `offerConfirm` gibt es kein Angebot, und der Marker
     * fällt trotzdem aus dem sichtbaren Text.
     */
    const confirmOffered = offerConfirm

    /**
     * UND ZWAR ALS EINZIGES PAAR KNÖPFE (Testlauf-Befund D): eine
     * `OPTION:`-Zeile mit der Bedeutung „passt so" / „ich ergänze noch etwas"
     * wäre daneben ein zweiter Knopf für dieselbe Entscheidung — nur einer, der
     * seinen Text als ANTWORT in das Feld schreibt. Die Regel steht pur nebenan
     * (`dropControlOptions`), die Beschriftungen kommen aus demselben
     * Locale-Eintrag, den die Bühne rendert.
     */
    const options = confirmOffered
      ? dropControlOptions(spoken.options, [
          brandConfirmButtonLabel(uiLocale),
          brandKeepWritingButtonLabel(uiLocale),
        ])
      : spoken.options

    let messageId: string
    try {
      const row = await tablesDB.createRow({
        databaseId,
        tableId: BRAND_MESSAGES_TABLE,
        rowId: ID.unique(),
        data: {
          profileId: profile.$id,
          stepKey,
          sessionKey: session?.id ?? '',
          role: 'george',
          body: message,
          // Dieselbe `generationId` wie die Antwort, auf die sie reagiert — so
          // gehören Frage und Reaktion im Verlauf sichtbar zusammen. `options`
          // liegt ADDITIV daneben: der Verlauf soll später auch wissen, welche
          // Wahl angeboten wurde — der `body` trägt sie bewusst NICHT, denn
          // dort stünden sie als roher Text in der Sprechblase.
          parts: JSON.stringify({
            // `closing` steht NEBEN 'reply'/'draft'/'question' — der Verlauf
            // soll später lesen können, welcher Zug eine Session geschlossen
            // hat, ohne ihn am Wortlaut erraten zu müssen.
            kind: body.closing ? 'closing' : 'reply',
            ...(body.slotId ? { slotId: body.slotId } : {}),
            ...(options.length ? { options } : {}),
            // ADDITIV wie `options`: ein nachgeladener Verlauf zeigt die zwei
            // Knöpfe wieder, statt sie beim Reload zu verlieren.
            ...(confirmOffered ? { confirm: true } : {}),
          }),
          generationId: turnId,
        },
      })
      messageId = row.$id
    }
    catch (error) {
      logEvent('error', 'brand.converse_persist_failed', {
        stepKey,
        message: error instanceof Error ? error.message : String(error),
      })
      return fail('persist_failed')
    }

    /**
     * DER ZUG HAT ES GESAGT, ALSO IST ES GESAGT (Paket 4, §7/§8).
     *
     * Die Marken fallen NACH dem Persistieren: ein Zug, der nie im Verlauf
     * landet, hat auch nichts ausgesprochen — und ein `briefDelivered`, das
     * vor einem `persist_failed` gesetzt worden wäre, hätte den Hinweis für
     * immer verschluckt.
     *
     * FAIL-SOFT in beide Richtungen: scheitert der Stempel, wiederholt George
     * den Nachtrag einmal. Lästig, aber harmlos — und deutlich besser als ein
     * `provider_error` für einen Zug, den der Mensch schon gelesen hat.
     */
    if (brief) {
      await markBrandFindingsMentioned(event, brief.findingIds)
      if (brief.slotId) {
        const marked: BrandSlotRecord = { ...currentRecords[brief.slotId], briefDelivered: true }
        const nextRevision = revision + 1
        try {
          await tablesDB.updateRow({
            databaseId,
            tableId: BRAND_STEPS_TABLE,
            rowId: stepRow.$id,
            data: {
              slots: serializeSlotRecords({ ...currentRecords, [brief.slotId]: marked }),
              revision: nextRevision,
            },
          })
          revision = nextRevision
          currentRecords = { ...currentRecords, [brief.slotId]: marked }
        }
        catch (error) {
          logEvent('warn', 'brand.converse_brief_mark_failed', {
            stepKey,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    /**
     * AUTO-WEITER (§5): welche Session nach diesem Zug dran ist — gerechnet
     * NACH dem Zug und aus dem SERVER-Stand, nie aus dem Rumpf.
     *
     * Seit Paket 6 bedient er die WARTESCHLANGE „neu besprechen" zuerst
     * (§9): die Zustände sind die von oben — ein Gesprächszug bestätigt
     * nichts, also kann er auch keine Session veralten lassen oder heilen.
     * Der adaptive Vorschlag des Spezialisten (Paket 4) füllt dasselbe Feld
     * an der Schliess-Route; die Aufrufstelle im Browser bleibt dieselbe.
     */
    const factsAfter: Record<string, BrandSlotStateFacts> = collectFinished && session
      ? { ...facts, [session.id]: { ...facts[session.id], hasValue: true } }
      : facts
    // Am KAPITELENDE zeigt der Wegweiser auf die Finale Abnahme statt ins
    // Leere (`resolveNextStop`, Fables Produktentscheidung zu 3a-Frage 4).
    const nextSession: BrandNextSessionRef | null = resolveNextStop(stepKey, factsAfter, sessionStates)

    send('generation.completed', {
      generationId: turnId,
      slotId: askedSlotId,
      // GELESEN, nicht erhöht — AUSSER die Sammel-Session hat geschrieben
      // oder der „hat mitgelesen"-Block wurde als gesagt vermerkt (s. Kopf):
      // eine gemeldete alte Fassung liefe dem nächsten Autosave in einen 409.
      revision,
      messageId,
      model: turn.model,
      promptVersion: BRAND_CONVERSE_PROMPT_VERSION,
      createdAt: new Date().toISOString(),
      reused: false,
      // Kein Feldwert — dieselbe Bedeutung wie bei einer Rückfrage.
      outcome: 'question',
      // NUR wenn es welche gibt: ein leeres Array wäre für den Leser dasselbe
      // wie „keine", kostete aber einen Sonderfall im Rückwärts-Vertrag.
      ...(options.length ? { options } : {}),
      // Dasselbe für das Bestätigungs-Angebot (converse-14).
      ...(confirmOffered ? { confirm: true } : {}),
      next: nextSession,
    })
    logEvent('info', 'brand.converse_completed', {
      stepKey,
      slotId: body.slotId ?? '',
      model: turn.model,
      provider: turn.provider,
      hasNextQuestion: Boolean(next),
      ms: Date.now() - started,
    })
    void recordBrandEvent(event, {
      type: 'conversation.turn',
      profileId: profile.$id,
      userId,
      // KENNZAHLEN, kein Inhalt: „wie oft antwortet jemand ohne Frage-Slot"
      // (freie Fragen) ist die Zahl, an der man merkt, ob das Panel als
      // Gespräch verstanden wird.
      payload: {
        stepKey,
        slotId: body.slotId ?? '',
        free: !body.slotId,
        answered: userMessageId !== null,
        model: turn.model,
        ms: Date.now() - started,
      },
    })
    res.end()
  }
  finally {
    lock.release()
    burst.release()
  }
})
