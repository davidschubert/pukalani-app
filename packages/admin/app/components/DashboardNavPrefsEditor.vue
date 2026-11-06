<script setup lang="ts">
/**
 * DIE REIHENFOLGE DER DASHBOARD-NAVIGATION ZUSAMMENSTELLEN (NAV1 Paket 3,
 * Entscheidung 3 vom 2026-09-08 — docs/plans/DASHBOARD-NAV-JE-PERSON.md).
 *
 * ── WARUM EINE KONTO-SEITE UND KEIN „ANPASSEN"-MODUS IN DER LEISTE ────────
 * Die Seitenleiste ist einklappbar, auf Mobil ein Slideover und trägt
 * Tooltips/Popover — ein Bearbeitungsmodus dort müsste drei Darstellungen
 * beherrschen. Die Konto-Seite ist EINE Fläche, und sie ist das Muster, das
 * die Site-Navigation schon hat (packages/pages/app/pages/dashboard/community/
 * navigation.vue: Griff, Ziehen, Pfeile, Auge, Zurücksetzen).
 *
 * ── DIE ANGEBOTENE LISTE IST DIE DER SEITENLEISTE ─────────────────────────
 * Beide lesen `useDashboardNavModules()` — Ort × Rolle × drei Produkt-Gates,
 * EINMAL gerechnet. Böte der Editor eine andere Liste an, verspräche er
 * Einträge, die nie erscheinen; genau das ist zwischen Layout und Editor der
 * Site-Navigation schon einmal auseinandergelaufen. Was auf einer ANDEREN
 * Site dazukommt (anderer Ort, andere Rolle), hängt dort hinten an (Zusage 3)
 * und wird dort sortiert — die gespeicherten Ids bleiben unangetastet, weil
 * `applyDashboardNavPrefs` unbekannte still ignoriert (Zusage 2).
 *
 * ── ZWEI DINGE, DIE MAN NICHT „AUFRÄUMEN" DARF ────────────────────────────
 *
 * (1) **AUSGEBLENDETE EINTRÄGE BLEIBEN HIER SICHTBAR** (gedimmt, Auge
 *     durchgestrichen). Gerechnet wird die Reihenfolge deshalb OHNE `hidden`
 *     und die Ausblendung nur als Markierung geführt. Würde der Editor eine
 *     ausgeblendete Zeile weglassen, gäbe es keinen Weg zurück außer
 *     „Zurücksetzen" — und das würfe auch die ganze Reihenfolge weg.
 * (2) **KEIN VERSCHIEBEN ZWISCHEN GRUPPEN.** Gruppen sind Ebenen
 *     (Betreiber/Konto/Community), kein Sortierspielraum; `items` gilt
 *     ausdrücklich nur innerhalb der eigenen Gruppe. Das Ziehen nimmt deshalb
 *     nur Ziele derselben Gruppe an, statt die Bewegung hinterher stumm
 *     zurechtzubiegen.
 */
import type { DashboardNavGroup, DashboardNavPrefs } from '../../../core/shared/dashboardNav'
import { applyDashboardNavPrefs, parseDashboardNavPrefs } from '../../../core/shared/dashboardNav'
import type { DashboardNavResponse } from '../../../core/shared/types/auth-responses'

const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const localePath = useLocalePath()

/** Dieselbe gefilterte Modul-Liste, die die Seitenleiste rendert. */
const { navModules } = useDashboardNavModules()

/** Eine Zeile im Editor. `hidden` ist eine Markierung, kein Wegfall (s. Kopf). */
interface EditorRow {
  id: string
  label: string
  icon: string
  to: string
  hidden: boolean
}

/** Ein Block: die Gruppe (oder `null` für „ohne Gruppe") und ihre Zeilen. */
interface EditorBlock {
  group: DashboardNavGroup | null
  rows: EditorRow[]
}

const blocks = ref<EditorBlock[]>([])
const saving = ref(false)
/** Gezogen wird innerhalb EINES Blocks — beide Angaben gehören zusammen. */
const dragging = ref<{ group: DashboardNavGroup | null, index: number } | null>(null)

const savedPrefs = computed(() => parseDashboardNavPrefs(auth.user?.prefs?.dashboardNav))

/**
 * Gespeicherte Wahl + Angebot ⇒ Editor-Blöcke.
 *
 * Die Reihenfolge kommt aus DERSELBEN Regel wie die Seitenleiste, nur OHNE
 * `hidden` — sonst fielen genau die Zeilen heraus, die man hier wieder
 * einschalten können soll. Die Ausblendung wandert stattdessen als Markierung
 * an die Zeile.
 */
function buildBlocks(): EditorBlock[] {
  const prefs = savedPrefs.value
  const hidden = new Set(prefs?.hidden ?? [])
  const layout = applyDashboardNavPrefs(navModules.value, {
    groups: prefs?.groups,
    items: prefs?.items,
  })
  const toRow = (m: PukalaniAdminModule): EditorRow => ({
    id: m.id,
    label: t(m.labelKey),
    icon: m.icon,
    to: m.to,
    hidden: hidden.has(m.id),
  })
  const out: EditorBlock[] = []
  if (layout.ungrouped.length) out.push({ group: null, rows: layout.ungrouped.map(toRow) })
  for (const group of layout.groups) out.push({ group: group.group, rows: group.modules.map(toRow) })
  return out
}

// `immediate` + Watcher statt einmaliger Zuweisung: `navModules` hängt an den
// Laufzeit-Gates (ein abgeschaltetes Produkt kommt live über den Config-Kanal),
// und nach dem Speichern zieht `auth.user` nach. Beides soll die Fläche sehen.
watch([navModules, savedPrefs], () => { blocks.value = buildBlocks() }, { immediate: true })

const isEmpty = computed(() => !blocks.value.some(block => block.rows.length))

const groupLabel = (group: DashboardNavGroup | null) =>
  group ? t(`admin.nav.groups.${group}`) : t('dashboard.navPrefs.ungrouped')

// ── Gruppen verschieben ───────────────────────────────────────────────────

/** Der Block „ohne Gruppe" steht fest oben (Zusage 6) — er hat keine Pfeile. */
const groupBlocks = computed(() => blocks.value.filter(block => block.group !== null))

function canMoveGroup(block: EditorBlock, delta: number): boolean {
  if (block.group === null) return false
  const list = groupBlocks.value
  const index = list.indexOf(block) + delta
  return index >= 0 && index < list.length
}

function moveGroup(block: EditorBlock, delta: number) {
  if (!canMoveGroup(block, delta)) return
  const list = [...blocks.value]
  const target = groupBlocks.value[groupBlocks.value.indexOf(block) + delta]
  if (!target) return
  const from = list.indexOf(block)
  list.splice(from, 1)
  list.splice(list.indexOf(target) + (delta < 0 ? 0 : 1), 0, block)
  blocks.value = list
}

// ── Einträge verschieben (nur innerhalb ihrer Gruppe) ─────────────────────

function canMoveRow(block: EditorBlock, index: number, delta: number): boolean {
  const next = index + delta
  return next >= 0 && next < block.rows.length
}

function moveRow(block: EditorBlock, index: number, delta: number) {
  if (!canMoveRow(block, index, delta)) return
  const rows = [...block.rows]
  const [row] = rows.splice(index, 1)
  if (!row) return
  rows.splice(index + delta, 0, row)
  block.rows = rows
}

// ── Ziehen — und zwar NUR innerhalb desselben Blocks (s. Kopf, (2)) ───────

function onDragStart(block: EditorBlock, index: number) {
  dragging.value = { group: block.group, index }
}

function onDragOver(block: EditorBlock, index: number) {
  const from = dragging.value
  // Fremde Gruppe: die Bewegung passiert einfach nicht. Lieber gar nichts als
  // eine Ebenen-Änderung, die niemand angefordert hat.
  if (!from || from.group !== block.group || from.index === index) return
  const rows = [...block.rows]
  const [row] = rows.splice(from.index, 1)
  if (!row) return
  rows.splice(index, 0, row)
  block.rows = rows
  dragging.value = { group: block.group, index }
}

function onDragEnd() {
  dragging.value = null
}

const isDragging = (block: EditorBlock, index: number) =>
  dragging.value?.group === block.group && dragging.value?.index === index

// ── Speichern und Zurücksetzen ────────────────────────────────────────────

/**
 * Was gespeichert würde. LEERE LISTEN BLEIBEN WEG: `groups: []` sagt nichts
 * anderes als „kein Feld", würde aber für immer im Prefs-Dokument stehen.
 * `items` trägt ALLE Einträge über alle Gruppen — die Reihenfolge innerhalb
 * einer Gruppe ist die Reihenfolge ihrer Mitglieder in dieser einen Liste.
 */
const draft = computed<DashboardNavPrefs>(() => {
  const groups = blocks.value.map(block => block.group).filter((g): g is DashboardNavGroup => g !== null)
  const items = blocks.value.flatMap(block => block.rows.map(row => row.id))
  const hidden = blocks.value.flatMap(block => block.rows.filter(row => row.hidden).map(row => row.id))
  const body: DashboardNavPrefs = {}
  if (groups.length) body.groups = groups
  if (items.length) body.items = items
  if (hidden.length) body.hidden = hidden
  return body
})

async function persist(body: DashboardNavPrefs, successKey: string) {
  saving.value = true
  try {
    await $fetch<DashboardNavResponse>('/api/auth/dashboard-nav', { method: 'PUT', body })
    // Prefs neu ziehen — die Seitenleiste zieht damit ohne Reload mit.
    await auth.refresh()
    toast.add({ title: t(successKey), color: 'success' })
  }
  catch {
    toast.add({ title: t('dashboard.navPrefs.saveFailed'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

const save = () => persist(draft.value, 'dashboard.navPrefs.saved')

/**
 * Zurücksetzen schickt ein LEERES Dokument `{}` — die Route macht daraus
 * `null` und ENTFERNT den Schlüssel aus den Prefs (server/api/auth/
 * dashboard-nav.put.ts). Nicht `null` selbst: ofetch lässt einen `null`-Body
 * GANZ weg, die Route sähe „kein Body" und antwortete 400 (Klick-Beweis
 * 2026-09-08). Der Watcher oben baut die Blöcke danach aus `auth.user` neu
 * auf, also steht die Standard-Reihenfolge ohne weiteres Zutun wieder da.
 */
const resetAll = () => persist({}, 'dashboard.navPrefs.resetDone')
</script>

<template>
  <UCard data-nav-prefs-editor>
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold">{{ t('dashboard.navPrefs.title') }}</h2>
          <p class="mt-1 text-sm text-muted">{{ t('dashboard.navPrefs.description') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('dashboard.navPrefs.searchHint') }}</p>
        </div>
        <UButton
          :loading="saving"
          icon="i-ph-floppy-disk"
          data-testid="nav-prefs-save"
          @click="save"
        >
          {{ t('ui.save') }}
        </UButton>
      </div>
    </template>

    <CoreEmptyState
      v-if="isEmpty"
      icon="i-ph-list-dashes"
      :title="t('dashboard.navPrefs.empty.title')"
      :description="t('dashboard.navPrefs.empty.description')"
    />

    <div v-else class="space-y-6">
      <section
        v-for="block in blocks"
        :key="block.group ?? '_ungrouped'"
        :data-nav-pref-group="block.group ?? '_ungrouped'"
      >
        <div class="flex items-center gap-2 border-b border-default pb-1">
          <h3 class="flex-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {{ groupLabel(block.group) }}
          </h3>
          <template v-if="block.group">
            <UButton
              icon="i-ph-arrow-up"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canMoveGroup(block, -1)"
              :aria-label="t('dashboard.navPrefs.groupUp')"
              :data-nav-pref-group-up="block.group"
              @click="moveGroup(block, -1)"
            />
            <UButton
              icon="i-ph-arrow-down"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canMoveGroup(block, 1)"
              :aria-label="t('dashboard.navPrefs.groupDown')"
              :data-nav-pref-group-down="block.group"
              @click="moveGroup(block, 1)"
            />
          </template>
        </div>

        <ul class="divide-y divide-default">
          <li
            v-for="(row, index) in block.rows"
            :key="row.id"
            class="flex items-center gap-3 py-2"
            :class="[isDragging(block, index) ? 'opacity-40' : '', row.hidden ? 'opacity-60' : '']"
            :data-nav-pref-row="row.id"
            draggable="true"
            @dragstart="onDragStart(block, index)"
            @dragover.prevent="onDragOver(block, index)"
            @dragend="onDragEnd"
          >
            <UIcon name="i-ph-dots-six-vertical" class="shrink-0 cursor-grab text-muted" />
            <UIcon :name="row.icon" class="shrink-0 text-dimmed" />

            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm">{{ row.label }}</span>
              <span class="truncate text-xs text-muted">{{ localePath(row.to) }}</span>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <UButton
                :icon="row.hidden ? 'i-ph-eye-slash' : 'i-ph-eye'"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="row.hidden ? t('dashboard.navPrefs.show') : t('dashboard.navPrefs.hide')"
                :data-nav-pref-toggle="row.id"
                @click="row.hidden = !row.hidden"
              />
              <UButton
                icon="i-ph-arrow-up"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="!canMoveRow(block, index, -1)"
                :aria-label="t('dashboard.navPrefs.moveUp')"
                :data-nav-pref-up="row.id"
                @click="moveRow(block, index, -1)"
              />
              <UButton
                icon="i-ph-arrow-down"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="!canMoveRow(block, index, 1)"
                :aria-label="t('dashboard.navPrefs.moveDown')"
                :data-nav-pref-down="row.id"
                @click="moveRow(block, index, 1)"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="saving"
          data-testid="nav-prefs-reset"
          @click="resetAll"
        >
          {{ t('dashboard.navPrefs.reset') }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>
