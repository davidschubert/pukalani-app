<script setup lang="ts">
import { DK_AI_REVIEW, DK_AI_SCOPE, DK_GUARDRAILS, DK_PROMPTS } from '../../../../utils/demoKit'

/**
 * KAPITEL „AI-GUIDELINES" (Konzept docs/plans/BRAND-BOOK-KIT.md §2.3,
 * Prototyp-Screen 4) — Nika führt.
 *
 * VIER SESSIONS in dieser Reihenfolge, untereinander auf einer Bühne:
 *
 *   n.scope       → was KI im Namen der Marke ERZEUGEN darf   (Karten)
 *   n.review      → wer freigibt                              (Karten)
 *   n.guardrails  → die Leitplanken als Entwurf               (Bühne)
 *   n.prompts     → drei Vorlagen, pur gerechnet              (nur lesen)
 *
 * DIE REIHENFOLGE IST DAS PRODUKT: erst der Umfang, dann die Freigabe, dann
 * die Leitplanken. Wer bei den Leitplanken anfängt, schreibt einen Stil-Guide
 * ohne die Frage, ob eine Maschine überhaupt schreiben darf.
 *
 * DIE LEITPLANKEN SIND ABGELEITET, NICHT ERFUNDEN: jede Zeile trägt ihre
 * Herkunfts-Angabe (Ton-Wörter, Tabu-Wörter, Namens-Regeln, Anti-Werte). Nika
 * ENTWIRFT, der Mensch bestätigt oder korrigiert — dieselbe Mechanik wie im
 * Briefing des Zeichen-Kapitels.
 *
 * DIE DREI VORLAGEN KOSTEN NICHTS (§2.11: „n.prompts, p.summary, alle
 * Exporte: null KI-Aufrufe"). Deshalb steht an ihnen „ohne KI gerechnet" —
 * genau das soll der Prototyp beurteilbar machen.
 */
const scopeId = ref(DK_AI_SCOPE.find(card => card.recommended)?.id ?? DK_AI_SCOPE[0]!.id)
const reviewId = ref(DK_AI_REVIEW.find(card => card.recommended)?.id ?? DK_AI_REVIEW[0]!.id)

/* Die Leitplanken als bearbeitbare Kopie — je Gruppe eine Textfläche, eine
 * Zeile je Eintrag. Ein Formular mit vier mal vier Feldern wäre genauer und
 * unbenutzbar; korrigiert wird in der Sprache, in der es auch gelesen wird. */
const guardrails = ref(DK_GUARDRAILS.map(group => ({ id: group.id, text: group.items.join('\n') })))
const guardrailsEditing = ref(false)
const guardrailsConfirmed = ref(false)

function guardrailText(id: string): string {
  return guardrails.value.find(entry => entry.id === id)?.text ?? ''
}

function guardrailLines(id: string): string[] {
  return guardrailText(id).split('\n').map(line => line.trim()).filter(Boolean)
}

function confirmGuardrails(): void {
  guardrailsEditing.value = false
  guardrailsConfirmed.value = true
}

const copied = ref<string | null>(null)

async function copyPrompt(id: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    /* Ohne sicheren Kontext gibt es keine Zwischenablage — der Dummy zeigt die
     * Rückmeldung trotzdem, weil er die FORM beweist. */
  }
  copied.value = id
  window.setTimeout(() => { copied.value = null }, 1600)
}
</script>

<template>
  <FdKitWorkspace chapter="aiguide">
    <!-- ── n.scope ─────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Was KI erzeugen darf</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">n.scope</span>
      </div>
      <p class="bw-doc-text mt-2">
        Eine Wahl, und sie gilt für alle im Team. Sie sagt nicht, wie gut eine Maschine schreibt — sie sagt, wofür ihr geradesteht.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          v-for="card in DK_AI_SCOPE" :key="card.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="scopeId === card.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="scopeId === card.id"
          @click="scopeId = card.id"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium">
              {{ card.label }}
              <span v-if="card.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
            </span>
            <UIcon v-if="scopeId === card.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ card.note }}</span>
        </button>
      </div>
    </section>

    <!-- ── n.review ────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Freigabe-Regel</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">n.review</span>
      </div>
      <p class="bw-doc-text mt-2">
        Der Markt ist sich hier einig: der Mensch entscheidet zuletzt. Die Frage ist nur, an welcher Stelle er es tut.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          v-for="card in DK_AI_REVIEW" :key="card.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="reviewId === card.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="reviewId === card.id"
          @click="reviewId = card.id"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium">
              {{ card.label }}
              <span v-if="card.recommended" class="bw-label ms-2" style="color: var(--bw-accent)">Empfohlen</span>
            </span>
            <UIcon v-if="reviewId === card.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ card.note }}</span>
        </button>
      </div>
    </section>

    <!-- ── n.guardrails ────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Leitplanken</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">n.guardrails · Entwurf von Nika</span>
      </div>
      <p class="bw-doc-text mt-2">
        Vier Gruppen: wie ihr klingt, was ihr nie sagt, wie eure Namen geschrieben werden und worüber ihr nicht sprecht. Jede Zeile kommt aus einem bestätigten Wert weiter oben.
      </p>

      <div class="mt-4" :class="guardrailsEditing ? '' : 'bw-draft-frame'">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="bw-label" style="color: var(--bw-muted)">Basis: Ton-Wörter, Vokabular, Namens-Regeln, Anti-Werte</p>
          <span v-if="guardrailsConfirmed" class="bw-state bw-state--confirmed"><UIcon name="i-ph-check" /> festgehalten</span>
          <span v-else class="bw-state bw-state--draft"><UIcon name="i-ph-pen-nib" /> Entwurf</span>
        </div>

        <div class="mt-4 grid gap-5 lg:grid-cols-2">
          <div v-for="group in DK_GUARDRAILS" :key="group.id" class="min-w-0">
            <p class="text-sm font-medium">{{ group.title }}</p>
            <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ group.origin }}</p>
            <UTextarea
              v-if="guardrailsEditing"
              :model-value="guardrailText(group.id)"
              :rows="5" class="mt-2 w-full"
              @update:model-value="value => {
                const entry = guardrails.find(item => item.id === group.id)
                if (entry) entry.text = String(value)
              }"
            />
            <ul v-else class="mt-2 flex flex-col gap-1.5">
              <li
                v-for="line in guardrailLines(group.id)" :key="line"
                class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
              >
                <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
                <span class="min-w-0">{{ line }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <UButton
            v-if="guardrailsEditing"
            label="Übernehmen" icon="i-ph-check" class="rounded-full" @click="confirmGuardrails"
          />
          <template v-else>
            <UButton label="Das halte ich fest" icon="i-ph-check" class="rounded-full" @click="confirmGuardrails" />
            <UButton
              label="Korrigieren" icon="i-ph-pencil-simple" color="neutral" variant="outline"
              class="rounded-full" style="background: var(--bw-surface-hi)"
              @click="guardrailsEditing = true"
            />
          </template>
          <p class="bw-pending">Was ihr hier festhaltet, steht anschließend in Kapitel 11 eurer Foundation und in brand.md.</p>
        </div>
      </div>
    </section>

    <!-- ── n.prompts ───────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Prompt-Vorlagen</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">n.prompts · Ableitung, nur lesen</span>
      </div>
      <p class="bw-doc-text mt-2">
        Drei Vorlagen, gerechnet aus euren Werten und den Leitplanken darüber. Ändert sich eine Leitplanke, ändern sie sich mit — deshalb gibt es hier nichts zu bearbeiten.
      </p>
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div v-for="prompt in DK_PROMPTS" :key="prompt.id" class="bw-frame flex min-w-0 flex-col px-5 py-4" style="background: var(--bw-surface)">
          <div class="flex flex-wrap items-baseline gap-2">
            <p class="text-sm font-medium">{{ prompt.title }}</p>
            <UButton
              size="xs" color="neutral" variant="outline" class="ms-auto rounded-full" style="background: var(--bw-surface-hi)"
              :icon="copied === prompt.id ? 'i-ph-check' : 'i-ph-copy'"
              :label="copied === prompt.id ? 'Kopiert' : 'Kopieren'"
              @click="copyPrompt(prompt.id, prompt.text)"
            />
          </div>
          <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ prompt.purpose }}</p>
          <pre class="fd-prompt mt-3 flex-1">{{ prompt.text }}</pre>
        </div>
      </div>
      <p class="bw-pending mt-4">Ohne KI gerechnet — keine Anfrage, keine Kosten, kein Cache. Die Vorlagen sind so aktuell wie die Werte darüber.</p>
    </section>
  </FdKitWorkspace>
</template>

<style scoped>
.fd-prompt {
  font-family: var(--bw-font-mono);
  font-size: 12px;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--bw-ink-soft);
  margin: 0;
}
</style>
