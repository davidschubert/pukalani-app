<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { createCategoryEditSchema, createCategorySchema } from '../../../schemas/postCategory'
import { categorySearchHaystack, parseCategoryTranslations, type CategoryTranslations } from '../../../shared/categoryI18n'
import { slugify } from '../../../shared/discussionUrl'
import { MAX_CATEGORY_DESCRIPTION, MAX_CATEGORY_NAME } from '../../../shared/types/post'
import type {
  CategoryManageResponse,
  CategoryOrderResponse,
  CategoryTranslateResponse,
  CategoryWithCount,
  PostCategory,
} from '../../../shared/types/post'

/**
 * Kategorien der Discussions verwalten (F1 Stufe 1).
 *
 * PFAD = BESCHRIFTUNG (U8/G4, 2026-08-11): die Route heißt `/dashboard/
 * categories`, der Menüpunkt „Kategorien". Vorher hieß der Pfad
 * `discussions` — ein Wort, das in keiner Oberfläche vorkam; die Begründung
 * („der Pfad benennt den BEREICH, der später wächst") hat drei Stufen lang
 * niemandem geholfen und dafür jedem Lesezeichen einen dritten Namen für
 * dieselbe Sache gegeben. Wächst der Bereich, wächst er unter dem Namen, der
 * dann im Menü steht — mit 301, wie dieser hier
 * (packages/posts/nuxt.config.ts).
 *
 * Liste, dann Editor — dasselbe Muster wie Seiten, Kurse und Themes (B6):
 * UTable mit Sortierung und Leerzustand, und erst auf Klick tritt das Formular
 * an ihre Stelle. Bewusst KEIN Modal: die Seite hat genau eine Aufgabe, ein
 * Dialog darüber wäre eine Ebene ohne Gewinn.
 *
 * ── DIE REIHENFOLGE WIRD GEZOGEN, NICHT GETIPPT ───────────────────────────
 * Beide Wege des Menü-Editors (`/dashboard/community/navigation`), Zeile für
 * Zeile dasselbe Verhalten: links der Griff zum Ziehen, rechts zwei Pfeile.
 * Der zweite Weg ist keine Doppelung, sondern die Zugänglichkeit — eine
 * Reihenfolge, die nur mit der Maus zu ändern ist, kann ein Teil der Leute gar
 * nicht ändern.
 *
 * DREI DINGE, die man beim Aufräumen nicht wegnehmen darf:
 *
 * (1) **Gezogen wird die ZEILE, gehalten wird der GRIFF.** `UTable` rendert
 *     ihr `<tr>` selbst und lässt kein `draggable` daran zu (nur `class` und
 *     `style` je Zeile). Deshalb hängt `draggable` am Griff in der ersten
 *     Zelle, und das Ziel unter dem Zeiger findet der Umschlag um die Tabelle
 *     über `closest('tr')` — das `<tr>` IST ein Vorfahr dessen, worüber der
 *     Zeiger gerade steht, also trägt der Weg unabhängig von der Zelle.
 *
 * (2) **Beim Filtern gibt es keine Reihenfolge zu ändern.** Griff und Pfeile
 *     verschwinden, sobald die Suche etwas ausblendet. In einer gefilterten
 *     Liste hieße „eins hoch" ein Sprung über ungezeigte Zeilen — die
 *     Bedienung verspräche etwas anderes, als sie tut.
 *
 * (3) **Gespeichert wird von selbst, gebündelt.** Ein Zug ist fertig, wenn man
 *     loslässt; ein Knopf „Reihenfolge speichern" wäre ein zweiter Handgriff
 *     für dieselbe Entscheidung. Mehrere Pfeilklicks hintereinander laufen
 *     deshalb in EINEN Aufruf (500 ms Ruhe), und der schickt IMMER die ganze
 *     Ordnung — nie ein Delta, das unterwegs veralten könnte.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'posts.manage' })

const { t, locales } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { planAllows } = useTenantPlan()
useBrandTitle(() => t('posts.categories.title'))

const { data, status, refresh } = await useFetch<CategoryManageResponse>('/api/posts/categories/manage', {
  lazy: true,
  server: false,
})

/**
 * Die angezeigte Liste ist EIGENER Zustand, keine `computed` auf die Antwort:
 * ein Zug soll sofort stehen, nicht erst nach dem Speichern. Sie wird aus der
 * Antwort neu aufgebaut, sobald der Server etwas Neues sagt — die Datenbank
 * bleibt damit die Wahrheit, die Oberfläche nur schneller.
 */
const rows = ref<CategoryWithCount[]>([])
watch(data, (value) => { rows.value = [...(value?.rows ?? [])] }, { immediate: true })

const search = ref('')
const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return rows.value
  // Über ALLE Sprachfassungen (categorySearchHaystack): wer „General" liest,
  // soll die Kategorie finden, die in der Grundfassung „Allgemein" heißt.
  return rows.value.filter(entry =>
    categorySearchHaystack(entry.category).includes(needle)
    || entry.category.slug.includes(needle))
})

/** Sortieren geht nur an der ganzen Liste — siehe (2) im Kopf. */
const canReorder = computed(() => !search.value.trim() && rows.value.length > 1)

const columns = computed<TableColumn<CategoryWithCount>[]>(() => [
  ...(canReorder.value ? [{ id: 'drag', header: srOnlyHeader(() => t('ui.table.drag')) } as TableColumn<CategoryWithCount>] : []),
  { id: 'name', header: () => t('posts.categories.col.name') },
  { id: 'slug', header: () => t('posts.categories.col.slug') },
  { id: 'topics', header: () => t('posts.categories.col.topics') },
  { id: 'state', header: () => t('posts.categories.col.state') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

// ── Reihenfolge ────────────────────────────────────────────────────────────
type OrderState = 'idle' | 'saving' | 'saved'
const orderState = ref<OrderState>('idle')
const dragId = ref<string | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let savedTimer: ReturnType<typeof setTimeout> | null = null

function indexOfId(id: string): number {
  return rows.value.findIndex(entry => entry.category.$id === id)
}

/** Eine Zeile an eine andere Stelle setzen (der eine Handgriff hinter Ziehen
 *  UND Pfeilen — zwei Bedienungen, eine Rechnung). */
function moveRow(from: number, to: number) {
  if (from < 0 || to < 0 || from === to || to >= rows.value.length) return
  const next = [...rows.value]
  const [row] = next.splice(from, 1)
  if (!row) return
  next.splice(to, 0, row)
  rows.value = next
  scheduleOrderSave()
}

function move(index: number, delta: number) {
  moveRow(index, index + delta)
}

function scheduleOrderSave() {
  orderState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; void saveOrder() }, 500)
}

async function saveOrder() {
  try {
    const response = await $fetch<CategoryOrderResponse>('/api/posts/categories/order', {
      method: 'PATCH',
      body: { ids: rows.value.map(entry => entry.category.$id) },
    })
    // Den GESPEICHERTEN Stand übernehmen, nicht den eigenen Entwurf behalten:
    // danach steht in der Liste dieselbe Zahl wie in der Datenbank.
    const saved = new Map(response.order.map(entry => [entry.id, entry.sortOrder]))
    for (const entry of rows.value) {
      const sortOrder = saved.get(entry.category.$id)
      if (sortOrder !== undefined) entry.category.sortOrder = sortOrder
    }
    orderState.value = 'saved'
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => { orderState.value = 'idle' }, 2000)
  }
  catch (error) {
    orderState.value = 'idle'
    // `order_stale` heißt: nebenan wurde angelegt oder gelöscht. Dann ist das
    // Neuladen die Antwort, nicht ein zweiter Versuch mit demselben Stand.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: t('posts.categories.orderFailed'),
      description: reason === 'order_stale'
        ? t('posts.categories.orderStaleHint')
        : t('posts.categories.orderFailedHint'),
      color: 'error',
    })
    await refresh()
  }
}

/** Ein Zug, der noch in der Wartezeit steckt, geht beim Verlassen der Seite
 *  trotzdem raus — sonst wäre er sichtbar geschehen und nie gespeichert. */
onBeforeUnmount(() => {
  if (savedTimer) clearTimeout(savedTimer)
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  void saveOrder()
})

function onDragStart(id: string, event: DragEvent) {
  dragId.value = id
  // Firefox startet einen Zug nur, wenn Daten dranhängen.
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent) {
  const from = dragId.value
  if (from === null) return
  const target = (event.target as HTMLElement | null)?.closest('tr')
  const targetId = target?.querySelector<HTMLElement>('[data-category-row]')?.dataset.categoryRow
  if (!targetId || targetId === from) return
  const to = indexOfId(targetId)
  const at = indexOfId(from)
  if (at < 0 || to < 0) return
  moveRow(at, to)
}

function onDragEnd() {
  dragId.value = null
}

// ── Formular ───────────────────────────────────────────────────────────────
/**
 * KEIN `sortOrder` MEHR IM FORMULAR (und das ist eine Entscheidung, kein
 * Vergessen): die Reihenfolge wird in der Liste gezogen. Ein Zahlenfeld
 * DANEBEN wäre ein zweiter Weg zu derselben Sache — mit dem Unterschied, dass
 * er Lücken und Doppelungen erlaubt und beim nächsten Zug ohnehin
 * überschrieben würde. Die Spalte bleibt, das PATCH-Schema auch (weggelassen
 * heißt unverändert, shared/categoryPatch.ts); eine neue Kategorie hängt der
 * Server hinten an.
 */
interface Form {
  name: string
  slug: string
  description: string
  active: boolean
  /**
   * Sprachcode → Überschreibung. Das Formular hält IMMER einen Eintrag je
   * angebotener Sprache (auch leere), damit `v-model` ein Ziel hat; leere
   * Felder wirft der Server beim Speichern weg — „leer heißt nicht übersetzt"
   * (shared/categoryI18n.ts).
   */
  translations: Record<string, { name: string, description: string }>
}

/**
 * Die angebotenen Sprachen sind die der APP, nicht eine Liste im Code: kommt
 * eine dazu, steht sie hier ohne Migration und ohne Codeänderung.
 *
 * BEWUSST OHNE „Ausgangssprache": die Grundfassung oben ist der Text, den
 * jemand eingetippt hat — in welcher Sprache, sagt niemand. Jede Sprache
 * bekommt deshalb ihr eigenes Feld mit der Grundfassung als Platzhalter.
 */
const formLocales = computed(() => locales.value.map(entry => ({
  code: entry.code,
  label: entry.name ?? entry.code,
})))

const emptyTranslations = (): Record<string, { name: string, description: string }> =>
  Object.fromEntries(formLocales.value.map(l => [l.code, { name: '', description: '' }]))

const emptyForm = (): Form => ({
  name: '', slug: '', description: '', active: true, translations: emptyTranslations(),
})

/** Gespeicherte Übersetzungen ⇒ Formular-Felder (fehlende Sprache = leer). */
function formTranslations(saved: CategoryTranslations): Form['translations'] {
  const out = emptyTranslations()
  for (const [code, entry] of Object.entries(saved)) {
    out[code] = { name: entry.name ?? '', description: entry.description ?? '' }
  }
  return out
}

const form = reactive<Form>(emptyForm())
const editingId = ref<string | null>(null)
const isNew = ref(false)
const editing = computed(() => isNew.value || editingId.value !== null)
const saving = ref(false)

/**
 * Der Slug folgt dem Namen NUR beim Anlegen, und nur solange niemand ihn von
 * Hand angefasst hat. Danach nie wieder: er ist nach der Anlage fest (die
 * Kategorie-Seite trägt keine Id, über die sich ein alter Link heilen könnte).
 */
const slugTouched = ref(false)
watch(() => form.name, (value) => {
  if (isNew.value && !slugTouched.value) form.slug = slugify(value)
})

function startNew() {
  Object.assign(form, emptyForm())
  editingId.value = null
  isNew.value = true
  slugTouched.value = false
}

function startEdit(entry: CategoryWithCount) {
  Object.assign(form, {
    name: entry.category.name,
    slug: entry.category.slug,
    description: entry.category.description,
    active: entry.category.active,
    translations: formTranslations(parseCategoryTranslations(entry.category.translations)),
  })
  editingId.value = entry.category.$id
  isNew.value = false
  slugTouched.value = true
}

function closeEditor() {
  editingId.value = null
  isNew.value = false
  Object.assign(form, emptyForm())
}

/** Dieselben Zod-Schemas wie der Server — hier nur mit übersetzten Texten. */
const schema = computed(() => isNew.value ? createCategorySchema(t) : createCategoryEditSchema(t))
const formError = ref('')

async function save() {
  if (saving.value) return
  // `description` wird IMMER mitgeschickt, auch leer: der Server behandelt ein
  // fehlendes Feld als „unverändert" (shared/categoryPatch.ts) — wer den Text
  // löscht, muss die Löschung also aussprechen.
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    active: form.active,
    // IMMER mitgeschickt, auch wenn alles leer ist: nur so lässt sich eine
    // Übersetzung auch wieder ENTFERNEN (dieselbe Regel wie bei `description`).
    translations: form.translations,
    ...(isNew.value ? { slug: form.slug.trim() } : {}),
  }
  const parsed = schema.value.safeParse(payload)
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? ''
    return
  }
  formError.value = ''

  saving.value = true
  try {
    if (isNew.value) {
      await $fetch('/api/posts/categories', { method: 'POST', body: parsed.data })
      toast.add({ title: t('posts.categories.created'), color: 'success' })
    }
    else {
      await $fetch(`/api/posts/categories/${editingId.value}`, { method: 'PATCH', body: parsed.data })
      toast.add({ title: t('posts.categories.updated'), color: 'success' })
    }
    closeEditor()
    await refresh()
  }
  catch (error) {
    // Der Server hebt fachliche Gründe als `reason` ins Envelope
    // (core/server/error.ts) — der Slug-Konflikt ist der einzige, den der
    // Mensch hier selbst beheben kann.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'slug_taken' ? t('posts.categories.slugTaken') : t('posts.categories.saveFailed'),
      description: reason === 'slug_taken' ? undefined : t('posts.categories.saveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function remove(entry: CategoryWithCount) {
  try {
    const ok = await confirm({
      title: t('posts.categories.confirmDeleteTitle'),
      description: t('posts.categories.confirmDeleteText', { name: entry.category.name }),
      confirmLabel: t('posts.categories.delete'),
      action: () => $fetch(`/api/posts/categories/${entry.category.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('posts.categories.deleted'), color: 'success' })
    await refresh()
  }
  catch (error) {
    // „In Benutzung" ist kein Fehlschlag, sondern die Antwort — mit dem einen
    // Weg, den es stattdessen gibt (stilllegen).
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'category_in_use' ? t('posts.categories.inUse') : t('posts.categories.deleteFailed'),
      description: reason === 'category_in_use'
        ? t('posts.categories.inUseHint')
        : t('posts.categories.deleteFailedHint'),
      color: reason === 'category_in_use' ? 'warning' : 'error',
    })
  }
}

/** Stilllegen/reaktivieren direkt aus der Liste — der häufigste Handgriff. */
async function toggleActive(entry: CategoryWithCount) {
  try {
    // Nur Name (Pflicht) und der Schalter — alles andere bleibt unangetastet,
    // weil ein fehlendes Feld „unverändert" heißt (shared/categoryPatch.ts).
    await $fetch(`/api/posts/categories/${entry.category.$id}`, {
      method: 'PATCH',
      body: { name: entry.category.name, active: !entry.category.active },
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('posts.categories.saveFailed'), description: t('posts.categories.saveFailedHint'), color: 'error' })
  }
}

// ── KI-Vorschlag ───────────────────────────────────────────────────────────
/**
 * Der Knopf erscheint nur, wenn BEIDES stimmt: der Server meldet einen
 * hinterlegten KI-Schlüssel (`aiTranslate`) und der Tarif enthält das Produkt
 * (`planAllows('ai')`). Ein Knopf, der beim Drücken 402 oder 503 antwortet,
 * wäre ein Versprechen, das die Seite nicht halten kann — die Route prüft
 * beides trotzdem selbst, sie ist die Grenze, dies hier nur die Höflichkeit.
 */
const aiTranslateAvailable = computed(() => !!data.value?.aiTranslate && planAllows('ai'))
const translatingLocale = ref('')

async function translateWithAi(locale: string) {
  if (translatingLocale.value || !form.name.trim()) return
  translatingLocale.value = locale
  try {
    const suggestion = await $fetch<CategoryTranslateResponse>('/api/posts/categories/translate', {
      method: 'POST',
      // Aus dem FORMULAR, nicht aus der Datenbank: sonst ließe sich beim
      // Anlegen nichts übersetzen (da gibt es noch keine Zeile).
      body: { locale, name: form.name.trim(), description: form.description.trim() },
    })
    const target = form.translations[locale]
    if (!target) return
    // Ein leerer Vorschlag lässt das Feld in Ruhe — sonst löschte ein
    // misslungener Versuch, was jemand von Hand geschrieben hat.
    if (suggestion.name) target.name = suggestion.name
    if (suggestion.description) target.description = suggestion.description
  }
  catch {
    toast.add({
      title: t('posts.categories.translateFailed'),
      description: t('posts.categories.translateFailedHint'),
      color: 'error',
    })
  }
  finally {
    translatingLocale.value = ''
  }
}

function categoryPath(category: PostCategory): string {
  return `/discussions/${category.slug}`
}
</script>

<template>
  <UDashboardPanel id="post-categories">
    <template #header>
      <UDashboardNavbar :title="t('posts.categories.title')">
        <template #leading>
          <UButton
            v-if="editing"
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('posts.categories.cancel')"
            @click="closeEditor"
          />
          <UDashboardSidebarCollapse v-else />
        </template>
        <template #right>
          <UButton
            v-if="!editing"
            icon="i-ph-plus"
            :label="t('posts.categories.new')"
            data-category-new
            @click="startNew"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <template v-if="!editing">
        <p class="mb-4 text-sm text-muted">{{ t('posts.categories.description') }}</p>

        <div class="mb-4 flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-ph-magnifying-glass"
            :placeholder="t('posts.discussions.searchCategories')"
            class="max-w-md flex-1"
            data-category-search
          />
          <!-- Der Zustand des Speicherns steht neben der Liste, nicht als
               Toast: ein Zug pro Sekunde ergäbe eine Toast-Kette für etwas,
               das ohnehin gelingt. Fehler melden sich weiterhin laut. -->
          <span
            v-if="orderState !== 'idle'"
            class="flex items-center gap-1.5 text-sm text-muted"
            data-category-order-state
          >
            <UIcon
              :name="orderState === 'saving' ? 'i-ph-spinner' : 'i-ph-check'"
              :class="orderState === 'saving' ? 'size-4 animate-spin' : 'size-4 text-success'"
            />
            {{ orderState === 'saving' ? t('posts.categories.orderSaving') : t('posts.categories.orderSaved') }}
          </span>
        </div>

        <p v-if="search.trim() && rows.length > 1" class="mb-4 text-sm text-muted">
          {{ t('posts.categories.orderFilteredHint') }}
        </p>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <!-- Der Umschlag trägt die Zug-Ereignisse, weil `UTable` ihr `<tr>`
             selbst rendert — siehe (1) im Kopf der Seite. -->
        <div
          v-else
          @dragover.prevent="onDragOver"
          @drop.prevent="onDragEnd"
          @dragend="onDragEnd"
        >
          <UTable :data="filtered" :columns="columns" data-categories-table>
            <template #drag-cell="{ row }">
              <span
                class="flex cursor-grab items-center text-muted active:cursor-grabbing"
                draggable="true"
                :data-category-row="row.original.category.$id"
                :class="dragId === row.original.category.$id ? 'opacity-40' : ''"
                :aria-label="t('posts.categories.dragHandle')"
                @dragstart="onDragStart(row.original.category.$id, $event)"
              >
                <UIcon name="i-ph-dots-six-vertical" class="size-4" />
              </span>
            </template>
            <template #name-cell="{ row }">
              <button
                type="button"
                class="cursor-pointer font-medium text-default hover:text-primary hover:underline"
                @click="startEdit(row.original)"
              >
                {{ row.original.category.name }}
              </button>
              <p v-if="row.original.category.description" class="max-w-md truncate text-sm text-muted">
                {{ row.original.category.description }}
              </p>
            </template>
            <template #slug-cell="{ row }">
              <NuxtLink
                :to="categoryPath(row.original.category)"
                class="font-mono text-sm text-muted hover:text-primary hover:underline"
              >
                /{{ row.original.category.slug }}
              </NuxtLink>
            </template>
            <template #topics-cell="{ row }">
              <span class="text-sm tabular-nums">{{ row.original.topicCount }}</span>
            </template>
            <template #state-cell="{ row }">
              <UBadge
                :color="row.original.category.active ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ row.original.category.active ? t('posts.categories.stateActive') : t('posts.categories.stateInactive') }}
              </UBadge>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <!-- Der zweite Weg zur Reihenfolge: ohne Maus, ohne Ziehen.
                     Der Index kommt aus der GANZEN Liste (`rows`), nicht aus
                     der angezeigten — beide sind hier dieselbe, weil die
                     Knöpfe beim Filtern verschwinden, und `rows` ist die, die
                     gespeichert wird. -->
                <template v-if="canReorder">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-ph-arrow-up"
                    :disabled="indexOfId(row.original.category.$id) === 0"
                    :aria-label="t('posts.categories.moveUp')"
                    :data-category-up="row.original.category.$id"
                    @click="move(indexOfId(row.original.category.$id), -1)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-ph-arrow-down"
                    :disabled="indexOfId(row.original.category.$id) === rows.length - 1"
                    :aria-label="t('posts.categories.moveDown')"
                    :data-category-down="row.original.category.$id"
                    @click="move(indexOfId(row.original.category.$id), 1)"
                  />
                </template>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :icon="row.original.category.active ? 'i-ph-eye-slash' : 'i-ph-eye'"
                  :aria-label="t('posts.categories.active')"
                  @click="toggleActive(row.original)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-ph-pencil-simple"
                  :aria-label="t('posts.categories.edit')"
                  @click="startEdit(row.original)"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-ph-trash"
                  :aria-label="t('posts.categories.delete')"
                  @click="remove(row.original)"
                />
              </div>
            </template>

            <template #empty>
              <CoreEmptyState
                v-if="search.trim()"
                icon="i-ph-funnel"
                :title="t('ui.empty.noResultsTitle')"
                :description="t('ui.empty.noResultsText')"
                :action-label="t('ui.empty.resetFilters')"
                action-icon="i-ph-arrow-counter-clockwise"
                @action="() => { search = '' }"
              />
              <CoreEmptyState
                v-else
                icon="i-ph-chats-circle"
                :title="t('posts.categories.emptyTitle')"
                :description="t('posts.categories.emptyText')"
                :action-label="t('posts.categories.new')"
                action-icon="i-ph-plus"
                @action="startNew"
              />
            </template>
          </UTable>
        </div>
      </template>

      <div v-else class="max-w-xl space-y-4" data-category-form>
        <UFormField :label="t('posts.categories.name')" required>
          <UInput v-model="form.name" :placeholder="t('posts.categories.namePlaceholder')" class="w-full" data-category-name />
        </UFormField>

        <UFormField
          :label="t('posts.categories.slug')"
          :help="isNew ? t('posts.categories.slugHint') : t('posts.categories.slugLocked')"
          required
        >
          <UInput
            v-model="form.slug"
            :disabled="!isNew"
            :placeholder="t('posts.categories.slugPlaceholder')"
            class="w-full font-mono"
            data-category-slug
            @update:model-value="() => { slugTouched = true }"
          />
        </UFormField>

        <UFormField :label="t('posts.categories.descriptionLabel')">
          <UTextarea
            v-model="form.description"
            :placeholder="t('posts.categories.descriptionPlaceholder')"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <!-- ÜBERSETZUNGEN. Ein Block je Sprache der App, Platzhalter = die
             Grundfassung darüber: leer lassen heißt „gilt die Grundfassung",
             nicht „hat keinen Namen". Die ADRESSE steht bewusst nicht hier —
             warum, steht in shared/categoryI18n.ts. -->
        <div class="space-y-3 pt-2">
          <div>
            <h3 class="text-sm font-semibold">{{ t('posts.categories.translations') }}</h3>
            <p class="mt-1 text-sm text-muted">{{ t('posts.categories.translationsHint') }}</p>
          </div>

          <div
            v-for="entry in formLocales"
            :key="entry.code"
            class="space-y-2 rounded-lg border border-default p-3"
            :data-category-translation="entry.code"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">{{ entry.label }}</span>
              <UButton
                v-if="aiTranslateAvailable"
                icon="i-ph-sparkle"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="translatingLocale === entry.code"
                :disabled="!form.name.trim() || !!translatingLocale"
                :data-category-translate="entry.code"
                @click="translateWithAi(entry.code)"
              >
                {{ t('posts.categories.translateWithAi') }}
              </UButton>
            </div>
            <UInput
              v-if="form.translations[entry.code]"
              v-model="form.translations[entry.code]!.name"
              size="sm"
              :maxlength="MAX_CATEGORY_NAME"
              :placeholder="form.name || t('posts.categories.namePlaceholder')"
              :aria-label="t('posts.categories.name')"
              class="w-full"
            />
            <UTextarea
              v-if="form.translations[entry.code]"
              v-model="form.translations[entry.code]!.description"
              size="sm"
              :rows="2"
              autoresize
              :maxlength="MAX_CATEGORY_DESCRIPTION"
              :placeholder="form.description || t('posts.categories.descriptionPlaceholder')"
              :aria-label="t('posts.categories.descriptionLabel')"
              class="w-full"
            />
          </div>
        </div>

        <UFormField :label="t('posts.categories.active')" :help="t('posts.categories.activeHint')">
          <USwitch v-model="form.active" data-category-active />
        </UFormField>

        <UAlert v-if="formError" color="error" variant="subtle" icon="i-ph-warning" :title="formError" />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeEditor">{{ t('posts.categories.cancel') }}</UButton>
          <UButton :loading="saving" :disabled="!form.name.trim()" data-category-save @click="save">
            {{ t('posts.categories.save') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
