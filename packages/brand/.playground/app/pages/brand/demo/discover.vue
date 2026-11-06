<script setup lang="ts">
import { BRAND_GRADIENTS } from '../../../../../shared/brandPalette'
import { BRAND_ARCHETYPES } from '../../../../../shared/brandChoiceOptions'
import { BRAND_INDUSTRIES } from '../../../../../shared/brandIndustries'

/**
 * KLICKDUMMY „DISCOVER BRANDS" — die öffentliche Galerie
 * (docs/plans/DISCOVER-BRANDS.md §4.1, angeglichen an Davids Entscheidungen
 * vom 2026-09-08). Statisch: die Facetten schalten nur ihren eigenen Zustand,
 * gefiltert wird hier nichts — die echte Seite tut das über
 * `GET /api/discover` mit Query-Parametern.
 *
 * WAS SICH GEGENÜBER RUNDE 97/176 GEÄNDERT HAT — und warum:
 *  · Facetten NUR über Daten, die es gibt: Weiche · Archetyp · Farbwelt ·
 *    Branche. „Stil" und „Positionierung" sind RAUS — Stil entsteht erst mit
 *    Brand Design (Produkt 02), `b.positioningCategory` ist offen formuliert
 *    und taugt vor einer Normalisierung nicht als Filter (§7).
 *  · Sortierung: Neueste (Vorgabe) · Brand Score · Fundament-Reife.
 *    „Am besten bewertet" und „Trending" brauchen Nutzer-Bewertungen bzw. die
 *    Aufruf-Metrik — beides Runde 2 (§7).
 *  · ZWEI ZAHLEN, ZWEI NAMEN (§9.3): „Brand Score" ist der WEBSITE-Check,
 *    „Fundament-Reife" der DOKUMENT-Check. Eine Kachel zeigt genau eine davon
 *    und schreibt dazu, welche — eine unbeschriftete Zahl behauptet sonst,
 *    zwei verschiedene Messungen seien dieselbe.
 *  · „Featured Creators" ist RAUS: es gibt keine öffentlichen Personen-Profile
 *    (AH-7-Kehrtwende, §3.5).
 *  · Die Meta-Zeile nennt keine „Stimmen" mehr (keine Bewertung in Runde 1).
 */

const KATALOG_LINK = { discover: '/brand/demo/discover', anatomie: '/brand/demo/anatomie' }

/* ── Facette 1: die Weiche ───────────────────────────────────────────────── */
const weichen = ['Alle', 'Neue Marke', 'Relaunch']
const activeWeiche = ref('Alle')

/* ── Facette 2: Archetyp (die zwölf aus dem echten Katalog) ──────────────── */
const archetypes = BRAND_ARCHETYPES.map(option => option.display.de)
const activeArchetype = ref<string | null>(null)

/* ── Facette 3: Farbwelt ────────────────────────────────────────────────────
 * Die Farben kommen aus `BRAND_GRADIENTS` (dieselbe Tabelle, die auch die
 * Brand-Karten färbt) — die NAMEN stehen dort nur im Kommentar und werden hier
 * für den Dummy danebengelegt. Wird die Facette echt gebaut, gehören sie in
 * den Katalog, nicht in eine zweite Liste. */
const paletteNames = [
  'Brot-Braun', 'Blaugrau', 'Tannengrün', 'Terrakotta', 'Oliv', 'Petrol',
  'Pflaume', 'Rosenholz', 'Schiefer', 'Messing', 'Taubenblau', 'Moos',
]
const palettes = BRAND_GRADIENTS.map((gradient, index) => ({
  index,
  name: paletteNames[index] ?? `Farbwelt ${index + 1}`,
  gradient,
}))
const activePalette = ref<number | null>(null)

/* ── Facette 4: Branche (der 16er-Katalog des Brand-Checks) ──────────────── */
const industryLabels: Record<string, string> = {
  agency: 'Agentur',
  software: 'Software',
  ecommerce: 'Online-Handel',
  consulting: 'Beratung',
  craft: 'Handwerk',
  food: 'Lebensmittel und Getränke',
  hospitality: 'Gastgewerbe und Reisen',
  health: 'Gesundheit',
  finance: 'Finanzen und Versicherung',
  education: 'Bildung',
  creative: 'Kreativ und Design',
  realestate: 'Immobilien',
  manufacturing: 'Industrie und Fertigung',
  nonprofit: 'Gemeinnützig',
  personal: 'Personen und persönliche Marken',
  other: 'Sonstiges',
}
const ALLE_BRANCHEN = 'Alle Branchen'
const industryItems = [ALLE_BRANCHEN, ...BRAND_INDUSTRIES.map(id => industryLabels[id] ?? id)]
const activeIndustry = ref(ALLE_BRANCHEN)

/* ── Sortierung ─────────────────────────────────────────────────────────── */
const sorts = ['Neueste', 'Brand Score', 'Fundament-Reife']
const activeSort = ref('Neueste')

/* ── Die Kacheln ────────────────────────────────────────────────────────────
 * `metric` sagt, WELCHE Zahl der Ring zeigt: `score` = Website-Check,
 * `maturity` = Fundament-Reife. Drei Einträge tragen bewusst die Reife —
 * eine Marke ohne eigene Website hat keinen Brand Score, und die Galerie darf
 * sie trotzdem zeigen. */
interface DiscoverTile {
  name: string
  industry: string
  weiche: 'Neue Marke' | 'Relaunch'
  archetype: string
  metric: 'score' | 'maturity'
  value: number
  palette: number
  example?: boolean
}

const brands: DiscoverTile[] = [
  { name: 'Kailua Coffee Co.', industry: 'Lebensmittel und Getränke', weiche: 'Neue Marke', archetype: 'Der Weise', metric: 'score', value: 87, palette: 0, example: true },
  { name: 'Nordlicht Physio', industry: 'Gesundheit', weiche: 'Neue Marke', archetype: 'Der Fürsorgliche', metric: 'score', value: 91, palette: 5 },
  { name: 'Bergwerk Studio', industry: 'Kreativ und Design', weiche: 'Relaunch', archetype: 'Der Schöpfer', metric: 'maturity', value: 92, palette: 8 },
  { name: 'Mila & Ben', industry: 'Online-Handel', weiche: 'Neue Marke', archetype: 'Der Unschuldige', metric: 'maturity', value: 78, palette: 7 },
  { name: 'Faltwerk Architektur', industry: 'Immobilien', weiche: 'Relaunch', archetype: 'Der Herrscher', metric: 'score', value: 89, palette: 4 },
  { name: 'Trailtage', industry: 'Gastgewerbe und Reisen', weiche: 'Neue Marke', archetype: 'Der Entdecker', metric: 'score', value: 82, palette: 11 },
  { name: 'Studio Anker', industry: 'Agentur', weiche: 'Relaunch', archetype: 'Der Schöpfer', metric: 'score', value: 86, palette: 10 },
  { name: 'Backhaus Lore', industry: 'Lebensmittel und Getränke', weiche: 'Neue Marke', archetype: 'Der Jedermann', metric: 'maturity', value: 85, palette: 9 },
]

function tileGradient(tile: { palette: number }): string {
  const [a, b, c] = BRAND_GRADIENTS[tile.palette] ?? BRAND_GRADIENTS[0]!
  return `linear-gradient(165deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}

function metricLabel(tile: DiscoverTile): string {
  return tile.metric === 'score' ? 'Brand Score' : 'Fundament-Reife'
}

/** Brand of the Day als UCarousel (Fade) — Betreiber-Kuration, §4.1. */
const days = [
  { name: 'Nordlicht Physio', quote: '„Wir behandeln Menschen, keine Befunde."', line: 'Nordlicht Physio — der Fürsorgliche mit klarer Kante, aus Kiel. Vom Team ausgewählt.', value: 91, sub: 'Brand Score · Gesundheit · der Fürsorgliche', palette: 5 },
  { name: 'Kailua Coffee Co.', quote: '„One honest, quiet moment a day."', line: 'Kailua Coffee Co. — der Weise unter den Röstereien, von Oʻahu. Unser Beispiel-Branding.', value: 87, sub: 'Brand Score · Lebensmittel · der Weise', palette: 0 },
  { name: 'Bergwerk Studio', quote: '„Wir bauen Ruhe."', line: 'Bergwerk Studio — der Schöpfer nach mutigem Relaunch, aus Wien. Vom Team ausgewählt.', value: 92, sub: 'Fundament-Reife · Kreativ und Design · der Schöpfer', palette: 8 },
]
const dayIndex = ref(0)
const day = computed(() => days[dayIndex.value] ?? days[0]!)
const dayCarousel = ref<{ emblaApi?: { scrollPrev: () => void, scrollNext: () => void } } | null>(null)
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="@container mx-auto max-w-7xl">
      <div class="mb-2 text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Discover Brands</p>
        <h1 class="mt-1 text-4xl leading-tight">Marken, gebaut mit eurem persönlichen Markenberater</h1>
      </div>
      <p class="bw-label text-center" style="color: var(--bw-muted)">Jede mit ihrer ganzen Anatomie: Purpose, Werte, Archetyp, Stimme, Farbwelt.</p>

      <!-- Brand of the Day: Split-Aufmacher, Karte mit Stapel dahinter -->
      <div class="mt-16 grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand of the Day</p>
          <h2 class="mt-4 max-w-lg text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">{{ day.quote }}</h2>
          <p class="mt-5 max-w-md text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ day.line }}</p>
          <UButton :to="KATALOG_LINK.anatomie" label="Anatomie ansehen" trailing-icon="i-ph-arrow-right" class="mt-8 rounded-full" />
        </div>
        <div class="min-w-0">
          <!-- Runde 176 (David): Ueberblenden statt Schieben (Embla-Fade). -->
          <UCarousel
            ref="dayCarousel" v-slot="{ item }" :items="days" loop fade
            class="w-full" :ui="{ item: 'basis-full' }"
            @select="dayIndex = $event"
          >
            <NuxtLink :to="KATALOG_LINK.anatomie" class="bw-tile bw-tile--lg bw-on-dark group relative flex flex-col justify-between overflow-hidden p-8" :style="`aspect-ratio: 1 / 1; background: ${tileGradient(item)}`">
              <p class="text-xl font-medium" style="color: #f7f2ea">{{ item.name }}</p>
              <div>
                <p class="text-6xl font-extralight leading-none tracking-tight" style="color: #f7f2ea">{{ item.value }}</p>
                <p class="mt-3 text-sm" style="color: rgb(247 242 234 / 0.85)">{{ item.sub }}</p>
                <p class="bw-label mt-5 inline-flex items-center gap-1.5" style="color: rgb(247 242 234 / 0.8)">Weiterlesen <UIcon name="i-ph-arrow-right" class="size-3.5 transition-transform group-hover:translate-x-0.5" /></p>
              </div>
            </NuxtLink>
          </UCarousel>
        </div>
      </div>
      <!-- Pfeile mittig unter dem GANZEN Aufmacher — sie blaettern auch
           Headline und Copy links mit. -->
      <div class="mt-8 flex justify-center gap-2">
        <button class="grid size-9 place-items-center rounded-full" style="background: var(--bw-surface-hi); color: var(--bw-muted)" aria-label="Vorheriges Branding" @click="dayCarousel?.emblaApi?.scrollPrev()"><UIcon name="i-ph-arrow-left" class="size-4" /></button>
        <button class="grid size-9 place-items-center rounded-full" style="background: var(--bw-surface-hi); color: var(--bw-ink)" aria-label="Nächstes Branding" @click="dayCarousel?.emblaApi?.scrollNext()"><UIcon name="i-ph-arrow-right" class="size-4" /></button>
      </div>

      <!-- FACETTEN — vier Achsen, jede aus einem Katalog, den es wirklich gibt.
           Drei Zeilen statt einer langen Reihe: zwölf Archetypen und zwölf
           Farbwelten sind in EINER Zeile weder überblickbar noch treffbar. -->
      <div class="mt-20 space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="w in weichen" :key="w"
            class="bw-select-card rounded-full px-4 py-2 text-sm"
            :class="activeWeiche === w ? 'bw-select-card--on' : ''"
            @click="activeWeiche = w"
          >{{ w }}</button>
          <span class="ml-auto flex flex-wrap items-center gap-2">
            <USelect v-model="activeIndustry" :items="industryItems" color="neutral" variant="ghost" class="w-56 justify-between rounded-full text-sm focus-visible:outline-none" :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)" aria-label="Branche" />
            <USelect v-model="activeSort" :items="sorts" color="neutral" variant="ghost" class="w-48 justify-between rounded-full text-sm focus-visible:outline-none" :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)" aria-label="Sortierung" />
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-20 flex-none" style="color: var(--bw-muted)">Archetyp</span>
          <button
            v-for="a in archetypes" :key="a"
            class="bw-select-card rounded-full px-4 py-2 text-sm"
            :class="activeArchetype === a ? 'bw-select-card--on' : ''"
            @click="activeArchetype = activeArchetype === a ? null : a"
          >{{ a }}</button>
        </div>

        <!-- Die Farbwelt ist die einzige Facette, die man SIEHT statt liest —
             deshalb Farbpunkte mit Namen daneben, nicht Wörter allein. -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-20 flex-none" style="color: var(--bw-muted)">Farbwelt</span>
          <button
            v-for="p in palettes" :key="p.index"
            class="bw-select-card flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm"
            :class="activePalette === p.index ? 'bw-select-card--on' : ''"
            :aria-pressed="activePalette === p.index"
            @click="activePalette = activePalette === p.index ? null : p.index"
          >
            <span class="bw-swatch size-6 flex-none rounded-full" :style="`background: linear-gradient(140deg, ${p.gradient[0]} 0%, ${p.gradient[1]} 50%, ${p.gradient[2]} 100%)`" />
            {{ p.name }}
          </button>
        </div>
      </div>

      <!-- Galerie-Wand: die Farbwelt ist die Karte -->
      <div class="mt-10 grid gap-x-6 gap-y-20 @sm:grid-cols-2 @md:grid-cols-4">
        <NuxtLink
          v-for="brand in brands" :key="brand.name" :to="KATALOG_LINK.anatomie"
          class="group block"
        >
          <div class="bw-tile relative overflow-hidden" style="aspect-ratio: 1 / 1">
            <div class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]" :style="`background: ${tileGradient(brand)}`" />
            <span v-if="brand.example" class="bw-label absolute left-4 top-4 rounded-full px-2.5 py-1" style="background: rgb(20 20 20 / 0.45); color: #f7f2ea">Beispiel</span>
            <span v-else-if="brand.weiche === 'Relaunch'" class="bw-label absolute left-4 top-4 rounded-full px-2.5 py-1" style="background: rgb(20 20 20 / 0.45); color: #f7f2ea">Relaunch</span>
            <p class="absolute inset-0 grid place-items-center p-6 text-center text-2xl font-extralight leading-snug tracking-tight" style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)">{{ brand.name }}</p>
          </div>
          <div class="mt-3 flex items-start justify-between gap-3">
            <p class="bw-label" style="color: var(--bw-muted)">{{ brand.industry }} · {{ brand.weiche }} · {{ brand.archetype }}</p>
            <!-- Der Ring trägt IMMER seine Beschriftung: „87" allein sagt
                 nicht, ob eine Website geprüft oder ein Dokument gereift ist. -->
            <BwScoreRing :value="brand.value" :size="34" :label="metricLabel(brand)" class="flex-none" />
          </div>
        </NuxtLink>
      </div>

      <!-- LEERER ZUSTAND — hier als zweiter Abschnitt, damit David beide
           Fassungen auf einer Seite sieht. In der echten Galerie steht er
           STATT der Wand. -->
      <div class="mt-24">
        <p class="bw-pending">Dummy: so sieht die Galerie aus, solange noch nichts freigegeben ist.</p>
        <div class="bw-rounded-card mt-3 flex flex-col items-center justify-center border border-dashed p-14 text-center" style="border-color: var(--bw-line-strong)">
          <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
          <p class="mt-4 text-xl font-extralight tracking-tight">Noch keine veröffentlichte Marke — die erste könnte eure sein.</p>
          <UButton class="mt-5 rounded-full" icon="i-ph-plus" label="Starte deine eigene" />
        </div>
      </div>

      <p class="bw-label mt-16 text-center" style="color: var(--bw-muted)">Jedes Branding hier ist freiwillig öffentlich und vom Team freigegeben.</p>
      <p class="mt-3 text-center">
        <NuxtLink to="/brand/demo/discover-admin" class="bw-pending underline underline-offset-4">Betreiber-Skizze: Warteschlange, Veröffentlicht, Meldungen</NuxtLink>
      </p>
      <BwSiteFooter />
    </div>
  </div>
</template>
