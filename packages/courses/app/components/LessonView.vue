<script setup lang="ts">
import { COURSE_NOT_A_MEMBER_CODE, type CourseDetailResponse, type LessonRow, type LessonTranslateResponse } from '../../shared/types/course'

/**
 * LessonView: Markdown XSS-sicher (Core-Sink), optionaler Video-Link
 * (generisches Icon — bewusst KEINE Provider-Erkennung aus dem events-Layer,
 * A14), „Lektion abschließen", Fortschritt, Prev/Next. Den #comments-Slot
 * füllt die APP mit CommentSection (targetType 'lesson').
 */
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()

const [{ data: lesson, error }, { data: course, refresh: refreshCourse }] = await Promise.all([
  useFetch<LessonRow & { courseSlug: string }>(`/api/lessons/${route.params.id}`),
  useFetch<CourseDetailResponse>(`/api/courses/${route.params.slug}`),
])
/**
 * Kein Mitglied dieser Community (SEC-029): die Kurs-Vorschau ist öffentlich,
 * der Inhalt nicht. Statt einer Fehlerseite ein klarer Satz und der Weg
 * zurück zur Vorschau — dort steht, was der Kurs bietet.
 */
const notMember = computed(() => {
  const err = error.value as { statusCode?: number, data?: { reason?: string } } | null | undefined
  return err?.statusCode === 403 && err.data?.reason === COURSE_NOT_A_MEMBER_CODE
})
if (!notMember.value && (error.value || !lesson.value || !course.value)) {
  throw createError({ status: 404, statusText: 'Lesson not found' })
}

// Der Titel gehört hierher und nicht in die Seite: die Lektion kennt nur diese
// Komponente (die Bauplan-Seite reicht bloß den Kommentar-Slot durch).
// useBrandTitle statt useHead — sonst stünde im Tab nur „Lektion 3", ohne die
// Community, zu der sie gehört.
useBrandTitle(() => lesson.value?.title ?? '')

const lessonIndex = computed(() => course.value!.lessons.findIndex(l => l.$id === lesson.value!.$id))
const prev = computed(() => (lessonIndex.value > 0 ? course.value!.lessons[lessonIndex.value - 1] : null))
const next = computed(() => (lessonIndex.value >= 0 && lessonIndex.value < course.value!.lessons.length - 1 ? course.value!.lessons[lessonIndex.value + 1] : null))
const isDone = computed(() => course.value!.completedLessonIds.includes(lesson.value!.$id))
const progressPercent = computed(() => {
  const c = course.value!
  return c.lessons.length === 0 ? 0 : Math.round((c.completedLessonIds.length / c.lessons.length) * 100)
})

/**
 * ÜBERSETZEN (Davids Entscheidung 2026-08-18) — Titel und Inhalt DIESER
 * Lektion. Die Regel liegt im Core-Composable; hier steht nur, was dieses
 * Produkt übersetzt und welche Route das tut.
 *
 * JE LEKTION EINZELN, und das ist der Grund, warum der Knopf hier steht und
 * nicht auf der Kurs-Übersicht: ein Kurs mit dreißig Lektionen wäre sonst EIN
 * Klick mit dreißig bezahlten KI-Aufrufen, von denen der Leser vielleicht zwei
 * gebraucht hätte. Die Route hängt zudem an denselben Vorprüfungen wie das
 * Lesen (Einschreibung, Zugang) — übersetzt wird nur, was man ohnehin sehen darf.
 *
 * Diese Komponente ist die EINZIGE Anlegestelle: die Bauplan-Seite reicht nur
 * den Kommentar-Slot durch (A14).
 */
const {
  canTranslate,
  showing: translationShowing,
  busy: translationBusy,
  entry: translation,
  show: showTranslation,
  showOriginal: showLessonOriginal,
} = useUgcTranslation({
  translations: () => lesson.value?.translations,
  body: () => lesson.value?.content ?? '',
  translate: async (targetLocale) => {
    const result = await $fetch<LessonTranslateResponse>(`/api/lessons/${lesson.value!.$id}/translate`, {
      method: 'POST',
      body: { locale: targetLocale },
    })
    // `null` heißt „das Original hat keinen Titel" — der Eintrag trägt das Feld
    // dann gar nicht, und die Anzeige fällt auf den Originaltitel zurück.
    return { ...(result.title ? { title: result.title } : {}), body: result.body }
  },
})

/** Was tatsächlich dasteht — mit Rückfall auf die Grundfassung je Feld. */
const shownTitle = computed(() =>
  translationShowing.value ? (translation.value?.title ?? lesson.value!.title) : lesson.value!.title)
const shownContent = computed(() =>
  translationShowing.value ? (translation.value?.body ?? lesson.value!.content) : lesson.value!.content)

const completing = ref(false)
async function complete() {
  completing.value = true
  try {
    const res = await $fetch<{ courseCompleted: boolean }>(`/api/lessons/${lesson.value!.$id}/complete`, { method: 'POST' })
    await refreshCourse()
    toast.add({
      title: res.courseCompleted ? t('courses.lesson.courseDone') : t('courses.lesson.done'),
      color: 'success',
    })
  }
  catch {
    toast.add({ title: t('courses.lesson.failed'), description: t('courses.lesson.failedHint'), color: 'error' })
  }
  finally {
    completing.value = false
  }
}
</script>

<template>
  <UContainer v-if="notMember" class="max-w-3xl py-8">
    <UAlert
      color="warning" variant="subtle" icon="i-ph-lock"
      :title="t('courses.detail.notMember')"
      :description="t('courses.lesson.notMemberHint')"
      data-testid="lesson-not-member"
    >
      <template #actions>
        <UButton :to="localePath(`/courses/${route.params.slug}`)" color="neutral" variant="soft" size="sm" icon="i-ph-arrow-left">
          {{ t('courses.lesson.backToCourse') }}
        </UButton>
      </template>
    </UAlert>
  </UContainer>
  <UContainer v-else class="max-w-3xl py-8">
    <UButton
      :to="localePath(`/courses/${route.params.slug}`)"
      color="neutral" variant="ghost" size="sm" icon="i-ph-arrow-left" class="mb-4"
    >
      {{ course!.title }}
    </UButton>

    <div class="mb-4 flex items-center gap-3">
      <UProgress :model-value="progressPercent" class="flex-1" />
      <span class="shrink-0 text-xs text-muted" data-testid="lesson-progress">{{ progressPercent }}%</span>
    </div>

    <h1 class="text-2xl font-bold">{{ shownTitle }}</h1>

    <UButton
      v-if="lesson!.videoUrl"
      :href="lesson!.videoUrl" external target="_blank"
      color="neutral" variant="soft" size="sm" icon="i-ph-video-camera" class="mt-4"
      data-testid="lesson-video"
    >
      {{ t('courses.lesson.video') }}
    </UButton>

    <!-- Markdown ohne Raw-HTML (Core-Sink — Lehre aus dem CSS-Sink-Audit) -->
    <MarkdownContent :source="shownContent" class="mt-6 text-sm leading-relaxed" data-testid="lesson-content" />

    <!-- Übersetzen: dezent unter dem Inhalt (Muster PostCard/EventDetail) -->
    <div v-if="canTranslate" class="mt-2 flex flex-wrap items-center gap-1 text-xs text-dimmed">
      <template v-if="translationShowing">
        <UIcon name="i-ph-translate" class="size-3.5 shrink-0" />
        <span>{{ t('translation.notice') }}</span>
        <span aria-hidden="true">·</span>
        <UButton color="neutral" variant="link" size="xs" class="p-0" data-testid="lesson-translate-original" @click="showLessonOriginal">
          {{ t('translation.showOriginal') }}
        </UButton>
      </template>
      <UButton
        v-else
        color="neutral"
        variant="link"
        size="xs"
        class="-ms-1 p-0"
        icon="i-ph-translate"
        :loading="translationBusy"
        data-testid="lesson-translate"
        @click="showTranslation"
      >
        {{ t('translation.action') }}
      </UButton>
    </div>

    <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
      <UButton
        v-if="prev"
        :to="localePath(`/courses/${route.params.slug}/lessons/${prev.$id}`)"
        color="neutral" variant="ghost" size="sm" icon="i-ph-caret-left"
      >
        {{ prev.title }}
      </UButton>
      <span v-else />

      <UButton
        :color="isDone ? 'neutral' : 'success'"
        :variant="isDone ? 'outline' : 'solid'"
        :icon="isDone ? 'i-ph-check-circle-fill' : 'i-ph-check'"
        :loading="completing"
        :disabled="isDone"
        data-testid="lesson-complete"
        @click="complete"
      >
        {{ isDone ? t('courses.lesson.doneBadge') : t('courses.lesson.complete') }}
      </UButton>

      <UButton
        v-if="next"
        :to="localePath(`/courses/${route.params.slug}/lessons/${next.$id}`)"
        color="neutral" variant="ghost" size="sm" trailing-icon="i-ph-caret-right"
      >
        {{ next.title }}
      </UButton>
      <span v-else />
    </div>

    <div class="mt-10">
      <slot name="comments" :lesson="lesson!" />
    </div>
  </UContainer>
</template>
