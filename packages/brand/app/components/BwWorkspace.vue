<script setup lang="ts">
/** Drei-Zonen-Werkstatt. Korrekturrunde 3 (David): Brandname + "% abgeschlossen"
 *  + Gespeichert LINKSBÜNDIG (der Meine-Brands-Weg lebt jetzt im Switcher);
 *  rechts Hilfe (kontextbezogen) + User-Menü mit Sprachregler. */
const props = withDefaults(defineProps<{
  progressPct: number
  contentLocale: string
  progressNote?: string
  /* Zweite Fuß-Zeile (Runde 77): bewusster Umbruch OHNE Trenner-Punkt. */
  progressSubnote?: string
  /* Korrekturrunde 11 (David, 2026-09-02): der Gesamt-Fortschritt darf in die
   * Stand-Spalte umziehen — die SEITE rendert BwRailFooter dann selbst und
   * schaltet den Rail-Fuß hier ab. Default true via withDefaults, weil ein
   * fehlendes Boolean-Prop sonst `false` wäre und der Fuß überall verschwände. */
  railFooter?: boolean
  /* Runde 13 (David, 2026-09-02): die Inhaltssprache darf in den Stand-Kopf
   * umziehen — die Seite rendert sie dann selbst und schaltet sie hier ab. */
  localeInTopbar?: boolean
  /* Runde 16 (David, 2026-09-02): mit dem Brand-Switcher in der Sidebar hat
   * die Topbar keine Aufgabe mehr — die Seite darf sie ganz abschalten und
   * zeigt den Sync-Zustand dann selbst (im Dummy: in der Sidebar). */
  topbar?: boolean
  /* Runde 16: dreizeiliger Rail-Fuß — durchgereicht an BwRailFooter. */
  progressTitle?: string
  progressCount?: string
  progressTime?: string
  /* Runde 18 (David, 2026-09-02): FESTE Breite der Nav-Spalte (z. B.
   * '288px', Vorbild UDashboardSidebar --width). Gesetzt entfällt die
   * ziehbare Naht Rail↔Bühne — nur Bühne↔Stand bleibt ein Splitter. */
  railWidth?: string
  /**
   * Breite der Bühne (`--bw-stage-max`, Default 46 rem = Lesebreite). Die
   * Werkstatt-Kapitel setzen 72 rem: dort wird gewählt, nicht gelesen —
   * Karten zu dritt, Rampen, Specimen brauchen die Fläche (David, 2026-09-08).
   * Dokument und Foundation-Leseansicht bleiben bei der Lesebreite.
   */
  stageWidth?: string
  /* Runde 20 (David): die Seite darf die Nav-Spalte einklappen (Toggle im
   * Bühnen-Balken). Wirkt nur im Fixed-Rail-Zweig; v-show statt v-if, damit
   * Collapsible-Zustände der Sidebar das Einklappen überleben. */
  railCollapsed?: boolean
  /* Runde 33 (David): dito für die STAND-Spalte rechts — eingeklappt entfällt
   * der Splitter und die Bühne nimmt die volle Restbreite. */
  georgeCollapsed?: boolean
  /* Davids Entscheidung 2026-09-03: die WERKSTATT startet mobil im GESPRÄCH
   * ('stage' — seit dem Bühnen-Tausch ist die Mitte das Gespräch). Default
   * bleibt 'george', weil die Alt-Seiten (werte-/ergebnis-Demo, altes
   * Modell) dort ihren Chat haben — deren Mobil-Start ändert sich nicht. */
  initialMode?: 'stage' | 'george'
  /**
   * MOBIL (<768 px) IST DIE NAV EIN OVERLAY (Audit A7, Davids Entscheidung
   * 2026-09-02). Dort versteckt `.bw-rail { display: none }` die Spalte
   * komplett — der Balken-Toggle der Seite zeigte auf nichts, es gab GAR
   * KEINE Baustein-Navigation. Offen legt sich dieselbe Rail als Vollbild-
   * Layer über die Werkstatt.
   *
   * KEIN ZWEITER SIDEBAR-BAUM: das Overlay ist der Grid-Zweig-`<aside>`
   * SELBST, nur per Klasse aus dem Fluss gehoben. Ein eigener Baum hätte
   * eine zweite `BwWorkspaceSidebar`-Instanz gemountet — die eingeklappten
   * Bereiche (UCollapsible), der offene Info-Layer und der Marken-Wähler
   * hätten dann zwei Zustände, die auseinanderlaufen.
   *
   * Ab 768 px tut das Prop NICHTS (die CSS-Regeln stehen ausschliesslich in
   * `@media (max-width: 767px)`); die Seite setzt es dort auch nie.
   */
  railOverlay?: boolean
  /* §3e: NUR Abweichungs-Zustände erscheinen — Stille heißt gespeichert.
   * P1c: 'error' kam dazu (der fünfte Zustand der Autosave-Regel); die drei
   * bestehenden sind unverändert, der Dummy sieht davon nichts. */
  syncState?: 'saving' | 'offline' | 'conflict' | 'error' | null
  /* P1c: übersetzte Beschriftung. Ohne sie bleibt die feste Dummy-Copy. */
  syncLabel?: string
  /* Runde 78 (David): der Fuß IST der Einstieg ins kombinierte Branding. */
  progressTo?: string
  /* Runde 96 (David): der Brand Score gehört an den Branding-Einstieg. */
  score?: number
}>(), {
  /* Die `undefined`-Defaults ändern nichts — sie stellen nur die Exemption
   * wieder her, die das nackte defineProps hatte (vue/require-default-prop
   * verlangt ab withDefaults für JEDES optionale Prop einen Default). */
  railFooter: true,
  localeInTopbar: true,
  topbar: true,
  progressTitle: undefined,
  progressCount: undefined,
  progressTime: undefined,
  railWidth: undefined,
  stageWidth: undefined,
  railCollapsed: false,
  georgeCollapsed: false,
  initialMode: 'george',
  railOverlay: false,
  progressNote: undefined,
  progressSubnote: undefined,
  syncState: null,
  syncLabel: undefined,
  progressTo: undefined,
  score: undefined,
})
/* Das Overlay schliesst sich auch SELBST (ESC, Schliessen-Knopf); der
 * Zustand bleibt aber bei der Seite, die ihn öffnet — daher v-model. */
const emit = defineEmits<{ 'update:railOverlay': [value: boolean] }>()

const { t } = useI18n()
/* Die Beschriftung kommt aus `brand.workspace.sync.*` — dieselben vier
 * Schlüssel, die die Werkstatt-Seite via `syncLabel` hereinreicht. Der
 * Fallback ist damit kein zweiter Wortlaut mehr, sondern derselbe. */
const SYNC = {
  saving: { key: 'brand.workspace.sync.saving', icon: 'i-ph-circle-notch', spin: true, tone: 'var(--bw-muted)' },
  offline: { key: 'brand.workspace.sync.offline', icon: 'i-ph-cloud-slash', spin: false, tone: 'var(--bw-draft)' },
  conflict: { key: 'brand.workspace.sync.conflict', icon: 'i-ph-warning', spin: false, tone: 'var(--bw-stale)' },
  error: { key: 'brand.workspace.sync.error', icon: 'i-ph-warning-circle', spin: false, tone: 'var(--bw-stale)' },
} as const
const mode = ref<'stage' | 'george'>(props.initialMode)
/* Runde 191 (David): die zwei Zonen-Nähte sind ZIEHBAR — Nuxt UIs
 * USplitter (seit 4.11.0). Nur auf Desktop (>=1280px), wo alle drei
 * Zonen nebeneinander stehen; darunter bleibt das Grid mit Mini-Rail
 * bzw. dem Mobil-Modusschalter. SSR und erster Client-Paint rendern
 * IMMER das Grid (identisch, kein Hydration-Mismatch) — der Splitter
 * steigt erst nach dem Mount ein. autoSaveId merkt sich die
 * Aufteilung je Browser in localStorage. */
const isDesktop = ref(false)
/* Runde 30 (David, „links springt die 1px-Linie, rechts rutscht der Stand"):
 * SSR + erster Client-Paint kennen die Viewport-Breite nicht — bis zum Mount
 * rendert eine Seite MIT railWidth deshalb einen STATISCHEN Flex-Zweig, der
 * pixel-identisch zum Fixed-Rail-Splitter aussieht (Rail-Linie, Balken über
 * beiden Spalten, 63/37-Teilung). Vorher sprang der Grid-Fallback sichtbar
 * ins Splitter-Layout um. */
const mounted = ref(false)
let desktopMq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent | MediaQueryList) => { isDesktop.value = e.matches }
onMounted(() => {
  desktopMq = window.matchMedia('(min-width: 1280px)')
  onMq(desktopMq)
  desktopMq.addEventListener('change', onMq)
  mounted.value = true
})
onBeforeUnmount(() => desktopMq?.removeEventListener('change', onMq))
/**
 * EINGEKLAPPT HEISST 0 BREIT, NICHT AUSGETAUSCHT (Audit-Befund B1).
 *
 * Vorher stand für den eingeklappten Stand ein EIGENER Zweig (`v-if` /
 * `v-else` um den Splitter herum). Zwei Zweige sind zwei Vnode-Bäume: bei
 * JEDEM Klick auf den Balken-Toggle wurden Bühne UND Log neu gemountet —
 * Chat-Scrollposition weg, offene Bedien-Zustände der Karten weg. Jetzt
 * bleibt die Struktur dieselbe, und das Panel wird per Klasse auf null
 * gezogen (`.bw-panel-off`, sticht reka-uis Inline-`flex-grow`). Der
 * Splitter behält damit auch seine gemerkte Aufteilung: beim Aufklappen
 * steht die alte Naht wieder da, statt auf den Default zurückzufallen.
 */
const off = (collapsed: boolean): string => (collapsed ? 'min-w-0 bw-panel-off' : 'min-w-0')

const HANDLE = 'w-px transition-colors bg-(--bw-line) data-[state=hover]:bg-(--bw-accent) data-[state=drag]:bg-(--bw-accent)'

const zoneItems = computed(() => [
  { slot: 'rail', defaultSize: 24, minSize: 16, maxSize: 34, class: off(props.railCollapsed) },
  { slot: 'stage', defaultSize: 48, minSize: 32, class: 'min-w-0' },
  { slot: 'george', defaultSize: 28, minSize: 20, maxSize: 42, class: off(props.georgeCollapsed) },
])
/* Runde 18: bei fester Rail-Breite trägt der Splitter nur noch zwei Zonen
 * (Prozente beziehen sich dann auf die Restbreite NEBEN der Rail). */
const zoneItemsFixedRail = computed(() => [
  { slot: 'stage', defaultSize: 63, minSize: 42, class: 'min-w-0' },
  { slot: 'george', defaultSize: 37, minSize: 24, maxSize: 55, class: off(props.georgeCollapsed) },
])
/**
 * BEDIENUNG DES NAV-OVERLAYS (mobil). Drei Dinge, die ein Vollbild-Layer
 * schuldet — und je eine Falle dabei:
 *
 * 1. ESC schliesst. Der Lauscher hängt am `window`, weil der Fokus in einem
 *    nicht-fokussierbaren Bereich auch beim `body` landen kann. Er hält sich
 *    aber HERAUS, sobald der Fokus ausserhalb des Overlays steht: die
 *    Sidebar öffnet teleportierte Modals (Info, „Neues Branding"), und dort
 *    gehört ESC dem Modal — sonst schlösse ein Tastendruck beides.
 * 2. Der Fokus wandert beim Öffnen HINEIN (auf den Schliessen-Knopf) und
 *    beim Schliessen zurück auf das Element, das ihn abgegeben hat. Das ist
 *    der Balken-Toggle, ohne dass diese Komponente ihn kennen muss.
 * 3. Die Geschwister (Hauptnavigation, Modus-Umschalter, Bühne, Log) werden
 *    `inert` — ein Vollbild-Layer, unter dem man weitertabben kann, ist ein
 *    Layer, aus dem man herausfällt.
 */
const railOverlayEl = ref<HTMLElement | null>(null)
let railOverlayReturn: HTMLElement | null = null

function onRailOverlayKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const active = document.activeElement
  if (active && active !== document.body && !railOverlayEl.value?.contains(active)) return
  emit('update:railOverlay', false)
}

watch(() => props.railOverlay, async (open) => {
  if (open) {
    railOverlayReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.addEventListener('keydown', onRailOverlayKey)
    await nextTick()
    railOverlayEl.value?.querySelector<HTMLElement>('[data-bw-rail-close]')?.focus()
    return
  }
  window.removeEventListener('keydown', onRailOverlayKey)
  /* DAS `nextTick` IST PFLICHT, NICHT KOSMETIK (live erwischt): `watch`
   * läuft mit `flush: 'pre'`, also VOR dem Neurendern — der Balken-Toggle
   * steckt in diesem Moment noch in der `inert`-Spalte, und ein `inert`
   * Element nimmt keinen Fokus an. Der Fokus fiel lautlos auf den `body`,
   * die Tastatur-Bedienung begann wieder ganz oben. */
  await nextTick()
  railOverlayReturn?.focus()
  railOverlayReturn = null
})
onBeforeUnmount(() => window.removeEventListener('keydown', onRailOverlayKey))

/* Runde 132 (David): das Konto-Menü (Sprache, Erscheinungsbild,
 * Tastaturkürzel, Support, Konto) wohnt jetzt DAUERHAFT in BwSiteNav
 * oben rechts — die Topbar behält nur Brand-Switcher und Sync-Zustand.
 * Die Inhaltssprache der Brand zeigt eine stille Mono-Marke rechts. */
</script>

<template>
  <div
    class="bw-root bw-shell" :class="mode === 'stage' ? 'bw-mode-stage' : 'bw-mode-george'"
    :style="stageWidth ? `--bw-stage-max: ${stageWidth}` : undefined"
  >
    <!-- Hauptnavigation liegt auch über der Werkstatt (Davids Vorgabe
         Runde 131) — der Rest des Shells teilt sich die Resthöhe. -->
    <div class="flex-none px-6" :inert="railOverlay || undefined">
      <BwSiteNav style="margin-bottom: 0" />
    </div>
    <header v-if="topbar" class="bw-topbar" :inert="railOverlay || undefined">
      <div class="flex min-w-0 items-center gap-2.5">
        <!-- Runde 5: das Auswahlmenü ERSETZT den Brandnamen im Header -->
        <slot name="brand" />
        <Transition name="bw-sync">
          <span v-if="syncState" class="bw-label flex flex-none items-center gap-1.5" :style="`color: ${SYNC[syncState].tone}`">
            <UIcon :name="SYNC[syncState].icon" :class="SYNC[syncState].spin ? 'animate-spin' : ''" class="size-4" />
            {{ syncLabel ?? t(SYNC[syncState].key) }}
          </span>
        </Transition>
        <!-- Kein Dauer-Badge (Runde 4): Autosave ist Vertrag, Stille heißt
             gespeichert. Hier erscheinen NUR Abweichungs-Zustände (§3e):
             Speichert… / Offline — Eingabe bleibt erhalten / Konflikt. -->
      </div>
      <div class="ml-auto flex items-center gap-4">
        <span v-if="localeInTopbar" class="bw-label whitespace-nowrap" style="color: var(--bw-muted)">{{ t('brand.workspace.contentLocale') }}: {{ contentLocale.toUpperCase() }}</span>
      </div>
    </header>

    <!-- Der Mobil-Umschalter (unter 768 px). Audit A8: die Reiter hiessen
         noch „Dokument" und — hartkodiert, also auch auf einer englischen
         Oberfläche — „George". Beides stammt aus der Zeit vor dem Umbau
         „Gespräch als Bühne": links steht heute das GESPRÄCH, rechts der
         STAND. Beide Beschriftungen kommen jetzt aus dem Katalog und tragen
         dieselben Wörter wie der Balken (`workspace.bar.*`). -->
    <div class="bw-modeswitch flex border-b" style="border-color: var(--bw-line)" :inert="railOverlay || undefined">
      <button type="button" class="flex-1 py-2 text-sm" :class="mode === 'stage' ? 'font-semibold' : ''" :style="mode === 'stage' ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)'" @click="mode = 'stage'">
        {{ t('brand.workspace.mode.conversation') }}
      </button>
      <button type="button" class="flex-1 py-2 text-sm" :class="mode === 'george' ? 'font-semibold' : ''" :style="mode === 'george' ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)'" @click="mode = 'george'">
        {{ t('brand.workspace.mode.log') }}
      </button>
    </div>

    <!-- Runde 18: feste Rail-Breite — die Rail steht als eigene Spalte NEBEN
         dem Splitter, der nur noch Bühne↔Stand teilt. -->
    <div v-if="isDesktop && railWidth" class="flex min-h-0 flex-1">
      <!-- Runde 20c (David): die 1px-Trennlinie zur Bühne zeichnete vorher der
           Splitter-Griff — bei fester Breite trägt die Rail sie selbst
           (border-e, wie das DashboardSidebar-Theme des Vorbilds). -->
      <aside v-show="!railCollapsed" class="bw-rail flex h-full flex-none flex-col" :style="`width: ${railWidth}; border-right: 1px solid var(--bw-line)`">
        <div class="bw-rail-scroll min-h-0 flex-1"><slot name="rail" /></div>
        <div v-if="railFooter" class="bw-rail-foot flex-none">
          <BwRailFooter :progress-pct="progressPct" :progress-note="progressNote" :progress-subnote="progressSubnote" :progress-to="progressTo" :score="score" :progress-title="progressTitle" :progress-count="progressCount" :progress-time="progressTime" />
        </div>
      </aside>
      <!-- Runde 32 (David, revidiert 20d): der Balken gehört NUR zur
           Gesprächs-Spalte (Zone über deren Scroller, 1px-Linie darunter) —
           der Stand beginnt oben rechts direkt mit dem Log.
           Runde 33 / Audit B1: eingeklappt zieht sich das Stand-Panel auf
           null zusammen — EIN Baum, damit die Bühne nicht bei jedem Toggle
           neu mountet (s. `off()`). Der Griff verschwindet mit ihm. -->
      <USplitter
        id="bw-workspace-fixedrail" auto-save-id="bw-workspace-fixedrail" :items="zoneItemsFixedRail"
        class="min-h-0 min-w-0 flex-1"
        :ui="{ handle: georgeCollapsed ? 'hidden' : HANDLE }"
      >
        <template #stage>
          <!-- Runde 23 (David): stage-footer = fester Fuß der Bühne (das
               Chat-Prompt des Nuxt-UI-Chat-Templates) — außerhalb des
               Scrollers, auf der 46rem-Flucht des Gesprächs. -->
          <div class="flex h-full w-full min-w-0 flex-col">
            <div v-if="$slots['stage-bar']" class="bw-stage-bar flex-none"><slot name="stage-bar" /></div>
            <main class="bw-stage min-h-0 w-full min-w-0 flex-1"><div class="bw-stage-inner"><slot /></div></main>
            <div v-if="$slots['stage-footer']" class="bw-stage-foot flex-none"><div class="bw-stage-inner"><slot name="stage-footer" /></div></div>
          </div>
        </template>
        <template #george>
          <aside class="bw-george h-full w-full" :inert="georgeCollapsed || undefined"><slot name="george" /></aside>
        </template>
      </USplitter>
    </div>
    <!-- Runde 30: der PRE-MOUNT-Zweig für Seiten mit fester Rail-Breite —
         dieselbe Anatomie wie der Splitter-Zweig darüber, nur statisch
         (63/37 wie zoneItemsFixedRail). SSR und erster Paint sehen damit
         exakt das Endlayout; nach dem Mount übernimmt der Splitter lautlos. -->
    <div v-else-if="railWidth && !mounted" class="flex min-h-0 flex-1">
      <aside v-show="!railCollapsed" class="bw-rail flex h-full flex-none flex-col" :style="`width: ${railWidth}; border-right: 1px solid var(--bw-line)`">
        <div class="bw-rail-scroll min-h-0 flex-1"><slot name="rail" /></div>
        <div v-if="railFooter" class="bw-rail-foot flex-none">
          <BwRailFooter :progress-pct="progressPct" :progress-note="progressNote" :progress-subnote="progressSubnote" :progress-to="progressTo" :score="score" :progress-title="progressTitle" :progress-count="progressCount" :progress-time="progressTime" />
        </div>
      </aside>
      <!-- Runde 32 (David): der Balken endet an der Naht — er gehört NUR zur
           Gesprächs-Spalte, der Stand beginnt oben direkt mit dem Log. -->
      <div class="flex min-h-0 min-w-0 flex-1">
        <div class="flex h-full min-w-0 flex-col" style="flex: 63 1 0">
          <div v-if="$slots['stage-bar']" class="bw-stage-bar flex-none"><slot name="stage-bar" /></div>
          <main class="bw-stage min-h-0 w-full min-w-0 flex-1"><div class="bw-stage-inner"><slot /></div></main>
          <div v-if="$slots['stage-footer']" class="bw-stage-foot flex-none"><div class="bw-stage-inner"><slot name="stage-footer" /></div></div>
        </div>
        <!-- Runde 30b: die 1px-Naht Bühne↔Stand zeichnet nach dem Mount der
             Splitter-Griff — hier statisch, damit sie nicht nachspringt. -->
        <aside v-show="!georgeCollapsed" class="bw-george h-full min-w-0" style="flex: 37 1 0; border-left: 1px solid var(--bw-line)"><slot name="george" /></aside>
      </div>
    </div>
    <USplitter
      v-else-if="isDesktop" id="bw-workspace" auto-save-id="bw-workspace" :items="zoneItems"
      class="min-h-0 flex-1"
      :ui="{ handle: HANDLE }"
    >
      <template #rail>
        <aside class="bw-rail flex h-full w-full flex-col" :inert="railCollapsed || undefined">
          <!-- Runde 12 (David): der Scroller trägt das Spalten-Padding SELBST
               (.bw-rail-scroll) — vorher lag es außen an .bw-rail und der
               Scrollbalken schwebte mitten in der Spalte statt an ihrer Kante. -->
          <div class="bw-rail-scroll min-h-0 flex-1"><slot name="rail" /></div>
          <div v-if="railFooter" class="bw-rail-foot flex-none">
            <BwRailFooter :progress-pct="progressPct" :progress-note="progressNote" :progress-subnote="progressSubnote" :progress-to="progressTo" :score="score" :progress-title="progressTitle" :progress-count="progressCount" :progress-time="progressTime" />
          </div>
        </aside>
      </template>
      <template #stage>
        <!-- Audit B4: der Dreizonen-Zweig war der EINZIGE ohne Balken- und
             Fuß-Zone — Seiten mit diesen Slots, aber ohne feste Rail-Breite,
             verloren beide ab 1280 px. Dieselbe Anatomie wie oben. -->
        <div class="flex h-full w-full min-w-0 flex-col">
          <div v-if="$slots['stage-bar']" class="bw-stage-bar flex-none"><slot name="stage-bar" /></div>
          <main class="bw-stage min-h-0 w-full min-w-0 flex-1"><div class="bw-stage-inner"><slot /></div></main>
          <div v-if="$slots['stage-footer']" class="bw-stage-foot flex-none"><div class="bw-stage-inner"><slot name="stage-footer" /></div></div>
        </div>
      </template>
      <template #george>
        <aside class="bw-george h-full w-full" :inert="georgeCollapsed || undefined"><slot name="george" /></aside>
      </template>
    </USplitter>
    <!-- Der Grid-Zweig: unter 1280 px und (ohne feste Rail-Breite) vor dem
         Mount. Audit B3: die beiden Balken-Toggles waren hier tote Knöpfe.
         `display: none` verbietet sich in einem Grid — die drei Kinder
         rutschten dann in die falschen Spuren; eingeklappt wird deshalb die
         SPALTE auf null gezogen (`--bw-col-*`), der Inhalt liegt hinter
         `overflow: hidden` und ist per `inert` aus dem Weg. -->
    <div
      v-else class="bw-zones"
      :class="[
        railWidth ? 'bw-zones--fixed-rail' : '',
        railCollapsed ? 'bw-zones--rail-off' : '',
        georgeCollapsed ? 'bw-zones--log-off' : '',
      ]"
      :style="railWidth ? `--bw-rail-w: ${railWidth}` : undefined"
    >
      <!-- Mobil-Drawer (A7; „schmal statt Vollbild" 2026-09-03): DERSELBE
           `<aside>`, nur per `.bw-rail-overlay` aus dem Fluss gehoben
           (position: fixed, ausschliesslich <768 px). Der Backdrop dunkelt
           die Werkstatt ab und schliesst per Tipp — er steht im DOM VOR der
           Rail (gleiche z-50, Reihenfolge entscheidet, s. brand.css).
           `role="dialog"` trägt der `<aside>` NUR offen — ab 768 px ist er
           eine ganz gewöhnliche Spalte. `railCollapsed` darf ihn dann nicht
           `inert` machen: wer auf dem Desktop einklappt und aufs Handy
           verkleinert, hätte sonst ein Overlay, das keine Taste annimmt. -->
      <div
        v-if="railOverlay"
        class="bw-rail-backdrop"
        aria-hidden="true"
        @click="emit('update:railOverlay', false)"
      />
      <aside
        ref="railOverlayEl"
        class="bw-rail flex flex-col"
        :class="railOverlay ? 'bw-rail-overlay' : ''"
        :role="railOverlay ? 'dialog' : undefined"
        :aria-modal="railOverlay ? 'true' : undefined"
        :aria-label="railOverlay ? t('brand.workspace.rail.progressNav') : undefined"
        :tabindex="railOverlay ? -1 : undefined"
        :inert="(railCollapsed && !railOverlay) || undefined"
      >
        <div class="bw-rail-overlay-head flex-none">
          <UButton
            data-bw-rail-close
            size="sm" color="neutral" variant="ghost" icon="i-ph-x"
            :aria-label="t('brand.workspace.bar.hideNav')"
            @click="emit('update:railOverlay', false)"
          />
        </div>
        <div class="bw-rail-scroll min-h-0 flex-1"><slot name="rail" /></div>
        <!-- Runde 48 (David): Gesamt-Fortschritt unten links statt Ring in
             der Topbar — Balken wie im Info-Layer. -->
        <div v-if="railFooter" class="bw-rail-foot flex-none">
          <BwRailFooter :progress-pct="progressPct" :progress-note="progressNote" :progress-subnote="progressSubnote" :progress-to="progressTo" :score="score" :progress-title="progressTitle" :progress-count="progressCount" :progress-time="progressTime" />
        </div>
      </aside>
      <div class="flex min-h-0 min-w-0 flex-col" :inert="railOverlay || undefined">
        <div v-if="$slots['stage-bar']" class="bw-stage-bar flex-none"><slot name="stage-bar" /></div>
        <main class="bw-stage min-h-0 flex-1"><div class="bw-stage-inner"><slot /></div></main>
        <div v-if="$slots['stage-footer']" class="bw-stage-foot flex-none"><div class="bw-stage-inner"><slot name="stage-footer" /></div></div>
      </div>
      <aside class="bw-george" :inert="georgeCollapsed || railOverlay || undefined"><slot name="george" /></aside>
    </div>
  </div>
</template>
