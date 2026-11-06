<script setup lang="ts">
import { DK_NAME_NOTE, DK_NAME_PATTERNS, DK_NAME_RULES, DK_NAME_TYPES } from '../../../../utils/demoKit'

/**
 * KAPITEL „NOMENKLATUR" (Konzept docs/plans/BRAND-BOOK-KIT.md §2.2,
 * Prototyp-Screen 5) — Otto führt.
 *
 * DREI SESSIONS:
 *   m.types     → welche Sorten von Dingen benennt ihr überhaupt   (Chips,
 *                 Mehrfachwahl)
 *   m.patterns  → je gewähltem Typ EIN Muster mit Beispiel          (Bühne,
 *                 Ottos Entwurf, hergeleitet)
 *   m.rules     → die Regeln als Liste, zum Bestätigen              (Liste)
 *
 * DER WEG IST EINE BEDINGUNG (§2.2, Entscheidung §2.20 Nr. 4): das Kapitel
 * gibt es nur, wo die Markenarchitektur-Weiche gelaufen ist —
 * `includeStep('nomenclature')` = `includeStep('architecture')`. Ohne
 * Untermarken gäbe es kein Muster zu bestätigen; Solo-Marken bekommen die
 * Schreibweisen stattdessen in den Leitplanken der AI-Guidelines. Die
 * Hinweis-Zeile oben sagt genau das — auch, warum Kailua hier trotzdem steht.
 *
 * DIE BÜHNE FOLGT DER WAHL: wer einen Typ abwählt, verliert sein Muster.
 * Genau das soll der Prototyp zeigen — der Katalog ist keine Liste, die man
 * vollständig abarbeitet, sondern eine Auswahl mit Folgen.
 */
const selected = ref<string[]>(DK_NAME_TYPES.filter(type => type.preset).map(type => type.id))

function toggleType(id: string): void {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(entry => entry !== id)
    : [...selected.value, id]
}

const patterns = computed(() => DK_NAME_PATTERNS
  .filter(pattern => selected.value.includes(pattern.typeId))
  .map(pattern => ({
    ...pattern,
    typeLabel: DK_NAME_TYPES.find(type => type.id === pattern.typeId)?.label ?? pattern.typeId,
  })))

const patternsConfirmed = ref(false)

/* Die Regeln werden BESTÄTIGT, nicht geschrieben: sie sind vorbefüllt aus den
 * Mustern darüber. Ein Häkchen je Regel statt eines Sammel-Knopfes, weil eine
 * Regel, der jemand widerspricht, hier sichtbar offen bleiben soll. */
const ruleChecks = ref<boolean[]>(DK_NAME_RULES.map(() => false))
const rulesDone = computed(() => ruleChecks.value.filter(Boolean).length)
</script>

<template>
  <FdKitWorkspace chapter="nomenclature">
    <template #hint>{{ DK_NAME_NOTE }}</template>

    <!-- ── m.types ─────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Produkttypen</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">m.types · Mehrfachwahl</span>
      </div>
      <p class="bw-doc-text mt-2">
        Welche Sorten von Dingen bekommen bei euch einen eigenen Namen? Was ihr hier abwählt, bekommt kein Muster — und das ist in Ordnung.
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="type in DK_NAME_TYPES" :key="type.id"
          type="button"
          class="bw-chip"
          :class="selected.includes(type.id) ? 'bw-chip--selected' : ''"
          :aria-pressed="selected.includes(type.id)"
          @click="toggleType(type.id)"
        >{{ type.label }}</button>
      </div>
      <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <p
          v-for="type in DK_NAME_TYPES" :key="`note-${type.id}`"
          class="bw-frame px-4 py-3 text-sm leading-relaxed"
          :style="`background: var(--bw-surface); color: ${selected.includes(type.id) ? 'var(--bw-ink-soft)' : 'var(--bw-muted)'}`"
        >
          <span class="font-medium">{{ type.label }}</span> — {{ type.note }}
        </p>
      </div>
    </section>

    <!-- ── m.patterns ──────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Namensmuster</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">m.patterns · Entwurf von Otto</span>
      </div>
      <p class="bw-doc-text mt-2">
        Je Typ EIN Muster mit einem Beispiel — hergeleitet aus eurem Architektur-Modell, euren Werten und eurem Ton. Kein Sortiment zur Auswahl: ein Muster, das man ändern kann.
      </p>

      <div class="mt-4" :class="patternsConfirmed ? '' : 'bw-draft-frame'">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="bw-label" style="color: var(--bw-muted)">{{ patterns.length }} von {{ DK_NAME_TYPES.length }} Typen gewählt</p>
          <span v-if="patternsConfirmed" class="bw-state bw-state--confirmed"><UIcon name="i-ph-check" /> festgehalten</span>
          <span v-else class="bw-state bw-state--draft"><UIcon name="i-ph-pen-nib" /> Entwurf</span>
        </div>

        <p v-if="!patterns.length" class="bw-pending mt-4">
          Kein Typ gewählt — dann gibt es auch kein Muster. Wählt oben mindestens einen.
        </p>
        <div v-else class="mt-4 flex flex-col gap-3">
          <div
            v-for="pattern in patterns" :key="pattern.typeId"
            class="bw-frame grid gap-x-5 gap-y-2 px-5 py-4 lg:grid-cols-[8rem_minmax(0,1fr)_14rem]"
            style="background: var(--bw-surface)"
          >
            <p class="text-sm font-medium">{{ pattern.typeLabel }}</p>
            <div class="min-w-0">
              <p class="text-sm leading-relaxed">{{ pattern.pattern }}</p>
              <p class="bw-label mt-1" style="color: var(--bw-muted)">Hergeleitet aus {{ pattern.origin }}</p>
            </div>
            <p class="bw-label self-center" style="color: var(--bw-ink)">Beispiel: {{ pattern.example }}</p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <UButton
            label="Das halte ich fest" icon="i-ph-check" class="rounded-full"
            :disabled="!patterns.length" @click="patternsConfirmed = true"
          />
          <UButton
            label="Anders formulieren" icon="i-ph-pencil-simple" color="neutral" variant="outline"
            class="rounded-full" style="background: var(--bw-surface-hi)"
            @click="patternsConfirmed = false"
          />
          <p class="bw-pending">Wer ein Muster ändert, sagt Otto, welche Regel stattdessen gilt — die Liste unten zieht nach.</p>
        </div>
      </div>
    </section>

    <!-- ── m.rules ─────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Regeln bestätigen</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">m.rules · {{ rulesDone }} von {{ DK_NAME_RULES.length }}</span>
      </div>
      <p class="bw-doc-text mt-2">
        Vorbefüllt aus den Mustern. Hakt ab, was gilt — was offen bleibt, steht später als offene Frage im Kapitel und nicht als stille Regel.
      </p>
      <div class="mt-4 flex flex-col gap-2">
        <label
          v-for="(rule, r) in DK_NAME_RULES" :key="rule"
          class="bw-frame flex cursor-pointer items-start gap-3 px-5 py-3.5"
          style="background: var(--bw-surface)"
        >
          <UCheckbox v-model="ruleChecks[r]" class="mt-0.5 flex-none" />
          <span class="min-w-0 flex-1">
            <span class="bw-label me-2 tabular-nums" style="color: var(--bw-muted)">{{ String(r + 1).padStart(2, '0') }}</span>
            <span class="text-sm leading-relaxed">{{ rule }}</span>
          </span>
        </label>
      </div>
      <p class="bw-pending mt-4">
        Der Prüfstein für jeden künftigen Namen: Kann man ihn am Telefon buchstabieren? Wenn nicht, kostet er jeden Tag ein bisschen Geld.
      </p>
    </section>
  </FdKitWorkspace>
</template>
