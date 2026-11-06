<script setup lang="ts">
import type {
  MarketCandidateSource,
  MarketCompetitor,
  MarketProfile,
  MarketRunPhase,
  MarketRunStep,
  MarketSourceOption,
} from '../../../../shared/marketProfile'
import {
  MARKET_OWN_ID,
  MARKET_UNLOCK_STEP,
  marketFieldCandidates,
} from '../../../../shared/marketProfile'
import {
  MARKET_RATING_NOTE_MAX,
  MARKET_RATING_SCORES,
  marketRatingSeenKey,
} from '../../../../shared/marketRating'
import type {
  MarketCandidateOptionsResponse,
  MarketCompetitorResponse,
  MarketOverviewResponse,
  MarketRatingResponse,
  MarketReportResponse,
  MarketRunResponse,
  MarketVisibilityResponse,
} from '../../../../shared/types/marketApi'
import type {
  BrandFindingView,
  BrandFindingsResponse,
  BwRailLayer,
  BwRailStep,
  BwSidebarBrand,
} from '../../../contracts/brandUi'
import { useMarketBandLabel, useMarketFieldLabels } from '../../../composables/useMarketBrandLabels'

/**
 * DIE SEITE „MARKT" (MV1 M4, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.5).
 *
 * Sie setzt die fünf abgenommenen Prototyp-Screens (M0/M0b) an die echten
 * Routen — als EINE Adresse mit fünf Zuständen und nicht als fünf Seiten:
 *
 *  (a) GESPERRT, solange Kapitel B nicht abgenommen ist (§2.4). KEIN 404:
 *      das ist der eigene Kunde, ihm fehlt ein Schritt, und ein 404 ist die
 *      Antwort auf „gibt es nicht", nicht auf „noch nicht".
 *  (b) KANDIDATEN — Liste, Quellen-Wähler, Schranke (Prototyp `markt.vue`).
 *  (c) LAUF — ein SYNCHRONER POST; der Fortschritt zeigt danach, was
 *      wirklich passiert ist (Prototyp `lauf.vue`, s. „Ehrlicher Fortschritt").
 *  (d) BERICHT — Gegenüberstellung, drei Listen, Profile, Befunde, `stale`
 *      (Prototyp `ergebnis.vue`).
 *  (e) RELAUNCH — die eigene alte Website gegen die Foundation (Prototyp
 *      `relaunch.vue`), sobald ein Kandidat mit `role: 'self'` ein Profil hat.
 *
 * ── WARUM DIE SEITE IM market-LAYER LIEGT UND TROTZDEM WIE brand AUSSIEHT ─
 * Der Route-Pfad gehört der Werkstatt (`/brand/:profileId/…`), die Optik ist
 * der Token-Satz `.bw-root` des brand-Layers, das Layout ist
 * `brand-workspace`. Beides kommt über die APP (`apps/branding` listet
 * `market` und `brand` gemeinsam) und nicht über einen Import: kein
 * `Bw*`-Baustein wird hier nachgebaut, und keine `Mk*`-Komponente kennt einen
 * `brand.*`-Schlüssel — die Beschriftungen reicht diese Seite als Prop herein
 * (`useMarketBrandLabels`).
 *
 * Nuxt sortiert statische Segmente vor dynamische: `/brand/:id/market` gewinnt
 * gegen `/brand/:id/:stepKey` aus dem brand-Layer. Das ist keine Zufälligkeit,
 * sondern die dokumentierte Reihenfolge des Routers — und `market` ist als
 * Kapitel-Schlüssel nicht vergeben.
 *
 * ── EIN FREMDES BRANDING IST EIN 404 (wie Werkstatt und Dokument) ────────
 * Dieselbe Datentür wie überall: `store.loadProfile` fragt
 * `/api/brand/profiles/:id`, das 404 für fremd UND für unbekannt antwortet
 * (ein 403 bestätigte die Existenz). Ohne Session ebenso — das Beta-Gate des
 * Wizards antwortet 404, nicht 401.
 *
 * ── EHRLICHER FORTSCHRITT (Auftrag M4 (c)) ───────────────────────────────
 * Der Lauf ist EIN Aufruf, der lange dauert; es gibt keinen Kanal, über den
 * Zwischenstände kämen. Also wird auch keiner erfunden: während des Wartens
 * stehen die Kandidaten mit ihrem GESPEICHERTEN Stand da (meist „Wartet"),
 * und erst die Antwort füllt die Kette („robots.txt geprüft · 6 Seiten
 * gelesen · Profil erstellt"). Ein abgespielter Schein-Fortschritt wäre eine
 * Behauptung über einen fremden Server.
 *
 * ── DIE BEFUNDE KOMMEN ÜBER DIE brand-ROUTE ──────────────────────────────
 * Der Bericht trägt sie als `MarketFinding` (id, Feld, Warum, Vorschlag) —
 * ENTSCHIEDEN werden sie über `BwFindingChip`, und der braucht die volle
 * `BrandFindingView`. Sie kommt deshalb aus `GET /api/brand/profiles/:id/
 * findings`, gefiltert auf `kind: 'market'`. Das ist KEIN Layer-Bruch: eine
 * HTTP-Route ist die öffentliche Fläche derselben App, und eine zweite
 * Entscheidungs-Mechanik neben dem Chip wäre die zweite Stelle, an der ein
 * 409 anders behandelt wird.
 */
definePageMeta({ layout: 'brand-workspace' })

const route = useRoute()
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()
const appConfig = useAppConfig()
const { trackFunnel } = useFunnelEvent()

const profileId = computed(() => String(route.params.profileId ?? ''))
const base = computed(() => `/api/market/profiles/${profileId.value}`)

/**
 * DAS PRODUKT-GATE DER APP (`pukalani.market.enabled`).
 *
 * Es steht VOR jedem Abruf: eine App ohne dieses Produkt hat diese Adresse
 * nicht, und die ehrliche Antwort darauf ist dieselbe wie auf jede andere
 * unbekannte Adresse. Der Server sagt dasselbe an seinen Routen (die
 * Produkt-Registry), diese Zeile spart den Weg dorthin.
 */
if (appConfig.pukalani?.market?.enabled !== true) {
  throw createError({ status: 404, statusText: 'Not Found' })
}

/**
 * DIE HÜLLE: Profil, Journey, Marken-Wähler — wie im Dokument (Paket 8/9).
 * Ein ausdrückliches „nicht gefunden" wirft 404; alles andere bleibt
 * fail-soft, damit ein Transportfehler nicht als „gibt es nicht" erscheint.
 */
const shell = await useAsyncData<{ found: boolean } | null>(
  () => `market-shell-${profileId.value}`,
  async () => {
    const found = await store.loadProfile(profileId.value, request)
    await store.loadProfiles(request).catch(() => {})
    return { found }
  },
  { watch: [profileId], default: () => null },
)

if (shell.data.value && !shell.data.value.found) {
  throw createError({ status: 404, statusText: 'Unknown brand profile' })
}

// ── Die drei Abrufe der Seite ─────────────────────────────────────────────

const overview = await useAsyncData<MarketOverviewResponse | null>(
  () => `market-overview-${profileId.value}`,
  () => request<MarketOverviewResponse>(base.value),
  { watch: [profileId], default: () => null },
)

const reportState = await useAsyncData<MarketReportResponse | null>(
  () => `market-report-${profileId.value}`,
  () => request<MarketReportResponse>(`${base.value}/report`),
  { watch: [profileId], default: () => null },
)

/** Die Befunde für die Chips UND den Zähler in der Leiste (s. Kopf). */
const findings = await useAsyncData<BrandFindingsResponse | null>(
  () => `market-findings-${profileId.value}`,
  () => request<BrandFindingsResponse>(`/api/brand/profiles/${profileId.value}/findings`),
  { watch: [profileId], default: () => null },
)

const marketFindings = computed(
  () => (findings.data.value?.findings ?? []).filter(finding => finding.kind === 'market'),
)

const unlocked = computed(() => overview.data.value?.unlocked === true)
const paywallUnlocked = computed(() => overview.data.value?.paywall.unlocked === true)
const competitors = computed<MarketCompetitor[]>(() => overview.data.value?.competitors ?? [])
const profiles = computed<MarketProfile[]>(() => overview.data.value?.profiles ?? [])
const aiViews = computed(() => overview.data.value?.aiViews ?? [])
const maxCompetitors = computed(() => overview.data.value?.max ?? 5)

/** Das Feld — ohne die eigene alte Website (§2.3, s. `marketFieldCandidates`). */
const fieldCompetitors = computed(() => marketFieldCandidates(competitors.value))
/** Die eigene alte Website, falls es eine gibt (§7.2 Nr. 2). */
const selfCandidate = computed(() => competitors.value.find(entry => entry.role === 'self') ?? null)
const selfProfile = computed(
  () => profiles.value.find(profile => profile.competitorId === selfCandidate.value?.id) ?? null,
)

const fieldLabels = useMarketFieldLabels()
const bandLabel = useMarketBandLabel()

const brandTitle = computed(() => store.profile?.title || t('brand.brands.card.untitled'))

// ── Fachliche Ablehnungen in Worte fassen ────────────────────────────────

/**
 * Der zentrale Fehler-Umschlag trägt `reason` (CLAUDE.md: `data.code` wird als
 * `reason` gehoben). Übersetzt wird er HIER und nur, wenn es einen Satz dafür
 * gibt — ein roher Code in einem Toast ist eine Fehlermeldung an den falschen
 * Leser.
 */
function rejectionMessage(error: unknown, fallbackKey: string): string {
  const reason = (error as { data?: { reason?: string } })?.data?.reason
  const key = reason ? `market.rejected.${reason}` : ''
  return key && te(key) ? t(key) : t(fallbackKey)
}

function fail(error: unknown, fallbackKey: string): void {
  toast.add({ color: 'warning', title: rejectionMessage(error, fallbackKey) })
}

// ── (b) Kandidaten pflegen ───────────────────────────────────────────────

/**
 * Die wählbaren Einträge je Quelle — GEHOLT, wenn eine Quelle gewählt wird,
 * nicht beim Seitenaufbau. Drei Listen im Voraus zu laden hiesse, bei jedem
 * Aufschlagen drei Abfragen zu stellen, von denen der Kunde meistens keine
 * braucht (Begründung an der Route).
 */
const sourceOptions = ref<Partial<Record<MarketCandidateSource, MarketSourceOption[]>>>({})
const optionsPending = ref(false)

async function loadOptions(source: MarketCandidateSource): Promise<void> {
  if (source === 'website') return
  optionsPending.value = true
  try {
    const response = await $fetch<MarketCandidateOptionsResponse>(`${base.value}/candidates`, {
      query: { source },
    })
    sourceOptions.value = { ...sourceOptions.value, [source]: response.options }
  }
  catch (error) {
    fail(error, 'market.error.options')
  }
  finally {
    optionsPending.value = false
  }
}

/**
 * DIE ZEILE, DIE NOCH KEINE ZEILE IST.
 *
 * Ein Kandidat entsteht erst mit dem Speichern (die Adresse muss geprüft, der
 * Eintrag muss existieren). Bis dahin lebt der Entwurf im Bildschirm — sonst
 * legte jeder Klick auf „Wettbewerber ergänzen" eine halbe Zeile in der
 * Datenbank an, die niemand mehr wegräumt.
 */
const draft = ref<{ source: MarketCandidateSource, url: string, refId: string, name: string } | null>(null)
const saving = ref(false)

function startDraft(): void {
  draft.value = { source: 'website', url: '', refId: '', name: '' }
}

function draftSource(source: MarketCandidateSource): void {
  if (!draft.value) return
  // Die Quelle zu wechseln SETZT DIE ZEILE ZURÜCK (Prototyp `markt.vue`): eine
  // stehengebliebene Adresse unter „Bibliothek" wäre ein Rest, den niemand
  // mehr liest, und beim Speichern die Frage, welches Feld gilt.
  draft.value = { source, url: '', refId: '', name: '' }
  void loadOptions(source)
}

function draftRef(refId: string): void {
  if (!draft.value) return
  const entry = (sourceOptions.value[draft.value.source] ?? []).find(option => option.id === refId)
  draft.value = { ...draft.value, refId, name: entry?.label ?? draft.value.name }
}

const draftReady = computed(() => {
  const current = draft.value
  if (!current) return false
  return current.source === 'website' ? current.url.trim().length > 0 : current.refId.length > 0
})

async function saveDraft(role: 'competitor' | 'self' = 'competitor'): Promise<void> {
  const current = draft.value
  if (!current || !draftReady.value || saving.value) return
  saving.value = true
  try {
    await $fetch<MarketCompetitorResponse>(`${base.value}/competitors`, {
      method: 'POST',
      body: {
        // Ohne gewählten Eintrag trägt die Zeile den Gattungsnamen — im Produkt
        // ersetzt ihn der Kunde, sobald er die Marke kennt.
        name: current.name.trim() || t('market.candidates.name'),
        url: current.url,
        sourceKind: current.source,
        sourceRef: current.refId,
        role,
      },
    })
    draft.value = null
    await refreshAll()
  }
  catch (error) {
    fail(error, 'market.error.competitorAdd')
  }
  finally {
    saving.value = false
  }
}

async function removeCompetitor(id: string): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await $fetch(`${base.value}/competitors/${id}`, { method: 'DELETE' })
    await refreshAll()
  }
  catch (error) {
    fail(error, 'market.error.competitorRemove')
  }
  finally {
    saving.value = false
  }
}

async function updateUrl(payload: { id: string, url: string }): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await $fetch<MarketCompetitorResponse>(`${base.value}/competitors/${payload.id}`, {
      method: 'PATCH',
      body: { url: payload.url },
    })
    await refreshAll()
  }
  catch (error) {
    fail(error, 'market.error.competitorUpdate')
  }
  finally {
    saving.value = false
  }
}

// ── (c) Der Lauf ─────────────────────────────────────────────────────────

const runPhase = ref<MarketRunPhase>('idle')
const runSteps = ref<MarketRunStep[]>([])

/**
 * Während des Wartens: die Kandidaten mit ihrem GESPEICHERTEN Stand. Keine
 * erfundenen Zwischenschritte (s. Kopf).
 */
const waitingSteps = computed<MarketRunStep[]>(() => competitors.value.map(entry => ({
  competitorId: entry.id,
  name: entry.name,
  status: entry.status,
  robotsChecked: false,
  pagesRead: 0,
})))

const shownSteps = computed<MarketRunStep[]>(
  () => (runSteps.value.length ? runSteps.value : waitingSteps.value),
)

const running = computed(() => runPhase.value === 'running' || runPhase.value === 'comparing')

/**
 * EIN KNOPF, EIN AUFRUF (`?report=1`).
 *
 * Aus Kundensicht ist „Markt vergleichen" eine Handlung; technisch sind es
 * zwei Schritte (Abruf und Vergleich). Genau dafür hat M3 das Flag gebaut —
 * zwei Aufrufe von hier müssten den Fall „Lauf gut, Bericht kaputt" selbst
 * zusammensetzen, und zwei Knöpfe wären dann nur eine Frage der Zeit.
 */
async function runComparison(): Promise<void> {
  if (running.value || !unlocked.value || !paywallUnlocked.value) return
  runPhase.value = 'running'
  runSteps.value = []
  try {
    const response = await $fetch<MarketRunResponse>(`${base.value}/run?report=1`, { method: 'POST' })
    runSteps.value = response.steps
    runPhase.value = 'done'
    if (!response.aiEnabled) toast.add({ color: 'warning', title: t('market.error.aiOff') })
    await refreshAll()
  }
  catch (error) {
    runPhase.value = 'idle'
    fail(error, 'market.error.run')
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([overview.refresh(), reportState.refresh(), findings.refresh()])
}

// ── (d) Der Bericht ──────────────────────────────────────────────────────

const report = computed(() => reportState.data.value?.report ?? null)
const stale = computed(() => reportState.data.value?.stale === true)

const reportDate = computed(() => (report.value
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(report.value.createdAt))
  : ''))

/** Der Beleg-Link zeigt auf die Quell-Adresse selbst — sie ist öffentlich. */
function evidenceHref(sourceUrl: string): string {
  return sourceUrl
}

/** Die Ergebnis-Adresse des Brand-Checks (`/brand-check/<id>`, §7.3). */
function checkHref(checkId: string): string {
  return localePath(`/brand-check/${checkId}`)
}

function profileOf(competitorId: string): MarketProfile | null {
  return profiles.value.find(profile => profile.competitorId === competitorId) ?? null
}

function aiViewOf(competitorId: string) {
  return aiViews.value.find(view => view.competitorId === competitorId) ?? null
}

const ownAiView = computed(() => aiViewOf(MARKET_OWN_ID))

// ── (a) Gesperrt: der Weg dorthin ────────────────────────────────────────

/** Der Sprung in das Kapitel, dessen Abnahme freischaltet (§2.4). */
async function goToUnlockChapter(): Promise<void> {
  const stepKey = overview.data.value?.unlockStepKey || MARKET_UNLOCK_STEP
  if (!store.canEnter(stepKey)) return
  await navigateTo(localePath(`/brand/${profileId.value}/${stepKey}`))
}

// ── Die Schranke (§1.9) ──────────────────────────────────────────────────

/**
 * DER KLICK AUF DIE SCHRANKE (Plan §2.10: „Plausible nur für den Klick auf die
 * Schranke").
 *
 * Gemeldet wird über den BESTEHENDEN Trichter-Punkt der Erstgespräch-Kette
 * (`studio_cta_erstgespraech` mit `source`) und nicht über ein neues
 * Ereignis: das Ziel IST das Erstgespräch, und ein zweiter Name für denselben
 * Klick hiesse, in Plausible zwei Goals zu pflegen, die dasselbe zählen. Die
 * Eigenschaft `source: 'market_paywall'` trennt ihn von den CTAs der Site.
 *
 * Das Ziel kommt aus `pukalani.brand.completionCta` — dieselbe Adresse, die
 * der Wizard am Ende anbietet. Ein hier getippter Pfad wäre die zweite
 * Wahrheit über den einen Conversion-Weg dieser Marke.
 *
 * SEIT BS1 R0 (2026-09-07) über `useBrandCompletionCta()` statt über ein
 * eigenes Lesen der Config: das Ziel kann jetzt auch eine ABSOLUTE Adresse
 * sein (auf branding.supply zeigt es bis Paket Z1 auf pukalani.studio), und
 * `localePath()` darf auf eine solche nicht angewandt werden — es hinge ihr
 * das Sprach-Präfix DIESES Hosts voran. Das Composable entscheidet das; hier
 * wird nur noch gebunden. Es kommt über den Auto-Import der App, die beide
 * Layer listet — derselbe Weg wie `BwWorkspace` (s. `app/contracts/brandUi.ts`,
 * der bewusst nur Typen trägt).
 */
const bookingCta = useBrandCompletionCta()

async function openBooking(): Promise<void> {
  trackFunnel('studio_cta_erstgespraech', { source: 'market_paywall' })
  const cta = bookingCta.value
  // `open` nur, wenn die Site einen Tab wünscht — sonst der gewöhnliche Sprung.
  await navigateTo(cta.to, {
    external: cta.external,
    ...(cta.target ? { open: { target: cta.target } } : {}),
  })
}

// ── Die eine freiwillige Frage (§2.10, MV1 M5) ───────────────────────────

/**
 * SIE ERSCHEINT NACH DEM ERSTEN BERICHT UND GENAU EINMAL.
 *
 * Der `localStorage`-Marker ist BEQUEMLICHKEIT — er lässt den Block sofort
 * verschwinden. Die ZUSAGE „einmal je Branding" hält der Server über eine
 * deterministische Zeilen-Id (`marketRatingEventRowId`); ein zweiter Browser
 * bekommt die Frage also noch einmal zu sehen, seine Antwort zählt aber nicht
 * doppelt. Andersherum wäre es falsch: eine Zusage, die nur im Browser lebt,
 * ist keine.
 *
 * GELESEN WIRD ERST IN `onMounted`. Im SSR gibt es keinen `localStorage`, und
 * ein Zweig, der auf Server und Client verschieden ausfällt, ist ein
 * Hydration-Fehler (Repo-Regel). Der Block steht deshalb kurz da und
 * verschwindet dann — das ist ein normales reaktives Update, kein Sprung.
 */
const ratingDone = ref(false)
const ratingScore = ref<number | null>(null)
const ratingNote = ref('')
const ratingPending = ref(false)

onMounted(() => {
  try {
    ratingDone.value = localStorage.getItem(marketRatingSeenKey(profileId.value)) === '1'
  }
  catch {
    // Privates Fenster, geräumte Site-Daten, Browser mit gesperrtem Speicher:
    // dann wird eben gefragt. Der Server zählt trotzdem nur einmal.
  }
})

async function sendRating(): Promise<void> {
  if (ratingScore.value === null || ratingPending.value) return
  ratingPending.value = true
  try {
    await $fetch<MarketRatingResponse>(`${base.value}/rating`, {
      method: 'POST',
      body: { score: ratingScore.value, note: ratingNote.value.trim() || undefined },
    })
    ratingDone.value = true
    try {
      localStorage.setItem(marketRatingSeenKey(profileId.value), '1')
    }
    catch { /* s. oben — der Marker ist Bequemlichkeit, nicht die Zusage. */ }
    toast.add({ color: 'success', title: t('market.rating.thanks') })
  }
  catch {
    // KEIN Grund-Code: es gibt hier keinen fachlichen Ablehnungsgrund, den der
    // Mensch beheben könnte. Eine Rückmeldung, die man nicht loswird, ist
    // ärgerlich genug ohne eine Fehlermeldung, die nach Schuld klingt.
    toast.add({ color: 'warning', title: t('market.rating.failed') })
  }
  finally {
    ratingPending.value = false
  }
}

// ── Das Opt-in (§7.2 Nr. 4) ──────────────────────────────────────────────

const visibilityPending = ref(false)

/**
 * DER SCHALTER LIEST AUS DER ANTWORT UND SCHREIBT ÜBER DIE ROUTE.
 *
 * Kein lokaler Zustand daneben: was gilt, ist der GESPEICHERTE Stand, und der
 * kommt aus der Übersicht zurück. Schlägt das Schreiben fehl, springt der
 * Schalter zurück — eine Zustimmung, die nur im Bildschirm steht, wäre die
 * gefährlichste Anzeige dieses Produkts.
 */
const shared = computed({
  get: () => overview.data.value?.marketVisibility === 'shared',
  set: (value: boolean) => { void setShared(value) },
})

async function setShared(value: boolean): Promise<void> {
  if (visibilityPending.value) return
  visibilityPending.value = true
  try {
    const response = await $fetch<MarketVisibilityResponse>(`${base.value}/visibility`, {
      method: 'PATCH',
      body: { marketVisibility: value ? 'shared' : 'private' },
    })
    if (overview.data.value) {
      overview.data.value = { ...overview.data.value, marketVisibility: response.marketVisibility }
    }
  }
  catch (error) {
    fail(error, 'market.error.visibility')
    await overview.refresh()
  }
  finally {
    visibilityPending.value = false
  }
}

// ── Die rechte Spalte „Stand" (§2.5) ─────────────────────────────────────

const standRows = computed(() => {
  const rows = [
    { label: t('market.stand.candidates'), value: String(fieldCompetitors.value.length) },
    { label: t('market.stand.profiles'), value: String(profiles.value.length) },
    {
      label: t('market.stand.excluded'),
      value: String(competitors.value.filter(entry => entry.status === 'excluded').length),
    },
    {
      label: t('market.stand.findings'),
      value: String(marketFindings.value.filter(finding => finding.status === 'open').length),
    },
    { label: t('market.stand.lastRun'), value: reportDate.value || t('market.stand.never') },
  ]
  return rows
})

// ── Die Leiste (§2.5/§11) ────────────────────────────────────────────────

const navExtras = useBrandWorkspaceNavExtras({
  profileId,
  findings: () => findings.data.value?.findings ?? [],
  activeKey: 'market',
})

const railLayers = computed<BwRailLayer[]>(() => [{
  id: 'foundation',
  label: t('brand.workspace.railLayer'),
  steps: [
    ...store.railSteps.map((entry): BwRailStep => ({
      id: entry.stepKey,
      label: t(`brand.steps.${entry.stepKey}`),
      icon: '',
      state: entry.state === 'done'
        ? 'done'
        : entry.state === 'active' ? 'active' : entry.state === 'locked' ? 'locked' : 'open',
      counter: t('brand.nav.chapterCount', {
        confirmed: entry.progress.requiredTotal - entry.missingRequired.length,
        total: entry.progress.requiredTotal,
      }),
    })),
    {
      id: 'document',
      label: t('brand.nav.document'),
      icon: '',
      state: 'open',
      kind: 'document',
      to: localePath(`/brand/${profileId.value}/document`),
    },
    ...navExtras.value,
  ],
}])

const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }

const sidebarBrands = computed<BwSidebarBrand[]>(() => store.profiles.map(entry => ({
  id: entry.id,
  title: entry.title || t('brand.brands.card.untitled'),
  path: t(`brand.brands.card.path.${entry.pathKind}`),
  flag: LOCALE_FLAGS[entry.contentLocale],
  to: localePath(`/brand/${entry.id}/${entry.currentStepKey}`),
  current: entry.id === profileId.value,
})))

/* Dieselben zwei Zustände wie in Werkstatt und Dokument (Audit A7). */
const railCollapsed = ref(false)
const logCollapsed = ref(false)
const navOverlayOpen = ref(false)
const isNarrow = ref(false)
let narrowMq: MediaQueryList | null = null
const onNarrow = (event: MediaQueryListEvent | MediaQueryList): void => {
  isNarrow.value = event.matches
  if (!event.matches) navOverlayOpen.value = false
}
onMounted(() => {
  narrowMq = window.matchMedia('(max-width: 767px)')
  onNarrow(narrowMq)
  narrowMq.addEventListener('change', onNarrow)
})
onBeforeUnmount(() => narrowMq?.removeEventListener('change', onNarrow))

const navVisible = computed(() => (isNarrow.value ? navOverlayOpen.value : !railCollapsed.value))

function toggleNav(): void {
  if (isNarrow.value) navOverlayOpen.value = !navOverlayOpen.value
  else railCollapsed.value = !railCollapsed.value
}

async function goToStep(key: string | null): Promise<void> {
  navOverlayOpen.value = false
  if (!key || !store.canEnter(key)) return
  await navigateTo(localePath(`/brand/${profileId.value}/${key}`))
}

/**
 * Ein Befund-Link springt in die Session, in der das Feld wohnt.
 *
 * Das KAPITEL kommt aus dem Befund selbst (`stepKey`) und nicht aus der
 * Slot-Registry: `market` kennt sie nicht (CONCEPT A14), und der Stempel sagt
 * bei einem Markt-Befund ohnehin genau das Kapitel des betroffenen FELDES —
 * so schreibt ihn M3 (`slotById(...).stepId` im Befund-Schreiber).
 */
async function goToField(finding: BrandFindingView, slotId: string): Promise<void> {
  const target = finding.stepKey
  if (!target || !store.canEnter(target)) return
  await navigateTo({ path: localePath(`/brand/${profileId.value}/${target}`), query: { s: slotId } })
}

useBrandTitle(() => `${t('market.page.title')} — ${brandTitle.value}`)
</script>

<template>
  <BwWorkspace
    v-model:rail-overlay="navOverlayOpen"
    :progress-pct="store.profile?.progressPct ?? 0"
    :content-locale="store.profile?.contentLocale ?? locale"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="logCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        :manage-to="localePath('/dashboard/brands')"
        @select="goToStep"
        @select-brand="to => navigateTo(to)"
      />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="navVisible ? t('brand.workspace.bar.hideNav') : t('brand.workspace.bar.showNav')"
          :aria-expanded="navVisible"
          @click="toggleNav"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
            {{ t('brand.workspace.railLayer') }}
          </p>
          <p class="truncate font-semibold">{{ t('market.page.title') }}</p>
        </div>
        <UButton
          size="sm" color="neutral" variant="ghost" class="ml-auto max-md:hidden"
          icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
          :aria-label="logCollapsed ? t('brand.workspace.bar.showLog') : t('brand.workspace.bar.hideLog')"
          @click="logCollapsed = !logCollapsed"
        />
      </div>
    </template>

    <template #default>
      <div class="flex min-h-0 flex-1 flex-col gap-8 pb-4">
        <!-- KOPF: was das Produkt tut und wo seine Grenze liegt (§2.5). -->
        <div>
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
            {{ t('brand.workspace.railLayer') }}
          </p>
          <h1 class="mt-1 text-[26px] font-extralight leading-tight tracking-tight">
            {{ t('market.page.title') }}
          </h1>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('market.page.lead') }}
          </p>
          <p
            class="mt-3 rounded-xl px-4 py-3 text-sm leading-relaxed"
            style="background: var(--bw-surface); color: var(--bw-ink)"
          >
            {{ t('market.page.limit') }}
          </p>
        </div>

        <p v-if="overview.error.value" class="bw-pending">{{ t('market.error.load') }}</p>

        <!-- (a) GESPERRT — freundlich, mit dem Weg dorthin. Kein 404. -->
        <section v-else-if="!unlocked" class="rounded-2xl px-4 py-4" style="background: var(--bw-surface)">
          <p class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-ph-lock-simple" class="size-4 flex-none" style="color: var(--bw-ink-soft)" />
            {{ t('market.locked.title') }}
          </p>
          <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('market.locked.body') }}
          </p>
          <UButton
            class="mt-3 rounded-full" color="neutral" icon="i-ph-arrow-right"
            :label="t('market.locked.cta')"
            @click="goToUnlockChapter"
          />
        </section>

        <template v-else>
          <p class="bw-label -mt-4 flex items-center gap-1.5" style="color: var(--bw-muted)">
            <UIcon name="i-ph-lock-simple-open" class="size-3.5 flex-none" />
            {{ t('market.page.unlocked') }}
          </p>

          <!-- (b) DIE KANDIDATEN -->
          <MkCompetitorList
            :competitors="competitors"
            :max="maxCompetitors"
            :disabled="running || saving"
            :source-options="sourceOptions"
            :resolve-band-label="bandLabel"
            :resolve-check-href="checkHref"
            @update:url="updateUrl"
            @remove="removeCompetitor"
            @add="startDraft"
          >
            <template #score="{ check }">
              <BwScoreRing :value="check.score" :size="40" />
            </template>
          </MkCompetitorList>

          <!-- Die neue Zeile: erst speichern, dann ist sie ein Kandidat. -->
          <section v-if="draft" class="bw-card p-3 sm:p-4">
            <p class="text-sm font-medium">{{ t('market.candidates.newTitle') }}</p>
            <div class="mt-2">
              <MkSourcePicker
                :source="draft.source"
                :url="draft.url"
                :ref-id="draft.refId"
                :options="sourceOptions"
                :disabled="saving || optionsPending"
                :name="draft.name || t('market.candidates.name')"
                @update:source="draftSource"
                @update:url="draft.url = $event"
                @update:ref="draftRef"
              />
            </div>
            <p class="mt-2 text-sm leading-snug" style="color: var(--bw-muted)">
              {{ t(`market.source.${draft.source}Hint`) }}
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <UButton
                size="sm" color="neutral" class="rounded-full" icon="i-ph-check"
                :label="t('market.candidates.save')"
                :disabled="!draftReady || saving"
                @click="saveDraft('competitor')"
              />
              <UButton
                size="sm" variant="outline" color="neutral" class="rounded-full" icon="i-ph-arrow-counter-clockwise"
                :label="t('market.candidates.saveSelf')"
                :disabled="!draftReady || saving || Boolean(selfCandidate)"
                @click="saveDraft('self')"
              />
              <UButton
                size="sm" variant="ghost" color="neutral" class="rounded-full" icon="i-ph-x"
                :label="t('market.candidates.cancel')"
                :disabled="saving"
                @click="draft = null"
              />
            </div>
            <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('market.candidates.selfHint') }}</p>
          </section>

          <p class="text-sm leading-relaxed" style="color: var(--bw-muted)">{{ t('market.page.sources') }}</p>

          <!--
            WAS DER VERGLEICH TUT UND WAS NICHT (MV1 M5).

            Der ehrliche Kunden-Text steht ZUGEKLAPPT auf der Seite, an der der
            Kunde das Produkt trifft — nicht in einer Hilfe-Site, denn
            branding.supply hat keine (apps/help ist die Hilfe der
            Pukalani-Communities, ein anderes Produkt). Zugeklappt, weil die
            fünf Sätze eine Auskunft sind und kein Verkaufstext: wer sie
            braucht, sucht sie; wer sie gelesen hat, will sie nicht bei jedem
            Besuch wieder überspringen. Der Verweis am Fuss führt auf die
            Erklärseite des Bots — dieselbe Auskunft aus der Gegenrichtung.
          -->
          <UCollapsible>
            <button type="button" class="flex w-full items-center gap-2 text-left">
              <UIcon name="i-ph-info" class="size-4 flex-none" style="color: var(--bw-muted)" />
              <span class="text-sm font-medium">{{ t('market.about.title') }}</span>
            </button>
            <template #content>
              <ul class="mt-3 space-y-2">
                <li
                  v-for="line in [
                    t('market.about.does'),
                    t('market.about.doesNot'),
                    t('market.about.noClaim'),
                    t('market.about.optIn'),
                    t('market.about.deletion'),
                  ]"
                  :key="line"
                  class="flex gap-2 text-sm leading-relaxed"
                  style="color: var(--bw-ink-soft)"
                >
                  <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ line }}
                </li>
              </ul>
              <ULink
                :to="localePath('/market-bot')" target="_blank"
                class="bw-label mt-3 inline-flex items-center gap-1 underline underline-offset-4"
                style="color: var(--bw-muted)"
              >
                {{ t('market.about.bot') }}
                <UIcon name="i-ph-arrow-up-right" class="size-3 flex-none" />
              </ULink>
            </template>
          </UCollapsible>

          <!-- DIE SCHRANKE (§1.9) — beide Zustände, kein Schalter. -->
          <MkPaywall :unlocked="paywallUnlocked">
            <template #action>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  v-if="paywallUnlocked"
                  color="neutral" class="rounded-full"
                  icon="i-ph-compass"
                  :label="t(report ? 'market.action.again' : 'market.action.compare')"
                  :loading="running"
                  :disabled="running || !fieldCompetitors.length"
                  @click="runComparison"
                />
                <UButton
                  v-else
                  color="neutral" class="rounded-full"
                  icon="i-ph-arrow-up-right" :label="t('market.paywall.cta')"
                  @click="openBooking"
                />
                <span v-if="paywallUnlocked && !fieldCompetitors.length" class="bw-label" style="color: var(--bw-muted)">
                  {{ t('market.action.needsCandidate') }}
                </span>
              </div>
            </template>
          </MkPaywall>

          <!-- (c) DER LAUF -->
          <MkRunProgress
            v-if="running || runSteps.length"
            :steps="shownSteps"
            :phase="runPhase"
          />

          <!-- (d) DER BERICHT -->
          <template v-if="report">
            <div>
              <h2 class="text-[20px] font-extralight leading-tight tracking-tight">
                {{ t('market.result.title') }}
              </h2>
              <p class="bw-label mt-1" style="color: var(--bw-muted)">
                {{ t('market.result.meta', { date: reportDate }) }}
              </p>
              <div
                v-if="stale"
                class="mt-2 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
                style="background: var(--bw-stale-soft)"
              >
                <span class="text-sm leading-snug" style="color: var(--bw-ink)">{{ t('market.stale.notice') }}</span>
                <UButton
                  size="xs" color="neutral" class="rounded-full" icon="i-ph-arrows-clockwise"
                  :label="t('market.action.again')"
                  :loading="running" :disabled="running || !paywallUnlocked"
                  @click="runComparison"
                />
              </div>
            </div>

            <MkComparisonTable
              :own="report.own"
              :own-name="brandTitle"
              :competitors="marketFieldCandidates(report.competitors)"
              :profiles="report.profiles"
              :ai-views="report.aiViews"
              :field-labels="fieldLabels"
              :resolve-href="evidenceHref"
              :resolve-band-label="bandLabel"
              :resolve-check-href="checkHref"
            >
              <template #score="{ check }">
                <BwScoreRing :value="check.score" :size="36" />
              </template>
            </MkComparisonTable>

            <div class="space-y-8">
              <MkClaimList
                v-for="list in report.claims" :key="list.kind"
                :list="list"
                :field-labels="fieldLabels"
                :resolve-href="evidenceHref"
              />
            </div>

            <section>
              <h2 class="text-lg font-medium tracking-tight">{{ t('market.profiles.title') }}</h2>
              <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ t('market.profiles.hint') }}
              </p>
              <div class="mt-4 space-y-2">
                <MkCompetitorCard
                  v-for="(competitor, index) in marketFieldCandidates(report.competitors)"
                  :key="competitor.id"
                  :competitor="competitor"
                  :profile="profileOf(competitor.id)"
                  :ai-view="aiViewOf(competitor.id)"
                  :field-labels="fieldLabels"
                  :resolve-href="evidenceHref"
                  :resolve-band-label="bandLabel"
                  :resolve-check-href="checkHref"
                  :default-open="index === 0"
                >
                  <template #score="{ check }">
                    <BwScoreRing :value="check.score" :size="40" />
                  </template>
                </MkCompetitorCard>
              </div>
            </section>

            <!-- Die eigene Aussensicht — getrennt von allem, was Beleg hat. -->
            <section v-if="ownAiView">
              <h2 class="flex items-center gap-2 text-lg font-medium tracking-tight">
                <UIcon name="i-ph-sparkle" class="size-4 flex-none" style="color: var(--bw-muted)" />
                {{ t('market.ai.title') }} &middot; {{ brandTitle }}
              </h2>
              <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ t('market.ai.tableHint') }}
              </p>
              <div class="bw-card mt-3 p-4">
                <p class="bw-label flex items-center gap-1.5" style="color: var(--bw-draft)">
                  <UIcon name="i-ph-warning-circle" class="size-3.5 flex-none" />{{ t('market.ai.label') }}
                </p>
                <dl class="mt-3 space-y-3">
                  <div v-for="statement in ownAiView.statements" :key="statement.fieldId">
                    <dt class="bw-label" style="color: var(--bw-muted)">
                      {{ fieldLabels[statement.fieldId] ?? t(`market.field.${statement.fieldId}`) }}
                    </dt>
                    <dd class="mt-0.5">
                      <p class="text-sm leading-snug">{{ statement.value }}</p>
                      <p class="bw-label" style="color: var(--bw-muted)">
                        {{ t('market.ai.agree', { agree: statement.agree, asked: statement.asked }) }}
                      </p>
                    </dd>
                  </div>
                </dl>
                <p class="bw-label mt-3" style="color: var(--bw-muted)">{{ t('market.ai.disclaimer') }}</p>
              </div>
            </section>

            <!--
              DIE EINE FREIWILLIGE FRAGE (§2.10, MV1 M5) — unter dem Bericht,
              weil sie sich auf ihn bezieht, und knapp, weil sie eine
              Gefälligkeit erbittet: fünf Knöpfe, ein optionales Feld, ein
              Absenden. Kein Modal, kein „später erinnern", kein zweiter
              Anlauf — wer sie wegklickt, hat sie beantwortet, indem er sie
              nicht beantwortet hat.
            -->
            <section v-if="!ratingDone" class="bw-card p-4">
              <p class="text-sm font-medium">{{ t('market.rating.title') }}</p>
              <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ t('market.rating.hint') }}</p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <UButton
                  v-for="score in MARKET_RATING_SCORES"
                  :key="score"
                  size="sm"
                  class="rounded-full"
                  color="neutral"
                  :variant="ratingScore === score ? 'solid' : 'outline'"
                  :aria-label="t('market.rating.score', { score })"
                  :label="String(score)"
                  :disabled="ratingPending"
                  @click="ratingScore = score"
                />
              </div>
              <UInput
                v-model="ratingNote"
                class="mt-3 w-full"
                size="sm"
                :maxlength="MARKET_RATING_NOTE_MAX"
                :placeholder="t('market.rating.notePlaceholder')"
                :disabled="ratingPending"
              />
              <UButton
                class="mt-3 rounded-full" size="sm" color="neutral" icon="i-ph-paper-plane-tilt"
                :label="t('market.rating.send')"
                :loading="ratingPending"
                :disabled="ratingScore === null || ratingPending"
                @click="sendRating"
              />
            </section>
          </template>

          <p v-else-if="!running" class="bw-pending">{{ t('market.result.none') }}</p>

          <!-- (e) DER RELAUNCH — die eigene alte Website gegen die Foundation. -->
          <section v-if="selfCandidate && selfProfile && report">
            <h2 class="text-[20px] font-extralight leading-tight tracking-tight">
              {{ t('market.relaunch.title') }}
            </h2>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ t('market.relaunch.lead') }}
            </p>
            <div class="mt-4">
              <MkRelaunchCompare
                :website="selfProfile.fields"
                :website-name="selfCandidate.name"
                :website-host="selfCandidate.url"
                :foundation="report.own"
                :foundation-name="brandTitle"
                :field-labels="fieldLabels"
                :resolve-href="evidenceHref"
              />
            </div>
          </section>

          <!-- DIE BEFUNDE — dieselben Chips wie in Werkstatt und Dokument. -->
          <section>
            <h2 class="text-lg font-medium tracking-tight">{{ t('market.finding.title') }}</h2>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ t('market.finding.hint') }}
            </p>
            <div v-if="marketFindings.length" class="mt-4 flex flex-col gap-2">
              <BwFindingChip
                v-for="finding in marketFindings" :key="finding.id"
                :finding="finding" :profile-id="profileId"
                @field="slotId => goToField(finding, slotId)"
                @decided="refreshAll"
                @stale="refreshAll"
              />
            </div>
            <p v-else class="bw-label mt-3" style="color: var(--bw-muted)">{{ t('market.finding.none') }}</p>
          </section>
        </template>
      </div>
    </template>

    <!-- RECHTS: der STAND (§2.5) — kein George, kein Prompt. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex-none border-b px-6 py-4" style="border-color: var(--bw-line)">
          <h2 class="text-sm font-medium">{{ t('market.stand.title') }}</h2>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <dl class="space-y-2.5">
            <div v-for="row in standRows" :key="row.label" class="flex items-baseline justify-between gap-3">
              <dt class="bw-label" style="color: var(--bw-muted)">{{ row.label }}</dt>
              <dd class="text-sm tabular-nums" style="color: var(--bw-ink)">{{ row.value }}</dd>
            </div>
          </dl>

          <!-- DAS OPT-IN (§7.2 Nr. 4) — hier und sonst nirgends. -->
          <div class="mt-5 border-t pt-4" style="border-color: var(--bw-line)">
            <USwitch
              v-model="shared"
              :disabled="visibilityPending"
              :label="t('market.optIn.label')"
            />
            <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ t('market.optIn.hint') }}
            </p>
          </div>

          <div class="mt-5 space-y-2 border-t pt-4" style="border-color: var(--bw-line)">
            <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.stand.limits') }}</p>
            <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.stand.confidential') }}</p>
          </div>
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>
