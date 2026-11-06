<script setup lang="ts">
import type { BwSidebarBrand } from '../../../../../app/components/BwWorkspaceSidebar.vue'
import type { FdChapterData } from '../../../utils/demoFoundation'
import { demoRailWithDesign, demoRailWithKit } from '../../../utils/demoRail'
import { demoDirectionChapter, demoFoundation } from '../../../utils/demoFoundation'
import { demoAiGuidelinesChapter, demoNomenclatureChapter, demoPresskitChapter, demoUsageChapters } from '../../../utils/demoKit'

/**
 * KLICKDUMMY „BRAND FOUNDATION" — die PRIVATE Leseansicht (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.11, Screens 1–4 und 6).
 *
 * Sie ist NICHT der Ersatz für `/brand/demo/ergebnis` (Iteration 2, bleibt als
 * Protokoll stehen), sondern die zweite Ansicht desselben Dokuments: „Euer
 * Branding" ist die Arbeitsansicht (abnehmen, prüfen, korrigieren), DIESE
 * Seite liest dieselben bestätigten Werte als GUIDELINES.
 *
 * Das Chrome kommt aus der ECHTEN Dokument-Seite
 * (`packages/brand/app/pages/brand/[profileId]/document.vue`): BwWorkspace
 * ohne Topbar, feste Nav-Breite, `BwWorkspaceSidebar` links, der STAND rechts.
 * Der Prototyp ist später die Komponenten-Vorlage — nichts wird zweimal gebaut.
 *
 * Screens auf dieser Seite:
 *   1  private Leseansicht (Inhaltsverzeichnis + gefüllte Kapitel)
 *   2  Kapitel „Persönlichkeit & Stimme" (Do & Don't) + „Regeln für KI-Texte"
 *   3a Kapitel „Visuelle Identität" als Schranke
 *   3b dasselbe MIT gewählter Richtung — `?richtung=warm`
 *   3c die DREI Zustände von Brand Design (Produkt 02, Screen 7+8):
 *      `?design=locked` (Vorgabe, heutiger Stand) · `?design=unlocked`
 *      (freigeschaltet, Einstieg statt Angebot) · `?design=done` (Kapitel 10
 *      VOLL — Rampen, Specimen, Zeichen, Bild-Prinzipien, Bewegung)
 *   4  Share-Dialog (Knopf „Teilen")
 *   6  Druck-Vorschau (Knopf „Drucken / PDF" im Export-Menü)
 */

const route = useRoute()

/* Screen 3b: eine Richtung ist gewählt — Kapitel 10 zeigt sie STATT der
 * Schranke. Im Echtbetrieb hängt das an `result.direction` (G4). */
const directionChosen = computed(() => route.query.richtung === 'warm')

/* Screen 7/8 des Brand-Design-Prototyps (docs/archiv/BRAND-DESIGN.md §2.8,
 * §2.10): derselbe Ort, drei Zustände. Unbekannte Werte fallen auf `locked`
 * zurück — der heutige Stand ist die Vorgabe, nicht der Sonderfall. */
const designState = computed<'locked' | 'unlocked' | 'done'>(() =>
  route.query.design === 'unlocked' ? 'unlocked' : route.query.design === 'done' ? 'done' : 'locked')
/* Eigenes Computed für das Prop: `FdDesignChapter` kennt nur die zwei
 * Zustände, in denen es überhaupt gerendert wird. */
const designChapterState = computed<'unlocked' | 'done'>(() => (designState.value === 'done' ? 'done' : 'unlocked'))

/**
 * SCREEN 3 DES BK1-PROTOTYPS (docs/plans/BRAND-BOOK-KIT.md §2.5, §2.15):
 * `?kit=done` = die Ableitung ist freigeschaltet und die drei Kapitel sind
 * abgenommen. Dann wächst DIESELBE Leseansicht um fünf Kapitel, und Kapitel 11
 * heißt „AI-Guidelines" (Anker `ki-texte` bleibt — verschickte Tieflinks
 * dürfen nicht ins Leere zeigen, §2.17).
 *
 * OHNE `kit=done` bleiben die drei Anwendungs-Kapitel als SCHRANKE stehen
 * („Book & Kit ist Teil der Ableitung"), und Nomenklatur wie Pressekit
 * entfallen ganz: ohne gelaufenes Kapitel gibt es keinen Wert, und ein leeres
 * Kapitel wäre eine Lücke, die etwas behauptet (dieselbe Regel wie bei
 * „Markenarchitektur" in `demoFoundation.ts`).
 */
const kitDone = computed(() => route.query.kit === 'done')

const chapters = computed<FdChapterData[]>(() => {
  const base = demoFoundation.chapters.map((chapter): FdChapterData => {
    if (chapter.id === 'ki-texte' && kitDone.value) return demoAiGuidelinesChapter()
    if (chapter.id !== 'visuell') return chapter
    /* Nach Brand Design ist das Kapitel ABGENOMMEN — es zählt dann mit, und die
     * Überschrift trägt kein „folgt in Brand Design" mehr. */
    if (designState.value === 'done') {
      return { ...chapter, state: 'done' as const, note: `Im Brand Design entschieden — Stand ${demoFoundation.brand.standDate}.` }
    }
    return directionChosen.value ? demoDirectionChapter : chapter
  })

  /* Die Anwendungs-Kapitel erscheinen erst, wenn Brand Design überhaupt im
   * Spiel ist: auf der unberührten Foundation-Ansicht (Schicht 2 gesperrt)
   * wären drei zusätzliche Schlösser Lärm — dort steht die Schranke schon in
   * Kapitel 10 und sagt dasselbe. */
  const usage = designState.value === 'locked' && !kitDone.value ? [] : demoUsageChapters(kitDone.value)
  const result: FdChapterData[] = []
  for (const chapter of base) {
    /* Nomenklatur steht NACH „Positionierung" (dort, wo bei einer Marke mit
     * Untermarken das Kapitel „Markenarchitektur" stünde), die drei
     * Anwendungs-Kapitel direkt NACH „Visuelle Identität", das Pressekit VOR
     * „Regeln für KI-Texte" — die Reihenfolge aus §2.5. */
    if (chapter.id === 'ki-texte' && kitDone.value) result.push(demoPresskitChapter())
    result.push(chapter)
    if (chapter.id === 'positionierung' && kitDone.value) result.push(demoNomenclatureChapter())
    if (chapter.id === 'visuell') result.push(...usage)
  }
  return result
})

/* DER EINZIGE ZÄHLER DER SEITE (§2.6) — und er zählt, was abnehmbar IST:
 * das gesperrte Kapitel gehört der Schranke, nicht der Abnahme. */
const counted = computed(() => chapters.value.filter(c => c.state !== 'locked'))
const acceptedCount = computed(() => counted.value.filter(c => c.state === 'done').length)
const acceptedPct = computed(() => Math.round((acceptedCount.value / counted.value.length) * 100))

/* Die Rail der Werkstatt, einmal umgestellt: die Foundation ist FERTIG, und
 * die vormals gesperrte `result`-Kachel ist jetzt der Einstieg in diese Seite
 * (Entscheidung §6 d). „Erreichbar" heisst für einen Ergebnis-Punkt `done` —
 * die Sidebar sperrt jeden anderen Zustand (BwWorkspaceSidebar.stepDisabled).
 * Die SCHICHT 2 hängt am `?design=`-Zweig: gesperrt bleibt sie der heutige
 * Erklär-Layer, freigeschaltet wird sie zur echten Gruppe mit sechs Kapiteln.
 * Mit `kit=done` übernimmt `demoRailWithKit`: dann ist auch Schicht 3 eine
 * echte Gruppe mit drei Kapiteln und dem Ergebnis-Punkt „Kit". */
const railLayers = computed(() => (kitDone.value
  ? demoRailWithKit({ unlocked: true, done: true })
  : demoRailWithDesign({
      unlocked: designState.value !== 'locked',
      done: designState.value === 'done',
    })))

const sidebarBrands: BwSidebarBrand[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us', current: true },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' },
]

const railCollapsed = ref(false)
const standCollapsed = ref(false)

function print(): void {
  if (import.meta.client) window.print()
}

/**
 * DAS EXPORT-MENÜ ZEIGT ALLE AUSGABEFORMEN DER SUITE (§2.6) — frei und
 * gesperrt nebeneinander, dieselbe Ehrlichkeit wie die visuelle Schranke.
 * Ein Menü, das nur „Drucken" kennt, verschweigt, was es noch gibt.
 */
interface FdExportItem {
  label: string
  icon?: string
  sub?: string
  locked?: boolean
  disabled?: boolean
  to?: string
  children?: FdExportItem[]
  onSelect?: () => void
}
/* MIT DER ABLEITUNG WERDEN DIE DREI EINTRÄGE ECHT (BK1 §2.7): Untermenüs mit
 * den Dateien, Klick führt auf die Lieferseite — dort steht Vorschau,
 * Kopieren und Laden. Ohne Ableitung bleiben sie gesperrt wie heute; das
 * Etikett nennt weiterhin das Produkt dahinter. */
const exportItems = computed<FdExportItem[][]>(() => [
  [{ label: 'Drucken / PDF', icon: 'i-ph-printer', sub: 'Browser-Druck mit Print-Layout', onSelect: print }],
  kitDone.value
    ? [
        {
          label: 'Brand Context',
          icon: 'i-ph-brackets-curly',
          sub: 'Für KI-Agenten — als System-Prompt einsetzbar',
          children: [
            { label: 'brand.md', sub: 'Markdown, direkt einsetzbar', to: '/brand/demo/kit' },
            { label: 'brand.json', sub: 'Maschinenlesbar, schemaVersion 1', to: '/brand/demo/kit' },
          ],
        },
        {
          label: 'Design-Tokens',
          icon: 'i-ph-palette',
          sub: 'Hell und dunkel in einer Datei',
          children: [
            { label: 'tokens.json', sub: 'DTCG 2025.10 — Figma, Style Dictionary', to: '/brand/demo/kit' },
            { label: 'tokens.css', sub: 'CSS-Variablen + Tailwind-@theme', to: '/brand/demo/kit' },
          ],
        },
        {
          label: 'Bündel',
          icon: 'i-ph-file-zip',
          sub: 'Alle Dateien, Zeichen, Lizenzen, README',
          children: [
            { label: 'Kit als .zip laden', sub: 'Stand 9. September 2026', to: '/brand/demo/kit' },
          ],
        },
      ]
    : [
        { label: 'brand.md · brand.json', icon: 'i-ph-brackets-curly', sub: 'Brand Context für KI-Agenten · Brand Book & Kit', locked: true, disabled: true },
        { label: 'Design-Tokens', icon: 'i-ph-palette', sub: 'CSS, Tailwind, JSON · Brand Book & Kit', locked: true, disabled: true },
        { label: 'Assets.zip', icon: 'i-ph-file-zip', sub: 'Zeichen, Pressekit, Lizenzen · Brand Book & Kit', locked: true, disabled: true },
      ],
])

/* Screen 4: der Share-Dialog. Er schaltet nur seinen Zustand um — kein
 * Backend, kein Token, kein Ablauf-Rechnen (das kann `share.post.ts` längst). */
const shareOpen = ref(false)
const shareLive = ref(false)
const shareUrl = 'https://branding.supply/brand/share/7f3a9c2e41b8'
const shareCopied = ref(false)

function copyShareUrl(): void {
  shareCopied.value = true
  window.setTimeout(() => { shareCopied.value = false }, 1600)
}

/* Das Inhaltsverzeichnis (UContentToc) ist der Baustein `FdToc` — geteilt mit
 * der Share-Seite; hier bekommt er nur seine Hülle (UPageAside, s. Template). */

/**
 * VERÖFFENTLICHEN (docs/plans/DISCOVER-BRANDS.md §4.3, Davids Entscheidung
 * §9.1) — der Weg der Marke in die öffentliche Galerie.
 *
 * WARUM ER NEBEN „TEILEN" WOHNT UND NICHT DARIN: beide frieren denselben
 * Snapshot ein, aber sie beantworten verschiedene Fragen. Teilen heisst „EINE
 * Person soll das lesen, 30 Tage, `noindex`". Veröffentlichen heisst „ALLE
 * dürfen das lesen, dauerhaft, indexierbar" — und geht deshalb erst durch die
 * Freigabe des Betreibers. Ein gemeinsamer Dialog mit einem Häkchen darin
 * würde die grössere Zustimmung im Schatten der kleineren einsammeln.
 *
 * VIER ZUSTÄNDE, die der Kunde HIER sieht (§3.4):
 *   none      — noch nie eingereicht
 *   pending   — „Wartet auf Freigabe" mit der künftigen Adresse
 *   public    — „Öffentlich · seit …" mit Stand aktualisieren / Zurückziehen
 *   declined  — die Begründung des Betreibers + „Erneut einreichen"
 * Im Dummy schaltet ein kleiner Wähler zwischen ihnen; im Echtbetrieb kommt
 * der Zustand aus `brand_publications.status`.
 */
type PublicationState = 'none' | 'pending' | 'public' | 'declined'
const publicationState = ref<PublicationState>('none')
const PUBLICATION_SLUG = '/discover/kailua-coffee-co'
const DECLINE_NOTE = 'Auf dem Bild im Kapitel „Visuelle Identität" ist ein fremdes Logo zu sehen. Bitte tauscht es aus und reicht erneut ein.'

const publishOpen = ref(false)
const publishConsent = ref(false)

function openPublish(): void {
  publishConsent.value = false
  publishOpen.value = true
}

function submitPublication(): void {
  publicationState.value = 'pending'
  publishOpen.value = false
}

/* Der Zustands-Wähler ist DUMMY-MÖBEL — er steht sichtbar als solches da,
 * damit niemand ihn für ein Produkt-Element hält. */
const stateChoices: { value: PublicationState, label: string }[] = [
  { value: 'none', label: 'nicht eingereicht' },
  { value: 'pending', label: 'wartet auf Freigabe' },
  { value: 'public', label: 'öffentlich' },
  { value: 'declined', label: 'abgelehnt' },
]

useHead({ title: `Brand Foundation · ${demoFoundation.brand.title}` })
</script>

<template>
  <BwWorkspace
    class="fd-page"
    :progress-pct="acceptedPct"
    :content-locale="demoFoundation.brand.locale.toLowerCase()"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="standCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        @select="() => {}"
        @select-brand="to => navigateTo(to)"
      />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="railCollapsed ? 'Navigation einblenden' : 'Navigation ausblenden'"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">Brand Foundation</p>
          <p class="truncate font-semibold">{{ demoFoundation.brand.title }}</p>
        </div>

        <!-- KEIN „Bearbeiten" (§2.6): korrigiert wird in der Werkstatt. -->
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" icon="i-ph-share-network"
            label="Teilen" class="max-sm:hidden" @click="shareOpen = true"
          />
          <!-- Veröffentlichen steht NEBEN Teilen, nicht darin (s. Kopf). -->
          <UButton
            size="sm" color="neutral" variant="ghost" icon="i-ph-globe-hemisphere-west"
            label="Veröffentlichen" class="max-sm:hidden" @click="openPublish"
          />
          <UDropdownMenu :items="exportItems" :content="{ align: 'end' }" :ui="{ content: 'bw-root bw-overlay w-72' }">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-ph-export" label="Exportieren" class="max-sm:hidden" />
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
            :aria-label="standCollapsed ? 'Inhalt einblenden' : 'Inhalt ausblenden'"
            @click="standCollapsed = !standCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <!-- Lesebreite (§2.6): die Foundation ist zum LESEN gebaut. -->
      <div class="fd-read mx-auto flex max-w-3xl flex-col gap-10 pb-6">
        <!-- Nur im Druck: Kopfzeile mit Marke und Stand auf jeder Seite. -->
        <p class="fd-print-head bw-label">{{ demoFoundation.brand.title }} · Brand Foundation · Stand {{ demoFoundation.brand.standDate }}</p>

        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Foundation</p>
          <h1 class="mt-1 text-4xl font-extralight leading-tight tracking-tight">{{ demoFoundation.brand.title }}</h1>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">
            Stand {{ demoFoundation.brand.standDate }} · {{ acceptedCount }} von {{ counted.length }} Kapiteln abgenommen · Inhaltssprache {{ demoFoundation.brand.locale }}
          </p>

          <!-- DER VERÖFFENTLICHUNGS-ZUSTAND (§4.3) — er steht im KOPF des
               Dokuments, weil er über das ganze Dokument etwas aussagt. -->
          <div v-if="publicationState === 'pending'" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="bw-state bw-state--draft">Wartet auf Freigabe</span>
            <p class="bw-label" style="color: var(--bw-muted)">Nach der Freigabe erreichbar unter {{ PUBLICATION_SLUG }}</p>
          </div>
          <div v-else-if="publicationState === 'public'" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span class="bw-state bw-state--confirmed">Öffentlich</span>
            <p class="bw-label" style="color: var(--bw-muted)">seit 8. September 2026 ·
              <NuxtLink to="/brand/demo/anatomie" class="underline underline-offset-4">{{ PUBLICATION_SLUG }}</NuxtLink>
            </p>
            <span class="flex flex-wrap items-center gap-2">
              <UButton size="xs" color="neutral" variant="outline" label="Stand aktualisieren" class="rounded-full" @click="publicationState = 'pending'" />
              <UButton size="xs" color="neutral" variant="ghost" label="Zurückziehen" @click="publicationState = 'none'" />
            </span>
          </div>
          <div v-else-if="publicationState === 'declined'" class="mt-4">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="bw-state bw-state--stale">Abgelehnt</span>
              <p class="bw-label" style="color: var(--bw-muted)">am 8. September 2026</p>
            </div>
            <p class="mt-2 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ DECLINE_NOTE }}</p>
            <UButton size="xs" color="neutral" variant="outline" label="Erneut einreichen" class="mt-3 rounded-full" @click="openPublish" />
          </div>

          <!-- DUMMY-MÖBEL: im Echtbetrieb kommt der Zustand aus der Tabelle. -->
          <div class="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style="border-color: var(--bw-line)">
            <span class="bw-pending">Dummy — Zustand zeigen:</span>
            <button
              v-for="choice in stateChoices" :key="choice.value"
              class="bw-select-card rounded-full px-3 py-1 text-xs"
              :class="publicationState === choice.value ? 'bw-select-card--on' : ''"
              @click="publicationState = choice.value"
            >{{ choice.label }}</button>
          </div>
        </div>

        <!-- „AUF EINER SEITE" (§1.5, HubSpot-Muster): der Schnellzugriff über
             Kapitel 0 — kein eigenes Kapitel, nur vorhandene Felder. -->
        <div class="bw-card p-8">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Auf einer Seite</p>
          <p class="mt-4 text-lg font-extralight leading-snug tracking-tight">{{ demoFoundation.onePage.purpose }}</p>
          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <p class="bw-label" style="color: var(--bw-muted)">Werte</p>
              <ul class="mt-2 space-y-2">
                <li v-for="v in demoFoundation.onePage.values" :key="v.word">
                  <p class="text-sm font-medium">{{ v.word }}</p>
                  <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ v.line }}</p>
                </li>
              </ul>
            </div>
            <div class="space-y-4">
              <div>
                <p class="bw-label" style="color: var(--bw-muted)">Archetyp</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ demoFoundation.onePage.archetype }}</p>
              </div>
              <div>
                <p class="bw-label" style="color: var(--bw-muted)">Tagline</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ demoFoundation.onePage.tagline }}</p>
              </div>
              <div>
                <p class="bw-label" style="color: var(--bw-muted)">Zeile für die Wand</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ demoFoundation.onePage.wallLine }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Die Kapitel — EIN Renderer für beide Ansichten (§2.1). Die eine
             Ausnahme ist Kapitel 10 nach Brand Design: es ist dann keine
             Text-Sammlung mehr, sondern eine Vitrine (s. FdDesignChapter). -->
        <template v-for="(chapter, i) in chapters" :key="chapter.id">
          <FdDesignChapter
            v-if="chapter.id === 'visuell' && designState !== 'locked'"
            :index="i" :state="designChapterState"
          />
          <FdChapter v-else :chapter="chapter" :index="i" variant="private" />
        </template>
      </div>
    </template>

    <!-- RECHTS: das Inhaltsverzeichnis mit Sprungmarken. Dieselbe Stelle, an
         der das Arbeits-Dokument den STAND zeigt — hier ist der Stand die
         Kapitel-Liste (Haken · Kreis · Schloss), unten der Zähler. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- UPageAside ist im Vorbild ein sticky Seitenrand unter dem Header;
             hier lebt sie in der scrollenden Spalte des Workspace — deshalb
             `static` statt `sticky` und keine Header-Höhe. -->
        <UPageAside
          :ui="{
            root: 'block static min-h-0 flex-1 overflow-y-auto max-h-none px-6 py-4 lg:ps-6 lg:ms-0 lg:pe-6 lg:max-h-none lg:static',
            container: 'relative',
          }"
        >
          <FdToc :chapters="chapters" />
        </UPageAside>

        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="acceptedPct"
            progress-title="Kapitel"
            :progress-count="`${acceptedCount}/${counted.length}`"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>

  <!-- SCREEN 4 — DER SHARE-DIALOG (§2.6). Er sagt VORHER, was der Empfänger
       sieht und was nicht: das ist der Grund, warum es ihn gibt. -->
  <UModal v-model:open="shareOpen">
    <template #content>
      <div class="bw-root relative max-h-[85vh] overflow-y-auto p-8" style="background: var(--bw-surface-hi)">
        <button
          class="absolute right-5 top-5 grid size-8 place-items-center rounded-full"
          aria-label="Schließen" @click="shareOpen = false"
        >
          <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
        </button>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Teilen</p>
        <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">Brand Foundation teilen</h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          So sehen Empfänger das Dokument: eine Momentaufnahme des bestätigten Stands, lesbar über einen Link — ohne Konto, ohne Anmeldung.
        </p>

        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
            <p class="bw-label" style="color: var(--bw-accent)">Wird sichtbar</p>
            <ul class="mt-2 space-y-1.5 text-sm" style="color: var(--bw-ink-soft)">
              <li>Brand Story</li>
              <li>Kapitel 01–09 in ihrer abgenommenen Fassung</li>
              <li>Stand-Datum der Momentaufnahme</li>
            </ul>
          </div>
          <div class="rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
            <p class="bw-label" style="color: var(--bw-stale)">Bleibt drin</p>
            <ul class="mt-2 space-y-1.5 text-sm" style="color: var(--bw-ink-soft)">
              <li>Gespräche mit George</li>
              <li>Entwürfe und Rohantworten</li>
              <li>Wettbewerber und Beschwerden</li>
              <li>Zähler, Notizen, Befunde</li>
            </ul>
          </div>
        </div>

        <p class="bw-label mt-5" style="color: var(--bw-muted)">Läuft ab nach 30 Tagen · bis 5. Oktober 2026</p>

        <template v-if="shareLive">
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <p class="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm" style="background: var(--bw-surface); color: var(--bw-ink-soft)">{{ shareUrl }}</p>
            <UButton
              :label="shareCopied ? 'Kopiert' : 'Kopieren'" :icon="shareCopied ? 'i-ph-check' : 'i-ph-copy'"
              color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
              @click="copyShareUrl"
            />
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <UButton to="/brand/demo/share" label="Empfänger-Ansicht öffnen" trailing-icon="i-ph-arrow-up-right" class="rounded-full" />
            <UButton label="Widerrufen" color="neutral" variant="ghost" @click="shareLive = false" />
          </div>
          <p class="bw-pending mt-4">Ein neuer Link ersetzt den alten — der alte antwortet danach nicht mehr.</p>
        </template>
        <template v-else>
          <UButton class="mt-4 rounded-full" icon="i-ph-link" label="Link erzeugen" @click="shareLive = true" />
          <p class="bw-pending mt-4">Ein neuer Link ersetzt den alten — der alte antwortet danach nicht mehr.</p>
        </template>
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
          aria-label="Schließen" @click="publishOpen = false"
        >
          <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
        </button>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Veröffentlichen</p>
        <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">In Discover Brands zeigen</h2>
        <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Wir frieren den bestätigten Stand ein und legen ihn dem Team zur Freigabe vor. Erst danach ist die Marke öffentlich und für Suchmaschinen sichtbar.
        </p>

        <div class="mt-6 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
          <p class="bw-label" style="color: var(--bw-muted)">So steht sie in der Galerie</p>
          <dl class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt class="bw-label" style="color: var(--bw-muted)">Titel</dt><dd class="text-sm">{{ demoFoundation.brand.title }}</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Adresse</dt><dd class="text-sm">{{ PUBLICATION_SLUG }}</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Branche</dt><dd class="text-sm">Lebensmittel und Getränke</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Weiche</dt><dd class="text-sm">Neue Marke</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Archetyp</dt><dd class="text-sm">{{ demoFoundation.brand.archetype }}</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Sprache</dt><dd class="text-sm">{{ demoFoundation.brand.locale }}</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Stand</dt><dd class="text-sm">{{ demoFoundation.brand.standDate }}</dd></div>
            <div><dt class="bw-label" style="color: var(--bw-muted)">Brand Score</dt><dd class="text-sm">87 (Auftritt vom 3. September 2026)</dd></div>
          </dl>
        </div>

        <p class="bw-pending mt-4">Nicht veröffentlicht werden: Gespräche, Entwürfe, Wettbewerber, Beschwerden — genau wie beim Teilen.</p>

        <UCheckbox
          v-model="publishConsent"
          class="mt-5"
          label="Ich darf diese Marke veröffentlichen und weiß, dass sie nach Freigabe öffentlich und indexierbar ist"
        />

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <UButton label="Zur Freigabe einreichen" class="rounded-full" :disabled="!publishConsent" @click="submitPublication" />
          <UButton label="Abbrechen" color="neutral" variant="ghost" @click="publishOpen = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style>
/* SCREEN 6 — DRUCK (§2.6). Nicht `scoped`: die Zonen der Werkstatt (Rail,
 * Balken, Stand-Spalte) sind fremde Komponenten, an die eine scoped Regel
 * nicht heranreicht. Die Klasse `.fd-page` am Werkstatt-Wurzelknoten hält
 * die Regeln trotzdem bei DIESER Seite. */
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
  .fd-page .bw-card { box-shadow: none !important; background: transparent !important; border: 1px solid #ddd; border-radius: 8px; }
}
</style>
