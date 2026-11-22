<script setup lang="ts">
import { CATEGORY_LIST_KEY, DISCUSSION_TOPICS_KEY } from '../../shared/discussionDataKeys'
import type { CategoryListResponse } from '../../shared/types/post'

/**
 * „Thema eröffnen" — der EINSTIEG der Discussions (2026-08-04, Davids Regel:
 * Feed und Discussions sind unabhängige Produkte, jedes muss für sich allein
 * vollständig funktionieren).
 *
 * WAS VORHER FEHLTE: ein Thema ließ sich nur über den Feed-Composer eröffnen.
 * Unter `/discussions` gab es keinen Knopf — wer die Diskussionen öffnete,
 * musste erst den Feed kennen, um dort etwas beizutragen. Damit setzte ein
 * Produkt das andere als Einstieg voraus.
 *
 * GETEILT WIRD DER MECHANISMUS, NICHT DER EINSTIEG: hinter diesem Knopf steht
 * derselbe `PostComposer`, dieselbe Route (`POST /api/posts`), dieselbe
 * Datenhaltung. Es gibt KEINEN zweiten Schreibweg — nur eine zweite Stelle, an
 * der die Absicht entsteht.
 *
 * ── RECHTE: NICHTS NEU ERFUNDEN ────────────────────────────────────────────
 * Sichtbar ist der Knopf unter genau derselben Bedingung wie der Composer im
 * Feed: `isLoggedIn`. Alles Weitere entscheidet die Route, und zwar für beide
 * Einstiege dieselbe: entzogener Zugang und die M13-Zahlungssperre schlagen an
 * der Datentür zu (`tenantDb`, `actor: 'member'`), der 403 trägt seinen Grund
 * als `reason`, und der Hinweis dazu kommt aus dem einen Leser in core
 * (community-suspended-notice.client.ts). Eine zweite, hier nachgebaute
 * Prüfung wäre die Stelle, an der die beiden Einstiege auseinanderlaufen.
 *
 * ── WARUM DER KNOPF MANCHMAL FEHLT ─────────────────────────────────────────
 * Ohne AKTIVE Kategorie gibt es nichts zu eröffnen: ein Beitrag ohne Kategorie
 * erscheint unter Discussions gar nicht, und eine stillgelegte Kategorie nimmt
 * keine neuen Beiträge mehr auf (resolveCategoryId wirft 422). Auf der Seite
 * einer stillgelegten Kategorie verschwindet der Knopf deshalb — ein Knopf,
 * der sicher in einen Fehler läuft, ist schlechter als keiner.
 */
const props = defineProps<{
  /** Kategorie-Slug aus dem Pfad — vorbelegt den Composer. Leer = Übersicht. */
  categorySlug?: string
}>()

const { t } = useI18n()
const { isLoggedIn } = useCurrentUser()

/**
 * Dieselbe Abfrage wie die Kategorie-Seite, unter DEMSELBEN Schlüssel (siehe
 * shared/discussionDataKeys.ts): ein Request, geteilter SSR-Payload. `all=1`,
 * weil die Seite auch stillgelegte Kategorien auflösen können muss — hier wird
 * anschließend auf die aktiven eingegrenzt.
 */
const { data, error, refresh } = await useFetch<CategoryListResponse>('/api/posts/categories', {
  key: CATEGORY_LIST_KEY,
  query: { all: '1' },
})

/**
 * LZ1: scheitern die Kategorien (kein Status = Netz, oder 5xx), verschwand der
 * Knopf still — jetzt steht der Neuversuch an seiner Stelle. 403/404 (Produkt
 * aus) sind ERWARTET und lassen es beim Ausblenden; Gäste sehen den Knopf nie.
 */
const loadFailed = computed(() => {
  return isFetchOutage(error.value)
})

const activeCategories = computed(() => (data.value?.rows ?? [])
  .map(entry => entry.category)
  .filter(category => category.active))

const presetCategoryId = computed(() => {
  if (!props.categorySlug) return ''
  return activeCategories.value.find(category => category.slug === props.categorySlug)?.$id ?? ''
})

/**
 * Auf einer Kategorie-Seite hängt der Knopf an DIESER Kategorie — ist sie
 * stillgelegt, gibt es hier nichts zu eröffnen (auch wenn andere Kategorien
 * offen sind: der Knopf stünde unter einer Überschrift, die er nicht meint).
 */
const canOpen = computed(() => (props.categorySlug
  ? presetCategoryId.value !== ''
  : activeCategories.value.length > 0))

/**
 * Der Öffnungs-Zustand ist ein optionales Modell, kein privates `ref`: der
 * LEERE Zustand der Themen-Tabelle bietet dieselbe Handlung an (M7) und liegt
 * in einer Geschwister-Komponente. Ohne `v-model:open` verhält sich der Knopf
 * unverändert — die Vorgabe `false` trägt ihn dann allein.
 */
const open = defineModel<boolean>('open', { default: false })

function onCreated(_post: unknown, scheduled: boolean) {
  open.value = false
  // Ein GEPLANTES Thema ist noch nicht da — die Liste neu zu holen würde nur
  // dasselbe zeigen und den Eindruck erwecken, es sei etwas verschwunden.
  // Der Composer erklärt den Fall in seinem Toast.
  if (!scheduled) void refreshNuxtData(DISCUSSION_TOPICS_KEY)
}
</script>

<template>
  <!-- Der Knopf ist der TRIGGER des Modals (Standard-Slot) — so bleibt das
       Fenster an seinem Auslöser, und die Seite platziert nur ein Element.
       Ausgehängt wird nichts beim Schließen (Reka-Falle: offene Modals nie
       per v-if unmounten); das `v-if` sitzt deshalb am ganzen Gebilde und
       entscheidet nur, ob es diesen Einstieg überhaupt gibt. -->
  <UModal
    v-if="isLoggedIn && canOpen"
    v-model:open="open"
    :title="t('posts.discussions.newTopic')"
  >
    <UButton icon="i-ph-plus" data-discussions-new-topic>
      {{ t('posts.discussions.newTopic') }}
    </UButton>

    <template #body>
      <PostComposer
        mode="topic"
        :preset-category-id="presetCategoryId"
        @created="onCreated"
      />
    </template>
  </UModal>
  <CoreInlineLoadError v-else-if="isLoggedIn && loadFailed" :retry="refresh" data-discussions-new-topic-error />
</template>
