<script setup lang="ts">
import type { EditorToolbarItem, TabsItem } from '@nuxt/ui'
import type {
  InsightsLocale,
  InsightsPost,
  InsightsPostEdit,
  InsightsReviewIssue,
  InsightsState,
} from '../../shared/insightsPost'
import {
  INSIGHTS_FORMATS,
  INSIGHTS_LOCALES,
  INSIGHTS_QUOTE_MAX,
  INSIGHTS_STATES,
  INSIGHTS_TOPICS,
  INSIGHTS_TRANSITIONS,
  insightsDuelFactSchema,
  insightsIsPublic,
  insightsMethodologyLinked,
  insightsRankingSchema,
  insightsReadingMinutes,
  insightsReviewIssues,
} from '../../shared/insightsPost'
import {
  INSIGHTS_BRIEF_MAX,
  INSIGHTS_DRAFT_WORDS_DEFAULT,
  INSIGHTS_DRAFT_WORDS_MAX,
  INSIGHTS_DRAFT_WORDS_MIN,
} from '../../shared/insightsPrompts'
import { INSIGHTS_NEWSLETTER_INTRO_MAX } from '../../shared/insightsNewsletter'
import type {
  InsightsBrandListItem,
  InsightsEvidenceResponse,
  InsightsNewsletterSendStatusResponse,
} from '../../shared/types/insightsApi'
import { bodyToSave as decideBodyToSave } from '../../../core/shared/editorBody'
import { insightsDay } from '../utils/insightsFormat'
import { createInsightsBrandSchema } from '../utils/insightsForms'

/**
 * DER REDAKTIONS-EDITOR (§9.4) — seit BI1 I2 die echte Fläche.
 *
 * Die FORM ist die des freigegebenen Prototyps I0 und bleibt es: links Kopf,
 * Sprach-Reiter und Quellen, rechts die Prüfregeln und die Übergänge. Was
 * dazugekommen ist, ist alles, was ein Klickdummy nicht haben konnte —
 * Speichern, echte Belege, ein Modell, ein Server-Gate.
 *
 * ── DIESE KOMPONENTE SPRICHT MIT KEINER ROUTE ────────────────────────────
 * Sie bekommt einen Beitrag herein und meldet Absichten hinaus (`save`,
 * `changeState`, `checkEvidence`, `translate`, `draft`, `createBrand`). Alles
 * Ladende, alle Fehlercodes und alle Toasts gehören der SEITE. Zwei Gründe:
 * der Prototyp im `.playground` mountet dieselbe Komponente ohne Server, und
 * eine Komponente, die selbst holt, kann man in keinem zweiten Zusammenhang
 * mehr benutzen.
 *
 * ── VIER DINGE, DIE MAN HIER NICHT „VEREINFACHEN" DARF ───────────────────
 *  1. **`bodyToSave` je Sprache** (`core/shared/editorBody.ts`). Öffnen und
 *     Speichern OHNE Tastendruck darf nichts ändern — Tiptap normalisiert beim
 *     Serialisieren, und ohne diesen Riegel meldete jeder Blick in einen
 *     Beitrag eine Bearbeitung.
 *  2. **Der Werkzeug-Vorrat ist an `core/shared/markdown.ts` gekoppelt.** Der
 *     Parser kann fett/kursiv/Code/h2+h3/Listen/Link/Zitat/Codeblock — mehr
 *     nicht. `strike: false`, `enableInputRules`/`enablePasteRules` als
 *     ERLAUBNISLISTE (fail-closed), `transformPastedHTML` gegen die
 *     Trennlinie, die `UEditor` unbedingt anhängt.
 *  3. **`gfm: false` beim LESEN.** Mit Nuxt UIs Vorgabe parst `marked`
 *     `~~alt~~` als Durchstreichung — die Marke gibt es hier nicht, und ein
 *     Bestands-Beitrag verlöre die vier Zeichen beim blossen AUFSCHLAGEN.
 *  4. **Die zwei Sprachspalten werden EINZELN geschrieben.** Ein `v-model` auf
 *     einen berechneten Schlüssel wäre kürzer und schriebe beim Reiterwechsel
 *     in die falsche Spalte, solange Vue den alten Wert noch hält.
 */
const props = defineProps<{
  post: InsightsPost
  /** Die Marken-Zeilen zur Auswahl (Prüfregel 6 zählt nur die nicht entfernten). */
  brands: readonly InsightsBrandListItem[]
  knownBrandIds: readonly string[]
  /** Die offenen Prüfpunkte aus der LETZTEN Server-Antwort. */
  issues: readonly InsightsReviewIssue[]
  /** Die Beleg-Ampel je Quellen-Index — leer heisst „noch nicht geprüft". */
  evidence?: Readonly<Record<number, InsightsEvidenceResponse>>
  saving?: boolean
  translating?: boolean
  drafting?: boolean
  transitioning?: boolean
  /** Welche Quelle gerade geprüft wird (Index), sonst `null`. */
  checkingIndex?: number | null
  /**
   * DER NEWSLETTER-STAND (I5b) — `null` heisst „das Panel gibt es hier nicht".
   *
   * Genau zwei Fälle führen darauf, und beide gehören der SEITE: der Riegel
   * `pukalani.insights.newsletter.enabled` ist zu, oder der Stand ist noch
   * nicht geladen. Der Editor fragt nichts nach (s. Kopf) — er zeigt, was
   * hereinkommt.
   */
  newsletter?: InsightsNewsletterSendStatusResponse | null
  /** Läuft gerade ein Stapel-Versand? */
  newsletterSending?: boolean
  /** Der Balken: wie viele von wie vielen (nur während des Versands). */
  newsletterProgress?: { sent: number, total: number } | null
}>()

const emit = defineEmits<{
  save: [InsightsPostEdit]
  changeState: [InsightsState]
  checkEvidence: [number]
  translate: []
  draft: [{ brief: string, targetWords: number }]
  createBrand: [{ name: string, homepage: string, industry: string }]
  sendNewsletter: [{ introDe: string, introEn: string }]
}>()

const { t, locale } = useI18n()

// ── Der Entwurf, an dem gearbeitet wird ────────────────────────────────────

/** Eine tiefe KOPIE: die Prop gehört der Seite, und ein `sources`-Eintrag,
 *  den beide teilen, änderte den Bestand ohne Speichern. */
function clone(post: InsightsPost): InsightsPost {
  return {
    ...post,
    slugHistory: [...post.slugHistory],
    topics: [...post.topics],
    sources: post.sources.map(source => ({ ...source })),
    brandRefs: post.brandRefs.map(ref => ({ ...ref })),
    facts: post.facts.map(fact => ({ ...fact })),
    ranking: post.ranking ? { ...post.ranking, entries: post.ranking.entries.map(entry => ({ ...entry })) } : null,
  }
}

const draft = reactive<InsightsPost>(clone(props.post))

/**
 * Das Fakten-Feld steht HIER OBEN, obwohl sein Abschnitt weiter unten liegt:
 * der `watch` auf `props.post` schreibt es mit, und eine `const` weiter unten
 * wäre in dem Moment noch in der zeitlichen Totzone. Heute liefe das gut
 * (`watch` ruft ohne `immediate` nicht sofort), aber die Sicherung soll nicht
 * an dieser Kenntnis hängen.
 */
const factsText = ref('')
const factsError = ref('')

/**
 * „Öffnen darf nichts ändern": `pristineBody` ist der Text aus der API,
 * `normalizedBody` die erste Fassung, die der Editor von sich aus schreibt.
 * Warum das nötig ist: `core/shared/editorBody.ts`.
 */
const pristineBody = reactive<Record<InsightsLocale, string>>({ de: props.post.bodyDe, en: props.post.bodyEn })
const normalizedBody = reactive<Record<InsightsLocale, string | null>>({ de: null, en: null })

for (const code of INSIGHTS_LOCALES) {
  watch(() => (code === 'de' ? draft.bodyDe : draft.bodyEn), (value) => {
    if (normalizedBody[code] === null && value !== pristineBody[code]) normalizedBody[code] = value
  })
}

function bodyToSave(code: InsightsLocale): string {
  return decideBodyToSave({
    current: code === 'de' ? draft.bodyDe : draft.bodyEn,
    pristine: pristineBody[code],
    normalized: normalizedBody[code],
  })
}

/** Kommt ein neuer Stand vom Server (gespeichert, übersetzt, entworfen),
 *  beginnt der Editor von vorn — sonst stünde die alte Fassung über der neuen. */
watch(() => props.post, (next) => {
  Object.assign(draft, clone(next))
  pristineBody.de = next.bodyDe
  pristineBody.en = next.bodyEn
  normalizedBody.de = null
  normalizedBody.en = null
  factsText.value = factsAsText()
  factsError.value = ''
})

// ── Kopfzeile ──────────────────────────────────────────────────────────────

const formatItems = computed(() => INSIGHTS_FORMATS.map(format => ({ label: t(`insights.format.${format}`), value: format })))
const localeItems = computed(() => INSIGHTS_LOCALES.map(code => ({
  label: t(`insights.list.locale${code === 'de' ? 'De' : 'En'}`),
  value: code,
})))
const topicItems = computed(() => INSIGHTS_TOPICS.map(topic => ({ label: topic.label, value: topic.key })))

const stateItems = computed(() => INSIGHTS_STATES.map(state => ({ label: t(`insights.state.${state}`), value: state })))

/** Lesezeit der GRUNDFASSUNG — dieselbe Rechnung, die der Server beim
 *  Speichern anstellt (§9.3). Hier ist sie nur die Vorschau darauf. */
const readingMinutes = computed(() => insightsReadingMinutes(draft.baseLocale === 'de' ? draft.bodyDe : draft.bodyEn))

// ── Zwei Sprach-Reiter ─────────────────────────────────────────────────────

const otherLocale = computed<InsightsLocale>(() => (draft.baseLocale === 'de' ? 'en' : 'de'))
const activeTab = ref<'base' | 'translation'>('base')
const tabs = computed<TabsItem[]>(() => [
  { label: `${t('insights.editor.tabBase')} · ${t(`insights.list.locale${draft.baseLocale === 'de' ? 'De' : 'En'}`)}`, value: 'base' },
  { label: `${t('insights.editor.tabTranslation')} · ${t(`insights.list.locale${otherLocale.value === 'de' ? 'De' : 'En'}`)}`, value: 'translation' },
])

const editing = computed<InsightsLocale>(() => (activeTab.value === 'base' ? draft.baseLocale : otherLocale.value))

const titleValue = computed({
  get: () => (editing.value === 'de' ? draft.titleDe : draft.titleEn),
  set: (value: string) => { if (editing.value === 'de') draft.titleDe = value; else draft.titleEn = value },
})
const dekValue = computed({
  get: () => (editing.value === 'de' ? draft.dekDe : draft.dekEn),
  set: (value: string) => { if (editing.value === 'de') draft.dekDe = value; else draft.dekEn = value },
})
const bodyValue = computed({
  get: () => (editing.value === 'de' ? draft.bodyDe : draft.bodyEn),
  set: (value: string) => { if (editing.value === 'de') draft.bodyDe = value; else draft.bodyEn = value },
})

// ── Der Editor selbst (s. Kopf, Punkte 2 und 3) ────────────────────────────

const toolbarItems: EditorToolbarItem[] = [
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b' },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic' },
  { kind: 'mark', mark: 'code', icon: 'i-ph-code-simple' },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two' },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three' },
  { kind: 'bulletList', icon: 'i-ph-list-bullets' },
  { kind: 'orderedList', icon: 'i-ph-list-numbers' },
  { kind: 'link', icon: 'i-ph-link' },
  { kind: 'blockquote', icon: 'i-ph-quotes' },
  { kind: 'codeBlock', icon: 'i-ph-code' },
]
const editorStarterKit = { strike: false as const, heading: { levels: [2, 3] as (2 | 3)[] } }
const editorMarkdown = { markedOptions: { gfm: false } } as const
/** Erlaubnisliste, fail-closed: eine neue Extension ist damit automatisch aus. */
const RULE_EXTENSIONS = ['bold', 'italic', 'code', 'codeBlock', 'heading', 'bulletList', 'orderedList', 'blockquote', 'link']
/** Der zweite Weg zu einer Trennlinie — `UEditor` hängt `HorizontalRule`
 *  unbedingt an, der Parser kennt sie nicht. */
const editorProps = { transformPastedHTML: (html: string) => html.replace(/<hr\b[^>]*>/gi, '') }

// ── Quellen ────────────────────────────────────────────────────────────────

/**
 * DIE ZEILEN-OBERFLÄCHE LIEGT SEIT DEM MARKEN-FORMULAR IN
 * `InSourcesEditor` — dieselbe `sources`-Form trägt auch ein Markenprofil
 * (§9.3), und zwei abgeschriebene Formulare wären zwei Belegpflichten, von
 * denen die jüngere hinterherhinkt.
 *
 * WAS HIER BLEIBT, IST DAS ENTFERNEN — und die Beleg-Zeiger MITZUZIEHEN.
 * `facts[].sourceIndex` zeigt auf eine POSITION. Löscht man Quelle 2, zeigt
 * jeder Beleg ab 3 danach auf die falsche Quelle — und zwar unsichtbar, weil
 * die Zahl weiter gültig ist. Zeiger auf genau diese Quelle werden ungültig
 * gesetzt (`-1`), damit Prüfregel 3 sie zeigt.
 */
function removeSource(index: number): void {
  draft.sources.splice(index, 1)
  for (const fact of draft.facts) {
    if (fact.sourceIndex === index) fact.sourceIndex = -1
    else if (fact.sourceIndex > index) fact.sourceIndex -= 1
  }
  factsText.value = factsAsText()
}

// ── Marken ─────────────────────────────────────────────────────────────────

const brandItems = computed(() => props.brands.map(brand => ({
  label: brand.state === 'removed' ? `${brand.name} · ${t('insights.editor.brandRemoved')}` : brand.name,
  value: brand.id,
})))

const selectedBrandIds = computed({
  get: () => draft.brandRefs.map(ref => ref.brandId),
  set: (ids: string[]) => {
    // Bestehende Verweise BEHALTEN: sie tragen `checkId`, `libraryKey` und
    // `publicationId`, und ein Neuaufbau der Liste würde sie stillschweigend
    // verlieren.
    const existing = new Map(draft.brandRefs.map(ref => [ref.brandId, ref]))
    draft.brandRefs = ids.map(id => existing.get(id) ?? { brandId: id, checkId: '', libraryKey: '', publicationId: '' })
  },
})

const brandDialogOpen = ref(false)
const brandForm = reactive({ name: '', homepage: '', industry: '' })
const brandSchema = computed(() => createInsightsBrandSchema(t))

function submitBrand(): void {
  emit('createBrand', { name: brandForm.name, homepage: brandForm.homepage, industry: brandForm.industry })
  brandDialogOpen.value = false
  brandForm.name = ''
  brandForm.homepage = ''
  brandForm.industry = ''
}

// ── Fakten (Duell-Zeilen bzw. Ranking) ─────────────────────────────────────

/**
 * IN I2 BEWUSST EIN JSON-FELD, kein Zeilen-Editor.
 *
 * Die beiden Faktenformen (§9.3) sind der aufwendigste Teil der Oberfläche und
 * betreffen zwei der vier Formate. Ein halbfertiger Zeilen-Editor wäre teurer
 * als dieses Feld und schlechter als der richtige — der kommt, wenn das erste
 * echte Duell und das erste Ranking geschrieben sind und man weiss, woran man
 * sich stösst. Was NICHT fehlt, ist die Prüfung: das Feld geht durch dasselbe
 * Zod-Schema wie der Server, und ungültiges JSON wird nicht übernommen.
 */
function factsAsText(): string {
  if (draft.format === 'ranking') return draft.ranking ? JSON.stringify(draft.ranking, null, 2) : ''
  return draft.facts.length ? JSON.stringify(draft.facts, null, 2) : ''
}

factsText.value = factsAsText()

function applyFacts(): void {
  factsError.value = ''
  const raw = factsText.value.trim()
  if (!raw) {
    draft.facts = []
    draft.ranking = null
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    factsError.value = t('insights.editor.factsInvalidJson')
    return
  }
  if (draft.format === 'ranking') {
    const result = insightsRankingSchema.safeParse(parsed)
    if (!result.success) {
      factsError.value = t('insights.editor.factsInvalid')
      return
    }
    draft.ranking = result.data
    draft.facts = []
    return
  }
  const result = insightsDuelFactSchema.array().safeParse(parsed)
  if (!result.success) {
    factsError.value = t('insights.editor.factsInvalid')
    return
  }
  draft.facts = result.data
  draft.ranking = null
}

const showFacts = computed(() => draft.format === 'duel' || draft.format === 'ranking')

// ── KI-Entwurf ─────────────────────────────────────────────────────────────

const brief = ref('')
const targetWords = ref(INSIGHTS_DRAFT_WORDS_DEFAULT)

function runDraft(): void {
  if (!brief.value.trim()) return
  emit('draft', { brief: brief.value.trim(), targetWords: targetWords.value })
}

// ── Prüfregeln ─────────────────────────────────────────────────────────────

/**
 * DIE FORMREGELN RECHNEN LOKAL MIT — am Entwurf, nicht erst nach dem Speichern.
 *
 * Das Schema des Servers weist eine Quelle ohne Herausgeber schon beim
 * SPEICHERN ab (§9.3: die Prüfung sitzt im Schema UND im Übergang). Käme die
 * Liste nur aus der Server-Antwort, stünde Regel 2 nie darin — der Redakteur
 * sähe einen 400 und keinen Grund (im Klick-Beweis I2 genau so). Deshalb
 * laufen die puren Regeln (Herausgeber, Datum, Lizenz, Beleg-Zeiger, Marken-
 * Zeile, Methodik-Link) hier über den ENTWURF; vom Server kommen nur die zwei
 * Punkte dazu, die ein Browser nicht rechnen kann: der Beleg-Abruf und der
 * Herabsetzungs-Riegel. Beide Listen zusammen, ohne Doppelung.
 */
const SERVER_ONLY_CODES = new Set<InsightsReviewIssue['code']>(['quote_not_grounded', 'disparagement'])

const localIssues = computed<InsightsReviewIssue[]>(() => insightsReviewIssues(draft, {
  knownBrandIds: props.knownBrandIds,
  methodologyLinked: insightsMethodologyLinked(draft),
}))

const shownIssues = computed<InsightsReviewIssue[]>(() => [
  ...localIssues.value,
  ...props.issues.filter(issue => SERVER_ONLY_CODES.has(issue.code)),
])

const ISSUE_KEY: Record<string, string> = {
  quote_too_long: 'insights.editor.issue.quoteTooLong',
  quote_not_grounded: 'insights.editor.issue.quoteNotGrounded',
  source_missing_publisher: 'insights.editor.issue.sourceMissingPublisher',
  source_missing_date: 'insights.editor.issue.sourceMissingDate',
  source_missing_license: 'insights.editor.issue.sourceMissingLicense',
  fact_without_source: 'insights.editor.issue.factWithoutSource',
  disparagement: 'insights.editor.issue.disparagement',
  score_without_methodology: 'insights.editor.issue.scoreWithoutMethodology',
  brand_without_entity: 'insights.editor.issue.brandWithoutEntity',
}

/**
 * Der Herabsetzungs-Riegel liefert als `detail` seinen GRUND
 * (`competitor_name` · `competitor_domain` · `disparagement`), keinen
 * Textausschnitt — der Redakteur bekäme sonst den rohen Schlüssel zu lesen
 * (im Klick-Beweis I2 stand dort wörtlich `competitor_domain`). Bekannte
 * Gründe werden übersetzt, alles andere bleibt, was es ist.
 */
const REASON_KEY: Record<string, string> = {
  competitor_name: 'insights.editor.issue.reason.competitorName',
  competitor_domain: 'insights.editor.issue.reason.competitorDomain',
  disparagement: 'insights.editor.issue.reason.disparagement',
}

function issueDetail(issue: InsightsReviewIssue): string {
  const detail = issue.detail ?? ''
  if (issue.code !== 'disparagement') return detail
  const key = REASON_KEY[detail]
  return key ? t(key) : detail
}

function issueText(issue: InsightsReviewIssue): string {
  return t(ISSUE_KEY[issue.code] ?? 'insights.editor.issue.quoteNotGrounded', { max: INSIGHTS_QUOTE_MAX, detail: issueDetail(issue) })
}

function issueWhere(issue: InsightsReviewIssue): string {
  if (!issue.at) return ''
  return t(`insights.editor.at.${issue.at.kind}`, { number: issue.at.index + 1 })
}

// ── Zustands-Übergänge ─────────────────────────────────────────────────────

/** Genau die Knöpfe, die die Tabelle im Vertrag erlaubt — eine zweite Liste
 *  hier wäre die zweite Wahrheit über denselben Weg. */
const transitions = computed<InsightsState[]>(() => [...(INSIGHTS_TRANSITIONS[props.post.state] ?? [])])

function transitionLabel(to: InsightsState): string {
  const from = props.post.state
  if (to === 'review') return t('insights.editor.toReview')
  if (to === 'published') return t('insights.editor.publish')
  if (to === 'updated') return t('insights.editor.markUpdated')
  return from === 'review' ? t('insights.editor.backToDraft') : t('insights.editor.unpublish')
}

function transitionIcon(to: InsightsState): string {
  if (to === 'review') return 'i-ph-arrow-right'
  if (to === 'published') return 'i-ph-check'
  if (to === 'updated') return 'i-ph-arrows-clockwise'
  return 'i-ph-arrow-u-left-up'
}

// ── Speichern ──────────────────────────────────────────────────────────────

function editPayload(): InsightsPostEdit {
  return {
    format: draft.format,
    slug: draft.slug,
    baseLocale: draft.baseLocale,
    titleDe: draft.titleDe,
    titleEn: draft.titleEn,
    dekDe: draft.dekDe,
    dekEn: draft.dekEn,
    bodyDe: bodyToSave('de'),
    bodyEn: bodyToSave('en'),
    translationReviewed: draft.translationReviewed,
    topics: [...draft.topics],
    sources: draft.sources.map(source => ({ ...source })),
    brandRefs: draft.brandRefs.map(ref => ({ ...ref })),
    facts: draft.facts.map(fact => ({ ...fact })),
    ranking: draft.ranking,
    noteInternal: draft.noteInternal,
  }
}

/** Was der Server hätte, wenn man JETZT speichert — gegen den Bestand
 *  verglichen. Ohne `bodyToSave` meldete jedes Öffnen „geändert". */
const pristinePayload = computed(() => JSON.stringify({
  format: props.post.format,
  slug: props.post.slug,
  baseLocale: props.post.baseLocale,
  titleDe: props.post.titleDe,
  titleEn: props.post.titleEn,
  dekDe: props.post.dekDe,
  dekEn: props.post.dekEn,
  bodyDe: props.post.bodyDe,
  bodyEn: props.post.bodyEn,
  translationReviewed: props.post.translationReviewed,
  topics: props.post.topics,
  sources: props.post.sources,
  brandRefs: props.post.brandRefs,
  facts: props.post.facts,
  ranking: props.post.ranking,
  noteInternal: props.post.noteInternal,
}))

const dirty = computed(() => JSON.stringify(editPayload()) !== pristinePayload.value)

function save(): void {
  emit('save', editPayload())
}

// ── Vorschau ───────────────────────────────────────────────────────────────

const previewOpen = ref(false)

// ── Newsletter: an die Liste schicken (I5b) ────────────────────────────────

/**
 * DAS PANEL STEHT NUR AN EINEM FREIGEGEBENEN BEITRAG, UND ZWAR AUS ZWEI
 * GRÜNDEN GLEICHZEITIG.
 *
 * `newsletter !== null` sagt, dass der Riegel offen ist (die Seite fragt sonst
 * gar nicht); `insightsIsPublic` sagt, dass dieser Beitrag draussen steht. Die
 * zweite Prüfung wiederholt etwas, das die Route auch weiss — mit Absicht: an
 * einem Entwurf gäbe es nichts zu entscheiden, und ein Knopf mit der Auskunft
 * „erst freigeben" an einer Stelle, an der man ohnehin noch schreibt, ist
 * Lärm. Die Auskunft `blocked: 'not_public'` bleibt für den Fall, dass jemand
 * den Beitrag im zweiten Reiter zurückzieht.
 *
 * `props.post.state` und nicht `draft.state`: der Zustand gehört dem Server
 * (`INSIGHTS_SERVER_OWNED_FIELDS`), und ein ungespeicherter Entwurf darf das
 * Panel nicht erscheinen lassen.
 */
const newsletterPanel = computed(() => (
  props.newsletter && insightsIsPublic(props.post) ? props.newsletter : null
))

const newsletterIntroDe = ref('')
const newsletterIntroEn = ref('')

/**
 * DAS EINLEITUNGS-FELD VERSCHWINDET, SOBALD DER ERSTE STAPEL DRAUSSEN IST.
 *
 * Beim Fortsetzen gilt der Text, der in der Sende-Zeile steht — sonst bekäme
 * die zweite Hälfte der Liste einen anderen Text als die erste (die Route
 * ignoriert mitgeschickte Einleitungen dann bewusst). Ein Feld, das man
 * ausfüllen kann, ohne dass es wirkt, ist schlimmer als keines.
 */
const newsletterStarted = computed(() => Boolean(newsletterPanel.value?.send))

const newsletterDone = computed(() => newsletterPanel.value?.send?.state === 'done')
const newsletterStopped = computed(() => newsletterPanel.value?.send?.state === 'failed')

/** Der Knopf steht nur, wenn die Route ihn erlaubt UND jemand da ist. */
const canSendNewsletter = computed(() => Boolean(
  newsletterPanel.value?.sendable && newsletterPanel.value.recipients > 0,
))

const sendOpen = ref(false)

/**
 * WELCHE ZAHL IN DER RÜCKFRAGE STEHT — beim Fortsetzen die AUSSTEHENDEN.
 *
 * „Diese Mail geht an 500 Menschen" wäre nach 300 verschickten Mails falsch,
 * und zwar in die teure Richtung: sie liesse den Leser des Satzes glauben, er
 * schicke etwas doppelt.
 */
const newsletterConfirmCount = computed(() => (
  newsletterStarted.value
    ? (newsletterPanel.value?.remaining ?? 0)
    : (newsletterPanel.value?.recipients ?? 0)
))

function confirmSend(): void {
  sendOpen.value = false
  emit('sendNewsletter', {
    introDe: newsletterIntroDe.value.trim(),
    introEn: newsletterIntroEn.value.trim(),
  })
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="min-w-0 space-y-4">
      <!-- Kopfzeile: Format · Grundsprache · Adresse · Zustand -->
      <div class="bw-card p-6">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.format') }}</p>
            <USelect v-model="draft.format" :items="formatItems" value-key="value" class="mt-1 w-44" />
          </div>
          <div>
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.baseLocale') }}</p>
            <USelect v-model="draft.baseLocale" :items="localeItems" value-key="value" class="mt-1 w-40" />
          </div>
          <div class="min-w-64 flex-1">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.slug') }}</p>
            <UInput v-model="draft.slug" class="mt-1 w-full font-mono" />
          </div>
          <div class="ml-auto flex items-center gap-2">
            <span
              v-for="state in stateItems" :key="state.value"
              class="bw-label rounded-full px-3 py-1"
              :style="post.state === state.value
                ? 'background: var(--bw-ink); color: var(--bw-paper)'
                : 'background: var(--bw-surface); color: var(--bw-muted)'"
            >{{ state.label }}</span>
          </div>
        </div>
        <p class="bw-pending mt-3">{{ t('insights.editor.baseLocaleNote') }}</p>
        <div class="mt-4">
          <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.topics') }}</p>
          <USelectMenu
            v-model="draft.topics"
            :items="topicItems"
            value-key="value"
            multiple
            class="mt-1 w-full"
            :placeholder="t('insights.list.topicAll')"
          />
        </div>
      </div>

      <!-- Zwei Sprach-Reiter -->
      <div class="bw-card p-6">
        <UTabs v-model="activeTab" :items="tabs" :content="false" size="sm" />

        <!-- Der Stempel über der zweiten Fassung, solange sie maschinell ist. -->
        <UAlert
          v-if="activeTab === 'translation' && draft.translatedAt && !draft.translationReviewed"
          class="mt-4" icon="i-ph-robot" color="warning" variant="subtle"
          :title="t('insights.editor.machineNote', { date: insightsDay(draft.translatedAt.slice(0, 10), locale) })"
        />

        <div class="mt-4 space-y-3">
          <UFormField :label="t('insights.editor.titleField')">
            <UInput v-model="titleValue" class="w-full" :maxlength="200" />
          </UFormField>
          <UFormField :label="t('insights.editor.dekField')">
            <UTextarea v-model="dekValue" :rows="2" class="w-full" :maxlength="400" />
          </UFormField>
          <UFormField :label="t('insights.editor.bodyField')">
            <UEditor
              v-slot="{ editor }"
              v-model="bodyValue"
              content-type="markdown"
              :starter-kit="editorStarterKit"
              :markdown="editorMarkdown"
              :image="false"
              :mention="false"
              :enable-input-rules="RULE_EXTENSIONS"
              :enable-paste-rules="RULE_EXTENSIONS"
              :editor-props="editorProps"
              class="w-full rounded-md border border-default"
              :ui="{ base: 'px-3 py-2', content: 'min-h-64' }"
            >
              <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
            </UEditor>
          </UFormField>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton
            v-if="activeTab === 'translation'"
            :label="t('insights.editor.translate')" icon="i-ph-translate"
            :loading="translating"
            color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)"
            @click="emit('translate')"
          />
          <UCheckbox
            v-if="activeTab === 'translation'"
            v-model="draft.translationReviewed"
            :label="t('insights.editor.translationReviewed')"
          />
          <p class="bw-label ml-auto" style="color: var(--bw-muted)">
            {{ t('insights.editor.readingMinutes', { count: readingMinutes }) }}
          </p>
        </div>
      </div>

      <!-- KI-Entwurf: nur im Entwurf (§9.4, „kein Weg von der KI nach review") -->
      <div v-if="post.state === 'draft'" class="bw-card p-6">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.draftPanel') }}</p>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.editor.draftHint') }}</p>
        <UFormField class="mt-3" :label="t('insights.editor.draftBrief')">
          <UTextarea
            v-model="brief" :rows="4" class="w-full"
            :maxlength="INSIGHTS_BRIEF_MAX"
            :placeholder="t('insights.editor.draftBriefPlaceholder')"
          />
        </UFormField>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <UFormField :label="t('insights.editor.draftWords')">
            <UInputNumber
              v-model="targetWords"
              :min="INSIGHTS_DRAFT_WORDS_MIN" :max="INSIGHTS_DRAFT_WORDS_MAX" :step="50"
              class="w-40"
            />
          </UFormField>
          <UButton
            :label="t('insights.editor.draftRun')" icon="i-ph-sparkle"
            :loading="drafting" :disabled="!brief.trim()"
            class="rounded-full" @click="runDraft"
          />
        </div>
      </div>

      <!-- Quellen-Panel mit Beleg-Ampel (Zeilen: `InSourcesEditor`) -->
      <div class="bw-card p-6">
        <InSourcesEditor
          v-model="draft.sources"
          :evidence="evidence"
          :checking-index="checkingIndex"
          checkable
          @check-evidence="emit('checkEvidence', $event)"
          @remove="removeSource"
        />
      </div>

      <!-- Marken-Panel: Auswahl und Schnellanlage (Prüfregel 6) -->
      <div class="bw-card p-6">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.brandsPanel') }}</p>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.editor.brandsHint') }}</p>
        <USelectMenu
          v-model="selectedBrandIds"
          :items="brandItems"
          value-key="value"
          multiple
          class="mt-3 w-full"
          :placeholder="t('insights.editor.brandsSelect')"
        />
        <UButton
          class="mt-3 rounded-full" icon="i-ph-plus" color="neutral" variant="ghost"
          style="background: var(--bw-surface)"
          :label="t('insights.editor.brandAdd')"
          @click="brandDialogOpen = true"
        />
      </div>

      <!-- Fakten: nur Duell und Ranking (s. Kopf des Abschnitts im Skript) -->
      <div v-if="showFacts" class="bw-card p-6">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.factsPanel') }}</p>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ draft.format === 'ranking' ? t('insights.editor.factsHintRanking') : t('insights.editor.factsHintDuel') }}
        </p>
        <UTextarea v-model="factsText" :rows="10" class="mt-3 w-full" :ui="{ base: 'font-mono text-xs' }" />
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <UButton
            :label="t('insights.editor.factsApply')" icon="i-ph-check"
            color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)"
            @click="applyFacts"
          />
          <p v-if="factsError" class="text-sm" style="color: var(--bw-stale)">{{ factsError }}</p>
        </div>
      </div>
    </div>

    <!-- Rechte Spalte: die sechs Regeln, die Übergänge, die Notiz -->
    <aside class="space-y-4">
      <div class="bw-card p-6">
        <UButton
          :label="t('insights.editor.save')" icon="i-ph-floppy-disk"
          :loading="saving" :disabled="!dirty"
          block class="rounded-full" @click="save"
        />
        <p class="bw-label mt-2 text-center" style="color: var(--bw-muted)">
          {{ dirty ? t('insights.editor.dirty') : t('insights.editor.clean') }} ·
          {{ t('insights.editor.readingMinutes', { count: readingMinutes }) }}
        </p>
      </div>

      <div class="bw-card p-6">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.rules') }}</p>

        <p v-if="shownIssues.length === 0" class="mt-3 flex items-center gap-2 text-sm" style="color: var(--bw-accent)">
          <UIcon name="i-ph-check-circle-fill" class="size-4" />
          {{ t('insights.editor.rulesOk') }}
        </p>

        <template v-else>
          <p class="mt-3 flex items-center gap-2 text-sm" style="color: var(--bw-stale)">
            <UIcon name="i-ph-warning-circle-fill" class="size-4" />
            <!-- Plural über die ZAHL, nicht über ein benanntes Feld: nur so
                 wählt vue-i18n die Form („Ein Punkt" gegen „{count} Punkte"). -->
            {{ t('insights.editor.rulesBlocked', shownIssues.length) }}
          </p>
          <ul class="mt-3 space-y-2">
            <li v-for="(issue, index) in shownIssues" :key="index" class="text-sm leading-snug" style="color: var(--bw-ink-soft)">
              {{ issueText(issue) }}
              <span v-if="issueWhere(issue)" class="bw-label block" style="color: var(--bw-muted)">{{ issueWhere(issue) }}</span>
            </li>
          </ul>
        </template>

        <div class="mt-5 flex flex-col gap-2">
          <UButton
            v-for="to in transitions" :key="to"
            :label="transitionLabel(to)" :icon="transitionIcon(to)"
            :loading="transitioning" :disabled="dirty"
            :color="to === 'draft' ? 'neutral' : 'primary'"
            :variant="to === 'draft' ? 'ghost' : 'solid'"
            class="rounded-full"
            :style="to === 'draft' ? 'background: var(--bw-surface)' : ''"
            @click="emit('changeState', to)"
          />
          <p v-if="dirty" class="bw-label" style="color: var(--bw-muted)">{{ t('insights.editor.saveFirst') }}</p>
          <UButton
            :label="t('insights.editor.preview')" icon="i-ph-eye"
            color="neutral" variant="ghost" class="rounded-full" style="background: var(--bw-surface)"
            @click="previewOpen = true"
          />
        </div>
      </div>

      <!-- Newsletter: an die Liste schicken (I5b). Nur an einem freigegebenen
           Beitrag und nur bei offenem Riegel — beides entscheidet
           `newsletterPanel`. -->
      <div v-if="newsletterPanel" class="bw-card p-6" data-insights-newsletter-panel>
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.newsletter.send.panelTitle') }}</p>

        <template v-if="newsletterPanel.blocked === 'not_public'">
          <p class="mt-3 text-sm" style="color: var(--bw-stale)">{{ t('insights.newsletter.send.notPublicTitle') }}</p>
          <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.newsletter.send.notPublicText') }}</p>
        </template>

        <template v-else-if="newsletterPanel.blocked === 'no_public_address'">
          <p class="mt-3 text-sm" style="color: var(--bw-stale)">{{ t('insights.newsletter.send.noAddressTitle') }}</p>
          <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.newsletter.send.noAddressText') }}</p>
        </template>

        <!-- Durch: statt des Knopfes stehen hier Datum und Zahl (ein Beitrag,
             eine Mail — es gibt keinen zweiten Versand). -->
        <template v-else-if="newsletterDone && newsletterPanel.send">
          <p class="mt-3 flex items-center gap-2 text-sm" style="color: var(--bw-accent)">
            <UIcon name="i-ph-check-circle-fill" class="size-4" />
            {{ t('insights.newsletter.send.doneTitle') }}
          </p>
          <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('insights.newsletter.send.doneText', {
              date: insightsDay((newsletterPanel.send.finishedAt || newsletterPanel.send.startedAt).slice(0, 10), locale),
              count: newsletterPanel.send.sent,
            }) }}
          </p>
          <p v-if="newsletterPanel.send.failed > 0" class="mt-2 text-sm leading-relaxed" style="color: var(--bw-stale)">
            {{ t('insights.newsletter.send.failedNote', { count: newsletterPanel.send.failed }) }}
          </p>
        </template>

        <template v-else>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.newsletter.send.hint') }}</p>

          <p class="bw-label mt-3" style="color: var(--bw-muted)">{{ t('insights.newsletter.send.subjectLabel') }}</p>
          <p class="text-sm leading-snug">{{ newsletterPanel.subjectPreview }}</p>

          <UAlert
            v-if="newsletterStopped"
            class="mt-3" icon="i-ph-warning-circle" color="warning" variant="subtle"
            :title="t('insights.newsletter.send.stoppedTitle')"
            :description="t('insights.newsletter.send.stoppedText')"
          />

          <!-- Das Feld verschwindet, sobald der erste Stapel draussen ist
               (s. `newsletterStarted` im Skript). -->
          <template v-if="!newsletterStarted">
            <!-- ZWEI FELDER, EINES JE SPRACHE (Davids Entscheidung 2026-10-27):
                 die Mail folgt der Sprache des Lesers, also muss es die
                 Einleitung auch. Wer nur eines füllt, erreicht damit nur dessen
                 Leser — die anderen bekommen die Mail ohne Einleitung, nie die
                 fremde Sprache. -->
            <UFormField class="mt-3" :label="t('insights.newsletter.send.introLabelDe')">
              <UTextarea
                v-model="newsletterIntroDe" :rows="3" class="w-full"
                :maxlength="INSIGHTS_NEWSLETTER_INTRO_MAX"
                :placeholder="t('insights.newsletter.send.introPlaceholder')"
              />
            </UFormField>
            <p class="bw-label mt-1" style="color: var(--bw-muted)">
              {{ t('insights.newsletter.send.introCount', { count: newsletterIntroDe.length, max: INSIGHTS_NEWSLETTER_INTRO_MAX }) }}
            </p>
            <UFormField class="mt-3" :label="t('insights.newsletter.send.introLabelEn')">
              <UTextarea
                v-model="newsletterIntroEn" :rows="3" class="w-full"
                :maxlength="INSIGHTS_NEWSLETTER_INTRO_MAX"
                :placeholder="t('insights.newsletter.send.introPlaceholder')"
              />
            </UFormField>
            <p class="bw-label mt-1" style="color: var(--bw-muted)">
              {{ t('insights.newsletter.send.introCount', { count: newsletterIntroEn.length, max: INSIGHTS_NEWSLETTER_INTRO_MAX }) }}
            </p>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.newsletter.send.introHint') }}</p>
          </template>

          <!-- Plural über die ZAHL, nicht über ein benanntes Feld (wie bei den
               Prüfregeln): nur so wählt vue-i18n die Form. -->
          <p class="mt-3 text-sm" style="color: var(--bw-ink-soft)">
            {{ t('insights.newsletter.send.recipients', newsletterPanel.recipients) }}
          </p>
          <p v-if="newsletterStarted" class="bw-label" style="color: var(--bw-muted)">
            {{ t('insights.newsletter.send.remaining', { count: newsletterPanel.remaining }) }}
          </p>

          <template v-if="newsletterPanel.recipients === 0 && !newsletterStarted">
            <p class="mt-3 text-sm" style="color: var(--bw-muted)">{{ t('insights.newsletter.send.emptyTitle') }}</p>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.newsletter.send.emptyText') }}</p>
          </template>

          <template v-else>
            <UButton
              class="mt-4 rounded-full" block icon="i-ph-paper-plane-tilt"
              :label="newsletterStarted ? t('insights.newsletter.send.resume') : t('insights.newsletter.send.button')"
              :loading="newsletterSending"
              :disabled="!canSendNewsletter || dirty"
              data-insights-newsletter-send
              @click="sendOpen = true"
            />
            <p v-if="dirty" class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('insights.editor.saveFirst') }}</p>
            <p v-if="newsletterSending && newsletterProgress" class="bw-label mt-2" style="color: var(--bw-muted)">
              {{ t('insights.newsletter.send.running', newsletterProgress) }}
            </p>
          </template>
        </template>
      </div>

      <div class="bw-card p-6">
        <UFormField :label="t('insights.editor.noteInternal')">
          <UTextarea v-model="draft.noteInternal" :rows="3" class="w-full" :maxlength="500" />
        </UFormField>
      </div>
    </aside>

    <!-- Vorschau: derselbe Renderer wie die öffentliche Seite (core) -->
    <USlideover v-model:open="previewOpen" :title="t('insights.editor.preview')">
      <template #body>
        <article class="prose prose-sm max-w-none dark:prose-invert">
          <h1>{{ titleValue }}</h1>
          <p class="lead">{{ dekValue }}</p>
          <MarkdownContent :source="bodyValue" />
        </article>
      </template>
    </USlideover>

    <!-- Die Rückfrage vor dem Versand: sie NENNT DIE ZAHL. Ein „Wirklich?"
         ohne Zahl ist keine Rückfrage, sondern ein zweiter Klick. -->
    <UModal v-model:open="sendOpen" :title="t('insights.newsletter.send.confirmTitle')">
      <template #body>
        <p class="text-sm leading-relaxed">{{ t('insights.newsletter.send.confirmText', newsletterConfirmCount) }}</p>
        <p class="mt-2 text-sm text-muted">
          {{ t('insights.newsletter.send.confirmSubject', { subject: newsletterPanel?.subjectPreview ?? '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="sendOpen = false" />
          <UButton
            :loading="newsletterSending"
            :label="t('insights.newsletter.send.confirmSend')"
            data-insights-newsletter-confirm
            @click="confirmSend()"
          />
        </div>
      </template>
    </UModal>

    <!-- Marken-Schnellanlage -->
    <UModal v-model:open="brandDialogOpen" :title="t('insights.editor.brandAdd')">
      <template #body>
        <UForm :schema="brandSchema" :state="brandForm" class="space-y-3" @submit="submitBrand">
          <UFormField :label="t('insights.editor.brandName')" name="name" required>
            <UInput v-model="brandForm.name" class="w-full" :maxlength="200" />
          </UFormField>
          <UFormField :label="t('insights.editor.brandHomepage')" name="homepage">
            <UInput v-model="brandForm.homepage" class="w-full" :maxlength="512" placeholder="https://" />
          </UFormField>
          <UFormField :label="t('insights.editor.brandIndustry')" name="industry">
            <UInput v-model="brandForm.industry" class="w-full" :maxlength="40" />
          </UFormField>
          <UButton type="submit" :label="t('insights.editor.brandCreate')" class="rounded-full" />
        </UForm>
      </template>
    </UModal>
  </div>
</template>
