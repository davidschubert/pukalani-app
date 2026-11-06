<script setup lang="ts">
/**
 * BILD-PLATZHALTER (Davids Auftrag 2026-09-04: About/Team wie eine
 * Produkt-Seite aufbauen, mit Stellen für Bildmaterial).
 *
 * ── DER PROMPT REIST NICHT IN DEN DOM ─────────────────────────────────────
 * `prompt` ist eine Prop, damit die Bild-Anweisung an der STELLE im Seiten-
 * Code steht, an der das Bild später hängt — gerendert wird sie nicht: eine
 * öffentliche Seite zeigt keine Generierungs-Anweisungen. Die Kennung (`id`,
 * z. B. „A1") steht sichtbar auf der Kachel und verweist auf das Register
 * `docs/referenz/BRANDING-SUPPLY-BILDMATERIAL.md`, in dem jeder Prompt mit
 * Format und Zweck steht.
 *
 * ── DIE KACHEL IST MARKEN-KONFORM, KEIN GRAUES RECHTECK ───────────────────
 * Fingerabdruck der Marke: Monochrom + Acid Pop, geometrisch, viel Raum. Die
 * Kachel nimmt genau das: ruhige Fläche in `--bw-surface-hi`, ein einzelner
 * Pop-Punkt, gestrichelter Innenrahmen. Beide Farbwelten laufen über die
 * Tokens (`brand.css`), nichts ist hier fest.
 *
 * `label` ist die Bildbeschreibung für Screenreader — was das Bild ZEIGEN
 * wird, nicht dass es fehlt.
 */
const props = withDefaults(defineProps<{
  id: string
  label: string
  /** CSS-`aspect-ratio`, z. B. '16 / 9', '4 / 5', '1 / 1'. */
  ratio?: string
  /** Generierungs-Anweisung — Doku am Ort, nicht im DOM (s. Kopf). */
  prompt?: string
}>(), { ratio: '16 / 9', prompt: '' })

const { t } = useI18n()
// Die Prop wird bewusst nur GELESEN, damit sie nicht als unbenutzt gilt —
// sie ist Dokumentation und landet nirgends im Markup.
void props.prompt
</script>

<template>
  <div
    role="img" :aria-label="label"
    class="bw-placeholder bw-frame relative overflow-hidden"
    :style="`aspect-ratio: ${ratio}; background: var(--bw-surface-hi)`"
  >
    <div class="absolute inset-3 rounded-[calc(var(--bw-radius-frame)-0.5rem)] border border-dashed" style="border-color: var(--bw-line-strong)" />
    <span class="absolute left-[38%] top-[34%] size-3 rounded-full" style="background: var(--bw-pop)" aria-hidden="true" />
    <p class="bw-label absolute bottom-5 left-6 flex items-center gap-2" style="color: var(--bw-muted)">
      <span class="rounded-full px-2 py-0.5" style="background: var(--bw-surface)">{{ id }}</span>
      {{ t('brand.placeholder.pending') }}
    </p>
  </div>
</template>
