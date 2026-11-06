<script setup lang="ts">
import {
  DS_BRAND,
  DS_MOTION_LOGO_OPTIONS,
  DS_MOTION_RULES,
  DS_MOTION_STAGGER,
  DS_MOTION_TOKENS,
  DS_TEMPO_OPTIONS,
  dsSceneColors,
  dsSceneFonts,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „BEWEGUNG" (Konzept docs/archiv/BRAND-DESIGN.md §2.7, Prototyp-
 * Screen 6; UI-Name „Bewegung" statt „Motion" nach §2.19 Frage 3).
 *
 * DIE VORSCHAU IST DIE ENTSCHEIDUNG: Tempo liest man nicht, man sieht es.
 * Die Szene bekommt Dauer, Easing und Versatz als lokale Variablen und spielt
 * sie auf Knopfdruck — nicht bei jedem Rendern, sonst wackelt die Seite.
 *
 * `prefers-reduced-motion` IST KEIN SONDERFALL, SONDERN DIE ZWEITE HÄLFTE DER
 * REGEL: der Schalter unten simuliert die Systemeinstellung, und die Szene
 * zeigt dann den ENDZUSTAND plus die Werte als Text — keine „halb so
 * schnelle" Ersatz-Animation. Wer das Kapitel abnimmt, muss beides gesehen
 * haben.
 */
const tempoId = ref('calm')
const logoId = ref('no')
const simulateReduced = ref(false)
const playKey = ref(0)

const tempo = computed(() => DS_TEMPO_OPTIONS.find(entry => entry.id === tempoId.value) ?? DS_TEMPO_OPTIONS[0]!)
const motion = computed(() => ({
  duration: tempo.value.base,
  easing: tempo.value.easing,
  stagger: DS_MOTION_STAGGER,
}))

const tokens = computed(() => DS_MOTION_TOKENS.map(token => ({
  ...token,
  ms: Math.round(tempo.value.base * token.factor),
})))

const colors = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)
const fonts = dsSceneFonts('editorial')
</script>

<template>
  <FdDesignWorkspace chapter="motion">
    <!-- ── l.tempo ──────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Tempo</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">l.tempo · aus DNA „Bewegungs-Charakter"</span>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <button
          v-for="option in DS_TEMPO_OPTIONS" :key="option.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="tempoId === option.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="tempoId === option.id"
          @click="tempoId = option.id"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">
              {{ option.label }}
              <span v-if="option.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
            </span>
            <span class="bw-label tabular-nums" style="color: var(--bw-muted)">{{ option.base }} ms</span>
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
        </button>
      </div>
    </section>

    <!-- ── l.transitions ────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Übergänge</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">l.transitions · drei Tokens, ein Versatz</span>
      </div>
      <p class="bw-doc-text mt-2">
        Mehr Tokens heißt mehr Streit im Team. Drei reichen — sie hängen alle am Tempo oben und ändern sich mit ihm.
      </p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                v-for="col in ['Token', 'Dauer', 'Easing', 'Wofür']" :key="col"
                class="bw-label border-b px-0 pb-2 pr-4 font-normal uppercase tracking-wider"
                style="color: var(--bw-muted); border-color: var(--bw-line)"
              >{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="token in tokens" :key="token.id">
              <td class="border-b py-2.5 pr-4 font-medium" style="border-color: var(--bw-line)">{{ token.label }}</td>
              <td class="border-b py-2.5 pr-4 tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ token.ms }} ms</td>
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                <span class="bw-label">{{ tempo.easing }}</span>
              </td>
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ token.usage }}</td>
            </tr>
            <tr>
              <td class="border-b py-2.5 pr-4 font-medium" style="border-color: var(--bw-line)">motion.stagger</td>
              <td class="border-b py-2.5 pr-4 tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ DS_MOTION_STAGGER }} ms</td>
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line)">—</td>
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">Versatz zwischen Geschwistern (Listen, Karten).</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Die Szene spielt die Werte ───────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-medium">In der Anwendung</h2>
        <UButton
          size="sm" color="neutral" variant="outline" class="ms-auto rounded-full"
          style="background: var(--bw-surface-hi)"
          icon="i-ph-play" label="Übergang abspielen" :disabled="simulateReduced"
          @click="playKey += 1"
        />
        <UButton
          size="sm" color="neutral" :variant="simulateReduced ? 'solid' : 'ghost'" class="rounded-full"
          :icon="simulateReduced ? 'i-ph-eye-slash' : 'i-ph-eye'"
          :label="simulateReduced ? 'reduced-motion an' : 'reduced-motion simulieren'"
          @click="simulateReduced = !simulateReduced"
        />
      </div>
      <p class="bw-doc-text mt-2">
        Knopf-Hover und Karten-Einblendung laufen mit den Werten von oben. Der Schalter zeigt, was Menschen sehen, die im Betriebssystem weniger Bewegung eingestellt haben.
      </p>
      <div class="mt-3">
        <FdDesignScene
          :colors="colors" :fonts="fonts" :motion="motion"
          :play-key="playKey" :simulate-reduced-motion="simulateReduced"
        />
      </div>
    </section>

    <!-- ── l.logo + l.rules ─────────────────────────────────────────────── -->
    <section class="grid gap-6 lg:grid-cols-2">
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Kinetisches Zeichen</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">l.logo</span>
        </div>
        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="option in DS_MOTION_LOGO_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="logoId === option.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="logoId === option.id"
            @click="logoId = option.id"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">
                {{ option.label }}
                <span v-if="option.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
              </span>
              <UIcon v-if="logoId === option.id" name="i-ph-check-circle-fill" class="size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
          </button>
        </div>
      </div>

      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">Bewegungs-Regeln</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">l.rules</span>
        </div>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="rule in DS_MOTION_RULES" :key="rule"
            class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
          >
            <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
            <span class="min-w-0">{{ rule }}</span>
          </li>
        </ul>
      </div>
    </section>
  </FdDesignWorkspace>
</template>
