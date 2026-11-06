<script setup lang="ts">
import type { DkContactSource } from '../../../../utils/demoKit'
import { DK_CONTACT_PUBLIC_NOTE, DK_CONTACT_SOURCES, DK_FACTS, DK_MARK_FILES, demoBoilerplates } from '../../../../utils/demoKit'
import { demoFoundation } from '../../../../utils/demoFoundation'

/**
 * KAPITEL „PRESSEKIT" (Konzept docs/plans/BRAND-BOOK-KIT.md §2.4,
 * Prototyp-Screen 6) — George ist hier Gastgeber und liefert aus.
 *
 * DREI SESSIONS, und nur zwei davon fragen etwas:
 *   p.facts    → welche Fakten aus dem Kontext REISEN dürfen (Chips, Opt-in,
 *                Voreinstellung: KEINER)
 *   p.contact  → die Ansprechperson, mit drei Vorlagen-Karten (§2.20 Nr. 3)
 *   p.summary  → die Vorschau, nur lesen
 *
 * DIE VOREINSTELLUNG IST DIE AUSSAGE: `a.facts` ist `internal` und bleibt es.
 * Was ins Pressekit kommt, ist eine bewusste AUSWAHL daraus — deshalb ist
 * anfangs nichts gewählt, und deshalb wird die Auswahl als eigener Wert
 * gespeichert statt die Rohliste durchzureichen (§2.12 Nr. 2).
 *
 * DIE KONTAKT-KARTEN FÜLLEN NUR VOR (§2.20 Nr. 3, Davids Leitplanke):
 * gespeichert wird immer der bestätigte TEXT, nie ein Verweis auf Konto- oder
 * Anfrage-Daten. Sonst änderte eine spätere Änderung am Konto das Pressekit
 * still mit. Der Satz „reist öffentlich" steht VOR der Abnahme.
 */

/* Voreinstellung: keiner gewählt — das ist die Regel, nicht die Bequemlichkeit. */
const releasedIds = ref<string[]>([])

function toggleFact(id: string): void {
  releasedIds.value = releasedIds.value.includes(id)
    ? releasedIds.value.filter(entry => entry !== id)
    : [...releasedIds.value, id]
}

const releasedFacts = computed(() => DK_FACTS.filter(fact => releasedIds.value.includes(fact.id)))

const contactSourceId = ref<DkContactSource['id'] | null>(null)
const contactName = ref('')
const contactRole = ref('')
const contactEmail = ref('')

function pickContact(source: DkContactSource): void {
  contactSourceId.value = source.id
  contactName.value = source.name
  contactRole.value = source.role
  contactEmail.value = source.email
}

const contactFilled = computed(() => contactName.value.trim().length > 0 && contactEmail.value.trim().length > 0)

const boilerplates = demoBoilerplates()
/* Die Zeichen im Pressekit kommen aus dem Preset — hier nur die hellen
 * Varianten: ein Pressekit zeigt das Zeichen, es erklärt es nicht. */
const marks = DK_MARK_FILES.filter(mark => mark.variant === 'light')
</script>

<template>
  <FdKitWorkspace chapter="presskit">
    <template #hint>
      Hier entsteht nichts Neues. Zwei Dinge muss trotzdem ein Mensch sagen: welche Fakten reisen dürfen und wer für Presse ansprechbar ist.
    </template>

    <!-- ── p.facts ─────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Fakten freigeben</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">p.facts · {{ releasedIds.length }} von {{ DK_FACTS.length }}</span>
      </div>
      <p class="bw-doc-text mt-2">
        Diese Fakten reisen sonst nie — wähle, was ins Pressekit darf. Sie stehen in eurem Kontext und sind bis hierher intern geblieben; das ändert sich nur für das, was ihr hier anhakt.
      </p>
      <div class="mt-4 flex flex-col gap-2">
        <div
          v-for="fact in DK_FACTS" :key="fact.id"
          class="bw-frame grid items-start gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
          style="background: var(--bw-surface)"
        >
          <div class="min-w-0">
            <p class="text-sm leading-relaxed">{{ fact.text }}</p>
            <p v-if="fact.reason" class="bw-label mt-1" style="color: var(--bw-muted)">{{ fact.reason }}</p>
          </div>
          <!-- Der Umschalter ist ein Chip, kein Knopf in einer Karte: verschachtelte
               Knöpfe sind kein gültiges HTML (BD1-Lehre). -->
          <button
            type="button"
            class="bw-chip flex-none sm:justify-self-end"
            :class="releasedIds.includes(fact.id) ? 'bw-chip--selected' : ''"
            :aria-pressed="releasedIds.includes(fact.id)"
            @click="toggleFact(fact.id)"
          >{{ releasedIds.includes(fact.id) ? 'reist im Pressekit' : 'ins Pressekit' }}</button>
        </div>
      </div>
      <p class="bw-pending mt-4">
        Die Auswahl wird als eigener Wert gespeichert. Die Rohliste aus eurem Kontext reist weiterhin nirgendwohin — weder in den geteilten Link noch in brand.md.
      </p>
    </section>

    <!-- ── p.contact ───────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Presse-Kontakt</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">p.contact · optional</span>
      </div>
      <p class="bw-doc-text mt-2">
        Wen soll eine Journalistin anrufen? Wählt eine Vorlage — sie füllt die Felder nur vor. Gespeichert wird, was danach in den Feldern steht.
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          v-for="source in DK_CONTACT_SOURCES" :key="source.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="contactSourceId === source.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="contactSourceId === source.id"
          @click="pickContact(source)"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium">{{ source.label }}</span>
            <UIcon v-if="contactSourceId === source.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ source.note }}</span>
          <span v-if="source.name" class="bw-label mt-2 block" style="color: var(--bw-muted)">
            {{ source.name }} · {{ source.email }}<template v-if="source.phone"> · {{ source.phone }}</template>
          </span>
        </button>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <UFormField label="Name">
          <UInput v-model="contactName" placeholder="Vor- und Nachname" class="w-full" />
        </UFormField>
        <UFormField label="Rolle">
          <UInput v-model="contactRole" placeholder="Inhaberin, Pressestelle …" class="w-full" />
        </UFormField>
        <UFormField label="E-Mail">
          <UInput v-model="contactEmail" type="email" placeholder="presse@beispiel.de" class="w-full" />
        </UFormField>
      </div>

      <p class="mt-4 flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        <UIcon name="i-ph-globe-hemisphere-west" class="mt-0.5 size-4 flex-none" style="color: var(--bw-draft)" />
        <span class="min-w-0">{{ DK_CONTACT_PUBLIC_NOTE }}</span>
      </p>
    </section>

    <!-- ── p.summary ───────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Vorschau</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">p.summary · Ableitung, nur lesen</span>
      </div>
      <p class="bw-doc-text mt-2">
        So sieht euer Pressekit aus. Keine KI, keine gespeicherte Fassung — es wird bei jedem Blick neu zusammengestellt.
      </p>

      <div class="bw-card mt-4 p-7">
        <p class="text-xl font-extralight leading-snug tracking-tight">{{ demoFoundation.brand.title }}</p>
        <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ demoFoundation.brand.tagline }}</p>

        <div class="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p class="bw-label" style="color: var(--bw-muted)">Boilerplates</p>
            <div class="mt-2 flex flex-col gap-2">
              <div v-for="entry in boilerplates" :key="entry.title" class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)">
                <p class="text-sm font-medium">{{ entry.title }}</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.text }}</p>
              </div>
            </div>
          </div>

          <div>
            <p class="bw-label" style="color: var(--bw-muted)">Zeichen</p>
            <div class="mt-2 grid grid-cols-2 gap-3">
              <FdKitMark v-for="mark in marks" :key="mark.file" :mark="mark" />
            </div>

            <p class="bw-label mt-5" style="color: var(--bw-muted)">Fakten</p>
            <ul v-if="releasedFacts.length" class="mt-2 flex flex-col gap-1.5">
              <li v-for="fact in releasedFacts" :key="fact.id" class="flex items-start gap-2.5 text-sm leading-relaxed">
                <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
                <span class="min-w-0">{{ fact.text }}</span>
              </li>
            </ul>
            <p v-else class="bw-pending mt-2">Noch kein Fakt freigegeben — das Pressekit trägt dann nur Tagline, Boilerplates und Zeichen.</p>

            <p class="bw-label mt-5" style="color: var(--bw-muted)">Presse-Kontakt</p>
            <template v-if="contactFilled">
              <p class="mt-1.5 text-sm">{{ contactName }}</p>
              <p class="text-sm" style="color: var(--bw-ink-soft)">
                <template v-if="contactRole">{{ contactRole }} · </template>{{ contactEmail }}
              </p>
            </template>
            <p v-else class="bw-pending mt-2">Noch keine Ansprechperson — das Feld ist optional, das Pressekit steht auch ohne sie.</p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UButton to="/brand/demo/kit" label="Im Kit ansehen" trailing-icon="i-ph-arrow-right" class="rounded-full" />
        <p class="bw-pending">Dieselbe Zusammenstellung steht als Kachel „Pressekit" auf der Lieferseite und als Kapitel im Brand Book.</p>
      </div>
    </section>
  </FdKitWorkspace>
</template>
