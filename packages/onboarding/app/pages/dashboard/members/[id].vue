<script setup lang="ts">
import type { CommunityRole } from '../../../../../core/shared/communityAuthz'
import type { CommunityMemberProfileResponse } from '../../../../shared/types/membersMap'

/**
 * EIN MITGLIED IM DETAIL — und ausdrücklich KEIN öffentliches Profil.
 *
 * Erreichbar nur eingeloggt UND als Mitglied DERSELBEN Community; die Route
 * dahinter (`/api/community/members/:id/profile`) setzt beides durch und
 * antwortet für jede fremde Id mit 404 — dasselbe 404 wie für eine erfundene.
 * Diese Seite tut deshalb nichts, ausser den Fehlerzustand ehrlich zu zeigen:
 * ein „Mitglied nicht gefunden" ohne Verdacht auf mehr.
 *
 * ── WAS HIER STEHT UND WARUM ───────────────────────────────────────────────
 * Zwei Sorten Angaben, sichtbar getrennt:
 *  - was der Mensch SELBST veröffentlicht hat (Avatar, Name, Handle, Ort, Bio),
 *  - COMMUNITY-Fakten (Rolle, dabei seit).
 * Keine E-Mail, keine Telefonnummer, keine Sitzungen — die Route liefert sie
 * gar nicht erst.
 *
 * Die Mini-Karte erscheint NUR mit Standort. Eine Weltkarte ohne Punkt wäre
 * eine Fläche, die etwas verspricht, was hier niemand angegeben hat.
 *
 * MIT UMGEZOGEN am 2026-08-23 (Davids Entscheidung): /dashboard/members/:id
 * statt /dashboard/community/members/:id — Mitglieder sind kein Gegenstand der
 * Community-EINSTELLUNGEN. Begründung im Kopf von `index.vue` nebenan; die alte
 * Adresse antwortet 301 (packages/onboarding/nuxt.config.ts).
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'members.invite' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const memberId = computed(() => String(route.params.id ?? ''))

const { data, error } = await useFetch<CommunityMemberProfileResponse>(
  () => `/api/community/members/${memberId.value}/profile`,
)

const ROLE_COLOR: Record<CommunityRole, 'primary' | 'info' | 'warning' | 'neutral'> = {
  owner: 'primary',
  admin: 'info',
  moderator: 'warning',
  editor: 'neutral',
  viewer: 'neutral',
}

const displayName = computed(() => data.value?.name || data.value?.handle || t('members.map.unnamed'))

useBrandTitle(() => (data.value ? displayName.value : t('members.profile.notFoundTitle')))

// Im Script statt als Literal im Template: vue-tsc ab 3.3.9 liest jedes `//`
// in den Props einer Komponente als Zeilenkommentar, auch in einem String, und
// erzeugt ungültigen virtuellen Code (vuejs/language-tools#6240, Fix-PR #6241).
const geonamesUrl = 'https://www.geonames.org'
</script>

<template>
  <!-- EIGENE DASHBOARD-SEITE seit dem Umzug (2026-08-23): Panel, Kopfzeile und
       Breiten-Klammer gehören ihr selbst — die Community-Hülle rendert die
       Mitglieder nicht mehr. Der TITEL der Navbar ist bewusst der der Liste
       und nicht der Name des Menschen: der steht als Überschrift im Inhalt,
       und ein Name in der Navbar sähe auf der „nicht gefunden"-Seite nach
       einer Auskunft aus, die es hier gerade nicht gibt. -->
  <UDashboardPanel id="community-member-profile">
    <template #header>
      <UDashboardNavbar :title="t('members.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col lg:max-w-7xl">
        <div class="mb-4">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-ph-arrow-left"
            :to="localePath('/dashboard/members/map')"
            data-member-back
          >
            {{ t('members.profile.back') }}
          </UButton>
        </div>

        <CoreEmptyState
          v-if="error || !data"
          icon="i-ph-user-circle-dashed"
          :title="t('members.profile.notFoundTitle')"
          :description="t('members.profile.notFoundText')"
          :action-label="t('members.profile.back')"
          action-icon="i-ph-arrow-left"
          :action-to="localePath('/dashboard/members/map')"
          data-member-not-found
        />

        <template v-else>
          <div class="flex flex-wrap items-center gap-4" data-member-profile>
            <UserAvatar :user="{ name: displayName, prefs: { avatarUrl: data.avatarUrl } }" size="3xl" />
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold text-highlighted">{{ displayName }}</h1>
              <p v-if="data.handle" class="truncate text-sm text-muted" data-member-handle>{{ '@' + data.handle }}</p>
              <UBadge :color="ROLE_COLOR[data.role]" variant="subtle" class="mt-2" data-member-role>
                {{ t(`members.roles.${data.role}`) }}
              </UBadge>
            </div>
          </div>

          <p v-if="data.bio" class="mt-6 max-w-2xl whitespace-pre-line text-sm text-default" data-member-bio>
            {{ data.bio }}
          </p>

          <dl class="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div v-if="data.location" class="min-w-0">
              <dt class="text-xs text-dimmed">{{ t('members.profile.location') }}</dt>
              <dd class="flex items-center gap-1.5" data-member-location>
                <UIcon name="i-ph-map-pin" class="size-4 shrink-0 text-muted" />
                <span class="truncate">{{ data.location.label }}</span>
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-xs text-dimmed">{{ t('members.joined') }}</dt>
              <dd data-member-joined>{{ sessionDateTime(data.joinedAt, locale) }}</dd>
            </div>
          </dl>

          <!-- Karte NUR mit Standort — Stadt-Ebene, mehr gibt ein Orts-Verzeichnis
               nicht her. -->
          <MemberMiniMap
            v-if="data.location"
            class="mt-4 max-w-2xl"
            :lat="data.location.lat"
            :lon="data.location.lon"
          />

          <!-- Attribution (CC BY 4.0) — sie hängt am ZEIGEN des Ortes, nicht an
               der Konfiguration. OpenStreetMap steht in der Karte selbst. -->
          <i18n-t
            v-if="data.location"
            keypath="members.map.geoAttribution"
            tag="p"
            scope="global"
            class="mt-4 text-xs text-dimmed"
          >
            <template #provider>
              <ULink :to="geonamesUrl" target="_blank" rel="noopener" class="underline">GeoNames</ULink>
            </template>
          </i18n-t>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
