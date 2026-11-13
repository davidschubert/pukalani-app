<script setup lang="ts">
import type { AccountActivityEntry, AccountActivityResponse } from '../../../../core/shared/accountActivity'
import type { AccountEventEntry } from '../../../../core/shared/accountEvents'

/**
 * `/profile/activity` — was ich getan habe, über alle Communities hinweg
 * (AH-3).
 *
 * NUR EIGENES. Die Route dahinter (`/api/account/activity`) nimmt die
 * Nutzer-Id ausschließlich aus der Session und jeder Produkt-Layer filtert
 * hart auf seine Besitz-Spalte — diese Seite kann fremden Inhalt gar nicht
 * anzeigen, weil sie ihn nie bekommt. Die Community-Grenzen bleiben also
 * unberührt: sie zeigt eine Selbstauskunft, keinen Querblick.
 *
 * ZWEI TEILE (seit 2026-11-13, Davids Entscheidung): oben „Konto und
 * Sicherheit" — was an MEINEM KONTO geschah (Profil, Passwort, Zwei-Faktor),
 * aus dem Protokoll, das `logAuthEvent` ohnehin schreibt; darunter wie bisher
 * die eigenen Inhalte je Community. Der Konto-Teil ist ein eigener Block und
 * keine Schein-Community in der Zeitleiste: er hat keinen Host, kein
 * Sprungziel und eine andere Frage („war ich das?" statt „wo steht das?").
 * Gezeigt wird der ORT, nie die IP-Adresse, und bei Profil-Änderungen nur die
 * NAMEN der Felder — Werte stehen gar nicht im Protokoll.
 *
 * GRUPPIERTE LISTE STATT `UTable`, bewusst abweichend von Davids Regel B6.
 * Drei Gründe, alle spezifisch:
 *  1. Die Ansicht ist GRUPPIERT (eine Überschrift je Community) — genau das
 *     kann eine Tabelle nicht, ohne zur Fake-Gruppierung über eine Spalte zu
 *     werden, in der derselbe Name zwanzigmal untereinander steht.
 *  2. Jeder Eintrag ist ein SPRUNG AUF EINEN ANDEREN HOST, kein Datensatz zum
 *     Vergleichen — dieselbe Begründung wie auf `/communities`.
 *  3. Sortierung und Auswahl, die eine Tabelle mitbringt, gibt es hier nicht
 *     zu holen: die Reihenfolge ist immer „neueste zuerst", und ausgewählt
 *     wird nichts.
 *
 * ABSOLUTES DATUM, KEINE RELATIVE ANGABE („vor 3 Tagen"). `formatRelativeTime`
 * rechnet gegen `Date.now()`; serverseitig gerendert stünde im HTML eine
 * andere Zahl als danach im Browser — dieselbe Falle, wegen der die
 * Testphasen-Zeile auf `/communities` erst nach `onMounted` erscheint. Ein
 * festes Datum hat diese Falle nicht und ist in einer Liste über Monate
 * ohnehin die nützlichere Angabe.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()

const { data, status, error } = await useFetch<AccountActivityResponse>('/api/account/activity', {
  default: () => ({
    account: { events: [], truncated: false },
    groups: [],
    truncated: false,
    unavailable: [],
  } as AccountActivityResponse),
})

/**
 * Die NAMEN der Communities. Die Aktivitäts-Antwort kennt nur Hosts (sie wird
 * aus dem gebündelten Host-Resolver gebaut, der genau das liefert) — der Name
 * steht in der Mitgliedschaftsliste, die diese Seite ohnehin geteilt bekommt
 * (useMyCommunities, gemeinsamer Abruf-Schlüssel).
 *
 * Verbunden wird über den HOST, nicht über eine Id: die beiden Quellen zählen
 * verschiedene Schlüssel (`communities.$id` dort, `communities.tenantId` hier),
 * der kanonische Host ist der einzige Wert, den beide gleich schreiben.
 *
 * Kein Treffer heißt nicht „Fehler", sondern meistens: dort bin ich kein
 * Mitglied mehr. Dann steht der Host als Überschrift, und das ist die
 * ehrlichste verfügbare Auskunft.
 */
const { data: mine } = useMyCommunities()
const namesByHost = computed(() => {
  const map = new Map<string, string>()
  for (const community of mine.value?.communities ?? []) map.set(community.host, community.name)
  return map
})

const groups = computed(() => data.value?.groups ?? [])
const accountEvents = computed(() => data.value?.account?.events ?? [])
const hasAnything = computed(() => groups.value.length > 0 || accountEvents.value.length > 0)

/**
 * Datum über `useFormatDate()` statt über die rohe Util (U15 Teil 5): der
 * Composable bindet BEIDES — die Sprache (das tat die abgelöste Zeile
 * `dateLocale` von Hand) und die Zeitzone des Kontos aus `prefs.timezone`.
 * Eine Seite, die ausdrücklich absolute Daten zeigt, ist der letzte Ort, an
 * dem eine zweite Rechnung stehen sollte.
 */
const { formatDate } = useFormatDate()

function groupLabel(host: string): string {
  if (!host) return t('onboarding.account.activity.unknownCommunity')
  return namesByHost.value.get(host) ?? host
}

/** Absolute URL auf den Community-Host — nur wenn BEIDES bekannt ist. */
function entryLink(host: string, entry: AccountActivityEntry): string | null {
  if (!host || !entry.path) return null
  return `https://${host}${entry.path}`
}

const KIND_ICONS: Record<AccountActivityEntry['kind'], string> = {
  post: 'i-ph-chat-teardrop-text',
  comment: 'i-ph-chat-circle-text',
  rsvp: 'i-ph-calendar-check',
  enrollment: 'i-ph-graduation-cap',
}

const EVENT_ICONS: Record<AccountEventEntry['kind'], string> = {
  profile_updated: 'i-ph-user-circle',
  password_changed: 'i-ph-key',
  password_reset: 'i-ph-key',
  recovery_requested: 'i-ph-envelope-simple',
  email_verified: 'i-ph-seal-check',
  mfa_enabled: 'i-ph-shield-check',
  mfa_disabled: 'i-ph-shield-slash',
  mfa_challenge_failed: 'i-ph-shield-warning',
}

/**
 * Die zweite Zeile eines Konto-Ereignisses: geänderte Felder (nur bei
 * „Profil geändert") und der Ort, mit demselben Punkt-Trenner wie auf der
 * Sitzungsliste. Leer ⇒ die Zeile entfällt ganz.
 */
function eventDetail(entry: AccountEventEntry): string {
  const fields = entry.fields
    .map(field => t(`onboarding.account.activity.account.fields.${field}`))
    .join(', ')
  return [fields, entry.place].filter(Boolean).join(' · ')
}

useBrandTitle(() => t('onboarding.account.activity.title'))
</script>

<template>
  <div class="space-y-6" data-account-activity>
    <div v-if="status === 'pending' && !hasAnything" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-ph-warning-circle"
      :title="t('onboarding.account.activity.errorTitle')"
      :description="t('onboarding.account.activity.errorText')"
    />

    <template v-else>
      <!--
        Ein ausgefallener Teil wird BENANNT, nicht verschwiegen: eine leere
        Liste und eine nicht geladene Liste sehen gleich aus, sagen aber das
        Gegenteil. Deshalb steht der Hinweis VOR dem Leer-Zustand und nicht
        mehr nur neben gefüllten Gruppen.
      -->
      <UAlert
        v-if="data?.unavailable.length"
        color="warning"
        variant="subtle"
        icon="i-ph-warning"
        :description="t('onboarding.account.activity.unavailable')"
        data-activity-unavailable
      />

      <CoreEmptyState
        v-if="!hasAnything"
        icon="i-ph-clock-counter-clockwise"
        :title="t('onboarding.account.activity.emptyTitle')"
        :description="t('onboarding.account.activity.emptyText')"
        :action-label="t('onboarding.account.activity.emptyAction')"
        action-icon="i-ph-users-three"
        :action-to="localePath('/communities')"
      />

      <!--
        Konto und Sicherheit. Kein Link je Zeile: es gibt nichts, wohin ein
        Klick führen könnte. Der Fehlversuch beim zweiten Faktor ist das eine
        WARN-Signal der Liste und bekommt als einziger eine Farbe.
      -->
      <section v-if="accountEvents.length" class="space-y-3" data-activity-account>
        <h2 class="font-semibold text-highlighted">{{ t('onboarding.account.activity.account.title') }}</h2>

        <ul class="divide-y divide-default overflow-hidden rounded-xl border border-default">
          <li
            v-for="entry in accountEvents"
            :key="entry.id"
            class="flex items-start gap-3 p-4"
            :data-account-event="entry.kind"
          >
            <UIcon
              :name="EVENT_ICONS[entry.kind]"
              class="mt-0.5 size-5 shrink-0"
              :class="entry.kind === 'mfa_challenge_failed' ? 'text-warning' : 'text-dimmed'"
            />
            <span class="min-w-0 flex-1 space-y-1">
              <span class="block text-sm font-medium text-highlighted">
                {{ t(`onboarding.account.activity.account.events.${entry.kind}`) }}
              </span>
              <span v-if="eventDetail(entry)" class="block truncate text-sm text-muted" data-account-event-detail>
                {{ eventDetail(entry) }}
              </span>
            </span>
            <time :datetime="entry.createdAt" class="shrink-0 text-sm text-dimmed">
              {{ formatDate(entry.createdAt) }}
            </time>
          </li>
        </ul>

        <p v-if="data?.account?.truncated" class="text-sm text-muted" data-activity-account-truncated>
          {{ t('onboarding.account.activity.account.truncated') }}
        </p>
      </section>

      <!--
        Konto-Ereignisse da, Communities leer: der große Leer-Zustand oben
        („Noch keine Aktivität") wäre jetzt falsch, ein fehlender zweiter Teil
        ohne ein Wort aber auch.
      -->
      <p v-if="accountEvents.length && !groups.length" class="text-sm text-muted" data-activity-communities-empty>
        {{ t('onboarding.account.activity.communitiesEmpty') }}
      </p>

      <section
        v-for="group in groups"
        :key="group.communityId"
        class="space-y-3"
        :data-activity-group="group.communityId"
        :data-activity-host="group.host"
      >
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 class="font-semibold text-highlighted">{{ groupLabel(group.host) }}</h2>
          <span v-if="group.host && namesByHost.get(group.host)" class="text-sm text-muted">{{ group.host }}</span>
        </div>

        <ul class="divide-y divide-default overflow-hidden rounded-xl border border-default">
          <li v-for="entry in group.entries" :key="`${entry.source}:${entry.id}`">
            <component
              :is="entryLink(group.host, entry) ? 'a' : 'div'"
              :href="entryLink(group.host, entry) ?? undefined"
              class="flex items-start gap-3 p-4"
              :class="entryLink(group.host, entry) ? 'transition-colors hover:bg-elevated/50' : ''"
              :data-activity-kind="entry.kind"
            >
              <UIcon :name="KIND_ICONS[entry.kind]" class="mt-0.5 size-5 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1 space-y-1">
                <span class="block text-sm font-medium text-highlighted">
                  {{ t(`onboarding.account.activity.kinds.${entry.kind}`) }}
                </span>
                <span class="block truncate text-sm text-muted">{{ entry.title }}</span>
              </span>
              <time :datetime="entry.createdAt" class="shrink-0 text-sm text-dimmed">
                {{ formatDate(entry.createdAt) }}
              </time>
            </component>
          </li>
        </ul>
      </section>

      <p v-if="data?.truncated" class="text-sm text-muted" data-activity-truncated>
        {{ t('onboarding.account.activity.truncated') }}
      </p>
    </template>
  </div>
</template>
