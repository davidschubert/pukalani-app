<script setup lang="ts">
import {
  DS_BRAND,
  DS_COLOR_ROLES,
  DS_IMAGERY_DODONT,
  DS_IMAGERY_PRINCIPLES,
  DS_MARK_BRIEF,
  DS_MARK_DRAFTS,
  DS_MONO_STACK,
  DS_MOTION_RULES,
  DS_MOTION_STAGGER,
  DS_MOTION_TOKENS,
  DS_SHADES,
  DS_TEMPO_OPTIONS,
  dsFontPair,
  dsSceneColors,
} from '../utils/demoDesign'

/**
 * KAPITEL 10 DER FOUNDATION, NACH BRAND DESIGN (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Prototyp-Screen 7).
 *
 * Zwei Zustände, ein Renderer:
 *  · `unlocked` — die Marke ist freigeschaltet, aber noch nichts entschieden:
 *    dieselbe ehrliche Liste wie in der Schranke, nur mit dem Einstieg statt
 *    dem Angebot. Die Kapitel-Überschrift trägt KEIN „folgt in Brand Design"
 *    mehr — es folgt nicht irgendwann, es ist offen.
 *  · `done` — das Kapitel ist VOLL: Rampen hell/dunkel mit Rollen,
 *    Typografie-Specimen mit echten Schriften, Zeichen als SVG-Setzung,
 *    Bild-Prinzipien mit Do & Don't, Bewegungs-Regeln.
 *
 * DIE BEHALTENEN KI-ENTWÜRFE STEHEN HIER NUR MIT HINWEIS (§1.11 b): sie sind
 * privat und reisen nicht in Snapshot oder Share. Das ist keine Feinheit der
 * Darstellung, sondern die Leitplanke selbst — deshalb steht sie IM Dokument
 * und nicht nur in der Werkstatt.
 *
 * Warum eine eigene Komponente und kein neuer `FdBlock`-Typ: Kapitel 10 ist
 * nach Brand Design kein Text mehr, sondern eine Vitrine (Farbflächen,
 * Schriftproben, SVG). Sechs neue Block-Arten in `FdChapter` würden den
 * Renderer der NEUN anderen Kapitel für dieses eine umbauen.
 */
const props = withDefaults(defineProps<{
  /** Anzeige-Nummer wie bei `FdChapter` — die Zählung folgt der Reihenfolge. */
  index: number
  state?: 'unlocked' | 'done'
}>(), { state: 'done' })

const num = computed(() => String(props.index).padStart(2, '0'))

const pair = dsFontPair('editorial')
const colors = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)
const tempo = DS_TEMPO_OPTIONS[0]!
const principle = DS_IMAGERY_PRINCIPLES[2]!
/* Im fertigen Kapitel steht der EINE behaltene Entwurf — mehr wäre eine
 * Galerie, und eine Galerie wäre wieder ein Logo-Versprechen. */
const keptDraft = DS_MARK_DRAFTS[0]!

const roleColor: Record<string, string> = {
  ground: colors.rampLight[900],
  surface: colors.rampLight[100],
  light: colors.neutral[50],
  accent: DS_BRAND.palette.palm,
  quiet: DS_BRAND.palette.paper,
}

const LOCKED_LINES = [
  { title: 'Farbwelt', text: 'Basisfarbe mit Hell- und Dunkel-Rampe, Kontrast-geprüft.' },
  { title: 'Typografie', text: 'Schriftpaar für Überschrift und Text, dazu Mono für Herkunft und Preise.' },
  { title: 'Zeichen', text: 'Richtung, Briefing und gesetzte Beispiele für Wortmarke und Monogramm.' },
  { title: 'Bildsprache', text: 'Was auf ein Foto darf und was nie — plus Illustrations- und Icon-Stil.' },
  { title: 'Bewegung', text: 'Tempo, Übergänge und das Verhalten bei reduzierter Bewegung.' },
]
</script>

<template>
  <section id="visuell" class="fd-chapter scroll-mt-6">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Kapitel {{ num }}</p>
      <span v-if="state === 'done'" class="bw-state bw-state--confirmed">
        <UIcon name="i-ph-check" /> abgenommen
      </span>
      <span v-else class="bw-state bw-state--draft">Brand Design ist freigeschaltet</span>
    </div>
    <h2 class="mt-1 text-[26px] font-extralight leading-tight tracking-tight">Visuelle Identität</h2>
    <p class="bw-label mt-1.5" style="color: var(--bw-muted)">
      {{ state === 'done'
        ? `Im Brand Design entschieden — Stand ${DS_BRAND.standDate}.`
        : 'Sechs Kapitel, etwa 35 Minuten. Alles wird aus dem hergeleitet, was oben steht.' }}
    </p>

    <!-- ── FREIGESCHALTET, NOCH NICHT ENTSCHIEDEN ──────────────────────── -->
    <template v-if="state === 'unlocked'">
      <div class="mt-5 flex flex-col gap-2">
        <div
          v-for="line in LOCKED_LINES" :key="line.title"
          class="fd-box flex items-start gap-3 rounded-2xl px-5 py-4" style="background: var(--bw-surface)"
        >
          <UIcon name="i-ph-circle-dashed" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">{{ line.title }}</p>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-muted)">{{ line.text }}</p>
          </div>
        </div>
      </div>
      <div class="fd-noprint mt-5 flex flex-wrap items-center gap-2">
        <UButton
          to="/brand/demo/design/dna" label="Brand Design starten"
          trailing-icon="i-ph-arrow-right" class="rounded-full"
        />
        <p class="bw-pending">Freigeschaltet vom Studio am 7. September 2026.</p>
      </div>
    </template>

    <!-- ── DAS VOLLE KAPITEL ───────────────────────────────────────────── -->
    <template v-else>
      <div class="mt-5 flex flex-col gap-8">
        <!-- DAS ERGEBNIS-BOARD ALS KOPF (§2.8, 2026-09-08): alles auf einer
             Fläche, bevor die Abschnitte darunter es erklären. -->
        <div>
          <FdDesignBoard compact />
          <p class="fd-noprint mt-2 flex flex-wrap items-center gap-2">
            <span class="bw-pending">Dasselbe Board als eigene Ansicht, druckbar:</span>
            <NuxtLink to="/brand/demo/design/board" class="bw-label underline" style="color: var(--bw-ink-soft)">Visuelle Identität öffnen</NuxtLink>
          </p>
        </div>

        <!-- Farbwelt -->
        <div>
          <p class="bw-label" style="color: var(--bw-muted)">Farbwelt · Basisfarbe {{ colors.base }}</p>
          <div class="mt-3 flex flex-col gap-3">
            <div v-for="mode in (['rampLight', 'rampDark'] as const)" :key="mode">
              <p class="bw-label" style="color: var(--bw-muted)">{{ mode === 'rampLight' ? 'Hell' : 'Dunkel' }}</p>
              <div class="mt-1.5 flex overflow-hidden rounded-xl">
                <span
                  v-for="shade in DS_SHADES" :key="shade"
                  class="h-9 flex-1" :style="`background: ${colors[mode][shade]}`" :title="`${shade} · ${colors[mode][shade]}`"
                />
              </div>
            </div>
          </div>
          <div class="mt-4 flex flex-col gap-2">
            <div
              v-for="role in DS_COLOR_ROLES" :key="role.id"
              class="fd-box flex items-center gap-3 rounded-2xl px-5 py-3" style="background: var(--bw-surface)"
            >
              <span class="bw-swatch size-6 flex-none rounded-full" :style="`background: ${roleColor[role.id]}`" />
              <p class="min-w-0 flex-1 text-sm font-medium">{{ role.label }}</p>
              <p class="bw-label flex-none max-sm:hidden" style="color: var(--bw-muted)">{{ role.source }}</p>
            </div>
          </div>
        </div>

        <!-- Typografie -->
        <div>
          <p class="bw-label" style="color: var(--bw-muted)">Typografie · {{ pair.name }} ({{ pair.headingFamily }} · {{ pair.bodyFamily }})</p>
          <div class="fd-box mt-3 rounded-2xl px-5 py-5" style="background: var(--bw-surface)">
            <p class="text-[30px] leading-tight" :style="`font-family: ${pair.headingStack}`">Eine Sorte pro Saison</p>
            <p class="mt-3 text-base leading-relaxed" :style="`font-family: ${pair.bodyStack}`">
              Anbau, Röstung und Ausschank liegen in einer Hand. Was in der Kanne ist, hat einen Ort, einen Monat und einen Namen.
            </p>
            <p class="mt-3 text-sm" :style="`font-family: ${DS_MONO_STACK}`">1 kg 38,00 € · Ernte 07/2026 · 1 200 m</p>
            <p class="bw-label mt-3" style="color: var(--bw-muted)">
              Überschrift 400, Laufweite 0, keine Versalien · Mono trägt Herkunft, Preise und Zahlen.
            </p>
          </div>
        </div>

        <!-- Zeichen -->
        <div>
          <p class="bw-label" style="color: var(--bw-muted)">Zeichen · Wortmarke, gesetzt aus Schriftpaar und Farbwelt</p>
          <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <svg viewBox="0 0 400 120" class="bw-frame w-full" role="img" aria-label="Wortmarke Kailua Coffee Co.">
              <rect x="0" y="0" width="400" height="120" :fill="DS_BRAND.palette.paper" />
              <text
                x="200" y="60" text-anchor="middle" dominant-baseline="middle"
                :fill="colors.rampLight[900]"
                :style="`font-family: ${pair.headingStack}; font-size: 34px; letter-spacing: -0.5px`"
              >Kailua Coffee Co.</text>
            </svg>
            <svg viewBox="0 0 160 120" class="bw-frame w-full" role="img" aria-label="Monogramm K">
              <rect x="0" y="0" width="160" height="120" :fill="DS_BRAND.palette.paper" />
              <rect x="46" y="26" width="68" height="68" rx="20" :fill="colors.rampLight[900]" />
              <text
                x="80" y="61" text-anchor="middle" dominant-baseline="middle"
                :fill="DS_BRAND.palette.paper"
                :style="`font-family: ${pair.headingStack}; font-size: 36px`"
              >K</text>
            </svg>
          </div>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ DS_MARK_BRIEF.clearSpace }}</p>
          <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ DS_MARK_BRIEF.noGos }}</p>

          <!-- Entwürfe: privat, mit Hinweis. -->
          <div class="fd-box mt-4 flex items-start gap-3 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
            <UIcon name="i-ph-eye-slash" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">1 behaltener KI-Entwurf („{{ keptDraft.title }}")</p>
              <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-muted)">
                Entwurf — Idee für die Designer-Arbeit, kein geprüftes Logo. Privat: erscheint nicht im geteilten Link und nicht im Druck.
              </p>
            </div>
          </div>
        </div>

        <!-- Bildsprache -->
        <div>
          <p class="bw-label" style="color: var(--bw-muted)">Bildsprache · {{ principle.label }}</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            <li
              v-for="line in [principle.light, principle.crop, principle.people, principle.colorNote]" :key="line"
              class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
            >
              <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
              <span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
          <div class="mt-3 flex flex-col gap-2">
            <div
              v-for="entry in DS_IMAGERY_DODONT" :key="entry.doText"
              class="fd-box grid gap-x-4 gap-y-2 rounded-2xl px-5 py-4 sm:grid-cols-2"
              style="background: var(--bw-surface)"
            >
              <p class="flex items-start gap-2 text-sm leading-relaxed">
                <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
                <span class="min-w-0">{{ entry.doText }}</span>
              </p>
              <p class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-muted)">
                <UIcon name="i-ph-x-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
                <span class="min-w-0 line-through">{{ entry.dontText }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Bewegung -->
        <div>
          <p class="bw-label" style="color: var(--bw-muted)">Bewegung · {{ tempo.label }} ({{ tempo.base }} ms)</p>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full min-w-[26rem] border-collapse text-left text-sm">
              <tbody>
                <tr v-for="token in DS_MOTION_TOKENS" :key="token.id">
                  <td class="border-b py-2 pr-4 font-medium" style="border-color: var(--bw-line)">{{ token.label }}</td>
                  <td class="border-b py-2 pr-4 tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ Math.round(tempo.base * token.factor) }} ms</td>
                  <td class="border-b py-2 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ token.usage }}</td>
                </tr>
                <tr>
                  <td class="border-b py-2 pr-4 font-medium" style="border-color: var(--bw-line)">motion.stagger</td>
                  <td class="border-b py-2 pr-4 tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">{{ DS_MOTION_STAGGER }} ms</td>
                  <td class="border-b py-2 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">Versatz zwischen Geschwistern.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul class="mt-3 flex flex-col gap-1.5">
            <li
              v-for="rule in DS_MOTION_RULES" :key="rule"
              class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
            >
              <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
              <span class="min-w-0">{{ rule }}</span>
            </li>
          </ul>
        </div>
      </div>

      <p class="fd-noprint mt-5 flex flex-wrap items-center gap-2">
        <span class="bw-pending">Korrigiert wird in der Werkstatt, nicht hier.</span>
        <NuxtLink to="/brand/demo/design/color" class="bw-label underline" style="color: var(--bw-ink-soft)">Zur Farbwelt</NuxtLink>
      </p>
    </template>
  </section>
</template>

<style scoped>
/* Dieselben Druck-Regeln wie `FdChapter` — ein Kapitel, das im Druck anders
 * bricht als seine neun Geschwister, fällt sofort auf. */
@media print {
  .fd-chapter { break-before: page; break-inside: auto; }
  .fd-noprint { display: none !important; }
  .fd-box { background: transparent !important; border: 1px solid #ddd; border-radius: 8px; }
}
</style>
