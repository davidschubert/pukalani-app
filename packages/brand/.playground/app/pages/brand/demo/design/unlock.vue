<script setup lang="ts">
import { DS_UNLOCK_ROWS } from '../../../../utils/demoDesign'

/**
 * BETREIBER-AUSSCHNITT „BRAND DESIGN FREISCHALTEN" (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.10, Prototyp-Screen 8, zweite Hälfte).
 *
 * Das Geschäftsmodell der ersten Fassung ist STUDIO-BEGLEITET (§1.11 d): kein
 * Stripe, kein Preis, keine Selbstbedienung. Freigeschaltet wird je Marke
 * durch den Betreiber nach dem Erstgespräch — und weil das eine Handlung mit
 * Folgen ist, hinterlässt sie eine Ereignis-Zeile (`design.unlocked`), nicht
 * nur einen anderen Knopf.
 *
 * Der Dummy zeigt bewusst DREI Zeilen mit drei Zuständen: eine offene
 * Foundation (nicht freischaltbar — Schicht 2 setzt das Ergebnis-Kapitel
 * voraus), eine fertige ohne Freischaltung und eine bereits freigeschaltete.
 */
const rows = ref(DS_UNLOCK_ROWS.map(row => ({ ...row })))

function unlock(id: string): void {
  const row = rows.value.find(entry => entry.id === id)
  if (!row) return
  row.unlocked = true
  row.event = 'design.unlocked · von P6 · 7. Sept. 2026'
}

function foundationDone(row: { foundation: string }): boolean {
  return row.foundation.startsWith('Foundation abgeschlossen')
}

useHead({ title: 'Betreiber · Brand Design freischalten' })
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-16">
    <BwSiteNav />
    <div class="mx-auto max-w-4xl">
      <!-- BK1 (docs/plans/BRAND-BOOK-KIT.md §2.20 Nr. 5): diese Seite wird zu
           `/dashboard/brand-unlocks` mit ZWEI Spalten je Marke. Der Zeiger
           steht hier oben, damit niemand die alte Fassung für die aktuelle
           hält — im Produkt leitet die alte Route weiter. -->
      <div class="bw-frame mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4" style="background: var(--bw-surface)">
        <UIcon name="i-ph-arrow-bend-up-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
        <p class="min-w-0 flex-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Diese Seite wird mit Book &amp; Kit zu „Freischaltungen" — eine Tabelle mit zwei Spalten je Marke: Brand Design und Ableitung.
        </p>
        <NuxtLink to="/brand/demo/kit/unlock" class="bw-label underline underline-offset-4" style="color: var(--bw-ink)">Zur neuen Seite</NuxtLink>
      </div>

      <div class="mb-8">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Betreiber-Konsole · Ausschnitt</p>
        <h1 class="mt-1 text-2xl font-semibold">Brandings</h1>
        <p class="mt-1 text-sm" style="color: var(--bw-muted)">
          Brand Design ist studio-begleitet: eine Marke bekommt Schicht 2, wenn das Erstgespräch gelaufen ist. Capability <span class="bw-label">brand.manage</span>.
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <div
          v-for="row in rows" :key="row.id"
          class="bw-card grid items-center gap-x-5 gap-y-3 p-6 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div class="min-w-0">
            <p class="text-base font-medium">{{ row.title }}</p>
            <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ row.path }} · {{ row.foundation }}</p>
            <p v-if="row.event" class="bw-label mt-2" style="color: var(--bw-accent)">{{ row.event }}</p>
            <p v-else-if="!foundationDone(row)" class="bw-label mt-2" style="color: var(--bw-muted)">
              Noch nicht freischaltbar — Schicht 2 öffnet erst nach dem Foundation-Ergebnis.
            </p>
          </div>
          <div class="flex flex-none flex-wrap items-center gap-2 sm:justify-end">
            <span v-if="row.unlocked" class="bw-state bw-state--confirmed">
              <UIcon name="i-ph-check" /> freigeschaltet
            </span>
            <UButton
              v-else label="Brand Design freischalten"
              color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
              icon="i-ph-lock-simple-open" :disabled="!foundationDone(row)"
              @click="unlock(row.id)"
            />
            <UButton
              v-if="row.unlocked" to="/brand/demo/design/dna" label="Werkstatt öffnen"
              color="neutral" variant="ghost" class="rounded-full" trailing-icon="i-ph-arrow-right"
            />
          </div>
        </div>
      </div>

      <div class="bw-card mt-8 p-6">
        <p class="text-sm font-medium">Die drei Zustände im Rail (Screen 8)</p>
        <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Vor der Freischaltung bleibt der Layer „Brand Design" gesperrt und Kapitel 10 der Foundation zeigt die Schranke. Danach steht dort der Einstieg; nach den sechs Kapiteln ist das Kapitel voll.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton to="/brand/demo/foundation?design=locked" label="Kapitel 10: gesperrt" color="neutral" variant="ghost" class="rounded-full" />
          <UButton to="/brand/demo/foundation?design=unlocked" label="Kapitel 10: freigeschaltet" color="neutral" variant="ghost" class="rounded-full" />
          <UButton to="/brand/demo/foundation?design=done" label="Kapitel 10: voll" color="neutral" variant="ghost" class="rounded-full" />
        </div>
      </div>

      <BwSiteFooter />
    </div>
  </div>
</template>
