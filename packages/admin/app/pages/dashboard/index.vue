<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type {
  AdminAnalytics,
  AdminStatsResponse,
  AuditLogEntry,
  AuditLogListResponse,
  ReportedCommentsSummary,
  StorageOverview,
} from '../../../shared/types/admin'
import type { Capability } from '../../../../core/shared/types/authz'
import { resolveAdminNotices } from '../../../../core/shared/types/admin-notice'
import type { PukalaniAdminNoticeConfig } from '../../../../core/shared/types/admin-notice'
import { resolveDashboardStats } from '../../../../core/shared/types/dashboard-stat'
import type { PukalaniDashboardStatConfig } from '../../../../core/shared/types/dashboard-stat'
import { configFlagEnabled, resolveDashboardPlace } from '../../../../core/shared/dashboardNav'
import { isProductStateEnabled } from '../../../../core/shared/types/config'
import { isArrivalGreeting } from '../../../shared/greeting'

// BEWUSST ohne `requiredCapability`: die Übersicht ist die Landeseite JEDER
// Site-Rolle (alle fünf tragen `dashboard.access`, communityAuthz.ts). Gegated
// wird deshalb Widget für Widget (Audit-Befund S2, s. `can()` unten).
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const confirm = useConfirm()
const config = useRuntimeConfig()
const appConfig = useAppConfig()
const auth = useAuthStore()
const { formatRelativeTime } = useFormatRelativeTime()

useBrandTitle(() => t('admin.nav.overview'))

const firstName = computed(() => auth.user?.name?.split(' ')[0] || t('ui.account'))
/**
 * „Willkommen zurück" nur für Wiederkehrer (Trichter-G2). Die Regel steht pur
 * in shared/greeting.ts; die Quelle ist das Konto-Alter aus dem SSR-Payload,
 * also ohne zusätzliche Abfrage.
 *
 * `useState` statt `computed`, weil `Date.now()` im Spiel ist: der Server legt
 * den Wert fest und der Client übernimmt ihn aus dem Payload, statt ihn beim
 * Hydrieren neu zu rechnen — genau an der Fenstergrenze (oder bei einer
 * verstellten Uhr im Browser) stünden sonst zwei verschiedene Sätze in
 * demselben Absatz. Dieselbe Sorge wie beim Datum eine Zeile weiter unten,
 * nur mit der billigeren Kur.
 */
const arrival = useState('admin-overview-arrival', () => isArrivalGreeting(auth.user?.$createdAt, Date.now()))
const greeting = computed(() => (
  arrival.value
    ? t('admin.overview.greetingFirst', { name: firstName.value })
    : t('admin.overview.greeting', { name: firstName.value })
))
// Datum erst clientseitig füllen: SSR rendert in der Server-TZ, der Client in
// der lokalen — um Mitternacht/über TZ-Grenzen liefe das auseinander und löste
// einen Hydration-Mismatch aus.
const today = ref('')
onMounted(() => {
  today.value = new Date().toLocaleDateString(locale.value, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
})

// --- Capability-Gates der Widgets (Audit-Befund S2) ---------------------------
// Zwei Quellen wie in der Nav (N1): Operator-Label ODER Site-Rolle. Ohne diese
// Gates zeigte die Übersicht einem `viewer` die Hide/Restore-Knöpfe der
// Schnellmoderation (deren Route ihn abweist — der Knopf log also) und feuerte
// bei jedem Seitenaufruf zwei Fetches ab, die für Site-Rollen nur 403 liefern
// können: `audit.read` und `storage.manage` trägt KEINE der fünf Rollen.
// Nur UX-Schicht — die Autorität sind die Gates in den Server-Routen.
const { capabilities: siteCaps } = useCommunityRole()
const can = (capability: Capability) =>
  userHasCapability(auth.user, capability) || siteCaps.value.has(capability)
// Die Kommentar-Schnellmoderation gibt es nur, wenn der comments-Layer in
// dieser App überhaupt montiert ist — erkennbar an seinem Eintrag in der
// Modul-Registry (`pukalani.admin.modules`, id `comments`), dem expliziten
// Vertrag statt eines Layer-Imports (A14). Vorher lief die Anfrage an
// `/api/admin/comments` auf jeder Silo-Site ohne Kommentare ins 404
// (pukalani.studio, 2026-09-08 erwischt): die Capability hatte der Admin,
// die Route nicht die App.
const commentsHere = ((appConfig.pukalani as { admin?: { modules?: { id?: string }[] } }).admin?.modules ?? [])
  .some(module => module.id === 'comments')
const canModerateComments = computed(() => commentsHere && can('comments.moderate'))
const canReadAudit = computed(() => can('audit.read'))
const canManageStorage = computed(() => can('storage.manage'))
// S5: die Schnellmoderation ist für JEDEN Site-Moderator sichtbar, ihr
// Autoren-Link zeigte aber auf /dashboard/users/:id — eine Seite mit
// `requiredCapability: 'users.manage'`, die keine Site-Rolle trägt. Ohne die
// Capability bleibt der Name reiner Text statt eines Links in ein 403.
const canManageUsers = computed(() => can('users.manage'))

// --- Hinweise anderer Layer (M13) --------------------------------------------
// `pukalani.admin.notices`: ein Produkt-Layer meldet eine global registrierte
// Komponente an, die hier oben erscheint, WENN sie etwas zu sagen hat (erste
// Anwendung: der Ablauf der Testphase, onboarding-Layer). admin kennt weder den
// Layer noch den Anlass — dieselbe Bauart wie die Modul- und die Chrome-
// Registry (A14: expliziter Vertrag statt Hardcode). Ob eine Komponente
// tatsächlich etwas rendert, entscheidet sie selbst; hier wird nur gefiltert,
// WER sie überhaupt zu sehen bekommt.
const notices = computed(() =>
  resolveAdminNotices((appConfig.pukalani as { admin?: { notices?: PukalaniAdminNoticeConfig } }).admin?.notices, can))

// --- Kennzahlen (Registry, SSR) ----------------------------------------------
// U9/K2: die Kacheln kommen aus `pukalani.admin.stats` — jeder Layer meldet
// seine eigene an (core/shared/types/dashboard-stat.ts). Vorher standen hier
// drei fest verdrahtete Zahlen aus der Silo-Vergangenheit von apps/comments;
// dem Owner einer Beiträge-, Termine- oder Kurs-Community blieb davon genau
// eine, und die zählte ein Produkt, das er womöglich gar nicht gebucht hat.
//
// EINE Route für alle Zahlen (Performance): die Übersicht ist die
// meistbesuchte Seite des Dashboards, ein Fetch je Kachel wären sieben.
const { data: stats, refresh: refreshStats } = await useFetch<AdminStatsResponse>('/api/admin/stats')

// Dieselbe Filter-Trias wie die Reiter des Community-Hubs (F51) und die
// Sidebar-Module — Ort × Capability × Produkt-Gates. Der SERVER rechnet sie
// mit derselben puren Funktion noch einmal und erhebt nur, was hier auch
// gerendert würde; hier entscheidet sie über Reihenfolge, Wort und Ziel.
const place = resolveDashboardPlace(
  (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
  useIsTenantHost(),
)
const runtimeFlags = useRuntimeFlags()
const { planAllows } = useTenantPlan()
const declaredStats = computed(() => resolveDashboardStats(
  (appConfig.pukalani as { admin?: { stats?: PukalaniDashboardStatConfig } }).admin?.stats,
  {
    place,
    canAsOperator: (capability: Capability) => userHasCapability(auth.user, capability),
    canAsMember: (capability: Capability) => siteCaps.value.has(capability),
    productOn: productKey => !productKey || isProductStateEnabled(runtimeFlags.value.products[productKey]),
    planOn: planProduct => planAllows(planProduct),
    configOn: configFlag => configFlagEnabled(appConfig.pukalani, configFlag),
  },
))

/**
 * WAS KEINE ZAHL HAT, HAT KEINE KACHEL. Das ersetzt das frühere `null` je Feld
 * und sagt dasselbe: „diese Zahl wird für diesen Aufrufer bewusst nicht
 * ausgewiesen" — der Provider liefert sie gar nicht erst (Nutzerzahl im Pool,
 * Mitgliederzahl ohne Auskunft der Naht). Lieber keine Karte als eine fremde
 * oder eine erfundene 0.
 */
const cards = computed(() => declaredStats.value.flatMap((stat) => {
  const measured = stats.value?.[stat.id]
  if (!measured) return []
  const empty = measured.value !== null && measured.value < (stat.emptyBelow ?? 1)
  return [{
    ...stat,
    measured,
    to: stat.to ? localePath({ path: stat.to, ...(stat.query ? { query: stat.query } : {}) }) : undefined,
    hintKey: measured.hintKey ?? (empty ? stat.emptyHintKey : undefined),
    hintCount: measured.hintCount,
  }]
}))

const cardGridClass = computed(() => {
  if (cards.value.length >= 3) return 'sm:grid-cols-3'
  return cards.value.length === 2 ? 'sm:grid-cols-2' : ''
})

// --- Chart (nur wo seine Achsen stimmen) --------------------------------------
/**
 * ORT-GATE STATT LÖSCHUNG (U9/K2): das Diagramm hat zwei Achsen, Nutzer und
 * Kommentare. Die NUTZER-Achse zählt `users.list()`, also die Konten des
 * geteilten Appwrite-PROJEKTS — im Pool die Summe aller Communities, nicht die
 * Mitglieder DIESER (Befund B2). Die Route weiß das und liefert dort
 * `usersInRange: null` mit leeren Balken; übrig blieb ein Diagramm mit einer
 * toten Achse und einer Legende, die auf null zeigt.
 *
 * Es KANN im Pool also nicht ehrlich sein, ohne ein anderes Diagramm zu werden.
 * Deshalb erscheint es nur noch dort, wo das Projekt die Site IST
 * (`single-tenant`: Silo, Betreiber-Konsole, Playground) — und die Anfrage
 * unterbleibt dort, wo es nicht erscheint: `/api/admin/analytics` paginiert
 * über den ganzen Zeitraum und ist die teuerste Abfrage dieser Seite.
 */
const chartHere = place === 'single-tenant'
const days = ref(30)
const { data: analytics, refresh: refreshAnalytics } = await useFetch<AdminAnalytics>('/api/admin/analytics', {
  query: computed(() => ({ days: days.value })),
  immediate: chartHere,
  server: chartHere,
})

// --- Online-Presence (live) ---------------------------------------------------
// NICHT auf dem Kontroll-Host (Davids Entscheidung 2026-09-08, S3-Nachlese):
// dort gibt es keine Community, also nichts zu zählen — die Presence-Routen
// stehen bewusst nicht in `controlApiPrefixes` (404), und eine Karte, die
// immer „0 online" zeigt, wäre eine Lüge. Karte, Erst-Abruf, Realtime-Nachzug
// und 30-s-Poll hängen alle an derselben Bedingung.
const presenceHere = place !== 'control'
interface OnlineUser { userId: string, userName: string, avatarUrl: string }
const { data: presence, refresh: refreshPresence } = await useFetch<{ count: number, users: OnlineUser[] }>('/api/presence/count', {
  query: { scope: 'global' },
  immediate: presenceHere,
  server: presenceHere,
})
const onlineCount = computed(() => presence.value?.count ?? 0)
const onlineUsers = computed(() => presence.value?.users ?? [])
// Live-Anwesenheit über die Presences API (Channel.presences()) — treibt den
// entprellten Reload der serverseitigen Zählung (inkl. Avatare, s.u.).
const { present } = usePresence()

// --- Widgets (client-seitig, blockiert SSR nicht) -----------------------------
// `immediate` folgt der Capability: ohne sie bleibt die Anfrage aus, statt
// vorhersehbar in ein 403 zu laufen (das Widget rendert ohnehin nicht).
const { data: reported, refresh: refreshReported } = useFetch<ReportedCommentsSummary>('/api/admin/comments', {
  query: { status: 'reported', page: 1 }, lazy: true, server: false, immediate: canModerateComments.value,
})
const reportedList = computed(() => (reported.value?.comments ?? []).slice(0, 5))

const { data: audit, refresh: refreshAudit } = useFetch<AuditLogListResponse>('/api/admin/audit', {
  query: { page: 1 }, lazy: true, server: false, immediate: canReadAudit.value,
})
const auditList = computed(() => (audit.value?.entries ?? []).slice(0, 6))

const { data: storage } = useFetch<StorageOverview>('/api/admin/storage', {
  lazy: true, server: false, immediate: canManageStorage.value,
})

function actionText(entry: AuditLogEntry): string {
  const key = `admin.audit.action.${entry.action}`
  return te(key) ? t(key, { name: entry.targetName || entry.targetId }) : entry.action
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// --- Schnellmoderation aus dem "Zu moderieren"-Widget -------------------------
// Rückfrage über useConfirm() — dieselbe Aktion muss sich hier verhalten wie in
// der Moderations-Liste (/dashboard/comments), sonst gibt es zwei Verhalten für
// einen Knopf (Audit-Befund C10).
async function moderate(comment: { $id: string, authorName: string }, status: 'hidden' | 'active') {
  try {
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: t(status === 'hidden' ? 'admin.moderation.confirmHide' : 'admin.moderation.confirmRestore', { name: comment.authorName }),
      confirmLabel: t(status === 'hidden' ? 'admin.moderation.hide' : 'admin.moderation.restore'),
      color: status === 'hidden' ? 'error' : 'primary',
      action: () => $fetch(`/api/admin/comments/${comment.$id}/status`, { method: 'PATCH', body: { status } }),
    })
    if (!ok) return
    toast.add({ title: t(status === 'hidden' ? 'admin.moderation.hidden' : 'admin.moderation.restored'), color: 'success' })
    await Promise.all([refreshReported(), refreshStats()])
  }
  catch {
    toast.add({
      title: t('admin.users.actionFailed'),
      description: t('admin.users.actionFailedDesc'),
      color: 'error',
    })
  }
}

// --- Realtime: alles Relevante live nachziehen --------------------------------
const rangeItems = computed(() => [7, 30, 90].map(d => ({ label: t('admin.analytics.subtitle', { days: d }), value: d })))

let commentsTimer: ReturnType<typeof setTimeout> | undefined
let presenceTimer: ReturnType<typeof setTimeout> | undefined
let auditTimer: ReturnType<typeof setTimeout> | undefined
let presencePoll: ReturnType<typeof setInterval> | undefined

// Mandanten-Netz am SOCKET (Audit-Befund 2026-08-02, dieselbe Klasse wie B2 —
// nur eine Ebene tiefer): dieser Strom liest DIREKT gegen Appwrite, nicht über
// eine server/api-Route, und ist damit von der Datentür nicht erfasst. Die
// harte Grenze bleiben die Row-Permissions; sie greift nur nicht bei jemandem,
// der in ZWEI Communities Mitglied ist (er trägt beide Labels) — und öffentlich
// lesbare Kommentare tragen ohnehin read(any). Ohne Filter refetchte JEDES
// Community-Dashboard seine Kennzahlen bei jedem fremden Kommentar im Pool.
// `where` statt der server-seitigen `queries`: dafür bräuchte die Seite den
// Query-Builder aus 'appwrite' als WERT-Import — das zöge das Web-SDK zurück
// ins Initial-Bundle (B4), das der Composable bewusst erst nach der Hydration
// nachlädt. Gleiches Muster wie Activity-Feed und NotificationBell.
const tenantId = useTenantId()

useRealtimeRows<Models.Row & { communityId?: string }>(config.public.appwriteDatabaseId, 'comments', () => {
  clearTimeout(commentsTimer)
  commentsTimer = setTimeout(() => {
    void refreshStats()
    // `refresh()` würde die unterdrückte Anfrage NACHHOLEN — beide Aufrufe
    // brauchen deshalb dieselbe Bedingung wie ihr `immediate`, sonst holt sich
    // die Seite über den Umweg Realtime genau das zurück, was sie bewusst
    // nicht geladen hat (das Diagramm im Pool, die Meldungen ohne Capability).
    if (chartHere) void refreshAnalytics()
    if (canModerateComments.value) void refreshReported()
  }, 500)
}, { where: payload => rowBelongsToHost(payload, tenantId.value) })
watch(present, () => {
  if (!presenceHere) return
  clearTimeout(presenceTimer)
  presenceTimer = setTimeout(() => { void refreshPresence() }, 500)
})
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'audit_logs', () => {
  clearTimeout(auditTimer)
  auditTimer = setTimeout(() => { if (canReadAudit.value) void refreshAudit() }, 500)
})
onMounted(() => { if (presenceHere) presencePoll = setInterval(() => { void refreshPresence() }, 30_000) })

onScopeDispose(() => {
  clearTimeout(commentsTimer)
  clearTimeout(presenceTimer)
  clearTimeout(auditTimer)
  clearInterval(presencePoll)
})
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.overview')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-(--ui-container)">
        <!-- Begrüßung -->
        <div>
          <h1 class="text-xl font-semibold">{{ greeting }}</h1>
          <p class="text-sm text-muted">{{ today }}</p>
        </div>

        <!-- Hinweise registrierter Layer (M13) — direkt unter der Begrüßung,
             vor den Zahlen: was jetzt zu tun ist, steht über dem, was war. -->
        <component :is="notice.component" v-for="notice in notices" :key="notice.id" />

        <!-- Online — nicht auf dem Kontroll-Host (s. presenceHere) -->
        <UCard v-if="presenceHere" data-online-card>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="relative flex size-2.5">
                <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span class="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              <span class="text-sm"><span class="text-lg font-bold tabular-nums">{{ onlineCount }}</span> {{ t('admin.stats.online') }}</span>
            </div>
            <UAvatarGroup v-if="onlineUsers.length" :max="8" size="sm">
              <UTooltip v-for="u in onlineUsers" :key="u.userId" :text="u.userName">
                <UserAvatar :user="{ name: u.userName, prefs: { avatarUrl: u.avatarUrl } }" size="sm" />
              </UTooltip>
            </UAvatarGroup>
          </div>
        </UCard>

        <!-- Kennzahlen (Registry — jede Kachel gehört dem Layer, der sie
             angemeldet hat; die Zahlen kommen gebündelt aus EINER Route) -->
        <div class="grid gap-4" :class="cardGridClass" data-stat-cards>
          <UCard v-for="card in cards" :key="card.id" :data-stat="card.id">
            <!-- Eine Kachel OHNE `to` ist reine Anzeige — ein Link ins Nichts
                 wäre schlechter als kein Link. -->
            <component :is="card.to ? 'NuxtLink' : 'div'" :to="card.to" class="flex items-center gap-3">
              <UIcon :name="card.icon" class="size-8 shrink-0 text-primary" />
              <div class="min-w-0">
                <!-- Zahl ODER Wort: der Plan-Zustand ist die Antwort auf seine
                     Frage, aber keine Zahl — er kommt als i18n-Schlüssel des
                     liefernden Layers (A14). -->
                <p v-if="card.measured.value !== null" class="text-2xl font-bold tabular-nums">
                  {{ card.measured.limit
                    ? t('admin.overview.statOf', { value: card.measured.value, limit: card.measured.limit })
                    : card.measured.value }}
                </p>
                <p v-else-if="card.measured.textKey" class="truncate text-lg font-bold">{{ t(card.measured.textKey) }}</p>
                <p class="truncate text-sm text-muted">{{ t(card.labelKey) }}</p>
                <p v-if="card.hintKey" class="truncate text-xs text-primary">
                  {{ card.hintCount === undefined ? t(card.hintKey) : t(card.hintKey, card.hintCount) }}
                </p>
              </div>
            </component>
          </UCard>
        </div>

        <!-- Chart — nur wo seine Nutzer-Achse die Site meint (s. `chartHere`) -->
        <UCard v-if="chartHere && analytics">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold">{{ t('admin.analytics.title') }}</h2>
              <USelect v-model="days" :items="rangeItems" size="sm" class="w-40" />
            </div>
          </template>

          <AnalyticsTrendChart
            :points="analytics.points"
            :users-label="t('admin.analytics.users')"
            :comments-label="t('admin.analytics.comments')"
            :users-total="analytics.usersInRange"
            :comments-total="analytics.commentsInRange"
            :today-label="t('admin.analytics.today')"
          />
        </UCard>

        <!-- Zu moderieren (comments.moderate) + Letzte Aktivität (audit.read) -->
        <!--
          BEWUSST KEINE UTable (B6): das hier sind Vorschau-Kacheln der
          Übersicht (fünf Zeilen, „Alle ansehen" daneben), keine Datenliste —
          die vollständigen Listen stehen als Tabelle unter /dashboard/comments
          und /dashboard/admin. Eine Tabelle mit Kopfzeile für fünf Zeilen
          wöge auf der Startseite schwerer als der Inhalt.
        -->
        <div
          v-if="canModerateComments || canReadAudit"
          class="grid gap-4 sm:gap-6"
          :class="canModerateComments && canReadAudit ? 'lg:grid-cols-2' : ''"
        >
          <UCard v-if="canModerateComments">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="flex items-center gap-2 font-semibold">
                  {{ t('admin.overview.moderate') }}
                  <UBadge v-if="reported?.total" color="warning" variant="subtle" size="sm">{{ reported.total }}</UBadge>
                </h2>
                <ULink :to="localePath({ path: '/dashboard/comments', query: { status: 'reported' } })" class="text-sm text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
              </div>
            </template>
            <!-- Dieselbe Bauform wie die Schwester-Karte daneben (S5). BEWUSST
                 OHNE Aktion: nichts zu moderieren ist eine gute Nachricht,
                 kein Auftrag — „Alle ansehen" steht oben in der Kopfzeile. -->
            <CoreEmptyState
              v-if="!reportedList.length"
              icon="i-ph-shield-check"
              :title="t('admin.overview.allClear')"
              :description="t('admin.overview.allClearHint')"
            />
            <ul v-else class="space-y-3">
              <li v-for="c in reportedList" :key="c.$id" class="border-b border-default/60 pb-3 text-sm last:border-0 last:pb-0">
                <div class="mb-1 flex items-center gap-2 text-xs text-muted">
                  <ULink v-if="canManageUsers" :to="localePath(`/dashboard/users/${c.authorId}`)" class="font-medium text-default hover:text-primary hover:underline">{{ c.authorName }}</ULink>
                  <span v-else class="font-medium text-default">{{ c.authorName }}</span>
                  <span>·</span>
                  <span>{{ formatRelativeTime(c.$createdAt) }}</span>
                </div>
                <p class="line-clamp-2 whitespace-pre-line">{{ c.content }}</p>
                <div class="mt-1.5 flex gap-1">
                  <UButton size="xs" color="error" variant="ghost" icon="i-ph-eye-slash" @click="moderate(c, 'hidden')">{{ t('admin.moderation.hide') }}</UButton>
                  <UButton size="xs" color="success" variant="ghost" icon="i-ph-eye" @click="moderate(c, 'active')">{{ t('admin.moderation.restore') }}</UButton>
                </div>
              </li>
            </ul>
          </UCard>

          <UCard v-if="canReadAudit">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold">{{ t('admin.overview.recentActivity') }}</h2>
                <ULink :to="localePath('/dashboard/admin')" class="text-sm text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
              </div>
            </template>
            <!-- S5: der nackte Gedankenstrich war weder übersetzt noch als
                 leerer Zustand erkennbar. CoreEmptyState OHNE Aktion: hier gibt
                 es nichts anzulegen, das Protokoll füllt sich von selbst. -->
            <CoreEmptyState
              v-if="!auditList.length"
              icon="i-ph-clock-counter-clockwise"
              :title="t('admin.overview.activityEmpty')"
              :description="t('admin.overview.activityEmptyHint')"
            />
            <ul v-else class="space-y-2.5">
              <li v-for="e in auditList" :key="e.$id" class="flex items-center gap-2 text-sm">
                <UserAvatar :user="{ name: e.actorName, prefs: { avatarUrl: e.actorAvatarUrl } }" size="2xs" />
                <span class="min-w-0 flex-1 truncate"><span class="font-medium">{{ e.actorName }}</span> {{ actionText(e) }}</span>
                <span class="shrink-0 text-xs text-dimmed">{{ formatRelativeTime(e.$createdAt) }}</span>
              </li>
            </ul>
          </UCard>
        </div>

        <!-- Speicher (storage.manage) -->
        <UCard v-if="canManageStorage && storage?.available">
          <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
            <h2 class="font-semibold">{{ t('admin.overview.storage') }}</h2>
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted">
              <span>{{ t('admin.storage.files') }}: <span class="font-bold text-default tabular-nums">{{ storage.buckets.reduce((sum, b) => sum + b.files.length, 0) }}</span></span>
              <span>{{ t('admin.storage.size') }}: <span class="font-bold text-default tabular-nums">{{ formatBytes(storage.buckets.reduce((sum, b) => sum + b.totalBytes, 0)) }}</span></span>
              <span>{{ t('admin.storage.orphans') }}: <span class="font-bold text-default tabular-nums">{{ storage.buckets.reduce((sum, b) => sum + b.orphanCount, 0) }}</span></span>
              <ULink :to="localePath('/dashboard/storage')" class="text-primary hover:underline">{{ t('admin.overview.viewAll') }}</ULink>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
