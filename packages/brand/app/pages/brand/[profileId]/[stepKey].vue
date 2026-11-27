<script setup lang="ts">
import {
  type BrandNextSessionRef,
  brandStepCompletion,
  resolveNextQuestion,
} from '../../../../shared/brandJourney'
import {
  BRAND_ACCEPTANCE_VIEW,
  type BrandNavSession,
  isAcceptanceView,
  resolveActiveSession,
} from '../../../../shared/brandWorkspaceNav'
import { teamTextKeyFor } from '../../../../shared/brandTeamText'
import { nextCollectPart } from '../../../../shared/brandSessions'
import {
  BRAND_STEP_KEYS,
  type BrandPathKind,
  type BrandSlot,
  type BrandSlotStateFacts,
  type BrandStepKey,
  type BrandTeamKind,
  isBrandDesignStep,
  partKeyFor,
  questionKeyFor,
  slotLabelKeyFor,
  slotIsConfirmable,
  slotsForStep,
} from '../../../../shared/slotRegistry'
import {
  brandSlotDisplayValue,
  brandSlotIsConfirmed,
} from '../../../../shared/brandAutosaveDiff'
import { brandChoiceDisplayLabel } from '../../../../shared/brandChoiceOptions'
import {
  BRAND_DESIGN_VOICE,
  BRAND_VOICE,
  type BrandAdvisorKey,
  colleagueForStep,
} from '../../../../shared/brandAdvisors'
import {
  type BrandSlotReadiness,
  slotReadiness,
} from '../../../../shared/brandSlotReadiness'
import type { BrandSlotControls } from '../../../../shared/brandSlotControls'
import {
  type BrandStageActiveSession,
  type BrandStageClaim,
  type BrandStageModule,
  brandAnswerTarget,
  brandStageAnswerCard,
  brandStageAwaitsDraftAnswer,
  brandStageClaim,
  brandStaticQuestionVisible,
} from '../../../../shared/brandStageModule'
import { useBrandWorkspaceStore } from '../../../stores/brandWorkspace'
import { useBrandAutosave } from '../../../composables/useBrandAutosave'
import { useBrandFieldLabel } from '../../../composables/useBrandFieldLabel'
import { useBrandConversation } from '../../../composables/useBrandConversation'
import { useBrandWorkshopComposer } from '../../../composables/useBrandWorkshopComposer'
import { useBrandWorkshopChoices } from '../../../composables/useBrandWorkshopChoices'
import { useBrandWorkshopLogCards } from '../../../composables/useBrandWorkshopLogCards'
import { useBrandWorkshopBenches } from '../../../composables/useBrandWorkshopBenches'
import { useBrandGeneration } from '../../../composables/useBrandGeneration'
import { useBrandWorkshopLayout } from '../../../composables/useBrandWorkshopLayout'
import { useBrandWorkshopRail } from '../../../composables/useBrandWorkshopRail'
import { useBrandSlotRevision } from '../../../composables/useBrandSlotRevision'
import { useBrandWorkshopSession } from '../../../composables/useBrandWorkshopSession'
import { type BrandSlotCard, useBrandWorkshopQueue } from '../../../composables/useBrandWorkshopQueue'

/**
 * DIE WERKSTATT — „GESPRÄCH ALS BÜHNE" (Davids Konzept-Revision 2026-09-02,
 * in 39 Korrekturrunden am Klickdummy `/brand/demo/gespraech` abgenommen;
 * Auftrag: docs/archiv/BRAND-WIZARD-GESPRAECH-UMBAU.md).
 *
 * ── WAS SICH GEDREHT HAT ──────────────────────────────────────────────────
 * Bis hierher war die BÜHNE das Dokument (alle Slots untereinander) und die
 * rechte Spalte der Chat. Jetzt ist es umgekehrt, und zwar aus Davids Grund:
 * „der ki markenberater muss zentral in der mitte sein … und rechts, wo jetzt
 * der chat ist, der LOG-bereich … nach jeder frage einmal final confirmen."
 *
 *   LINKS   `BwWorkspaceSidebar` — Marken-Wähler, Bereiche/Bausteine, Sync
 *   MITTE   das GESPRÄCH: Züge, Antwort-Module im Zug, Prompt fest unten
 *   RECHTS  der LOG: je Kapitel eine Sektion, je Entscheidung eine Karte
 *
 * Die Topbar entfällt (`topbar=false`), der Rail-Fuß auch
 * (`railFooter=false`) — der GESAMT-Fortschritt steht unten rechts im Log.
 *
 * ── DIE SERVER-LOGIK IST UNANGETASTET ─────────────────────────────────────
 * Slots, Zustandsmaschine, Bestätigen-als-Server-Zustand, Readiness-Gate,
 * Drosseln, Autosave/409 und der SSE-Strom sind exakt die von vorher; dieser
 * Umbau verdrahtet sie NEU, er ändert sie nicht. Keine Route, kein
 * shared-Vertrag wurde dafür angefasst.
 *
 * ── DREI STELLEN, AN DENEN DUMMY UND ECHTE DATENLAGE AUSEINANDERGEHEN ─────
 * 1. Der Dummy bestätigt JEDE Antwort sofort im nächsten Zug. Hier bleibt die
 *    bestehende Reihenfolge: `resolveNextQuestion` gilt ein Feld schon als
 *    beantwortet, sobald ein WERT drinsteht (`slotIsFilled`) — der Server
 *    rechnet genauso, und `nextSlotId` der converse-Route hängt daran. Also
 *    laufen erst die Fragen, dann die Bestätigungen; bestätigen kann man
 *    jederzeit rechts im Log, wo jede offene Karte ihren Knopf trägt.
 * 2. Der Dummy sperrt das Prompt, sobald kein answer-Zug offen ist. Hier
 *    bleibt es zusätzlich für die FREIE Frage offen — das ist gebautes
 *    P3.2-Verhalten („wer am Ende eines Kapitels ‚was meinst du mit
 *    Positionierung?' schreibt, bekommt eine Antwort"). Gesperrt ist es nur,
 *    wenn eine AUSWAHL dran ist: die beantwortet ihr eigenes Modul.
 * 3. Die Erklär-Layer der Leiste bauen ihre Entscheidungs-Listen aus der
 *    Slot-Registry. Den erklärenden ABSATZ je Baustein gibt es im echten
 *    Layer noch nicht (im Dummy steht er als deutsches Literal in
 *    `demoRail`) — er bleibt weg, statt erfunden zu werden.
 *
 * ── ZWEI ZUSTÄNDE, DIE KEINE FEHLERSEITE SIND ─────────────────────────────
 * `blocked` (403: der Baustein liegt nicht auf dem Weg — `locked` oder
 * `skipped`) und der KONFLIKT (409). Beide bekommen eine Fläche mit
 * Erklärung, denn beide sind ERKLÄRBAR: es gibt dieses Branding, es gibt
 * diesen Baustein, er ist hier nur (noch) nicht dran.
 *
 * ── EIN FREMDES ODER UNBEKANNTES BRANDING IST EIN 404 (Paket 9) ───────────
 * Davids Entscheidung 2026-09-05 („Werkstatt soll auch 404 zeigen") — dieselbe
 * Regel wie auf dem Dokument (Paket 8). Vorher stand hier eine dritte Fläche
 * an `store.denied`, und die war eine Lüge in zwei Richtungen: Für einen
 * FREMDEN Schlüssel sah man sie gar nicht erst (der Listen-Abruf für den
 * Marken-Wähler nahm einem eingeloggten Menschen das `denied` sofort wieder
 * weg — übrig blieb „Namenloses Branding" mit HTTP 200, ein Soft-404 wie beim
 * ungültigen Baustein-Schlüssel darunter). Und wo sie zog, versprach sie
 * einer Adresse eine Bedeutung, die sie nicht hat.
 *
 * Jetzt wirft die Seite bei einem ausdrücklichen „nicht gefunden" 404 — SSR
 * mit echtem Status. Das RENNEN ist an der Wurzel geschlossen: `loadProfiles`
 * schreibt seit Paket 9 in ein eigenes Feld (`denied`), das Profil in
 * `profileDenied` (s. Store-Kopf).
 *
 * WARUM DIE RUHIGE FLÄCHE FÜR `blocked` BLEIBT: sie beantwortet eine ANDERE
 * Frage. „Kein Beta-Zugang" und „fremdes Branding" klingen aus der Datentür
 * absichtlich gleich (sie verrät nicht, ob es die Zeile gibt) — dieser Seite
 * bleibt also nur die 404-Seite. Beim gesperrten Baustein darf der Server den
 * Grund nennen (`data.code`), und dann ist eine Erklärung mit dem Weg zurück
 * die bessere Antwort als eine Fehlerseite.
 *
 * FAIL-SOFT BLEIBT für alles andere: ein Transportfehler wirft nicht. Aus
 * einem 500 einen 404 zu machen wäre eine Lüge über die Ursache.
 */
definePageMeta({ layout: 'brand-workspace' })

const route = useRoute()
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()
/** Die EINE Beschriftungs-Regel — auch für Felder FREMDER Kapitel (§9). */
const fieldLabel = useBrandFieldLabel()

const profileId = computed(() => String(route.params.profileId ?? ''))
const routeStepKey = computed(() => String(route.params.stepKey ?? ''))

/**
 * EIN UNGÜLTIGER BAUSTEIN-SCHLÜSSEL IST EIN 404, KEINE LEERE HÜLLE (Davids
 * 404-Audit 2026-09-03): die Klickdummy-Pfade `/brand/demo/discover` u. a.
 * fielen in diese Route (profileId='demo', stepKey='discover') und
 * renderten eine „Namenloses Branding"-Werkstatt ohne Inhalt — ein
 * Soft-404, der wie ein Produktfehler aussieht. Ob das PROFIL existiert,
 * prüft weiter der Server (die Hülle darunter); der SCHLÜSSEL steht im
 * Katalog und braucht keinen Request — und weil er VOR jedem Abruf geprüft
 * wird, spricht ein 404 der Baustein-Route immer über das Profil.
 */
if (!(BRAND_STEP_KEYS as readonly string[]).includes(routeStepKey.value)) {
  throw createError({ status: 404, statusText: 'Unknown brand step' })
}

const autosave = useBrandAutosave(profileId)
// ERST SPEICHERN, DANN GENERIEREN: der Server baut den Entwurf aus den
// GESPEICHERTEN Quell-Slots. Ohne dieses Ausspülen entwürfe George aus einem
// Stand, den der Mensch eine Sekunde vorher überholt hat.
const generation = useBrandGeneration(profileId, { beforeGenerate: () => autosave.flush() })
// Dieselbe Regel für den Gesprächszug: der Server rechnet aus dem GESPEICHERTEN
// Stand, welche Frage als nächste dran ist.
const conversation = useBrandConversation(profileId, { beforeSend: () => autosave.flush() })

const shell = await useAsyncData<{ found: boolean } | null>(
  () => `brand-workspace-${profileId.value}-${routeStepKey.value}`,
  async () => {
    const ok = await store.loadProfile(profileId.value, request)
    if (ok) await store.loadStep(profileId.value, routeStepKey.value, request)
    // Der Marken-Wähler in der Sidebar braucht die Liste des Kontos. FAIL-SOFT:
    // ohne sie zeigt er nur die aktive Marke und die zwei Ausgänge — eine
    // Werkstatt, die an einer Auswahlliste scheitert, wäre die schlechtere
    // Antwort auf einen Listen-Fehler.
    await store.loadProfiles(request).catch(() => {})
    // `profileDenied` und nicht `ok`: auch ein 404 des BAUSTEIN-Abrufs spricht
    // über das Profil (den Schlüssel hat der Katalog oben schon geprüft). Ein
    // 403 setzt `blocked` und bleibt hier bewusst unberührt.
    return { found: ok && !store.profileDenied }
  },
  { watch: [profileId, routeStepKey], default: () => null },
)

if (shell.data.value && !shell.data.value.found) {
  throw createError({ status: 404, statusText: 'Unknown brand profile' })
}

const stepKey = computed<BrandStepKey | null>(() =>
  (BRAND_STEP_KEYS as readonly string[]).includes(routeStepKey.value)
    ? (routeStepKey.value as BrandStepKey)
    : null)

const pathKind = computed<BrandPathKind>(() => store.profile?.pathKind ?? 'new')

/**
 * DIE WEICHE W3 (Solo/Team) — sie tauscht die Fragefassung. Angefangen hat das
 * bei `c.discovery3` mit einer ANDEREN Frage (Paket 2b, Davids Entscheidung
 * 2026-09-04: D7 statt D3, sobald jemand ein Team hat); seit dem 2026-09-09
 * tauscht sie zusätzlich an 48 Fragen die ANREDE — die abgenommenen Texte
 * sagen „ihr/euch/euer", und für „Nur ich" ist das falsch. `'solo'` ist der
 * Rückfall, solange das Profil nicht geladen ist: die persönliche Fassung
 * passt immer, die Team-Fassung nur mit Team.
 */
const teamKind = computed<BrandTeamKind>(() => store.profile?.team ?? 'solo')

const slots = computed<readonly BrandSlot[]>(() => (stepKey.value ? slotsForStep(stepKey.value) : []))

/**
 * Die Beschriftung eines Slots: KURZ-LABEL vor Frage (Nacht 2026-09-03,
 * Davids „Log-Karten wie ein Dokument"). `brand.labels.<id>` trägt für die
 * Frage-Slots dokumentartige Substantive („Gründungsimpuls" statt „Warum
 * hast du angefangen — …?"); wo die Frage schon kurz ist (Ableitungen wie
 * „Elevator-Pitch"), gibt es bewusst KEINEN Label-Schlüssel und der
 * Rückfall greift. Gefragt wird weiter pfad- und team-abhängig — das Label
 * nicht. WELCHEN Fragetext der Rückfall nimmt, rechnet `slotLabelKeyFor`
 * (shared) für alle drei Orte zugleich: Bühne, `useBrandFieldLabel` und den
 * Prompt-Aufbau des Servers.
 */
function slotLabel(slot: BrandSlot): string {
  const labelKey = `brand.labels.${slot.id}`
  if (te(labelKey)) return t(labelKey)
  return t(slotLabelKeyFor(slot, pathKind.value, teamKind.value))
}

/**
 * Die BESCHREIBUNGS-SUBLINE einer Log-Karte (Runde 25, David: „dieselben
 * Texte wie der Erklär-Layer"). Sie kommt aus dem vorhandenen Lehrblock des
 * Slots; wo es keinen gibt, bleibt die Zeile weg — ein erfundener Halbsatz
 * wäre schlimmer als eine Karte ohne Untertitel.
 */
function slotNote(slot: BrandSlot): string {
  return slot.helpKey ? t(slot.helpKey) : ''
}

// ── Eine Stimme: George, das Team im Rücken (Davids Entscheidung 2026-09-02) ─

/**
 * WER SPRICHT, IST KEINE FRAGE MEHR: George, in jedem Baustein
 * (`BRAND_VOICE`). Bis zum 2026-09-02 rechnete hier `advisorForStep()`, und im
 * Baustein `pvm` stand deshalb ein „V" im Avatar — vier Sprecherwechsel in
 * einer Sitzung heissen viermal Beziehung neu aufbauen (DECISION-LOG).
 * Der Avatar öffnet den Steckbrief; eine eigene Berater-Zeile gibt es seit dem
 * Werkstatt-Umbau nicht mehr.
 */
/**
 * ZWEI STIMMEN, EINE STELLE (Brand Design D2a). George führt durch die
 * Foundation, Frida durch Schicht 2 — `BRAND_DESIGN_VOICE`, so wie im
 * Prototyp abgenommen (§2.1: „George bleibt Gastgeber").
 *
 * DIE ENTSCHEIDUNG FÄLLT GENAU HIER und nirgends sonst: Kopfzeile, Avatar,
 * Steckbrief, das Phasen-Intro und der Satz „mir fehlt noch …" lesen alle
 * dieses eine `voice`. Ein zweiter Vergleich `isBrandDesignStep(...)` im
 * Markup wäre die erste Stelle, an der Frida spricht und George daneben im
 * Avatar steht.
 *
 * DIE EINE-STIMME-ENTSCHEIDUNG (2026-09-02) BLEIBT: sie galt gegen vier
 * Sprecherwechsel INNERHALB einer Sitzung. Brand Design ist ein eigenes,
 * extra freigeschaltetes Produkt — der Wechsel passiert an einer Grenze, die
 * der Mensch selbst überschreitet, nicht mitten im Gespräch.
 *
 * Die GENERATOR-Prompts der Design-Sessions kennen Frida noch nicht; das ist
 * D2b/D2c. Hier geht es ausschliesslich um die Anzeige.
 */
const voice = computed(() => (
  stepKey.value && isBrandDesignStep(stepKey.value) ? BRAND_DESIGN_VOICE : BRAND_VOICE
))
const voiceRole = computed(() => t(`brand.advisors.${voice.value.key}.role`))
const advisorInfoOpen = ref(false)

/** Das Team im Steckbrief rechnet `BwAdvisorInfoModal` selbst. */

/**
 * DAS PHASEN-INTRO ist Anzeige, kein Verlauf: es erscheint, wenn das Kapitel
 * die Technik einer ANDEREN Kollegin bzw. eines anderen Kollegen trägt als das
 * zuvor besuchte, und wird NICHT gespeichert (wer zwischen zwei Bausteinen
 * hin- und herspringt, bekäme sonst bei jedem Sprung eine Zeile in seinen
 * Verlauf geschrieben).
 *
 * Aus der Übergabe („Ab hier übernimmt Vera") ist eine ERWÄHNUNG geworden
 * („Ich habe das mit Vera durchgesehen — sie liest hier streng mit"): George
 * gibt nichts ab, er sagt nur, mit wessen Blick er dieses Kapitel angeht.
 */
const phaseIntro = ref<string | null>(null)
const introKey = computed(() => colleagueForStep(stepKey.value ?? 'context')?.key ?? voice.value.key)
let previousIntroKey: BrandAdvisorKey | null = null
watch(introKey, (next) => {
  phaseIntro.value = previousIntroKey && previousIntroKey !== next
    // Das Phasen-Intro ist ein GESPROCHENER Satz — er folgt der Solo-Weiche
    // wie Georges Kapitel-Züge (BW1-Inhaltsrunde 2026-09-09).
    ? t(teamTextKeyFor(`brand.advisors.${next}.intro`, teamKind.value, key => te(key)))
    : null
  previousIntroKey = next
}, { immediate: true })

// ── George: die nächste offene Frage ──────────────────────────────────────

/**
 * Ein Baustein-Wechsel beginnt ein neues Gespräch (§3e) — die Züge räumt der
 * Store beim Laden weg, was der letzte Zug GETAN hat, muss hier fallen. Die
 * Bedien-Zustände der Bühne räumt der zweite Beobachter weiter unten (sie
 * werden erst dort angelegt).
 */
watch(routeStepKey, () => { conversation.reset() })

/**
 * EINE ANDERE SESSION IST EIN ANDERES GESPRÄCH (§6): `spoke`/`coveredSlotId`
 * sagen, ob die Katalog-Frage schon gestellt wurde — beide gelten für die
 * Session, in der sie entstanden sind. Ohne dieses Zurücksetzen unterdrückte
 * ein Zug aus Session A die Frage in Session B.
 *
 * Der Beobachter steht hier bewusst NACH `activeSessionKey` (weiter unten
 * deklariert wäre er zu spät) und arbeitet mit einem Getter, weil die Quelle
 * erst dort entsteht — dieselbe TDZ-Vorsicht wie beim Scroll-Beobachter.
 */
watch(() => store.activeSessionKey, () => { conversation.reset() })

/**
 * DER LOKALE „WEISS ICH NICHT"-ÜBERSPRINGER IST WEG (Runde 24, David): „das
 * kann man tippen, es ist derselbe Antwort-Weg" — Georges Ehrlichkeits-Umgang
 * übernimmt. Damit rechnet der Browser jetzt GENAU wie der Server: gefüllt ist,
 * was einen Wert hat. Vorher war der lokale Übersprung eine sechste Tatsache,
 * die nur hier existierte.
 */
const slotFacts = computed<Record<string, BrandSlotStateFacts>>(() => {
  const facts: Record<string, BrandSlotStateFacts> = {}
  for (const slot of slots.value) {
    facts[slot.id] = {
      hasValue: store.slotValue(slot.id).length > 0,
      confirmed: store.slotConfirmed(slot.id),
    }
  }
  return facts
})

/**
 * DERSELBE STAND, ABER NUR DAS, WAS DER SERVER BESTÄTIGT HAT (Kailua-Befund 3,
 * 2026-09-08).
 *
 * ── ZWEI FRAGEN, ZWEI RECHNUNGEN ─────────────────────────────────────────
 * `slotFacts` oben ist OPTIMISTISCH, und das ist dort richtig: „welche Frage
 * ist als nächstes dran" darf niemanden ein zweites Mal nach etwas fragen, das
 * er gerade getippt hat — die Eingabe ist ja da, sie ist nur noch nicht
 * draussen.
 *
 * Der FORTSCHRITT ist eine andere Frage. „7 von 10 bestätigt" ist eine Aussage
 * über das, was gespeichert ist, und nur darüber: im Kailua-Lauf standen zehn
 * Bestätigungen auf dem Schirm, von denen der Server eine hatte — jede weitere
 * war an einem 409 hängen geblieben, den niemand sah. Ein Zähler, der die
 * ABSICHT zählt, kann diesen Unterschied nie zeigen; er ist genau dann falsch,
 * wenn es darauf ankommt.
 *
 * Gerechnet wird deshalb über `store.serverSlots` — dieselbe Quelle, aus der
 * auch die Leiste zählt (`store.sessions`, vom Server geliefert). Damit sagen
 * Leiste und Log dasselbe, und beide sagen die Wahrheit.
 */
const serverSlotFacts = computed<Record<string, BrandSlotStateFacts>>(() => {
  const facts: Record<string, BrandSlotStateFacts> = {}
  for (const slot of slots.value) {
    facts[slot.id] = {
      hasValue: brandSlotDisplayValue(store.serverSlots[slot.id]).length > 0,
      confirmed: brandSlotIsConfirmed(store.serverSlots[slot.id]),
    }
  }
  return facts
})

/**
 * WIE VIELE BESTÄTIGUNGEN NOCH UNTERWEGS SIND (Befund 3) — die Zahl, an der
 * die Zeile „wird gespeichert" hängt. Sie kommt aus `pendingSlots`, also aus
 * derselben Rechnung, die der Autosave gleich abschickt.
 */
const confirmsInFlight = computed(() =>
  Object.values(store.pendingSlots).filter(patch => patch.confirmed === true).length)

// ── Die aktive Session (BW2 §11) ──────────────────────────────────────────

/**
 * DIE SESSION STEHT IN DER ADRESSE, NICHT IM ZUSTAND (Plan §11).
 *
 * `?s=<slotId>` auf DEMSELBEN Route-Record: Zurück und Vor im Browser
 * funktionieren, ein Link auf „genau diese Frage" ist teilbar, und der
 * Sticky-Fortschritt bleibt stehen, weil die Komponente gar nicht wechselt.
 * Ein Zustand im Store könnte das alles nicht — er überlebt keinen Reload und
 * hat keine Geschichte.
 */
const sessionQuery = computed(() => {
  const raw = route.query.s
  return typeof raw === 'string' ? raw : ''
})

/**
 * DIE FINALE ABNAHME IST EINE ANSICHT DIESER SEITE (BW2 Paket 3c-ii, §5a) —
 * `?s=acceptance` auf demselben Route-Record.
 *
 * ── WARUM KEINE EIGENE ROUTE ─────────────────────────────────────────────
 * Leiste, Log und Sticky-Fortschritt bleiben genau stehen; der Mensch schlägt
 * sein Kapitel auf, er verlässt seine Werkstatt nicht. Eine zweite Seite
 * müsste dieselbe Leiste ein zweites Mal montieren — und hätte damit eine
 * zweite Stelle, an der sie altert.
 *
 * AUSGETAUSCHT WIRD NUR DIE MITTE: kein George, kein Prompt unten („Kein
 * George auf dieser Seite", §5a). Der Wert `acceptance` kollidiert mit keiner
 * Slot-Id (die tragen alle einen Punkt) und ist deshalb in derselben Query
 * sicher — `resolveActiveSession` kennt ihn und antwortet „keine Session".
 */
const acceptanceView = computed(() => isAcceptanceView(sessionQuery.value))

/** Nur das, was die Wahl der aktiven Session braucht — s. `BrandNavSession`. */
const navSessions = computed<Record<string, BrandNavSession>>(() => {
  const map: Record<string, BrandNavSession> = {}
  for (const [id, view] of Object.entries(store.sessions)) {
    map[id] = { state: view.state, deferred: view.deferred }
  }
  return map
})

/**
 * WELCHE SESSION IST OFFEN: Adresse ⇒ Wegweiser ⇒ erste offene
 * (`resolveActiveSession`, pur und getestet).
 *
 * ── WARUM DER WEGWEISER HIER NICHT MITREIST ──────────────────────────────
 * Die Rangfolge kennt ihn (und 3c-ii braucht ihn für die Abnahme-Seite), die
 * BÜHNE bekommt ihn aber nicht als reaktive Quelle: `conversation.nextStop`
 * fällt beim Session-Wechsel mit `conversation.reset()`, und eine Rechnung,
 * die davon abhängt, spränge dann auf die erste offene Session zurück —
 * sichtbares Flackern für einen Wechsel, der schon stattgefunden hat.
 * Der Wegweiser wirkt deshalb an EINER Stelle: `autoAdvance()` navigiert mit
 * ihm, und danach steht die Antwort in der Adresse (Rang 1). Nur dort hängen
 * auch die Sperren (Strom, offene Speicherung, Konflikt).
 */
const activeSessionKey = computed<string>(() => (stepKey.value
  ? resolveActiveSession({
      stepKey: stepKey.value,
      requested: sessionQuery.value,
      sessions: navSessions.value,
    }) ?? ''
  : ''))

const activeSlot = computed<BrandSlot | null>(() =>
  (activeSessionKey.value ? slots.value.find(slot => slot.id === activeSessionKey.value) ?? null : null))

/** Der Server-Stand der aktiven Session (Zustand, vertagt, Umfang, `affects`). */
const activeSession = computed(() =>
  (activeSessionKey.value ? store.sessions[activeSessionKey.value] ?? null : null))

/** Der Store hält sie, damit Bühne, Leiste und Verlauf dieselbe Antwort lesen. */
watch(activeSessionKey, key => store.setActiveSession(key), { immediate: true })

const nextQuestion = computed(() =>
  (stepKey.value
    ? resolveNextQuestion(stepKey.value, slotFacts.value, {
        pathKind: pathKind.value,
        team: teamKind.value,
      })
    : null))

/**
 * ── DAS BEREITSCHAFTS-GATE, SCHON VOR DEM KLICK ──────────────────────────
 * Dieselbe pure Regel wie in der Route (`slotReadiness`), aus denselben
 * Quellen. Die Route ist die Durchsetzung, das hier ist die Ehrlichkeit:
 * statt eines Knopfes, der gleich ein 409 kassiert, steht da ein Satz, WAS
 * fehlt. `coveredSteps` ist bewusst nur der GELADENE Baustein — Quell-Slots
 * anderer Bausteine kennt der Browser nicht, und die Regel lässt im Zweifel
 * durch (der Server prüft mit allen neun Zeilen).
 *
 * SIE STEHT HIER OBEN, weil `stageClaim` sie braucht und `nextSlot` wiederum
 * `stageClaim` — und `nextSlot` wird über `turns` vom Scroll-Watcher schon
 * beim ANLEGEN ausgewertet (s. den TDZ-Hinweis an `completion`). Weiter unten
 * bei den Karten stehend wäre sie genau der Prod-500 vom 2026-09-03.
 */
const slotValues = computed<Record<string, string>>(() => {
  const values: Record<string, string> = {}
  for (const id of new Set([...Object.keys(store.serverSlots), ...Object.keys(store.localEdits)])) {
    values[id] = store.slotValue(id)
  }
  return values
})

function readinessOf(slot: BrandSlot): BrandSlotReadiness {
  return slotReadiness(slot.id, {
    startCard: store.profile?.startCard ?? { websiteUrl: '', industry: '', about: '', audience: '' },
    hasSiteAnalysis: Boolean(store.profile?.siteAnalysis.analyzedAt),
    records: slotValues.value,
    coveredSteps: store.stepKey ? [store.stepKey] : [],
  })
}

/**
 * DER ABSCHLUSS EINER SESSION (Davids Entscheidung 2026-09-09, DECISION-LOG
 * Punkt 10) — zwei Zeilen Zustand, aus denen der Weiter-Knopf entsteht.
 *
 * ── WARUM DAS HIER OBEN STEHT ────────────────────────────────────────────
 * `nextSlot` liest `closedSession`, und `nextSlot` wird über `turns` vom
 * Scroll-Watcher schon beim ANLEGEN ausgewertet (s. der TDZ-Hinweis an
 * `completion`). Weiter unten deklariert wäre das exakt der Prod-500 vom
 * 2026-09-03.
 *
 * `closingFrom` ist die Session, deren Bestätigung den Abschluss ausgelöst hat;
 * `closingNext` der Wegweiser, den der Server dazu geliefert hat. Beide fallen
 * beim Session-Wechsel — ein Knopf „Weiter zu …" unter einem fremden Gespräch
 * wäre ein Angebot ohne Anlass.
 */
const closingFrom = ref('')
const closingNext = ref<BrandNextSessionRef | null>(null)

/**
 * WELCHE Karte gerade im Feld-Modus steht — höchstens EINE, in der Bühne wie
 * im Log. „Korrigieren" ist ein Umschalter, kein Dauerzustand: eine Spalte
 * voller offener Textfelder wäre wieder das Formular, das dieser Umbau ersetzt.
 *
 * ── SIE IST SEIT BEFUND F AUCH DIE KORREKTUR-ABSICHT ─────────────────────
 * Ein bestätigter Slot ist zu (`brandSlotControls`: `editable: false`). Damit
 * „Korrigieren" überhaupt ein Feld öffnen kann, ohne die Bestätigung schon zu
 * NEHMEN, zählt diese eine Zeile als „hier wird gerade korrigiert" — Karte und
 * Bühne rechnen ihre Bedienelemente dann wie bei einem offenen Feld. Gesendet
 * wird deswegen nichts; das tut erst die erste echte Eingabe (`setSlotValue`
 * im Store). „Korrigieren beenden" setzt sie zurück, und der Haken steht wieder.
 *
 * SIE STEHT HIER OBEN, weil `activeStageFacts` sie liest und `turns` über
 * `stageClaim` schon beim ANLEGEN ausgewertet wird (s. der TDZ-Hinweis an
 * `completion`). Weiter unten deklariert wäre das exakt der Prod-500 vom
 * 2026-09-03.
 */
const editingSlotId = ref<string | null>(null)

/**
 * DER STAND BEIM ÖFFNEN DES EDITORS (Befund 3, 2026-09-10) — die Fassung, auf
 * die „Verwerfen" zurückstellt.
 *
 * ── WARUM ER HIER GEMERKT WIRD UND NICHT AUS DEM SERVER GELESEN ──────────
 * Weil der Server ihn beim Klick auf „Verwerfen" längst nicht mehr hat: der
 * Autosave schreibt jede Eingabe weg, spätestens beim `blur` auf dem Weg zum
 * Knopf. Wer ihn dort erst holte, stellte auf den GEÄNDERTEN Text zurück —
 * also auf nichts.
 *
 * Text UND Bestätigung, weil beide fallen: die erste Eingabe nimmt die
 * Bestätigung mit (`brandEditReleasesConfirm`), und ein Verwerfen, das nur den
 * Text zurückholt, liesse ein bestätigtes Feld unbestätigt zurück.
 */
const editBaseline = ref<{ slotId: string, value: string, confirmed: boolean } | null>(null)

watch(activeSessionKey, () => { closingFrom.value = ''; closingNext.value = null })

/**
 * IST DIE OFFENE SESSION GERADE ABGESCHLOSSEN WORDEN?
 *
 * Daran hängt die zweite Hälfte von Davids Entscheidung: „keine nächste
 * Katalogfrage als graue Zeile in der alten Session". Ohne diese Zeile rechnete
 * `nextSlot` nach der Bestätigung weiter die nächste offene FRAGE des Kapitels
 * — und die Bühne hängte sie als stillen Zug unter den Abschluss, in einer
 * Session, die bereits zu ist.
 */
const closedSession = computed(() =>
  closingFrom.value !== '' && closingFrom.value === activeSessionKey.value)

/**
 * DIE AKTIVE SESSION BEANSPRUCHT IHRE EIGENE BÜHNE (Kailua-Befund 5, Weg B).
 *
 * Die Regel steht pur nebenan (`brandStageClaim`) samt Begründung; hier werden
 * nur die fünf Tatsachen zusammengetragen. `canGenerate` ist WÖRTLICH
 * `showGenerate` aus `brandSlotControls` (generierbar UND bereit) — dieselbe
 * Rechnung wie auf der Karte, damit Modul und Knopf nie auseinanderlaufen.
 */
const activeStageFacts = computed<BrandStageActiveSession | null>(() => {
  const active = activeSlot.value
  if (!active) return null
  const generatable = active.generator !== 'none'
  return {
    id: active.id,
    type: active.type,
    confirmable: slotIsConfirmable(active),
    generatable,
    canGenerate: generatable && readinessOf(active).ready,
    hasValue: store.slotValue(active.id).length > 0,
    // WÄHREND DER KORREKTUR ZÄHLT DAS FELD ALS OFFEN (Befund F, s.
    // `editingSlotId`): sonst zeigte die Bühne beim Klick auf „Korrigieren"
    // weiter die Karte eines fremden Feldes, und der Editor ginge nur im Log auf.
    confirmed: store.slotConfirmed(active.id) && editingSlotId.value !== active.id,
  }
})

const stageClaim = computed<BrandStageClaim | null>(() => brandStageClaim(activeStageFacts.value))

/**
 * WOHIN GEHÖRT EINE GETIPPTE ANTWORT (Testlauf-Befund A) — die Regel steht pur
 * nebenan (`brandAnswerTarget`), hier steht nur, welcher Slot dazu gehört.
 *
 * Sie ersetzt an JEDEM Sende-Pfad das frühere `nextSlot`: die aktive Session
 * und „die nächste offene Frage des Kapitels" waren dasselbe, solange nach
 * jeder Antwort automatisch gesprungen wurde — seit Davids Entscheidung
 * 2026-09-09 sind sie es nicht mehr, und der Unterschied schrieb drei fremde
 * Felder voll.
 */
const answerTarget = computed(() => brandAnswerTarget(activeStageFacts.value))

const answerSlot = computed<BrandSlot | null>(() =>
  (answerTarget.value ? activeSlot.value : null))

/**
 * MUSS VOR `turns` DEKLARIERT SEIN (Prod-500 am 2026-09-03): `turns` liest
 * `completion`, und der Scroll-Watcher (`watch(() => turns.value.length)`)
 * wertet seine Quelle beim ANLEGEN aus — im Browser also mitten im Setup.
 * Stand `completion` weiter unten, warf genau das die TDZ-ReferenceError
 * („Cannot access 'K' before initialization") und die Werkstatt zeigte die
 * 500-Seite. SSR blieb grün, weil der Server keine Watcher anlegt — ein
 * Fehler, den nur der Browser zeigt.
 */
const completion = computed(() =>
  (stepKey.value ? brandStepCompletion(stepKey.value, serverSlotFacts.value) : null))

/**
 * DIE FRAGE AUF DER BÜHNE — und seit BW2 3c-i geht die AKTIVE SESSION VOR.
 *
 * Vorher zeigte die Bühne immer „das erste offene Feld" der Registry. Wer in
 * der Leiste eine andere offene Session anklickte, landete trotzdem wieder bei
 * der ersten — die Unterpunkte wären Zierde gewesen. Jetzt fragt die Bühne
 * das, was der Mensch gewählt hat, SOFERN es überhaupt eine Frage ist
 * (`question`/`choice` — Ableitungen und Bühnen-Entwürfe fragt George nie) und
 * noch nichts drinsteht.
 *
 * Ist die aktive Session keine Frage oder schon beantwortet, gilt unverändert
 * die Grundfassung: `resolveNextQuestion` in Registry-Reihenfolge. Der SERVER
 * rechnet weiter seine eigene Reihenfolge und verwirft einen Wortlaut, der
 * nicht dazu passt (`nextQuestionKnown: false`) — das ist die bestehende,
 * gewollte Arbeitsteilung, nicht ein Nebeneffekt dieser Änderung.
 *
 * ── UND SEIT WEG B: EINE ENTWURFS-SESSION HAT HIER GAR KEINE FRAGE ────────
 * Beansprucht die aktive Session die Bühne mit ihrem Entwurfs- oder
 * Bestätigungs-Modul, ist `null` die richtige Antwort — NICHT die nächste
 * Katalog-Frage des Kapitels. Genau die stand vorher hier: Session `a.pitch`,
 * Bühnen-Frage `a.origin`, und dieselbe fremde Id reiste als `nextSlotId` in
 * den Gesprächs-Zug (Kailua-Befund 5, Nebenbefund).
 */
const nextSlot = computed<BrandSlot | null>(() => {
  // ── UND SEIT DEM SESSION-ABSCHLUSS: EINE GESCHLOSSENE SESSION FRAGT NICHTS
  // MEHR (Davids Entscheidung 2026-09-09). Der Abschlusszug steht, der
  // Weiter-Knopf darunter — die nächste Katalog-Frage gehört der NÄCHSTEN
  // Session, nicht als graue Zeile unter diese hier.
  if (closedSession.value) return null
  const claim = stageClaim.value
  if (claim) {
    return claim.module === 'answer' || claim.module === 'options' ? activeSlot.value : null
  }
  return slots.value.find(slot => slot.id === nextQuestion.value?.slotId) ?? null
})

/**
 * DIE ZÜGE DIESES BESUCHS, IN IHRER REIHENFOLGE — Berater UND Mensch (P3.2).
 * Eine Liste im Store, damit sie beim Baustein-Wechsel mit allem anderen fällt.
 */
interface StageTurn {
  id: string
  role: 'george' | 'user'
  text: string
  help?: string
  pending?: boolean
  /**
   * ANTWORT-MÖGLICHKEITEN zu der Frage, mit der dieser Zug endet (Davids
   * Anforderung 2026-09-04) — zwei oder drei Chips unter der Blase. Sie kommen
   * aus dem Abschluss-Frame; im Text stehen sie NICHT (der Marker-Putzer nimmt
   * die `OPTION:`-Zeilen heraus).
   */
  options?: readonly string[]
  /**
   * BIETET DIESER ZUG DIE BESTÄTIGUNG AN? (Davids Entscheidung 2026-09-09.)
   * Zwei Knöpfe unter der Blase — „Passt so, bestätigen" löst `confirmSlot()`
   * aus, „Ich ergänze noch etwas" gibt das Wort zurück ans Eingabefeld. Sie
   * kommen aus dem Abschluss-Frame, nie aus dem Text.
   */
  confirm?: boolean
  /** Die Antwort ist abgeschnitten (P17, BE-007) — ein ruhiger Hinweis darunter. */
  truncated?: true
  /** Nur bei einem Entwurfs-Zug: das Feld für „Noch einmal erzeugen". */
  retrySlotId?: string
}

const streamed = computed<StageTurn[]>(() => store.streamMessages.map(message => ({
  id: message.id,
  role: message.role,
  text: message.text,
  pending: message.pending,
  options: message.options,
  confirm: message.confirm,
  truncated: message.truncated,
  retrySlotId: message.retrySlotId,
})))

/**
 * WELCHER ABGESCHNITTENE ZUG „NOCH EINMAL ERZEUGEN" ZEIGT (P17, BE-007) — nur
 * die LETZTE Beraterblase des Verlaufs, und nur, solange nichts läuft. Ein
 * älterer Entwurf neu zu erzeugen, nachdem schon weitergeredet wurde, wäre ein
 * Sprung zurück; der Hinweis bleibt an jeder abgeschnittenen Blase stehen.
 */
const truncatedRetryTurnId = computed<string | null>(() => {
  if (generation.streaming.value || conversation.pending.value) return null
  const last = store.streamMessages.at(-1)
  return last && last.role === 'george' && last.truncated && last.retrySlotId && !last.pending ? last.id : null
})

/**
 * DAS KENNZEICHEN AM FELD (KI1 d): der Wert ist ein abgeschnittener Entwurf.
 * Die Regel rechnet der Store (`truncatedDraftSlots`, pure Regel in
 * `shared/brandTruncatedField.ts`); hier wird nur gefragt. „Noch einmal
 * erzeugen" steht am Feld nur, wo es die Blase auch anbietet — dieselbe
 * Bedingung (`truncatedRetryTurnId`), kein zweiter Erzeugen-Weg.
 */
function fieldIsTruncated(slotId: string): boolean {
  return store.truncatedDraftSlots.has(slotId)
}

const truncatedRetryFieldId = computed<string | null>(() => {
  const id = truncatedRetryTurnId.value
  if (!id) return null
  return store.streamMessages.find(message => message.id === id)?.retrySlotId ?? null
})

/**
 * Der vorhandene Erzeugen-Weg des Feldes — dasselbe, was „Nochmal, mit
 * Hinweis" auslöst, nur ohne Hinweis. Ein neuer Idempotenz-Schlüssel je Klick
 * (`useBrandGeneration`), also kein Wiederverwenden des abgeschnittenen Entwurfs.
 */
async function regenerateTruncated(slotId: string): Promise<void> {
  turnEnded.value = false
  await generation.generate(slotId)
}

/**
 * DIE KATALOG-FRAGE STEHT NUR DA, WENN SIE NICHT SCHON GESTELLT WURDE (P3.2).
 * Weggelassen wird sie, solange der Berater SCHREIBT und wenn sein fertiger
 * Zug genau diese Frage getragen hat (`coveredSlotId` aus dem Abschluss-Frame
 * — der Server sagt es, geraten wird es nicht). Der Lehrblock hängt an der
 * FRAGE, nicht an ihrer Formulierung, und wandert dann unter den Zug.
 */
const turns = computed<StageTurn[]>(() => {
  const spoken: StageTurn[] = [...streamed.value]
  const busy = conversation.pending.value

  if (!nextSlot.value) {
    // Der statische Abschluss-Satz gehört NUR auf die frisch geladene Bühne
    // (leerer Verlauf). Sobald LIVE-Züge da sind — auch die RÜCKFRAGE einer
    // Generierung (outcome: question, läuft NICHT über `conversation`) —
    // stünde er als Widerspruch direkt unter einer offenen Frage: „Was ist
    // eure Überzeugung?" / „Meine Fragen sind durch" (Davids
    // Durchspiel-Audit 2026-09-03, Pukalani Studio pvm).
    if (busy || conversation.spoke.value || spoken.length > 0) return spoken
    /**
     * DIE BÜHNE SITZT AUF EINER ENTWURFS-SESSION (Kailua-Befund 5, Weg B) —
     * dann gehört der Satz IHR, und zwar allein.
     *
     * „Meine Fragen sind durch" wäre hier eine glatte Falschaussage: das
     * Kapitel kann zehn offene Fragen haben, sie sind nur gerade nicht dran
     * (`nextSlot` ist `null`, WEIL die aktive Session die Bühne beansprucht).
     * Genannt wird das Feld der SESSION, nicht das erste offene Pflicht-Feld
     * des Kapitels — das wäre wieder ein fremdes.
     */
    const claim = stageClaim.value
    if (claim && (claim.module === 'draft' || claim.module === 'confirm')) {
      const slot = slots.value.find(entry => entry.id === claim.slotId)
      if (slot) {
        const hasValue = store.slotValue(slot.id).trim().length > 0
        return [...spoken, {
          id: 'done',
          role: 'george',
          text: t(
            `brand.workspace.george.${hasValue ? 'nextConfirm' : 'nextDraft'}`,
            { field: slotLabel(slot), voice: voice.value.name },
          ),
        }]
      }
    }
    // „Keine Frage mehr" ist NICHT „nichts mehr offen" (brandJourney.ts erklärt
    // die zwei Fragen): Bühnen-Entwürfe wie `b.mission` stellt George nie als
    // Frage. Solange solche Pflicht-Felder unbestätigt sind, behauptete der
    // alte Satz „nichts mehr offen" direkt über „Noch offen: 1 von 10 Feldern"
    // (live erwischt 2026-09-03) — der Wortlaut folgt jetzt dem Kapitel-Stand.
    if (completion.value?.slotsReady) {
      return [...spoken, { id: 'done', role: 'george', text: t('brand.workspace.george.nothingOpen') }]
    }
    // DER SATZ ZEIGT AUF DEN NÄCHSTEN SCHRITT (Davids Live-Fund 2026-09-04,
    // Krume & Gold, Archetyp): „die offenen Felder formen wir im Gespräch"
    // stand allein da — kein Einstieg, keine Frage, und der Entwurfs-Knopf
    // darunter blieb unerklärt. Jetzt benennt der Zug das erste offene
    // Pflicht-Feld samt Aktion: Entwurfs-Knopf (leer, George entwirft) oder
    // Bestätigen (Text steht schon). GERECHNET wird nur aus Quellen, die VOR
    // dem Scroll-Watcher (Zeile ~357) deklariert sind — `pendingCard` läge
    // dahinter, und sein Zugriff hier wäre exakt der TDZ-500 vom 2026-09-03.
    const firstOpenId = completion.value?.missingRequired[0]
    const firstOpen = firstOpenId ? slots.value.find(slot => slot.id === firstOpenId) ?? null : null
    const hasText = firstOpen ? store.slotValue(firstOpen.id).trim().length > 0 : false
    const actionKey = firstOpen && (hasText || firstOpen.generator !== 'none')
      ? (hasText ? 'nextConfirm' : 'nextDraft')
      : null
    const intro = t('brand.workspace.george.questionsDone')
    const text = actionKey && firstOpen
      ? `${intro} ${t(`brand.workspace.george.${actionKey}`, { field: slotLabel(firstOpen), voice: voice.value.name })}`
      : intro
    return [...spoken, { id: 'done', role: 'george', text }]
  }

  const help = nextSlot.value.helpKey ? t(nextSlot.value.helpKey) : undefined
  if (busy) return spoken

  const question: StageTurn = {
    id: nextSlot.value.id,
    role: 'george',
    text: t(questionKeyFor(nextSlot.value, pathKind.value, teamKind.value)),
    help,
  }

  /**
   * DIE STATISCHE ZEILE IST EIN ERSATZ, KEINE ERGÄNZUNG (Befund 2, 2026-09-10)
   * — die Regel steht pur nebenan (`brandStaticQuestionVisible`) samt
   * Begründung; hier werden nur die drei Tatsachen zusammengetragen.
   */
  const showQuestion = brandStaticQuestionVisible({
    collecting: activeSlot.value?.kind === 'collect',
    ownSession: nextSlot.value.id === activeSessionKey.value,
    advisorSpoke: spoken.some(turn => turn.role === 'george'),
  })

  if (conversation.coveredSlotId.value === nextSlot.value.id) {
    const last = spoken.at(-1)
    // NUR EINEN GEORGE-ZUG ERSETZEN (Audit-Befund A5). `coveredSlotId` sagt,
    // dass die Frage gestellt WURDE — nicht, dass sein Zug noch dasteht: ein
    // leer gebliebener Strom wird in `endGeorgeMessage` weggeräumt, und dann
    // ist der letzte Zug die ANTWORT DES MENSCHEN. Der Lehrblock landete in
    // dessen Blase, das Modul rendert dort gar nicht (es hängt an
    // `role === 'george'`), und bei einer AUSWAHL war zugleich das Prompt
    // gesperrt — die Bühne war unbedienbar. Steht sein Zug nicht mehr da,
    // steht die Frage eben wieder da.
    return last?.role === 'george' ? [...spoken.slice(0, -1), { ...last, help }] : [...spoken, question]
  }

  return showQuestion ? [...spoken, question] : spoken
})

/**
 * WELCHER TEIL DER SAMMEL-SESSION GERADE DRAN IST — als i18n-Schlüssel seiner
 * Frage (Befund 9, 2026-09-10).
 *
 * Gerechnet aus dem SERVER-Stand (`sessions[…].collected`) mit derselben puren
 * Regel, die auch die Route benutzt (`nextCollectPart`). Eine eigene Zählung im
 * Browser wäre eine zweite Wahrheit darüber, welche Frage gerade offen ist —
 * und die beiden liefen beim ersten abgerissenen Zug auseinander.
 *
 * `''` heisst „keine Sammel-Session, oder alle Teile beantwortet". Dann bleibt
 * es beim Feld-Etikett, so wie vor dieser Runde.
 */
const collectPartKey = computed<string>(() => {
  const slot = activeSlot.value
  if (!slot || slot.kind !== 'collect') return ''
  const part = nextCollectPart(slot, store.sessions[slot.id]?.collected ?? {})
  return part ? partKeyFor(slot, part, teamKind.value) : ''
})

/* Runde 55 (David) für die BÜHNE: der Verlauf ankert unten und wächst nach
 * oben. Gescrollt wird auf den Anker am Ende — die Bühne ist ihr eigener
 * Scroller (.bw-stage). */
const tail = ref<HTMLElement | null>(null)
watch(() => turns.value.length, async () => {
  await nextTick()
  tail.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
})

/**
 * WELCHER ZUG SEINE ANTWORT-KNÖPFE ZEIGT (Davids Anforderung 2026-09-04) —
 * höchstens EINER, und nur bis der Mensch geantwortet hat.
 *
 * ── WARUM NICHT EINFACH „DER LETZTE ZUG" ──────────────────────────────────
 * Zwischen Georges Zug und dem Ende der Liste kann die KATALOG-FRAGE stehen
 * (`turns` hängt sie an, sobald der Zug sie nicht selbst gestellt hat) — an
 * „letzter Zug" geknüpft wären die Chips dann still verschwunden, obwohl die
 * Wahl noch offen ist. Gesucht wird deshalb rückwärts, und die Suche BRICHT AB,
 * sobald eine eigene Antwort kommt: ein Klick legt genau die an, und damit ist
 * die einmalige Wahl getroffen. Läuft gerade ein Zug, gibt es gar keine — ein
 * Knopf, der während des Schreibens klickbar wäre, schickte in eine Sperre.
 */
const optionTurnId = computed<string | null>(() => {
  if (conversation.pending.value) return null
  const list = turns.value
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const turn = list[index]!
    if (turn.role === 'user') return null
    if (turn.options?.length && !turn.pending) return turn.id
  }
  return null
})

/**
 * WELCHER ZUG SEINE BESTÄTIGUNGS-KNÖPFE ZEIGT (Davids Entscheidung
 * 2026-09-09) — höchstens EINER, und nur solange es etwas zu bestätigen gibt.
 *
 * ── DIESELBE RÜCKWÄRTSSUCHE WIE BEI DEN OPTIONEN, AUS DEMSELBEN GRUND ─────
 * Zwischen Georges Zug und dem Ende der Liste kann die Katalog-Frage stehen;
 * an „letzter Zug" geknüpft wären die Knöpfe still verschwunden. Die Suche
 * bricht bei der ersten eigenen Antwort ab: wer weitergeschrieben hat, hat die
 * Wahl beantwortet.
 *
 * ── DREI SPERREN, DIE ALLE DASSELBE SAGEN: ES GIBT NICHTS ZU BESTÄTIGEN ───
 * Ein laufender Zug (der Knopf schickte in eine Sperre), eine bereits
 * bestätigte Session (der Klick liefe in `already_confirmed`) und der eigene
 * Wegklick („Ich ergänze noch etwas"). Der Server prüft dasselbe noch einmal —
 * hier geht es darum, dass kein Knopf dasteht, der garantiert eine Absage
 * kassiert.
 */
const confirmDismissed = ref('')

const confirmTurnId = computed<string | null>(() => {
  if (conversation.pending.value) return null
  const session = activeSessionKey.value
  if (!session || store.slotConfirmed(session)) return null
  const list = turns.value
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const turn = list[index]!
    if (turn.role === 'user') return null
    if (turn.confirm && !turn.pending) return turn.id === confirmDismissed.value ? null : turn.id
  }
  return null
})

/** Das Eingabefeld — „Ich ergänze noch etwas" gibt ihm den Fokus zurück. */
// ── Das Schreibfeld: Eingabe, Beispiel, Ergänzen, Senden ─────────────────
// Herausgeschnitten (WS1 e, Teil) → `useBrandWorkshopComposer`.
const {
  promptBox,
  keepWritingFor,
  keepWriting,
  promptPlaceholder,
  answerOption,
  composerExample,
  exampleOpen,
  promptDraft,
  takeExample,
  promptTab,
  answerFromGeorge,
  promptEnabled,
  submitPrompt,
} = useBrandWorkshopComposer({
  profileId,
  stepKey,
  pathKind,
  teamKind,
  voice,
  activeSessionKey,
  answerSlot,
  answerTarget,
  nextSlot,
  confirmDismissed,
  conversation,
  autosave,
  slotLabel,
  slotDisplayValue,
})

// ── Verlauf, Eröffnungszug und Auto-Weiter (BW2 §5/§6) ───────────────────

/**
 * WELCHE SESSIONS IN DIESEM BESUCH SCHON ERÖFFNET WURDEN — ein reiner
 * Client-Merker (`needsOpeningTurn`). Die Route ist selbst idempotent; der
 * Merker spart nur den Weg dorthin, wenn jemand zwischen zwei Sessions hin-
 * und herklickt.
 */
const openedSessions = ref<Set<string>>(new Set())

watch(routeStepKey, () => { openedSessions.value = new Set() })

/**
 * DER VERLAUF DIESER SESSION (brand-011).
 *
 * Als `useAsyncData`, nicht als Browser-Watcher: so malt schon der SERVER das
 * Gespräch, und die Hydration schiebt es nicht nach. Der Rückgabewert trägt
 * BEIDES — welche Session gemeint war und ob der Berater dort schon gesprochen
 * hat. Über den SSR-Payload ist das die einzige Form, in der die Auskunft im
 * Browser ankommt: eine Ref, die der Server setzt, startet hier wieder bei
 * ihrem Anfangswert.
 */
const sessionHistory = await useAsyncData(
  () => `brand-session-${profileId.value}-${routeStepKey.value}-${activeSessionKey.value}`,
  async () => {
    const key = activeSessionKey.value
    if (!key) return { sessionKey: '', spoke: false }
    const spoke = await store.loadSessionMessages(profileId.value, routeStepKey.value, key, request)
    return { sessionKey: key, spoke }
  },
  { watch: [profileId, routeStepKey, activeSessionKey] },
)

/**
 * AUSFALL STATT STILLE (LZ1, 2026-11-22): Profil, Baustein und Verlauf werfen
 * einen echten Ausfall (kein Status oder 5xx) weiter — `loadProfile` und
 * `loadStep` schon immer, `loadSessionMessages` seit LZ1. Vorher blieb der
 * Fehler ungelesen: eine leere Werkstatt ohne Wort, und beim Verlauf eröffnete
 * George neu. Jetzt steht über dem Gespräch eine ruhige Zeile mit „Noch
 * einmal versuchen"; der Eröffnungszug wartet, weil `data` dann leer ist.
 * Server und Browser lesen denselben `error` aus dem Payload — kein
 * Zweigtausch bei der Hydration.
 */
const workshopLoadFailed = computed(() =>
  isFetchOutage(shell.error.value) || isFetchOutage(sessionHistory.error.value))

async function retryWorkshopLoad(): Promise<void> {
  if (shell.error.value) await shell.refresh()
  if (sessionHistory.error.value) await sessionHistory.refresh()
}

/**
 * ERÖFFNUNGSZUG, SESSION ÖFFNEN, FELD-LINK, DOKUMENT, ABNAHME, AUTO-WEITER,
 * VERTAGEN, BESTÄTIGEN UND DER WEITER-KNOPF rechnet `useBrandWorkshopSession`
 * (WS1 e, Rest). Das `await useAsyncData` des Verlaufs bleibt oben in der
 * Seite (SSR-Nutzlast, Komponenten-Kontext nach dem `await`), ebenso die
 * Refs, die die Bühne schon beim Anlegen liest.
 */
const {
  goToSession,
  goToField,
  goToDocument,
  goToAcceptance,
  activeAllowsDefer,
  deferring,
  setDeferred,
  activeCollected,
  affectsLine,
  confirmSlot,
  continueTarget,
  continueLabel,
  continueToNext,
} = useBrandWorkshopSession({
  profileId,
  routeStepKey,
  stepKey,
  slots,
  sessionQuery,
  activeSessionKey,
  activeSlot,
  activeSession,
  acceptanceView,
  slotFacts,
  closingFrom,
  closingNext,
  editingSlotId,
  editBaseline,
  openedSessions,
  sessionHistory,
  conversation,
  generation,
  autosave,
  slotLabel,
})

// ── Slot-Zustände: eine Rechnung, zwei Leser (Bühne + Log) ────────────────

function onInput(slotId: string, value: string): void {
  store.setSlotValue(slotId, value)
  autosave.schedule()
}

// ── Die Korrektur-Regel (BW2 Paket 6, §9) ────────────────────────────────

/**
 * IMPACT-HINWEIS, KORRIGIEREN, ÜBERNEHMEN, VERWERFEN, der Sprung in ein
 * bestätigtes Feld und die vier Auskünfte bei abgewiesenen Korrekturen —
 * `useBrandSlotRevision` (WS1 f). `editingSlotId` und `editBaseline` bleiben
 * HIER (oben deklariert, s. dort): Bühne, Log und der Session-Wechsel lesen
 * bzw. räumen sie. Die Impact-Namen bleiben die von Paket 6: die Vorlage
 * unten liest sie unverändert.
 */
const {
  impactOpen,
  impactData,
  impactLoading,
  impactChanged,
  acceptImpact,
  cancelImpact,
  reviseSlot,
  openEditor,
  applyEdit,
  discardEdit,
  correctThenGo,
} = useBrandSlotRevision({ profileId, editingSlotId, editBaseline, autosave, fieldLabel })

// ── Die Warteschlange „neu besprechen" (§9) ──────────────────────────────

/**
 * Veraltet-Hinweis, Hinweis je Slot, die Flanke `turnEnded`, das Räumen beim
 * Session-Wechsel, die Karten je Slot, der Erzeugen-Klick und der Satz zu
 * einem abgelehnten KI-Lauf: `useBrandWorkshopQueue` (WS1 f, Rest).
 * `readinessOf` bleibt oben (TDZ, s. dort), `editingSlotId` auch.
 */
const {
  activeStale,
  staleHidden,
  restamping,
  keepSessionValid,
  hints,
  hintOpen,
  turnEnded,
  slotCards,
  cardFor,
  generateSlot,
  generationNotice,
} = useBrandWorkshopQueue({
  profileId,
  routeStepKey,
  stepKey,
  slots,
  activeSessionKey,
  activeSlot,
  activeSession,
  voice,
  readinessOf,
  editingSlotId,
  promptDraft,
  exampleOpen,
  keepWritingFor,
  generation,
  conversation,
  autosave,
})

// ── Das Antwort-Modul im Zug ──────────────────────────────────────────────

/**
 * WELCHE KARTE DIE BÜHNE ZEIGT — die AKTIVE Session, sonst der erste
 * Pflicht-Slot ohne Bestätigung (Registry-Reihenfolge).
 *
 * Dieselbe Begründung wie bei `nextSlot`: wer in der Leiste den Entwurf
 * `b.mission` anklickt, will ihn sehen und nicht den ersten offenen Slot des
 * Kapitels. Bestätigt und nicht bestätigbar fallen durch — eine Karte mit
 * „Übernehmen" für ein Feld, das niemand bestätigen kann (`d.pairs`), wäre ein
 * Knopf ohne Wirkung (Audit A4).
 */
const pendingCard = computed<BrandSlotCard | null>(() => {
  const active = activeSlot.value
  // „In Korrektur" zählt als offen (Befund F) — dieselbe Rechnung wie in
  // `activeStageFacts`, damit Modul und Karte dasselbe Feld meinen.
  if (active && slotIsConfirmable(active) && !activeStageFacts.value?.confirmed) {
    return cardFor(active.id)
  }
  const first = completion.value?.missingRequired[0]
  return first ? cardFor(first) : null
})

/**
 * DREI SESSIONS, DEREN WERT SCHON OBEN STEHT (D2c).
 *
 * `g.dna`, `g.boards` und `g.mix` haben eigene Abschnitte auf derselben Bühne
 * — zehn Zeilen mit Begründung, drei Karten mit Szene, zehn Chip-Reihen. Ihre
 * Bestätigungs-Karte darf denselben Inhalt nicht ein zweites Mal ausrollen,
 * diesmal als rohe `## `-Blöcke: der Mensch läse dann eine Wand Text unter der
 * Ansicht, die er gerade gelesen hat. Sie zeigt stattdessen einen Satz und
 * behält den Knopf — bestätigt wird, was oben steht.
 */
const RENDERED_ABOVE = new Set([
  'g.dna', 'g.boards', 'g.mix',
  // Die sechs Sessions der Farbwelt (D3): Kandidaten, Rampen-Streifen, zwei
  // Szenen, Rollen-Liste und Kontrast-Tabelle stehen im Panel darüber. Ihre
  // ROHEN Werte wären hier elf Hex-Stufen mal zwei und sechs Messungen —
  // eine Wand aus Zahlen unter der Ansicht, die sie gerade erklärt hat.
  'h.base', 'h.ramp', 'h.neutral', 'h.accent', 'h.roles', 'h.contrast',
  // Die drei Sessions der Typografie (D4): Paar-Karten mit echten Schriften,
  // die drei Hierarchie-Karten und die Chip-Reihen stehen im Panel darüber.
  // Der ROHE Wert von `i.rules` wären vier beschriftete Blöcke unter dem
  // Specimen, das sie gerade gezeigt hat.
  'i.pair', 'i.scale', 'i.rules',
  /*
   * SCHICHT 3 (K5): die Sessions, deren Wert schon auf der Werkbank darüber
   * steht. `m.patterns` und `n.guardrails` sind NICHT dabei — sie sind
   * ENTWÜRFE, und der Mensch redigiert sie im Bühnen-Editor auf ihrer Karte;
   * `n.scope`/`n.review` sind Karten-Wahlen und stehen ohnehin als Wert da.
   */
  'm.types', 'm.rules',
  'n.prompts',
  'p.facts', 'p.contact', 'p.summary',
])

function renderedAbove(slotId: string): boolean {
  return RENDERED_ABOVE.has(slotId)
}

/**
 * WELCHES MODUL DIE BÜHNE ZEIGT — die Rangfolge in drei Zeilen.
 *
 * 1. DIE AKTIVE SESSION, wenn sie die Bühne beansprucht (`brandStageClaim`,
 *    pur und dort begründet). Das ist die Vorfahrt aus Weg B: die Bühne zeigt
 *    das Modul des Feldes, auf dem der Mensch sitzt — nie das eines anderen.
 * 2. SONST die nächste Katalog-Frage des Kapitels (Grundfassung).
 * 3. SONST das erste offene Pflicht-Feld, und ganz zuletzt die Weiche.
 *
 * `pendingCard` bleibt daneben stehen: sie beantwortet die zweite Frage —
 * WELCHE Karte das Modul rendert. Für einen Anspruch der aktiven Session ist
 * das dieselbe Session (beide fragen `activeSlot`), für die Zeilen 2/3 das
 * erste offene Pflicht-Feld.
 */
const stageModule = computed<BrandStageModule>(() => {
  /**
   * EINE GESCHLOSSENE SESSION ZEIGT KEIN MODUL MEHR (Davids Entscheidung
   * 2026-09-09).
   *
   * Ohne diese Zeile fiele `pendingCard` nach der Bestätigung auf das erste
   * offene Pflicht-Feld des Kapitels zurück, und unter dem Abschlusszug stünde
   * die Entwurfs- oder Bestätigungs-Karte eines FREMDEN Feldes — genau der
   * Themenwechsel, den `brandStageClaim` seit Kailua-Befund 5 verhindert. Das
   * Einzige, was hier noch zu tun ist, ist der Weiter-Knopf.
   */
  if (closedSession.value) return 'none'
  if (stageClaim.value && pendingCard.value) return stageClaim.value.module
  if (nextSlot.value) return nextSlot.value.type === 'choice' ? 'options' : 'answer'
  if (completion.value && !completion.value.slotsReady) {
    const card = pendingCard.value
    if (!card) return 'none'
    return card.controls.showGenerate ? 'draft' : 'confirm'
  }
  return completion.value?.slotsReady ? 'gate' : 'none'
})

/**
 * DAS ANTWORT-MODUL EINER ENTWURFS-SESSION (Kailua-Befund 5, Weg B).
 *
 * Steht auf einer Entwurfs-Session noch nichts, zeigt die Bühne Georges Frage
 * zu GENAU DIESEM Feld und ein Eingabefeld darunter. Der getippte Text ist
 * kein Chat-Zug und wird kein Feldwert: er reist als HINWEIS in
 * `generateSlot()` — dieselbe Mechanik wie „Nochmal, mit Hinweis", nur ohne
 * den Umweg über einen Knopf, den es beim ersten Mal noch gar nicht gibt.
 */
const stageAwaitsDraftAnswer = computed(() => brandStageAwaitsDraftAnswer(
  stageClaim.value,
  stageClaim.value ? store.slotValue(stageClaim.value.slotId).length > 0 : false,
))

/**
 * „JETZT WÄRE DER ENTWURF DRAN" (Davids Befund 8b, 2026-09-09).
 *
 * George kann kein Feld schreiben (converse-11) — er sagt jetzt selbst, dass
 * der Entwurf über den Knopf entsteht. Damit dieser Satz nicht ins Leere zeigt,
 * tritt der Knopf nach einem Gesprächszug SICHTBAR hervor, solange die aktuelle
 * Karte im Entwurfs-Modul steht und noch nichts drinsteht.
 *
 * DEZENT UND VON SELBST VERGÄNGLICH: die Hervorhebung ist eine Fassung des
 * bestehenden Knopfes (solid statt ghost), kein Blinken und kein zweiter Knopf.
 * Sie fällt beim ersten Klick, beim Wechsel der Karte — und ohnehin in dem
 * Augenblick, in dem ein Wert dasteht: die Bedingung IST der leere Wert.
 */
watch(() => conversation.pending.value, (now, before) => {
  // Nur die FLANKE „lief und ist fertig" — der Anfang eines Zuges sagt nichts.
  if (now || !before) return
  turnEnded.value = true
})

watch(() => pendingCard.value?.slot.id ?? '', () => { turnEnded.value = false })

const draftNudge = computed(() => {
  if (!turnEnded.value || stageModule.value !== 'draft') return false
  const card = pendingCard.value
  return card !== null && store.slotValue(card.slot.id).length === 0
})

/**
 * Die offenen Felder in der Sprache der Bühne: GENAU die Beschriftung, unter
 * der sie im Log stehen — ein zweiter Wortlaut hiesse, dass der Mensch das
 * gesuchte Feld nicht wiedererkennt.
 */
const pendingConfirmations = computed<string[]>(() =>
  (completion.value?.missingRequired ?? []).map((slotId) => {
    const slot = slots.value.find(entry => entry.id === slotId)
    return slot ? slotLabel(slot) : slotId
  }))

/**
 * Auswahl-Karten, die drei Richtungen und die eigene Formulierung rechnet
 * `useBrandWorkshopChoices` (WS1); geantwortet wird über den einen Sende-Pfad
 * `answerFromGeorge` des Schreibfelds.
 */
const {
  ownChoice,
  submitChoice,
  choiceCardsFor,
  choiceCards,
  directionChoicesFor,
  directionChoices,
  pickChoice,
} = useBrandWorkshopChoices({
  nextSlot,
  conversationPending: conversation.pending,
  answerFromGeorge,
})

/**
 * WAS IN EINER KARTE STEHT, WENN DER WERT EINE ID IST (P4).
 *
 * Gespeichert bleibt `branded-house`, gelesen wird „Branded House". Die Regel
 * ist pur und liegt beim Vertrag; hier hängt nur die Sprache der Oberfläche
 * dran. Für jeden anderen Slot gibt sie den Wert unverändert zurück — sie darf
 * deshalb überall stehen, wo ein Slot-Wert ANGEZEIGT wird.
 *
 * NICHT im Eingabefeld: dort wird der ROHE Wert bearbeitet und zurück-
 * geschrieben. Ein Feld, das ein Etikett zeigt und eine Id speichert, würde
 * beim ersten Tastendruck das Etikett speichern.
 */
function slotDisplayValue(slotId: string, value: string): string {
  return brandChoiceDisplayLabel(slotId, value, locale.value)
}

// ── Der Log: Kapitel-Sektionen und ihre Karten ────────────────────────────

/**
 * Sektionen, Karten und Befunde des Logs rechnet `useBrandWorkshopLogCards`
 * (WS1). Die Seite reicht die Karten des offenen Kapitels und die
 * Beschriftungen herein, die Bühne und Log teilen.
 */
const {
  findingsForSlot,
  activeFindings,
  findingDecided,
  logChapters,
  chapterCards,
} = useBrandWorkshopLogCards({
  stepKey,
  completion,
  confirmsInFlight,
  slotCards,
  activeSessionKey,
  slotLabel,
  slotNote,
  slotDisplayValue,
})

// ── Frühere Fassungen ─────────────────────────────────────────────────────

/**
 * Den Dialog zeigt `BwVersionsModal`; er holt die Historie selbst. Hier liegt
 * nur, WELCHES Feld offen ist, und die Wahl landet über den normalen Weg im
 * Editor: Store + Autosave, dieselbe `revision`-Rechnung wie jeder Tastendruck.
 */
const versionsSlot = ref<BrandSlot | null>(null)

/** Auf einem bestätigten Slot ist die Liste lesbar, die Übernahme nicht. */
const versionsControls = computed<BrandSlotControls | null>(() =>
  (versionsSlot.value ? cardFor(versionsSlot.value.id)?.controls ?? null : null))

function openVersions(slot: BrandSlot): void {
  versionsSlot.value = slot
}

function useVersion(slotId: string, text: string): void {
  store.setSlotValue(slotId, text)
  autosave.schedule()
}

// ── Leiste, Balken, Fortschritt ───────────────────────────────────────────

/**
 * Die Leiste und der Gesamtfortschritt rechnet `useBrandWorkshopRail`, das
 * Ein- und Ausklappen der Spalten `useBrandWorkshopLayout` (WS1, Kapitel g).
 * Die Seite reicht die Rechnungen herein, die Bühne und Leiste teilen.
 */
const {
  railLayers,
  currentLayerLabelKey,
  sidebarBrands,
  overallProgress,
  overallProgressCount,
  remainingTime,
  workspaceSync,
  workspaceSyncLabel,
} = useBrandWorkshopRail({
  profileId,
  stepKey,
  slots,
  activeSessionKey,
  acceptanceView,
  completion,
  navSessions,
  serverSlotFacts,
  slotLabel,
  slotNote,
  affectsLine,
  findingsForSlot,
})

const { railCollapsed, logCollapsed, navOverlayOpen, navVisible, toggleNav } = useBrandWorkshopLayout()

/**
 * DIE WERKBÄNKE ÜBER DEM GESPRÄCH (Vorbilder, DNA, Design-Werkzeuge, Book &
 * Kit) rechnet `useBrandWorkshopBenches` (WS1), gezeigt werden sie von
 * `BwWorkshopBenches`. Geschrieben wird über `onInput` — die Seite bleibt die
 * einzige Stelle, die `setSlotValue` ruft und den Autosave spült.
 */
const benches = useBrandWorkshopBenches({ profileId, stepKey, nextSlot, onInput })
const { showDnaMix, boardChoices, applyMixSources } = benches

/**
 * ÜBERSCHRIFT UND PLATZHALTER DER ANTWORT-KARTE (Befund 9, 2026-09-10) — die
 * Regel steht pur nebenan (`brandStageAnswerCard`), hier stehen nur die zwei
 * Tatsachen: rendert die Karte gerade eine Auswahl, und läuft eine
 * Sammel-Session.
 */
const answerCard = computed(() => brandStageAnswerCard({
  hasOptions: choiceCards.value.length > 0
    || directionChoices.value.length > 0
    || boardChoices.value.length > 0,
  partKey: collectPartKey.value,
}))

// ── Navigation ────────────────────────────────────────────────────────────

async function goToStep(key: string | null): Promise<void> {
  // Eine Auswahl im mobilen Nav-Overlay schliesst es — GANZ OBEN, vor den
  // Wächtern: wer den bereits offenen Baustein antippt, hat trotzdem
  // gewählt, und ein Overlay, das dann stehen bliebe, sähe kaputt aus.
  navOverlayOpen.value = false
  if (!key || key === routeStepKey.value) return
  if (!store.canEnter(key)) return
  // §3e „vor interner Navigation": der Baustein-Wechsel bleibt in derselben
  // Komponente, `onBeforeRouteLeave` feuert dafür NICHT.
  await autosave.flush()
  await navigateTo(localePath(`/brand/${profileId.value}/${key}`))
}

/**
 * DER KLICK AUS DER LEISTE — er schliesst zusätzlich das mobile Overlay
 * (dieselbe Regel wie bei `goToStep`: wer angetippt hat, hat gewählt). Der
 * Auto-Weiter ruft `goToSession` direkt: dort ist nie ein Overlay offen.
 */
async function selectSession(payload: { stepId: string, sessionId: string }): Promise<void> {
  navOverlayOpen.value = false
  if (payload.stepId !== routeStepKey.value) return
  // Der Eintrag „Finale Abnahme" trägt das Kapitel in seiner Id, die ADRESSE
  // trägt nur die Ansicht (§5a) — hier steht die eine Übersetzung dazwischen.
  if (payload.sessionId === `${payload.stepId}:${BRAND_ACCEPTANCE_VIEW}`) {
    await goToAcceptance()
    return
  }
  await goToSession(payload.sessionId)
}

/**
 * DER MARKEN-WECHSEL BRAUCHT DENSELBEN AUSSPÜLER (Audit-Befund A3). Er
 * springt auf DENSELBEN Route-Record (nur andere `profileId`) — genau wie der
 * Baustein-Wechsel feuert `onBeforeRouteLeave` dafür NICHT, und ein `to` am
 * Menü-Eintrag hätte offene Eingaben mitgenommen. Das Ziel kommt aus der
 * Liste des Kontos, nicht vom Menü-Klick.
 */
async function goToBrand(to: string): Promise<void> {
  navOverlayOpen.value = false
  if (!to) return
  await autosave.flush()
  await navigateTo(to)
}

// ── Die Finale Abnahme: was die Seite ihr schuldet (§5a) ──────────────────

/**
 * DIE WEICHE IST UMGEZOGEN (Paket 3c-ii). Bis 3c-i standen die drei
 * Konfidenz-Chips hier auf der Bühne; seit §5a stehen sie auf der
 * Abnahme-Seite, UNTER der Liste aller Werte des Kapitels — dort, wo der
 * Mensch sie im Zusammenhang lesen kann, statt am Ende eines Gesprächs über
 * das letzte Feld. `BwAcceptance` trägt sie samt `complete`-Aufruf; die Bühne
 * behält nur den Verweis dorthin.
 *
 * Was die SEITE dabei behält, ist die Navigation: sie besitzt den Ausspüler
 * (`autosave.flush()`) und die Adresse. Eine Komponente, die selbst
 * navigierte, umginge beides.
 */
async function advanceToStep(target: { stepKey: BrandStepKey, sessionKey: string }): Promise<void> {
  if (!store.canEnter(target.stepKey)) return
  await autosave.flush()
  await navigateTo({
    path: localePath(`/brand/${profileId.value}/${target.stepKey}`),
    query: { s: target.sessionKey },
  })
}

/**
 * NACH „NOCHMAL VON VORN": der Stand wird NEU GELESEN, nicht im Browser
 * nachgebaut.
 *
 * Der Restart leert Slots, Notizen, Abnahmen und Konfidenz und setzt das
 * Kapitel auf `active` — daraus folgen neue Session-Zustände, ein neuer
 * Fortschritt und eine neue Liste fehlender Pflicht-Werte. Diese Kette rechnet
 * der SERVER (`resolveSessionStates`), und ein zweiter Nachbau hier wäre die
 * zweite Wahrheit, die beim nächsten Registry-Schritt auseinanderläuft. Ein
 * `loadStep` kostet eine Anfrage und stimmt.
 *
 * Danach die erste Session: ihr Verlauf beginnt hinter `restartedAt` (der
 * Server schneidet ihn ab), also lädt `sessionHistory` ein leeres Gespräch und
 * `ensureOpeningTurn` lässt George neu eröffnen — die 3c-i-Mechanik,
 * unverändert.
 */
async function afterRestart(target: { sessionKey: string }): Promise<void> {
  await store.loadStep(profileId.value, routeStepKey.value)
  openedSessions.value = new Set()
  // Ohne benannte Session bleibt `?s=` WEG statt leer — die Rangfolge nimmt
  // dann die erste offene, und bei einem geleerten Kapitel ist das dieselbe.
  const query = { ...route.query }
  if (target.sessionKey) query.s = target.sessionKey
  else delete query.s
  await navigateTo({ query })
}

// ── 409 ───────────────────────────────────────────────────────────────────

/** Die Beschriftung eines Felds im Konflikt-Dialog (`BwConflictModal`). */
function conflictLabel(slotId: string): string {
  const slot = slots.value.find(entry => entry.id === slotId)
  return slot ? slotLabel(slot) : slotId
}

useBrandTitle(() => (store.profile?.title || t('brand.brands.card.untitled')))
</script>

<template>
  <!-- Gesperrter Baustein: eine Fläche, keine Fehlerseite (s. Kopf). Der
       Zweig für „kein Zugang" ist mit Paket 9 weg — dieser Fall endet oben
       als 404, und ein Zweig, der nie zieht, ist kein Sicherheitsnetz,
       sondern eine Behauptung über einen Zustand, den es nicht gibt. -->
  <BwWorkshopLocked v-if="store.blocked" :blocked="store.blocked" />

  <!-- Runde 16/20/31 (David): Sidebar-Muster links, keine Topbar, kein
       Rail-Fuß — der Gesamt-Fortschritt wohnt unten rechts im Log. Die
       feste Rail-Breite schaltet in BwWorkspace zugleich den Pre-Mount-Zweig
       frei (R30), damit beim Laden nichts springt. -->
  <BwWorkspace
    v-else
    v-model:rail-overlay="navOverlayOpen"
    stage-width="72rem"
    :progress-pct="overallProgress.pct"
    :content-locale="store.profile?.contentLocale ?? locale"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="logCollapsed"
    initial-mode="stage"
    :sync-state="workspaceSync"
    :sync-label="workspaceSyncLabel"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        :manage-to="localePath('/dashboard/brands')"
        :sync-state="workspaceSync"
        :sync-label="workspaceSyncLabel"
        @select="goToStep"
        @select-brand="goToBrand"
        @select-session="selectSession"
      />
    </template>

    <!-- Der Balken gehört NUR zur Gesprächs-Spalte (Runde 32): links das
         Nav-Icon, dann zweizeilig BEREICH über Kapitel, rechts das
         gespiegelte Gegenstück für den Log. -->
    <template #stage-bar>
      <BwStageBar
        v-model:log-collapsed="logCollapsed"
        :layer-label="t(currentLayerLabelKey)"
        :title="stepKey ? t(`brand.steps.${stepKey}`) : ''"
        :nav-visible="navVisible"
        @toggle-nav="toggleNav"
      />
    </template>

    <!-- MITTE: die Bühne IST das Gespräch — ausser in der Finalen Abnahme,
         die genau diese Fläche übernimmt (§5a: „Kein George auf dieser
         Seite"). Ein `v-if` und kein zweites Layout: Leiste, Log und der
         Sticky-Fortschritt bleiben stehen. -->
    <template #default>
      <BwAcceptance
        v-if="acceptanceView && stepKey"
        :profile-id="profileId"
        :step-key="stepKey"
        @session="slotId => correctThenGo(slotId, () => goToSession(slotId))"
        @field="slotId => correctThenGo(slotId, () => goToField(slotId))"
        @decided="findingDecided"
        @advance="advanceToStep"
        @document="goToDocument"
        @restarted="afterRestart"
      />

      <div v-else class="flex min-h-0 flex-1 flex-col gap-7 pb-4">
        <!-- Ausfall beim Laden (LZ1, s. `workshopLoadFailed`). -->
        <CoreInlineLoadError v-if="workshopLoadFailed" :retry="retryWorkshopLoad" data-workshop-load-error />

        <!-- Ein RUHIGER Hinweis, kein Toast-Gewitter: „KI ist aus" und „hier
             entwirft niemand" sind Zustände, in denen weitergearbeitet wird. -->
        <p v-if="generationNotice" class="bw-pending flex items-center gap-2">
          <span>{{ generationNotice }}</span>
          <button type="button" class="underline" @click="generation.dismissFailure(); conversation.dismissFailure()">
            {{ t('brand.workspace.generate.dismiss') }}
          </button>
        </p>

        <!-- „Website lesen" (P2.3) — nur im Baustein Kontext und nur mit
             hinterlegter Adresse; eigene Komponente seit Q21. -->
        <BwSiteStrip :profile-id="profileId" :step-key="routeStepKey" />

        <!-- DIE WERKBÄNKE (Vorbilder, Lesung, DNA, Design-Werkzeuge, Book &
             Kit) stehen ÜBER dem Gespräch — s. `BwWorkshopBenches`. -->
        <BwWorkshopBenches :profile-id="profileId" :benches="benches" />

        <p v-if="phaseIntro" class="bw-label" style="color: var(--bw-muted); padding-left: 2.65rem">{{ phaseIntro }}</p>

        <div v-for="(turn, index) in turns" :key="turn.id" class="bw-msg" :class="turn.role === 'user' ? 'bw-msg--user' : ''">
          <!-- Der Avatar IST der Weg zum Steckbrief (Runde 20) — eine eigene
               Berater-Zeile gibt es seit dem Umbau nicht mehr. Er trägt IMMER
               George: die Stimme wechselt nicht mit dem Kapitel. -->
          <button
            v-if="turn.role === 'george'" class="flex-none self-start rounded-full"
            :aria-label="t('brand.workspace.advisorInfo.open', { name: voice.name })"
            @click="advisorInfoOpen = true"
          >
            <BwGeorgeAvatar size="md" :src="voice.avatar" :initial="voice.name.slice(0, 1)" :alt="voice.name" />
          </button>
          <div class="bw-msg-body">
            <!-- Interpolation statt v-html: der Text kommt aus einem
                 Sprachmodell und wird escaped gerendert. -->
            <p class="whitespace-pre-wrap">{{ turn.text }}<span v-if="turn.pending" class="bw-caret" aria-hidden="true">▍</span></p>
            <p v-if="turn.help" class="bw-msg-help">{{ turn.help }}</p>

            <!-- ABGESCHNITTEN (P17, BE-007): das Modell hat seine Decke
                 gerissen. Nichts wird verworfen — der Zug steht, darunter ein
                 ruhiger Hinweis. Neu erzeugen lässt sich nur ein Entwurfs-Zug
                 an der letzten Blase; ein Gesprächszug bekommt den Satz, dass
                 eine neue Nachricht genügt. -->
            <div v-if="turn.truncated && !turn.pending" class="mt-2 flex flex-wrap items-center gap-2">
              <p class="bw-msg-help">
                {{ t('brand.workspace.truncated.hint') }}
                <template v-if="!turn.retrySlotId">
                  {{ t('brand.workspace.truncated.writeAgain', { voice: voice.name }) }}
                </template>
              </p>
              <UButton
                v-if="turn.retrySlotId && turn.id === truncatedRetryTurnId"
                size="sm" color="neutral" variant="soft" class="rounded-full" icon="i-ph-arrow-clockwise"
                :label="t('brand.workspace.truncated.retry')"
                @click="regenerateTruncated(turn.retrySlotId)"
              />
            </div>

            <!-- ANTWORT-MÖGLICHKEITEN (Davids Anforderung 2026-09-04): stellt
                 George eine Entweder-oder-Frage, steht sie in einer eigenen
                 Schlusszeile und die Möglichkeiten stehen als Knöpfe darunter
                 — abgetippt wird nichts mehr. Die Beschriftungen kommen vom
                 Modell (deshalb kein i18n-Schlüssel), seine EMPFEHLUNG steht
                 als Satz im Zug darüber. Einmalige Wahl: `optionTurnId` gibt
                 sie frei, bis der Mensch geantwortet hat. -->
            <div
              v-if="turn.options?.length && turn.id === optionTurnId"
              role="group" :aria-label="t('brand.workspace.turnOptions.label')"
              class="mt-3 flex flex-wrap gap-2"
            >
              <UButton
                v-for="option in turn.options" :key="option"
                size="sm" color="neutral" variant="soft" class="rounded-full"
                :label="option"
                :disabled="conversation.pending.value"
                @click="answerOption(option)"
              />
            </div>

            <!-- DIE BESTÄTIGUNG ALS BEDIENELEMENT (Davids Entscheidung
                 2026-09-09): George fragt nach ODER sagt, dass es ihm reicht —
                 entschieden wird per Knopf, nie durch getippten Text
                 (converse-11: er behauptet nie, etwas eingetragen zu haben).
                 „Passt so" löst dieselbe `confirmSlot()` aus wie die Karte
                 rechts; „Ich ergänze noch etwas" gibt nur das Wort zurück. -->
            <div
              v-if="turn.id === confirmTurnId"
              role="group" :aria-label="t('brand.workspace.confirmChoice.label')"
              class="mt-3 flex flex-wrap gap-2"
            >
              <UButton
                size="sm" class="rounded-full" icon="i-ph-check"
                :label="t('brand.workspace.confirmChoice.confirm')"
                :disabled="conversation.pending.value"
                @click="confirmSlot(activeSessionKey)"
              />
              <UButton
                size="sm" color="neutral" variant="soft" class="rounded-full"
                :label="t('brand.workspace.confirmChoice.more')"
                :disabled="conversation.pending.value"
                @click="keepWriting(turn.id)"
              />
            </div>

            <!-- Die Antwort-Module hängen am LETZTEN Zug: die Frage steht
                 immer ÜBER den Aktionen (Davids Korrekturrunde 1). -->
            <template v-if="index === turns.length - 1 && turn.role === 'george'">
              <!-- ANSWER: nur der Beispiel-Ausweg; geantwortet wird im Prompt. -->
              <BwStageAnswer
                v-if="stageModule === 'answer' && composerExample"
                v-model:open="exampleOpen"
                :example="composerExample"
                @take="takeExample"
              />

              <!-- OPTIONS: die Auswahl beantwortet sich im eigenen Modul. -->
              <BwStageOptions
                v-else-if="stageModule === 'options'"
                v-model:own-choice="ownChoice"
                :title="answerCard.titleKey ? t(answerCard.titleKey) : (nextSlot ? slotLabel(nextSlot) : '')"
                :direction-choices="directionChoices"
                :board-choices="boardChoices"
                :choice-cards="choiceCards"
                :selected="nextSlot ? store.slotValue(nextSlot.id) : ''"
                :disabled="conversation.pending.value"
                :placeholder="t(answerCard.placeholderKey)"
                @pick="pickChoice"
                @submit="submitChoice"
              />

              <!-- DRAFT: der Entwurfs-Moment. Basis-Zeile, gestrichelter
                   Rahmen (fällt mit der Bestätigung), drei Wege heraus. -->
              <BwStageDraft
                v-else-if="stageModule === 'draft' && pendingCard"
                v-model:hint-open="hintOpen"
                :field="pendingCard.slot"
                :controls="pendingCard.controls"
                :note="pendingCard.note"
                :label="slotLabel(pendingCard.slot)"
                :voice-name="voice.name"
                :editing="editingSlotId === pendingCard.slot.id"
                :rendered-above="renderedAbove(pendingCard.slot.id)"
                :display="slotDisplayValue(pendingCard.slot.id, store.slotValue(pendingCard.slot.id))"
                :awaits-answer="stageAwaitsDraftAnswer"
                :truncated="fieldIsTruncated(pendingCard.slot.id)"
                :can-retry-truncated="truncatedRetryFieldId === pendingCard.slot.id"
                :streaming="generation.streaming.value"
                :streaming-here="generation.isStreamingSlot(pendingCard.slot.id)"
                :nudge="draftNudge"
                :hint="hints[pendingCard.slot.id] ?? ''"
                @input="value => onInput(pendingCard!.slot.id, value)"
                @flush="autosave.flush()"
                @retry-truncated="regenerateTruncated(pendingCard!.slot.id)"
                @update:hint="value => hints = { ...hints, [pendingCard!.slot.id]: value }"
                @generate="generateSlot(pendingCard!.slot)"
                @stop="generation.stop()"
                @versions="openVersions(pendingCard!.slot)"
                @apply="applyEdit()"
                @discard="discardEdit(pendingCard!.slot.id)"
                @edit="openEditor(pendingCard!.slot.id)"
                @confirm="confirmSlot(pendingCard!.slot.id)"
              />

              <!-- CONFIRM: die Karte trägt als Kopf die URSPRUNGSFRAGE des
                   Inhalts (Runde 37c), die Abschluss-Frage steht über den
                   Knöpfen, „Korrigieren" links neben „Bestätigen". -->
              <BwStageConfirm
                v-else-if="stageModule === 'confirm' && pendingCard"
                :field="pendingCard.slot"
                :controls="pendingCard.controls"
                :label="slotLabel(pendingCard.slot)"
                :editing="editingSlotId === pendingCard.slot.id"
                :rendered-above="renderedAbove(pendingCard.slot.id)"
                :display="slotDisplayValue(pendingCard.slot.id, store.slotValue(pendingCard.slot.id))"
                :truncated="fieldIsTruncated(pendingCard.slot.id)"
                :can-retry-truncated="truncatedRetryFieldId === pendingCard.slot.id"
                @input="value => onInput(pendingCard!.slot.id, value)"
                @flush="autosave.flush()"
                @retry-truncated="regenerateTruncated(pendingCard!.slot.id)"
                @apply="applyEdit()"
                @discard="discardEdit(pendingCard!.slot.id)"
                @edit="openEditor(pendingCard!.slot.id)"
                @confirm="confirmSlot(pendingCard!.slot.id)"
              />

              <!-- GATE: die Weiche selbst ist auf die Abnahme-Seite gezogen
                   (§5a, Paket 3c-ii) — hier steht nur noch der VERWEIS. Die
                   Frage „Passt dieses Kapitel?" gehört unter die Liste aller
                   Werte, nicht ans Ende des Gesprächs über das letzte Feld. -->
              <div v-else-if="stageModule === 'gate'" class="mt-3">
                <UButton
                  class="rounded-full" trailing-icon="i-ph-arrow-right"
                  :label="t('brand.nav.acceptance')" @click="goToAcceptance"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- DER WEITER-KNOPF (Davids Entscheidung 2026-09-09) — er steht an
             der Stelle, an der bis heute der automatische Sprung passierte.
             Sein ZIEL kommt aus der Regel (`resolveNextStop` auf dem Server,
             `resolveContinueTarget` hier), nie aus Georges Urteil: eine
             Navigation, die ein Modell entscheidet, wäre nichtdeterministisch.
             Er steht auch dann da, wenn der Abschlusszug ausgefallen ist —
             sonst wäre eine ausgefallene Zugabe eine Sackgasse. -->
        <div v-if="continueTarget.kind !== 'none'" style="padding-left: 2.65rem">
          <UButton
            class="rounded-full" trailing-icon="i-ph-arrow-right"
            :label="continueTarget.kind === 'acceptance'
              ? t('brand.workspace.continueAcceptance')
              : t('brand.workspace.continueTo', { field: continueLabel })"
            @click="continueToNext"
          />
        </div>

        <!-- DIE SESSION-ZEILE (BW2 3c-i): wofür das Feld gebraucht wird, und
             der vierte Ausgang „Später". Sie steht UNTER dem Gespräch und auf
             dessen Text-Flucht — über den Zügen wäre sie ein Kopf, und die
             Bühne hat bewusst keinen (Umbau-Plan §2). -->
        <BwWorkshopSessionLine
          v-if="activeSlot"
          v-model:stale-hidden="staleHidden"
          :profile-id="profileId"
          :affects="affectsLine(activeSlot.id)"
          :findings="activeFindings"
          :stale="activeStale"
          :restamping="restamping"
          :deferred="Boolean(activeSession?.deferred)"
          :collected="activeCollected"
          :deferring="deferring"
          :allows-defer="activeAllowsDefer"
          @field="slotId => correctThenGo(slotId, () => goToField(slotId))"
          @decided="findingDecided"
          @stale-finding="findingId => store.dropFinding(findingId)"
          @keep="keepSessionValid"
          @defer="setDeferred"
        />

        <!-- MIX & MATCH UND „EUER STAND" (`g.mix`, D2c) — sie stehen UNTER dem
             Gespräch, weil sie erst nach der Board-Wahl einen Sinn haben: was
             man mischt, muss man vorher gewählt haben. -->
        <BwDnaMixPanel v-if="showDnaMix" @sources="applyMixSources" />

        <!-- KAPITELENDE (§5): der ruhige Satz IST seit Paket 3c-ii der Weg —
             ein Hinweis auf eine Seite, die man nicht anklicken kann, wäre eine
             Ansage ohne Tür. Der Auto-Weiter geht denselben Weg von selbst;
             dieser Satz fängt den ab, bei dem eine Sperre gegriffen hat. -->
        <button
          v-if="completion?.slotsReady && continueTarget.kind === 'none'" type="button"
          class="bw-pending flex items-center gap-1.5 text-left underline"
          style="padding-left: 2.65rem"
          @click="goToAcceptance"
        >
          {{ t('brand.workspace.chapterReady') }}
          <UIcon name="i-ph-arrow-right" class="size-3.5 flex-none" />
        </button>

        <!-- NOCH NICHT SO WEIT: eingerückt auf die Text-Flucht des Gesprächs
             (Avatar 2rem + Lücke 0.65rem). -->
        <div
          v-if="completion && !completion.slotsReady && !nextSlot"
          style="padding-left: 2.65rem"
        >
          <p class="bw-label" style="color: var(--bw-muted)">
            {{ t('brand.workspace.confidence.pending', {
              open: completion.missingRequired.length,
              total: completion.total,
            }) }}
          </p>
          <!-- Die NAMEN der offenen Felder, nicht nur ihre Zahl: der Hinweis
               soll zum nächsten Handgriff führen. Sie tragen genau die
               Beschriftung, unter der sie rechts im Log stehen. -->
          <ul class="bw-label mt-1 flex flex-col gap-1" style="color: var(--bw-ink-soft)">
            <li v-for="(label, index) in pendingConfirmations" :key="index">· {{ label }}</li>
          </ul>
        </div>

        <div ref="tail" />
      </div>
    </template>

    <!-- Das Chat-Prompt aus dem Nuxt-UI-Chat-Template, fest am unteren Rand —
         nur Feld und Pfeil-nach-oben. Fokus-Overrides sind PFLICHT: Textareas
         gelten im Browser immer als focus-visible, deshalb Outline UND den
         dunklen ring-primary neutralisieren (Runde 29/29c). -->
    <template #stage-footer>
      <!-- KEIN PROMPT IN DER ABNAHME (§5a): dort wird gelesen und abgenommen,
           nicht gesprochen. Ein Feld, das an George schickt, während George
           gar nicht da ist, wäre ein Versprechen ohne Empfänger.
           Die Hülle trägt den Ref: „Ich ergänze noch etwas" setzt den Cursor
           zurück ins Feld, und ein Ref auf die Komponente selbst gäbe nur ihre
           Instanz, nicht das <textarea> darin. -->
      <div ref="promptBox" class="w-full">
        <UChatPrompt
          v-if="!acceptanceView"
          v-model="promptDraft" :placeholder="promptPlaceholder"
          :disabled="!promptEnabled" :autofocus="false" class="w-full"
          :ui="{ root: 'has-[textarea:focus-visible]:outline-none has-[textarea:focus-visible]:ring-default' }"
          @submit="submitPrompt" @keydown.tab="promptTab"
        >
          <template #footer>
            <UChatPromptSubmit
              class="ml-auto" size="sm" color="neutral"
              :disabled="!promptEnabled || !promptDraft.trim() || conversation.pending.value"
            />
          </template>
        </UChatPrompt>
      </div>
    </template>

    <!-- RECHTS: der Log — je Kapitel eine Sektion, je Entscheidung eine
         Karte, unten NUR der Gesamtfortschritt (Runde 27/31/35). -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <BwWorkshopLog
            :profile-id="profileId"
            :step-key="routeStepKey"
            :chapters="logChapters"
            :cards-for="chapterCards"
            :editing-slot-id="editingSlotId"
            :direction-choices-for="directionChoicesFor"
            :choice-cards-for="choiceCardsFor"
            @input="onInput"
            @flush="autosave.flush()"
            @field="slotId => correctThenGo(slotId, () => goToField(slotId))"
            @go-step="goToStep"
            @go-session="goToSession"
            @revise="reviseSlot"
            @apply="applyEdit()"
            @discard="discardEdit"
            @edit="openEditor"
            @confirm="confirmSlot"
          />
        </div>

        <!-- Unten rechts NUR der dreizeilige Gesamtfortschritt (Runde 31/35) —
             der „Euer Branding"-Einstieg wohnt an der Kachel der Übersicht. -->
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="overallProgress.pct"
            :progress-title="t('brand.workspace.log.overall')"
            :progress-count="overallProgressCount"
            :progress-time="remainingTime"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>

  <!-- GEORGES STECKBRIEF — geöffnet über den Avatar im Gespräch. Er zeigt die
       EINE Stimme und das Team dahinter (Davids Entscheidung 2026-09-02):
       Beschreibung, die Kolleginnen und Kollegen mit ihrem Schwerpunkt, eine
       typische Frage und Georges Arbeitsweise-Zeile. Alles lokalisiert — die
       `personal`-Zeile der Registry ist Prompt-/About-Ebene und deutsch-only. -->
  <BwAdvisorInfoModal v-model:open="advisorInfoOpen" :voice="voice" :role="voiceRole" />

  <BwVersionsModal
    v-model:slot="versionsSlot"
    :profile-id="profileId"
    :step-key="routeStepKey"
    :label="versionsSlot ? slotLabel(versionsSlot) : ''"
    :controls="versionsControls"
    @use="text => versionsSlot && useVersion(versionsSlot.id, text)"
  />

  <!-- 409: BEIDE Fassungen, nichts wird automatisch überschrieben (§3e). -->
  <!-- DER IMPACT-HINWEIS (§9) — EINE Instanz für alle drei Eingänge
       („Korrigieren" im Log, „Bearbeiten" in der Abnahme, der Feld-Link eines
       Befund-Chips). Nie per `v-if` unmountet: ein offener Dialog, den man
       wegrendert, lässt Fokus-Falle und Overlay zurück. -->
  <BwImpactLayer
    v-model:open="impactOpen"
    :impact="impactData"
    :loading="impactLoading"
    :changed="impactChanged"
    @accept="acceptImpact"
    @cancel="cancelImpact"
  />

  <BwConflictModal :label-for="conflictLabel" />
</template>
