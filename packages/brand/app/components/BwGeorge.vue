<script setup lang="ts">
/** Berater-Panel: Monogramm statt Porträt, max 2–3 Sätze pro Zug, jeder
 *  Zug endet in Frage oder Schritt (§3d). Kein Lob-Spam, keine Fake-Delays.
 *
 *  ── DER KOPF ZEIGT DIE EINE STIMME (2026-09-02) ──────────────────────────
 *  Name und Rollen-Titel kommen von aussen, stehen aber im ganzen Wizard auf
 *  George (`BRAND_VOICE`): seit Davids Eine-Stimme-Entscheidung wechselt der
 *  Sprecher nicht mehr mit dem Kapitel. Und zwar VORNAME plus Rolle — die
 *  Nachnamen gehören der About-Ebene, im Arbeitsmodus sind sie nur Ballast.
 *
 *  ── DAS PHASEN-INTRO IST ANZEIGE, KEIN VERLAUF ───────────────────────────
 *  `handover` steht als stille Zeile ÜBER den Nachrichten und wird nirgends
 *  gespeichert: wer zwischen zwei Bausteinen hin- und herspringt, bekäme sonst
 *  bei jedem Sprung eine weitere Zeile in seinen Verlauf geschrieben. Es sagt
 *  seit dem 2026-09-02 nicht mehr „ab hier übernimmt X", sondern mit wessen
 *  Blick George dieses Kapitel angeht. */
export interface BwMessage {
  id: string
  role: 'george' | 'user'
  text: string
  help?: string
  /** George schreibt noch — der Strom läuft (§3e `message.delta`). */
  pending?: boolean
}

const props = withDefaults(defineProps<{
  messages: BwMessage[]
  /** Vorname des führenden Beraters. */
  advisorName?: string
  /** Lokalisierter Rollen-Titel. */
  advisorRole?: string
  /** Bildpfad des Beraters; leer ⇒ Monogramm aus dem Vornamen. */
  advisorAvatar?: string
  /** Einmalige Übergabe-Zeile beim Betreten eines Bausteins (s. Kopf). */
  handover?: string | null
  /**
   * Beispiel-Antwort zur AKTUELLEN Frage — grau im Feld, wie in Claude
   * Desktop. Leer ⇒ der generische Platzhalter. Sie ist NIE ein Wert:
   * Absenden ohne Tastendruck bleibt gesperrt (`draft` bleibt leer).
   */
  placeholder?: string
  /**
   * Der Berater schreibt gerade (P3.2). Der Senden-Knopf ist dann aus — der
   * DOPPEL-SENDE-SCHUTZ als Griff, nicht als Regel: weitertippen darf man,
   * abschicken erst, wenn der Zug steht. Sonst käme die zweite Antwort auf eine
   * Frage, die der Berater noch gar nicht gestellt hat.
   */
  busy?: boolean
}>(), {
  advisorName: 'George',
  advisorRole: '',
  // Leer ⇒ Monogramm. Es gibt (seit 2026-09-02) kein Berater-Bild mehr; der
  // Pfad kommt, wenn überhaupt, aus der Registry (`brandAdvisors.ts`).
  advisorAvatar: '',
  handover: null,
  placeholder: '',
  busy: false,
})

defineEmits<{ send: [text: string] }>()

const { t } = useI18n()
const draft = ref('')

const initial = computed(() => props.advisorName.slice(0, 1).toUpperCase())

/**
 * TAB ÜBERNIMMT DIE BEISPIEL-ANTWORT (Davids Wunsch 2026-09-02, Muster
 * Claude Desktop): steht im LEEREN Feld eine Beispiel-Antwort grau, holt Tab
 * sie als echten Text ins Feld — ab da ist sie normale Eingabe (editierbar,
 * absendbar). Tab wird NUR dann abgefangen: sobald etwas getippt ist oder
 * keine Beispiel-Antwort da ist (generischer Platzhalter), navigiert Tab wie
 * immer — die Tastatur-Reihenfolge bleibt sonst unangetastet, Shift-Tab
 * (rückwärts) ebenso.
 */
function acceptExample(event: KeyboardEvent): void {
  if (event.shiftKey || !props.placeholder || draft.value.length > 0) return
  event.preventDefault()
  draft.value = props.placeholder
}

/* Runde 55 (David): der Chat ankert UNTEN und wächst nach oben —
 * neue Nachrichten schieben den Verlauf hoch, Blick bleibt beim Composer. */
const scroller = ref<HTMLElement | null>(null)
watch(() => props.messages.length, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2.5 border-b px-7 pt-5 pb-3.5" style="border-color: var(--bw-line)">
      <BwGeorgeAvatar :src="advisorAvatar" :initial="initial" :alt="advisorName" />
      <span class="leading-tight">
        <span class="bw-label block">{{ advisorName }}</span>
        <span class="bw-label block" style="color: var(--bw-muted)">
          {{ advisorRole || t('brand.workspace.george.subtitle') }}
        </span>
      </span>
    </div>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-7 py-5">
      <div class="flex min-h-full flex-col justify-end space-y-4">
        <p v-if="handover" class="bw-label" style="color: var(--bw-muted)">{{ handover }}</p>
        <div v-for="m in messages" :key="m.id" class="bw-msg" :class="m.role === 'user' ? 'bw-msg--user' : ''">
          <BwGeorgeAvatar
            v-if="m.role === 'george'"
            size="md" :src="advisorAvatar" :initial="initial" :alt="advisorName"
          />
          <div class="bw-msg-body">
            <!-- Interpolation statt v-html: der Text kommt aus einem Sprachmodell
                 und wird escaped gerendert. Markdown im Chat kommt mit P2 über
                 core/shared/markdown.ts + MarkdownContent.vue (vnode-basiert,
                 ohne v-html-Pfad) — bis dahin zeigen wir lieber Sternchen als
                 fremdes Markup. -->
            <p class="whitespace-pre-wrap">{{ m.text }}<span v-if="m.pending" class="bw-caret" aria-hidden="true">▍</span></p>
            <p v-if="m.help" class="bw-msg-help">{{ m.help }}</p>
          </div>
        </div>
        <slot name="chips" />
      </div>
    </div>
    <form class="flex gap-2 border-t px-7 py-4" style="border-color: var(--bw-line)" @submit.prevent="!busy && draft.trim() && ($emit('send', draft), draft = '')">
      <UInput
        v-model="draft" variant="none" class="flex-1 rounded-full" :ui="{ base: 'rounded-full px-4' }"
        :placeholder="placeholder || t('brand.workspace.george.placeholder', { voice: advisorName })" size="lg" style="background: var(--bw-surface-hi)"
        @keydown.tab="acceptExample"
      />
      <UButton
        type="submit" icon="i-ph-paper-plane-right" :aria-label="t('brand.workspace.george.send')"
        size="lg" color="neutral" variant="ghost" class="bw-send rounded-full" :disabled="busy || !draft.trim()"
      />
    </form>
  </div>
</template>
