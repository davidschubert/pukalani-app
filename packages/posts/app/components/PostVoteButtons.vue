<script setup lang="ts">
import { LIKE_LIMIT_REACHED } from '../../../core/shared/likeAllowance'
import type { FeedPost, PostVoteResponse, PostVoteValue } from '../../shared/types/post'

/**
 * Up-/Downvote auf einen Post (Toggle wie comments/VoteButtons — bewusst
 * eigener Layer-Baustein: comment_votes hängen an Kommentar-Rows, Posts
 * haben ihr eigenes Datenmodell). Server antwortet autoritativ mit
 * Zählern + myVote; die Karte übernimmt beides.
 */
const props = defineProps<{ post: FeedPost }>()

const emit = defineEmits<{ updated: [post: FeedPost] }>()

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const busy = ref(false)

async function vote(value: PostVoteValue) {
  if (busy.value || !isLoggedIn.value) return
  busy.value = true
  try {
    const res = await $fetch<PostVoteResponse>(`/api/posts/${props.post.$id}/score`, {
      method: 'POST',
      body: { value },
    })
    emit('updated', { ...props.post, ...res.post, myPostVote: res.myVote })
  }
  catch (error) {
    /**
     * DAS TAGES-LIMIT IST KEIN FEHLER (F57 Mechanik 3) — und wird deshalb
     * nicht wie einer gemeldet. „Stimme konnte nicht gespeichert werden. Klick
     * noch einmal" wäre hier schlicht falsch: es kam an, es war nur alle, und
     * noch einmal klicken hilft bis morgen nicht.
     *
     * KEIN DAUERHAFTES AUSGRAUEN des Knopfes: ob noch Kontingent da ist, weiß
     * nur der Server, und der Stand kann sich zwischen zwei Klicks ändern (ein
     * neuer UTC-Tag beginnt). Ein Knopf, der aus einer geratenen Zahl heraus
     * grau wird, wäre irgendwann grau, obwohl es ginge — und umgekehrt.
     */
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add(reason === LIKE_LIMIT_REACHED
      ? { title: t('posts.card.likeLimitReached'), description: t('posts.card.likeLimitReachedHint'), color: 'warning' }
      : { title: t('posts.card.voteFailed'), description: t('posts.card.voteFailedHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5" data-post-votes>
    <UButton
      size="xs"
      :color="post.myPostVote === 1 ? 'primary' : 'neutral'"
      :variant="post.myPostVote === 1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-up"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('posts.card.upvote')"
      :aria-pressed="post.myPostVote === 1"
      data-post-upvote
      @click="vote(1)"
    />
    <span class="min-w-5 text-center text-xs font-medium tabular-nums" data-post-score>{{ post.score ?? 0 }}</span>
    <UButton
      size="xs"
      :color="post.myPostVote === -1 ? 'error' : 'neutral'"
      :variant="post.myPostVote === -1 ? 'soft' : 'ghost'"
      icon="i-ph-arrow-down"
      :disabled="!isLoggedIn || busy"
      :aria-label="t('posts.card.downvote')"
      :aria-pressed="post.myPostVote === -1"
      data-post-downvote
      @click="vote(-1)"
    />
  </div>
</template>
