<script setup lang="ts">
import type { MarketEvidence } from '../../shared/marketProfile'
import { marketDate, marketHost } from '../utils/marketFormat'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DER BELEG: Zitat, Quelle, Abrufdatum — aufklappbar.
 *
 * ── ER IST DAS PRODUKT, NICHT DIE FUSSNOTE (Plan §1.8 Nr. 4) ─────────────
 * „Belegpflicht ist das Produkt": jede Aussage über eine fremde Marke trägt
 * ein WÖRTLICHES Zitat von deren Website plus URL plus Abrufdatum. Das
 * schliesst Halluzinationen strukturell aus (§1.10), erfüllt die
 * Nachprüfbarkeit nach UWG (§1.7 Nr. 5) und ist das eine Argument gegen
 * „ChatGPT kann das auch". Deshalb hat JEDE Zelle und JEDER Listeneintrag
 * diesen Knopf — und deshalb gibt es keinen Zustand „Aussage ohne Beleg":
 * ein Feld ohne Treffer wird verworfen, nicht abgeschwächt.
 *
 * ── ZUGEKLAPPT IST DER NORMALFALL ────────────────────────────────────────
 * Zehn Felder mal vier Spalten sind vierzig Zitate; offen wäre die
 * Gegenüberstellung eine Textwand statt einer Übersicht. Der Beleg ist einen
 * Klick entfernt, nicht versteckt.
 *
 * ── `resolveHref` IST DIE PROTOTYP-NAHT ──────────────────────────────────
 * In der Umsetzung zeigt der Link auf `sourceUrl` — auf die echte Website.
 * Im Prototyp gibt es kein Netz: die drei Wettbewerber sind erfunden, ihre
 * „Websites" liegen als statische Seiten im Playground. Der Umweg ist EIN
 * Prop mit der Identität als Default; die Umsetzung lässt es einfach weg.
 * Die ANGEZEIGTE Adresse bleibt in beiden Fällen die echte (erfundene) —
 * sonst zeigte der Beleg auf eine Quelle, die es so nicht gibt.
 */
const props = withDefaults(defineProps<{
  evidence: MarketEvidence
  /** Absender des Zitats (Name des Wettbewerbers) — steht auf dem Knopf. */
  label?: string
  defaultOpen?: boolean
  resolveHref?: (sourceUrl: string) => string
}>(), {
  label: undefined,
  defaultOpen: false,
  resolveHref: (sourceUrl: string) => sourceUrl,
})

const { t, locale } = useI18n()
const open = ref(props.defaultOpen)

const host = computed(() => marketHost(props.evidence.sourceUrl))
const href = computed(() => props.resolveHref(props.evidence.sourceUrl))
const fetched = computed(() => marketDate(props.evidence.fetchedAt, locale.value))
</script>

<template>
  <div>
    <button
      type="button"
      class="bw-label inline-flex items-center gap-1 underline decoration-dotted underline-offset-2"
      style="color: var(--bw-muted)"
      :aria-expanded="open"
      @click="open = !open"
    >
      <UIcon :name="open ? 'i-ph-caret-down' : 'i-ph-quotes'" class="size-3.5 flex-none" />
      {{ label ?? t(open ? 'market.evidence.hide' : 'market.evidence.show') }}
    </button>

    <div
      v-if="open"
      class="mt-1.5 rounded-lg border p-2.5"
      style="border-color: var(--bw-line); background: var(--bw-surface-hi)"
    >
      <!-- Das Zitat steht in der Sprache der fremden Website und läuft nie
           über i18n: übersetzt wäre es kein Beleg mehr. -->
      <blockquote class="text-sm italic leading-snug" style="color: var(--bw-ink)">
        &ldquo;{{ evidence.quote }}&rdquo;
      </blockquote>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          :href="href" target="_blank" rel="noopener noreferrer"
          class="bw-label inline-flex items-center gap-1 underline"
          style="color: var(--bw-ink-soft)"
        >
          <UIcon name="i-ph-link-simple" class="size-3.5 flex-none" />{{ host }}
        </a>
        <span class="bw-label" style="color: var(--bw-muted)">{{ t('market.evidence.fetched', { date: fetched }) }}</span>
        <!-- Sicherheit NIE nur als Farbe (WCAG): sie steht als Wort da. -->
        <span class="bw-label" style="color: var(--bw-muted)">
          &middot; {{ t(evidence.confidence === 'stated' ? 'market.evidence.stated' : 'market.evidence.implied') }}
        </span>
      </div>
    </div>
  </div>
</template>
