<script setup lang="ts">
import type { CourseListResponse, CourseRow } from '../../../shared/types/course'

/**
 * Kurs-Galerie: öffentlich, auch für Gäste (SEC-029) — Karten mit
 * Zugang-Badge, für Mitglieder zusätzlich der Einschreibe-Status.
 */
const { t } = useI18n()
const localePath = useLocalePath()

useBrandTitle(() => t('courses.list.title'))

const { data, status } = await useFetch<CourseListResponse>('/api/courses')

/**
 * DER EINSTIEG IN DIE VERWALTUNG (F58, 2026-08-16) — bis hierher gab es ihn auf
 * dieser Seite GAR NICHT, für keine Rolle: Anlegen und Bearbeiten lebten
 * ausschließlich unter /dashboard/courses, und wer den Pfad nicht auswendig
 * kannte, stand vor einer Galerie ohne Ausgang. Das sah wie ein Rechte-Problem
 * aus und war eine fehlende Tür (Davids Leitprinzip: die Kernhandlung eines
 * Produkts muss AUS DEM PRODUKT HERAUS erreichbar sein).
 *
 * `useCapability` statt `useCommunityCapability`: im Silo/Playground gibt es
 * keine Community-Rolle, wohl aber Betreiber mit dem globalen Label.
 *
 * „Neuer Kurs" ÖFFNET DEN DIALOG HIER (Davids Entscheidung zum ersten
 * F58-Entwurf, der nach /dashboard/courses?new=1 verlinkte): geteilt gehört der
 * Mechanismus — dasselbe `CourseFormModal` wie im Dashboard —, nicht der
 * Einstieg. Danach geht es trotzdem in den Builder, denn ein Kurs ohne
 * Lektionen ist eine leere Hülle; das ist der Unterschied zu einem Termin, der
 * nach dem Formular fertig ist.
 *
 * „Verwalten" BLEIBT ein Link und beantwortet die andere Frage: ENTWÜRFE
 * stehen nicht in dieser Galerie (die Route liefert nur veröffentlichte),
 * archivierte Kurse ebenso wenig.
 */
const canManage = useCapability('courses.manage')

const createOpen = ref(false)

/** Frisch angelegt = leere Hülle: weiter dorthin, wo Lektionen entstehen. */
function onCreated(row: CourseRow) {
  void navigateTo(localePath(`/dashboard/courses/${row.$id}`))
}

const accessColor = (access: string) =>
  access === 'paid' ? 'warning' as const : access === 'members' ? 'info' as const : 'success' as const
</script>

<template>
  <UContainer class="max-w-4xl py-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold">{{ t('courses.list.title') }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t('courses.list.description') }}</p>
      </div>
      <div v-if="canManage" class="flex shrink-0 items-center gap-2" data-testid="courses-manage-actions">
        <UButton
          :to="localePath('/dashboard/courses')"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-sliders-horizontal"
          data-testid="courses-manage"
        >
          {{ t('courses.list.manage') }}
        </UButton>
        <UButton
          size="sm"
          icon="i-ph-plus"
          data-testid="courses-create"
          @click="() => { createOpen = true }"
        >
          {{ t('courses.list.create') }}
        </UButton>
      </div>
    </div>

    <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
      <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
    </div>

    <p v-else-if="!data?.rows.length" class="py-16 text-center text-sm text-muted" data-testid="courses-empty">
      {{ t('courses.list.empty') }}
    </p>

    <div v-else class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="courses-list">
      <NuxtLink
        v-for="course in data.rows"
        :key="course.$id"
        :to="localePath(`/courses/${course.slug}`)"
        class="flex flex-col rounded-xl border border-default p-5 transition-colors hover:bg-elevated/40"
        :data-course-card="course.slug"
      >
        <div class="flex items-center gap-2">
          <h2 class="flex-1 font-semibold">{{ course.title }}</h2>
          <UBadge :color="accessColor(course.access)" variant="subtle" size="sm">
            {{ t(`courses.access.${course.access}`) }}
          </UBadge>
          <UBadge v-if="course.enrolled" color="success" variant="subtle" size="sm" data-testid="enrolled-badge">
            {{ t('courses.list.enrolled') }}
          </UBadge>
        </div>
        <p class="mt-2 line-clamp-3 flex-1 text-sm text-muted">{{ course.description }}</p>
        <p class="mt-3 flex items-center gap-3 text-xs text-muted">
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-ph-list-numbers" class="size-4" />
            {{ t('courses.list.lessons', { count: course.lessonCount }) }}
          </span>
          <span v-if="course.authorName" class="inline-flex items-center gap-1">
            <UIcon name="i-ph-user" class="size-4" />
            {{ course.authorName }}
          </span>
        </p>
      </NuxtLink>
    </div>

    <CourseFormModal v-model:open="createOpen" @created="onCreated" />
  </UContainer>
</template>
