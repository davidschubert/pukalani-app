<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Comment, CommentTranslateResponse } from '../../shared/types/comment'

const props = withDefaults(defineProps<{
  comment: Comment
  childCount?: number
  collapsed?: boolean
}>(), { childCount: 0, collapsed: false })

const emit = defineEmits<{ toggleCollapse: [] }>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()
const { formatDate } = useFormatDate()
// Store der umgebenden CommentSection (ein Store pro Target, Phase 25)
const store = inject(commentStoreKey)!
const toast = useToast()
const { user, isLoggedIn } = useCurrentUser()
const { canWrite, canDelete } = useCommentPolicy()

const isAuthor = computed(() => user.value?.$id === props.comment.authorId)
const isDeleted = computed(() => props.comment.status === 'deleted')

// Pro-Kommentar-Presence (von CommentSection): wer antwortet / liest hier gerade
const threadPresence = inject(threadPresenceKey, null)
const replyingHere = computed(() => threadPresence?.replyingOthers.value.get(props.comment.$id) ?? [])
const nearHere = computed(() => threadPresence?.nearOthers.value.get(props.comment.$id) ?? [])
const replyingText = computed(() => {
  const list = replyingHere.value
  if (list.length === 0) return ''
  if (list.length === 1) return t('comments.presence.replyingOne', { name: list[0]!.userName })
  return t('comments.presence.replyingMany', { count: list.length })
})

const replying = ref(false)
const editing = ref(false)
const editContent = ref('')
const busy = ref(false)

function startEdit() {
  editContent.value = props.comment.content
  editing.value = true
}

async function saveEdit() {
  if (!editContent.value.trim()) return
  busy.value = true
  try {
    await store.updateComment(props.comment.$id, editContent.value)
    editing.value = false
  }
  catch {
    toast.add({ title: t('comments.item.error'), description: t('comments.item.editErrorHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await store.deleteComment(props.comment.$id)
  }
  catch {
    toast.add({ title: t('comments.item.error'), description: t('comments.item.deleteErrorHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// Edit / Delete des Autors hinter dem ⋯-Menü. Melden (andere) ist ein eigener
// ReportButton (Moderation-Layer) — siehe Aktionszeile.
const menuItems = computed<DropdownMenuItem[][]>(() => {
  if (isDeleted.value || !isAuthor.value) return []
  const items: DropdownMenuItem[] = []
  if (canWrite.value) items.push({ label: t('comments.item.edit'), icon: 'i-ph-pencil-simple', onSelect: startEdit })
  if (canDelete.value) items.push({ label: t('comments.item.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void remove() } })
  return items.length ? [items] : []
})

// Melden: nur eingeloggte Nicht-Autoren, solange schreibbar und sichtbar
const canReport = computed(() =>
  !isDeleted.value && isLoggedIn.value && !isAuthor.value && canWrite.value
  && props.comment.status === 'active',
)

/**
 * ÜBERSETZEN (Paket 3, Davids Entscheidungen 2026-08-17: ein Knopf je Inhalt;
 * seit 2026-11-17 nur für Mitglieder der Community, MM1). Das Zwillingsstück zur `PostCard`, bis auf das eine Feld:
 * eine Antwort hat keinen Titel. Die Regel liegt im Core-Composable.
 *
 * Ein GELÖSCHTER Kommentar zeigt nur einen Platzhalter — `body` ist dann leer,
 * und `canTranslate` schaltet den Knopf schon deshalb ab (die Route weist ihn
 * zusätzlich mit 400 ab). Im Embed sind Gäste nicht eingeloggt und sehen ihn
 * ebenfalls nicht; das ist so gewollt, denn die Route antwortet ihnen 401.
 */
const {
  canTranslate,
  showing: translationShowing,
  busy: translationBusy,
  entry: translation,
  show: showTranslation,
  showOriginal: showCommentOriginal,
} = useUgcTranslation({
  translations: () => props.comment.translations,
  body: () => (isDeleted.value ? '' : props.comment.content),
  translate: async (locale) => {
    const result = await $fetch<CommentTranslateResponse>(`/api/comments/${props.comment.$id}/translate`, {
      method: 'POST',
      body: { locale },
    })
    return { body: result.body }
  },
})

const shownContent = computed(() =>
  translationShowing.value ? (translation.value?.body ?? props.comment.content) : props.comment.content)

// Reason-Katalog liefert der Konsument (comments) lokalisiert — Moderation bleibt agnostisch
const reportReasons = computed(() => [
  { value: 'spam', label: t('comments.report.reasons.spam') },
  { value: 'harassment', label: t('comments.report.reasons.harassment') },
  { value: 'offtopic', label: t('comments.report.reasons.offtopic') },
  { value: 'other', label: t('comments.report.reasons.other') },
])
</script>

<template>
  <article class="rounded-lg p-3 text-sm ring ring-default bg-elevated/40 transition-colors hover:bg-elevated/70" data-comment :data-comment-id="comment.$id">
    <!-- Kopfzeile: Avatar · Name · relative Zeit · bearbeitet · gemeldet -->
    <div class="flex items-center gap-2 text-xs text-muted">
      <UserAvatar :user="{ name: comment.authorName, prefs: { avatarUrl: comment.authorAvatarUrl } }" size="xs" />
      <span class="font-medium text-default">{{ comment.authorName }}</span>
      <!--
        AKTIONEN AM NAMEN (F56) — Registry `pukalani.chrome.authorActions`
        (core/shared/types/chrome.ts), nicht ein Import aus messages: comments
        darf dieses Produkt nicht kennen (A14). `iconOnly`, weil diese
        Kopfzeile eine gedrängte Reihe aus Name, Zeichen und Zeitstempel ist —
        ein beschrifteter Knopf würde sie sprengen. Ein Gast (authorId '')
        bekommt nichts: `CoreAuthorActions` rendert ohne userId nicht.
      -->
      <CoreAuthorActions :user-id="comment.authorId" :handle="comment.authorHandle" size="xs" icon-only />
      <!--
        „Ehemaliges Mitglied" (Davids Zusatz vom 2026-07-29): ein ICON mit
        Tooltip, kein Badge — der Name bleibt die Hauptsache, das Zeichen
        erklärt nur, warum diese Person nicht mehr antwortet. Es steht direkt
        hinter dem Namen, weil es zu IHM gehört, nicht zum Beitrag.
      -->
      <UTooltip v-if="comment.authorFormerMember" :text="t('comments.item.formerMember')">
        <UIcon
          name="i-ph-user-minus"
          class="size-4 text-muted"
          :aria-label="t('comments.item.formerMember')"
          data-former-member
        />
      </UTooltip>
      <!-- Gast-Kennzeichnung (Embed E4): kein Account, frei gewählter Name -->
      <UBadge v-if="comment.authorKind === 'guest'" color="neutral" variant="subtle" size="sm">
        {{ t('comments.guest.badge') }}
      </UBadge>
      <span aria-hidden="true">·</span>
      <span :title="formatDate(comment.$createdAt)">{{ formatRelativeTime(comment.$createdAt) }}</span>
      <span v-if="comment.editedAt" :title="formatDate(comment.editedAt)">· {{ t('comments.item.edited') }}</span>

      <!-- Lese-Präsenz: wer liest gerade diesen Kommentar -->
      <div
        v-if="nearHere.length"
        class="ms-auto flex items-center"
        :title="t('comments.presence.readingHere', { count: nearHere.length })"
      >
        <UAvatarGroup size="3xs" :max="3">
          <UTooltip v-for="u in nearHere" :key="u.userId" :text="u.userName">
            <UAvatar :src="u.avatarUrl || undefined" :alt="u.userName" :text="avatarInitials(u.userName)" />
          </UTooltip>
        </UAvatarGroup>
      </div>
    </div>

    <p v-if="isDeleted" class="mt-2 italic text-muted">{{ t('comments.item.deleted') }}</p>

    <template v-else-if="editing">
      <UTextarea v-model="editContent" :rows="3" class="mt-2 w-full" />
      <div class="mt-2 flex gap-2">
        <UButton size="xs" :loading="busy" @click="saveEdit">{{ t('comments.item.save') }}</UButton>
        <UButton size="xs" color="neutral" variant="ghost" @click="() => { editing = false }">{{ t('comments.item.cancel') }}</UButton>
      </div>
    </template>

    <!-- Markdown-Subset (fett/kursiv/code/Links/Listen/Zitate) — sicheres
         vnode-Rendering ohne v-html; lange Kommentare klappen auf 5 Zeilen
         zusammen („Mehr erfahren", YouTube-Muster) -->
    <!-- DERSELBE Renderpfad für Grundfassung und Übersetzung (nur die Quelle
         wechselt) — ein zweiter wäre die Stelle, an der beide auseinanderlaufen. -->
    <ContentClamp v-else :lines="5" :text="shownContent" class="mt-2">
      <MarkdownContent :source="shownContent" class="text-default" />
    </ContentClamp>

    <!-- Übersetzen: dezent unter dem Text, nicht in der Aktionszeile darunter —
         es beantwortet eine Frage an DIESEN Text, es bedient nicht die Antwort. -->
    <div v-if="!editing && !isDeleted && canTranslate" class="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-dimmed">
      <template v-if="translationShowing">
        <UIcon name="i-ph-translate" class="size-3.5 shrink-0" />
        <span>{{ t('translation.notice') }}</span>
        <span aria-hidden="true">·</span>
        <UButton color="neutral" variant="link" size="xs" class="p-0" data-comment-translate-original @click="showCommentOriginal">
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
        data-comment-translate
        @click="showTranslation"
      >
        {{ t('translation.action') }}
      </UButton>
    </div>

    <!-- Antwort-Presence: jemand tippt gerade eine Antwort auf DIESEN Kommentar -->
    <p v-if="replyingText" class="mt-1.5 flex items-center gap-1 text-xs text-info">
      <UIcon name="i-ph-arrow-bend-up-left" class="size-3.5 shrink-0" />
      {{ replyingText }}
    </p>

    <!-- Aktionszeile: Votes · Reaktionen · Antworten ein-/ausklappen · Antworten · ⋯ -->
    <!--
      `flex-wrap` seit F57: die Emoji-Leiste kann bis zu acht Chips tragen, und
      eine Reihe, die nicht umbricht, schiebt auf dem Telefon das ⋯-Menü aus
      dem Bild. Ohne Reaktionen sieht die Zeile aus wie vorher.
    -->
    <div v-if="!editing" class="mt-1.5 -ml-1.5 flex flex-wrap items-center gap-1 text-muted">
      <VoteButtons :comment="comment" />

      <!--
        REAKTIONEN AUF ANTWORTEN (F57, Davids Entscheidung 2026-08-13).
        Sie stehen NEBEN den Stimmen, nicht statt ihrer: eine Reaktion ist
        reiner Ausdruck und zählt für kein Abzeichen ausser „erste Reaktion".
        Auf einem `[gelöscht]`-Platzhalter gibt es nichts auszudrücken — die
        Route weist ihn ebenfalls ab (409), das hier ist nur die Anzeige-Seite
        derselben Regel.
      -->
      <CommentReactionBar v-if="!isDeleted" :target-id="comment.$id" />

      <UButton
        v-if="childCount > 0"
        size="xs" color="neutral" variant="ghost"
        :icon="collapsed ? 'i-ph-arrows-out-line-vertical' : 'i-ph-arrows-in-line-vertical'"
        :aria-label="collapsed ? t('comments.item.expandReplies') : t('comments.item.collapseReplies')"
        @click="emit('toggleCollapse')"
      >
        {{ childCount }}
      </UButton>

      <template v-if="!isDeleted">
        <UButton
          v-if="isLoggedIn && canWrite"
          size="xs"
          :color="replying ? 'primary' : 'neutral'"
          :variant="replying ? 'soft' : 'ghost'"
          :icon="replying ? 'i-ph-x' : 'i-ph-chat-circle'"
          :aria-expanded="replying"
          @click="() => { replying = !replying }"
        >
          {{ replying ? t('comments.item.cancel') : t('comments.item.reply') }}
        </UButton>

        <ReportButton
          v-if="canReport"
          target-type="comment"
          :target-id="comment.$id"
          :reasons="reportReasons"
          :reported="store.isReportedByMe(comment.$id)"
          @update:reported="(v: boolean) => store.setReported(comment.$id, v)"
        />

        <UDropdownMenu v-if="menuItems.length" :items="menuItems" :content="{ align: 'start' }">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-ph-dots-three" :aria-label="t('comments.item.more')" />
        </UDropdownMenu>
      </template>
    </div>

  </article>

  <!-- Antwort-Formular AUSSERHALB der Eltern-Karte, exakt auf der Ebene, wo
       die Antwort landet (gleiche Einrückung + Karten-Optik wie die Kind-
       Kommentare) — klappt sanft auf, Feld fokussiert -->
  <Transition :css="false" @enter="expandEnter" @leave="expandLeave">
    <div v-if="replying" class="mt-2 ml-3 border-l border-default pl-4" data-reply-form>
      <div class="rounded-lg bg-elevated/40 p-3 ring ring-default">
        <CommentForm
          :parent-id="comment.$id"
          autofocus
          @created="() => { replying = false }"
        />
      </div>
    </div>
  </Transition>
</template>
