<script setup lang="ts">
import type { BwRailLayer, BwRailSession, BwRailStep } from './BwProgressRail.vue'
import type { BwNewBrandSubmit } from './BwNewBrandModal.vue'

/**
 * DIE LINKE SPALTE DER WERKSTATT — Nuxt-UI-Sidebar-Muster in der bw-Welt.
 *
 * Sie ist die in den Layer gehobene Fassung von `GdSidebar` aus dem
 * Klickdummy (Runden 16–22/30, abgenommen 2026-09-02). Der Dummy bleibt
 * unangetastet als Abnahme-Dokument; DIESE Komponente ist die, die mit
 * echten Daten läuft — Bereiche/Bausteine aus der Journey, Marken aus dem
 * Konto, Texte aus i18n statt fest deutsch.
 *
 * 1. OBEN der Brand-Switcher (Team-Switcher-Muster). Er ERSETZT den Switcher
 *    aus der Topbar, die mit dem Umbau ganz entfällt. **Falle:** das Menü
 *    teleportiert an den Body, also AUSSERHALB des Token-Wirtes `.bw-root` —
 *    ohne `bw-root bw-overlay` am Content sind alle `--bw-*`-Farben leer
 *    (Monogramme ohne Quadrat, Häkchen schwarz; R19b/c live erwischt).
 *    Aus demselben Grund stehen die Farben im Menü INLINE: scoped CSS greift
 *    in teleportierten Slot-Inhalt nicht verlässlich.
 * 2. KEINE Suche (Davids Entscheidung).
 * 3. Bereiche als einklappbare Gruppen (UCollapsible) mit schlanken Zeilen:
 *    vorn der STATUS (Haken/Halbmond/Kreis/Schloss), hinten das Info-Icon als
 *    echter Knopf — erst bei Hover/Fokus sichtbar, damit die Zeilen ruhig
 *    bleiben. Der Erklär-Layer ist `BwStepInfoModal`, dieselbe Quelle, die
 *    auch `BwProgressRail` benutzt.
 * 4. Der Sync-Zustand wohnt hier, weil es keine Topbar mehr gibt, die ihn
 *    zeigen könnte — und weiterhin NUR als Abweichung (§3e: Stille heisst
 *    gespeichert).
 *
 * Der GESAMT-Fortschritt gehört NICHT hierher: er steht seit Runde 31 unten
 * rechts im Log (`railFooter=false` an `BwWorkspace`).
 */

/** Ein Eintrag des Marken-Wählers — die Seite reicht ihn übersetzt herein. */
export interface BwSidebarBrand {
  id: string
  title: string
  /** „Neue Marke" / „Marken-Relaunch" — das VORHABEN, zweite Zeile. */
  path: string
  /** Flaggen-Icon der Inhaltssprache, z. B. `i-circle-flags-de`. */
  flag?: string
  /** Ziel des Eintrags (Werkstatt der Marke); die aktive Marke braucht keins. */
  to?: string
  current?: boolean
}

const props = withDefaults(defineProps<{
  layers: BwRailLayer[]
  /** Die Brandings des Kontos. Leer ⇒ der Switcher zeigt nur die Ausgänge. */
  brands?: BwSidebarBrand[]
  /** Ziel von „Brandings verwalten". */
  manageTo?: string
  /** §3e: nur Abweichungen erscheinen; `null` heisst gespeichert. */
  syncState?: 'saving' | 'offline' | 'conflict' | 'error' | null
  syncLabel?: string
}>(), {
  brands: () => [],
  manageTo: '/dashboard/brands',
  syncState: null,
  syncLabel: undefined,
})

const emit = defineEmits<{
  /** Ein betretbarer Baustein wurde gewählt — die SEITE navigiert (Autosave!). */
  select: [stepId: string]
  /**
   * Eine ANDERE Marke wurde gewählt — auch hier navigiert die SEITE.
   *
   * Ein `to` am Menü-Eintrag wäre kürzer und falsch (Audit-Befund A3): der
   * Sprung geht auf DENSELBEN Route-Record (`brand/[profileId]/[stepKey]`),
   * also feuert `onBeforeRouteLeave` nicht, und der Autosave hat nie
   * ausgespült — offene Eingaben wären weg. Es ist dieselbe Regel, die
   * `goToStep` schon befolgt.
   */
  selectBrand: [to: string]
  /**
   * EINE SESSION WURDE GEWÄHLT (BW2 §11). Sie reist als `?s=` in DIESELBE
   * Route (`brand/[profileId]/[stepKey]`) — die SEITE navigiert, wie bei
   * Baustein und Marke, damit der Autosave vorher ausspülen kann.
   */
  selectSession: [payload: { stepId: string, sessionId: string }]
}>()

const { t } = useI18n()

const SYNC = {
  saving: { key: 'brand.workspace.sync.saving', icon: 'i-ph-circle-notch', spin: true },
  offline: { key: 'brand.workspace.sync.offline', icon: 'i-ph-cloud-slash', spin: false },
  conflict: { key: 'brand.workspace.sync.conflict', icon: 'i-ph-warning', spin: false },
  error: { key: 'brand.workspace.sync.error', icon: 'i-ph-warning-circle', spin: false },
} as const

const newBrandOpen = ref(false)

/**
 * „Neues Branding" LEGT AN — dieselbe Regel wie auf der Übersicht
 * (`/dashboard/brands`) und auf der Punkte-Seite, und dieselben sechs Zeilen
 * (`useBrandCreate`). Bis zum Kailua-Lauf war es eine ÜBERGABE an
 * `…/brands/new`, weil die Startkarte dort erfragt wurde; sie steht jetzt im
 * Modal, also gibt es nichts mehr zu übergeben (Befund 6).
 */
const {
  contentLocales: newBrandLocales,
  creating: newBrandCreating,
  failed: newBrandFailed,
  create: createBrand,
} = useBrandCreate()

async function startNewBrand(payload: BwNewBrandSubmit): Promise<void> {
  if (await createBrand(payload)) newBrandOpen.value = false
}

const current = computed(() => props.brands.find(brand => brand.current) ?? null)
const monogram = (title: string): string => (title.trim().slice(0, 1) || '?').toUpperCase()

/**
 * Die Menü-Einträge. Die Marken tragen ihre Zusatzfelder direkt am Item
 * (`DropdownMenuItem` erlaubt sie) und werden im `#item`-Slot gerendert —
 * dynamische Slot-Namen je Marke wären dieselbe Anzeige mit mehr Mechanik.
 */
interface BwSwitcherItem {
  label: string
  icon?: string
  to?: string
  /** Marken-Eintrag: Monogramm, Vorhaben, Sprachflagge, Häkchen. */
  mono?: string
  sub?: string
  flag?: string
  active?: boolean
  onSelect?: () => void
}

const brandMenu = computed<BwSwitcherItem[][]>(() => [
  props.brands.map(brand => ({
    label: brand.title,
    mono: monogram(brand.title),
    sub: brand.path,
    flag: brand.flag,
    active: brand.current === true,
    // `onSelect` statt `to`: der Wechsel muss erst den Autosave ausspülen (A3).
    ...(brand.to && !brand.current
      ? { onSelect: () => { emit('selectBrand', brand.to as string) } }
      : {}),
  })),
  [
    { label: t('brand.nav.newBranding'), icon: 'i-ph-plus-circle', onSelect: () => { newBrandOpen.value = true } },
    { label: t('brand.nav.manageBrandings'), icon: 'i-ph-gear-six', to: props.manageTo },
  ],
])

const infoStep = ref<{ step: BwRailStep, layerLabel: string } | null>(null)
const infoOpen = computed({
  get: () => infoStep.value !== null,
  set: (value: boolean) => { if (!value) infoStep.value = null },
})

function openLayerInfo(layer: BwRailLayer): void {
  if (!layer.info) return
  infoStep.value = {
    step: { id: layer.id, label: layer.label, icon: '', state: 'open', info: layer.info },
    // Leer heisst „Übersicht" — die Rückfall-Regel wohnt im Modal (B11).
    layerLabel: layer.lockedNote ?? layer.note ?? '',
  }
}

/** Status-Glyphe VORN: Haken accent · Halbmond ink · Kreis muted · Schloss. */
function glyph(layer: BwRailLayer, step: BwRailStep): { name: string, style: string } {
  // „Euer Branding" (§10) trägt das BUCH und kennt keine Sperre — es steht vor
  // der Schicht-Prüfung, weil Lesen auch in einem gesperrten Weg erlaubt ist.
  if (step.kind === 'document') {
    return {
      name: 'i-ph-book-open',
      style: step.state === 'active' ? 'color: var(--bw-accent)' : 'color: var(--bw-ink-soft)',
    }
  }
  // Ein FREMDER Eintrag (MV1 M4) trägt seine eigene Glyphe — die Leiste hat
  // über „Markt" keine Vorstellung. Gesperrt zeigt er trotzdem das Schloss:
  // die Sperre ist die Auskunft, nicht die Sache.
  if (step.kind === 'extra') {
    if (step.state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
    return {
      name: step.icon || 'i-ph-circle',
      style: step.state === 'active' ? 'color: var(--bw-accent)' : 'color: var(--bw-ink-soft)',
    }
  }
  // Gesperrt ist ein Punkt durch seine SCHICHT oder durch sich selbst (A9).
  if (layer.locked || step.state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  // Der Funke leuchtet, sobald der Punkt etwas ZEIGT — abgeschlossen, gerade
  // offen oder mit eigenem Ziel (die Brand Foundation, s. `stepDisabled`).
  if (step.kind === 'result') {
    const lit = step.state === 'done' || step.state === 'active' || Boolean(step.to)
    return { name: 'i-ph-sparkle', style: lit ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)' }
  }
  if (step.state === 'done') return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
  if (step.state === 'active') return { name: 'i-ph-circle-half-fill', style: 'color: var(--bw-ink)' }
  return { name: 'i-ph-circle', style: 'color: var(--bw-muted)' }
}

/**
 * Betretbar? Für Ergebnis-Punkte erst nach `done`, sonst alles ausser `open`
 * — dieselbe Regel wie im Dummy. Die HARTE Prüfung macht die Seite
 * (`canEnterBrandStep`), bevor sie navigiert; hier geht es nur darum, keinen
 * Knopf anzubieten, der nichts tut.
 */
function stepDisabled(layer: BwRailLayer, step: BwRailStep): boolean {
  // „Euer Branding" ist IMMER erreichbar (§10): es zeigt ausschliesslich
  // bestätigte Werte, und die hat der Mensch selbst gesagt.
  if (step.kind === 'document') return false
  // Ein fremder Eintrag hängt an SEINER eigenen Freischaltung (MV1 M4) und
  // nicht an der Schicht: die Kapitel-Kette sagt nichts darüber, ob ein
  // Zusatzprodukt offen ist.
  if (step.kind === 'extra') return step.state === 'locked'
  if (layer.locked || step.state === 'locked') return true
  // EIN ERGEBNIS-PUNKT MIT EIGENEM ZIEL IST IMMER ERREICHBAR (Paket G2): die
  // Brand Foundation liest auch Zwischenstände, sie darf also nicht an einer
  // Abnahme hängen (§2.6). Ohne `to` bleibt es bei der alten Regel — ein Punkt
  // ohne Ziel wäre ein Knopf, der nichts tut.
  if (step.kind === 'result') return !step.to && step.state !== 'done'
  // EIN KAPITEL MIT EIGENEM ZIEL IST ERREICHBAR, SOLANGE ES NICHT GESPERRT IST
  // (Brand Design D1) — dieselbe Regel wie beim Ergebnis-Punkt eine Zeile
  // höher, aus demselben Grund: `to` heisst „dieser Punkt hat eine Adresse".
  //
  // Ohne sie wäre der EINSTIEG in Brand Design tot: nach der Freischaltung
  // steht „Moodboard" auf `open` (es ist der erste Punkt seiner Schicht, nicht
  // der gerade offene der Foundation), und die Regel darunter macht aus jedem
  // `open` einen ausgeschalteten Knopf. Die Foundation ist unberührt — ihre
  // Kapitel tragen bewusst kein `to` und werden weiter über `select` geöffnet.
  if (step.to) return false
  return step.state === 'open'
}

/**
 * DIE GLYPHE EINER SESSION — dieselbe Bildsprache wie auf der Bühne
 * (`BwSlotList`) und beim Kapitel darüber, plus zwei eigene Zeichen:
 * die UHR für „vertagt" (ein Merkzeichen, kein Zustand) und der FUNKEN für
 * die Finale Abnahme (§11).
 */
function sessionGlyph(session: BwRailSession): { name: string, style: string } {
  if (session.kind === 'acceptance') {
    return {
      name: 'i-ph-sparkle',
      style: session.state === 'locked' && !session.highlight ? 'color: var(--bw-muted)' : 'color: var(--bw-accent)',
    }
  }
  if (session.state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  if (session.state === 'deferred') return { name: 'i-ph-clock', style: 'color: var(--bw-ink-soft)' }
  if (session.state === 'stale') return { name: 'i-ph-clock-counter-clockwise', style: 'color: var(--bw-stale)' }
  if (session.state === 'done') return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
  if (session.state === 'active') return { name: 'i-ph-circle-half-fill', style: 'color: var(--bw-ink)' }
  return { name: 'i-ph-circle', style: 'color: var(--bw-muted)' }
}

/**
 * DIE ZWEITE ZEILE EINES KAPITELS — ÜBERALL DERSELBE ZÄHLER (Testlauf-Befund 7,
 * 2026-09-09).
 *
 * Vorher TAUSCHTE diese Zeile die Auskunft: eingeklappt der Zähler („7 von 11
 * bestätigt"), aufgeklappt der Registry-Umfang („11 Sessions, ~14 Min"). Genau
 * im OFFENEN Kapitel — dort, wo jemand gerade arbeitet — stand damit die
 * einzige Zahl der Leiste, die sich nie bewegt: nach vier Bestätigungen sagte
 * der Kopf unverändert „11 Sessions, ~14 Min", während die eingeklappten
 * Kapitel daneben ihren Stand meldeten.
 *
 * Jetzt steht der ZÄHLER immer, und das offene Kapitel hängt seine RESTzeit
 * hinten an (`step.effort`, gerechnet von `chapterRemainingMinutes`). Beides
 * bewegt sich mit der Arbeit, und beide Fassungen der Zeile lesen dieselbe
 * Rechnung.
 */
function stepSubline(step: BwRailStep): string {
  return [step.counter, step.effort].filter(part => (part ?? '').length > 0).join(' · ')
}

function selectSession(step: BwRailStep, session: BwRailSession): void {
  if (session.disabled) return
  emit('selectSession', { stepId: step.id, sessionId: session.id })
}

/**
 * DIE ID DER BEGRÜNDUNGS-ZEILE (Befund M) — sie verbindet Knopf und Satz für
 * `aria-describedby`.
 *
 * `useId()` je Leiste, damit zwei gleichzeitig gerenderte Leisten (Spalte +
 * Overlay unter 768 px) keine doppelte Id ins Dokument legen; Slot-Ids tragen
 * Punkte, die in einer HTML-Id erlaubt sind und hier nie in einen
 * CSS-Selektor wandern.
 */
const noteScope = useId()
function sessionNoteId(session: BwRailSession): string {
  return `bw-note-${noteScope}-${session.id}`
}

function selectStep(layer: BwRailLayer, step: BwRailStep): void {
  if (stepDisabled(layer, step)) return
  // Ein Punkt mit eigenem Ziel (Ergebnis-Ansicht) führt DORTHIN — `select`
  // meint „öffne diesen Baustein" und liefe für ihn ins Leere.
  if (step.to) { void navigateTo(step.to); return }
  emit('select', step.id)
}
</script>

<template>
  <nav :aria-label="t('brand.workspace.rail.progressNav')">
    <!-- 1. Brand-Switcher oben. Das Menü spannt die VOLLE Trigger-Breite auf
         (Reka-Variable), wie beim Team-Switcher des Vorbilds. -->
    <UDropdownMenu
      :items="brandMenu" :content="{ align: 'start' }"
      :ui="{ content: 'bw-root bw-overlay w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <button
        class="bw-nav-switch flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
        :aria-label="t('brand.workspace.sidebar.switchBrand')"
      >
        <span
          class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold"
          style="background: var(--bw-ink); color: var(--bw-paper)"
        >{{ monogram(current?.title ?? '') }}</span>
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ current?.title ?? t('brand.brands.card.untitled') }}</span>
        <UIcon name="i-ph-caret-up-down" class="size-4 flex-none" style="color: var(--bw-muted)" />
      </button>

      <!-- Inline-Farben statt scoped Klassen: der Slot-Inhalt landet im
           teleportierten Menü, wo scoped CSS nicht verlässlich greift. -->
      <template #item="{ item }">
        <template v-if="item.mono">
          <span class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold" style="background: var(--bw-ink); color: var(--bw-paper)">{{ item.mono }}</span>
          <span class="min-w-0 flex-1 text-left leading-tight">
            <span class="block truncate font-medium">{{ item.label }}</span>
            <span class="bw-label flex items-center gap-1.5" style="color: var(--bw-muted)">
              {{ item.sub }}<UIcon v-if="item.flag" :name="item.flag" class="size-3.5 flex-none" />
            </span>
          </span>
          <UIcon v-if="item.active" name="i-ph-check" class="size-4 flex-none" style="color: var(--bw-accent)" />
        </template>
        <template v-else>
          <UIcon v-if="item.icon" :name="item.icon" class="size-4 flex-none" style="color: var(--bw-muted)" />
          <span class="min-w-0 flex-1 truncate text-left">{{ item.label }}</span>
        </template>
      </template>
    </UDropdownMenu>

    <!-- 3. Bereiche als einklappbare Gruppen.
         DER INFO-KNOPF IST EIN GESCHWISTER, KEIN KIND (Audit B6/B7/A14). Er
         stand IM Zeilen-Knopf: verschachtelt-interaktiv (ungültiges Markup),
         `role="button" tabindex=0` statt eines echten Knopfs (Leertaste
         blubberte zum Collapsible), und — der eigentliche Schaden — auf einer
         DEAKTIVIERTEN Zeile unterdrückt der Browser jeden Klick im Knopf.
         „Was bedeutet das?" war damit genau dort tot, wo man es braucht: an
         einem Baustein, den man noch nicht betreten kann.
         Der Platz bleibt derselbe (ein Abstandhalter im Fluss, der echte
         Knopf absolut darüber) — die Zeile sieht Pixel für Pixel aus wie
         vorher, inklusive Hover-Fläche über die volle Breite. -->
    <div class="mt-4 space-y-1">
      <div v-for="layer in layers" :key="layer.id" class="bw-nav-item">
        <UCollapsible :default-open="!layer.locked" :unmount-on-hide="false" class="group/section">
          <button
            type="button"
            class="bw-nav-row group/row flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium"
            :style="layer.locked ? 'color: var(--bw-muted)' : ''"
          >
            <UIcon v-if="layer.locked" name="i-ph-lock-simple" class="size-4 flex-none" style="color: var(--bw-muted)" />
            <!-- DIE ZWEITE ZEILE DER SCHICHT (Brand Design D1): gesperrt ihr
                 Erklär-Halbsatz, offen ihr eigener Stand („2 von 6 Kapiteln").
                 Sie steht hier, weil eine Schicht ihren Fortschritt DORT zeigen
                 muss, wo sie steht — die Zahl unten rechts gehört der Brand
                 Foundation und darf nicht zwei Produkte vermischen. Ohne `note`
                 und ohne `lockedNote` (Brand Foundation) sieht die Zeile aus
                 wie vorher. -->
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate">{{ layer.label }}</span>
              <span
                v-if="layer.locked ? layer.lockedNote : layer.note"
                class="bw-label block truncate font-normal tabular-nums" style="color: var(--bw-muted)"
              >{{ layer.locked ? layer.lockedNote : layer.note }}</span>
            </span>
            <span v-if="layer.info" class="size-6 flex-none" aria-hidden="true" />
            <UIcon
              name="i-ph-caret-down" class="size-4 flex-none transition-transform group-data-[state=closed]/section:-rotate-90"
              style="color: var(--bw-muted)"
            />
          </button>

          <template #content>
            <!-- Kinder an einer 1px-Führungslinie, Nuxt-UI-Einzug (ms-5 / ps-1.5). -->
            <ul class="ml-5 mt-0.5 space-y-0.5 border-l pl-1.5" style="border-color: var(--bw-line)">
              <li v-for="step in layer.steps ?? []" :key="step.id">
                <!-- Die Hülle trägt `bw-nav-item` (Position + Hover-Regel des
                     Info-Knopfs) und umschliesst NUR die Kapitel-Zeile: läge
                     die Unterpunkt-Liste darin, zentrierte sich der absolut
                     gesetzte Info-Knopf auf die ganze Gruppe. -->
                <div class="bw-nav-item">
                  <button
                    type="button"
                    class="bw-nav-row group/row flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm"
                    :class="!layer.locked && step.state === 'active' ? 'font-medium' : ''"
                    :style="!layer.locked && step.state === 'active'
                      ? 'background: var(--bw-surface-hi); color: var(--bw-ink); box-shadow: var(--bw-shadow-card)'
                      : stepDisabled(layer, step) ? 'color: var(--bw-muted)' : 'color: var(--bw-ink-soft)'"
                    :disabled="stepDisabled(layer, step)"
                    @click="selectStep(layer, step)"
                  >
                    <UIcon :name="glyph(layer, step).name" class="size-4 flex-none" :style="glyph(layer, step).style" />
                    <span class="min-w-0 flex-1 leading-tight">
                      <span class="block truncate">{{ step.label }}</span>
                      <span
                        v-if="stepSubline(step)"
                        class="bw-label block truncate tabular-nums" style="color: var(--bw-muted)"
                      >{{ stepSubline(step) }}</span>
                    </span>
                    <span v-if="step.info && !layer.locked" class="size-6 flex-none" aria-hidden="true" />
                    <UIcon
                      v-if="step.kind === 'result' && !stepDisabled(layer, step)"
                      name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-ink-soft)"
                    />
                  </button>
                  <button
                    v-if="step.info && !layer.locked"
                    type="button"
                    class="bw-info-btn bw-nav-info absolute top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full"
                    :class="step.kind === 'result' && !stepDisabled(layer, step) ? 'right-8' : 'right-2.5'"
                    :aria-label="t('brand.workspace.rail.whatMeans', { label: step.label })"
                    @click="infoStep = { step, layerLabel: layer.label }"
                  >
                    <UIcon name="i-ph-info" class="size-4" />
                  </button>
                </div>

                <!-- DIE SESSIONS (§11). Die Seite reicht sie NUR für das offene
                     Kapitel herein — „nur das aktive Kapitel aufgeklappt" ist
                     damit eine Tatsache der Daten, keine zweite Regel hier.
                     Gesperrte Zeilen sind `disabled`: ein Klick, der garantiert
                     ein 409 kassiert, ist kein Angebot (3a-Befund 3). -->
                <ul
                  v-if="step.sessions?.length && !layer.locked"
                  class="ml-5 mt-0.5 space-y-0.5 border-l pl-1.5" style="border-color: var(--bw-line)"
                >
                  <li v-for="session in step.sessions" :key="session.id">
                    <!-- DER GRUPPEN-TRENNER (2026-09-09): ab hier hat George
                         abgeleitet, gefragt wurde darüber. Er steht nur, wo
                         das Kapitel beides hat UND sauber zerfällt — die
                         Regel dazu ist `brandDerivedDividerSlot`, nicht diese
                         Zeile. Nur Beschriftung, kein Knopf: er ist eine
                         Überschrift und nichts zum Anklicken. -->
                    <p
                      v-if="session.groupLabel"
                      class="bw-label mt-2 px-2.5 pb-0.5 pt-1 uppercase tracking-wider"
                      style="color: var(--bw-muted)"
                    >{{ session.groupLabel }}</p>
                    <button
                      type="button"
                      class="bw-nav-row flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-sm"
                      :class="session.state === 'active' || session.highlight ? 'font-medium' : ''"
                      :style="session.state === 'active' || session.highlight
                        ? 'background: var(--bw-surface-hi); color: var(--bw-ink)'
                        : session.disabled ? 'color: var(--bw-muted)' : 'color: var(--bw-ink-soft)'"
                      :disabled="session.disabled"
                      :title="session.title || undefined"
                      :aria-current="session.state === 'active' ? 'true' : undefined"
                      :aria-describedby="session.note ? sessionNoteId(session) : undefined"
                      @click="selectSession(step, session)"
                    >
                      <UIcon :name="sessionGlyph(session).name" class="size-3.5 flex-none" :style="sessionGlyph(session).style" />
                      <span class="min-w-0 flex-1 truncate">{{ session.label }}</span>
                      <!-- Offener Befund (§8): ein kleiner bernsteinfarbener
                           Punkt, nie nur Farbe — der Titel sagt, was er meint.
                           Er steht NEBEN der Glyphe, weil er eine zweite
                           Auskunft ist und nicht der Zustand der Session. -->
                      <UIcon
                        v-if="session.finding" name="i-ph-warning-circle-fill"
                        class="size-3 flex-none" style="color: var(--bw-stale)"
                        :aria-label="t('brand.finding.openMarker')"
                        :title="t('brand.finding.openMarker')"
                      />
                      <span
                        v-if="session.effort" class="bw-label flex-none tabular-nums"
                        style="color: var(--bw-muted)"
                      >{{ session.effort }}</span>
                    </button>
                    <!-- DER GRUND EINER SPERRE, SICHTBAR (Befund M): kein
                         Hover-`title`, sondern eine Zeile darunter — und über
                         `aria-describedby` am Knopf, damit sie auch vorgelesen
                         wird. -->
                    <p
                      v-if="session.note"
                      :id="sessionNoteId(session)"
                      class="bw-label px-2.5 pb-1 pl-7 leading-snug"
                      style="color: var(--bw-muted)"
                    >{{ session.note }}</p>
                  </li>
                </ul>
              </li>
            </ul>
          </template>
        </UCollapsible>
        <!-- Steht AUSSERHALB des Collapsibles: dessen Standard-Slot IST der
             Auslöser (`as-child`), ein Geschwister darin wäre wieder Teil des
             Knopfs. Die 2rem sind die Flucht des Abstandhalters oben (Pfeil
             1rem + Lücke 0,375rem + Rand 0,625rem). -->
        <button
          v-if="layer.info"
          type="button"
          class="bw-info-btn bw-nav-info absolute right-8 top-1.5 grid size-6 place-items-center rounded-full"
          :aria-label="t('brand.workspace.rail.whatsIn', { label: layer.label })"
          @click="openLayerInfo(layer)"
        >
          <UIcon name="i-ph-info" class="size-4" />
        </button>
      </div>
    </div>

    <!-- Sync-Zustand: ohne Topbar zeigt ihn die Sidebar (nur Abweichungen). -->
    <Transition name="bw-sync">
      <p v-if="syncState" class="bw-label mt-4 flex items-center gap-1.5 px-2" style="color: var(--bw-muted)">
        <UIcon :name="SYNC[syncState].icon" :class="SYNC[syncState].spin ? 'animate-spin' : ''" class="size-4" />
        {{ syncLabel ?? t(SYNC[syncState].key) }}
      </p>
    </Transition>

    <BwStepInfoModal
      v-model:open="infoOpen"
      :step="infoStep?.step ?? null"
      :layer-label="infoStep?.layerLabel ?? ''"
    />
    <BwNewBrandModal
      v-model:open="newBrandOpen" mode="live"
      :content-locales="newBrandLocales" :loading="newBrandCreating" :failed="newBrandFailed"
      @submit="startNewBrand"
    />
  </nav>
</template>
