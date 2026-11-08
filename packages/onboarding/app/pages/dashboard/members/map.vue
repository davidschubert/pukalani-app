<script setup lang="ts">
import type { CommunityRole } from '../../../../../core/shared/communityAuthz'
import { groupMembersByLocation, type MemberLocationGroup } from '../../../../shared/membersMap'
import type { CommunityMembersMapResponse } from '../../../../shared/types/membersMap'

/**
 * DIE MITGLIEDER-KARTE (Etappe 2, 2026-08-23 — Davids Zuschnitt).
 *
 * Eine Weltkarte mit den Avataren aller Mitglieder, die einen Standort
 * angegeben haben. Zweite ANSICHT des Menüpunkts „Mitglieder", kein eigener
 * Menüpunkt — die Begründung steht in `MembersViewSwitch`.
 *
 * MIT UMGEZOGEN am 2026-08-23 (Davids Entscheidung): die Mitglieder liegen
 * nicht mehr unter /dashboard/community/*, sondern als eigener Menüpunkt in der
 * Gruppe „Produkte". Die Seite bringt deshalb ihr eigenes UDashboardPanel mit;
 * Begründung des Umzugs im Kopf von `index.vue` nebenan.
 *
 * ── DAS GATE IST DAS DER SEITE NEBENAN ─────────────────────────────────────
 * `members.invite` (seit F57 trägt es jede der fünf Rollen), nicht
 * `team.manage`: die Karte ist ausdrücklich für ALLE Mitglieder. Die Autorität
 * ist trotzdem die Route (`/api/community/members/map`), nicht diese Zeile —
 * hier steht nur, wem der Menüpunkt etwas verspricht.
 *
 * ── DIE AUSWAHL LEBT IN VUE, NICHT IN LEAFLET ──────────────────────────────
 * Ein Klick auf einen Marker setzt `selectedKey`; alles Weitere ist gewöhnliches
 * Markup unter der Karte. Ein Leaflet-Popup wäre fremdes HTML ausserhalb von
 * Vue: es folgte weder dem Theme noch der Sprache, und ein Test müsste
 * Leaflet-Interna aufmachen. Ausserdem passen unter die Karte MEHRERE Menschen
 * nebeneinander — an einem Ort stehen selten nur einer.
 *
 * ── ZWEI ATTRIBUTIONEN, ZWEI ORTE ──────────────────────────────────────────
 * OpenStreetMap steckt IN der Karte (Leaflet zeichnet sie, Pflicht der
 * Tile-Usage-Policy). GeoNames (CC BY 4.0) steht DARUNTER: von dort stammen
 * die Ortsnamen und Koordinaten, und die Pflicht hängt am ZEIGEN — hier werden
 * sie gezeigt, also steht sie hier.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'members.invite' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useBrandTitle(() => t('members.map.title'))

const { data, status, error } = await useFetch<CommunityMembersMapResponse>('/api/community/members/map')

const members = computed(() => data.value?.members ?? [])
const truncated = computed(() => data.value?.truncated === true)
const groups = computed(() => groupMembersByLocation(members.value))

/** Der Ort, dessen Menschen unter der Karte stehen — null = noch keine Wahl. */
const selectedKey = ref<string | null>(null)
const selected = computed<MemberLocationGroup | null>(
  () => groups.value.find(group => group.key === selectedKey.value) ?? null,
)

/**
 * Eine Auswahl, die es nicht mehr gibt, wird fallengelassen (Refresh, ein
 * Mitglied hat seinen Ort geändert) — sonst zeigte die Seite ein leeres Panel
 * und niemand wüsste, warum.
 */
watch(groups, (next) => {
  if (selectedKey.value && !next.some(group => group.key === selectedKey.value)) {
    selectedKey.value = null
  }
})

const ROLE_COLOR: Record<CommunityRole, 'primary' | 'info' | 'warning' | 'neutral'> = {
  owner: 'primary',
  admin: 'info',
  moderator: 'warning',
  editor: 'neutral',
  viewer: 'neutral',
}
const roleLabel = (role: CommunityRole) => t(`members.roles.${role}`)

/** Anzeigename: Name, ersatzweise der Handle, ersatzweise ein ehrlicher Platzhalter. */
function displayName(member: { name: string, handle: string }): string {
  return member.name || member.handle || t('members.map.unnamed')
}

// Im Script statt als Literal im Template: vue-tsc ab 3.3.9 liest jedes `//`
// in den Props einer Komponente als Zeilenkommentar, auch in einem String, und
// erzeugt ungültigen virtuellen Code (vuejs/language-tools#6240, Fix-PR #6241).
const geonamesUrl = 'https://www.geonames.org'
</script>

<template>
  <!-- EIGENE DASHBOARD-SEITE seit dem Umzug (2026-08-23): Panel, Kopfzeile und
       Breiten-Klammer gehören ihr selbst, nicht mehr der Community-Hülle —
       Aufbau wie bei den Nachbarn der Gruppe „Produkte". Die Karte MISST sich
       an ihrem Container (Leaflet kennt keine Prozente), deshalb ist die
       Klammer hier keine Kosmetik: ohne sie stünde sie in einem Element ohne
       Breite. Ein ResizeObserver in `MembersWorldMap` fängt die späte Breite.
       -->
  <UDashboardPanel id="community-members-map">
    <template #header>
      <UDashboardNavbar :title="t('members.map.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <!-- Reiter in der KOPFZEILE wie in jeder Hülle des Hauses — dieselbe
           Stelle wie auf der Listen-Seite, sonst springen sie beim Wechsel. -->
      <UDashboardToolbar>
        <MembersViewSwitch class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col lg:max-w-7xl">
        <p class="mb-4 max-w-2xl text-sm text-muted">
          {{ t('members.map.description') }}
        </p>

        <div v-if="status === 'pending'" class="flex h-[28rem] items-center justify-center rounded-lg border border-default">
          <UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-muted" />
        </div>

        <!-- FEHLER VOR LEERE: ohne diesen Zweig behauptet die Seite bei einem
             kaputten Abruf „noch hat niemand einen Ort angegeben" — eine
             Auskunft, die sie gar nicht hat (live erwischt 2026-08-24, als die
             Service-Naht zum Control Plane weg war). Ein leerer Bestand und
             ein gescheiterter Abruf sehen im `data`-Objekt gleich aus; nur
             `error` unterscheidet sie. -->
        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-ph-warning-circle"
          :title="t('members.map.errorTitle')"
          :description="t('members.map.errorText')"
          data-members-map-error
        />

        <!-- Niemand mit Standort: eine leere Weltkarte sagt nichts und sieht aus
             wie ein Fehler. Der Hinweis nennt den einen Handgriff, der hilft. -->
        <CoreEmptyState
          v-else-if="groups.length === 0"
          icon="i-ph-map-pin-simple-area"
          :title="t('members.map.emptyTitle')"
          :description="t('members.map.emptyText')"
          :action-label="t('members.map.emptyAction')"
          action-icon="i-ph-user-circle"
          :action-to="localePath('/dashboard/settings')"
          data-members-map-empty
        />

        <template v-else>
          <MembersWorldMap
            :groups="groups"
            :selected-key="selectedKey"
            @select="key => selectedKey = key"
          />

          <!-- Der Deckel der Route sagt es selbst, statt still abzuschneiden. -->
          <UAlert
            v-if="truncated"
            class="mt-4"
            color="warning"
            variant="subtle"
            icon="i-ph-warning"
            :title="t('members.map.truncatedTitle')"
            :description="t('members.map.truncatedText')"
            data-members-map-truncated
          />

          <!-- AUSWAHL-PANEL: gewöhnliches Markup unter der Karte, kein Leaflet-Popup. -->
          <section class="mt-4" data-members-map-panel>
            <p v-if="!selected" class="text-sm text-muted" data-members-map-hint>
              {{ t('members.map.selectHint', { n: members.length, places: groups.length }) }}
            </p>

            <UPageCard v-else :title="selected.label" variant="subtle">
              <ul class="divide-y divide-default">
                <li
                  v-for="member in selected.members"
                  :key="member.userId"
                  class="flex flex-wrap items-center gap-3 py-3"
                  :data-map-member="member.userId"
                >
                  <!-- `prefs.avatarUrl` ist die Form, die UserAvatar liest (Konto-prefs,
                       keine profiles-Tabelle) — nicht ein flaches `avatarUrl`. -->
                  <UserAvatar :user="{ name: displayName(member), prefs: { avatarUrl: member.avatarUrl } }" size="md" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium text-default">{{ displayName(member) }}</p>
                    <p v-if="member.handle" class="truncate text-xs text-muted">{{ '@' + member.handle }}</p>
                    <p class="truncate text-xs text-dimmed">
                      {{ member.location.label }} · {{ t('members.map.joined', { date: sessionDateTime(member.joinedAt, locale) }) }}
                    </p>
                  </div>
                  <UBadge :color="ROLE_COLOR[member.role]" variant="subtle">{{ roleLabel(member.role) }}</UBadge>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-ph-arrow-right"
                    trailing
                    :to="localePath(`/dashboard/members/${member.userId}`)"
                    :data-map-member-details="member.userId"
                  >
                    {{ t('members.map.details') }}
                  </UButton>
                </li>
              </ul>
            </UPageCard>
          </section>

          <!-- Attribution (CC BY 4.0) — sie hängt am ZEIGEN, nicht an der
               Konfiguration. OpenStreetMap steht in der Karte selbst. -->
          <i18n-t
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
