<script setup lang="ts">
import { type ReactionCount, type ReactionKey, REACTION_EMOJI } from '../../shared/reactions'

/**
 * DIE REAKTIONS-LEISTE — Chips (Zeichen + Anzahl, eigene hervorgehoben) und
 * EIN „+"-Knopf mit dem kuratierten Satz (F57 Mechanik 1).
 *
 * ── SIE WEISS NICHT, WORAN SIE HAENGT, UND DAS IST DER ZWECK ───────────────
 * Sie bekommt Chips und meldet einen Klick — mehr nicht. Keine Route, kein
 * Composable, kein Ziel-Typ. Genau deshalb konnte sie am 2026-08-14 aus dem
 * posts-Layer hierher ziehen, als Davids Entscheidung vom 2026-08-13
 * („Reaktionen auch auf Antworten") einen ZWEITEN Konsumenten schuf: die
 * Antworten sind `comments`-Zeilen, und `comments` darf `posts` nicht kennen
 * (A14). Was BEIDE Produkte zeigen, gehoert ins Fundament — was sie
 * unterscheidet (die Route, die Tabelle, das Publikum), bleibt bei ihnen.
 * Der Mechanismus ist geteilt, der Einstieg nie.
 *
 * ── WER DARF KLICKEN ──────────────────────────────────────────────────────
 * Die ZAHLEN sieht jeder, der den Inhalt sieht — das entscheiden die
 * Row-Permissions, nicht diese Komponente. Klicken kann nur, wer angemeldet
 * ist (`canReact`), und aus demselben Grund wie beim Stimmen: eine Reaktion
 * gehoert einem Konto. Ohne Erlaubnis bleiben die Chips stehen (nur eben
 * unklickbar), der „+"-Knopf verschwindet ganz — ein Menue, das nichts
 * bewirken kann, waere eine Einladung ins Leere.
 *
 * ── KEINE SUMME, KEIN „SCORE" ─────────────────────────────────────────────
 * Eine Gesamtzahl ueber alle Emojis waere die zweite Zustimmung, die es laut
 * Konzept Teil 4 Punkt 3 nicht geben soll. Wer hier eine ergaenzt, hebt
 * Davids Entscheidung 4 („Like = Upvote") in der Oberflaeche auf, ganz egal
 * was die Zaehler auf dem Server tun.
 */
const props = withDefaults(defineProps<{
  /** Die Chips DIESES Ziels — leer heisst „noch niemand hat reagiert". */
  chips: ReactionCount[]
  /** Der in dieser App freigeschaltete Satz (kommt vom Server, nie aus der Registry). */
  allowed: ReactionKey[]
  /** Darf der Betrachter ueberhaupt reagieren? (angemeldet + schreibbar) */
  canReact?: boolean
  /** Laeuft gerade ein Umschalten? Sperrt die ganze Leiste gegen Doppelklicks. */
  busy?: boolean
  /**
   * Woran die Leiste haengt — NUR fuer den Test-Haken (`data-reactions`).
   * Beweise und E2E greifen am handelnden Element an, und in einer Diskussion
   * stehen Themen- und Antwort-Leiste auf DERSELBEN Seite: ohne diese
   * Unterscheidung traefe ein Selektor beide.
   */
  scope?: string
}>(), { canReact: false, busy: false, scope: 'content' })

const emit = defineEmits<{ toggle: [reaction: ReactionKey] }>()

const { t } = useI18n()

/** Was im „+"-Menue steht: alles, was ich noch nicht gegeben habe. */
const addable = computed(() => {
  const mine = new Set(props.chips.filter(chip => chip.mine).map(chip => chip.reaction))
  return props.allowed.filter(key => !mine.has(key))
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" :data-reactions="scope">
    <UButton
      v-for="chip in chips"
      :key="chip.reaction"
      size="xs"
      :color="chip.mine ? 'primary' : 'neutral'"
      :variant="chip.mine ? 'soft' : 'ghost'"
      :disabled="!canReact || busy"
      :aria-label="t(`reactions.name.${chip.reaction}`)"
      :aria-pressed="chip.mine"
      :data-reaction="chip.reaction"
      data-reaction-chip
      @click="emit('toggle', chip.reaction)"
    >
      <span aria-hidden="true">{{ REACTION_EMOJI[chip.reaction] }}</span>
      <span class="text-xs font-medium tabular-nums" data-reaction-count>{{ chip.count }}</span>
    </UButton>

    <UPopover v-if="canReact && addable.length > 0">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-ph-smiley"
        :disabled="busy"
        :aria-label="t('reactions.add')"
        data-reaction-add
      />
      <template #content>
        <div class="flex flex-wrap gap-1 p-2" data-reaction-menu>
          <UButton
            v-for="key in addable"
            :key="key"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            :aria-label="t(`reactions.name.${key}`)"
            :data-reaction-option="key"
            @click="emit('toggle', key)"
          >
            <span aria-hidden="true">{{ REACTION_EMOJI[key] }}</span>
          </UButton>
        </div>
      </template>
    </UPopover>
  </div>
</template>
