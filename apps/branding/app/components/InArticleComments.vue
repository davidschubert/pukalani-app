<script setup lang="ts">
import { INSIGHTS_ARTICLE_COMMENT_TARGET } from '../../../../packages/insights/shared/insightsPublic'

/**
 * KOMPOSITION Artikel + Kommentare (BI2 K7, 2026-11-09) — füllt den
 * Platzhalter des insights-Layers mit der `CommentSection` des comments-Layers.
 *
 * WARUM DAS IN DER APP STEHT UND NICHT IN `packages/blueprint` (Davids
 * Entscheidung 2026-11-09, DECISION-LOG): Kompositionen gehören sonst genau
 * einmal in den Bauplan, damit Pool und Silo dasselbe zeigen. Der Bauplan
 * zieht aber per `requires` posts/events/courses samt Tabellen, Seiten
 * (/feed, /discussions, /events, /courses) und eigenem Standard-Layout mit —
 * branding.supply trägt ihn deshalb bewusst nicht (Kopf von nuxt.config.ts).
 * Und der Grund der Regel greift hier nicht: insights läuft auf genau EINER
 * Site, es gibt keinen Pool, der etwas anderes zeigen könnte. Die Verdrahtung
 * existiert also auch so genau einmal. Bekommt insights eine zweite Site, zieht
 * diese Datei in einen Kompositions-Layer um.
 *
 * Muster: `TicketModalComments` (tickets-Layer hält die Stelle frei, die App
 * überschreibt sie). Der `targetType` kommt aus insights, weil dort auch der
 * Schreib-Wächter steht, der nur öffentliche Artikel durchlässt.
 */
defineProps<{
  postId: string
  path: string
}>()
</script>

<template>
  <div class="mt-16">
    <CommentSection :target-type="INSIGHTS_ARTICLE_COMMENT_TARGET" :target-id="postId" :target-url="path" />
  </div>
</template>
