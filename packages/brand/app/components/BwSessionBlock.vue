<script setup lang="ts">
import { brandChoiceDisplayLabel } from '../../shared/brandChoiceOptions'
import { brandSessionAcceptable } from '../../shared/brandJourney'
import { brandSlotValueView } from '../../shared/brandSlotFormat'
import { slotById } from '../../shared/slotRegistry'
import type {
  BrandAcceptanceSessionView,
  BrandFindingDecisionResponse,
} from '../../shared/types/brand'

/**
 * EIN BLOCK DES DOKUMENTS (BW2 Paket 7, Plan §5a Schritt 1 / §10) — Bereich,
 * Beispiel, eigene Eingabe, Notiz, Befunde, Handlungen.
 *
 * ── ER STAND BIS PAKET 7 IN `BwAcceptance.vue` ───────────────────────────
 * Seither gibt es dieselbe Zeile an ZWEI Orten: in der Finalen Abnahme eines
 * Kapitels und im Dokument über alle neun (§10 — das Dokument IST die Finale
 * Abnahme der Ebene 1). Eine zweite Kopie der Optik hätte genau das getan, was
 * eine Kopie immer tut: sie wäre an einer Stelle schöner geworden, und der
 * Mensch hätte seinen eigenen Wert nicht wiedererkannt.
 *
 * ── ER ZEIGT, ER ENTSCHEIDET NICHT ───────────────────────────────────────
 * Kein `$fetch` ausser dem des Befund-Chips (der entscheidet selbst, §8, s.
 * dort). Abnehmen, „Gilt weiter" und Bearbeiten reisen als Ereignis nach oben:
 * die SEITE führt die `revision` ihrer Kapitel-Zeile, spült den Autosave aus
 * und navigiert — und die beiden Seiten tun das verschieden (die Abnahme führt
 * EINE Revision, das Dokument neun).
 *
 * ── DAS BEISPIEL IST ABSCHALTBAR, UND DAS IST EINE AUSSAGE ───────────────
 * Auf der Abnahme-Seite steht es (§5a Schritt 1: der Kunde soll die FORM
 * sehen, an der er seinen Wert misst). Im Dokument nicht: dort steht die
 * MARKE, nicht die Lehre — ein erfundenes Vorbild aus einer fremden Branche
 * neben dem eigenen Purpose läse sich wie ein Teil davon.
 */
const props = withDefaults(defineProps<{
  session: BrandAcceptanceSessionView
  profileId: string
  /** Das erfundene Vorbild zeigen? (Abnahme ja, Dokument nein — s. Kopf.) */
  showExample?: boolean
  /** „Abnehmen" anbieten? Nur die Kapitel-Abnahme nimmt ab (§5a). */
  showAccept?: boolean
  /** Läuft gerade das Abnehmen dieser Zeile? */
  accepting?: boolean
  /** Läuft gerade „Gilt weiter" auf dieser Zeile? */
  keeping?: boolean
  /** Sind ALLE Knöpfe dieser Liste gerade gesperrt? (eine Handlung zur Zeit) */
  busy?: boolean
}>(), {
  showExample: true,
  showAccept: true,
  accepting: false,
  keeping: false,
  busy: false,
})

const emit = defineEmits<{
  /** Diese Zeile abnehmen (§5a Schritt 1). */
  accept: []
  /** „Gilt weiter" auf einer VERALTETEN Zeile (§9) — der Wert bleibt. */
  keep: []
  /** Bearbeiten — die Seite legt den Impact-Hinweis davor und springt (§9). */
  edit: []
  /** Ein Feld-Link eines Befund-Chips; er darf die KAPITEL-Grenze überschreiten. */
  field: [slotId: string]
  /** Ein Befund wurde HIER entschieden (§8). */
  decided: [decision: BrandFindingDecisionResponse]
  /** Der Bildschirm war alt (409) — die Liste stimmt nicht mehr. */
  stale: []
}>()

const { t, te, locale } = useI18n()

/**
 * EINE GLYPHE JE ZEILE, und die Rangfolge ist die Auskunft: was im Weg steht,
 * schlägt was erledigt ist. Eine abgenommene, aber VERALTETE Zeile als
 * „abgenommen" zu zeigen, versteckte genau den Grund, aus dem die Weiche unten
 * fehlt.
 */
const STATUS = {
  deferred: { key: 'brand.acceptance.status.deferred', icon: 'i-ph-clock', tone: 'var(--bw-ink-soft)' },
  stale: { key: 'brand.acceptance.status.stale', icon: 'i-ph-clock-counter-clockwise', tone: 'var(--bw-stale)' },
  accepted: { key: 'brand.acceptance.status.accepted', icon: 'i-ph-check-circle-fill', tone: 'var(--bw-accent)' },
  confirmed: { key: 'brand.acceptance.status.confirmed', icon: 'i-ph-check', tone: 'var(--bw-ink-soft)' },
  open: { key: 'brand.acceptance.status.open', icon: 'i-ph-circle-dashed', tone: 'var(--bw-muted)' },
} as const

const status = computed(() => {
  const session = props.session
  if (session.deferred) return STATUS.deferred
  if (session.state === 'stale') return STATUS.stale
  if (session.accepted) return STATUS.accepted
  return session.confirmed ? STATUS.confirmed : STATUS.open
})

/**
 * Die BESCHRIFTUNG ist Kurz-Label vor Frage — exakt wie in Werkstatt und Log
 * (`useBrandFieldLabel`). Ein zweiter Wortlaut hiesse, dass der Mensch das Feld
 * nicht wiedererkennt, das er gerade besprochen hat. Hier steht sie ohne das
 * Composable, weil der Server die beiden Schlüssel schon MITSCHICKT (samt
 * Pfad-/Team-Fassung der Frage) — ein zweiter Lauf über die Registry käme zum
 * selben Ergebnis und bräuchte den Store dafür.
 */
const label = computed(() => (te(props.session.labelKey)
  ? t(props.session.labelKey)
  : t(props.session.questionKey)))

const affects = computed(() => (props.session.affects.count === 0
  ? t('brand.session.affectsNone')
  : t('brand.session.affects', {
      count: props.session.affects.count,
      steps: props.session.affects.steps.map(key => t(`brand.steps.${key}`)).join(' · '),
    })))

/** Das BEISPIEL kommt in der OBERFLÄCHEN-Sprache — der Server schickt beide. */
const example = computed(() => {
  const examples = locale.value === 'de' ? props.session.example.de : props.session.example.en
  return examples[0] ?? ''
})

/**
 * Eine geschlossene Auswahl zeigt ihren NAMEN, nicht die gespeicherte Id
 * (dieselbe Regel wie im Log); die FORM (`list`/`blocks`) kommt aus
 * `brandSlotFormat.ts` — hier wird sie nur gelesen.
 */
const value = computed(() => brandSlotValueView(
  slotById(props.session.slotId)?.schema.kind ?? 'text',
  brandChoiceDisplayLabel(props.session.slotId, props.session.value, locale.value),
))

/**
 * Abnehmbar ist, was bestätigt und noch nicht abgenommen ist (§5a Schritt 2).
 *
 * Die Regel steht seit Befund 10 PUR nebenan (`brandSessionAcceptable`), weil
 * „Alle abnehmen" dieselbe Menge treffen muss — und der Server sie ebenfalls
 * liest. Drei Ausdrücke für eine Frage liefen unweigerlich auseinander: ein
 * Sammel-Knopf, der eine Zeile stehen lässt, an der ein Haken angeboten wird.
 */
const acceptable = computed(() => brandSessionAcceptable(props.session))
</script>

<template>
  <div
    class="rounded-2xl px-4 py-4"
    :style="session.confirmed ? 'background: var(--bw-surface-hi)' : 'background: var(--bw-surface)'"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p class="min-w-0 text-sm font-medium">{{ label }}</p>
      <span class="bw-label flex flex-none items-center gap-1" :style="`color: ${status.tone}`">
        <UIcon :name="status.icon" class="size-3.5" />{{ t(status.key) }}
      </span>
    </div>
    <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ affects }}</p>

    <!-- BEFUND-CHIPS (§8): offen, weil hier entschieden wird. Der Feld-Link
         kann in ein ANDERES Kapitel zeigen — deshalb `field`, nicht `edit`. -->
    <div v-if="session.findings.length" class="mt-3 flex flex-col gap-2">
      <BwFindingChip
        v-for="finding in session.findings" :key="finding.id"
        :finding="finding" :profile-id="profileId"
        @field="emit('field', $event)"
        @decided="emit('decided', $event)"
        @stale="emit('stale')"
      />
    </div>

    <div v-if="showExample && example" class="mt-3">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.acceptance.exampleLabel') }}</p>
      <p class="mt-1 text-sm italic leading-relaxed" style="color: var(--bw-ink-soft)">{{ example }}</p>
    </div>

    <div class="mt-3">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.acceptance.own') }}</p>
      <template v-if="session.value">
        <ul v-if="value.kind === 'list'" class="mt-1 space-y-1">
          <li
            v-for="(item, index) in value.items" :key="index"
            class="bw-doc-text flex gap-2" style="font-size: 0.875rem; line-height: 1.5"
          >
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ item }}
          </li>
        </ul>
        <div v-else-if="value.kind === 'blocks'" class="mt-1 space-y-3">
          <div v-for="(block, index) in value.blocks" :key="index">
            <p class="bw-label" style="color: var(--bw-ink-soft)">{{ block.label }}</p>
            <p class="bw-doc-text mt-0.5 whitespace-pre-wrap" style="font-size: 0.875rem; line-height: 1.5">{{ block.body }}</p>
          </div>
        </div>
        <p v-else class="bw-doc-text mt-1 whitespace-pre-wrap" style="font-size: 0.875rem; line-height: 1.5">
          {{ value.text }}
        </p>
      </template>
      <p v-else class="bw-pending mt-1">{{ t('brand.acceptance.valueEmpty') }}</p>
    </div>

    <!-- Die Notiz des Schliess-Aufrufs (§4), eingeklappt — dazu die Gründe
         abgelehnter Befunde, die als Notiz an ihrer Quell-Session landen
         (§8). Ohne Inhalt fällt die Zeile weg, statt leer dazustehen. -->
    <details v-if="session.notes" class="mt-3">
      <summary class="bw-label cursor-pointer" style="color: var(--bw-muted)">{{ t('brand.acceptance.notes') }}</summary>
      <p class="mt-1 whitespace-pre-wrap text-sm" style="color: var(--bw-ink-soft)">{{ session.notes }}</p>
    </details>

    <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
      <!-- Ein Knopf, der garantiert in eine Absage liefe, ist kein Angebot:
           statt seiner steht der GRUND mit dem Weg dorthin. -->
      <p v-if="!session.confirmed" class="bw-label mr-auto" style="color: var(--bw-muted)">
        {{ t('brand.acceptance.unconfirmed') }}
      </p>
      <!-- VERALTET (§9): der Wert steht, seine Grundlage hat sich bewegt.
           „Gilt weiter" stempelt sie neu — die Sperre fällt, ohne dass
           jemand ein Gespräch führen muss. -->
      <UButton
        v-if="session.state === 'stale'"
        size="xs" color="neutral" variant="ghost" class="rounded-full"
        icon="i-ph-check" :loading="keeping" :disabled="busy"
        :label="t('brand.session.keep')"
        @click="emit('keep')"
      />
      <UButton
        size="xs" color="neutral" variant="ghost" class="rounded-full"
        icon="i-ph-pencil-simple" :label="t('brand.acceptance.edit')"
        @click="emit('edit')"
      />
      <template v-if="showAccept">
        <span v-if="session.accepted" class="bw-confirm bw-confirm--done bw-confirm--xs">
          <UIcon name="i-ph-check" class="size-3.5" />{{ t('brand.acceptance.accepted') }}
        </span>
        <button
          v-else
          type="button" class="bw-confirm bw-confirm--open bw-confirm--xs"
          :disabled="!acceptable || accepting || busy"
          @click="emit('accept')"
        >
          <UIcon name="i-ph-check" class="size-3.5" />{{ t('brand.acceptance.accept') }}
        </button>
      </template>
    </div>
  </div>
</template>
