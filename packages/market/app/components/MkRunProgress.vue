<script setup lang="ts">
import type { MarketAiRunStep, MarketRunPhase, MarketRunStep } from '../../shared/marketProfile'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DER LAUF-FORTSCHRITT (Plan §2.3 Nr. 2/3, §2.11 Nr. 2).
 *
 * ── ER ERZÄHLT, WAS WIRKLICH PASSIERT ────────────────────────────────────
 * „robots.txt geprüft &middot; 3 Seiten gelesen &middot; Profil erstellt" ist
 * kein Ladebalken, sondern eine Rechenschaft: der Kunde sieht, dass wir
 * fragen, bevor wir lesen, und WIE VIEL wir gelesen haben. Das ist die
 * sichtbare Seite der Verträge aus §2.9 — und der Ort, an dem ein Ausschluss
 * seinen ehrlichen Satz bekommt statt eines roten Fehlers.
 *
 * ── EIN AUSSCHLUSS IST KEIN FEHLER ───────────────────────────────────────
 * Deshalb Bernstein und keine Fehlerfarbe: die Website hat NEIN gesagt, und
 * wir halten uns daran (§1.7 Nr. 2, fail-closed bis zur BGH-Klärung). Rot
 * bliebe für das, was schiefgeht — und liesse den Kunden glauben, wir hätten
 * etwas falsch gemacht.
 *
 * ── DER VERGLEICH IST EIN EIGENER SCHRITT ────────────────────────────────
 * N Extraktionen (je Wettbewerber ein günstiger Aufruf) und DANN ein Vergleich
 * über alle Profile (§2.3 Nr. 4) — die Zeile unten zeigt genau diese Naht.
 *
 * ── M0b: DIE KETTE IST LÄNGER GEWORDEN (Plan §7.4) ───────────────────────
 * robots.txt &middot; sitemap.xml &middot; Schlüsselseiten &middot; llms.txt
 * &middot; JSON-LD &middot; Profil &middot; Brand-Check. Das ist kein
 * Detailverliebtsein, sondern die sichtbare Seite zweier Versprechen: dass wir
 * FRAGEN, bevor wir lesen (§2.9 Nr. 1), und dass die Seitenauswahl NICHT
 * geraten ist (die sitemap nennt sie). „llms.txt nicht gefunden" steht deshalb
 * ausdrücklich da — eine weggelassene Zeile sähe aus, als hätten wir nicht
 * nachgesehen.
 *
 * ── DIE KI-AUSSENSICHT IST EIN EIGENER ABSCHNITT (§7.5) ──────────────────
 * Sie steht UNTER den Wettbewerbern und nicht in ihren Zeilen: sie hat keine
 * Seiten, keinen Beleg und keinen Einfluss auf den Score. Was sie hat, ist ein
 * Konsens („2 von 3 übereinstimmend") und ein Etikett, das genau das sagt.
 */
defineProps<{
  steps: readonly MarketRunStep[]
  phase: MarketRunPhase
  /** Der Abschnitt „KI-Aussensicht" — fehlt, solange nichts gefragt wurde. */
  ai?: MarketAiRunStep | null
}>()

const { t } = useI18n()
</script>

<template>
  <section>
    <h2 class="text-lg font-medium tracking-tight">{{ t('market.run.title') }}</h2>
    <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('market.run.lead') }}</p>

    <ol class="mt-4 space-y-2">
      <li v-for="step in steps" :key="step.competitorId" class="bw-card p-4">
        <div class="flex items-start gap-2.5">
          <UIcon
            :name="step.status === 'fetched' ? 'i-ph-check-circle'
              : step.status === 'excluded' ? 'i-ph-prohibit'
                : step.status === 'failed' ? 'i-ph-warning-circle'
                  : step.status === 'reading' ? 'i-ph-circle-notch' : 'i-ph-circle-dashed'"
            class="mt-0.5 size-4 flex-none"
            :class="step.status === 'reading' ? 'animate-spin' : ''"
            :style="`color: ${step.status === 'fetched' ? 'var(--bw-accent)'
              : step.status === 'excluded' ? 'var(--bw-draft)'
                : step.status === 'failed' ? 'var(--bw-stale)' : 'var(--bw-muted)'}`"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ step.name }}</p>

            <!-- Die Kette der Tatsachen. Jeder Punkt erscheint erst, wenn er
                 wahr ist — eine vorab gezeigte Zeile wäre ein Versprechen. -->
            <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm" style="color: var(--bw-ink-soft)">
              <template v-if="step.robotsChecked">
                <span>{{ t('market.run.robots') }}</span>
              </template>
              <template v-if="step.sitemapUrls !== undefined">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t('market.run.sitemap', { count: step.sitemapUrls }) }}</span>
              </template>
              <template v-if="step.pagesRead > 0">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t('market.run.pages', { count: step.pagesRead }) }}</span>
              </template>
              <!-- „nicht gefunden" ist eine geprüfte Auskunft und steht da. -->
              <template v-if="step.llmsTxt">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t(step.llmsTxt === 'found' ? 'market.run.llmsFound' : 'market.run.llmsMissing') }}</span>
              </template>
              <template v-if="step.jsonLd">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t('market.run.jsonLd') }}</span>
              </template>
              <template v-if="step.status === 'fetched'">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t('market.run.profiled') }}</span>
              </template>
              <template v-if="step.brandCheckStarted">
                <span style="color: var(--bw-muted)">&middot;</span>
                <span>{{ t('market.run.brandCheck') }}</span>
              </template>
              <template v-if="!step.robotsChecked && step.status === 'pending'">
                <span style="color: var(--bw-muted)">{{ t('market.run.waiting') }}</span>
              </template>
            </p>

            <p
              v-if="step.excludedReason"
              class="mt-1 text-sm leading-snug" style="color: var(--bw-draft)"
            >
              {{ t('market.status.excluded') }}: {{ t(`market.reason.${step.excludedReason}`) }}
            </p>
          </div>
        </div>
      </li>
    </ol>

    <!-- Die KI-Aussensicht: eigener Abschnitt, eigenes Etikett (§7.5). -->
    <section v-if="ai" class="mt-6">
      <h3 class="flex items-center gap-2 text-base font-medium tracking-tight">
        <UIcon name="i-ph-sparkle" class="size-4 flex-none" style="color: var(--bw-muted)" />
        {{ t('market.ai.title') }}
      </h3>
      <div class="bw-card mt-2 p-4">
        <p class="flex flex-wrap items-center gap-x-1.5 text-sm" style="color: var(--bw-ink-soft)">
          <UIcon
            :name="ai.adopted ? 'i-ph-check-circle' : 'i-ph-prohibit'"
            class="size-4 flex-none"
            :style="`color: ${ai.adopted ? 'var(--bw-accent)' : 'var(--bw-draft)'}`"
          />
          <span>{{ t('market.ai.consensus', { agree: ai.agree, asked: ai.asked }) }}</span>
          <span style="color: var(--bw-muted)">&middot;</span>
          <span>{{ t(ai.adopted ? 'market.ai.adopted' : 'market.ai.dropped') }}</span>
        </p>
        <p class="bw-label mt-1.5" style="color: var(--bw-muted)">{{ t('market.ai.disclaimer') }}</p>
      </div>
    </section>

    <!-- Der Vergleich über alle Profile — ein Aufruf, kein N-facher. -->
    <div class="mt-3 flex items-center gap-2.5 rounded-xl px-4 py-3" style="background: var(--bw-surface)">
      <UIcon
        :name="phase === 'done' ? 'i-ph-check-circle' : phase === 'comparing' ? 'i-ph-circle-notch' : 'i-ph-circle-dashed'"
        class="size-4 flex-none"
        :class="phase === 'comparing' ? 'animate-spin' : ''"
        :style="`color: ${phase === 'done' ? 'var(--bw-accent)' : 'var(--bw-muted)'}`"
      />
      <span class="text-sm" style="color: var(--bw-ink-soft)">
        {{ t(phase === 'done' ? 'market.run.done' : phase === 'comparing' ? 'market.run.comparing' : 'market.run.waiting') }}
      </span>
    </div>
  </section>
</template>
