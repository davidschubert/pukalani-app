<script setup lang="ts">
/**
 * BETREIBER: FREISCHALTUNGEN (Konzept docs/plans/BRAND-BOOK-KIT.md §2.20
 * Nr. 5, Prototyp-Screen 7, Paket K1).
 *
 * ── EINE SEITE, ZWEI SPALTEN (Davids Entscheidung §2.20 Nr. 5) ───────────
 * Sie löst `/dashboard/brand-design` ab (die alte Adresse leitet hierher
 * weiter). Zwei Listen untereinander hätten dieselbe Marke zweimal gezeigt und
 * die Frage „was hat die eigentlich?" nie beantwortet; hier stehen beide
 * Schranken je Marke nebeneinander — Brand Design (Schicht 2) und die
 * Ableitung.
 *
 * ── DIE ZWEITE SPALTE HEISST „ABLEITUNG", NICHT „BOOK & KIT" ─────────────
 * Sie schaltet EIN Feld (`derivationUnlockedAt`), und dieses eine Feld öffnet
 * Brand Book & Kit UND den Marktvergleich (§2.8). Ein Knopf je Produkt hätte
 * zwei Wahrheiten über denselben Zustand erzeugt.
 *
 * ── DER CHIP NENNT IMMER DIE HERKUNFT ───────────────────────────────────
 * Drei Schreiber (Beta-Konto, Betreiber, ab BS1 Z1 der Stripe-Webhook) — „frei"
 * ohne „warum" wäre in einem Streitfall keine Auskunft. `beta` hat dabei KEIN
 * Datum: die Zusage gehört dem Konto, nicht der Marke.
 *
 * ── DER KNOPF IST AUS, SOLANGE DIE FOUNDATION OFFEN IST ─────────────────
 * Beide Schranken setzen das Ergebnis-Kapitel voraus. Eine Freischaltung davor
 * öffnete NICHTS (die Journey sperrt weiter) und stünde hier trotzdem als
 * „freigeschaltet" — eine Lüge in der Betreiber-Liste. Die Routen lehnen
 * denselben Fall mit 409 ab; die Regel steht an beiden Enden, weil eine
 * ausgegraute Schaltfläche keine Durchsetzung ist.
 *
 * ── BESTÄTIGUNG VOR DEM KLICK ───────────────────────────────────────────
 * Freischalten ist eine Zusage an einen Kunden, und Zurücknehmen nimmt ihm ein
 * offenes Produkt mitten aus der Hand. Beides läuft über einen
 * Bestätigungs-Dialog, der sagt, was genau passiert.
 *
 * ── UTable IST GESETZT (Davids Entscheidung B6) ─────────────────────────
 * Sortierung und Paginierung verhalten sich damit überall gleich; der
 * Leerzustand läuft über `CoreEmptyState`.
 */
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type {
  BrandDesignUnlockResponse,
  BrandUnlockItem,
  BrandUnlockListResponse,
  BrandUnlockResponse,
} from '../../../shared/types/brand'

/** Dieselbe Shell und dieselbe Begründung wie /dashboard/waitlist. */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'users.manage',
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('brand.admin.unlocks.title'))

/**
 * EINE Abfrage für beide Spalten: beide Zustände stehen in derselben Zeile
 * (Begründung ausgeschrieben im Kopf der Route).
 */
const { data, refresh, status } = await useFetch<BrandUnlockListResponse>(
  '/api/brand/admin/derivation-unlocks',
  { lazy: true, server: false },
)

const items = computed(() => data.value?.items ?? [])
const readyCount = computed(() => items.value.filter(item => item.foundationDone).length)
const designCount = computed(() => items.value.filter(item => item.designUnlockedAt).length)
const derivationCount = computed(() => items.value.filter(item => item.derivationGrant !== 'none').length)

// ── Aktionen ───────────────────────────────────────────────────────────────

type UnlockColumn = 'design' | 'derivation'
type UnlockAction = 'unlock' | 'lock'

const busy = ref<string | null>(null)
/** Was gerade bestätigt werden soll — `null` heisst: kein Dialog offen. */
const confirming = ref<{ item: BrandUnlockItem, column: UnlockColumn, action: UnlockAction } | null>(null)

/**
 * DIE EREIGNISSE DIESER SITZUNG (Prototyp-Screen 7): jede Handlung
 * hinterlässt eine Zeile in `brand_events` — hier steht dieselbe Aussage
 * sofort sichtbar, damit der Betreiber sieht, was er getan hat, ohne den
 * Funnel zu durchsuchen. Sie überlebt das Neuladen bewusst NICHT: sie ist ein
 * Quittungsstreifen, kein Protokoll (das liegt in der Tabelle).
 */
const sessionEvents = ref<string[]>([])

async function apply(item: BrandUnlockItem, column: UnlockColumn, action: UnlockAction) {
  busy.value = item.id
  try {
    // Beide Antworten tragen die ganze Zeile; die Design-Route ist die
    // schmalere von beiden (sie kennt die Ableitung nicht) — deshalb wird nach
    // JEDER Handlung neu geladen und nicht die Antwort eingesetzt.
    await $fetch<BrandUnlockResponse | BrandDesignUnlockResponse>(
      `/api/brand/admin/profiles/${item.id}/${column}-${action}`,
      { method: 'POST' },
    )
    toast.add({ title: t(`brand.admin.unlocks.done.${column}.${action}`), color: 'success' })
    sessionEvents.value = [
      `${column}.${action === 'unlock' ? 'unlocked' : 'locked'} · ${item.title || t('brand.brands.card.untitled')}`,
      ...sessionEvents.value,
    ]
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
    toast.add({
      title: t('brand.admin.unlocks.actionFailed'),
      description: t(reason === 'foundation_incomplete'
        ? 'brand.admin.unlocks.error.foundation_incomplete'
        : 'brand.admin.unlocks.error.generic'),
      color: 'error',
    })
  }
  finally {
    busy.value = null
    // Nachladen auch im Fehlerfall: bei einem 409 steht die Wahrheit schon in
    // der Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    await refresh()
  }
}

async function confirmAction() {
  const pending = confirming.value
  if (!pending) return
  confirming.value = null
  await apply(pending.item, pending.column, pending.action)
}

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string | null): string {
  if (!value) return ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<BrandUnlockItem>[]>(() => [
  { accessorKey: 'title', header: () => t('brand.admin.unlocks.col.brand') },
  { id: 'foundation', header: () => t('brand.admin.unlocks.col.foundation'), meta: { class: HIDE_MD } },
  { id: 'design', header: () => t('brand.admin.unlocks.col.design') },
  // Kurzer Spaltenkopf (Fable-Sichtbefund am Prototyp 2026-09-09: die lange
  // Fassung lief bei 1440 px aus der Karte). Was die Ableitung umfasst, sagt
  // der Einleitungssatz über der Tabelle.
  { id: 'derivation', header: () => t('brand.admin.unlocks.col.derivation') },
  { accessorKey: 'createdAt', header: () => t('brand.admin.unlocks.col.created'), meta: { class: HIDE_LG } },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

/**
 * Zwei Gruppen im Menü, weil es zwei Produkte sind — und in jeder steht genau
 * die Handlung, die als nächste möglich ist. Ein Beta-Konto sieht trotzdem
 * „freischalten": das FELD gehört der Marke und überlebt einen Widerruf des
 * Beta-Zugangs (Begründung im Kopf der Route).
 */
function rowActions(item: BrandUnlockItem): DropdownMenuItem[][] {
  const design: DropdownMenuItem = item.designUnlockedAt
    ? {
        label: t('brand.admin.unlocks.action.design.lock'),
        icon: 'i-ph-lock-simple',
        onSelect: () => { confirming.value = { item, column: 'design', action: 'lock' } },
      }
    : {
        label: t('brand.admin.unlocks.action.design.unlock'),
        icon: 'i-ph-lock-simple-open',
        disabled: !item.foundationDone,
        onSelect: () => { confirming.value = { item, column: 'design', action: 'unlock' } },
      }
  const derivation: DropdownMenuItem = item.derivationUnlockedAt
    ? {
        label: t('brand.admin.unlocks.action.derivation.lock'),
        icon: 'i-ph-lock-simple',
        onSelect: () => { confirming.value = { item, column: 'derivation', action: 'lock' } },
      }
    : {
        label: t('brand.admin.unlocks.action.derivation.unlock'),
        icon: 'i-ph-lock-simple-open',
        disabled: !item.foundationDone,
        onSelect: () => { confirming.value = { item, column: 'derivation', action: 'unlock' } },
      }
  return [[design], [derivation]]
}
</script>

<template>
  <UDashboardPanel id="brand-unlocks">
    <template #header>
      <UDashboardNavbar :title="t('brand.admin.unlocks.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :aria-label="t('brand.admin.unlocks.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 max-w-3xl text-sm text-muted">{{ t('brand.admin.unlocks.subtitle') }}</p>

      <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-unlock-counts>
        <div class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ items.length }}</p>
          <p class="text-sm text-muted">{{ t('brand.admin.unlocks.counts.all') }}</p>
        </div>
        <div class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ readyCount }}</p>
          <p class="text-sm text-muted">{{ t('brand.admin.unlocks.counts.ready') }}</p>
        </div>
        <div class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ designCount }}</p>
          <p class="text-sm text-muted">{{ t('brand.admin.unlocks.counts.design') }}</p>
        </div>
        <div class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ derivationCount }}</p>
          <p class="text-sm text-muted">{{ t('brand.admin.unlocks.counts.derivation') }}</p>
        </div>
      </div>

      <UTable :data="items" :columns="columns" data-unlock-list>
        <template #title-cell="{ row }">
          <!-- `max-w-[22rem]`: die Marken-Spalte nahm sich sonst die halbe
               Tabelle (Auto-Layout misst den längsten Satz), und die letzte
               Spalte lief aus der Karte (Sichtbefund am Prototyp). -->
          <div class="min-w-0 max-w-[22rem]">
            <p class="font-medium">{{ row.original.title || t('brand.brands.card.untitled') }}</p>
            <p class="text-xs text-muted">
              {{ t(`brand.brands.card.path.${row.original.pathKind}`) }} · {{ row.original.contentLocale }}
            </p>
            <p class="font-mono text-xs text-dimmed">{{ row.original.id }}</p>
          </div>
        </template>

        <template #foundation-cell="{ row }">
          <UBadge
            :color="row.original.foundationDone ? 'success' : 'neutral'"
            variant="subtle" size="sm"
          >
            {{ row.original.foundationDone
              ? t('brand.admin.unlocks.foundation.done')
              : t('brand.admin.unlocks.foundation.open', { pct: row.original.progressPct }) }}
          </UBadge>
        </template>

        <template #design-cell="{ row }">
          <UBadge v-if="row.original.designUnlockedAt" color="primary" variant="subtle" size="sm">
            {{ t('brand.admin.unlocks.state.unlocked', { date: formatDate(row.original.designUnlockedAt) }) }}
          </UBadge>
          <span v-else class="text-sm text-dimmed">{{ t('brand.admin.unlocks.state.locked') }}</span>
        </template>

        <template #derivation-cell="{ row }">
          <!-- Drei Zustände, nicht zwei: „frei mit Datum" (Feld), „frei ohne
               Datum" (Beta-Konto — die Zusage gehört dem Konto) und gesperrt. -->
          <UBadge
            v-if="row.original.derivationUnlockedAt"
            color="primary" variant="subtle" size="sm" class="whitespace-nowrap"
          >
            {{ t('brand.admin.unlocks.state.unlockedVia', {
              date: formatDate(row.original.derivationUnlockedAt),
              via: t(`brand.admin.unlocks.grant.${row.original.derivationGrant}`),
            }) }}
          </UBadge>
          <UBadge
            v-else-if="row.original.derivationGrant === 'beta'"
            color="neutral" variant="subtle" size="sm" class="whitespace-nowrap"
          >
            {{ t('brand.admin.unlocks.state.beta') }}
          </UBadge>
          <span v-else class="text-sm text-dimmed">{{ t('brand.admin.unlocks.state.locked') }}</span>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-dimmed">{{ formatDate(row.original.createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('brand.admin.unlocks.rowActions')"
                :loading="busy === row.original.id"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-lock-simple-open"
            :title="t('brand.admin.unlocks.emptyTitle')"
            :description="t('brand.admin.unlocks.empty')"
            data-unlock-empty
          />
        </template>
      </UTable>

      <div v-if="sessionEvents.length" class="mt-6 rounded-xl border border-default p-4" data-unlock-events>
        <p class="text-sm font-medium">{{ t('brand.admin.unlocks.events') }}</p>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="entry in sessionEvents" :key="entry" class="font-mono text-xs text-muted">{{ entry }}</li>
        </ul>
      </div>

      <!-- Bestätigung: der Satz nennt die Marke und was genau passiert (s. Kopf). -->
      <UModal
        :open="Boolean(confirming)"
        :title="confirming ? t(`brand.admin.unlocks.confirm.${confirming.column}.${confirming.action}.title`) : ''"
        @update:open="(open) => { if (!open) confirming = null }"
      >
        <template #body>
          <p v-if="confirming" class="text-sm">
            {{ t(`brand.admin.unlocks.confirm.${confirming.column}.${confirming.action}.body`, {
              brand: confirming.item.title || t('brand.brands.card.untitled'),
            }) }}
          </p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="confirming = null" />
            <UButton
              v-if="confirming"
              :color="confirming.action === 'lock' ? 'warning' : 'primary'"
              :label="t(`brand.admin.unlocks.confirm.${confirming.column}.${confirming.action}.action`)"
              data-unlock-confirm
              @click="confirmAction()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
