<script setup lang="ts">
/**
 * Detailseite des Layers. Apps überschreiben diese Seite, um den
 * #comments-Slot mit ihrem comments-Layer zu füllen (A14-Komposition,
 * siehe comments) — der Layer selbst kennt comments nicht.
 */
import { markdownExcerpt } from '../../../../core/shared/markdownExcerpt'
import type { EventDetailResponse } from '../../../shared/types/event'
import { eventIsRedacted } from '../../../shared/eventModerationPolicy'

const route = useRoute()
const { t } = useI18n()

const { data: initial, error } = await useFetch<EventDetailResponse>(`/api/events/${route.params.id}`)
if (error.value || !initial.value) {
  throw createError({ status: 404, statusText: 'Event not found' })
}

/**
 * GESCHWÄRZT (F46): leerer Titel ⇒ der Tab zeigte die URL. Dieselbe Zeile steht
 * in der Bauplan-Fassung dieser Seite — sie ist die, die in Apps MIT blueprint
 * tatsächlich gerendert wird, und eine Kopie ohne die andere wäre genau der
 * Unterschied zwischen Pool und Silo, den PRODUKT-BILANZ.md ausschließt.
 */
useBrandTitle(() => eventIsRedacted(initial.value?.redactedAt)
  ? t('events.redacted.title')
  : initial.value?.title ?? '', {
  // BESCHREIBUNG (Q10, SEO-003): der Anfang der Termin-Beschreibung — die
  // Seite hatte keine. Ein geschwärzter Termin liefert leeren Text und damit
  // keine. Steht wie die Titel-Zeile in BEIDEN Fassungen dieser Seite.
  description: () => eventIsRedacted(initial.value?.redactedAt) ? '' : markdownExcerpt(initial.value?.description),
})

// EINE MASSGEBLICHE ADRESSE (Q10, SEO-004): die in der Hauptsprache der Community.
useCommunityContentSeo()
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <EventDetail :initial="initial!" />
  </UContainer>
</template>
