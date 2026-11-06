<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { BwSidebarBrand } from '../../../components/BwWorkspaceSidebar.vue'
import type { BwRailLayer, BwRailStep } from '../../../components/BwProgressRail.vue'
import { brandKitStandStamp } from '../../../../shared/brandKitFiles'
import { brandLicenseNote, brandLicenseRows } from '../../../../shared/brandKitLicenses'
import { resolveBrandTokenAlias } from '../../../../shared/brandTokensCss'
import { BRAND_RAMP_SHADES } from '../../../../shared/types/brand'
import {
  BRAND_TOKEN_EXTENSION_CONTRAST,
  type BrandContextJsonBlock,
  type BrandContextJson,
  type BrandKitManifest,
  type BrandKitManifestMark,
  type BrandTokenFile,
} from '../../../../shared/types/brandKit'
import { useBrandWorkspaceStore } from '../../../stores/brandWorkspace'
import { useBrandFoundationRailStep } from '../../../composables/useBrandFoundationRailStep'

/**
 * DIE LIEFERSEITE `/brand/:id/kit` (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.1/§2.7, Prototyp `.playground/app/pages/brand/demo/kit/index.vue`,
 * Paket K6).
 *
 * ── SIE IST EINE EIGENE SEITE, KEIN VIERTES KAPITEL (§2.20 Nr. 2) ────────
 * Hier wird nichts entschieden und nichts gespeichert. Die Hülle ist deshalb
 * die des Ergebnis-Boards (`design.vue`): breite Bühne, Rail links, und rechts
 * NICHT das Inhaltsverzeichnis, sondern der Weg zurück in die Kapitel —
 * korrigiert wird dort, nie hier.
 *
 * ── DIE STATISCHE DATEI SCHLÄGT `[stepKey].vue` ──────────────────────────
 * `kit` ist kein Baustein der Registry; die Seite `[profileId]/kit.vue`
 * gewinnt gegen `[profileId]/[stepKey].vue`, weil Nuxt statische Segmente vor
 * dynamische sortiert (dasselbe Muster wie `foundation.vue`, `document.vue`
 * und `design.vue`).
 *
 * ── WOHER DIE DATEN KOMMEN, UND WARUM NICHT ALLES AUS DEM MANIFEST ───────
 * Das MANIFEST (`GET …/kit`) ist die Auskunft der Seite: Marke, Stand, welche
 * Dateien es gibt, wie sie heissen, wie gross sie sind, die Zeichen und der
 * Name des Bündels. Es bucht NICHTS auf den Tages-Eimer (§2.11).
 *
 * Die VORSCHAUEN kommen aus den echten Datei-Routen — dieselben Dateien, die
 * ein Mensch lädt, nie eine zweite Rechnung daneben. Sie kosten je einen
 * Eimer-Treffer, und deshalb holt die Seite genau DREI davon beim Öffnen
 * (`brand.md`, `brand.json`, `tokens.json`) und die zwei übrigen erst auf
 * Verlangen (`tokens.css` beim Reiterwechsel). Drei von sechzig je Besuch —
 * das trägt zwanzig Besuche am Tag, und der Deckel bleibt, wofür er da ist:
 * gegen ein Skript, das das Bündel im Kreis anstösst.
 *
 * `brand.json` verdient dabei seinen Treffer dreifach: es ist die Vorschau
 * SELBST, es trägt den Pressekit-Abschnitt, und sein `design`-Feld ist das
 * Snapshot-Preset — daraus rechnet die Lizenz-Tabelle rein, ohne `LICENSES.md`
 * ein viertes Mal zu holen.
 *
 * Die ZEICHEN stehen fertig im Manifest (`marks[].svg`). Sie einzeln zu holen
 * wären acht weitere Treffer je Seitenaufruf — nach sechs Besuchen stünde ein
 * Mensch an einer Schranke, die er nie erreichen soll. Der Knopf „Laden" führt
 * trotzdem auf die echte Route: geladen wird, was ausgeliefert wird.
 *
 * ── DOWNLOADS SIND ECHTE NAVIGATION, KEIN `$fetch` ───────────────────────
 * Jeder „Laden"-Knopf ist ein `<a href download>` auf die Route. Nur so
 * bekommt der Browser den `Content-Disposition`-Kopf zu sehen, nur so landet
 * die Datei mit dem richtigen Namen im Ordner — und nur so sieht ein
 * Klick-Beweis den Download.
 */
definePageMeta({ layout: 'brand-workspace' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()

const profileId = computed(() => String(route.params.profileId ?? ''))
const apiBase = computed(() => `/api/brand/profiles/${encodeURIComponent(profileId.value)}/kit`)

/**
 * DREI AUSGÄNGE STATT EINES WURFS: `ok`, `locked`, `missing`.
 *
 * `useAsyncData` kennt nur Daten oder Fehler; die Seite muss aber zwischen
 * „gibt es nicht" (404, Fehlerseite wie überall) und „gibt es, ist aber nicht
 * freigeschaltet" (403 `derivation_locked`, SCHRANKE mit Erstgespräch)
 * unterscheiden. Der Umschlag des Core trägt den Grund als `reason`
 * (CLAUDE.md); hier wird daraus ein Zustand, kein Fehler.
 */
type KitState =
  | { kind: 'ok', manifest: BrandKitManifest }
  | { kind: 'locked' }
  | { kind: 'missing' }

interface KitFetchError { statusCode?: number, data?: { reason?: string } }

const doc = await useAsyncData<KitState>(
  () => `brand-kit-${profileId.value}`,
  async (): Promise<KitState> => {
    try {
      return { kind: 'ok', manifest: await request<BrandKitManifest>(apiBase.value) }
    }
    catch (error) {
      const failure = error as KitFetchError
      if (failure.statusCode === 403) return { kind: 'locked' }
      return { kind: 'missing' }
    }
  },
  { watch: [profileId], default: (): KitState => ({ kind: 'missing' }) },
)

const shell = await useAsyncData<{ found: boolean } | null>(
  () => `brand-kit-shell-${profileId.value}`,
  async () => {
    const found = await store.loadProfile(profileId.value, request)
    await store.loadProfiles(request).catch(() => {})
    return { found }
  },
  { watch: [profileId], default: () => null },
)

if (doc.data.value?.kind === 'missing' || (shell.data.value && !shell.data.value.found)) {
  throw createError({ status: 404, statusText: 'Unknown brand profile' })
}

const locked = computed(() => doc.data.value?.kind === 'locked')
const manifest = computed<BrandKitManifest | null>(
  () => (doc.data.value?.kind === 'ok' ? doc.data.value.manifest : null),
)
const designReady = computed(() => manifest.value?.designReady ?? false)
const title = computed(() => store.profile?.title || manifest.value?.title || '')
/*
 * DIE INHALTSSPRACHE — Manifest, dann Profil, dann die Oberflächen-Sprache.
 *
 * Der letzte Rückfall ist nicht Kosmetik: `BwWorkspace` verlangt einen String,
 * und beim ersten Rendern (SSR, Fehlerfall, Marken-Wechsel) steht weder das
 * eine noch das andere schon da. `undefined` gab dort eine Prop-Warnung und
 * eine Leiste ohne Sprach-Angabe.
 */
const contentLocale = computed(() => manifest.value?.contentLocale
  || store.profile?.contentLocale
  || locale.value)

/**
 * DER STAND IM KOPF IST DERSELBE TAG WIE IM DATEINAMEN (live erwischt).
 *
 * `brandKitStandStamp` schneidet den KALENDERTAG aus dem ISO-Stempel, also in
 * UTC — dieser Tag steht in jedem Download-Namen. Formatierte man den
 * Zeitpunkt daneben in der Zone des Lesers, zeigte der Kopf abends „9.
 * September", während das Bündel `…-2026-09-10.zip` heißt: zwei Daten für
 * einen Stand, und der Satz „trägt den Stand im Namen" wäre falsch. Deshalb
 * wird HIER der Stempel gelesen und in UTC formatiert, nicht der Zeitpunkt.
 */
const stand = computed(() => {
  const stamp = brandKitStandStamp(manifest.value?.stand ?? '')
  if (!stamp) return ''
  const value = Date.parse(`${stamp}T12:00:00Z`)
  return Number.isFinite(value)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeZone: 'UTC' }).format(value)
    : ''
})

const callCta = useBrandCompletionCta()

// ── Die Dateien ───────────────────────────────────────────────────────────

/** Die Adresse einer Registry-Datei — dieselbe, die der Download benutzt. */
function fileHref(id: string): string {
  return `${apiBase.value}/${encodeURIComponent(id)}`
}

function markHref(mark: BrandKitManifestMark): string {
  return `${apiBase.value}/marks/${encodeURIComponent(mark.filename)}`
}

const bundleHref = computed(() => `${apiBase.value}.zip`)

/** Der Dateiname eines Registry-Eintrags aus dem Manifest (mit Stand). */
function downloadName(id: string): string {
  return manifest.value?.files.find(file => file.id === id)?.filename ?? id
}

function fileAvailable(id: string): boolean {
  return manifest.value?.files.find(file => file.id === id)?.available ?? false
}

/**
 * EINE VORSCHAU HOLEN — im BROWSER, nie beim Server-Rendern.
 *
 * `server: false` mit Absicht (dieselbe Regel wie `useBrandKitWorkshop`): die
 * Antworten sind `private, no-store` und haben im ausgelieferten HTML nichts
 * verloren. `immediate` entscheidet, ob sie beim Öffnen kommt oder erst auf
 * Verlangen — daran hängt der Eimer (s. Kopf).
 */
function useLazyPreview(id: string, ready: () => boolean, immediate: boolean) {
  const state = useAsyncData<string>(
    `brand-kit-preview-${id}-${profileId.value}`,
    () => request<string>(fileHref(id), { responseType: 'text' }),
    { server: false, immediate: false, default: () => '', watch: [profileId] },
  )
  const load = (): void => {
    if (!ready() || state.status.value !== 'idle') return
    void state.execute()
  }
  if (immediate) onMounted(load)
  return { ...state, load }
}

const brandMd = useLazyPreview('brand.md', () => fileAvailable('brand.md'), true)
const brandJsonText = useLazyPreview('brand.json', () => fileAvailable('brand.json'), true)
const tokensJsonText = useLazyPreview('tokens.json', () => designReady.value, true)
const tokensCssText = useLazyPreview('tokens.css', () => designReady.value, false)

/** `brand.json` als Objekt — Quelle für Pressekit-Vorschau und Lizenzen. */
const brandJson = computed<BrandContextJson | null>(() => {
  if (!brandJsonText.data.value) return null
  try {
    return JSON.parse(brandJsonText.data.value) as BrandContextJson
  }
  catch {
    return null
  }
})

const tokens = computed<BrandTokenFile | null>(() => {
  if (!tokensJsonText.data.value) return null
  try {
    return JSON.parse(tokensJsonText.data.value) as BrandTokenFile
  }
  catch {
    return null
  }
})

// ── Kopieren (echt, wie im Prototyp) ──────────────────────────────────────

const copied = ref('')

async function copyText(id: string, text: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = id
    window.setTimeout(() => { if (copied.value === id) copied.value = '' }, 1600)
  }
  catch {
    // Ohne Zwischenablage-Recht bleibt der Text sichtbar und markierbar — das
    // ist der Ausweg. Eine Fehlermeldung wäre lauter als das Problem.
  }
}

// ── Kachel 2: die Tokens ──────────────────────────────────────────────────

const jsonOpen = ref(false)
const tokenTab = ref('json')
const tokenTabs = computed(() => [
  { value: 'json', label: 'tokens.json' },
  { value: 'css', label: 'tokens.css' },
])

watch(tokenTab, (value) => {
  if (value === 'css') tokensCssText.load()
})

const tokenText = computed(() => (tokenTab.value === 'json'
  ? tokensJsonText.data.value
  : tokensCssText.data.value))

const shades = BRAND_RAMP_SHADES

/** Eine Rampe als Hex je Stufe — leer, solange `tokens.json` nicht da ist. */
function rampHexes(group: 'brand' | 'brand-dark'): string[] {
  const file = tokens.value
  if (!file) return []
  return shades.map((shade) => {
    const node = file.color[group][String(shade)]
    return typeof node === 'object' && node !== null && '$value' in node ? node.$value.hex : ''
  })
}

interface KitRoleRow {
  id: string
  hex: string
  alias: string
  ratio: number | null
  level: string | null
}

/**
 * DIE ROLLEN EINES MODUS mit aufgelöstem Hex und Kontrast-Urteil.
 *
 * Der Hex wird über den ALIAS aufgelöst (`resolveBrandTokenAlias`) — dieselbe
 * Funktion, die `tokens.css` benutzt. Das Urteil steht als `$extensions`-Beleg
 * an der Rolle; Rollen ohne Beleg zeigen keins, statt eines zu erfinden.
 */
function roleRows(mode: 'light' | 'dark'): KitRoleRow[] {
  const file = tokens.value
  if (!file) return []
  const rows: KitRoleRow[] = []
  for (const [id, node] of Object.entries(file.color[mode])) {
    if (id.startsWith('$') || typeof node !== 'object' || node === null) continue
    const contrast = node.$extensions?.[BRAND_TOKEN_EXTENSION_CONTRAST]
    rows.push({
      id,
      alias: typeof node.$value === 'string' ? node.$value : '',
      hex: (typeof node.$value === 'string' ? resolveBrandTokenAlias(file, node.$value) : '') ?? '',
      ratio: contrast?.ratio ?? null,
      level: contrast?.level ?? null,
    })
  }
  return rows
}

const lightRoles = computed(() => roleRows('light'))
const darkRoles = computed(() => roleRows('dark'))

function ratioText(ratio: number): string {
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(ratio)}:1`
}

function levelClass(level: string | null): string {
  if (level === 'fail') return 'bw-state--stale'
  return level === 'AA18' ? 'bw-state--draft' : 'bw-state--confirmed'
}

// ── Kachel 4: Pressekit ───────────────────────────────────────────────────

/**
 * DIE BLÖCKE DES PRESSEKIT-KAPITELS AUS `brand.json` — die Vorschau.
 *
 * Gezeigt werden die vier Formen, die ein Pressekit trägt: Absatz, Liste,
 * Karten und die Ansprechperson. Alles Weitere steht im KAPITEL — eine
 * Vorschau, die jede Block-Art nachbaut, wäre ein zweites Dokument und liefe
 * beim ersten neuen Block-Typ auseinander.
 */
type KitPresskitBlock = Extract<
  BrandContextJsonBlock,
  { kind: 'lead' | 'text' } | { kind: 'list' } | { kind: 'cards' } | { kind: 'contact' }
>

const PRESSKIT_KINDS: readonly KitPresskitBlock['kind'][] = ['lead', 'text', 'list', 'cards', 'contact']

const presskitBlocks = computed<KitPresskitBlock[]>(
  () => (brandJson.value?.presskit?.blocks ?? []).filter(
    (block): block is KitPresskitBlock =>
      (PRESSKIT_KINDS as readonly string[]).includes(block.kind),
  ),
)

// ── Kachel 5: Lizenzen ────────────────────────────────────────────────────

interface KitLicenseRow {
  family: string
  weights: string
  role: string
  source: string
  spdx: string
}

/**
 * DIE LIZENZ-ZEILEN — PUR aus dem Snapshot-Preset in `brand.json`.
 *
 * Dieselbe Funktion, die `LICENSES.md` schreibt (`brandLicenseRows`): die
 * Tabelle auf dieser Seite und die Datei im Bündel können damit nicht
 * auseinanderlaufen.
 */
const licenseRows = computed<KitLicenseRow[]>(() => brandLicenseRows(
  brandJson.value?.design ?? null,
  contentLocale.value,
).map(row => ({
  family: row.family,
  weights: row.weights.join(', '),
  role: row.role,
  source: row.source,
  spdx: row.spdx,
})))

const licenseNote = computed(() => brandLicenseNote(contentLocale.value))

const licenseColumns = computed<TableColumn<KitLicenseRow>[]>(() => [
  { accessorKey: 'family', header: t('brand.kitPage.licenses.family') },
  { accessorKey: 'weights', header: t('brand.kitPage.licenses.weights') },
  { accessorKey: 'role', header: t('brand.kitPage.licenses.role') },
  { accessorKey: 'source', header: t('brand.kitPage.licenses.source') },
  { accessorKey: 'spdx', header: t('brand.kitPage.licenses.spdx') },
])

// ── Kachel 6: was im Bündel ist ───────────────────────────────────────────

/**
 * DIE DATEI-ID ALS i18n-SCHLÜSSEL — `tokens.json` ⇒ `tokensJson`.
 *
 * Punkte in einem Schlüssel sind für vue-i18n PFADE: `…what.tokens.json`
 * suchte eine Gruppe `tokens` mit einem Eintrag `json`. Die Karte hier ist
 * eine Zeile und macht aus einem Dateinamen einen Bezeichner.
 */
const BUNDLE_WHAT_KEYS: Readonly<Record<string, string>> = {
  'brand.md': 'brandMd',
  'brand.json': 'brandJson',
  'tokens.json': 'tokensJson',
  'tokens.css': 'tokensCss',
  'licenses.md': 'licensesMd',
  'readme.md': 'readmeMd',
}

function bundleWhat(id: string): string {
  const key = BUNDLE_WHAT_KEYS[id]
  return key ? t(`brand.kitPage.bundleList.what.${key}`) : id
}

const bundleEntries = computed(() => (manifest.value?.files ?? [])
  .filter(file => file.available)
  .map(file => ({ file: file.id, bytes: file.bytes ?? 0 })))

const missingEntries = computed(() => (manifest.value?.files ?? [])
  .filter(file => !file.available)
  .map(file => file.id))

// ── Die Leiste (dieselbe wie in Werkstatt, Dokument und Board) ────────────

const navExtras = useBrandWorkspaceNavExtras({
  profileId,
  findings: () => store.findings,
})

const foundationStep = useBrandFoundationRailStep({ profileId, active: false })

const designDone = computed(() => store.designSteps.filter(entry => entry.state === 'done').length)
const designTo = computed(() => (store.designSteps.length > 0 && store.canEnter('dna')
  ? localePath(`/brand/${profileId.value}/dna`)
  : null))

/** Die Kit-Kapitel auf dem Weg — übersprungene zählen nicht (K1). */
const kitOnPath = computed(() => store.kitSteps.filter(entry => entry.state !== 'skipped'))
const kitDone = computed(() => kitOnPath.value.filter(entry => entry.state === 'done').length)

const railLayers = computed<BwRailLayer[]>(() => [
  {
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
      foundationStep.value,
      ...navExtras.value,
    ],
  },
  {
    id: 'design',
    label: t('brand.designLayer.label'),
    note: t('brand.designLayer.progress', { done: designDone.value, total: store.designSteps.length }),
    steps: [
      ...store.designSteps.map((entry): BwRailStep => ({
        id: entry.stepKey,
        label: t(`brand.steps.${entry.stepKey}`),
        icon: '',
        state: entry.state === 'done' ? 'done' : 'open',
        to: localePath(`/brand/${profileId.value}/${entry.stepKey}`),
      })),
      {
        id: 'design-result',
        kind: 'result',
        label: t('brand.designLayer.result'),
        icon: '',
        state: 'open',
        to: localePath(`/brand/${profileId.value}/design`),
      },
    ],
  },
  {
    id: 'kit',
    label: t('brand.kitLayer.label'),
    note: t('brand.kitLayer.progress', { done: kitDone.value, total: kitOnPath.value.length }),
    steps: [
      ...kitOnPath.value.map((entry): BwRailStep => ({
        id: entry.stepKey,
        label: t(`brand.steps.${entry.stepKey}`),
        icon: '',
        state: entry.state === 'done' ? 'done' : 'open',
        ...(store.canEnter(entry.stepKey)
          ? { to: localePath(`/brand/${profileId.value}/${entry.stepKey}`) }
          : {}),
      })),
      // DIESE SEITE IST DER ERGEBNIS-PUNKT — `active`, kein Link auf sich selbst.
      {
        id: 'kit-result',
        kind: 'result',
        label: t('brand.kitLayer.result'),
        icon: '',
        state: 'active',
      },
    ],
  },
])

const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }

const sidebarBrands = computed<BwSidebarBrand[]>(() => store.profiles.map(profile => ({
  id: profile.id,
  title: profile.title || t('brand.brands.card.untitled'),
  path: t(`brand.brands.card.path.${profile.pathKind}`),
  flag: LOCALE_FLAGS[profile.contentLocale],
  to: localePath(`/brand/${profile.id}/${profile.currentStepKey}`),
  current: profile.id === profileId.value,
})))

/** Der Weg zurück in die Kapitel — rechts, statt eines Verzeichnisses. */
const chapterLinks = computed(() => [
  ...store.kitSteps
    .filter(entry => entry.state !== 'skipped')
    .map(entry => ({ key: entry.stepKey, label: t(`brand.steps.${entry.stepKey}`) })),
  ...store.designSteps.map(entry => ({ key: entry.stepKey, label: t(`brand.steps.${entry.stepKey}`) })),
].map(entry => ({
  ...entry,
  to: localePath(`/brand/${profileId.value}/${entry.key}`),
})))

const presskitTo = computed(() => localePath(`/brand/${profileId.value}/presskit`))

const railCollapsed = ref(false)
const asideCollapsed = ref(false)

async function goToStep(key: string | null): Promise<void> {
  if (!key || !store.canEnter(key)) return
  await navigateTo(localePath(`/brand/${profileId.value}/${key}`))
}

useBrandTitle(() => (title.value
  ? `${t('brand.kitPage.title')} · ${title.value}`
  : t('brand.kitPage.title')))
</script>

<template>
  <!-- DIE SCHRANKE: dieselbe Fläche wie in der Werkstatt (K1) — ein Satz, der
       Weg zu den Marken und das Erstgespräch. KEIN Preis (§1.11 d). -->
  <div v-if="locked" class="bw-root grid min-h-dvh place-items-center px-6" data-kit-gate>
    <div class="max-w-md text-center">
      <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
      <p class="mt-4 font-medium">{{ t('brand.workspace.derivationLocked.title') }}</p>
      <p class="mt-1 text-sm" style="color: var(--bw-muted)">
        {{ t('brand.workspace.derivationLocked.description') }}
      </p>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
        <UButton
          class="rounded-full" variant="outline" :to="localePath('/dashboard/brands')"
          :label="t('brand.brands.title')"
        />
        <UButton
          :to="callCta.to" :target="callCta.target" :rel="callCta.rel" :external="callCta.external"
          class="rounded-full" trailing-icon="i-ph-arrow-right"
          :label="t(callCta.labelKey)"
          data-derivation-cta
        />
      </div>
    </div>
  </div>

  <BwWorkspace
    v-else
    stage-width="72rem"
    :progress-pct="100"
    :content-locale="contentLocale"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="asideCollapsed"
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
          :aria-label="railCollapsed ? t('brand.workspace.bar.showNav') : t('brand.workspace.bar.hideNav')"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
            {{ t('brand.kitLayer.label') }}
          </p>
          <p class="truncate font-semibold">{{ t('brand.kitPage.title') }}</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            :to="localePath(`/brand/${profileId}/foundation`)"
            icon="i-ph-book-open" :label="t('brand.kitPage.toBook')"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-md:hidden"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="asideCollapsed ? t('brand.foundation.showToc') : t('brand.foundation.hideToc')"
            @click="asideCollapsed = !asideCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-10 pb-6">
        <!-- ── KOPF ────────────────────────────────────────────────────── -->
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.kitPage.eyebrow') }}
          </p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight" data-kit-title>
            {{ t('brand.kitPage.headline', { title }) }}
          </h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">
            <template v-if="stand">{{ t('brand.kitPage.stand', { date: stand }) }} · </template>
            {{ t('brand.kitPage.computed') }} ·
            {{ t('brand.kitPage.contentLocale', { locale: contentLocale.toUpperCase() }) }}
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-2">
            <UButton
              v-if="manifest"
              :to="bundleHref" external download
              icon="i-ph-file-zip" class="rounded-full"
              :label="t('brand.kitPage.bundle', { file: manifest.bundle.filename })"
              data-kit-bundle
            />
            <span v-if="manifest && manifest.bundle.missing > 0" class="bw-state bw-state--draft">
              {{ t('brand.kitPage.missingTiles', { count: manifest.bundle.missing }) }}
            </span>
            <span v-else-if="manifest" class="bw-state bw-state--confirmed">
              <UIcon name="i-ph-check" /> {{ t('brand.kitPage.complete') }}
            </span>
          </div>
          <p class="bw-pending mt-3">{{ t('brand.kitPage.correctHint') }}</p>
        </div>

        <!-- ── KACHEL 1: BRAND CONTEXT ─────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-context>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.context.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">brand.md · brand.json</span>
          </div>
          <p class="bw-doc-text mt-2">{{ t('brand.kitPage.context.lead') }}</p>

          <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="bw-label" style="color: var(--bw-muted)">
                  {{ t('brand.kitPage.context.preview') }}
                </span>
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full"
                    style="background: var(--bw-surface-hi)"
                    :icon="copied === 'brand.md' ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === 'brand.md' ? t('brand.kitPage.copied') : t('brand.kitPage.copy')"
                    :disabled="!brandMd.data.value"
                    @click="copyText('brand.md', brandMd.data.value)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    :to="fileHref('brand.md')" external download
                    icon="i-ph-download-simple" :label="t('brand.kitPage.download')"
                    data-kit-download="brand.md"
                  />
                </span>
              </div>
              <div class="fd-kit-preview mt-3 rounded-2xl px-5 py-5" style="background: var(--bw-surface)">
                <p v-if="brandMd.status.value === 'pending'" class="bw-pending">
                  {{ t('brand.kitPage.loading') }}
                </p>
                <pre v-else-if="brandMd.data.value" class="fd-code fd-code--wrap">{{ brandMd.data.value }}</pre>
                <p v-else class="bw-pending">{{ t('brand.kitPage.previewFailed') }}</p>
              </div>
              <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ downloadName('brand.md') }}</p>
            </div>

            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="bw-label" style="color: var(--bw-muted)">brand.json · schemaVersion 1</span>
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full"
                    style="background: var(--bw-surface-hi)"
                    :icon="copied === 'brand.json' ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === 'brand.json' ? t('brand.kitPage.copied') : t('brand.kitPage.copy')"
                    :disabled="!brandJsonText.data.value"
                    @click="copyText('brand.json', brandJsonText.data.value)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    :to="fileHref('brand.json')" external download
                    icon="i-ph-download-simple" :label="t('brand.kitPage.download')"
                    data-kit-download="brand.json"
                  />
                </span>
              </div>
              <div class="mt-3 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
                <pre class="fd-code" :class="jsonOpen ? '' : 'fd-code--clipped'">{{ brandJsonText.data.value }}</pre>
                <UButton
                  class="mt-2 rounded-full" size="xs" color="neutral" variant="ghost"
                  :icon="jsonOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
                  :label="jsonOpen ? t('brand.kitPage.showLess') : t('brand.kitPage.showAll')"
                  @click="jsonOpen = !jsonOpen"
                />
              </div>
              <p class="bw-pending mt-3">{{ t('brand.kitPage.context.privateNote') }}</p>
            </div>
          </div>
        </section>

        <!-- ── KACHEL 2: DESIGN-TOKENS ─────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-tokens>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.tokens.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">tokens.json · tokens.css</span>
          </div>

          <template v-if="designReady">
            <p class="bw-doc-text mt-2">{{ t('brand.kitPage.tokens.lead') }}</p>

            <div class="mt-5 grid gap-5 sm:grid-cols-2">
              <div
                v-for="ramp in [
                  { id: 'brand', label: t('brand.kitPage.tokens.rampLight'), values: rampHexes('brand') },
                  { id: 'brand-dark', label: t('brand.kitPage.tokens.rampDark'), values: rampHexes('brand-dark') },
                ]"
                :key="ramp.id"
              >
                <p class="bw-label" style="color: var(--bw-muted)">{{ ramp.label }}</p>
                <div class="mt-2 flex overflow-hidden rounded-lg">
                  <span
                    v-for="(hex, index) in ramp.values" :key="`${ramp.id}-${shades[index]}`"
                    class="h-9 flex-1" :style="`background: ${hex}`"
                    :title="`${shades[index]} · ${hex}`"
                  />
                </div>
                <div class="mt-1.5 flex justify-between">
                  <span
                    v-for="shade in shades" :key="`${ramp.id}-l-${shade}`"
                    class="bw-label flex-1 text-center"
                    style="color: var(--bw-muted); font-size: 10px"
                  >{{ shade }}</span>
                </div>
              </div>
            </div>

            <div class="mt-6 grid gap-5 sm:grid-cols-2">
              <div
                v-for="mode in [
                  { id: 'light', label: t('brand.kitPage.tokens.rolesLight'), rows: lightRoles },
                  { id: 'dark', label: t('brand.kitPage.tokens.rolesDark'), rows: darkRoles },
                ]"
                :key="mode.id"
              >
                <p class="bw-label" style="color: var(--bw-muted)">{{ mode.label }}</p>
                <div class="mt-2 flex flex-col gap-1.5">
                  <div
                    v-for="row in mode.rows" :key="`${mode.id}-${row.id}`"
                    class="bw-frame grid items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]"
                    style="background: var(--bw-surface)"
                  >
                    <span class="bw-swatch size-6 rounded-full" :style="`background: ${row.hex}`" />
                    <span class="min-w-0 leading-tight">
                      <span class="block text-sm font-medium">{{ row.id }}</span>
                      <span class="bw-label block tabular-nums" style="color: var(--bw-muted)">{{ row.hex }}</span>
                    </span>
                    <span
                      v-if="row.ratio !== null && row.level !== null"
                      class="bw-state whitespace-nowrap" :class="levelClass(row.level)"
                    >{{ ratioText(row.ratio) }} · {{ row.level }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-7">
              <div class="flex flex-wrap items-center gap-3">
                <UTabs v-model="tokenTab" :items="tokenTabs" :content="false" size="sm" />
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full"
                    style="background: var(--bw-surface-hi)"
                    :icon="copied === tokenTab ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === tokenTab ? t('brand.kitPage.copied') : t('brand.kitPage.copy')"
                    :disabled="!tokenText"
                    @click="copyText(tokenTab, tokenText)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    :to="fileHref(tokenTab === 'json' ? 'tokens.json' : 'tokens.css')" external download
                    icon="i-ph-download-simple" :label="t('brand.kitPage.download')"
                    :data-kit-download="tokenTab === 'json' ? 'tokens.json' : 'tokens.css'"
                  />
                </span>
              </div>
              <div class="mt-3 max-h-96 overflow-auto rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
                <pre v-if="tokenText" class="fd-code">{{ tokenText }}</pre>
                <p v-else class="bw-pending">{{ t('brand.kitPage.loading') }}</p>
              </div>
              <p class="bw-pending mt-3">{{ t('brand.kitPage.tokens.note') }}</p>
            </div>
          </template>

          <BwKitLocked v-else :what="t('brand.kitPage.tokens.title')" :design-to="designTo" />
        </section>

        <!-- ── KACHEL 3: ZEICHEN ───────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-marks>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.marks.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">marks/ · SVG</span>
          </div>

          <template v-if="manifest && manifest.marks.length > 0">
            <p class="bw-doc-text mt-2">{{ t('brand.kitPage.marks.lead') }}</p>
            <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="mark in manifest.marks" :key="mark.id" class="min-w-0">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="fd-kit-mark" v-html="mark.svg" />
                <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p class="text-sm font-medium">
                    {{ t(`brand.kitPage.marks.setting.${mark.setting}`) }} ·
                    {{ t(`brand.kitPage.marks.variant.${mark.variant}`) }}
                  </p>
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="ms-auto rounded-full"
                    :to="markHref(mark)" external download
                    icon="i-ph-download-simple" :label="t('brand.kitPage.download')"
                    :data-kit-download="mark.id"
                  />
                </div>
                <p class="bw-label" style="color: var(--bw-muted)">{{ mark.filename }}</p>
              </div>
            </div>
            <p class="bw-pending mt-4">{{ t('brand.kitPage.marks.note') }}</p>
          </template>

          <BwKitLocked v-else :what="t('brand.kitPage.marks.title')" :design-to="designTo" />
        </section>

        <!-- ── KACHEL 4: PRESSEKIT ─────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-presskit>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.presskit.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">
              {{ t('brand.kitPage.presskit.tag') }}
            </span>
          </div>
          <p class="bw-doc-text mt-2">{{ t('brand.kitPage.presskit.lead') }}</p>

          <div v-if="presskitBlocks.length" class="mt-5 flex flex-col gap-4">
            <div v-for="(block, index) in presskitBlocks" :key="`presskit-${index}`">
              <p v-if="block.kind !== 'contact' && block.labelKey" class="bw-label" style="color: var(--bw-muted)">
                {{ t(block.labelKey) }}
              </p>
              <p
                v-if="block.kind === 'lead' || block.kind === 'text'"
                class="bw-doc-text mt-1 whitespace-pre-wrap"
              >{{ block.text }}</p>
              <ul v-else-if="block.kind === 'list'" class="mt-1.5 flex flex-col gap-1">
                <li
                  v-for="item in block.items" :key="item"
                  class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
                >
                  <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
                  <span class="min-w-0">{{ item }}</span>
                </li>
              </ul>
              <div v-else-if="block.kind === 'cards'" class="mt-2 flex flex-col gap-2">
                <div
                  v-for="item in block.items" :key="item.title"
                  class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)"
                >
                  <p class="text-sm font-medium">{{ item.title }}</p>
                  <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ item.text }}</p>
                </div>
              </div>
              <div v-else-if="block.kind === 'contact'" class="mt-1">
                <p class="bw-label" style="color: var(--bw-muted)">
                  {{ t('brand.kitPage.presskit.contact') }}
                </p>
                <p class="mt-1.5 text-sm">{{ block.name }}</p>
                <p class="text-sm" style="color: var(--bw-ink-soft)">{{ block.role }} · {{ block.email }}</p>
              </div>
            </div>
          </div>
          <p v-else class="bw-pending mt-4">{{ t('brand.kitPage.presskit.empty') }}</p>

          <UButton
            class="mt-5 rounded-full" size="xs" color="neutral" variant="outline"
            style="background: var(--bw-surface-hi)"
            :to="presskitTo" trailing-icon="i-ph-arrow-right"
            :label="t('brand.kitPage.presskit.toChapter')"
          />
        </section>

        <!-- ── KACHEL 5: LIZENZEN ──────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-licenses>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.licenses.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">LICENSES.md</span>
          </div>

          <template v-if="designReady">
            <!-- Zellen dürfen umbrechen, der Rest scrollt (Abnahme-Befund am Prototyp). -->
            <div class="mt-4 overflow-x-auto">
              <UTable
                :data="licenseRows" :columns="licenseColumns"
                :ui="{ td: 'whitespace-normal align-top', th: 'whitespace-normal' }"
              />
            </div>
            <p class="bw-doc-text mt-3">{{ licenseNote }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <UButton
                size="xs" color="neutral" variant="ghost" class="rounded-full"
                :to="fileHref('licenses.md')" external download
                icon="i-ph-download-simple" :label="t('brand.kitPage.licenses.download')"
                data-kit-download="licenses.md"
              />
              <a
                v-for="row in licenseRows" :key="row.family"
                :href="row.source" target="_blank" rel="noopener"
                class="bw-label underline underline-offset-4" style="color: var(--bw-muted)"
              >{{ row.family }}</a>
            </div>
          </template>

          <BwKitLocked v-else :what="t('brand.kitPage.licenses.title')" :design-to="designTo" />
        </section>

        <!-- ── KACHEL 6: DIE README-ZEILE ──────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8" data-kit-bundle-list>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">{{ t('brand.kitPage.bundleList.title') }}</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">README.md</span>
          </div>
          <ul class="mt-4 flex flex-col gap-2">
            <li
              v-for="entry in bundleEntries" :key="entry.file"
              class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <p class="bw-label" style="color: var(--bw-ink)">{{ entry.file }}</p>
              <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ bundleWhat(entry.file) }}
              </p>
            </li>
            <li v-if="manifest && manifest.marks.length" class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <p class="bw-label" style="color: var(--bw-ink)">marks/</p>
              <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                {{ t('brand.kitPage.bundleList.marks', { count: manifest.marks.length }) }}
              </p>
            </li>
          </ul>
          <template v-if="missingEntries.length || (manifest && manifest.marks.length === 0)">
            <p class="bw-label mt-5" style="color: var(--bw-muted)">
              {{ t('brand.kitPage.bundleList.missingTitle') }}
            </p>
            <ul class="mt-2 flex flex-col gap-2">
              <li
                v-for="file in missingEntries" :key="file"
                class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]"
              >
                <p class="bw-label" style="color: var(--bw-muted)">{{ file }}</p>
                <p class="text-sm leading-relaxed" style="color: var(--bw-muted)">
                  {{ t('brand.kitPage.bundleList.missingReason') }}
                </p>
              </li>
              <li v-if="manifest && manifest.marks.length === 0" class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <p class="bw-label" style="color: var(--bw-muted)">marks/</p>
                <p class="text-sm leading-relaxed" style="color: var(--bw-muted)">
                  {{ t('brand.kitPage.bundleList.missingReason') }}
                </p>
              </li>
            </ul>
          </template>
          <p v-if="manifest" class="bw-pending mt-4">
            {{ t('brand.kitPage.bundleList.note', { file: manifest.bundle.filename }) }}
          </p>
        </section>
      </div>
    </template>

    <!-- RECHTS: der Weg zurück in die Kapitel — hier wird nichts entschieden. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.kitPage.correctTitle') }}
          </p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.kitPage.correctLead') }}
          </p>
          <ul class="mt-4 flex flex-col gap-1">
            <li v-for="chapter in chapterLinks" :key="chapter.key">
              <NuxtLink
                :to="chapter.to"
                class="bw-frame flex items-center gap-3 px-3 py-2 text-sm"
                style="background: var(--bw-surface)"
              >
                <span class="min-w-0 flex-1 truncate">{{ chapter.label }}</span>
                <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
              </NuxtLink>
            </li>
          </ul>

          <p class="bw-label mt-6 uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.kitPage.privateTitle') }}
          </p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.kitPage.privateLead') }}
          </p>
        </div>
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="kitOnPath.length ? Math.round((kitDone / kitOnPath.length) * 100) : 0"
            :progress-title="t('brand.kitLayer.label')"
            :progress-count="`${kitDone}/${kitOnPath.length}`"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>

<style scoped>
.fd-code {
  font-family: var(--bw-font-mono);
  font-size: 11px;
  line-height: 18px;
  white-space: pre;
  color: var(--bw-ink-soft);
  margin: 0;
}
/* Der JSON-Ausschnitt bleibt zugeklappt kurz — eine ganze Datei im Kopf der
 * Seite wäre eine Wand, keine Auskunft. */
.fd-code--clipped { max-height: 14rem; overflow: hidden; }
.fd-code--wrap { white-space: pre-wrap; }
.fd-kit-preview { max-height: 32rem; overflow-y: auto; }
/* ALLE ACHT KACHELN SIND GLEICH HOCH (Sichtbefund am lebenden Objekt).
 *
 * Wortmarke und Monogramm haben verschiedene Seitenverhältnisse (400×120 und
 * 160×120). Auf volle Breite gezogen wurde das Monogramm doppelt so hoch wie
 * die Wortmarke daneben — die Beschriftungen standen dann auf drei
 * verschiedenen Linien und das Raster sah aus wie ein Fehler. Deshalb eine
 * feste Bühne, in die jedes Zeichen HINEINPASST statt sie zu füllen; die
 * eigene Fläche des Zeichens bleibt sichtbar, sie ist Teil der Setzung. */
.fd-kit-mark { display: grid; place-items: center; height: 7rem; }
.fd-kit-mark :deep(svg) {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  /* Die Rundung sitzt am ZEICHEN, nicht an der Bühne: seit die Bühne größer
   * ist als das Zeichen, klippte sie nichts mehr und die Flächen standen
   * eckig da. */
  border-radius: 0.5rem;
  overflow: hidden;
}
</style>
