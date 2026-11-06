<script setup lang="ts">
import {
  type Shade,
  DS_ACCENT_CANDIDATES,
  DS_BASE_CANDIDATES,
  DS_BRAND,
  DS_COLOR_ROLES,
  DS_CONTRAST_PAIRS,
  DS_HEX_RE,
  DS_NEUTRAL_OPTIONS,
  DS_SHADES,
  dsContrast,
  dsNeutralRamp,
  dsRatioText,
  dsSceneColors,
  dsSceneFonts,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „FARBWELT" (Konzept docs/archiv/BRAND-DESIGN.md §2.3, Prototyp-
 * Screen 2) — Basisfarbe, Ramp hell/dunkel, Grundton, Akzent, Rollen,
 * Kontrast-Matrix.
 *
 * HIER WIRD NICHTS BEHAUPTET: Rampe, getönter Grundton und jedes
 * Kontrast-Urteil kommen aus `themes/shared/ramp.ts` (§2.3). Ein Kandidat,
 * der AA reisst, wird deshalb nicht „ausgegraut, weil es hübscher aussieht" —
 * er wird ausgegraut, weil die Zahl daneben es sagt.
 *
 * CREMA STEHT ABSICHTLICH IN DER LISTE, obwohl sie durchfällt: das Moodboard
 * schlägt sie als FLÄCHE vor (Board „eine Stufe mutiger"), und als Basisfarbe
 * trägt sie den Text. Genau an dieser Stelle merkt man den Unterschied — eine
 * Liste ohne den Durchfaller würde ihn verstecken.
 */

const baseId = ref(DS_BASE_CANDIDATES[0]!.id)
const customHex = ref('')
const neutralId = ref(DS_NEUTRAL_OPTIONS[0]!.id)
const accentId = ref(DS_ACCENT_CANDIDATES[0]!.id)

/**
 * Jeder Kandidat mit seinem Urteil ALS TEXTFARBE auf dem Papierton — das Gate
 * (§2.3: „ein Vorschlag, der AA reisst, wird nicht angeboten"). Einmal
 * gerechnet statt im Template dreimal je Karte.
 */
const baseCandidates = computed(() => DS_BASE_CANDIDATES.map((candidate) => {
  const verdict = dsContrast(candidate.hex, DS_BRAND.palette.paper)
  return {
    candidate,
    verdict,
    blocked: verdict === null || verdict.level === 'fail' || verdict.level === 'AA18',
  }
}))

const customValid = computed(() => DS_HEX_RE.test(customHex.value.trim()))
const base = computed(() => {
  if (customValid.value) return customHex.value.trim()
  return DS_BASE_CANDIDATES.find(candidate => candidate.id === baseId.value)?.hex ?? DS_BRAND.palette.roast
})
/* FARB-PICKER UND HEX-FELD SIND EIN WERT (Davids Korrektur 2026-09-08: „beides
 * muss gegeben sein"). Der Picker zeigt die wirksame Basisfarbe (eigener Wert,
 * sonst der gewählte Kandidat); jede Bewegung im Picker schreibt ins Hex-Feld,
 * jedes gültige Hex im Feld stellt den Picker. Kein zweiter Zustand. */
const pickerHex = computed<string>({
  get: () => (customValid.value ? customHex.value.trim() : base.value).toLowerCase(),
  set: (value) => { customHex.value = (value ?? '').toLowerCase() },
})
const pickerOpen = ref(false)
/** Icon-Farbe auf dem Picker-Knopf: hell auf dunkler Basis, sonst Tinte. */
function inkOn(hex: string): string {
  const ratio = dsContrast('#ffffff', hex)?.ratio ?? 0
  return ratio >= 3 ? '#ffffff' : 'var(--bw-ink)'
}
const accent = computed(() => DS_ACCENT_CANDIDATES.find(candidate => candidate.id === accentId.value)?.hex ?? DS_BRAND.palette.palm)
const neutralSource = computed(() => DS_NEUTRAL_OPTIONS.find(option => option.id === neutralId.value)?.source ?? base.value)

/* Die eine Rechnung der Seite — Szene, Streifen, Rollen und Matrix lesen
 * dasselbe Ergebnis. Zwei Rechenwege wären zwei Wahrheiten. */
const colors = computed(() => dsSceneColors(base.value, accent.value, neutralSource.value))

/**
 * Die zwei Welten nebeneinander (h.ramp): dieselben Paare wie in der Szene
 * (`FdDesignScene`: hell = Rampe 900 auf Papier, dunkel = Neutral 50 auf
 * Neutral 950) — hier nur benannt und mit dem WCAG-Urteil versehen.
 */
const schemeSides = computed(() => {
  const c = colors.value
  const pairs = [
    { scheme: 'light' as const, label: 'Hell', ink: c.rampLight[900], ground: c.paper },
    { scheme: 'dark' as const, label: 'Dunkel', ink: c.neutral[50], ground: c.neutral[950] },
  ]
  return pairs.map(pair => ({ ...pair, contrast: dsContrast(pair.ink, pair.ground) }))
})
const fonts = dsSceneFonts('editorial')

function neutralPreview(source: string): string[] {
  const ramp = dsNeutralRamp(source)
  return ramp ? DS_SHADES.map(shade => ramp[shade]) : []
}

/** Die Rollen-Farben, wie die Szene sie benutzt. */
const roleColors = computed<Record<string, string>>(() => ({
  ground: colors.value.rampLight[900],
  surface: colors.value.rampLight[100],
  light: colors.value.neutral[50],
  accent: accent.value,
  quiet: DS_BRAND.palette.paper,
}))

function pairColor(token: Shade | 'accent' | 'paper' | 'ground', scheme: 'light' | 'dark', role: 'fg' | 'bg'): string {
  if (token === 'accent') return accent.value
  if (token === 'paper') return DS_BRAND.palette.paper
  if (token === 'ground') return colors.value.neutral[950]
  return role === 'fg'
    ? (scheme === 'dark' ? colors.value.rampDark[token] : colors.value.rampLight[token])
    : colors.value.neutral[token]
}

const matrix = computed(() => DS_CONTRAST_PAIRS.map((pair) => {
  const fg = pairColor(pair.fgShade, pair.scheme, 'fg')
  const bg = pairColor(pair.bgShade, pair.scheme, 'bg')
  return { pair, fg, bg, verdict: dsContrast(fg, bg) }
}))

const levelStyle: Record<string, string> = {
  AAA: 'color: var(--bw-accent); background: var(--bw-accent-soft)',
  AA: 'color: var(--bw-accent); background: var(--bw-accent-soft)',
  AA18: 'color: var(--bw-draft); background: var(--bw-draft-soft)',
  fail: 'color: var(--bw-stale); background: var(--bw-stale-soft)',
}
</script>

<template>
  <FdDesignWorkspace chapter="color">
    <!-- ── h.base ───────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Basisfarbe</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.base · drei Kandidaten</span>
      </div>
      <p class="bw-doc-text mt-2">
        Das ist die einzige Farbe, die ihr wirklich wählt — alles andere rechne ich daraus. Geprüft wird sie als TEXTFARBE auf eurem Papierton.
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          v-for="entry in baseCandidates" :key="entry.candidate.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="baseId === entry.candidate.id && !customValid ? 'bw-choice-card--selected' : ''"
          :aria-pressed="baseId === entry.candidate.id && !customValid"
          :disabled="entry.blocked"
          @click="baseId = entry.candidate.id; customHex = ''"
        >
          <span class="flex items-center gap-2.5">
            <span class="bw-swatch size-8 rounded-full" :style="`background: ${entry.candidate.hex}`" />
            <span class="min-w-0 leading-tight">
              <span class="block text-sm font-medium">{{ entry.candidate.name }}</span>
              <span class="bw-label block" style="color: var(--bw-muted)">{{ entry.candidate.hex }}</span>
            </span>
          </span>
          <span class="mt-2.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.candidate.reason }}</span>
          <span v-if="entry.verdict" class="bw-state mt-2.5" :style="levelStyle[entry.verdict.level]">
            {{ dsRatioText(entry.verdict.ratio) }} auf Paper · {{ entry.verdict.level === 'fail' ? 'unter AA' : entry.verdict.level }}
          </span>
          <span v-if="entry.blocked" class="bw-label mt-2 block" style="color: var(--bw-stale)">
            Als Textfarbe nicht wählbar — unter 4,5:1. Als Fläche bleibt sie erlaubt.
          </span>
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <!-- Picker (Nuxt UI) + Hex-Feld: derselbe Wert, zwei Griffe. `bw-root` am
             Popover-Inhalt ist Pflicht — er teleportiert an den Body. -->
        <UPopover v-model:open="pickerOpen" :content="{ align: 'start' }" :ui="{ content: 'bw-root bw-overlay p-3' }">
          <button
            type="button" class="bw-swatch flex size-9 items-center justify-center rounded-full"
            :style="`background: ${pickerHex}`" aria-label="Basisfarbe im Farb-Picker wählen"
          >
            <UIcon name="i-ph-eyedropper" class="size-4" :style="`color: ${inkOn(pickerHex)}`" />
          </button>
          <template #content>
            <UColorPicker v-model="pickerHex" format="hex" :throttle="80" />
            <p class="bw-label mt-2 font-mono" style="color: var(--bw-muted)">{{ pickerHex }}</p>
          </template>
        </UPopover>
        <UInput
          v-model="customHex" size="sm" placeholder="#4a3123" aria-label="Eigene Basisfarbe als Hex"
          class="w-40" :ui="{ base: 'font-mono' }"
        />
        <span class="bw-label" style="color: var(--bw-muted)">
          {{ customValid ? `Eigener Wert übernommen: ${customHex.trim()}` : 'Picker öffnen oder eigenen Hex-Wert eingeben (sechs Zeichen).' }}
        </span>
      </div>
    </section>

    <!-- ── h.ramp ───────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Hell- und Dunkel-Rampe</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.ramp · gerechnet, nicht gewählt</span>
      </div>
      <p class="bw-doc-text mt-2">
        Elf Stufen je Welt, wahrgenommen gleichmäßig (OKLCH). Die dunkle Rampe ist dieselbe Mathematik mit anderen Enden — auf dunklem Grund braucht die Marke oben mehr Luft.
      </p>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div v-for="mode in (['rampLight', 'rampDark'] as const)" :key="mode">
          <p class="bw-label" style="color: var(--bw-muted)">{{ mode === 'rampLight' ? 'Hell' : 'Dunkel' }}</p>
          <div class="mt-2 flex overflow-hidden rounded-xl">
            <span
              v-for="shade in DS_SHADES" :key="shade"
              class="h-10 flex-1" :style="`background: ${colors[mode][shade]}`"
              :title="`${shade} · ${colors[mode][shade]}`"
            />
          </div>
          <div class="mt-1 flex">
            <span v-for="shade in DS_SHADES" :key="shade" class="bw-label flex-1 text-center" style="color: var(--bw-muted); font-size: 10px">{{ shade }}</span>
          </div>
        </div>
      </div>

      <!-- HELL UND DUNKEL NEBENEINANDER (Davids Entscheidung 2026-09-08):
           dieselbe Szene zweimal, fest gestellt — ein Umschalter zeigt immer
           nur eine Hälfte der Entscheidung. Unter jeder Szene das Kontrast-
           Urteil ihres Text-auf-Grund-Paars, gerechnet aus den Rampen. -->
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div v-for="side in schemeSides" :key="side.scheme" class="min-w-0">
          <p class="bw-label" style="color: var(--bw-muted)">{{ side.label }}</p>
          <div class="mt-2">
            <FdDesignScene compact :colors="colors" :fonts="fonts" :scheme="side.scheme" />
          </div>
          <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style="color: var(--bw-ink-soft)">
            <span class="bw-swatch size-4 flex-none rounded-full" :style="`background: ${side.ink}; box-shadow: inset 0 0 0 1px var(--bw-line-strong)`" />
            <span>Text {{ side.ink }} auf Grund {{ side.ground }}</span>
            <span v-if="side.contrast" class="bw-state" :class="side.contrast.level === 'fail' ? 'bw-state--stale' : 'bw-state--confirmed'">
              {{ dsRatioText(side.contrast.ratio) }} · {{ side.contrast.level === 'fail' ? 'fällt durch' : side.contrast.level }}
            </span>
          </p>
        </div>
      </div>
      <p class="bw-pending mt-3">Beide Welten sind dieselbe Basisfarbe — nur die Enden der Rampe sind andere. Wer die dunkle Welt nicht will, hat trotzdem eine: Betriebssysteme schalten sie ein.</p>
    </section>

    <!-- ── h.neutral + h.accent ─────────────────────────────────────────── -->
    <section class="grid gap-6 lg:grid-cols-2">
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Grundton</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.neutral</span>
        </div>
        <p class="bw-doc-text mt-2">Flächen und Linien tragen einen Hauch Farbe — oder bewusst einen anderen Ton.</p>
        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="option in DS_NEUTRAL_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="neutralId === option.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="neutralId === option.id"
            @click="neutralId = option.id"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">{{ option.label }}</span>
              <UIcon v-if="neutralId === option.id" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
            <span class="mt-2 flex overflow-hidden rounded-full">
              <span v-for="hex in neutralPreview(option.source)" :key="hex" class="h-2.5 flex-1" :style="`background: ${hex}`" />
            </span>
          </button>
        </div>
      </div>

      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Akzent</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.accent</span>
        </div>
        <p class="bw-doc-text mt-2">Ein Signal, kein Zweitgrund: ein Pop je Fläche.</p>
        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="candidate in DS_ACCENT_CANDIDATES" :key="candidate.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="accentId === candidate.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="accentId === candidate.id"
            @click="accentId = candidate.id"
          >
            <span class="flex items-center gap-2.5">
              <span class="bw-swatch size-6 rounded-full" :style="`background: ${candidate.hex}`" />
              <span class="text-sm font-medium">{{ candidate.name }}</span>
              <UIcon v-if="accentId === candidate.id" name="i-ph-check-circle-fill" class="ms-auto size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ candidate.reason }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ── h.roles ──────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Rollen</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.roles · wofür welche Farbe steht</span>
      </div>
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="role in DS_COLOR_ROLES" :key="role.id"
          class="bw-frame grid items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[2rem_10rem_10rem_minmax(0,1fr)]"
          style="background: var(--bw-surface)"
        >
          <span class="bw-swatch size-7 rounded-full" :style="`background: ${roleColors[role.id]}`" />
          <p class="text-sm font-medium">{{ role.label }}</p>
          <p class="bw-label" style="color: var(--bw-muted)">{{ role.source }}</p>
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ role.note }}</p>
        </div>
      </div>
    </section>

    <!-- ── h.contrast ───────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Kontrast-Prüfung</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">h.contrast · WCAG 2.1</span>
      </div>
      <p class="bw-doc-text mt-2">
        Sechs Paare, hell und dunkel. Sie sind Teil des Vorschlags und nicht ein Prüfschritt danach — was hier durchfällt, wird gar nicht erst angeboten.
      </p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                v-for="col in ['Paar', 'Welt', 'Probe', 'Verhältnis', 'Urteil']" :key="col"
                class="bw-label border-b px-0 pb-2 pr-4 font-normal uppercase tracking-wider"
                style="color: var(--bw-muted); border-color: var(--bw-line)"
              >{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix" :key="row.pair.id">
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">{{ row.pair.label }}</td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ row.pair.scheme === 'light' ? 'Hell' : 'Dunkel' }}</td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">
                <span
                  class="inline-block rounded-lg px-2.5 py-1 text-xs"
                  :style="`background: ${row.bg}; color: ${row.fg}`"
                >Kona · Juli 2026</span>
              </td>
              <td class="border-b py-2.5 pr-4 align-middle tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ row.verdict ? dsRatioText(row.verdict.ratio) : '—' }}
              </td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">
                <span v-if="row.verdict" class="bw-state" :style="levelStyle[row.verdict.level]">
                  {{ row.verdict.level === 'fail' ? 'unter AA' : row.verdict.level === 'AA18' ? 'nur große Schrift' : row.verdict.level }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="bw-pending mt-3">
        Die Zahlen sind live gerechnet: eine andere Basisfarbe oben ändert diese Tabelle sofort.
      </p>
    </section>
  </FdDesignWorkspace>
</template>
