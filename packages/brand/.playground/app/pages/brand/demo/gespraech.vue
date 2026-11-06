<script setup lang="ts">
import { demoRail } from '../../../utils/demoRail'

/**
 * KLICKDUMMY „GESPRÄCH ALS BÜHNE" — Davids Konzept-Revision vom 2026-09-02.
 *
 * Seine Worte: „der ki markenberater muss zentral in der mitte sein, das
 * kundengespräch zwischen kunde und markenberater. und rechts, wo jetzt der
 * chat ist, der LOG-bereich … dort wird mir laufend gezeigt, was wir bereits
 * beantwortet haben, und ich kann es dort revisen oder confirmen … nach jeder
 * frage einmal final confirmen."
 *
 * Diese Seite ist NICHT die Werkstatt, sondern die Entscheidungsgrundlage für
 * Davids Korrekturrunden: dieselben drei Zonen, aber Bühne und rechte Spalte
 * haben die Rollen getauscht. Nichts hier spricht mit einem Server, es gibt
 * keinen KI-Aufruf und keine Route — der ganze Ablauf ist geskriptet.
 *
 * DIE ECHTE WERKSTATT (unverändert, weiter der Stand der Abnahme):
 *   · Klickdummy    /brand/demo/werte      (Bühne = Dokument, rechts = Chat)
 *   · echte Seite   packages/brand/app/pages/brand/[profileId]/[stepKey].vue
 *
 * WAS AUS DEM SYSTEM KOMMT (nichts davon ist hier neu erfunden):
 *   BwWorkspace (drei Zonen + USplitter) · BwProgressRail · BwOptionCards ·
 *   BwChips · BwGeorgeAvatar · .bw-msg/.bw-msg--user · .bw-draft-frame ·
 *   .bw-doc-text · .bw-dot (Ampel) · .bw-confirm (Bestätigen/Bestätigt) ·
 *   .bw-chapter-progress-track/-fill · .bw-state · .bw-chip--ghost.
 *
 * DIE MARKE IST HIER EINE BÄCKEREI und nicht Kailua Coffee Co.: Davids
 * Demo-Antwort für Frage 1 handelt vom Brotbacken in der Elternzeit. Eine
 * Kaffeerösterei mit dieser Ursprungsgeschichte wäre in jedem zweiten Satz
 * unglaubwürdig — und das Gesprächsgefühl ist genau das, was hier beurteilt
 * werden soll.
 */

// ── Der Bestand: was das Kapitel zu entscheiden hat ────────────────────────

type LogState = 'draft' | 'confirmed'

interface LogEntry {
  id: string
  label: string
  text: string
  state: LogState
  /* Runde 25 (David): jede Headline trägt eine Subline mit der Beschreibung
   * der Entscheidung (dieselben Texte wie der Info-Layer) — darunter erst
   * die Antwort. So liest sich der Log ohne Vorwissen. */
  note?: string
}

/** Vier Entscheidungen — der Nenner steht von Anfang an, auch leer. */
const CHAPTER_TOTAL = 4

/** Abgeschlossenes Kapitel: ALLE 10 Entscheidungen ausgeschrieben —
 *  Runde 26 (David): kein „Und 7 weitere …"-Hinweis, der Log zeigt alles. */
const CONTEXT_TOTAL = 10

const contextLog = ref<LogEntry[]>([
  {
    id: 'ctx-profile',
    label: 'Steckbrief',
    note: 'Wer ihr seid, seit wann, in welcher Form — die nackten Fakten.',
    text: 'Brot & Zeit, Bäckerei in Kiel-Gaarden, gegründet 2026 von Marit Ahrens — eine Backstube, ein Verkaufsraum, drei Leute.',
    state: 'confirmed',
  },
  {
    id: 'ctx-offer',
    label: 'Angebot',
    note: 'Was ihr verkauft und was es besonders macht.',
    text: 'Vier Brote, zwei Brötchensorten. Alles mit Sauerteig, mindestens 18 Stunden Führung, ohne Backmittel.',
    state: 'confirmed',
  },
  {
    id: 'ctx-audience',
    label: 'Zielgruppe',
    note: 'Für wen ihr da seid — und für wen bewusst nicht.',
    text: 'Menschen im Viertel, die Zutatenlisten lesen — und Familien, die sich auf eine Deklaration verlassen müssen.',
    state: 'confirmed',
  },
  {
    id: 'ctx-market',
    label: 'Marktumfeld',
    note: 'Wettbewerber und wie sie auftreten — die Lücke, in die ihr stoßt.',
    text: 'Zwei Ketten-Bäcker am Platz, Aufback-Theken in beiden Supermärkten — niemand backt vor Ort mit langer Führung.',
    state: 'confirmed',
  },
  {
    id: 'ctx-position',
    label: 'Positionierung',
    note: 'Für wen, gegen wen, warum ihr — die eine Kernentscheidung der Strategie.',
    text: 'Die einzige Bäckerei im Viertel, die jede Zutat nennen kann — gegen die Aufback-Theke, für Menschen, die wissen wollen, was sie essen.',
    state: 'confirmed',
  },
  {
    id: 'ctx-architecture',
    label: 'Markenarchitektur',
    note: 'Eine Marke oder mehrere? Nur per Weiche, wenn Produktmarken geplant sind.',
    text: 'Eine Marke: Brot & Zeit. Keine Produktmarken geplant.',
    state: 'confirmed',
  },
  {
    id: 'ctx-limits',
    label: 'Angebots-Grenze',
    note: 'Was ihr bewusst nicht anbietet — die Grenze des Sortiments.',
    text: 'Kein Kuchen, kein Kaffee-Ausschank — die Theke bleibt Brot.',
    state: 'confirmed',
  },
  {
    id: 'ctx-channels',
    label: 'Verkaufswege',
    note: 'Wo man euch kauft — heute und geplant.',
    text: 'Nur der eigene Laden, samstags der Wochenmarkt. Kein Versand.',
    state: 'confirmed',
  },
  {
    id: 'ctx-team',
    label: 'Team & Rollen',
    note: 'Wer die Marke nach außen trägt.',
    text: 'Marit backt und spricht für die Marke; zwei Leute im Verkauf.',
    state: 'confirmed',
  },
  {
    id: 'ctx-pricing',
    label: 'Preislage',
    note: 'Wie ihr euch preislich einordnet — und warum.',
    text: 'Über Supermarkt, unter Feinkost: ein ehrlicher Preis für 18 Stunden Handwerk.',
    state: 'confirmed',
  },
])
const contextOpen = ref(false)
const contextConfirmed = computed(() =>
  contextLog.value.filter(entry => entry.state === 'confirmed').length)

const log = ref<LogEntry[]>([])
const confirmedCount = computed(() => log.value.filter(entry => entry.state === 'confirmed').length)
/* Runde 27 (David): der Kapitel-Fortschritt ist eine Log-SEKTION unter
 * Context (kein eigener Stand-Kopf, keine Prozentzahl mehr — die lebt nur
 * noch im Gesamtfortschritt unten links). */
const pvmOpen = ref(true)
const openLabels = computed(() => log.value.filter(entry => entry.state === 'draft').map(entry => entry.label))
const allConfirmed = computed(() => log.value.length === CHAPTER_TOTAL && openLabels.value.length === 0)

function findEntry(id: string): LogEntry | undefined {
  return log.value.find(entry => entry.id === id) ?? contextLog.value.find(entry => entry.id === id)
}
function entryState(id: string | undefined): LogState | undefined {
  return id ? findEntry(id)?.state : undefined
}

// ── Die Bühne: das Gespräch ───────────────────────────────────────────────

type TurnBlock = 'answer' | 'draft' | 'options' | 'confirm' | 'gate' | 'done'

interface Turn {
  id: string
  role: 'george' | 'user'
  /** Veras Zug: 2–3 Sätze. */
  text: string
  /** Leise Mono-Zeile darunter (Angebot, Hinweis) — nie eine zweite Frage. */
  help?: string
  /** Die EINE Frage, vor dem Block. */
  question?: string
  /** Die EINE Frage, nach dem Block (Entwurf, Vorschlag). */
  closing?: string
  block?: TurnBlock
  /** Für 'confirm': welcher Eintrag im Stand daran hängt. */
  entryId?: string
  /** Für 'confirm' (Runde 37c, David): die URSPRÜNGLICHE Frage, auf die
   *  der festgehaltene Inhalt geantwortet hat — sie steht als Kopf der
   *  Karte (nicht die Abschluss-Frage des Zugs). */
  sourceQuestion?: string
  /** Für 'confirm': Veras besserer Vorschlag im Entwurfsrahmen. */
  proposal?: string
  /** Für 'answer': die Beispiel-Antwort hinter „Beispiel ansehen". */
  example?: string
  /** Für 'answer': die Demo-Antwort dieses Klickdummys. */
  demo?: string
  /** Für 'gate': die getroffene Wahl — je Zug eigen, damit ein zweiter
   *  Durchgang die Wahl des ersten nicht rückwirkend umschreibt. */
  choice?: string
}

/**
 * Davids Korrekturrunde 3: die Orts-Hinweise (Step-Label rechts im Kopf,
 * „Kapitel …"-Zeile) sind RAUS — links im Menü und rechts im Stand steht
 * längst, wo wir sind. Stattdessen trägt der klebende Kopf die eine Zeile
 * „Gespräch mit …" + Info-Icon (Layer mit Veras Steckbrief) + dieselbe dünne
 * Fortschritts-Linie wie der Stand.
 */
const veraInfoOpen = ref(false)
/**
 * Davids Entscheidung 2026-09-02 („Mittelweg"): George ist die EINE Stimme
 * durch den ganzen Wizard — sein Team liest im Rücken mit und wird von ihm
 * erwähnt, spricht aber nie selbst. Der Layer zeigt beides.
 */
const VERA_INFO = {
  name: 'George Winter',
  role: 'Markenberater',
  desc: 'Führt euch durch den ganzen Wizard — von Kontext bis Name. Er stellt kleine, konkrete Fragen, sagt ehrlich, was fehlt, und hält den roten Faden. Im Rücken liest sein Team mit:',
  team: [
    'Vera Stein — Strategin · Warum-Fragen, Positionierung',
    'Milo Berger — Werte-Berater · Momente statt Adjektive',
    'Nika Sommer — Sprach-Beraterin · testet Sätze am Ohr',
    'Otto Kessler — Namens-Berater · erst überleben, dann gefallen',
  ],
  asks: '„Warum habt ihr angefangen — was war der Auslöser?"',
  /* Davids Entscheidung 2026-09-02 (DECISION-LOG): das ganze Team sind
   * professionelle Beraterinnen und Berater — keine Rassen, keine Tier-Gags,
   * nirgends. Diese Zeile sagt, WIE George arbeitet, nicht wo er wohnt. */
  personal: 'Markenberater und Markenstratege — jede Empfehlung mit Begründung, jede Entscheidung festgehalten.',
}

const turns = ref<Turn[]>([
  {
    id: 'v1',
    role: 'george',
    text: 'Weiter geht es mit dem Warum. Ich habe euren Kontext mit Vera durchgesehen — unserer Strategin; sie liest in diesem Kapitel streng mit. Jetzt stelle ich die Warum-Fragen, bis eure Positionierung trägt.',
    question: 'Erste Frage: Warum habt ihr angefangen — was war der Auslöser?',
    block: 'answer',
    example: 'Ich habe drei Jahre in einer Großbäckerei gearbeitet und dort gesehen, wie viel Technik nötig ist, damit Brot billig aussieht. Das wollte ich anders machen.',
    demo: 'Ich habe in der Elternzeit angefangen zu backen, weil ich kein Brot ohne Zusatzstoffe gefunden habe, das mir geschmeckt hat.',
  },
])

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}${seq}`
}
function push(turn: Omit<Turn, 'id'>): void {
  turns.value.push({ ...turn, id: nextId(turn.role) })
}
/** Ein verbrauchter Block verschwindet, der Zug bleibt stehen (Verlauf). */
function consume(turn: Turn): void {
  turn.block = undefined
}

/* Runde 55 (David) für die BÜHNE: der Verlauf ankert unten und wächst nach
 * oben. Gescrollt wird auf den Anker am Ende — die Bühne ist ihr eigener
 * Scroller (.bw-stage), ein Element-Ref darauf gäbe es hier nicht. */
const tail = ref<HTMLElement | null>(null)
watch(() => turns.value.length, async () => {
  await nextTick()
  tail.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
})

// ── Die Antwortfläche im Zug ──────────────────────────────────────────────

const draft = ref('')
const exampleOpen = ref(false)

/** Tab übernimmt die Beispiel-Antwort — aber nur, solange sie sichtbar und
 *  das Feld leer ist (dasselbe Verhalten wie im echten Composer). */
function acceptExample(turn: Turn, event: KeyboardEvent): void {
  if (event.shiftKey || !exampleOpen.value || !turn.example || draft.value.length > 0) return
  event.preventDefault()
  draft.value = turn.example
}

/* Runde 23 (David, Nuxt-UI-Chat-Template): die Eingabe ist EIN Chat-Prompt
 * fest am unteren Rand der Bühne — es bedient immer den jüngsten offenen
 * answer-Zug; gibt es keinen, ist es ausgegraut (die anderen Blöcke
 * antworten in ihren eigenen Modulen im Zug). */
const activeAnswerTurn = computed(() => [...turns.value].reverse().find(t => t.block === 'answer') ?? null)
function promptSubmit(): void { if (activeAnswerTurn.value) answer(activeAnswerTurn.value) }
/* Runde 24 (David): kein „Weiß ich nicht"-Knopf mehr — das kann man tippen,
 * es ist derselbe Antwort-Weg. */
function promptTab(event: KeyboardEvent): void { if (activeAnswerTurn.value) acceptExample(activeAnswerTurn.value, event) }
function promptDemo(): void { if (activeAnswerTurn.value?.demo) draft.value = activeAnswerTurn.value.demo }

function answer(turn: Turn, text?: string): void {
  const said = (text ?? draft.value).trim()
  if (!said) return
  consume(turn)
  draft.value = ''
  exampleOpen.value = false
  push({ role: 'user', text: said })
  pulseSave()
  if (turn.id === 'v1') afterOrigin()
  else afterBoundary()
}

// ── Der Ablauf (geskriptet, in dieser Reihenfolge) ────────────────────────

/** 2 → 3: Substanz-Echo, Nachfrage-Angebot, Bestätigung IM Zug. */
function afterOrigin(): void {
  log.value.push({
    id: 'origin',
    label: 'Warum gestartet',
    note: 'Die Geschichte hinter dem Purpose — in euren Worten.',
    text: 'In der Elternzeit angefangen zu backen — weil es kein Brot ohne Zusatzstoffe gab, das geschmeckt hat.',
    state: 'draft',
  })
  push({
    role: 'george',
    text: 'Das ist kein Marketing-Anlass, das ist ein Mangel, den du selbst hattest — daraus tragen Purpose-Sätze. Ich halte fest: der Auslöser war das fehlende Brot, nicht der Wunsch, Bäckerin zu werden.',
    help: 'Wenn du willst, hake ich hier noch einmal nach — sonst nehme ich es so als Grundlage.',
    question: 'Passt das so als Grundlage?',
    block: 'confirm',
    entryId: 'origin',
    sourceQuestion: 'Warum habt ihr angefangen — was war der Auslöser?',
  })
}

/** 4: der Entwurfs-Moment. */
const PURPOSE_LONG = 'Es gibt uns, damit Menschen in Kiel wieder Brot essen, dessen Zutatenliste sie vorlesen können — gebacken in dem Tempo, das ein Teig wirklich braucht.'
const PURPOSE_SHORT = 'Es gibt uns, damit Brot wieder aus vier Zutaten und viel Zeit besteht.'

const purposeText = ref(PURPOSE_LONG)
/* Die Karte im Zug liest denselben Zustand wie der Eintrag im Stand: wird der
 * Purpose dort korrigiert, ist die Karte wieder ein Entwurf mit Aktionen. */
const purposeConfirmed = computed(() => entryState('purpose') === 'confirmed')
const purposeEditing = ref(false)
const purposeRound = ref(1)
const purposeHint = ref('')
const purposeHintUsed = ref('')
const hintOpen = ref(false)
let purposeOffered = false

function offerPurpose(): void {
  if (purposeOffered) return
  purposeOffered = true
  push({
    role: 'george',
    text: 'Dann lege ich euren Purpose vor. Ich habe ihn aus eurer Ursprungsgeschichte gebaut, nicht aus dem Angebot — ein Purpose, der das Produkt beschreibt, ist austauschbar.',
    block: 'draft',
    closing: 'Trifft das euer Warum — oder klingt es nach uns statt nach euch?',
  })
}

function regeneratePurpose(): void {
  if (!purposeHint.value.trim()) return
  purposeHintUsed.value = purposeHint.value.trim()
  purposeText.value = PURPOSE_SHORT
  purposeRound.value = 2
  purposeHint.value = ''
  hintOpen.value = false
  purposeEditing.value = false
  pulseSave()
}

function acceptPurpose(): void {
  purposeEditing.value = false
  /* Nach einem „Korrigieren" im Stand führt derselbe Knopf zurück — dann wird
   * der bestehende Eintrag geschärft, nicht ein zweiter angelegt. */
  const existing = findEntry('purpose')
  if (existing) {
    existing.text = purposeText.value
    existing.state = 'confirmed'
  }
  else {
    log.value.push({ id: 'purpose', label: 'Purpose-Satz', note: 'Ein Satz, warum es euch gibt — ohne Produkt, ohne Floskel.', text: purposeText.value, state: 'confirmed' })
  }
  pulseSave()
  offerPosition()
  maybeGate()
}

/** 5: der Auswahl-Moment. */
const positionOptions = [
  {
    id: 'p1',
    label: 'Gegen die Backshop-Kette',
    description: 'Handwerk gegen Aufbackware — Qualität als Grenze, nicht als Werbewort.',
    recommended: true,
    why: 'Meine Empfehlung, weil eure Ursprungsgeschichte genau dieser Vergleich ist: du hast angefangen, weil das vorhandene Brot nichts taugte. Und im Kieler Umfeld werben fast alle mit „regional" — fast niemand mit einer Zutatenliste, die man vorlesen kann.',
  },
  { id: 'p2', label: 'Gegen die eigene Eile', description: 'Zeit als Zutat: lange Führung, wenige Sorten, nichts nachgeschoben.' },
  { id: 'p3', label: 'Für Familien mit Allergien', description: 'Verträglichkeit als Versprechen — deklariert bis zur letzten Zutat.' },
]

const pickedOption = ref<string | null>(null)
const ownPosition = ref('')

function submitPosition(turn: Turn): void {
  if (!pickedOption.value) return
  const text = pickedOption.value === 'own'
    ? ownPosition.value.trim()
    : positionOptions.find(option => option.id === pickedOption.value)?.label ?? ''
  if (!text) return
  pickPosition(turn, text)
}

let positionOffered = false
function offerPosition(): void {
  if (positionOffered) return
  positionOffered = true
  push({
    role: 'george',
    text: 'Gut. Dann die Entscheidung, an der später jede Farbe und jeder Satz hängt.',
    question: 'Für wen backt ihr — und gegen wen? Wähl die Richtung, die ihr auch dann vertretet, wenn sie Umsatz kostet.',
    block: 'options',
  })
}

function pickPosition(turn: Turn, text: string): void {
  consume(turn)
  push({ role: 'user', text })
  log.value.push({ id: 'position', label: 'Positionierung', note: 'Für wen, gegen wen, warum ihr — die eine Kernentscheidung.', text, state: 'draft' })
  pulseSave()
  push({
    role: 'george',
    text: 'Notiert. Ich lege es rechts in euren Stand — bestätigt ist es, wenn du dort bestätigst.',
    question: 'Und wogegen grenzt ihr euch ab: Was macht ihr bewusst nicht, obwohl es Geld brächte?',
    block: 'answer',
    example: 'Wir machen kein Catering. Sobald wir Bleche für andere backen, leidet die Führung des Teigs.',
    demo: 'wir sind halt die besten',
  })
}

/** 6: der Widerspruchs-Moment. */
const BOUNDARY_PROPOSAL = 'Wir verkaufen kein Brot, das wir nicht am selben Tag gebacken haben — auch nicht am Samstagnachmittag, wenn die Regale leer aussehen.'
/**
 * Davids Korrekturrunde 1+2 (2026-09-02): JEDER bestätigbare Punkt hat überall
 * BEIDE Wege — Bestätigen UND Anpassen, im Zug wie im Stand. Nur bestätigen zu
 * können wäre „friss oder stirb"; und weil Zug und Stand denselben Log-Eintrag
 * lesen, ist der angepasste Text sofort an beiden Orten derselbe.
 */
const editingEntryId = ref<string | null>(null)

function toggleEntryEditing(id: string | undefined): void {
  if (!id) return
  editingEntryId.value = editingEntryId.value === id ? null : id
}

function confirmProposal(turn: Turn): void {
  editingEntryId.value = null
  confirmEntry(turn.entryId)
}

function afterBoundary(): void {
  log.value.push({ id: 'boundary', label: 'Abgrenzung', note: 'Was ihr bewusst nicht seid — die Grenze nach außen.', text: BOUNDARY_PROPOSAL, state: 'draft' })
  push({
    role: 'george',
    text: 'Da widerspreche ich dir. „Die Besten" könnte jede Bäckerei der Stadt über sich schreiben, und niemand kann es nachprüfen — das ist eine Behauptung, keine Abgrenzung. Was du mir vorhin erzählt hast, ist überprüfbar und deshalb stärker. Vera sieht das genauso — und sie ist schwerer zu überzeugen als ich.',
    block: 'confirm',
    entryId: 'boundary',
    proposal: BOUNDARY_PROPOSAL,
    closing: 'Nehmen wir das als eure Abgrenzung?',
  })
}

/** 7: die Konfidenz-Weiche — erst, wenn alle vier bestätigt sind. */
const gateOptions = [
  { id: 'fits', label: 'Passt' },
  { id: 'almost', label: 'Fast — eine Sache stört' },
  { id: 'restart', label: 'Nochmal von vorn', tone: 'quiet' as const },
]
const chapterDone = ref(false)
let gateOpen = false

function maybeGate(): void {
  if (gateOpen || !allConfirmed.value) return
  gateOpen = true
  push({
    role: 'george',
    text: 'Alle vier Entscheidungen stehen — und sie stützen sich gegenseitig: das fehlende Brot, der Purpose, die Kante gegen die Kette und ein Satz, an dem man euch messen kann.',
    question: 'Bevor wir zu den Werten gehen: Sitzt dieses Kapitel?',
    block: 'gate',
  })
}

function pickGate(turn: Turn, id: string): void {
  if (chapterDone.value) return
  turn.choice = id
  /* „Passt" und „Fast" LASSEN die Chips stehen: die getroffene Wahl trägt den
   * grünen Ring und bleibt im Verlauf lesbar. Nur der Weg zurück räumt sie
   * weg — dort beginnt eine neue Runde, und eine alte Wahl daneben wäre eine
   * Auskunft, die nicht mehr stimmt. */
  if (id === 'fits') {
    chapterDone.value = true
    pulseSave()
    push({
      role: 'george',
      text: 'Gut. Bei den Werten frage ich nach Momenten, nicht nach Adjektiven — Milo aus meinem Team hat eure Antworten dafür schon vorsortiert. Euer Purpose liegt uns vor, wir fangen nicht bei null an.',
      block: 'done',
    })
    return
  }
  if (id === 'almost') {
    push({
      role: 'george',
      text: 'Dann sag mir die eine Sache. Wir machen sie auf, bevor wir weiterziehen — ein Kapitel, das man später wieder aufreißt, kostet mehr als zehn Minuten jetzt.',
    })
    return
  }
  consume(turn)
  gateOpen = false
  push({ role: 'user', text: 'Nochmal von vorn' })
  log.value.forEach((entry) => { entry.state = 'draft' })
  push({
    role: 'george',
    text: 'Verstanden, wir gehen es nochmal durch. Ich habe die vier Einträge rechts wieder geöffnet — gelöscht ist nichts, wir schärfen sie einzeln nach.',
  })
}

// ── Der Stand: bestätigen und korrigieren ─────────────────────────────────

function confirmEntry(id: string | undefined): void {
  const entry = id ? findEntry(id) : undefined
  if (!entry || entry.state === 'confirmed') return
  entry.state = 'confirmed'
  pulseSave()
  if (entry.id === 'origin') offerPurpose()
  maybeGate()
}

/** Korrigieren im Stand schreibt einen Zug auf die Bühne — sonst wäre der
 *  Klick eine stille Zustandsänderung, und das Gespräch hätte sie verpasst. */
function reviseEntry(entry: LogEntry): void {
  entry.state = 'draft'
  /* Ein korrigierter Eintrag macht das Kapitel wieder auf — auch ein
   * abgeschlossenes: sonst stünde in der Leiste ein Haken über einem
   * Kapitel, in dem gerade wieder etwas offen ist. */
  gateOpen = false
  chapterDone.value = false
  pulseSave()
  push({
    role: 'george',
    text: `Gut, dass du das nochmal aufmachst — besser jetzt als im Brand Book. Sag mir, was an „${entry.label}" nicht sitzt, dann formulieren wir es neu.`,
  })
}

// ── Rahmen: Leiste, Fortschritt, Speicher-Zustand ─────────────────────────

/* Die Leiste ist die abgenommene: Context abgeschlossen, Purpose · Vision ·
 * Mission aktiv, der Rest offen bzw. gesperrt. Nach dem Kapitelabschluss
 * zieht sie nach (dasselbe Muster wie /brand/demo/werte). */
const railLayers = computed(() => demoRail.map(layer => (layer.id === 'foundation' && layer.steps
  ? {
      ...layer,
      steps: layer.steps.map((step) => {
        if (step.id === 'pvm') return { ...step, state: (chapterDone.value ? 'done' : 'active') as const }
        if (step.id === 'values') return { ...step, state: 'open' as const }
        return step
      }),
    }
  : layer)))

const doneDecisions = computed(() => 6 + (chapterDone.value ? CHAPTER_TOTAL : confirmedCount.value))
/* Runde 16 (David): dreizeiliger Fuß — Titel/Prozent, Balken, Zähler/Zeit. */
const progressCount = computed(() => `${doneDecisions.value}/21`)
const progressPct = computed(() => Math.round((doneDecisions.value / 21) * 100))

/* Runde 20 (David): die Nav-Spalte ist über den Bühnen-Balken einklappbar. */
const railCollapsed = ref(false)
/* Runde 33 (David): dito die Stand-Spalte — Toggle rechts im Balken. */
const standCollapsed = ref(false)

const syncState = ref<'saving' | 'offline' | 'conflict' | null>(null)
let syncTimer: ReturnType<typeof setTimeout> | undefined
function pulseSave(): void {
  syncState.value = 'saving'
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { syncState.value = null }, 1200)
}
onBeforeUnmount(() => clearTimeout(syncTimer))
</script>

<template>
  <!-- Runde 11+14 (David, 2026-09-02): der EINSTIEG „Euer Branding" (Karte
       mit Score vorn) wohnt unten rechts in der Stand-Spalte; der
       GESAMT-FORTSCHRITT (n von 21 · Zeit · Prozent + Balken) bleibt unten
       links in der Leiste. Ohne progress-to/score an BwWorkspace rendert der
       Rail-Fuß genau nur diese Zahlen. -->
  <!-- Runde 16 (David): Leiste im Nuxt-UI-Sidebar-Muster (GdSidebar) — der
       Switcher wohnt oben in der Sidebar, die Topbar ist ganz aus; den
       Sync-Zustand zeigt die Sidebar. Fuß: dreizeilig. -->
  <!-- Runde 17 (David): Nuxt-UI-Standardabstände in der Sidebar-Spalte
       (Body px-4/py-2 laut DashboardSidebar-Theme) statt des 2rem-Gutters. -->
  <!-- Runde 31 (David): der Gesamtfortschritt wohnt wieder unten RECHTS beim
       Euer-Branding-Button — die Leiste ist reine Navigation (railFooter aus). -->
  <BwWorkspace
    :progress-pct="progressPct" content-locale="de" :locale-in-topbar="false"
    :topbar="false" :rail-footer="false"
    rail-width="300px" stage-width="72rem" :rail-collapsed="railCollapsed" :george-collapsed="standCollapsed"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <!-- LINKS: die Sidebar im Nuxt-UI-Muster (Runde 16) — Switcher oben,
         einklappbare Bereiche, Sync-Zustand unten. Der frühere Topbar-
         Switcher (BwBrandSwitcher) entfällt mit der Topbar. -->
    <template #rail>
      <GdSidebar :layers="railLayers" :sync-state="syncState" />
    </template>

    <!-- MITTE: die Bühne IST das Gespräch (Davids Revision). Verlauf unten
         verankert — neue Züge schieben den Verlauf nach oben.
         Runde 13 (David): die Bühne hat KEINEN Kopf mehr — „Gespräch mit
         George · Markenberater" (samt Info-Knopf) wohnt jetzt im Stand-Kopf
         rechts. Damit entfallen auch der klebende Papier-Schatten und der
         1px-Trenner samt Kanten-Abgleich aus R4–R7: es gibt links nichts
         mehr, das auf einer Höhe sitzen müsste. -->
    <!-- Runde 20+20b (David): FESTER heller Balken über dem Gespräch mit
         1px-Linie darunter, volle Spaltenbreite (eigene Zone über dem
         Scroller, s. BwWorkspace) — links das Einklapp-Icon für die
         Nav-Spalte, daneben die zweizeilige Ortsangabe. Er ersetzt die
         Ortsangaben, die bis Runde 19 im Stand-Kopf standen. -->
    <!-- Runde 20e (David): Innenmaße nach UDashboardNavbar — gap-1.5,
         Toggle in Standard-Buttongröße, Titel font-semibold + truncate. -->
    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="railCollapsed ? 'Navigation einblenden' : 'Navigation ausblenden'"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <!-- Runde 34 (David): die Bereichs-Zeile in Versalien. -->
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">Brand Foundation</p>
          <p class="truncate font-semibold">Purpose, Vision & Mission</p>
        </div>
        <!-- Runde 33 (David): das Gegenstück zum Nav-Toggle — klappt die
             Stand-Spalte rechts ein und aus (Icon gespiegelt). -->
        <UButton
          size="sm" color="neutral" variant="ghost" class="ml-auto"
          icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
          :aria-label="standCollapsed ? 'Stand einblenden' : 'Stand ausblenden'"
          @click="standCollapsed = !standCollapsed"
        />
      </div>
    </template>

    <template #default>
      <div class="flex flex-col">
        <!-- Der Vera-Layer: alles über den Berater, ohne die Bühne zu verlassen.
             Geöffnet seit Runde 20 über Klick auf Georges Avatar im Gespräch. -->
        <div
          v-if="veraInfoOpen" class="fixed inset-0 z-50 flex items-center justify-center p-6"
          style="background: color-mix(in oklab, var(--bw-ink) 40%, transparent)"
          @click.self="veraInfoOpen = false"
        >
          <div class="w-full max-w-md rounded-2xl p-7" style="background: var(--bw-paper)">
            <div class="flex items-center gap-3">
              <BwGeorgeAvatar alt="George" />
              <span class="min-w-0 leading-tight">
                <span class="block text-base font-medium">{{ VERA_INFO.name }}</span>
                <span class="bw-label block" style="color: var(--bw-muted)">{{ VERA_INFO.role }}</span>
              </span>
              <UButton size="xs" color="neutral" variant="ghost" class="ml-auto rounded-full" icon="i-ph-x" aria-label="Schließen" @click="veraInfoOpen = false" />
            </div>
            <p class="bw-doc-text mt-4">{{ VERA_INFO.desc }}</p>
            <ul class="mt-2 space-y-1">
              <li v-for="member in VERA_INFO.team" :key="member" class="flex gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"><span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ member }}</li>
            </ul>
            <p class="bw-label mt-4" style="color: var(--bw-muted)">Typische Frage</p>
            <p class="mt-1 text-sm italic">{{ VERA_INFO.asks }}</p>
            <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ VERA_INFO.personal }}</p>
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-7 pb-4">

          <div
            v-for="turn in turns" :key="turn.id"
            class="bw-msg" :class="turn.role === 'user' ? 'bw-msg--user' : ''"
          >
            <!-- Runde 20 (David): der Avatar IST der Weg zu Georges
                 Info-Layer — die eigene Info-Zeile im Stand ist dafür raus. -->
            <button
              v-if="turn.role === 'george'" class="flex-none self-start rounded-full"
              aria-label="Über George und sein Team" @click="veraInfoOpen = true"
            >
              <BwGeorgeAvatar size="md" alt="George" />
            </button>
            <div class="bw-msg-body">
              <p class="whitespace-pre-wrap">{{ turn.text }}</p>
              <p v-if="turn.help" class="bw-msg-help">{{ turn.help }}</p>
              <p v-if="turn.question" class="mt-2 font-medium">{{ turn.question }}</p>

              <!-- Runde 23 (David, Nuxt-UI-Chat-Template): die EINGABE wohnt
                   unten im Chat-Prompt (#stage-footer) — im Zug bleibt nur
                   der Beispiel-Ausweg, direkt unter der Frage. -->
              <div v-if="turn.block === 'answer'" class="mt-2">
                <button class="bw-label underline" style="color: var(--bw-muted)" @click="exampleOpen = !exampleOpen">
                  {{ exampleOpen ? 'Beispiel ausblenden' : 'Beispiel ansehen' }}
                </button>
                <button
                  v-if="exampleOpen" class="bw-pending mt-2 block text-left"
                  @click="draft = turn.example ?? ''"
                >
                  „{{ turn.example }}“ — Tab oder Klick übernimmt den Text ins Feld.
                </button>
              </div>

              <!-- Der Entwurfs-Moment: abgesetzte Karte im Zug, drei Wege
                   heraus — übernehmen, anpassen, nochmal mit Hinweis. -->
              <div v-else-if="turn.block === 'draft'" class="mt-3">
                <!-- Der gestrichelte Rahmen sagt „das ist ein Entwurf" und geht
                     mit der Bestätigung weg — dieselbe Regel wie in der echten
                     Werkstatt, wo er nur den EDITOR umfasst. -->
                <div :class="purposeConfirmed ? '' : 'bw-draft-frame'">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="bw-label" style="color: var(--bw-muted)">Basis: eure Ursprungsgeschichte und der Pitch aus dem Kontext</p>
                    <span class="bw-state" :class="purposeConfirmed ? 'bw-state--confirmed' : 'bw-state--draft'">
                      <UIcon :name="purposeConfirmed ? 'i-ph-check' : 'i-ph-pen-nib'" />
                      {{ purposeConfirmed ? 'Bestätigt' : 'Entwurf' }}
                    </span>
                  </div>
                  <UTextarea v-if="purposeEditing" v-model="purposeText" :rows="4" class="mt-3 w-full" />
                  <p v-else class="bw-doc-text mt-3 whitespace-pre-wrap">{{ purposeText }}</p>
                  <p v-if="purposeRound === 2" class="bw-label mt-2" style="color: var(--bw-muted)">
                    Zweite Fassung · auf deinen Hinweis „{{ purposeHintUsed }}“
                  </p>
                </div>

                <p v-if="turn.closing && !purposeConfirmed" class="mt-3 font-medium">{{ turn.closing }}</p>
                <div v-if="!purposeConfirmed" class="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <UButton
                    size="sm" color="neutral" variant="ghost" class="mr-auto rounded-full"
                    icon="i-ph-sparkle" label="Nochmal, mit Hinweis"
                    @click="hintOpen = !hintOpen"
                  />
                  <UButton
                    size="sm" color="neutral" variant="ghost" class="rounded-full"
                    icon="i-ph-pencil-simple" :label="purposeEditing ? 'Anpassen beenden' : 'Anpassen'"
                    @click="purposeEditing = !purposeEditing"
                  />
                  <button class="bw-confirm bw-confirm--open" @click="acceptPurpose">
                    <UIcon name="i-ph-check" class="size-4" />
                    Übernehmen &amp; bestätigen
                  </button>
                </div>
                <div v-if="hintOpen && !purposeConfirmed" class="mt-2 flex items-center gap-2">
                  <UInput
                    v-model="purposeHint" size="sm" class="flex-1"
                    placeholder="Hinweis — z. B. kürzer, weniger Erklärung"
                    aria-label="Hinweis für George"
                    @keydown.enter="regeneratePurpose"
                  />
                  <UButton
                    size="sm" color="neutral" variant="ghost" class="bw-send rounded-full"
                    icon="i-ph-arrow-right" aria-label="Hinweis senden"
                    :disabled="!purposeHint.trim()" @click="regeneratePurpose"
                  />
                </div>
              </div>

              <!-- Der Auswahl-Moment: Karten im Zug, Empfehlung mit Grund. -->
              <!-- Davids Korrekturrunde 3: das Antwort-MODUL nach dem
                   Claude-Desktop-Vorbild — Optionen als volle Zeilen mit
                   Titel + Begründung, Empfehlung markiert UND begründet,
                   „Sonstiges" mit eigenem Feld, Aktionen unten rechts. -->
              <div v-else-if="turn.block === 'options'" class="mt-3 rounded-2xl p-4" style="background: var(--bw-surface-hi)">
                <div class="space-y-2">
                  <button
                    v-for="option in positionOptions" :key="option.id"
                    class="block w-full rounded-xl px-4 py-3 text-left transition-shadow"
                    :style="pickedOption === option.id
                      ? 'background: var(--bw-accent-soft); box-shadow: inset 0 0 0 1.5px var(--bw-accent)'
                      : 'background: var(--bw-paper)'"
                    @click="pickedOption = option.id"
                  >
                    <span class="block text-sm font-medium">{{ option.label }}<span v-if="option.recommended" class="bw-label ml-2" style="color: var(--bw-accent)">Empfohlen</span></span>
                    <span class="mt-0.5 block text-sm" style="color: var(--bw-muted)">{{ option.description }}</span>
                    <span v-if="option.recommended && option.why" class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ option.why }}</span>
                  </button>
                  <div
                    class="rounded-xl px-4 py-3"
                    :style="pickedOption === 'own'
                      ? 'background: var(--bw-accent-soft); box-shadow: inset 0 0 0 1.5px var(--bw-accent)'
                      : 'background: var(--bw-paper)'"
                  >
                    <span class="block text-sm font-medium">Sonstiges</span>
                    <UInput
                      v-model="ownPosition" size="sm" class="mt-2 w-full"
                      placeholder="Beschreib eure Position mit eigenen Worten …"
                      @focus="pickedOption = 'own'"
                    />
                  </div>
                </div>
                <!-- Runde 39 (David): KEIN Überspringen — die Positionierung
                     ist die Kernentscheidung, hier gibt es nur Übermitteln. -->
                <div class="mt-3 flex items-center justify-end gap-2">
                  <UButton
                    color="neutral" variant="ghost" class="bw-send rounded-full" label="Übermitteln"
                    :disabled="!pickedOption || (pickedOption === 'own' && !ownPosition.trim())"
                    @click="submitPosition(turn)"
                  />
                </div>
              </div>

              <!-- Bestätigen IM ZUG — derselbe Knopf und dieselben zwei Farben
                   wie im Stand rechts (Davids „nach jeder frage confirmen"). -->
              <div v-else-if="turn.block === 'confirm'" class="mt-3">
                <div v-if="turn.entryId && findEntry(turn.entryId)" :class="entryState(turn.entryId) === 'confirmed' ? 'mb-3' : 'bw-draft-frame mb-3'">
                  <!-- Runde 37c (David): die Karte trägt die URSPRÜNGLICHE
                       Frage, auf die der Inhalt geantwortet hat — nicht die
                       Abschluss-Frage des Zugs (37 hatte die falsche). -->
                  <p class="bw-label" style="color: var(--bw-muted)">{{ turn.proposal ? 'Mein Vorschlag' : (turn.sourceQuestion ?? 'Festgehalten') }}</p>
                  <UTextarea v-if="editingEntryId === turn.entryId && entryState(turn.entryId) !== 'confirmed'" v-model="findEntry(turn.entryId)!.text" :rows="3" class="mt-2 w-full" />
                  <p v-else class="bw-doc-text mt-2 whitespace-pre-wrap">{{ findEntry(turn.entryId)!.text }}</p>
                </div>
                <p v-if="turn.closing" class="mb-2 font-medium">{{ turn.closing }}</p>
                <!-- Runde 37 (David, blau): „Korrigieren" statt „Anpassen",
                     rechtsbündig neben Bestätigen, in dessen Größe. -->
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <!-- Runde 37b: exakt die Bestätigen-Metrik (bw-confirm),
                       nur neutral und ohne Ring. -->
                  <button
                    v-if="turn.entryId && entryState(turn.entryId) !== 'confirmed'"
                    class="bw-confirm bw-confirm--ghost"
                    @click="toggleEntryEditing(turn.entryId)"
                  >
                    <UIcon name="i-ph-pencil-simple" class="size-4" />
                    {{ editingEntryId === turn.entryId ? 'Korrigieren beenden' : 'Korrigieren' }}
                  </button>
                  <button
                    class="bw-confirm"
                    :class="entryState(turn.entryId) === 'confirmed' ? 'bw-confirm--done' : 'bw-confirm--open'"
                    :disabled="entryState(turn.entryId) === 'confirmed'"
                    @click="confirmProposal(turn)"
                  >
                    <UIcon :name="entryState(turn.entryId) === 'confirmed' ? 'i-ph-check-circle-fill' : 'i-ph-check'" class="size-4" />
                    {{ entryState(turn.entryId) === 'confirmed' ? 'Bestätigt' : 'Bestätigen' }}
                  </button>
                </div>
              </div>

              <!-- Die Konfidenz-Weiche steht IM Gespräch, nicht daneben. -->
              <div v-else-if="turn.block === 'gate'" class="mt-3">
                <BwChips
                  :options="gateOptions" :selected="turn.choice ? [turn.choice] : []"
                  :show-dont-know="false" @pick="(id) => pickGate(turn, id)"
                />
              </div>

              <div v-else-if="turn.block === 'done'" class="mt-3">
                <UButton
                  color="neutral" variant="outline" class="rounded-full"
                  trailing-icon="i-ph-arrow-right" label="Weiter zu Werte" disabled
                />
                <p class="bw-msg-help">Im Klickdummy endet der Weg hier — im Produkt geht es mit den Werten weiter.</p>
              </div>

              <!-- Davids Korrekturrunde 1: bei Karten-Zügen sitzt die
                   Abschlussfrage ÜBER den Aktionen (die Frage ist die
                   Aufforderung, der Knopf die Antwort darauf) — s. die
                   Blöcke oben. Hier nur noch der Rest. -->
              <p v-if="turn.closing && turn.block !== 'draft' && turn.block !== 'confirm'" class="mt-3 font-medium">{{ turn.closing }}</p>
            </div>
          </div>

          <!-- NOCH NICHT SO WEIT: dieselbe Regel wie in der echten Werkstatt —
               die Weiche erscheint erst, wenn sie halten kann, was sie fragt. -->
          <!-- Runde 37 (David, grün): eingerückt wie die Gesprächstexte
               (Avatar 2rem + Lücke 0.65rem). -->
          <p v-if="log.length && !allConfirmed && !chapterDone" class="bw-label" style="color: var(--bw-muted); padding-left: 2.65rem">
            Noch offen: {{ openLabels.length }} von {{ CHAPTER_TOTAL }} Entscheidungen — bestätige sie rechts im Stand,
            dann schließen wir das Kapitel ab.
          </p>

          <div ref="tail" />
        </div>
      </div>
    </template>

    <!-- Runde 23+24 (David): das Chat-Prompt aus dem Nuxt-UI-Chat-Template,
         fest am unteren Rand — nur Feld und der Pfeil-nach-oben (unsere
         Return-Taste); kein Anhang, kein Modell, und seit R24 auch kein
         „Weiß ich nicht"-Knopf (das kann man tippen, gleicher Antwort-Weg).
         Ausgegraut, solange kein answer-Zug offen ist. -->
    <template #stage-footer>
      <!-- Runde 29+29c (David): keine Fokus-Markierung beim Klick — Textareas
           gelten im Browser immer als focus-visible, deshalb Outline UND den
           dunklen ring-primary per ui-Override neutralisieren (der ruhige
           helle ring-default bleibt in beiden Zuständen). -->
      <UChatPrompt
        v-model="draft" placeholder="Antwort schreiben …"
        :disabled="!activeAnswerTurn" :autofocus="false" class="w-full"
        :ui="{ root: 'has-[textarea:focus-visible]:outline-none has-[textarea:focus-visible]:ring-default' }"
        @submit="promptSubmit" @keydown.tab="promptTab"
      >
        <template #footer>
          <button
            class="bw-label underline disabled:opacity-40" style="color: var(--bw-muted)"
            :disabled="!activeAnswerTurn?.demo" @click="promptDemo"
          >
            Klickdummy: Demo-Antwort einfügen
          </button>
          <UChatPromptSubmit class="ml-auto" size="sm" color="neutral" :disabled="!activeAnswerTurn || !draft.trim()" />
        </template>
      </UChatPrompt>
    </template>

    <!-- RECHTS: der Stand. Oben der Kapitelfortschritt, darunter je
         Entscheidung ein Eintrag in Dokument-Optik mit seiner Ampel. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- Runde 27 (David): KEIN eigener Stand-Kopf mehr — der Kapitel-
             Fortschritt ist eine SEKTION im chronologischen Log, direkt
             unter Context (gleiche Zeilen-Anatomie, „n/4 bestätigt" als
             Subline). -->
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <!-- Runde 25 (David): der Log ist chronologisch — abgeschlossene
               Kapitel oben, das laufende darunter. Der Context-Kopf ist KEIN
               Knopf mehr, sondern eine ruhige Zeile: grüner Haken vorn
               (Kapitel fertig), Titel mit „10/10"-Subline darunter, hinten
               nur der Auf-/Zuklapp-Pfeil. Runde 28: IMMER eine 1px-Linie
               zwischen den Kapitel-Sektionen (gd-chapter). -->
          <div class="gd-chapter">
            <button
              class="flex w-full items-start gap-2.5 py-1 text-left"
              :aria-expanded="contextOpen" @click="contextOpen = !contextOpen"
            >
              <UIcon
                v-if="contextConfirmed === CONTEXT_TOTAL" name="i-ph-check-circle-fill"
                class="mt-0.5 size-5 flex-none" style="color: var(--bw-accent)"
              />
              <UIcon v-else name="i-ph-circle-half-fill" class="mt-0.5 size-5 flex-none" style="color: var(--bw-ink)" />
              <span class="min-w-0 flex-1 leading-tight">
                <!-- Runde 35 (David): „Kontext" wie in der Leiste — deutsch. -->
                <span class="block text-sm font-medium">Kontext</span>
                <span class="bw-label block tabular-nums" style="color: var(--bw-muted)">{{ contextConfirmed }}/{{ CONTEXT_TOTAL }}</span>
              </span>
              <UIcon
                name="i-ph-caret-down"
                class="mt-1 size-4 flex-none transition-transform" :class="contextOpen ? '' : '-rotate-90'"
                style="color: var(--bw-muted)"
              />
            </button>
            <div v-if="contextOpen" class="mt-2 space-y-3">
              <!-- Runde 25: jede Karte liest sich wie der Info-Layer —
                   Headline, Beschreibungs-Subline, DANN die Antwort;
                   „Korrigieren" erscheint erst bei Hover/Fokus (gd-fix). -->
              <!-- Karten-Weiß statt --bw-surface: seit der weiße Container weg
                   ist (R25), wäre surface unsichtbar auf der Spalten-Farbe. -->
              <div
                v-for="entry in contextLog" :key="entry.id"
                class="gd-log-card rounded-xl px-3 py-2.5" style="background: var(--bw-surface-hi)"
              >
                <p class="flex items-center gap-2 text-sm font-medium">
                  <span
                    class="bw-dot" :class="entry.state === 'confirmed' ? 'bw-dot--confirmed' : 'bw-dot--draft'"
                    :title="entry.state === 'confirmed' ? 'Bestätigt' : 'Noch nicht bestätigt'"
                    :aria-label="entry.state === 'confirmed' ? 'Bestätigt' : 'Noch nicht bestätigt'"
                  >
                    <UIcon v-if="entry.state === 'confirmed'" name="i-ph-check-bold" class="size-2.5" />
                  </span>
                  <span class="min-w-0 truncate">{{ entry.label }}</span>
                </p>
                <p v-if="entry.note" class="mt-0.5 text-xs" style="color: var(--bw-muted)">{{ entry.note }}</p>
                <p class="bw-doc-text mt-1.5 whitespace-pre-wrap" style="font-size: 0.875rem; line-height: 1.5">{{ entry.text }}</p>
                <div class="mt-1 flex justify-end">
                  <UButton
                    v-if="entry.state === 'confirmed'"
                    size="xs" color="neutral" variant="ghost" class="gd-fix rounded-full"
                    icon="i-ph-pencil-simple" label="Korrigieren" @click="reviseEntry(entry)"
                  />
                  <button v-else class="bw-confirm bw-confirm--open bw-confirm--xs" @click="confirmEntry(entry.id)">
                    <UIcon name="i-ph-check" class="size-3.5" /> Bestätigen
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Runde 27: das LAUFENDE Kapitel als eigene Sektion unter Context —
               Halbmond solange offen, grüner Haken nach dem Abschluss;
               jeder Eintrag erscheint, sobald er im Gespräch fällt. -->
          <div class="gd-chapter">
            <button
              class="flex w-full items-start gap-2.5 py-1 text-left"
              :aria-expanded="pvmOpen" @click="pvmOpen = !pvmOpen"
            >
              <UIcon
                v-if="chapterDone" name="i-ph-check-circle-fill"
                class="mt-0.5 size-5 flex-none" style="color: var(--bw-accent)"
              />
              <UIcon v-else name="i-ph-circle-half-fill" class="mt-0.5 size-5 flex-none" style="color: var(--bw-ink)" />
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block text-sm font-medium">Purpose, Vision & Mission</span>
                <span class="bw-label block tabular-nums" style="color: var(--bw-muted)">{{ confirmedCount }}/{{ CHAPTER_TOTAL }} bestätigt</span>
              </span>
              <UIcon
                name="i-ph-caret-down"
                class="mt-1 size-4 flex-none transition-transform" :class="pvmOpen ? '' : '-rotate-90'"
                style="color: var(--bw-muted)"
              />
            </button>
            <div v-if="pvmOpen" class="mt-2 space-y-3">
          <div
            v-for="entry in log" :key="entry.id"
            class="gd-log-card rounded-2xl px-4 py-3" style="background: var(--bw-surface-hi)"
          >
            <p class="flex items-center gap-2 text-sm font-medium">
              <span
                class="bw-dot" :class="entry.state === 'confirmed' ? 'bw-dot--confirmed' : 'bw-dot--draft'"
                :title="entry.state === 'confirmed' ? 'Bestätigt' : 'Noch nicht bestätigt'"
                :aria-label="entry.state === 'confirmed' ? 'Bestätigt' : 'Noch nicht bestätigt'"
              >
                <UIcon v-if="entry.state === 'confirmed'" name="i-ph-check-bold" class="size-2.5" />
              </span>
              <span class="min-w-0 truncate">{{ entry.label }}</span>
            </p>
            <p v-if="entry.note" class="mt-0.5 text-xs" style="color: var(--bw-muted)">{{ entry.note }}</p>
            <UTextarea v-if="editingEntryId === entry.id && entry.state !== 'confirmed'" v-model="entry.text" :rows="3" class="mt-1.5 w-full" />
            <p v-else class="bw-doc-text mt-1.5 whitespace-pre-wrap" style="font-size: 0.9rem; line-height: 1.55">{{ entry.text }}</p>
            <div class="mt-2 flex items-center justify-end gap-2">
              <UButton
                v-if="entry.state === 'confirmed'"
                size="xs" color="neutral" variant="ghost" class="gd-fix rounded-full"
                icon="i-ph-pencil-simple" label="Korrigieren" @click="reviseEntry(entry)"
              />
              <!-- Runde 36 (David): „Korrigieren" statt „Anpassen", beide
                   rechtsbündig, Bestätigen in derselben Größe (--xs). -->
              <template v-else>
                <UButton
                  size="xs" color="neutral" variant="ghost" class="rounded-full"
                  icon="i-ph-pencil-simple" :label="editingEntryId === entry.id ? 'Korrigieren beenden' : 'Korrigieren'"
                  @click="toggleEntryEditing(entry.id)"
                />
                <button class="bw-confirm bw-confirm--open bw-confirm--xs" @click="editingEntryId = null; confirmEntry(entry.id)">
                  <UIcon name="i-ph-check" class="size-3.5" /> Bestätigen
                </button>
              </template>
            </div>
          </div>
            </div>
          </div>
        </div>

        <!-- Runde 31+35 (David): unten rechts NUR noch der dreizeilige
             Gesamtfortschritt — der „Euer Branding"-Einstieg wohnt jetzt
             an der Kachel auf der Brandings-Übersicht (gesperrt bis zum
             Foundation-Abschluss). -->
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="progressPct" progress-title="Gesamtfortschritt"
            :progress-count="progressCount" progress-time="ca. 30 Min"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>

<style scoped>
/* Davids Korrekturrunde 4: beide Kapitel-Linien 1px, durchgezogen, eckig. */
.gd-line { height: 1px; border-radius: 0; }
.gd-line .bw-chapter-progress-fill { border-radius: 0; }
/* Runde 25 (David): „Korrigieren" ruht, bis die Log-Karte Hover/Fokus hat —
   Bestätigen bleibt immer sichtbar (offene Entscheidung braucht den Weg). */
.gd-fix { opacity: 0; transition: opacity 120ms; }
.gd-log-card:hover .gd-fix, .gd-log-card:focus-within .gd-fix { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .gd-fix { transition: none; } }
/* Runde 28 (David): IMMER eine 1px-Linie zwischen den Kapitel-Sektionen. */
.gd-chapter { padding-block: 0.625rem; }
.gd-chapter + .gd-chapter { border-top: 1px solid var(--bw-line); }
</style>
