<script setup lang="ts">
import type { BwMessage } from '../../../../../app/components/BwGeorge.vue'
import { demoRail } from '../../../utils/demoRail'

/** Clickdummy Iteration 2 — Ergebnis-Ansicht: die fertige Brand
 *  Foundation als EIN Stück (Grain-Hero + Kit-Vorschau). Statisch. */
const doneRail = demoRail.map(layer => layer.steps && !layer.locked
  ? { ...layer, steps: layer.steps.map(step => ({ ...step, state: 'done' as const, slots: undefined, minutes: undefined })) }
  : layer)

const messages = ref<BwMessage[]>([
  { id: 'm1', role: 'george', text: 'Das ist sie — eure Brand Foundation, aus euren eigenen Antworten. Lies sie einmal laut: Wenn ein Satz nicht nach euch klingt, ändern wir ihn.', help: 'Jedes Kapitel bleibt bearbeitbar — das Buch rechnet dann nach.' },
  { id: 'm2', role: 'george', text: 'Wenn alles sitzt, bauen wir darauf euer Brand Design: Farben und Schrift kommen nicht aus dem Katalog, sondern aus dem, was hier steht.' },
])

/* Score-Modell v2 (Runde 100): 8 Kategorien, stufen-bewusst — was
 * noch nicht gebaut ist, zeigt ein Schloss statt einer 0. */
const scoreDims = [
  { label: 'Eigenständigkeit', value: 84 },
  { label: 'Visuelle Identität', locked: 'ab Brand Design' },
  { label: 'Konsistenz', value: 92 },
  { label: 'Markenerlebnis', locked: 'ab Brand Experience' },
  { label: 'Positionierung & Klarheit', value: 90 },
  { label: 'Emotionale Wirkung', value: 88 },
  { label: 'Anpassungsfähigkeit', locked: 'ab Kit' },
  { label: 'Handwerk', value: 86 },
] as { label: string, value?: number, locked?: string }[]
function scoreTone(v: number): string {
  return v >= 90 ? 'var(--bw-accent)' : v >= 50 ? 'var(--bw-draft)' : 'var(--bw-stale)'
}

const palette = [
  { hex: '#4a3123', name: 'Roast' },
  { hex: '#b98a5e', name: 'Crema' },
  { hex: '#e8d3b8', name: 'Milk' },
  { hex: '#2f4a3a', name: 'Palm' },
  { hex: '#f7f2ea', name: 'Paper' },
]
</script>

<template>
  <BwWorkspace :progress-pct="100" progress-note="21 von 21 Entscheidungen" progress-subnote="Brand Foundation abgeschlossen" progress-to="/brand/demo/ergebnis" :score="88" content-locale="en">
    <template #brand>
      <BwBrandSwitcher :current="{ title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us' }" :others="[{ title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' }]" />
    </template>

    <template #rail>
      <BwProgressRail :layers="doneRail" />
    </template>

    <template #default>
      <!-- Iteration 3 (Konzept BRAND-FOUNDATION-LESEANSICHT.md): die Leseansicht
           löst diese Ergebnis-Seite als Kunden-Dokument ab. Diese Seite bleibt
           als Protokoll der Iteration 2 stehen und zeigt nur den Weg dorthin. -->
      <NuxtLink to="/brand/demo/foundation" class="bw-label mb-4 inline-flex items-center gap-1.5 underline" style="color: var(--bw-ink-soft)">Neue Fassung: Brand Foundation lesen <UIcon name="i-ph-arrow-right" class="size-3.5" /></NuxtLink>
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Foundation · Ergebnis</p>
      <h1 class="mt-1 text-4xl leading-tight">Eure Brand Foundation ist fertig</h1>

      <!-- Grain-Hero: die Marke als ein Stück -->
      <div class="bw-grain-hero mt-6 p-10" style="--hero-a: #e8d3b8; --hero-b: #b98a5e; --hero-c: #4a3123">
        <p class="bw-label uppercase tracking-widest" style="color: rgb(247 242 234 / 0.7)">Kailua Coffee Co.</p>
        <p class="mt-4 max-w-xl text-3xl font-extralight leading-snug tracking-tight">
          One honest, quiet moment a day.
        </p>
        <p class="mt-6 max-w-xl text-sm leading-relaxed" style="color: rgb(247 242 234 / 0.85)">
          Kaffee mit nachvollziehbarer Herkunft — Anbau, Röstung, Ausschank aus einer Hand.
          Klartext, Handwerk, Nähe.
        </p>
        <p class="bw-label mt-8" style="color: rgb(247 242 234 / 0.6)">Sage · warm, aber nie anbiedernd · EN</p>
      </div>

      <!-- Kit-Vorschau -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div class="bw-card p-8">
          <p class="bw-label" style="color: var(--bw-muted)">Farbwelt (Vorschlag)</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <div v-for="c in palette" :key="c.hex" class="flex flex-col items-center gap-1.5">
              <div class="bw-swatch rounded-full" :style="`background: ${c.hex}; width: 2.5rem; height: 2.5rem`" />
              <p class="bw-label" style="color: var(--bw-muted)">{{ c.name }}</p>
            </div>
          </div>
          <p class="bw-pending mt-3">Wird im Brand Design entschieden — hergeleitet aus eurer Foundation.</p>
        </div>
        <div class="bw-card p-8">
          <p class="bw-label" style="color: var(--bw-muted)">Typografie (Vorschlag)</p>
          <p class="mt-2 text-5xl font-extralight leading-none tracking-tight">Aa</p>
          <p class="mt-2 text-sm" style="color: var(--bw-ink-soft)">Ruhig und fundiert — eine Serifenlose mit Wärme, dazu eine Mono für die Herkunftsangaben.</p>
          <p class="bw-pending mt-3">Wird im Brand Design entschieden.</p>
        </div>
      </div>

      <!-- Runde 94 (David): der Brand Score — fundiert gerechnet wie
           Lighthouse, gerahmt als Reifegrad: jeder Punkt unter 100
           verkauft seinen nächsten Schritt. -->
      <div class="bw-card mt-4 p-8">
        <div class="flex items-baseline justify-between gap-3">
          <p class="bw-label" style="color: var(--bw-muted)">Brand Score</p>
          <p class="bw-label" style="color: var(--bw-muted)">Stand: Foundation + Language</p>
        </div>
        <div class="mt-6 flex flex-wrap items-center gap-x-10 gap-y-6">
          <div class="flex flex-none flex-col items-center gap-1">
            <BwScoreRing :value="88" :size="96" label="Gesamt" class="flex-none" />
            <p class="bw-label" style="color: var(--bw-draft)">Herausragend</p>
          </div>
          <div class="min-w-0 flex-1 space-y-3.5" style="min-width: 18rem">
            <div v-for="d in scoreDims" :key="d.label" class="grid grid-cols-[12rem_1fr_2.5rem] items-center gap-3">
              <p class="bw-label truncate" style="color: var(--bw-muted)">{{ d.label }}</p>
              <template v-if="d.value !== undefined">
                <div class="h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
                  <div class="h-full rounded-full" :style="`width: ${d.value}%; background: ${scoreTone(d.value)}`" />
                </div>
                <p class="bw-label text-right" :style="`color: ${scoreTone(d.value)}`">{{ d.value }}</p>
              </template>
              <template v-else>
                <p class="bw-pending">{{ d.locked }}</p>
                <UIcon name="i-ph-lock-simple" class="size-3.5 justify-self-end" style="color: var(--bw-muted)" />
              </template>
            </div>
          </div>
        </div>
        <p class="bw-pending mt-5">Reine Qualität, kein Fortschritt — 40 Prüfkriterien, jede mit Georges Begründung. Verschlossene Kategorien öffnen sich mit ihren Schichten.</p>
      </div>

      <!-- Runde 93 (David): Monitoring auf dem Ergebnis andeuten —
           die Marke ist fertig, beobachtet wird sie ab dem Launch. -->
      <div class="bw-card mt-4 p-8">
        <div class="flex items-end justify-between gap-4">
          <div class="min-w-0">
            <p class="bw-label" style="color: var(--bw-muted)">Brand Monitoring · läuft nach dem Launch dauerhaft mit</p>
            <p class="mt-2 text-sm" style="color: var(--bw-ink-soft)">George behält eure Marke im Blick: Wird sie draußen so beschrieben, wie ihr sie gebaut habt — auch von ChatGPT &amp; Co.?</p>
            <p class="bw-pending mt-3">Schaltet sich mit dem Launch frei.</p>
          </div>
          <div class="flex flex-none flex-col items-end gap-1.5">
            <BwSparkline :values="[3, 4, 4, 5, 4, 6, 5, 7, 6, 7, 8, 8]" style="color: var(--bw-line-strong)" />
            <p class="bw-label" style="color: var(--bw-muted)">Außenbild · KI-Antworten · Konsistenz</p>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-end gap-2">
        <UButton label="Foundation als PDF" icon="i-ph-file-pdf" color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)" />
        <UButton label="Weiter zu Brand Design" trailing-icon="i-ph-arrow-right" class="rounded-full" />
      </div>
    </template>

    <template #george>
      <BwGeorge :messages="messages" @send="() => {}" />
    </template>
  </BwWorkspace>
</template>
