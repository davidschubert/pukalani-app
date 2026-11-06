<script setup lang="ts">
import type { DsMarkBrief } from '../../../../utils/demoDesign'
import {
  DS_BRAND,
  DS_DRAFT_DISCLAIMER,
  DS_DRAFT_QUOTA,
  DS_DRAFT_TRADEMARK_NOTE,
  DS_MARK_BRIEF,
  DS_MARK_DRAFTS,
  DS_MARK_KINDS,
  DS_MARK_VARIANTS,
  dsFontPair,
  dsSceneColors,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „ZEICHEN" (Konzept docs/archiv/BRAND-DESIGN.md §2.5, Davids
 * Entscheidung §1.11 b, Prototyp-Screen 4) — DREI STUFEN in dieser
 * Reihenfolge, untereinander auf einer Bühne:
 *
 *   1. Richtung + Briefing      → was für ein Zeichen, und wofür
 *   2. Gesetzte Beispiele       → Wortmarke und Monogramm aus Schriftpaar
 *                                 und Farbwelt, als SVG, mit Varianten
 *   3. KI-Entwürfe (Attrappen)  → Ideen für die Designer-Arbeit
 *
 * DIE REIHENFOLGE IST DAS PRODUKT. Wer bei den Bildern anfängt, bekommt ein
 * Logo ohne Begründung — genau das, was der Markt (§1.7) schon verkauft.
 *
 * DIE SETZUNGEN SIND GERECHNET, NICHT GEZEICHNET: `<text>` in der
 * Überschriften-Schrift des gewählten Paars, Farben aus der Ramp, Schutzraum
 * als gezeichneter Rahmen. Muster ist `themes/shared/brandMark.ts` (Kreis +
 * Initial in der Primärfarbe) — nur eben mit der Marken-Typografie.
 *
 * DIE ENTWÜRFE SIND ATTRAPPEN (s. `demoDesign.ts`): vier abstrakte
 * Kompositionen aus der Farbwelt. Was der Prototyp beurteilen soll, ist nicht
 * ihre Qualität, sondern der RAHMEN — Vermerk, Herkunft, Behalten/Verwerfen,
 * Markenrechts-Hinweis, Drossel und die Zusage, dass nichts davon in Snapshot
 * oder Share reist.
 */
const kindId = ref<string>('word')
const briefEditing = ref(false)
const brief = ref({ ...DS_MARK_BRIEF })
const variantId = ref('primary')
const pickedExample = ref<'word' | 'monogram'>('word')
const drafts = ref(DS_MARK_DRAFTS.map(draft => ({ ...draft })))

/* Die Felder des Briefings als LISTE statt als Objekt-Schleife: `v-for` über
 * ein Objekt reicht den Schlüssel als `string` weiter, und ein `string`-Index
 * auf `DsMarkBrief` ist im strict-Modus ein Fehler. */
const BRIEF_FIELDS: { key: keyof DsMarkBrief, label: string }[] = [
  { key: 'character', label: 'Charakter' },
  { key: 'formLanguage', label: 'Formsprache' },
  { key: 'clearSpace', label: 'Schutzraum & Mindestgrößen' },
  { key: 'variants', label: 'Varianten' },
  { key: 'noGos', label: 'No-Gos' },
  { key: 'places', label: 'Einsatzorte' },
]

const pair = dsFontPair('editorial')
const colors = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)

/** Grund und Tinte je Variante — dieselbe Farbwelt, vier Anwendungen. */
const variantColors = computed(() => {
  const ink = colors.rampLight[900]
  switch (variantId.value) {
    case 'inverted': return { bg: ink, ink: DS_BRAND.palette.paper, frame: DS_BRAND.palette.crema }
    case 'mono': return { bg: '#ffffff', ink: '#1b1b1a', frame: '#8a8a88' }
    case 'icon': return { bg: colors.rampLight[700], ink: DS_BRAND.palette.paper, frame: DS_BRAND.palette.milk }
    default: return { bg: DS_BRAND.palette.paper, ink, frame: colors.rampLight[400] }
  }
})

const showClearSpace = ref(true)

const keptCount = computed(() => drafts.value.filter(draft => draft.kept).length)
function toggleKeep(id: string): void {
  const draft = drafts.value.find(entry => entry.id === id)
  if (draft) draft.kept = !draft.kept
}
/* Verwerfen nimmt den Entwurf aus der Liste — ein verworfener Entwurf, der
 * stehen bleibt, ist keine Entscheidung, sondern eine Ablage. */
function discard(id: string): void {
  drafts.value = drafts.value.filter(entry => entry.id !== id)
}
</script>

<template>
  <FdDesignWorkspace chapter="mark">
    <!-- ── STUFE 1a: j.kind ─────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Stufe 1 · Richtung</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">j.kind</span>
      </div>
      <p class="bw-doc-text mt-2">
        Was für ein Zeichen soll es werden — und warum. Die Begründung kommt aus DNA „Formsprache" und aus eurem Namen.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-for="kind in DS_MARK_KINDS" :key="kind.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="kindId === kind.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="kindId === kind.id"
          @click="kindId = kind.id"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium">
              {{ kind.label }}
              <span v-if="kind.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
            </span>
            <UIcon v-if="kindId === kind.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ kind.reason }}</span>
        </button>
      </div>
    </section>

    <!-- ── STUFE 1b: j.brief ────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Stufe 1 · Briefing</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">j.brief · Entwurf von Frida</span>
      </div>
      <p class="bw-doc-text mt-2">
        Das ist der Text, den ein Designer bekommt — und der Prüfstein für jeden Entwurf weiter unten. Er ist bearbeitbar: ein Briefing, das ihr nicht selbst sagen könnt, trägt nicht.
      </p>

      <div class="mt-3" :class="briefEditing ? '' : 'bw-draft-frame'">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="bw-label" style="color: var(--bw-muted)">Basis: Visual DNA, Werte, Positionierung, Name</p>
          <span class="bw-state bw-state--draft"><UIcon name="i-ph-pen-nib" /> Entwurf</span>
        </div>
        <dl class="mt-3 flex flex-col gap-3">
          <div v-for="field in BRIEF_FIELDS" :key="field.key">
            <dt class="bw-label" style="color: var(--bw-muted)">{{ field.label }}</dt>
            <UTextarea v-if="briefEditing" v-model="brief[field.key]" :rows="2" class="mt-1 w-full" />
            <dd v-else class="bw-doc-text mt-1">{{ brief[field.key] }}</dd>
          </div>
        </dl>
      </div>
      <div class="mt-2 flex flex-wrap items-center justify-end gap-2">
        <UButton
          size="sm" color="neutral" variant="ghost" class="rounded-full"
          icon="i-ph-pencil-simple" :label="briefEditing ? 'Bearbeiten beenden' : 'Bearbeiten'"
          @click="briefEditing = !briefEditing"
        />
        <button class="bw-confirm bw-confirm--open" @click="briefEditing = false">
          <UIcon name="i-ph-check" class="size-4" /> Übernehmen &amp; bestätigen
        </button>
      </div>
    </section>

    <!-- ── STUFE 2: j.examples ──────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Stufe 2 · Gesetzte Beispiele</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">j.examples · SVG, gerechnet</span>
      </div>
      <p class="bw-doc-text mt-2">
        Wortmarke und Monogramm aus eurem Schriftpaar ({{ pair.headingFamily }}) und eurer Farbwelt. Kein KI-Aufruf: das hier ist Satz, keine Erfindung.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          v-for="variant in DS_MARK_VARIANTS" :key="variant.id"
          type="button" class="bw-chip" :class="variantId === variant.id ? 'bw-chip--selected' : ''"
          :aria-pressed="variantId === variant.id" @click="variantId = variant.id"
        >{{ variant.label }}</button>
        <UButton
          size="xs" color="neutral" variant="ghost" class="ms-auto rounded-full"
          icon="i-ph-frame-corners"
          :label="showClearSpace ? 'Schutzraum ausblenden' : 'Schutzraum einblenden'"
          @click="showClearSpace = !showClearSpace"
        />
      </div>
      <p class="bw-label mt-1" style="color: var(--bw-muted)">
        {{ DS_MARK_VARIANTS.find(variant => variant.id === variantId)?.note }}
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <!-- Wortmarke -->
        <button
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="pickedExample === 'word' ? 'bw-choice-card--selected' : ''"
          :aria-pressed="pickedExample === 'word'"
          @click="pickedExample = 'word'"
        >
          <svg viewBox="0 0 400 120" class="bw-frame w-full" role="img" aria-label="Wortmarke Kailua Coffee Co.">
            <rect x="0" y="0" width="400" height="120" :fill="variantColors.bg" />
            <rect
              v-if="showClearSpace" x="28" y="28" width="344" height="64"
              fill="none" :stroke="variantColors.frame" stroke-width="1" stroke-dasharray="4 4"
            />
            <text
              x="200" y="60" text-anchor="middle" dominant-baseline="middle"
              :fill="variantColors.ink"
              :style="`font-family: ${pair.headingStack}; font-size: 34px; letter-spacing: -0.5px`"
            >Kailua Coffee Co.</text>
          </svg>
          <span class="mt-2 flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Wortmarke</span>
            <UIcon v-if="pickedExample === 'word'" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="bw-label mt-1 block" style="color: var(--bw-muted)">Schutzraum = Höhe des Versal-K · Mindestbreite 96 px</span>
        </button>

        <!-- Monogramm -->
        <button
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="pickedExample === 'monogram' ? 'bw-choice-card--selected' : ''"
          :aria-pressed="pickedExample === 'monogram'"
          @click="pickedExample = 'monogram'"
        >
          <svg viewBox="0 0 160 120" class="bw-frame w-full" role="img" aria-label="Monogramm K">
            <rect x="0" y="0" width="160" height="120" :fill="variantColors.bg" />
            <rect x="46" y="26" width="68" height="68" rx="20" :fill="variantColors.ink" />
            <text
              x="80" y="61" text-anchor="middle" dominant-baseline="middle"
              :fill="variantColors.bg"
              :style="`font-family: ${pair.headingStack}; font-size: 36px`"
            >K</text>
            <rect
              v-if="showClearSpace" x="32" y="12" width="96" height="96"
              fill="none" :stroke="variantColors.frame" stroke-width="1" stroke-dasharray="4 4"
            />
          </svg>
          <span class="mt-2 flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Monogramm</span>
            <UIcon v-if="pickedExample === 'monogram'" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="bw-label mt-1 block" style="color: var(--bw-muted)">Avatar, App-Icon, Favicon · nie unter 24 px</span>
        </button>
      </div>
    </section>

    <!-- ── STUFE 3: j.drafts ────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Stufe 3 · KI-Entwürfe</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">j.drafts · {{ keptCount }} behalten</span>
      </div>
      <p class="bw-doc-text mt-2">
        Erzeugt aus Briefing, Visual DNA und Farbwelt. Das sind IDEEN für die Designer-Arbeit — kein fertiges Logo, keine Prüfung, kein Anspruch auf Schutzfähigkeit.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle" label="Vier Entwürfe erzeugen"
          color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)" disabled
        />
        <span class="bw-label" style="color: var(--bw-muted)">{{ DS_DRAFT_QUOTA }}</span>
        <span class="bw-pending">Klickdummy: die vier unten sind Attrappen — es läuft kein Bildmodell.</span>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="draft in drafts" :key="draft.id"
          class="bw-frame p-3"
          :style="draft.kept ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface)'"
        >
          <!-- Die Komposition. Sie ist von Hand gezeichnet und benutzt
               ausschliesslich Farben der Marke — ein Entwurf, der eine sechste
               Farbe einführt, wäre im Prototyp eine Falschaussage. -->
          <svg viewBox="0 0 100 100" class="bw-frame w-full" role="img" :aria-label="`Entwurf: ${draft.title}`">
            <rect x="0" y="0" width="100" height="100" :fill="DS_BRAND.palette.paper" />
            <template v-if="draft.shape === 'arc'">
              <path d="M22 66 A28 28 0 0 1 78 66" fill="none" :stroke="DS_BRAND.palette.roast" stroke-width="7" stroke-linecap="round" />
              <line x1="22" y1="76" x2="78" y2="76" :stroke="DS_BRAND.palette.crema" stroke-width="5" stroke-linecap="round" />
            </template>
            <template v-else-if="draft.shape === 'ring'">
              <circle cx="50" cy="50" r="26" fill="none" :stroke="DS_BRAND.palette.roast" stroke-width="7" stroke-dasharray="120 45" transform="rotate(-40 50 50)" />
              <circle cx="50" cy="50" r="7" :fill="DS_BRAND.palette.palm" />
            </template>
            <template v-else-if="draft.shape === 'seed'">
              <ellipse cx="50" cy="50" rx="20" ry="30" :fill="DS_BRAND.palette.roast" />
              <ellipse cx="50" cy="50" rx="7" ry="22" :fill="DS_BRAND.palette.milk" />
            </template>
            <template v-else>
              <rect x="22" y="22" width="24" height="24" :fill="DS_BRAND.palette.roast" />
              <rect x="54" y="22" width="24" height="24" :fill="DS_BRAND.palette.crema" />
              <rect x="22" y="54" width="24" height="24" :fill="DS_BRAND.palette.milk" />
              <rect x="54" y="54" width="24" height="24" :fill="DS_BRAND.palette.palm" />
            </template>
          </svg>

          <p class="mt-2 text-sm font-medium">{{ draft.title }}</p>
          <p class="bw-label mt-1" style="color: var(--bw-draft)">{{ DS_DRAFT_DISCLAIMER }}</p>
          <p class="bw-label mt-1.5" style="color: var(--bw-muted)">
            {{ draft.model }} · {{ draft.created }} · Prompt {{ draft.promptHash }}
          </p>
          <div class="mt-2 flex items-center justify-end gap-1.5">
            <UButton
              size="xs" color="neutral" variant="ghost" class="rounded-full"
              icon="i-ph-trash" label="Verwerfen" @click="discard(draft.id)"
            />
            <button class="bw-confirm bw-confirm--xs" :class="draft.kept ? 'bw-confirm--done' : 'bw-confirm--open'" @click="toggleKeep(draft.id)">
              <UIcon :name="draft.kept ? 'i-ph-check-circle-fill' : 'i-ph-check'" class="size-3.5" />
              {{ draft.kept ? 'Wird behalten' : 'Behalten' }}
            </button>
          </div>
        </div>
      </div>

      <div class="bw-frame mt-4 flex items-start gap-3 px-5 py-4" style="background: var(--bw-surface)">
        <UIcon name="i-ph-scales" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
        <div class="min-w-0">
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ DS_DRAFT_TRADEMARK_NOTE }}</p>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">
            Behaltene Entwürfe bleiben privat: sie stehen in diesem Kapitel und im Briefing — nie im Foundation-Snapshot und nie im geteilten Link.
          </p>
        </div>
      </div>
    </section>
  </FdDesignWorkspace>
</template>
