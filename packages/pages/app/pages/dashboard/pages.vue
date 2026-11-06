<script setup lang="ts">
import type { EditorToolbarItem, TableColumn, TabsItem } from '@nuxt/ui'
import { MAX_PAGE_BODY, MAX_PAGE_TRANSLATE_BODY } from '../../../schemas/page'
import { bodyToSave as decideBodyToSave } from '../../../../core/shared/editorBody'
import { orderedLocales, translationSourceLocale } from '../../../shared/pageLocales'
import type { PageDetailResponse, PageGroup, PageTranslateResponse, PagesListResponse } from '../../../shared/types/page'

/**
 * Seiten-Editor (Betreiber). Text-Editieren bestehender Inhalte, AUSBAUSTUFE (a)
 * — bewusst KEIN Block-Editor-Umbau (kein Blockmodell, kein Drag&Drop, keine
 * Bausteine; das wäre ein eigenes Projekt, vgl. docs/plans/
 * PLATFORM-TENANT-HOMEPAGE.md §5). Leitprinzip Einfachheit.
 *
 * (a) heißt hier genau dreierlei — „was ich schreibe, steht so auf der Seite":
 * 1. Die Schreibfläche kann nur noch, was der öffentliche Renderer
 *    (core MarkdownContent, sicheres Subset, kein v-html) auch darstellt:
 *    kein Bild, kein @-Mention-Menü, kein Durchgestrichen. Umgekehrt sind
 *    Inline-Code und Codeblock jetzt auch in der Toolbar — der Renderer kann
 *    beides, die Toolbar hat es bisher verschwiegen.
 * 2. Drei Ansichten pro Sprachversion: Schreiben (WYSIWYG) · Markdown
 *    (Rohtext) · Vorschau. Die Vorschau rendert mit EXAKT derselben
 *    MarkdownContent-Komponente wie /[slug] — kein zweiter Renderpfad.
 *    Der Markdown-Modus ist für bestehende Bodies da: Zeile gezielt
 *    korrigieren / Text einfügen, ohne Tiptap-Serialisierung dazwischen.
 * 3. Nur EINE Ansicht ist gleichzeitig montiert (v-if): sonst schreiben
 *    UEditor (normalisiert beim Serialisieren) und Rohtext-Feld über
 *    dasselbe v-model gegeneinander.
 *
 * Bewusst NICHT in (a) (Kandidaten für später, in dieser Reihenfolge):
 * Abschnitts-weises Editieren, Schutz vor ungespeicherten Änderungen beim
 * Seitenwechsel, Bild-Upload, Slot-/Regler-Zoo für Typografie.
 * Bekannte Rest-Unschärfe: `---` (Trennlinie) und verschachtelte Listen
 * kann Tiptap erzeugen, der Renderer stellt sie nicht (bzw. flach) dar —
 * sichtbar wird das in der Vorschau, deshalb hier kein weiterer Umbau.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'pages.manage' })

const { t } = useI18n()
const { planAllows } = useTenantPlan()
const toast = useToast()
const confirm = useConfirm()
useBrandTitle(() => t('pages.admin.title'))

/**
 * DIE SPRACHEN KOMMEN AUS DER i18n-CONFIG (F60), nicht mehr aus einer
 * Konstante `['en','de']`.
 *
 * Der Typ-Kommentar in `shared/types/page.ts` verspricht seit `pages-001`
 * „beliebige Sprachen" — das Datenmodell hält es (eine Zeile je slug×locale),
 * dieser Bildschirm hielt es nicht: eine dritte App-Sprache wäre auf dem Server
 * gespeichert und im Editor unsichtbar gewesen. Standardsprache zuerst, weil
 * dort im Regelfall die Urfassung steht und der Übersetzen-Knopf von ihr
 * ausgeht (`orderedLocales`).
 */
const { locales: appLocales, defaultLocale } = useI18n()
const languageName = usePageLanguageName()
const LOCALES = computed<string[]>(() => orderedLocales(
  appLocales.value.map(locale => (typeof locale === 'string' ? locale : locale.code)),
  defaultLocale,
))
type Locale = string

// Markdown-Toolbar — deckt genau das Subset von core/shared/markdown.ts ab
// (fett, kursiv, `code`, h2/h3, Listen, Link, Zitat, Codeblock).
const toolbarItems: EditorToolbarItem[] = [
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b' },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic' },
  { kind: 'mark', mark: 'code', icon: 'i-ph-code-simple' },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two' },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three' },
  { kind: 'bulletList', icon: 'i-ph-list-bullets' },
  { kind: 'orderedList', icon: 'i-ph-list-numbers' },
  { kind: 'link', icon: 'i-ph-link' },
  { kind: 'blockquote', icon: 'i-ph-quotes' },
  { kind: 'codeBlock', icon: 'i-ph-code' },
]

// Was der Renderer nicht kann, soll der Editor gar nicht erst anbieten:
// Durchgestrichen (~~) hat im Subset keine Entsprechung.
const editorStarterKit = { strike: false as const }

// Ansicht der Inhalts-Spalte (gilt für den aktiven Sprachreiter)
const BODY_MODES = ['write', 'markdown', 'preview'] as const
type BodyMode = (typeof BODY_MODES)[number]
const bodyMode = ref<BodyMode>('write')
const bodyModeItems = computed<TabsItem[]>(() => BODY_MODES.map(mode => ({
  label: t(`pages.admin.mode.${mode}`),
  value: mode,
})))

const { data: listData, refresh: refreshList } = await useFetch<PagesListResponse>('/api/pages', { lazy: true, server: false })
const groups = computed(() => listData.value?.groups ?? [])

interface LocaleForm { title: string, body: string, published: boolean }
const emptyLocale = (): LocaleForm => ({ title: '', body: '', published: false })

const selectedSlug = ref<string | null>(null)
const isNew = ref(false)
/**
 * Die geöffnete Seite gibt es als Zeile noch NICHT — was im Editor steht, ist
 * unsere Vorlage (heute nur die Regeln, F1). Unterschied zu `isNew`: die
 * Adresse steht fest und ist nicht editierbar, gelöscht werden kann nichts,
 * und ein Hinweis sagt, was das Speichern bewirkt.
 */
const isTemplate = ref(false)
const slugInput = ref('')
const activeLocale = ref<Locale>(LOCALES.value[0] ?? defaultLocale)
const forms = reactive<Record<Locale, LocaleForm>>(Object.fromEntries(
  LOCALES.value.map(locale => [locale, emptyLocale()]),
))

/**
 * „Öffnen darf nichts ändern": `pristineBody` ist der Text aus der API,
 * `normalizedBody` die erste Fassung, die der Editor von sich aus schreibt
 * (Tiptap maskiert beim Serialisieren eckige Klammern). Warum das nötig ist
 * und welche Alternativen verworfen wurden: core/shared/editorBody.ts.
 */
const pristineBody = reactive<Record<Locale, string>>(Object.fromEntries(LOCALES.value.map(l => [l, ''])))
const normalizedBody = reactive<Record<Locale, string | null>>(Object.fromEntries(LOCALES.value.map(l => [l, null])))

/**
 * Die erste Selbst-Änderung des Editors je Sprache merken (siehe oben).
 *
 * Die Liste steht zur Laufzeit fest (sie kommt aus der Build-Config), ein
 * einmaliger Durchlauf im `setup` reicht also — ein Watcher AUF die Liste wäre
 * ein Wächter über etwas, das sich nie ändert.
 */
for (const locale of LOCALES.value) {
  watch(() => forms[locale]?.body, (value) => {
    if (value === undefined) return
    if (normalizedBody[locale] === null && value !== pristineBody[locale]) normalizedBody[locale] = value
  })
}

/** Was tatsächlich gespeichert wird: Urfassung, solange niemand getippt hat. */
function bodyToSave(locale: Locale): string {
  return decideBodyToSave({
    current: forms[locale]?.body ?? '',
    pristine: pristineBody[locale] ?? '',
    normalized: normalizedBody[locale] ?? null,
  })
}
const saving = ref(false)

const editing = computed(() => isNew.value || selectedSlug.value !== null)
const localeTabs = computed(() => LOCALES.value.map(l => ({ label: languageName(l), value: l })))
// Fußleiste + Zähler wirken auf die AKTIVE Sprachversion (Tab)
const activeForm = computed(() => forms[activeLocale.value] ?? emptyLocale())
const bodyTooLong = computed(() => activeForm.value.body.length > MAX_PAGE_BODY)

/**
 * Liste UND Editor auf einer Seite, aber nacheinander statt nebeneinander
 * (B6): vorher stand links ein 220-px-Menü, in dem der Slug die einzige
 * Information war. Jetzt zeigt die Seite eine Tabelle, bis eine Seite
 * ausgewählt ist — dann tritt der Editor an ihre Stelle. Dasselbe Muster wie
 * bei Kursen und Themes: Liste, dann Editor.
 */
const search = ref('')
const filteredGroups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return groups.value
  return groups.value.filter(group => group.slug.toLowerCase().includes(needle)
    || group.locales.some(locale => locale.title.toLowerCase().includes(needle)))
})

const columns = computed<TableColumn<PageGroup>[]>(() => [
  { accessorKey: 'slug', header: () => t('pages.admin.col.address') },
  { id: 'title', header: () => t('pages.admin.col.pageTitle') },
  { id: 'locales', header: () => t('pages.admin.col.languages') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

/** Anzeige-Titel: die Standardsprache der App, sonst die erste vorhandene. */
function displayTitle(group: PageGroup): string {
  return group.locales.find(l => l.locale === defaultLocale)?.title || group.locales[0]?.title || ''
}

/**
 * WAS IN DER SPALTE „SPRACHEN" STEHT — je APP-Sprache ein Badge, auch für die,
 * die es nicht gibt (F60).
 *
 * Vorher zeigte die Zeile nur die vorhandenen Fassungen. Das ist die Sorte
 * Liste, die nie falsch ist und trotzdem nichts sagt: dass die deutsche
 * Fassung des Impressums FEHLT, sah man nur, wenn man nachzählte, welche
 * Sprachen die App eigentlich hat. Genau das ist die Frage, die dieser
 * Bildschirm beantworten soll.
 */
type LocaleBadge = { locale: string, state: 'published' | 'draft' | 'missing' }
function localeBadges(group: PageGroup): LocaleBadge[] {
  return LOCALES.value.map((locale) => {
    const row = group.locales.find(l => l.locale === locale)
    return { locale, state: row ? (row.status === 'published' ? 'published' : 'draft') : 'missing' }
  })
}
const BADGE_COLOR = { published: 'success', draft: 'neutral', missing: 'neutral' } as const
const BADGE_VARIANT = { published: 'subtle', draft: 'subtle', missing: 'outline' } as const

function closeEditor() {
  isNew.value = false
  isTemplate.value = false
  selectedSlug.value = null
  resetForms()
}

function resetForms() {
  for (const l of LOCALES.value) {
    forms[l] = emptyLocale()
    pristineBody[l] = ''
    normalizedBody[l] = null
  }
}

async function selectPage(slug: string) {
  isNew.value = false
  selectedSlug.value = slug
  slugInput.value = slug
  activeLocale.value = LOCALES.value[0] ?? defaultLocale
  resetForms()
  try {
    const { rows, isTemplate: fromTemplate } = await $fetch<PageDetailResponse>(`/api/pages/${slug}`)
    isTemplate.value = fromTemplate
    for (const row of rows) {
      if (LOCALES.value.includes(row.locale)) {
        const locale = row.locale
        forms[locale] = { title: row.title, body: row.body, published: row.status === 'published' }
        // Auch bei einer Vorlage ist der gelieferte Text die „Urfassung"
        // (core/shared/editorBody.ts): wer sie nur aufschlägt und speichert, soll
        // sie WORTGLEICH bekommen — nicht Tiptaps Rückserialisierung.
        pristineBody[locale] = row.body
        normalizedBody[locale] = null
      }
    }
  }
  catch {
    toast.add({ title: t('pages.admin.loadFailed'), description: t('pages.admin.loadFailedHint'), color: 'error' })
  }
}

function newPage() {
  isNew.value = true
  isTemplate.value = false
  selectedSlug.value = null
  slugInput.value = ''
  activeLocale.value = LOCALES.value[0] ?? defaultLocale
  resetForms()
}

async function saveActiveLocale() {
  const locale = activeLocale.value
  const slug = (isNew.value ? slugInput.value : selectedSlug.value ?? '').trim()
  if (!slug) {
    toast.add({ title: t('pages.admin.slugRequired'), color: 'error' })
    return
  }
  const form = forms[locale]
  if (!form || !form.title.trim()) {
    // Dass der Titel PRO Sprachversion gilt, sieht man dem Reiter nicht an
    toast.add({ title: t('pages.admin.titleRequired'), description: t('pages.admin.titleRequiredHint'), color: 'error' })
    return
  }
  const body = bodyToSave(locale)
  if (body.length > MAX_PAGE_BODY) {
    toast.add({
      title: t('pages.admin.bodyTooLong', { count: body.length.toLocaleString(), max: MAX_PAGE_BODY.toLocaleString() }),
      description: t('pages.admin.bodyTooLongHint'),
      color: 'error',
    })
    return
  }
  saving.value = true
  try {
    await $fetch('/api/pages', {
      method: 'PUT',
      body: { slug, locale, title: form.title, body, status: form.published ? 'published' : 'draft' },
    })
    // Gespeichert wird IMMER nur der aktive Reiter — ohne den Hinweis hält
    // man die anderen Sprachversionen für miterledigt.
    toast.add({
      title: t('pages.admin.saved'),
      description: t('pages.admin.savedHint', { language: languageName(locale) }),
      color: 'success',
    })
    // Ab jetzt ist das Gespeicherte die Urfassung — sonst schriebe ein
    // zweites Speichern wieder die alte zurück.
    pristineBody[locale] = body
    normalizedBody[locale] = null
    isNew.value = false
    // Ab jetzt steht eine Zeile dahinter — der Vorlagen-Hinweis wäre falsch,
    // und „Löschen" ist wieder möglich.
    isTemplate.value = false
    selectedSlug.value = slug
    await refreshList()
  }
  catch {
    // Übersetzter Text statt rohem `statusMessage` (Audit-Befund C12) — s. die
    // gleichlautende Stelle in comments/dashboard/community/embed.vue.
    toast.add({
      title: t('pages.admin.saveFailed'),
      description: t('pages.admin.saveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

// ── KI-Vorschlag (F60) ─────────────────────────────────────────────────────
/**
 * Der Knopf erscheint nur, wenn BEIDES stimmt: der Server meldet einen
 * hinterlegten KI-Schlüssel (`aiTranslate`) und der Tarif enthält das Produkt
 * (`planAllows('ai')`). Ein Knopf, der beim Drücken 402 oder 503 antwortet,
 * wäre ein Versprechen, das die Seite nicht halten kann — die Route prüft
 * beides trotzdem selbst, sie ist die Grenze, dies hier nur die Höflichkeit.
 */
const aiTranslateAvailable = computed(() => !!listData.value?.aiTranslate && planAllows('ai'))
const translating = ref(false)

/** Sprachen, in denen im Formular gerade wirklich etwas steht. */
const filledLocales = computed(() => LOCALES.value.filter(locale => (forms[locale]?.title.trim() || forms[locale]?.body.trim())))

/**
 * Aus WELCHER Fassung übersetzt wird: die erste andere mit Inhalt, bevorzugt
 * die Standardsprache (`translationSourceLocale`). Gibt es keine, bleibt der
 * Knopf weg — aus dem Nichts übersetzt niemand.
 */
const translateSource = computed(() => translationSourceLocale(activeLocale.value, filledLocales.value, defaultLocale))

/**
 * Der Deckel wird VOR dem Klick angesagt, nicht danach (Davids Entscheidung d,
 * 2026-09-10). Ein Rechtstext über 12.000 Zeichen ist ein Fall für einen
 * Menschen; ein Knopf, der ihn annimmt und dann abbricht, hätte Zeit und
 * Kontingent gekostet.
 */
const translateSourceTooLong = computed(() => {
  const source = translateSource.value
  return !!source && (forms[source]?.body.length ?? 0) > MAX_PAGE_TRANSLATE_BODY
})

async function translateWithAi() {
  const target = activeLocale.value
  const source = translateSource.value
  const from = source ? forms[source] : null
  if (translating.value || !from || translateSourceTooLong.value) return
  translating.value = true
  try {
    const suggestion = await $fetch<PageTranslateResponse>('/api/pages/translate', {
      method: 'POST',
      // Aus dem FORMULAR, nicht aus der Datenbank — sonst ließe sich beim
      // Anlegen einer Seite nichts übersetzen (da gibt es noch keine Zeile).
      body: { locale: target, title: from.title.trim(), body: from.body },
    })
    const form = forms[target]
    if (!form) return
    // Ein leerer Vorschlag lässt das Feld in Ruhe — sonst löschte ein
    // misslungener Versuch, was jemand von Hand geschrieben hat.
    if (suggestion.title) form.title = suggestion.title
    if (suggestion.body) {
      form.body = suggestion.body
      // Der Vorschlag IST jetzt die Fassung, die gespeichert werden soll:
      // ohne diese Zeile hielte `bodyToSave` die (leere) Urfassung für den
      // Wahrheitswert und schriebe sie zurück (core/shared/editorBody.ts).
      pristineBody[target] = ''
      normalizedBody[target] = suggestion.body
    }
    // Der Vorschlag ist NICHT gespeichert und NICHT veröffentlicht — das
    // muss dastehen, sonst hält man ihn für erledigt.
    toast.add({
      title: t('pages.admin.translated'),
      description: t('pages.admin.translatedHint'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('pages.admin.translateFailed'),
      description: t('pages.admin.translateFailedHint'),
      color: 'error',
    })
  }
  finally {
    translating.value = false
  }
}

async function deletePage() {
  const slug = selectedSlug.value
  if (!slug) return
  try {
    const ok = await confirm({
      title: t('pages.admin.confirmDeleteTitle'),
      description: t('pages.admin.confirmDeleteText', { slug }),
      confirmLabel: t('pages.admin.delete'),
      // String-Konkatenation statt Template-Literal: das Literal matcht im
      // typed router AUCH /api/pages/public (GET-only, seit der Nav-Liste) —
      // der Methoden-Schnitt verbietet dann faelschlich DELETE.
      action: () => $fetch('/api/pages/' + encodeURIComponent(slug), { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('pages.admin.deleted'), color: 'success' })
    // Nach dem Löschen zurück in die Liste — der Editor hätte kein Ziel mehr.
    closeEditor()
    await refreshList()
  }
  catch {
    toast.add({ title: t('pages.admin.deleteFailed'), description: t('pages.admin.deleteFailedHint'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="pages">
    <template #header>
      <UDashboardNavbar :title="t('pages.admin.title')">
        <template #leading>
          <UButton
            v-if="editing"
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('pages.admin.backToList')"
            @click="closeEditor"
          />
          <UDashboardSidebarCollapse v-else />
        </template>
        <template #right>
          <UButton v-if="!editing" icon="i-ph-plus" :label="t('pages.admin.new')" @click="newPage" />
        </template>
      </UDashboardNavbar>
    </template>

    <!-- #body ist der Scroll-Container des Panels — Menü + Formular scrollen hier,
         die Fußleiste (#footer) bleibt wie die Kopfleiste immer sichtbar. -->
    <template #body>
      <!-- Liste, solange keine Seite offen ist -->
      <template v-if="!editing">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('pages.admin.searchPlaceholder')"
          class="mb-4 max-w-md"
          data-pages-search
        />

        <UTable :data="filteredGroups" :columns="columns" data-pages-table>
          <template #slug-cell="{ row }">
            <button
              type="button"
              class="cursor-pointer font-mono font-medium text-default hover:text-primary hover:underline"
              @click="selectPage(row.original.slug)"
            >
              /{{ row.original.slug }}
            </button>
          </template>
          <template #title-cell="{ row }">
            <span class="flex items-center gap-2">
              <span class="text-sm">{{ displayTitle(row.original) }}</span>
              <UBadge v-if="row.original.isTemplate" size="sm" color="neutral" variant="outline">
                {{ t('pages.admin.templateBadge') }}
              </UBadge>
            </span>
          </template>
          <!-- Je APP-Sprache ein Badge, auch für die fehlende (F60). -->
          <template #locales-cell="{ row }">
            <span class="flex flex-wrap gap-1">
              <UBadge
                v-for="badge in localeBadges(row.original)"
                :key="badge.locale"
                size="sm"
                :color="BADGE_COLOR[badge.state]"
                :variant="BADGE_VARIANT[badge.state]"
                :class="badge.state === 'missing' ? 'text-muted' : ''"
                :title="t(`pages.admin.localeState.${badge.state}`, { language: languageName(badge.locale) })"
                :data-locale-badge="`${badge.locale}:${badge.state}`"
              >{{ badge.locale }}</UBadge>
            </span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-ph-pencil-simple"
                :label="t('pages.admin.edit')"
                @click="selectPage(row.original.slug)"
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
              icon="i-ph-file-text"
              :title="t('pages.admin.emptyTitle')"
              :description="t('pages.admin.empty')"
              :action-label="t('pages.admin.new')"
              action-icon="i-ph-plus"
              @action="newPage"
            />
          </template>
        </UTable>
      </template>

      <div class="grid gap-6">
        <!-- Formular -->
        <div v-if="editing" class="min-w-0 space-y-4">
          <!-- Vorlage: sagen, was hier steht und was das Speichern bewirkt.
               Ohne den Hinweis sähe die Seite aus wie eine gespeicherte. -->
          <UAlert
            v-if="isTemplate"
            icon="i-ph-info"
            color="neutral"
            variant="subtle"
            :title="t('pages.admin.templateBadge')"
            :description="t('pages.admin.templateHint')"
          />

          <UFormField :label="t('pages.admin.slug')" :help="t('pages.admin.slugHelp')">
            <UInput v-model="slugInput" :disabled="!isNew" :placeholder="t('pages.admin.slugPlaceholder')" class="w-full font-mono" />
          </UFormField>

          <UTabs v-model="activeLocale" :items="localeTabs" class="w-full">
            <template #content="{ item }">
              <div class="space-y-3 pt-2">
                <UFormField :label="t('pages.admin.pageTitle')">
                  <template v-if="aiTranslateAvailable && translateSource" #hint>
                    <UButton
                      icon="i-ph-sparkle"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :loading="translating"
                      :disabled="translating || translateSourceTooLong"
                      :title="translateSourceTooLong
                        ? t('pages.admin.translateTooLong', { max: MAX_PAGE_TRANSLATE_BODY.toLocaleString() })
                        : undefined"
                      data-page-translate
                      @click="translateWithAi"
                    >
                      {{ t('pages.admin.translateWithAi', { language: languageName(translateSource) }) }}
                    </UButton>
                  </template>
                  <UInput v-model="forms[item.value as Locale]!.title" class="w-full" />
                  <template v-if="translateSourceTooLong && aiTranslateAvailable && translateSource" #help>
                    <span class="text-muted">{{ t('pages.admin.translateTooLong', { max: MAX_PAGE_TRANSLATE_BODY.toLocaleString() }) }}</span>
                  </template>
                </UFormField>
                <UFormField :label="t('pages.admin.body')">
                  <template #hint>
                    <UTabs
                      v-model="bodyMode"
                      :items="bodyModeItems"
                      :content="false"
                      size="xs"
                      color="neutral"
                    />
                  </template>
                  <!-- Genau EINE Ansicht ist montiert (siehe Kopfkommentar, Punkt 3). -->
                  <div class="space-y-2">
                    <UEditor
                      v-if="bodyMode === 'write'"
                      v-slot="{ editor }"
                      v-model="forms[item.value as Locale]!.body"
                      content-type="markdown"
                      :starter-kit="editorStarterKit"
                      :image="false"
                      :mention="false"
                      class="w-full rounded-md border border-default"
                      :ui="{ base: 'px-3 py-2', content: 'min-h-64' }"
                    >
                      <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
                    </UEditor>

                    <template v-else-if="bodyMode === 'markdown'">
                      <UTextarea
                        v-model="forms[item.value as Locale]!.body"
                        :rows="18"
                        class="w-full"
                        :ui="{ base: 'font-mono text-sm' }"
                      />
                      <p class="text-xs text-muted">{{ t('pages.admin.markdownHint') }}</p>
                    </template>

                    <template v-else>
                      <div class="min-h-64 rounded-md border border-default px-4 py-3">
                        <p class="mb-2 text-xs text-muted">{{ t('pages.admin.previewHint') }}</p>
                        <article class="space-y-3">
                          <h1 class="text-2xl font-bold">{{ forms[item.value as Locale]!.title }}</h1>
                          <MarkdownContent v-if="forms[item.value as Locale]!.body.trim()" :source="forms[item.value as Locale]!.body" />
                          <p v-else class="text-sm text-muted">{{ t('pages.admin.previewEmpty') }}</p>
                        </article>
                      </div>
                    </template>
                  </div>
                  <template #help>
                    <span :class="forms[item.value as Locale]!.body.length > MAX_PAGE_BODY ? 'text-error' : ''">
                      {{ t('pages.admin.charCount', { count: forms[item.value as Locale]!.body.length.toLocaleString(), max: MAX_PAGE_BODY.toLocaleString() }) }}
                    </span>
                  </template>
                </UFormField>
              </div>
            </template>
          </UTabs>
        </div>
      </div>
    </template>

    <!-- Fußleiste: wirkt auf die aktive Sprachversion (Tab) -->
    <template #footer>
      <div v-if="editing" class="flex items-center justify-between gap-3 border-t border-default px-4 py-3 sm:px-6">
        <USwitch v-model="forms[activeLocale]!.published" :label="t('pages.admin.published')" />
        <div class="flex items-center gap-2">
          <!-- Bei einer Vorlage gibt es nichts zu löschen (noch keine Zeile). -->
          <UButton
            v-if="selectedSlug && !isTemplate"
            color="error"
            variant="soft"
            icon="i-ph-trash"
            :label="t('pages.admin.delete')"
            @click="deletePage"
          />
          <UButton :loading="saving" :disabled="bodyTooLong" :label="t('pages.admin.save')" @click="saveActiveLocale" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
