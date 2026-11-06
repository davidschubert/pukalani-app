<script setup lang="ts">
import type { MarketBrandCheck } from '../../shared/marketProfile'

/**
 * PROTOTYP (M0b) — DER BRAND-CHECK-SCORE EINES KANDIDATEN (Plan §7.3).
 *
 * ── ES IST DER BESTEHENDE SCORE, KEIN ZWEITER ────────────────────────────
 * Davids Entscheidung vom 2026-09-05 abends: der am Nachmittag skizzierte
 * „Klarheits-Score" ist gestrichen. Der Marktvergleich RECHNET hier nichts —
 * er ZEIGT, was der Brand-Check (`brand_checks.score`/`band`) ohnehin schon
 * misst, und verlinkt auf dessen Ergebnis. Zwei Zahlen nebeneinander wären
 * zwei Wahrheiten über dieselbe Marke.
 *
 * ── DER RING KOMMT VON AUSSEN HEREIN (CONCEPT A14) ───────────────────────
 * `BwScoreRing` gehört `packages/brand`, und `market` hängt nicht an `brand`
 * (s. `nuxt.config.ts` des Layers, Plan §2.1) — ein `<BwScoreRing>` an dieser
 * Stelle wäre genau die stille Auto-Import-Kopplung, die CLAUDE.md verbietet:
 * in einer App mit `market` ohne `brand` bliebe die Komponente leer, ohne dass
 * es jemand merkt. Der Ring kommt deshalb als SLOT herein, so wie `fieldLabels`
 * und `resolveHref` schon als Prop hereinkommen — die Seite kennt beide Layer,
 * die Komponente nur einen.
 *
 * Aus demselben Grund kommt auch das BAND-WORT von aussen (`resolveBandLabel`):
 * die sieben Bänder sind `brand.check.bands.*`, und dieser Layer schreibt
 * keinen `brand.*`-Schlüssel. Ohne Auflösung steht der rohe Wert da — sichtbar
 * falsch statt still falsch.
 *
 * ── OHNE CHECK IST DAS EIN ZUSTAND, KEINE LEERE ──────────────────────────
 * „Brand-Check läuft mit" (§7.3: „sofern für die Adresse ein Check vorliegt
 * oder der Lauf einen anstösst"). Ein weggelassener Score sähe aus, als gäbe
 * es ihn für diese Marke nicht.
 */
const props = withDefaults(defineProps<{
  check?: MarketBrandCheck | null
  /** Das Band als Wort — aufgelöst von der Seite gegen den brand-Katalog. */
  resolveBandLabel?: (band: string) => string
  /** Die Adresse des Ergebnisses; im Prototyp ein Platzhalter-Ziel. */
  resolveCheckHref?: (checkId: string) => string
  /** Ohne Link: in der Tabellen-Kopfzeile ist der Platz zu eng. */
  linked?: boolean
}>(), {
  check: null,
  resolveBandLabel: (band: string) => band,
  resolveCheckHref: (checkId: string) => `/brand-check/${checkId}`,
  linked: true,
})

const { t } = useI18n()

const href = computed(() => (props.check ? props.resolveCheckHref(props.check.checkId) : ''))
</script>

<template>
  <!-- EINE WURZEL, ZWEI ZUSTÄNDE — und das ist kein Schönheitssinn: mit
       `v-if`/`v-else` auf OBERSTER Ebene hat die Komponente zwei Wurzeln, und
       eine von aussen mitgegebene Klasse (`class="mt-1"`) fällt dann auf dem
       Server anders durch als im Browser. Ergebnis war eine
       Hydrations-Abweichung, live gemessen: „rendered on server … expected on
       client … mt-1". Der Umweg ist ein Element, der Preis wäre eine Seite,
       die sich nach dem Laden anders verhält als davor. -->
  <div class="flex flex-none items-center gap-2">
    <template v-if="check">
      <!-- Der Ring gehört dem brand-Layer und wird hereingereicht (s. Kopf). -->
      <slot name="ring" :check="check" />

      <span class="min-w-0">
        <span class="bw-label block truncate" style="color: var(--bw-ink-soft)">
          {{ resolveBandLabel(check.band) }}
        </span>
        <a
          v-if="linked"
          :href="href"
          class="bw-label block truncate underline decoration-dotted underline-offset-2"
          style="color: var(--bw-muted)"
        >{{ t('market.score.link') }}</a>
      </span>
    </template>

    <!-- Kein Check: ein Zustand mit Wort, nie eine Leerstelle. -->
    <p v-else class="bw-label flex items-center gap-1.5" style="color: var(--bw-muted)">
      <UIcon name="i-ph-circle-notch" class="size-3.5 flex-none" />
      {{ t('market.score.pending') }}
    </p>
  </div>
</template>
