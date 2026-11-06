<script setup lang="ts">
import {
  DS_BRAND,
  DS_DRAFT_DISCLAIMER,
  DS_DRAFT_QUOTA,
  DS_ICON_OPTIONS,
  DS_ICON_SAMPLE,
  DS_ILLUSTRATION_OPTIONS,
  DS_IMAGERY_DODONT,
  DS_IMAGERY_PRINCIPLES,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „BILDSPRACHE" (Konzept docs/archiv/BRAND-DESIGN.md §2.6, Prototyp-
 * Screen 5) — drei Bild-Prinzipien, Illustration, Icons, Do & Don't.
 *
 * KEINE FOTOS, UND ZWAR AUS EINEM GRUND (§1.4): ein Stock-Bild würde die
 * Entscheidung verkaufen, die hier gerade getroffen wird — man wählt dann das
 * Bild und nicht das Prinzip. Die Karten zeigen deshalb ABSTRAHIERTE
 * Kompositionen aus der Farbwelt: Licht (weicher Verlauf), Kontrast (harte
 * Kante), Nähe (Detail füllt die Fläche).
 *
 * DIE ICONS SIND ECHT: Phosphor in `regular`, `fill` und `bold` — dieselbe
 * Familie, drei Strichstärken, nebeneinander. Ein Bild von Icons hätte genau
 * die Frage nicht beantwortet, um die es geht (passt die Strichstärke zur
 * Textschrift?).
 */
const principleId = ref(DS_IMAGERY_PRINCIPLES[2]!.id)
const illustrationId = ref('line')
const iconId = ref('regular')
const aiExamplesOpen = ref(false)

const principle = computed(() => DS_IMAGERY_PRINCIPLES.find(entry => entry.id === principleId.value) ?? DS_IMAGERY_PRINCIPLES[0]!)
const iconOption = computed(() => DS_ICON_OPTIONS.find(entry => entry.id === iconId.value) ?? DS_ICON_OPTIONS[0]!)

const palette = DS_BRAND.palette
</script>

<template>
  <FdDesignWorkspace chapter="imagery">
    <!-- ── k.photo ──────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Bild-Prinzipien</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">k.photo · drei Vorschläge</span>
      </div>
      <p class="bw-doc-text mt-2">
        Vier Achsen entscheiden alles Weitere: Licht, Ausschnitt, Menschen, Farbigkeit. Daraus wird der Satz, den ihr eurer Fotografin schickt.
      </p>

      <div class="mt-4 grid gap-3 lg:grid-cols-3">
        <button
          v-for="entry in DS_IMAGERY_PRINCIPLES" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="principleId === entry.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="principleId === entry.id"
          @click="principleId = entry.id"
        >
          <!-- Die abstrahierte Komposition: Farbwelt und Form, kein Motiv. -->
          <svg viewBox="0 0 160 100" class="bw-frame w-full" role="img" :aria-label="`Stil-Skizze: ${entry.label}`">
            <template v-if="entry.scene === 'daylight'">
              <defs>
                <linearGradient :id="`grad-${entry.id}`" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" :stop-color="palette.paper" />
                  <stop offset="60%" :stop-color="palette.milk" />
                  <stop offset="100%" :stop-color="palette.crema" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="160" height="100" :fill="`url(#grad-${entry.id})`" />
              <rect x="18" y="52" width="52" height="34" rx="6" :fill="palette.roast" opacity="0.85" />
              <circle cx="118" cy="34" r="16" :fill="palette.paper" opacity="0.75" />
            </template>
            <template v-else-if="entry.scene === 'contrast'">
              <rect x="0" y="0" width="160" height="100" :fill="palette.roast" />
              <path d="M0 100 L70 0 L160 0 L160 100 Z" :fill="palette.crema" opacity="0.25" />
              <rect x="96" y="30" width="40" height="40" rx="4" :fill="palette.crema" />
            </template>
            <template v-else>
              <rect x="0" y="0" width="160" height="100" :fill="palette.milk" />
              <ellipse cx="72" cy="52" rx="46" ry="34" :fill="palette.roast" />
              <ellipse cx="72" cy="52" rx="14" ry="30" :fill="palette.crema" opacity="0.8" />
              <rect x="0" y="82" width="160" height="18" :fill="palette.palm" opacity="0.85" />
            </template>
          </svg>

          <span class="mt-2.5 flex items-start justify-between gap-2">
            <span class="text-sm font-medium">{{ entry.label }}</span>
            <UIcon v-if="principleId === entry.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.reason }}</span>
          <span class="bw-label mt-2 block leading-relaxed" style="color: var(--bw-muted)">
            Licht: {{ entry.light }}<br>
            Ausschnitt: {{ entry.crop }}<br>
            Menschen: {{ entry.people }}<br>
            Farbigkeit: {{ entry.colorNote }}
          </span>
        </button>
      </div>

      <!-- OPTIONALE KI-BEISPIELE (§2.6) — derselbe Rahmen wie die Logo-
           Entwürfe: gekennzeichnet, mit Herkunft, mit Drossel. -->
      <div class="mt-4">
        <UButton
          size="sm" color="neutral" variant="ghost" class="rounded-full"
          :icon="aiExamplesOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
          :label="aiExamplesOpen ? 'KI-Beispielbilder ausblenden' : 'KI-Beispielbilder zeigen'"
          @click="aiExamplesOpen = !aiExamplesOpen"
        />
        <div v-if="aiExamplesOpen" class="mt-3">
          <p class="bw-label" style="color: var(--bw-muted)">
            Zwei Beispiele zu „{{ principle.label }}" · {{ DS_DRAFT_QUOTA }}
          </p>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <div v-for="n in 2" :key="n" class="bw-frame p-3" style="background: var(--bw-surface)">
              <svg viewBox="0 0 160 90" class="bw-frame w-full" role="img" aria-label="KI-Beispielbild (Attrappe)">
                <rect x="0" y="0" width="160" height="90" :fill="n === 1 ? palette.milk : palette.paper" />
                <circle :cx="n === 1 ? 60 : 100" cy="46" r="30" :fill="palette.roast" opacity="0.85" />
                <rect x="0" y="70" width="160" height="20" :fill="palette.crema" opacity="0.7" />
              </svg>
              <p class="bw-label mt-2" style="color: var(--bw-draft)">{{ DS_DRAFT_DISCLAIMER }}</p>
              <p class="bw-label mt-1" style="color: var(--bw-muted)">Bildmodell (Attrappe) · 7. Sept. 2026 · Prompt c40b71</p>
            </div>
          </div>
          <p class="bw-pending mt-2">
            Klickdummy: Attrappen. Im Produkt laufen sie über denselben Bild-Transport wie die Logo-Entwürfe — und reisen ebenso wenig in Snapshot oder Share.
          </p>
        </div>
      </div>
    </section>

    <!-- ── k.illustration ────────────────────────────────────────────────
         Zwei Sessions, zwei Abschnitte (Davids Korrektur 2026-09-08: Icons
         UNTER der Illustration, nicht daneben) — jede bekommt den vollen
         Abstand der Bühne, die Optionen laufen als Raster in der Breite. -->
    <section>
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Illustration</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">k.illustration</span>
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="option in DS_ILLUSTRATION_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="illustrationId === option.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="illustrationId === option.id"
            @click="illustrationId = option.id"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">
                {{ option.label }}
                <span v-if="option.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
              </span>
              <UIcon v-if="illustrationId === option.id" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ── k.icons ──────────────────────────────────────────────────────── -->
    <section>
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Icons</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">k.icons · Phosphor</span>
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            v-for="option in DS_ICON_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="iconId === option.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="iconId === option.id"
            @click="iconId = option.id"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">
                {{ option.label }}
                <span v-if="option.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
              </span>
              <UIcon v-if="iconId === option.id" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-2 flex items-center gap-3">
              <UIcon
                v-for="icon in DS_ICON_SAMPLE" :key="icon"
                :name="`${icon}${option.suffix}`" class="size-6" style="color: var(--bw-ink)"
              />
            </span>
            <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
          </button>
        </div>
        <p class="bw-label mt-2" style="color: var(--bw-muted)">
          Gewählt: {{ iconOption.label }} — dieselbe Strichstärke wie die Textschrift, sonst streiten Icon und Satz.
        </p>
      </div>
    </section>

    <!-- ── k.dodont ─────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Do &amp; Don’t</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">k.dodont · Form wie in der Foundation</span>
      </div>
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="pair in DS_IMAGERY_DODONT" :key="pair.doText"
          class="bw-frame grid gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-2"
          style="background: var(--bw-surface)"
        >
          <p class="flex items-start gap-2 text-sm leading-relaxed">
            <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
            <span class="min-w-0">{{ pair.doText }}</span>
          </p>
          <p class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-muted)">
            <UIcon name="i-ph-x-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
            <span class="min-w-0 line-through">{{ pair.dontText }}</span>
          </p>
        </div>
      </div>
    </section>
  </FdDesignWorkspace>
</template>
