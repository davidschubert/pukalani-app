<script setup lang="ts">
import type { BwSidebarBrand } from '../../../components/BwWorkspaceSidebar.vue'
import type { BwRailLayer, BwRailStep } from '../../../components/BwProgressRail.vue'
import { brandChoiceDisplayLabel } from '../../../../shared/brandChoiceOptions'
import {
  type BrandFoundationBlock,
  type BrandFoundationChapter,
  type BrandFoundationChapterId,
  brandFoundationPendingStep,
} from '../../../../shared/brandFoundation'
import { BRAND_ACCEPTANCE_VIEW } from '../../../../shared/brandWorkspaceNav'
import { BRAND_INDUSTRY_VALUES, normalizeBrandIndustry } from '../../../../shared/brandIndustries'
import { brandPublicationPath, brandPublicationSlug } from '../../../../shared/brandPublication'
import type {
  BrandFoundationResponse,
  BrandProfileScoresResponse,
  BrandPublicationResponse,
  BrandSharePublishResponse,
  BrandShareRevokeResponse,
  BrandShareStatusResponse,
} from '../../../../shared/types/brand'
import { useBrandWorkspaceStore } from '../../../stores/brandWorkspace'
import { useBrandFoundationRailStep } from '../../../composables/useBrandFoundationRailStep'

/**
 * „BRAND FOUNDATION" — DIE PRIVATE LESEANSICHT (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6, Paket G2; Form abgenommen
 * am Klickdummy `/brand/demo/foundation`).
 *
 * ── EIN DOKUMENT, ZWEI ANSICHTEN ─────────────────────────────────────────
 * „Euer Branding" (`document.vue`) bleibt die ARBEITSansicht: abnehmen,
 * prüfen, korrigieren. Diese Seite liest dieselben bestätigten Werte als
 * GUIDELINES — Kapitel wie ein Markenhandbuch, Do & Don't aus vorhandenen
 * Feldern, die visuellen Kapitel als sichtbare Schranke. Beide fahren
 * denselben Datenstand; was ein Kapitel HIER zeigt, entscheidet allein
 * `buildBrandFoundation` (§2.1).
 *
 * ── KEINE KNÖPFE IM TEXT (§2.6) ──────────────────────────────────────────
 * Kein Bearbeiten, kein Abnehmen, kein Prüfblick. Der EINZIGE Sprung ist der
 * Vermerk „noch nicht abgenommen" → in die Werkstatt, wo abgenommen wird. Ein
 * Handbuch mit Arbeits-Knöpfen wäre wieder das Dokument, nur schöner gesetzt.
 *
 * ── DER EINE ZÄHLER ──────────────────────────────────────────────────────
 * „x von y Kapiteln abgenommen" steht EINMAL, oben, und nur privat. Er zählt
 * die Kapitel der WERKSTATT (dort wird abgenommen), nicht die des Handbuchs —
 * s. `BrandFoundationResponse`.
 *
 * ── DER DRUCK IST DER EXPORT (§2.6 e) ────────────────────────────────────
 * Kein Server-PDF: `window.print()` auf einer Seite mit `@media print`. Das
 * Export-Menü zeigt trotzdem ALLE Ausgabeformen der Suite, frei und gesperrt
 * nebeneinander — dieselbe Ehrlichkeit wie Kapitel 10.
 *
 * ── TEILEN (Paket G3, §2.6 „Share-Dialog") ───────────────────────────────
 * Der Dialog sagt VOR dem Erzeugen, was reist und was nicht — zwei Listen
 * nebeneinander, weil „was bleibt drin" die eigentliche Frage des Menschen
 * ist, der gleich einen Link an einen Fremden schickt. Er fragt seinen Zustand
 * erst beim ÖFFNEN ab (eine Seite, die niemand teilt, soll dafür keine
 * Abfrage kosten), und er zeigt den Link GENAU EINMAL: gespeichert ist nur
 * dessen Hash, ein zweites Anzeigen gäbe es nur mit einer Route, die ein
 * Geheimnis nachreicht.
 */
definePageMeta({ layout: 'brand-workspace' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()

const profileId = computed(() => String(route.params.profileId ?? ''))

/**
 * SSR-FÄHIG, wie Werkstatt und Dokument: `useAsyncData` mit dem
 * request-gebundenen `fetch` — sonst antwortet die Datentür beim Serverlauf
 * mit der Gast-Sicht (404) und die Seite hydratisiert als „kein Zugang".
 */
const doc = await useAsyncData<BrandFoundationResponse | null>(
  () => `brand-foundation-${profileId.value}`,
  () => request<BrandFoundationResponse>(`/api/brand/profiles/${profileId.value}/foundation`),
  { watch: [profileId], default: () => null },
)

/**
 * Das PROFIL für die Leiste (Journey, Marken-Wähler). EIN FREMDES BRANDING IST
 * EIN 404 — dieselbe Regel und dieselbe Begründung wie im Kopf von
 * `document.vue` (Paket 8/9, Davids 404-Audit): die Adresse bedeutet nichts,
 * also ist die Fehlerseite die ehrliche Antwort. Alles andere bleibt
 * FAIL-SOFT: ein Transportfehler lässt die Mitte ihren Hinweis zeigen.
 */
const shell = await useAsyncData<{ found: boolean } | null>(
  () => `brand-foundation-shell-${profileId.value}`,
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

/**
 * DER VERÖFFENTLICHUNGS-ZUSTAND (Discover §4.3) — er steht im KOPF des
 * Dokuments und wird deshalb beim Aufbau geladen, nicht erst beim Öffnen des
 * Dialogs: „diese Marke steht öffentlich" ist eine Aussage über das ganze
 * Dokument und darf nicht erst nach einem Klick erscheinen.
 *
 * FAIL-SOFT (`.catch(() => null)`): ist die Route nicht da (Deploy vor D1) oder
 * antwortet sie nicht, zeigt der Kopf einfach keine Pille. Ein Zustand, den man
 * nicht lesen kann, darf die Leseansicht nicht kosten.
 */
const publicationRequest = await useAsyncData<BrandPublicationResponse | null>(
  () => `brand-publication-${profileId.value}`,
  () => request<BrandPublicationResponse>(`/api/brand/profiles/${profileId.value}/publication`)
    .catch(() => null),
  { watch: [profileId], default: () => null },
)

const view = computed(() => doc.data.value)
const title = computed(() => store.profile?.title || view.value?.title || '')
const contentLocale = computed(() => (view.value?.contentLocale ?? store.profile?.contentLocale ?? locale.value))

/** Welche Werkstatt-Kapitel stehen? Grundlage jedes „noch nicht abgenommen". */
const stepStates = computed(() => (view.value?.chapters ?? []).map(chapter => ({
  stepKey: chapter.stepKey,
  accepted: chapter.storedState === 'done',
})))

/**
 * DIE KAPITEL, WIE SIE AUF DER SEITE STEHEN.
 *
 * Der Renderer kennt die Abnahme nicht (Kopf von `shared/brandFoundation.ts`)
 * — sie ist eine Frage der PRIVATEN Ansicht. Also setzt die Seite `pending`,
 * und zwar über die gepflegte Zuordnung Handbuch-Kapitel → Werkstatt-Kapitel:
 * ein Kapitel, dessen Quelle noch offen ist, trägt den Vermerk und den Sprung
 * dorthin. Die Schranke (`locked`) bleibt unangetastet — dort gibt es nichts
 * abzunehmen.
 */
interface FoundationChapterView {
  chapter: BrandFoundationChapter
  acceptanceTo: string | null
}

const chapters = computed<FoundationChapterView[]>(() => (view.value?.view.chapters ?? []).map((chapter) => {
  if (chapter.state === 'locked') return { chapter, acceptanceTo: null }
  const pending = brandFoundationPendingStep(chapter.id, stepStates.value)
  if (!pending) return { chapter, acceptanceTo: null }
  return {
    chapter: { ...chapter, state: 'pending' },
    // Die Abnahme-ANSICHT desselben Route-Records (`?s=acceptance`) — nie eine
    // Session: hier ist keine offen, und ein Sprung in eine fremde wäre eine
    // Frage, nach der niemand gefragt hat.
    acceptanceTo: `${localePath(`/brand/${profileId.value}/${pending}`)}?s=${BRAND_ACCEPTANCE_VIEW}`,
  }
}))

/**
 * DER WEG ZUR RICHTUNGSWAHL (Paket G4) — die Ergebnis-Session der Werkstatt,
 * als Ansicht desselben Route-Records (`?s=result.direction`, dieselbe
 * Adress-Konvention wie `?s=acceptance`).
 *
 * `null`, solange das Ergebnis-Kapitel nicht betretbar ist: dann steht der
 * Knopf grau da und sagt darunter, warum. GEFRAGT WIRD DIE JOURNEY und nicht
 * `chapters[].storedState` — „gesperrt" ist eine Aussage über die VORGÄNGER
 * (`canEnterBrandStep`), und der gespeicherte Zustand einer Zeile kennt sie
 * nicht: ein Kapitel, das nie begonnen wurde, steht dort genauso auf `open`
 * wie eines, das offen und erreichbar ist.
 */
const directionTo = computed<string | null>(() => (store.canEnter('result')
  ? `${localePath(`/brand/${profileId.value}/result`)}?s=result.direction`
  : null))

/**
 * DER EINSTIEG IN BRAND DESIGN (Konzept §2.10, Paket D1) — Kapitel 10 zeigt
 * ihn statt des Erstgespräch-Angebots, sobald Schicht 2 für diese Marke offen
 * ist.
 *
 * GEFRAGT WIRD DIE JOURNEY, nicht `profile.designUnlockedAt`: die
 * Freischaltung ist nur die HÄLFTE der Bedingung (§2.1 verlangt zusätzlich das
 * abgeschlossene Ergebnis-Kapitel), und `canEnter` ist genau die Regel, die
 * der Server danach durchsetzt. Dasselbe Muster wie `directionTo` darüber.
 */
const designTo = computed<string | null>(() => (store.canEnter('dna')
  ? localePath(`/brand/${profileId.value}/dna`)
  : null))

const accepted = computed(() => view.value?.accepted ?? { chapters: 0, total: 0 })
const acceptedPct = computed(() => (accepted.value.total === 0
  ? 0
  : Math.round((accepted.value.chapters / accepted.value.total) * 100)))

/**
 * Das Verzeichnis rechts — EINE Regel für alle drei Lese-Ansichten
 * (`useBrandFoundationToc`). Seit Kapitel 10 voll sein kann (D8), trägt es
 * dessen fünf Unterpunkte.
 */
const tocLinks = useBrandFoundationToc(() => chapters.value.map(entry => entry.chapter))

/**
 * DER STAND DES BOARDS und der Weg zu seiner eigenen Ansicht (D8). Beide
 * stehen nur, wenn es das Preset gibt — die Route `/brand/:id/design` zeigt
 * ohne Preset ihre Sperr-Fläche, und ein Link dorthin wäre aus dem Handbuch
 * heraus eine Einladung ins Leere.
 */
const designStand = computed(() => formatDate(view.value?.designStand ?? ''))
const designBoardTo = computed<string | null>(() => (view.value?.designStand
  ? localePath(`/brand/${profileId.value}/design`)
  : null))

// ── „Auf einer Seite" (§1.5, HubSpot-Muster) ──────────────────────────────

/**
 * DER SCHNELLZUGRIFF ÜBER KAPITEL 0 — kein eigenes Kapitel, keine zweite
 * Quelle: er greift GENAU die Blöcke ab, die weiter unten ohnehin stehen.
 * Fehlt eine Quelle, fehlt die Zelle — eine leere Überschrift „Tagline" wäre
 * eine Behauptung, die Marke hätte eine.
 */
function blocksOf(id: BrandFoundationChapterId): readonly BrandFoundationBlock[] {
  return chapters.value.find(entry => entry.chapter.id === id)?.chapter.blocks ?? []
}

function firstLead(id: BrandFoundationChapterId): string {
  for (const block of blocksOf(id)) if (block.kind === 'lead') return block.text
  return ''
}

const onePage = computed(() => {
  const values = blocksOf('werte').find(block => block.kind === 'cards')
  const archetype = blocksOf('stimme').find(block => block.kind === 'choice')
  const taglineList = blocksOf('messaging').find(block => block.kind === 'list')
  return {
    purpose: firstLead('purpose'),
    values: values?.kind === 'cards' ? values.items : [],
    archetype: archetype?.kind === 'choice'
      ? archetype.optionIds.map(id => brandChoiceDisplayLabel(archetype.slotId, id, locale.value)).join(' · ')
      : '',
    // Eine einzelne Tagline steht als Leitsatz, mehrere als Liste (s. Renderer).
    tagline: firstLead('messaging') || (taglineList?.kind === 'list' ? taglineList.items[0] ?? '' : ''),
    wallLine: firstLead('manifest'),
  }
})

const hasOnePage = computed(() => Boolean(
  onePage.value.purpose || onePage.value.values.length || onePage.value.archetype
  || onePage.value.tagline || onePage.value.wallLine,
))

// ── Teilen (§2.6, Paket G3) ───────────────────────────────────────────────

const toast = useToast()
const shareOpen = ref(false)
/** EINE Handlung zur Zeit — sonst rotiert ein Doppelklick zwei Links. */
const shareBusy = ref(false)
const shareLoading = ref(false)
const shareActive = ref<BrandShareStatusResponse['active']>(null)
/**
 * Der rohe Token — er lebt NUR in dieser Variablen und nur bis zum nächsten
 * Seitenaufbau. Nicht im Store, nicht in der Adresse, nicht im Log.
 */
const shareToken = ref('')
const shareCopied = ref(false)

/**
 * Der Ursprung kommt aus dem REQUEST, nicht aus `window`: so steht im Feld
 * derselbe Host, unter dem der Mensch gerade arbeitet (Dev-Port eingeschlossen),
 * und die Zeile ist beim ersten Rendern schon richtig.
 */
const origin = useRequestURL().origin

const shareUrl = computed(() => (shareToken.value
  ? `${origin}${localePath(`/brand/share/${shareToken.value}`)}`
  : ''))

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))

function formatDate(iso: string): string {
  const value = Date.parse(iso)
  // Ein kaputtes Datum wird zur leeren Zeile, nie zu „Invalid Date".
  return Number.isFinite(value) ? dateFormat.value.format(value) : ''
}

async function loadShareStatus(): Promise<void> {
  shareLoading.value = true
  try {
    const status = await $fetch<BrandShareStatusResponse>(`/api/brand/profiles/${profileId.value}/share`)
    shareActive.value = status.active
  }
  catch {
    toast.add({ title: t('brand.foundation.share.failed'), color: 'error' })
  }
  finally {
    shareLoading.value = false
  }
}

async function openShare(): Promise<void> {
  shareOpen.value = true
  // Der Token eines FRÜHEREN Erzeugens gilt nicht mehr als „gerade gezeigt":
  // beim zweiten Öffnen steht wieder nur der Zustand da.
  shareToken.value = ''
  shareCopied.value = false
  await loadShareStatus()
}

/** Erzeugen UND Rotieren — das Backend widerruft die Vorgänger selbst. */
async function createShareLink(): Promise<void> {
  if (shareBusy.value) return
  shareBusy.value = true
  try {
    const created = await $fetch<BrandSharePublishResponse>(
      `/api/brand/profiles/${profileId.value}/share`,
      { method: 'POST', body: {} },
    )
    shareToken.value = created.token
    shareCopied.value = false
    shareActive.value = {
      shareId: created.shareId,
      publishedAt: created.publishedAt,
      expiresAt: created.expiresAt,
    }
    toast.add({ title: t('brand.foundation.share.createdToast') })
  }
  catch {
    toast.add({ title: t('brand.foundation.share.failed'), color: 'error' })
  }
  finally {
    shareBusy.value = false
  }
}

async function revokeShareLink(): Promise<void> {
  if (shareBusy.value) return
  shareBusy.value = true
  try {
    await $fetch<BrandShareRevokeResponse>('/api/brand/share/revoke', {
      method: 'POST',
      body: { profileId: profileId.value },
    })
    shareToken.value = ''
    toast.add({ title: t('brand.foundation.share.revokedToast') })
    // Neu FRAGEN statt lokal auf `null` setzen: der Widerruf nimmt alle
    // aktiven Zeilen, und was danach gilt, weiss der Server.
    await loadShareStatus()
  }
  catch {
    toast.add({ title: t('brand.foundation.share.failed'), color: 'error' })
  }
  finally {
    shareBusy.value = false
  }
}

/**
 * DAS NATIVE TEILEN-BLATT (Discover-Entscheidung 7, Davids Wunsch „wie die
 * iPhone-Share-Funktion").
 *
 * Es steht NEBEN „Link kopieren", nicht an dessen Stelle: `navigator.share`
 * gibt es auf dem Telefon fast überall und auf dem Schreibtisch fast nirgends,
 * und ein Knopf, der auf dem Desktop nichts tut, ist schlimmer als keiner.
 * Deshalb wird er nur gerendert, wenn es die Funktion GIBT — und die Frage
 * lässt sich erst im Browser stellen (`import.meta.client`): beim SSR gibt es
 * keinen `navigator`, und ein serverseitig gerateter Wert würde beim
 * Hydratisieren zum Sprung.
 */
const canNativeShare = ref(false)
onMounted(() => {
  canNativeShare.value = import.meta.client && typeof navigator.share === 'function'
})

async function nativeShare(url: string, shareTitle: string): Promise<void> {
  try {
    await navigator.share({ title: shareTitle, url })
  }
  catch {
    // Abbruch durch den Menschen (er tippt neben das Blatt) und ein verweigerter
    // Aufruf sehen gleich aus. Beides ist kein Fehler und bekommt deshalb auch
    // keine Meldung — der Link steht weiterhin da.
  }
}

async function copyShareUrl(): Promise<void> {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareCopied.value = true
    toast.add({ title: t('brand.foundation.share.copyToast') })
    window.setTimeout(() => { shareCopied.value = false }, 1600)
  }
  catch {
    // Ohne Zwischenablage-Recht (unsicherer Ursprung, verweigerte Erlaubnis)
    // bleibt das Feld stehen — es ist auswählbar, das ist der Ausweg.
    toast.add({ title: t('brand.foundation.share.copyFailed'), color: 'error' })
  }
}

// ── Exportieren (§2.6) ────────────────────────────────────────────────────

function print(): void {
  if (import.meta.client) window.print()
}

/**
 * DAS EXPORT-MENÜ ZEIGT ALLE AUSGABEFORMEN DER SUITE — frei und gesperrt
 * nebeneinander, dieselbe Ehrlichkeit wie die visuelle Schranke. Ein Menü, das
 * nur „Drucken" kennt, verschweigt, was es noch gibt; ein Menü ohne Schloss
 * verspricht, was es nicht liefert. Die drei gesperrten Formen gehören
 * Produkt 03 („Brand Book & Kit") und tragen dessen Namen als Untertitel.
 */
interface FdExportItem {
  label: string
  icon?: string
  sub?: string
  locked?: boolean
  disabled?: boolean
  /** Ein echtes Ziel — Download-Route oder Seite. Downloads sind Navigation. */
  to?: string
  target?: '_blank'
  external?: boolean
  download?: boolean
  children?: FdExportItem[]
  onSelect?: () => void
}

/**
 * DIE ADRESSE DER KIT-DATEIEN DIESER MARKE (K6).
 *
 * Sie steht hier als eine Zeile und nicht in drei Einträgen: der Präfix ist
 * derselbe wie auf der Lieferseite, und getippte Adressen sind die Sorte
 * Doppelung, die beim ersten Umzug auseinanderfällt.
 */
const kitBase = computed(() => `/api/brand/profiles/${encodeURIComponent(profileId.value)}/kit`)
const kitPageTo = computed(() => localePath(`/brand/${profileId.value}/kit`))

/**
 * IST DIE ABLEITUNG FREIGESCHALTET? — gefragt wird die JOURNEY (`store.kitOpen`),
 * nicht `profile.derivationUnlockedAt`.
 *
 * Dieselbe Regel wie bei `designTo` oben: die Freischaltung ist nur die eine
 * Hälfte der Bedingung, die ganze Rechnung steht in der puren Regel, und hier
 * steht nur ihr Ergebnis. So sagt das Menü dasselbe wie die Leiste daneben.
 */
const kitOpen = computed(() => store.kitOpen)

/**
 * DAS EXPORT-MENÜ ZEIGT ALLE AUSGABEFORMEN DER SUITE — frei und gesperrt
 * nebeneinander, dieselbe Ehrlichkeit wie die visuelle Schranke. Ein Menü, das
 * nur „Drucken" kennt, verschweigt, was es noch gibt; ein Menü ohne Schloss
 * verspricht, was es nicht liefert.
 *
 * SEIT K6 SIND DIE DREI EINTRÄGE ECHT — sobald die Ableitung freigeschaltet
 * ist. Brand Context und Design-Tokens klappen zu ihren zwei Dateien auf
 * (`brand.md`/`brand.json`, `tokens.json`/`tokens.css`), Assets führt zum
 * Bündel und zur Lieferseite. Jeder Datei-Eintrag ist eine NAVIGATION auf die
 * Route, kein `$fetch`: nur so sieht der Browser den `Content-Disposition`-Kopf
 * und legt die Datei unter ihrem richtigen Namen ab.
 *
 * OHNE FREISCHALTUNG bleiben sie gesperrt wie zuvor — aber nicht mehr tot: das
 * Etikett führt auf die Lieferseite, und die zeigt die Schranke mit dem
 * Erstgespräch (§2.7). Ein Schloss, hinter dem gar nichts ist, erklärt nichts.
 *
 * OHNE PRESET sind die Token-Einträge `disabled` mit dem Grund daneben — die
 * Route antwortete darauf mit 409, und ein Download, der als Fehlerseite
 * endet, ist schlechter als ein Eintrag, der vorher sagt, was fehlt.
 */
const exportItems = computed<FdExportItem[][]>(() => {
  const kit = t('brand.foundation.export.kit')
  const needsDesign = t('brand.foundation.export.needsDesign')
  const hasDesign = Boolean(view.value?.designStand)

  const printGroup: FdExportItem[] = [{
    label: t('brand.foundation.export.print'),
    icon: 'i-ph-printer',
    sub: t('brand.foundation.export.printSub'),
    onSelect: print,
  }]

  if (!kitOpen.value) {
    return [
      printGroup,
      [
        {
          label: t('brand.foundation.export.context'),
          icon: 'i-ph-brackets-curly',
          sub: `${t('brand.foundation.export.contextSub')} · ${kit}`,
          locked: true,
          disabled: true,
        },
        {
          label: t('brand.foundation.export.tokens'),
          icon: 'i-ph-palette',
          sub: `${t('brand.foundation.export.tokensSub')} · ${kit}`,
          locked: true,
          disabled: true,
        },
        {
          label: t('brand.foundation.export.assets'),
          icon: 'i-ph-file-zip',
          sub: `${t('brand.foundation.export.assetsSub')} · ${kit}`,
          locked: true,
          disabled: true,
        },
        // Das Etikett wird ein Link zur Schranke (§2.7).
        {
          label: t('brand.foundation.export.gate'),
          icon: 'i-ph-arrow-right',
          sub: kit,
          to: kitPageTo.value,
        },
      ],
    ]
  }

  const file = (name: string): FdExportItem => ({
    label: name,
    to: `${kitBase.value}/${name}`,
    external: true,
    download: true,
  })

  return [
    printGroup,
    [
      {
        label: t('brand.foundation.export.context'),
        icon: 'i-ph-brackets-curly',
        sub: t('brand.foundation.export.contextSub'),
        children: [file('brand.md'), file('brand.json')],
      },
      {
        label: t('brand.foundation.export.tokens'),
        icon: 'i-ph-palette',
        sub: hasDesign ? t('brand.foundation.export.tokensSub') : needsDesign,
        ...(hasDesign
          ? { children: [file('tokens.json'), file('tokens.css')] }
          : { locked: true, disabled: true }),
      },
      {
        label: t('brand.foundation.export.assets'),
        icon: 'i-ph-file-zip',
        sub: t('brand.foundation.export.assetsSub'),
        children: [
          {
            label: t('brand.foundation.export.bundle'),
            to: `${kitBase.value}.zip`,
            external: true,
            download: true,
          },
          { label: t('brand.foundation.export.openKit'), to: kitPageTo.value },
        ],
      },
    ],
  ]
})

// ── Veröffentlichen (Discover §4.3) ───────────────────────────────────────

/**
 * VERÖFFENTLICHEN WOHNT NEBEN TEILEN, NICHT DARIN.
 *
 * Beide frieren denselben Stand ein, aber sie beantworten verschiedene Fragen.
 * Teilen heisst „EINE Person soll das lesen, 30 Tage, `noindex`".
 * Veröffentlichen heisst „ALLE dürfen das lesen, dauerhaft, indexierbar" — und
 * geht deshalb erst durch die Freigabe des Betreibers (§9.1). Ein gemeinsamer
 * Dialog mit einem Häkchen darin würde die grössere Zustimmung im Schatten der
 * kleineren einsammeln.
 */
const publication = computed(() => publicationRequest.data.value?.publication ?? {
  status: 'none' as const,
  slug: '',
  path: '',
  submittedAt: '',
  publishedAt: '',
  decidedAt: '',
  decisionNote: '',
  pendingUpdate: false,
  pendingDecision: null,
})

/**
 * WAS FEHLT NOCH? — die Antwort kommt vom SERVER (er liest die Kapitel-Zeilen
 * ohnehin), nicht aus einer zweiten Rechnung hier.
 *
 * Ist sie unbekannt (Route nicht erreichbar), gilt „darf es versuchen": der
 * Server setzt die Regel ohnehin durch, und ein grau gestellter Knopf ohne
 * Begründung wäre die schlechtere Auskunft von beiden.
 */
const publicationReadiness = computed(() => publicationRequest.data.value?.readiness
  ?? { allowed: true, blockers: [] })

const publishOpen = ref(false)
const publishConsent = ref(false)
const publishBusy = ref(false)
/** Der Brand Score für den Steckbrief — erst beim Öffnen geholt (s. u.). */
const publishScore = ref<number | null>(null)

/**
 * DIE ADRESSE IM DIALOG. Steht schon eine Veröffentlichung, ist es IHRE (der
 * Slug bleibt stabil, §4.2). Sonst die aus dem Titel gerechnete — dieselbe
 * pure Regel, die der Server benutzt. Bei Namensgleichheit hängt er eine Zahl
 * an; das sagt der Hinweis darunter, statt hier eine Zahl zu erfinden.
 */
const publicationAddress = computed(() => publication.value.path
  || brandPublicationPath(brandPublicationSlug(title.value, profileId.value)))

/**
 * Die Branche WÄHLT der Eigentümer im Dialog (Nachzug 2026-09-08): der Freitext
 * der Startkarte („Handwerksbäckerei") trifft den 16er-Katalog fast nie, und
 * „Nicht zugeordnet" wäre in der Galerie die Regel. Vorbelegt mit dem, was die
 * Normalisierung aus dem Freitext macht; reist als Katalog-Id mit.
 */
const publishIndustry = ref(normalizeBrandIndustry(store.profile?.startCard.industry ?? ''))
const publishIndustryItems = computed(() => BRAND_INDUSTRY_VALUES.map(id => ({
  value: id,
  label: t(`brand.industry.${id}`),
})))

const publicationPathKind = computed(() => t(
  `brand.brands.card.path.${store.profile?.pathKind === 'relaunch' ? 'relaunch' : 'new'}`,
))

const publicationStand = computed(() => formatDate(store.profile?.lastActivityAt ?? ''))

async function openPublish(): Promise<void> {
  publishConsent.value = false
  publishOpen.value = true
  // Der Score ist eine ANGABE im Steckbrief und kein Recht: er wird erst beim
  // Öffnen geholt (eine Seite, die niemand veröffentlicht, soll dafür keine
  // Abfrage kosten) und sein Ausbleiben kostet nur eine Zeile.
  try {
    const scores = await $fetch<BrandProfileScoresResponse>('/api/brand/profiles/scores')
    const entry = scores.items.find(item => item.profileId === profileId.value)
    publishScore.value = entry?.website?.score ?? entry?.document?.score ?? null
  }
  catch {
    publishScore.value = null
  }
}

async function submitPublication(): Promise<void> {
  if (publishBusy.value) return
  publishBusy.value = true
  try {
    const result = await $fetch<BrandPublicationResponse>(
      `/api/brand/profiles/${profileId.value}/publication`,
      // Das Häkchen reist MIT: es ist die Zustimmung selbst, nicht ihre Anzeige
      // (Schema `createBrandPublicationSubmitSchema`).
      { method: 'POST', body: { consent: true, industry: publishIndustry.value } },
    )
    publicationRequest.data.value = result
    publishOpen.value = false
    toast.add({ title: t('brand.publication.submittedToast') })
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } }).data?.reason
    if (reason === 'publication_not_ready') {
      // Der Server weiss mehr als der Dialog (jemand hat inzwischen eine
      // Abnahme zurückgenommen) — also neu fragen, statt zu raten.
      await publicationRequest.refresh()
      toast.add({ title: t('brand.publication.notReady'), color: 'error' })
    }
    else if (reason === 'publication_limit') {
      toast.add({ title: t('brand.publication.limited'), color: 'error' })
    }
    else {
      toast.add({ title: t('brand.publication.failed'), color: 'error' })
    }
  }
  finally {
    publishBusy.value = false
  }
}

async function withdrawPublication(): Promise<void> {
  if (publishBusy.value) return
  publishBusy.value = true
  try {
    const result = await $fetch<BrandPublicationResponse>(
      `/api/brand/profiles/${profileId.value}/publication`,
      { method: 'DELETE' },
    )
    publicationRequest.data.value = result
    toast.add({ title: t('brand.publication.withdrawnToast') })
  }
  catch {
    toast.add({ title: t('brand.publication.failed'), color: 'error' })
  }
  finally {
    publishBusy.value = false
  }
}

// ── Die Leiste (§11) ──────────────────────────────────────────────────────

/**
 * DIESELBE LEISTE WIE IN WERKSTATT UND DOKUMENT. Der letzte Eintrag ist DIESE
 * Seite (s. `useBrandFoundationRailStep`), „Euer Branding" steht davor und
 * trägt sein Ziel.
 */
const navExtras = useBrandWorkspaceNavExtras({
  // Befunde kennt diese Seite nicht: die Leseansicht zeigt keine (§2.3), also
  // lädt sie auch keine. Ohne sie fehlt an einem Zusatz-Eintrag nur der
  // Zähler — ein fehlender Zähler behauptet nichts, ein erfundener schon.
  profileId,
  findings: () => store.findings,
})

const foundationStep = useBrandFoundationRailStep({ profileId, active: true })

const railLayers = computed<BwRailLayer[]>(() => [{
  id: 'foundation',
  label: t('brand.workspace.railLayer'),
  steps: [
    // Dokument, dann Foundation (§2.6) — die LESEANSICHT ist ein eigener
    // Punkt am Ende; das Kapitel „Ergebnis" steht an seiner Registry-Stelle
    // (Testlauf-Befund 8, 2026-09-09).
    ...store.railSteps
      .map((entry): BwRailStep => ({
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
    foundationStep.value,
    // Zusatz-Einträge fremder Layer (MV1 M4) — heute „Markt".
    ...navExtras.value,
  ],
}])

const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }

const sidebarBrands = computed<BwSidebarBrand[]>(() => store.profiles.map(profile => ({
  id: profile.id,
  title: profile.title || t('brand.brands.card.untitled'),
  path: t(`brand.brands.card.path.${profile.pathKind}`),
  flag: LOCALE_FLAGS[profile.contentLocale],
  to: localePath(`/brand/${profile.id}/${profile.currentStepKey}`),
  current: profile.id === profileId.value,
})))

/* Dieselben zwei Zustände wie in Werkstatt und Dokument (Audit A7): ab 768 px
 * klappt der Knopf die SPALTE ein, darunter öffnet er sie als Overlay. */
const railCollapsed = ref(false)
const tocCollapsed = ref(false)
const navOverlayOpen = ref(false)
const isNarrow = ref(false)
/**
 * DER ZWEITE UMBRUCH — genau der, an dem die Kopfknöpfe verschwinden
 * (`max-sm:hidden`, also < 640 px). Er ist NICHT derselbe wie `isNarrow`
 * (< 768 px, dort klappt die Navigation um): mit nur einer Messung stünden
 * zwischen 640 und 768 px „Teilen" und „Veröffentlichen" doppelt da — einmal
 * als Knopf, einmal im Menü.
 */
const isCompact = ref(false)
let narrowMq: MediaQueryList | null = null
let compactMq: MediaQueryList | null = null
const onNarrow = (event: MediaQueryListEvent | MediaQueryList): void => {
  isNarrow.value = event.matches
  if (!event.matches) navOverlayOpen.value = false
}
const onCompact = (event: MediaQueryListEvent | MediaQueryList): void => {
  isCompact.value = event.matches
}
onMounted(() => {
  narrowMq = window.matchMedia('(max-width: 767px)')
  onNarrow(narrowMq)
  narrowMq.addEventListener('change', onNarrow)
  compactMq = window.matchMedia('(max-width: 639px)')
  onCompact(compactMq)
  compactMq.addEventListener('change', onCompact)
})
onBeforeUnmount(() => {
  narrowMq?.removeEventListener('change', onNarrow)
  compactMq?.removeEventListener('change', onCompact)
})

/**
 * DAS MENÜ AUF KLEINEN BILDSCHIRMEN (Discover-Entscheidung 7: „Veröffentlichen
 * wandert auf kleinen Bildschirmen ins Export-Menü — erreichbar, aber eine
 * bewusste Entscheidung, kein Schnellklick").
 *
 * „Teilen" wandert mit: es verschwindet an derselben Kante, und ein Menü, das
 * die eine Handlung auffängt und die andere fallen lässt, wäre willkürlich.
 */
const exportMenuItems = computed<FdExportItem[][]>(() => (isCompact.value
  ? [
      [
        { label: t('brand.foundation.share.button'), icon: 'i-ph-share-network', onSelect: openShare },
        { label: t('brand.publication.button'), icon: 'i-ph-globe-hemisphere-west', onSelect: openPublish },
      ],
      ...exportItems.value,
    ]
  : exportItems.value))

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

useBrandTitle(() => (title.value || t('brand.foundation.title')))
</script>

<template>
  <BwWorkspace
    v-model:rail-overlay="navOverlayOpen"
    class="fd-page"
    :progress-pct="acceptedPct"
    :content-locale="contentLocale"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="tocCollapsed"
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
            {{ t('brand.foundation.title') }}
          </p>
          <p class="truncate font-semibold">{{ title }}</p>
        </div>

        <!-- KEIN „Bearbeiten" (§2.6): korrigiert wird in der Werkstatt. -->
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" icon="i-ph-share-network"
            :label="t('brand.foundation.share.button')" class="max-sm:hidden"
            @click="openShare"
          />
          <!-- Veröffentlichen steht NEBEN Teilen, nicht darin (s. Kopf des
               Abschnitts im Skript). Auf kleinen Bildschirmen wandert es ins
               Menü rechts (Entscheidung 7). -->
          <UButton
            size="sm" color="neutral" variant="ghost" icon="i-ph-globe-hemisphere-west"
            :label="t('brand.publication.button')" class="max-sm:hidden"
            @click="openPublish"
          />
          <UDropdownMenu
            :items="exportMenuItems" :content="{ align: 'end' }"
            :ui="{ content: 'bw-root bw-overlay w-72' }"
          >
            <!-- Das Menü bleibt auf kleinen Bildschirmen SICHTBAR: dort ist es
                 der einzige Weg zu Teilen und Veröffentlichen. -->
            <UButton
              size="sm" color="neutral" variant="ghost" icon="i-ph-export"
              :label="t('brand.foundation.export.label')"
            />
            <template #item="{ item }">
              <UIcon v-if="item.icon" :name="item.icon" class="size-4 flex-none" style="color: var(--bw-muted)" />
              <span class="min-w-0 flex-1 text-left leading-tight">
                <span class="block truncate">{{ item.label }}</span>
                <span v-if="item.sub" class="bw-label block truncate" style="color: var(--bw-muted)">{{ item.sub }}</span>
              </span>
              <UIcon v-if="item.locked" name="i-ph-lock-simple" class="size-4 flex-none" style="color: var(--bw-muted)" />
            </template>
          </UDropdownMenu>
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-md:hidden"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="tocCollapsed ? t('brand.foundation.showToc') : t('brand.foundation.hideToc')"
            @click="tocCollapsed = !tocCollapsed"
          />
        </div>
      </div>
    </template>

    <!-- MITTE: das Handbuch in LESEBREITE (§2.6). -->
    <template #default>
      <div class="fd-read mx-auto flex max-w-3xl flex-col gap-10 pb-6">
        <!-- Nur im Druck: Kopfzeile mit Marke auf jeder Seite. -->
        <p class="fd-print-head bw-label">{{ title }} · {{ t('brand.foundation.title') }}</p>

        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.title') }}
          </p>
          <h1 class="mt-1 text-4xl font-extralight leading-tight tracking-tight">{{ title }}</h1>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">
            {{ t('brand.foundation.counter', { accepted: accepted.chapters, total: accepted.total }) }}
            ·
            {{ t('brand.foundation.contentLocale', { locale: contentLocale.toUpperCase() }) }}
          </p>

          <!-- DER VERÖFFENTLICHUNGS-ZUSTAND (§4.3) — er steht im KOPF des
               Dokuments, weil er über das GANZE Dokument etwas aussagt.
               `pendingUpdate` ist der Fall „öffentlich, und ein neuer Stand
               wartet": beides ist wahr, also steht auch beides da. -->
          <div v-if="publication.status === 'pending' && !publication.pendingUpdate" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="bw-state bw-state--draft">{{ t('brand.publication.state.pending') }}</span>
            <p class="bw-label" style="color: var(--bw-muted)">
              {{ t('brand.publication.state.pendingAddress', { address: publication.path }) }}
            </p>
            <UButton
              size="xs" color="neutral" variant="ghost" :label="t('brand.publication.state.withdraw')"
              :disabled="publishBusy" @click="withdrawPublication"
            />
          </div>
          <div v-else-if="publication.status === 'published' || publication.pendingUpdate" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span class="bw-state bw-state--confirmed">{{ t('brand.publication.state.public') }}</span>
            <p class="bw-label" style="color: var(--bw-muted)">
              {{ t('brand.publication.state.publicSince', { date: formatDate(publication.publishedAt) }) }} ·
              <!-- Die Anatomie-Seite gibt es erst mit Paket D2; der Link zeigt
                   schon dorthin, weil die Adresse ab der Freigabe gilt. -->
              <NuxtLink :to="localePath(publication.path)" class="underline underline-offset-4">{{ publication.path }}</NuxtLink>
            </p>
            <span v-if="publication.pendingUpdate" class="bw-state bw-state--draft">
              {{ t('brand.publication.state.pendingUpdate') }}
            </span>
            <!-- „Aktualisierung abgelehnt" (Paket D3): die Marke steht weiter
                 öffentlich, der eingereichte Stand wurde abgelehnt. Das ist
                 ein ANDERER Satz als „Abgelehnt" weiter unten — dort ist die
                 Marke nicht draussen, hier ist sie es. Der Server unterscheidet
                 die zwei Fälle in `pendingDecision`; die Seite rechnet nicht
                 selbst nach. -->
            <span v-if="publication.pendingDecision" class="bw-state bw-state--stale">
              {{ t('brand.publication.state.updateDeclined') }}
            </span>
            <p
              v-if="publication.pendingDecision"
              class="w-full max-w-xl text-sm leading-relaxed"
              style="color: var(--bw-ink-soft)"
              data-publication-update-declined
            >
              {{ publication.pendingDecision.note }}
            </p>
            <span class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="!publication.pendingUpdate"
                size="xs" color="neutral" variant="outline" class="rounded-full"
                :label="t('brand.publication.state.update')" :disabled="publishBusy"
                @click="openPublish"
              />
              <UButton
                size="xs" color="neutral" variant="ghost" :label="t('brand.publication.state.withdraw')"
                :disabled="publishBusy" @click="withdrawPublication"
              />
            </span>
          </div>
          <div v-else-if="publication.status === 'declined'" class="mt-4">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="bw-state bw-state--stale">{{ t('brand.publication.state.declined') }}</span>
              <p v-if="publication.decidedAt" class="bw-label" style="color: var(--bw-muted)">
                {{ t('brand.publication.state.decidedAt', { date: formatDate(publication.decidedAt) }) }}
              </p>
            </div>
            <p v-if="publication.decisionNote" class="mt-2 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ publication.decisionNote }}
            </p>
            <UButton
              size="xs" color="neutral" variant="outline" class="mt-3 rounded-full"
              :label="t('brand.publication.state.resubmit')" :disabled="publishBusy"
              @click="openPublish"
            />
          </div>
          <!-- AUSGEBLENDET ist eine Sackgasse (Regel in `brandPublication.ts`):
               kein „erneut einreichen", sondern der Weg über den Betreiber. -->
          <div v-else-if="publication.status === 'hidden'" class="mt-4">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="bw-state bw-state--stale">{{ t('brand.publication.state.hidden') }}</span>
            </div>
            <p v-if="publication.decisionNote" class="mt-2 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ publication.decisionNote }}
            </p>
            <p class="bw-pending mt-2">{{ t('brand.publication.state.hiddenHint') }}</p>
          </div>
        </div>

        <p v-if="doc.error.value" class="bw-pending">{{ t('brand.foundation.loadFailed') }}</p>
        <p v-else-if="!chapters.length" class="bw-pending">{{ t('brand.foundation.empty') }}</p>

        <!-- „AUF EINER SEITE" (§1.5): der Schnellzugriff über Kapitel 0 —
             kein eigenes Kapitel, nur vorhandene Felder. -->
        <div v-if="hasOnePage" class="bw-card p-8">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.onePage.title') }}
          </p>
          <p v-if="onePage.purpose" class="mt-4 text-lg font-extralight leading-snug tracking-tight">
            {{ onePage.purpose }}
          </p>
          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            <div v-if="onePage.values.length">
              <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.onePage.values') }}</p>
              <ul class="mt-2 space-y-2">
                <li v-for="(value, index) in onePage.values" :key="index">
                  <p class="text-sm font-medium">{{ value.title }}</p>
                  <p v-if="value.text" class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ value.text }}</p>
                </li>
              </ul>
            </div>
            <div class="space-y-4">
              <div v-if="onePage.archetype">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.onePage.archetype') }}</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ onePage.archetype }}</p>
              </div>
              <div v-if="onePage.tagline">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.onePage.tagline') }}</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ onePage.tagline }}</p>
              </div>
              <div v-if="onePage.wallLine">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.onePage.wallLine') }}</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ onePage.wallLine }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Die Kapitel — EIN Renderer für beide Ansichten (§2.1). Die `id`
             sitzt in der Komponente und ist die Sprungmarke des
             Inhaltsverzeichnisses rechts. -->
        <BwFoundationChapter
          v-for="(entry, index) in chapters" :key="entry.chapter.id"
          :chapter="entry.chapter" :index="index"
          :acceptance-to="entry.acceptanceTo"
          :direction-to="directionTo"
          :design-to="designTo"
          :design-unlocked-at="store.profile?.designUnlockedAt ?? null"
          :design-board-to="designBoardTo"
          :design-stand="designStand"
          variant="private"
        />
      </div>
    </template>

    <!-- RECHTS: das Inhaltsverzeichnis mit Sprungmarken — dieselbe Stelle, an
         der das Arbeits-Dokument seinen Stand zeigt. Hier IST der Stand die
         Kapitel-Liste (Haken · Kreis · Schloss), unten der Zähler. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- `UPageAside` ist im Vorbild ein sticky Seitenrand unter dem
             Header; hier lebt sie in der scrollenden Spalte des Workspace —
             deshalb `static` statt `sticky` und keine Header-Höhe. -->
        <UPageAside
          :ui="{
            root: 'block static min-h-0 flex-1 overflow-y-auto max-h-none px-6 py-4 lg:ps-6 lg:ms-0 lg:pe-6 lg:max-h-none lg:static',
            container: 'relative',
          }"
        >
          <BwReadingToc :links="tocLinks" :title="t('brand.foundation.toc')" />
        </UPageAside>

        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="acceptedPct"
            :progress-title="t('brand.foundation.standProgress')"
            :progress-count="`${accepted.chapters}/${accepted.total}`"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>

  <!-- DER SHARE-DIALOG (§2.6). `bw-root` sitzt am INHALT, nicht am Wirt: das
       Modal rendert in einem Teleport ausserhalb des Werkstatt-Baums, und ohne
       den Token-Wirt stünde es dort ohne Farben da. Kein `v-if` am offenen
       Dialog (Reka-Regel) — `v-model:open` schaltet ihn. -->
  <UModal v-model:open="shareOpen">
    <template #content>
      <div class="bw-root relative max-h-[85vh] overflow-y-auto p-8" style="background: var(--bw-surface-hi)">
        <button
          class="absolute right-5 top-5 grid size-8 place-items-center rounded-full"
          :aria-label="t('brand.foundation.share.close')"
          @click="shareOpen = false"
        >
          <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
        </button>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('brand.foundation.share.eyebrow') }}
        </p>
        <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">
          {{ t('brand.foundation.share.title') }}
        </h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.foundation.share.intro') }}
        </p>

        <!-- ZWEI LISTEN, WEIL ES ZWEI FRAGEN SIND. „Bleibt drin" ist die
             wichtigere: sie ist die Zusage, die der Filter beim Einfrieren
             und der Renderer beim Lesen halten (§2.8). -->
        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
            <p class="bw-label" style="color: var(--bw-accent)">{{ t('brand.foundation.share.visible.title') }}</p>
            <ul class="mt-2 space-y-1.5 text-sm" style="color: var(--bw-ink-soft)">
              <li>{{ t('brand.foundation.share.visible.story') }}</li>
              <li>{{ t('brand.foundation.share.visible.chapters') }}</li>
              <li>{{ t('brand.foundation.share.visible.stand') }}</li>
            </ul>
          </div>
          <div class="rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
            <p class="bw-label" style="color: var(--bw-stale)">{{ t('brand.foundation.share.hidden.title') }}</p>
            <ul class="mt-2 space-y-1.5 text-sm" style="color: var(--bw-ink-soft)">
              <li>{{ t('brand.foundation.share.hidden.chats') }}</li>
              <li>{{ t('brand.foundation.share.hidden.drafts') }}</li>
              <li>{{ t('brand.foundation.share.hidden.competitors') }}</li>
              <li>{{ t('brand.foundation.share.hidden.meta') }}</li>
            </ul>
          </div>
        </div>

        <!-- Das Ablaufdatum ist ECHT, sobald es einen Link gibt; vorher steht
             dort nur die Frist. Ein erfundenes Datum wäre eine Zusage. -->
        <p class="bw-label mt-5" style="color: var(--bw-muted)">
          <template v-if="shareActive">{{ t('brand.foundation.share.activeUntil', { date: formatDate(shareActive.expiresAt) }) }}</template>
          <template v-else>{{ t('brand.foundation.share.expires') }}</template>
        </p>

        <!-- Der Link steht NUR direkt nach dem Erzeugen (s. Kopf). -->
        <div v-if="shareUrl" class="mt-4 flex flex-wrap items-center gap-2">
          <input
            :value="shareUrl" readonly
            :aria-label="t('brand.foundation.share.linkLabel')"
            class="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm"
            style="background: var(--bw-surface); color: var(--bw-ink-soft)"
          >
          <UButton
            :label="shareCopied ? t('brand.foundation.share.copied') : t('brand.foundation.share.copy')"
            :icon="shareCopied ? 'i-ph-check' : 'i-ph-copy'"
            color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
            @click="copyShareUrl"
          />
          <!-- DAS NATIVE TEILEN-BLATT (Entscheidung 7). Nur dort, wo es das
               gibt — sonst bleibt es bei „Link kopieren" daneben. -->
          <UButton
            v-if="canNativeShare"
            :label="t('brand.foundation.share.native')" icon="i-ph-share-fat"
            color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
            @click="nativeShare(shareUrl, title)"
          />
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton
            class="rounded-full" icon="i-ph-link"
            :label="shareActive ? t('brand.foundation.share.rotate') : t('brand.foundation.share.create')"
            :loading="shareBusy || shareLoading" :disabled="shareBusy || shareLoading"
            @click="createShareLink"
          />
          <UButton
            v-if="shareUrl" :to="shareUrl" target="_blank" rel="noopener noreferrer"
            color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
            trailing-icon="i-ph-arrow-up-right" :label="t('brand.foundation.share.open')"
          />
          <UButton
            v-if="shareActive" color="neutral" variant="ghost"
            :label="t('brand.foundation.share.revoke')"
            :disabled="shareBusy || shareLoading"
            @click="revokeShareLink"
          />
        </div>

        <p v-if="shareUrl" class="bw-pending mt-4">{{ t('brand.foundation.share.onceHint') }}</p>
        <p class="bw-pending mt-2">{{ t('brand.foundation.share.replacesHint') }}</p>
      </div>
    </template>
  </UModal>

  <!-- VERÖFFENTLICHEN (§4.3). Der Dialog zeigt VORHER den Steckbrief, der in
       der Galerie stehen wird: was öffentlich wird, soll man vor dem Häkchen
       sehen und nicht danach. -->
  <UModal v-model:open="publishOpen">
    <template #content>
      <div class="bw-root relative max-h-[85vh] overflow-y-auto p-8" style="background: var(--bw-surface-hi)">
        <button
          class="absolute right-5 top-5 grid size-8 place-items-center rounded-full"
          :aria-label="t('brand.publication.close')"
          @click="publishOpen = false"
        >
          <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
        </button>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('brand.publication.eyebrow') }}
        </p>
        <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">
          {{ t('brand.publication.title') }}
        </h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.publication.intro') }}
        </p>

        <div class="mt-6 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
          <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.title') }}</p>
          <dl class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.brandTitle') }}</dt>
              <dd class="text-sm">{{ title || t('brand.brands.card.untitled') }}</dd>
            </div>
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.address') }}</dt>
              <dd class="text-sm">{{ publicationAddress }}</dd>
            </div>
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.industry') }}</dt>
              <dd class="text-sm">
                <USelect
                  v-model="publishIndustry"
                  :items="publishIndustryItems"
                  size="sm"
                  class="w-full"
                  data-publish-industry
                />
              </dd>
            </div>
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.path') }}</dt>
              <dd class="text-sm">{{ publicationPathKind }}</dd>
            </div>
            <div v-if="onePage.archetype">
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.archetype') }}</dt>
              <dd class="text-sm">{{ onePage.archetype }}</dd>
            </div>
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.locale') }}</dt>
              <dd class="text-sm">{{ contentLocale.toUpperCase() }}</dd>
            </div>
            <div v-if="publicationStand">
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.stand') }}</dt>
              <dd class="text-sm">{{ publicationStand }}</dd>
            </div>
            <div>
              <dt class="bw-label" style="color: var(--bw-muted)">{{ t('brand.publication.summary.score') }}</dt>
              <!-- Zwei Zahlen wären hier eine zu viel: gezeigt wird der
                   Website-Score, sonst der des Fundaments (Entscheidung 3);
                   ohne Check steht ein Strich statt einer erfundenen Zahl. -->
              <dd class="text-sm">
                {{ publishScore === null ? t('brand.publication.summary.scoreEmpty') : publishScore }}
              </dd>
            </div>
          </dl>
        </div>

        <p class="bw-pending mt-4">{{ t('brand.publication.hidden') }}</p>
        <p class="bw-pending mt-2">{{ t('brand.publication.addressHint') }}</p>

        <!-- WAS NOCH FEHLT (§3.3) — die Liste steht VOR dem Häkchen, weil sie
             die Antwort auf „warum kann ich nicht?" ist. -->
        <div v-if="!publicationReadiness.allowed" class="mt-5 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
          <p class="bw-label" style="color: var(--bw-stale)">{{ t('brand.publication.blocker.title') }}</p>
          <ul class="mt-2 space-y-1.5 text-sm" style="color: var(--bw-ink-soft)">
            <li v-for="blocker in publicationReadiness.blockers" :key="blocker">
              {{ t(`brand.publication.blocker.${blocker}`) }}
            </li>
          </ul>
        </div>

        <UCheckbox
          v-model="publishConsent"
          class="mt-5"
          :disabled="!publicationReadiness.allowed"
          :label="t('brand.publication.consent')"
        />

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <UButton
            class="rounded-full" :label="t('brand.publication.submit')"
            :loading="publishBusy"
            :disabled="!publishConsent || publishBusy || !publicationReadiness.allowed"
            @click="submitPublication"
          />
          <UButton
            color="neutral" variant="ghost" :label="t('brand.publication.cancel')"
            @click="publishOpen = false"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style>
/* DRUCK (§2.6). Nicht `scoped`: die Zonen der Werkstatt (Leiste, Balken,
 * Inhaltsverzeichnis) sind fremde Komponenten, an die eine scoped Regel nicht
 * heranreicht. Die Klasse `.fd-page` am Werkstatt-Wurzelknoten hält die Regeln
 * trotzdem bei DIESER Seite. Der Seitenumbruch je Kapitel wohnt in
 * `BwFoundationChapter`. */
.fd-print-head { display: none; }
@media print {
  .fd-page header,
  .fd-page .bw-rail,
  .fd-page .bw-stage-bar,
  .fd-page .bw-george,
  .fd-page .bw-modeswitch { display: none !important; }
  .fd-page,
  .fd-page .bw-shell { display: block !important; height: auto !important; }
  .fd-page .bw-stage { overflow: visible !important; padding: 0 !important; }
  .fd-page .bw-stage-inner { max-width: none !important; }
  .fd-page .fd-read { max-width: none !important; }
  .fd-page .fd-print-head { display: block; }
  .fd-page .bw-card {
    box-shadow: none !important;
    background: transparent !important;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
}
</style>
