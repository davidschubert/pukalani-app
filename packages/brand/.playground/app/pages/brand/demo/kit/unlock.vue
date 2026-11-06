<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DkGrant, DkUnlockRow } from '../../../../utils/demoKit'
import { DK_GRANT_LABEL, DK_UNLOCK_ROWS } from '../../../../utils/demoKit'

/**
 * BETREIBER-AUSSCHNITT „FREISCHALTUNGEN" (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7/§2.8, Entscheidung §2.20 Nr. 5:
 * `/dashboard/brand-design` wird `/dashboard/brand-unlocks` mit ZWEI Spalten;
 * die alte Route leitet weiter). Prototyp-Screen 7, zweite Hälfte.
 *
 * EINE TABELLE STATT ZWEIER SEITEN — und genau EINE Tabelle im Sinne der
 * B6-Regel (`UTable`): Sortierung, Auswahl und Paginierung kommen
 * mitgeliefert, und die Betreiberin sieht je Marke beide Schranken
 * nebeneinander. Zwei Listen untereinander hätten dieselbe Marke zweimal
 * gezeigt und die Frage „was hat die eigentlich?" nie beantwortet.
 *
 * DIE ZWEITE SPALTE HEISST „ABLEITUNG", NICHT „BOOK & KIT" (§2.8): sie
 * schaltet EIN Feld (`derivationUnlockedAt`), und dieses eine Feld öffnet
 * Book & Kit UND den Marktvergleich. Ein Knopf je Produkt hätte zwei Wahrheiten
 * über denselben Zustand erzeugt.
 *
 * DREI SCHREIBER, EINE REGEL (§2.8): Beta (das Konto hat `brand_access`,
 * dauerhaft frei), Betreiber (dieser Knopf) und später der Stripe-Webhook
 * (`via: 'purchase'`). Der Chip nennt deshalb IMMER die Herkunft — „frei" ohne
 * „warum" wäre in einem Streitfall keine Auskunft.
 *
 * WARUM EINE BESTÄTIGUNG (UModal): Freischalten ist eine Handlung mit Folgen
 * (Zeilen werden angelegt, ein Produkt wird sichtbar) und hinterlässt eine
 * Ereignis-Zeile — nicht nur einen anderen Knopf.
 */
const rows = ref<DkUnlockRow[]>(DK_UNLOCK_ROWS.map(row => ({
  ...row,
  design: { ...row.design },
  derivation: { ...row.derivation },
})))

const events = ref<string[]>([])

type UnlockColumn = 'design' | 'derivation'

const COLUMN_LABEL: Record<UnlockColumn, string> = {
  design: 'Brand Design',
  /* Kurz, weil es ein Spaltenkopf ist (Fable-Sichtbefund 2026-09-09: die lange
   * Fassung lief bei 1440 px aus der Karte). Was die Ableitung umfasst, sagt
   * der Einleitungssatz über der Tabelle. */
  derivation: 'Ableitung',
}

const confirmOpen = ref(false)
const pending = ref<{ id: string, column: UnlockColumn } | null>(null)

const pendingRow = computed(() => rows.value.find(row => row.id === pending.value?.id) ?? null)

function ask(id: string, column: UnlockColumn): void {
  pending.value = { id, column }
  confirmOpen.value = true
}

const TODAY = '9. September 2026'

function confirmUnlock(): void {
  const target = pending.value
  if (!target) return
  const row = rows.value.find(entry => entry.id === target.id)
  if (row) {
    row[target.column] = { unlocked: true, since: TODAY, via: 'operator' satisfies DkGrant }
    events.value = [
      `${target.column === 'design' ? 'design' : 'derivation'}.unlocked · ${row.title} · von P6 · ${TODAY}`,
      ...events.value,
    ]
  }
  confirmOpen.value = false
  pending.value = null
}

const columns: TableColumn<DkUnlockRow>[] = [
  { id: 'brand', header: 'Marke' },
  { id: 'design', header: COLUMN_LABEL.design },
  { id: 'derivation', header: COLUMN_LABEL.derivation },
]

function grantLabel(via: DkGrant | undefined): string {
  return via ? DK_GRANT_LABEL[via] : ''
}

useHead({ title: 'Betreiber · Freischaltungen' })
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-16">
    <BwSiteNav />
    <div class="mx-auto max-w-6xl">
      <div class="mb-8">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Betreiber-Konsole · Ausschnitt</p>
        <h1 class="mt-1 text-2xl font-semibold">Freischaltungen</h1>
        <p class="mt-1 max-w-3xl text-sm" style="color: var(--bw-muted)">
          Route <span class="bw-label">/dashboard/brand-unlocks</span> · Capability <span class="bw-label">users.manage</span>. Zwei Schranken je Marke: Brand Design (Schicht 2) und die Ableitung — ein Feld, das Book &amp; Kit und den Marktvergleich zugleich öffnet. Die alte Route <span class="bw-label">/dashboard/brand-design</span> leitet hierher weiter.
        </p>
      </div>

      <div class="bw-card p-2">
        <UTable :data="rows" :columns="columns" class="overflow-x-auto">
          <template #brand-cell="{ row }">
            <!-- `max-w-[22rem]`: die Marken-Spalte nahm sich sonst die halbe
                 Tabelle (Auto-Layout misst den längsten Satz), und die dritte
                 Spalte lief aus der Karte (Sichtbefund 2026-09-09). -->
            <div class="max-w-[22rem] min-w-0 py-1 whitespace-normal">
              <p class="text-sm font-medium">{{ row.original.title }}</p>
              <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ row.original.path }} · {{ row.original.foundation }}</p>
              <p v-if="!row.original.foundationDone" class="bw-label mt-1.5" style="color: var(--bw-muted)">
                Noch nicht freischaltbar — beides setzt das Foundation-Ergebnis voraus.
              </p>
            </div>
          </template>

          <template #design-cell="{ row }">
            <div class="flex flex-wrap items-center gap-2 py-1">
              <span v-if="row.original.design.unlocked" class="bw-state bw-state--confirmed">
                <UIcon name="i-ph-check" /> Frei seit {{ row.original.design.since }} · {{ grantLabel(row.original.design.via) }}
              </span>
              <UButton
                v-else
                size="xs" label="Freischalten" color="neutral" variant="outline"
                class="rounded-full" style="background: var(--bw-surface-hi)"
                icon="i-ph-lock-simple-open" :disabled="!row.original.foundationDone"
                @click="ask(row.original.id, 'design')"
              />
            </div>
          </template>

          <template #derivation-cell="{ row }">
            <div class="flex flex-wrap items-center gap-2 py-1">
              <span v-if="row.original.derivation.unlocked" class="bw-state bw-state--confirmed">
                <UIcon name="i-ph-check" /> Frei seit {{ row.original.derivation.since }} · {{ grantLabel(row.original.derivation.via) }}
              </span>
              <UButton
                v-else
                size="xs" label="Freischalten" color="neutral" variant="outline"
                class="rounded-full" style="background: var(--bw-surface-hi)"
                icon="i-ph-lock-simple-open" :disabled="!row.original.foundationDone"
                @click="ask(row.original.id, 'derivation')"
              />
              <UButton
                v-if="row.original.derivation.unlocked"
                size="xs" to="/brand/demo/kit/nomenclature" label="Werkstatt öffnen"
                color="neutral" variant="ghost" class="rounded-full" trailing-icon="i-ph-arrow-right"
              />
            </div>
          </template>
        </UTable>
      </div>

      <div v-if="events.length" class="bw-card mt-6 p-6">
        <p class="text-sm font-medium">Ereignisse dieser Sitzung</p>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="event in events" :key="event" class="bw-label" style="color: var(--bw-accent)">{{ event }}</li>
        </ul>
      </div>

      <div class="bw-card mt-8 p-6">
        <p class="text-sm font-medium">Was die Freischaltung öffnet</p>
        <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Vor der Freischaltung ist Schicht 3 nicht auf dem Weg (Grund <span class="bw-label">derivation_locked</span>) — sie ist nicht gesperrt, sonst zählten ihre Kapitel im Fortschritt mit. Die Freischaltung legt die drei Kapitel-Zeilen an; danach steht die Lieferseite bereit und das Brand Book bekommt seine Regel-Kapitel.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton to="/brand/demo/foundation?design=done" label="Brand Book: ohne Ableitung" color="neutral" variant="ghost" class="rounded-full" />
          <UButton to="/brand/demo/foundation?design=done&kit=done" label="Brand Book: mit Ableitung" color="neutral" variant="ghost" class="rounded-full" />
          <UButton to="/brand/demo/kit" label="Lieferseite" color="neutral" variant="ghost" class="rounded-full" />
          <UButton to="/brand/demo/design/unlock" label="Alte Seite (Brand Design)" color="neutral" variant="ghost" class="rounded-full" />
        </div>
      </div>

      <BwSiteFooter />
    </div>

    <UModal v-model:open="confirmOpen">
      <template #content>
        <div class="bw-root p-8" style="background: var(--bw-surface-hi)">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Bestätigen</p>
          <h2 class="mt-1 text-[26px] font-extralight leading-tight tracking-tight">
            {{ pending ? COLUMN_LABEL[pending.column] : '' }} freischalten
          </h2>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Für <span class="font-medium">{{ pendingRow?.title }}</span>. Die Marke sieht die Schicht danach sofort; die Kapitel-Zeilen werden angelegt, und die Handlung hinterlässt eine Ereignis-Zeile mit eurem Namen.
          </p>
          <p v-if="pending?.column === 'derivation'" class="bw-pending mt-4">
            Die Ableitung öffnet Book &amp; Kit UND den Marktvergleich — es ist ein Feld, nicht zwei.
          </p>
          <div class="mt-6 flex flex-wrap items-center gap-2">
            <UButton label="Freischalten" icon="i-ph-lock-simple-open" class="rounded-full" @click="confirmUnlock" />
            <UButton label="Abbrechen" color="neutral" variant="ghost" @click="confirmOpen = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
