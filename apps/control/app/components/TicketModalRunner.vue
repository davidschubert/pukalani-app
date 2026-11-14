<script setup lang="ts">
import { parseTicketChecklist } from '../../../../packages/tickets/app/utils/ticketMarkdown'
import type { TicketFilesResponse, TicketFileRow, TicketRow } from '../../../../packages/tickets/shared/types/ticket'
import { isOperatorWritten, normalizeTicketOrigin } from '../../../../packages/tickets/shared/ticketOrigin'
import { stripTriageBlock } from '../../../../packages/tickets/shared/triageBlock'
import type { RunAttachmentSource } from '../../../../packages/runner/shared/types/runner'

/**
 * DIE VERDRAHTUNG (A14): dieser Override füllt den Platzhalter
 * `TicketModalRunner` des tickets-Layers mit dem Lauf-Bereich des
 * runner-Layers. Nur DIESE App darf das — `tickets` kennt `runner` nicht und
 * `runner` kennt `tickets` nicht (docs/plans/AI-RUNNER.md § 3.1); beide treffen
 * sich erst hier, wo die Site ihre Produkte komponiert. Dasselbe Muster ist für
 * `TicketModalComments` vorgesehen.
 *
 * Die Aufgabe der Komponente ist genau eine: aus einem TICKET einen AUFTRAG
 * machen. Ob er als geprüft gilt, entscheidet der Server (siehe unten).
 */
const props = defineProps<{ ticket: TicketRow }>()

const { t } = useI18n()

/**
 * DER AUFTRAG. Titel als Überschrift, dann die Beschreibung, dann die noch
 * OFFENEN Punkte der Checkliste.
 *
 * DIE BESCHREIBUNG WIRD ROH ÜBERNOMMEN: sie IST Markdown (das Modal
 * bearbeitet sie mit `UEditor`, `content-type="markdown"`), und ein Agent
 * liest Markdown besser als jede Umformung. Sie hier durch den HTML-Renderer
 * zu schicken hiesse, Struktur wegzuwerfen und Tags einzuführen.
 *
 * OHNE DEN KI-TRIAGE-ABSCHNITT (`stripTriageBlock`): den hat ein Modell an die
 * Beschreibung gehängt, kein Mensch hat ihn geschrieben — er gehört nicht in
 * einen Auftrag an einen Agenten. Deshalb ändert die Triage auch die Herkunft
 * des Tickets nicht (SEC-038).
 *
 * ERLEDIGTE Punkte bleiben draussen: sie sind Vergangenheit, und im Auftrag
 * würden sie wie Arbeit aussehen. Ist die ganze Checkliste abgehakt, fehlt der
 * Abschnitt.
 *
 * TESTBEFEHLE STEHEN BEWUSST NICHT HIER: die wählt das Formular des
 * Lauf-Bereichs, und sie reisen als eigenes Feld (`testCommands`). Zweimal
 * dieselbe Angabe — einmal als Fliesstext, einmal als Liste — wäre eine
 * Einladung, dass beide auseinanderlaufen.
 */
const promptSource = computed(() => {
  const lines: string[] = [`# ${props.ticket.title}`, '']

  const description = stripTriageBlock(props.ticket.description).trim()
  if (description) lines.push(description, '')

  const open = parseTicketChecklist(props.ticket.checklist).filter(item => !item.done)
  if (open.length) {
    lines.push('## Checkliste', '')
    for (const item of open) lines.push(`- [ ] ${item.text}`)
    lines.push('')
  }

  return lines.join('\n')
})

/**
 * DIE HERKUNFT DES TEXTES (§ 8.2) — hier NUR NOCH ANZEIGE.
 *
 * Ob ein Auftrag als geprüft gilt, ENTSCHEIDET DER SERVER (SEC-038): die
 * Anlege-Route fragt über `resolveRunSubjectTrust` die Herkunft des Tickets ab
 * (`server/plugins/runner-ticket-trust.ts`) und nimmt nichts aus dem Body.
 * Früher rechnete diese Komponente `feedbackId === ''` und schickte das
 * Ergebnis mit — die Kopie eines Feedback-Tickets galt so als geprüft.
 *
 * Dieselbe Regel wird hier nur gerechnet, damit das Formular ehrlich ist:
 * ungeprüft ⇒ es bietet nur `plan` und `acceptEdits` an und keine
 * Testbefehle. Weicht die Anzeige je ab (die Karte ist veraltet), sagt der
 * Server nein — nicht umgekehrt.
 */
const promptTrusted = computed(() => isOperatorWritten(normalizeTicketOrigin(props.ticket.origin)))

/**
 * Die Anhänge des Tickets als LAZY Quellen: geladen wird eine Datei erst,
 * wenn wirklich ein Lauf startet. Sonst zöge jedes Öffnen einer Karte mit drei
 * Screenshots drei Downloads nach sich — für einen Knopf, den man selten
 * drückt.
 *
 * Der Lauf bekommt eine KOPIE in seinen eigenen Bucket (§ 6): der Runner hat
 * nur ein Bearer-Secret und käme an die Ticket-Route (`tickets.manage`,
 * Session) gar nicht heran.
 */
const files = ref<TicketFileRow[]>([])
watch(() => props.ticket.$id, async (id) => {
  files.value = []
  /**
   * NICHT AUF DEM SERVER. Der Bereich hängt in einem Modal, das erst auf Klick
   * öffnet — SSR hat hier nichts zu holen. Und ein `$fetch` im SSR reicht die
   * Session-Cookies nicht weiter (das tut nur `useFetch`): die Antwort wäre
   * ein 401, der Fehlerzweig setzte die Liste leer, und weil die Ticket-Id
   * sich beim Hydrieren nicht ändert, bliebe sie es. Ein Lauf ohne Anhänge,
   * ohne dass irgendwo etwas schiefging.
   */
  if (import.meta.server || !id) return
  try {
    const response = await $fetch<TicketFilesResponse>(`/api/tickets/${id}/files`)
    files.value = response.files
  }
  catch {
    // Fail-soft: ohne Anhänge starten ist besser als gar nicht starten können.
    files.value = []
  }
}, { immediate: true })

const attachments = computed<RunAttachmentSource[]>(() => files.value.map(file => ({
  name: file.name,
  blob: () => $fetch<Blob>(`/api/tickets/files/${file.fileId}`, { responseType: 'blob' }),
})))
</script>

<template>
  <section>
    <h3 class="mb-1 flex items-center gap-1.5 text-sm font-semibold">
      <UIcon name="i-ph-rocket-launch" class="size-4" />
      {{ t('control.ticketRunner.title') }}
    </h3>
    <p class="mb-3 text-xs text-muted">{{ t('control.ticketRunner.hint') }}</p>
    <RunnerRunPanel
      subject-type="ticket"
      :subject-id="ticket.$id"
      :prompt-source="promptSource"
      :prompt-trusted="promptTrusted"
      :attachments="attachments"
    />
  </section>
</template>
