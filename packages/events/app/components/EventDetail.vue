<script setup lang="ts">
import type { EventDetailResponse, EventRow, EventTranslateResponse, EventVoteResponse, EventVoteValue, RsvpResponse, RsvpStatus } from '../../shared/types/event'
import { effectiveAccess, effectiveLocationType, EVENTS_TABLE } from '../../shared/types/event'
import { detectLiveProvider } from '../../shared/liveProvider'
import { eventIsEditable, eventIsRedacted } from '../../shared/eventModerationPolicy'

/**
 * Landing Page (Meetup-Muster): Zurück-Link, links Titel/Host/Details
 * (Markdown, geklappt)/Votes/Teilnehmer/Kommentare — rechts die sticky
 * Info-Karte (Cover, Zeitfenster, Ort inkl. Google-Maps-Link „So findest
 * du uns", RSVP, Join live, ICS/Share). Teilnehmerzahl LIVE via
 * useRealtimeRows; Namen/Avatare nur für Eingeloggte (Privacy-Gate —
 * Gäste sehen geblurte Platzhalter). Kommentare kommen über den
 * #comments-Slot — die APP füllt ihn mit dem comments-Layer (A14).
 */
const props = defineProps<{
  initial: EventDetailResponse
  /**
   * Kauf-Endpoint für paid-Events (z. B. '/api/events/<id>/checkout') —
   * gesetzt von der APP, wenn sie billing komponiert. Ohne Pfad bleibt der
   * CTA disabled („Bald verfügbar", fail-closed wie das RSVP-Gate).
   */
  ticketCheckoutPath?: string
}>()

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { formatDateTime, formatTime, formatMonthShort, formatDayNumber, formatDateSpan, isMultiDay, sameDay } = useEventDateFormat()
const { formatRelativeTime } = useFormatRelativeTime()
const { coverSource } = useEventCover()
const { isLoggedIn } = useCurrentUser()
const { formatCurrency } = useFormatCurrency()

/**
 * GESCHWÄRZT (F46): Titel und Beschreibung sind leer, das Titelbild ist weg —
 * die Absage aber steht weiter da, und das ist der ganze Punkt. Die Seite
 * ersetzt deshalb NUR den Text durch den i18n-Hinweis; Datum, Ort, Zusagen und
 * der Absage-Hinweis bleiben, wie sie sind.
 */
const isRedacted = computed(() => eventIsRedacted(event.value.redactedAt))

/** Paid-Event (E4): Preis-Zeile + Kauf-CTA (aktiv, sobald die App einen Checkout-Pfad setzt) */
const isPaid = computed(() => effectiveAccess(event.value) === 'paid')
const priceLabel = computed(() =>
  event.value.priceAmount !== null ? formatCurrency(event.value.priceAmount / 100) : t('events.card.paid'),
)

const buying = ref(false)
async function buyTicket() {
  if (!props.ticketCheckoutPath) return
  buying.value = true
  try {
    const res = await $fetch<{ url: string }>(props.ticketCheckoutPath, {
      method: 'POST',
      query: locale.value === 'de' ? { locale: 'de' } : {},
    })
    window.location.href = res.url
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('events.ticket.alreadyOwned') : t('events.ticket.failed'),
      // 409 ist kein Fehler, sondern eine Auskunft — dort gibt es nichts zu tun.
      description: statusCode === 409 ? undefined : t('events.ticket.failedHint'),
      color: statusCode === 409 ? 'info' : 'error',
    })
  }
  finally {
    buying.value = false
  }
}

// Lokale Wahrheit: Realtime-Updates und RSVP-/Vote-Antworten ersetzen sie atomar
const event = ref<EventRow>({ ...props.initial })
const myRsvp = ref<RsvpStatus | null>(props.initial.myRsvp)
const myVote = ref<EventVoteValue | null>(props.initial.myVote)

// „Jetzt" als Ref — Countdown-Pill und Join-live-Fenster reagieren ohne Reload
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

// Hooks VOR dem ersten await; Stop-Funktion selbst halten (Muster PostFeed)
let stopRealtime: (() => void) | undefined
onMounted(() => {
  ticker = setInterval(() => { now.value = Date.now() }, 30_000)
  stopRealtime = useRealtimeRows<EventRow>(
    config.public.appwriteDatabaseId,
    EVENTS_TABLE,
    (ev) => {
      if (ev.type === 'delete') return
      event.value = { ...ev.payload }
    },
    { rowId: props.initial.$id },
  )
})
onBeforeUnmount(() => {
  stopRealtime?.()
  if (ticker) clearInterval(ticker)
})

const { count: viewerCount } = useViewingPresence()

// Beide Antworten tragen NUR Zähler (SEC-031, 2026-11-13) — sie werden in den
// Termin übernommen, alles andere stammt weiter aus der Leseroute.
function onRsvpUpdated(res: RsvpResponse) {
  event.value = { ...event.value, ...res.event }
  myRsvp.value = res.myRsvp
}
function onVoted(res: EventVoteResponse) {
  event.value = { ...event.value, ...res.event }
  myVote.value = res.myVote
}

const isFull = computed(() =>
  event.value.capacity !== null && event.value.attendeeCount >= event.value.capacity,
)
const spotsLeft = computed(() => {
  if (event.value.capacity === null) return null
  const left = event.value.capacity - event.value.attendeeCount
  return left > 0 && left <= 3 ? left : null
})

const isUpcoming = computed(() => Date.parse(event.value.startAt) > now.value)
const locationType = computed(() => effectiveLocationType(event.value))
const provider = computed(() => detectLiveProvider(event.value.url))

/** Google-Maps-Suche mit den Adressdaten — öffnet im neuen Fenster */
const mapsUrl = computed(() => {
  const target = [event.value.location, event.value.address].filter(Boolean).join(', ')
  return target ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}` : null
})

/** Join-Fenster: T−15 min bis endAt (ohne endAt: 3 h nach Start) — nur Zusager */
const JOIN_LEAD_MS = 15 * 60_000
const FALLBACK_DURATION_MS = 3 * 3600_000
const joinOpen = computed(() => {
  if (event.value.status !== 'published' || locationType.value !== 'online' || !event.value.url) return false
  const start = Date.parse(event.value.startAt)
  const end = event.value.endAt ? Date.parse(event.value.endAt) : start + FALLBACK_DURATION_MS
  return now.value >= start - JOIN_LEAD_MS && now.value <= end
})

async function share() {
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: event.value.title, url })
      return
    }
    throw new Error('no-share')
  }
  catch {
    try {
      await navigator.clipboard.writeText(url)
      toast.add({ title: t('events.detail.linkCopied'), color: 'success' })
    }
    catch {
      toast.add({ title: t('events.detail.shareFailed'), description: t('events.detail.shareFailedHint'), color: 'error' })
    }
  }
}

/**
 * ── DER MELDE-KNOPF IST ZURÜCK (F15, 2026-08-03) ────────────────────────────
 *
 * Hier stand bis zum 2026-08-01 einer, und er wurde ENTFERNT (Moderations-Audit
 * Befund 4): er schickte `targetType: 'event'` an /api/reports und versprach
 * „Die Moderation sieht sich die Meldung an." Das stimmte nicht — keine Queue
 * kannte den Typ. Die Zeilen entstanden, wurden gezählt und nie gesehen.
 *
 * Was seitdem gebaut wurde, macht die Zusage wahr: `events.moderate`, der Status
 * `hidden`, die Routen `/api/events/{moderation,:id/hide,:id/restore}`, die Seite
 * `/dashboard/events-moderation` und die Registrierung des Ziel-Typs
 * (`server/plugins/report-target.ts`). Erst damit darf der Knopf wieder da sein.
 *
 * ER KOMMT ALS SLOT, NICHT ALS IMPORT. `ReportButton` gehört dem moderation-
 * Layer, und ein Produkt-Layer darf einen anderen nicht kennen (A14) — in einer
 * Silo-App ohne moderation wäre der Import ein Build-Fehler. Gefüllt wird der
 * Slot deshalb von der KOMPOSITION, genau wie `#comments`:
 * `packages/blueprint/app/pages/events/[id].vue`. Bleibt er leer, fehlt nur der
 * Knopf — und das ist dann ehrlich, denn ohne moderation gibt es auch keine
 * Queue.
 */

/**
 * „Termin bearbeiten" (F58, 2026-08-16) — der Einstieg in die Verwaltung, den
 * es von der Detailseite aus bis hierher nicht gab.
 *
 * ER STEHT IN DIESER KOMPONENTE UND NICHT IN DER SEITE, und das ist der Punkt:
 * die Detailseite gibt es ZWEIMAL (events-Layer + Bauplan-Fassung in
 * packages/blueprint) — eine Kopie ohne die andere wäre genau der Unterschied
 * zwischen Pool und Silo, den PRODUKT-BILANZ.md ausschließt. Beide rendern
 * `EventDetail`, also trägt sie den Knopf.
 *
 * DER DIALOG ÖFFNET HIER (Davids Entscheidung zum ersten F58-Entwurf, der nach
 * `/dashboard/events?edit=<id>` verlinkte). Ein Link hätte den Termin, den man
 * gerade vor sich hat, gegen eine Tabelle eingetauscht — geteilt gehört das
 * FORMULAR (`EventFormModal`, dasselbe wie im Dashboard), nicht der Einstieg.
 *
 * WELCHE STATUS HIER VORKOMMEN: nur 'published' und 'cancelled'. Ein Entwurf
 * trägt kein Leserecht, ein ausgeblendeter Termin auch nicht — beide antworten
 * auf dieser Route 404. Deshalb gibt es hier kein „Veröffentlichen": der Knopf
 * könnte nie erscheinen. Der `eventIsEditable`-Guard bleibt trotzdem stehen, er
 * ist dieselbe pure Regel, die die PATCH-Route durchsetzt.
 */
/**
 * ÜBERSETZEN (Davids Entscheidung 2026-08-18: die KI-Übersetzung gilt jetzt
 * auch für Events und Kurse). Die Regel liegt im Core-Composable — hier steht
 * nur, WAS dieses Produkt übersetzt (Titel UND Beschreibung) und welche Route
 * das tut.
 *
 * Diese Komponente ist die EINZIGE Anlegestelle: die Bauplan-Seite reicht nur
 * den Kommentar- und den Melden-Slot durch (A14). Ein Knopf dort wäre
 * Produkt-Logik im Kompositions-Layer.
 *
 * GESCHWÄRZT (F46) ⇒ kein Knopf: `body` ist dann leer, und das Composable
 * blendet ihn ohne Text von selbst aus — dieselbe Regel, aus der ein
 * beschreibungsloser Termin keinen bekommt. Die Route würde es sonst mit 400
 * beantworten; hier gar nicht erst zu fragen ist die ehrlichere Fläche.
 */
const {
  canTranslate,
  showing: translationShowing,
  busy: translationBusy,
  entry: translation,
  show: showTranslation,
  showOriginal: showEventOriginal,
} = useUgcTranslation({
  translations: () => event.value.translations,
  body: () => event.value.description,
  translate: async (targetLocale) => {
    const result = await $fetch<EventTranslateResponse>(`/api/events/${event.value.$id}/translate`, {
      method: 'POST',
      body: { locale: targetLocale },
    })
    // `null` heißt „das Original hat keinen Titel" — der Eintrag trägt das Feld
    // dann gar nicht, und die Anzeige unten fällt auf `event.title` zurück.
    return { ...(result.title ? { title: result.title } : {}), body: result.body }
  },
})

/** Was tatsächlich dasteht — mit Rückfall auf die Grundfassung je Feld. */
const shownTitle = computed(() =>
  translationShowing.value ? (translation.value?.title ?? event.value.title) : event.value.title)
const shownDescription = computed(() =>
  translationShowing.value ? (translation.value?.body ?? event.value.description) : event.value.description)

const canManage = useCapability('events.manage')
const confirm = useConfirm()
const managing = ref(false)
const editOpen = ref(false)

const canEdit = computed(() => canManage.value && eventIsEditable(event.value.status))

function onSaved(row: EventRow) {
  event.value = { ...row }
}

/**
 * ZURÜCKZIEHEN VERLÄSST DIE SEITE — kein Notbehelf, sondern die ehrliche Folge:
 * der PATCH entzieht der Row das Leserecht (withoutPublishedRead), ab diesem
 * Moment antwortet genau diese Seite 404. Wer hier bliebe, sähe eine intakte
 * Seite, die beim ersten Neuladen verschwindet. Weiter geht es dort, wo
 * zurückgezogene Termine sichtbar sind: im Dashboard.
 */
async function unpublish() {
  managing.value = true
  try {
    await $fetch(`/api/events/${event.value.$id}`, { method: 'PATCH', body: { status: 'draft' } })
    toast.add({
      title: t('events.admin.unpublished'),
      description: t('events.admin.unpublishedHint'),
      color: 'success',
    })
    await navigateTo(localePath('/events'))
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), description: t('events.admin.actionFailedHint'), color: 'error' })
  }
  finally {
    managing.value = false
  }
}

/**
 * Absagen lässt die Seite stehen: der Soft-Cancel BEHÄLT das Leserecht, damit
 * die Zusagenden die Absage sehen ([id].delete.ts). Deshalb hier kein Weggehen,
 * sondern nur der lokale Status — den Rest erledigt der `cancelled`-Zweig
 * (durchgestrichener Titel + Alert).
 */
async function cancelEvent() {
  try {
    const ok = await confirm({
      title: t('events.admin.confirmCancelTitle'),
      description: t('events.admin.confirmCancelText', { title: event.value.title }),
      confirmLabel: t('events.admin.cancel'),
      action: () => $fetch(`/api/events/${event.value.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    event.value = { ...event.value, status: 'cancelled' }
    toast.add({ title: t('events.admin.cancelled'), description: t('events.admin.cancelledHint'), color: 'success' })
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), description: t('events.admin.actionFailedHint'), color: 'error' })
  }
}

/** Gäste: geblurte Platzhalter statt echter Teilnehmer */
const placeholderCount = computed(() => Math.min(event.value.attendeeCount, 8))

/** Tages-Zahl in der Anzeigezone (Monat daneben kommt aus derselben Quelle). */
const startDayNumber = computed(() => formatDayNumber(event.value.startAt))
</script>

<template>
  <article>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <UButton
        :to="localePath('/events')"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-ph-arrow-left"
        data-testid="event-back"
      >
        {{ t('events.detail.back') }}
      </UButton>
      <div v-if="canManage" class="flex flex-wrap items-center gap-2" data-testid="event-manage-actions">
        <UButton
          v-if="canEdit"
          color="neutral"
          variant="subtle"
          size="sm"
          icon="i-ph-pencil-simple"
          data-testid="event-edit"
          @click="() => { editOpen = true }"
        >
          {{ t('events.detail.edit') }}
        </UButton>
        <UButton
          v-if="canEdit && event.status === 'published'"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-eye-slash"
          :loading="managing"
          data-testid="event-unpublish"
          @click="unpublish"
        >
          {{ t('events.admin.unpublish') }}
        </UButton>
        <UButton
          v-if="event.status !== 'cancelled'"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-ph-calendar-x"
          data-testid="event-cancel"
          @click="cancelEvent"
        >
          {{ t('events.admin.cancel') }}
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="event.status === 'cancelled'"
      color="error"
      variant="subtle"
      icon="i-ph-calendar-x"
      :title="t('events.detail.cancelled')"
      class="mb-6"
      data-testid="event-cancelled"
    />

    <div class="gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <!-- Sidebar (mobil zuerst: Cover + Fakten oben, wie Meetup mobile) -->
      <aside class="order-first mb-6 lg:sticky lg:top-4 lg:order-last lg:mb-0">
        <div class="overflow-hidden rounded-xl border border-default">
          <div class="relative">
            <!-- Bild-Naht Schritt 2 (C14). Die Spalte ist auf lg exakt 320 px
                 breit, darunter volle Viewport-Breite — zwei Stufen genügen.
                 Der Haken data-testid bleibt am handelnden Element. -->
            <NuxtImg
              v-if="event.coverFileId"
              provider="appwrite"
              :src="coverSource(event.coverFileId)"
              :alt="event.title"
              sizes="xs:100vw lg:320px"
              :placeholder="[24, 14, 40]"
              decoding="async"
              class="aspect-video w-full object-cover"
              data-testid="event-cover"
            />
            <div
              v-else
              class="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-elevated"
              data-testid="event-cover-fallback"
            >
              <div class="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-default/80 text-center shadow-sm">
                <span class="text-xl leading-tight font-bold">{{ startDayNumber }}</span>
                <span class="text-xs text-muted uppercase">{{ formatMonthShort(event.startAt) }}</span>
              </div>
            </div>
            <ClientOnly>
              <UBadge
                v-if="event.status === 'published' && isUpcoming"
                color="success" variant="solid" class="absolute top-2 left-2"
                data-testid="event-countdown"
              >
                {{ t('events.detail.startsIn', { when: formatRelativeTime(event.startAt) }) }}
              </UBadge>
            </ClientOnly>
          </div>

          <div class="space-y-3 p-4 text-sm">
            <div class="flex items-start gap-2">
              <UIcon name="i-ph-clock" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div data-testid="event-time">
                <p class="font-medium">{{ formatDateSpan(event.startAt, event.endAt) }}</p>
                <p v-if="event.endAt && sameDay(event.startAt, event.endAt)" class="text-muted">
                  {{ formatTime(event.startAt) }} – {{ formatTime(event.endAt) }}
                </p>
                <p v-else-if="isMultiDay(event.startAt, event.endAt)" class="text-muted" data-testid="event-multiday">
                  {{ t('events.detail.multiDay', { from: formatDateTime(event.startAt), to: formatDateTime(event.endAt!) }) }}
                </p>
              </div>
            </div>

            <div v-if="locationType === 'online'" class="flex items-center gap-2" data-testid="event-online">
              <UIcon :name="provider.icon" class="size-4 shrink-0 text-muted" />
              <span>{{ t('events.card.online') }}<template v-if="provider.label"> · {{ provider.label }}</template></span>
            </div>
            <div v-else-if="event.location || event.address" class="flex items-start gap-2">
              <UIcon name="i-ph-map-pin" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div class="min-w-0">
                <p v-if="event.location">{{ event.location }}</p>
                <p v-if="event.address" class="text-muted">{{ event.address }}</p>
                <a
                  v-if="mapsUrl"
                  :href="mapsUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                  data-testid="event-maps"
                >
                  {{ t('events.detail.findUs') }}
                </a>
              </div>
            </div>

            <div v-if="event.url && locationType === 'online' && !joinOpen" class="flex items-center gap-2">
              <UIcon name="i-ph-link" class="size-4 shrink-0 text-muted" />
              <a :href="event.url" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
                {{ t('events.detail.link') }}
              </a>
            </div>

            <div class="flex items-center gap-2">
              <UIcon name="i-ph-users" class="size-4 shrink-0 text-muted" />
              <span data-testid="event-attendees">
                {{ event.capacity !== null
                  ? t('events.card.attendeesOfCapacity', { count: event.attendeeCount, capacity: event.capacity })
                  : t('events.card.attendees', { count: event.attendeeCount }) }}
                <template v-if="isFull && event.status === 'published'"> · {{ t('events.card.full') }}</template>
              </span>
              <span v-if="spotsLeft" class="font-medium text-warning" data-testid="event-scarcity">
                {{ t('events.detail.spotsLeft', { count: spotsLeft }) }}
              </span>
            </div>

            <ClientOnly>
              <div v-if="viewerCount > 1" class="flex items-center gap-2 text-muted" data-testid="event-viewers">
                <UIcon name="i-ph-eye" class="size-4 shrink-0" />
                <span>{{ t('events.detail.viewers', { count: viewerCount }) }}</span>
              </div>
            </ClientOnly>

            <div v-if="isPaid" class="flex items-center gap-2 border-t border-default pt-3" data-testid="event-price">
              <UIcon name="i-ph-ticket" class="size-4 shrink-0 text-muted" />
              <span class="font-medium">{{ priceLabel }}</span>
            </div>

            <UButton
              v-if="isPaid && event.status === 'published' && ticketCheckoutPath && isLoggedIn"
              color="primary" size="lg" icon="i-ph-ticket" block
              :loading="buying"
              data-testid="event-buy-ticket"
              @click="buyTicket"
            >
              {{ t('events.ticket.buy') }}
            </UButton>
            <UButton
              v-else-if="isPaid && event.status === 'published'"
              color="primary" size="lg" icon="i-ph-ticket" block disabled
              data-testid="event-buy-ticket"
            >
              {{ t('events.ticket.buy') }} · {{ ticketCheckoutPath ? t('events.rsvp.loginCta') : t('events.ticket.soon') }}
            </UButton>

            <div class="border-t border-default pt-3">
              <RsvpButtons :event="event" :my-rsvp="myRsvp" @updated="onRsvpUpdated" />
            </div>

            <ClientOnly>
              <UButton
                v-if="joinOpen && myRsvp === 'going'"
                :href="event.url!" external target="_blank"
                color="primary" size="lg" icon="i-ph-broadcast" block
                data-testid="event-join-live"
              >
                {{ t('events.detail.joinLive') }}
              </UButton>
            </ClientOnly>

            <UButton
              v-if="event.replayUrl"
              :href="event.replayUrl" external target="_blank"
              color="neutral" variant="soft" size="sm" icon="i-ph-play-circle" block
              data-testid="event-replay"
            >
              {{ t('events.detail.replay') }}
            </UButton>

            <div class="flex gap-2">
              <UButton
                color="neutral" variant="outline" size="sm" icon="i-ph-share-network" class="flex-1 justify-center"
                data-testid="event-share" @click="share"
              >
                {{ t('events.detail.share') }}
              </UButton>
              <UButton
                :href="`/api/events/${event.$id}/ics`" external
                color="neutral" variant="outline" size="sm" icon="i-ph-calendar-plus" class="flex-1 justify-center"
                data-testid="event-ics"
              >
                {{ t('events.detail.ics') }}
              </UButton>
            </div>
          </div>
        </div>
      </aside>

      <!-- Hauptspalte -->
      <div class="min-w-0">
        <!-- Geschwärzt: der Titel ist leer. Der Platzhalter kommt aus i18n und
             steht bewusst NICHT durchgestrichen da — durchgestrichen ist der
             abgesagte TERMIN, nicht die Auskunft, dass hier etwas entfernt
             wurde. -->
        <h1 v-if="isRedacted" class="text-2xl font-bold text-muted italic" data-testid="event-redacted-title">
          {{ t('events.redacted.title') }}
        </h1>
        <h1 v-else class="text-2xl font-bold" :class="{ 'line-through opacity-60': event.status === 'cancelled' }">
          {{ shownTitle }}
        </h1>
        <div v-if="event.organizerName" class="mt-2 flex items-center gap-2 text-sm text-muted">
          <UAvatar :src="initial.organizerAvatarUrl ?? undefined" :alt="event.organizerName" :text="avatarInitials(event.organizerName)" size="xs" />
          <span>{{ t('events.detail.organizer', { name: event.organizerName }) }}</span>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <EventVoteButtons :event="event" :my-vote="myVote" @updated="onVoted" />
          <!-- Melden (F15) — gefüllt von der Bauplan-Komposition, s. Kopfkommentar.
               Steht bewusst NEBEN den Stimmen und nicht in der Info-Karte: es ist
               eine Aussage über den INHALT, und der steht in dieser Spalte. -->
          <slot name="actions" :event="event" />
        </div>

        <h2 class="mt-8 mb-2 font-semibold">{{ t('events.detail.details') }}</h2>
        <!-- Geschwärzt (F46): statt der leeren Beschreibung die Auskunft, WARUM
             hier nichts steht. Ein leerer Block sähe nach einem Fehler aus. -->
        <UAlert
          v-if="isRedacted"
          color="neutral"
          variant="subtle"
          icon="i-ph-eraser"
          :description="t('events.redacted.notice')"
          data-testid="event-redacted"
        />
        <!-- Markdown (Listen, fett, …) ohne Raw-HTML; lange Texte geklappt -->
        <ContentClamp v-else :lines="10" :text="shownDescription">
          <MarkdownContent :source="shownDescription" class="text-sm leading-relaxed" data-testid="event-description" />
        </ContentClamp>

        <!-- Übersetzen: dezent unter dem Text, kein Bedienelement der Karte —
             es beantwortet eine Frage an DIESEN Text (Muster PostCard). -->
        <div v-if="!isRedacted && canTranslate" class="mt-2 flex flex-wrap items-center gap-1 text-xs text-dimmed">
          <template v-if="translationShowing">
            <UIcon name="i-ph-translate" class="size-3.5 shrink-0" />
            <span>{{ t('translation.notice') }}</span>
            <span aria-hidden="true">·</span>
            <UButton color="neutral" variant="link" size="xs" class="p-0" data-testid="event-translate-original" @click="showEventOriginal">
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
            data-testid="event-translate"
            @click="showTranslation"
          >
            {{ t('translation.action') }}
          </UButton>
        </div>

        <div v-if="event.locationNotes && locationType === 'venue'" class="mt-6 rounded-lg bg-elevated/60 p-3 text-sm" data-testid="event-location-notes">
          <p class="mb-1 font-medium">{{ t('events.detail.findUs') }}</p>
          <p class="whitespace-pre-line text-muted">{{ event.locationNotes }}</p>
        </div>

        <h2 class="mt-8 mb-2 font-semibold" data-testid="event-attendees-title">
          {{ t('events.detail.attendeesTitle', { count: event.attendeeCount }) }}
        </h2>
        <div v-if="isLoggedIn && initial.attendees.length > 0" class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="event-attendee-list">
          <div
            v-for="attendee in initial.attendees"
            :key="attendee.userId"
            class="flex items-center gap-2 rounded-lg border border-default p-2"
          >
            <UAvatar :src="attendee.avatarUrl ?? undefined" :alt="attendee.name" :text="avatarInitials(attendee.name)" size="sm" />
            <span class="truncate text-sm">{{ attendee.name }}</span>
          </div>
        </div>
        <div v-else-if="!isLoggedIn && placeholderCount > 0" class="flex items-center gap-3" data-testid="event-attendees-blurred">
          <div class="flex -space-x-2" aria-hidden="true">
            <span v-for="i in placeholderCount" :key="i" class="size-8 rounded-full bg-accented blur-[3px] ring-2 ring-default" />
          </div>
          <UButton :to="localePath('/login')" color="neutral" variant="link" size="sm" class="px-0">
            {{ t('events.detail.loginToSee') }}
          </UButton>
        </div>
        <p v-else class="text-sm text-muted">{{ t('events.detail.noAttendees') }}</p>

        <div class="mt-10">
          <slot name="comments" :event="event" />
        </div>
      </div>
    </div>

    <!-- Dasselbe Formular wie im Dashboard; Titelbild inklusive, weil hier eine
         Event-Id vorliegt (der Upload braucht sie). -->
    <EventFormModal v-model:open="editOpen" :event="event" @saved="onSaved" />
  </article>
</template>
