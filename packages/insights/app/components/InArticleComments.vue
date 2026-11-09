<script setup lang="ts">
/**
 * DER PLATZ FÜR DIE DISKUSSION UNTER EINEM ARTIKEL (BI2 K7, 2026-11-09).
 *
 * Dieser Layer kennt den comments-Layer NICHT (A14) — er hält nur die Stelle
 * frei. Die APP, die beide montiert, überschreibt diese Komponente mit ihrer
 * `CommentSection` (heute `apps/branding/app/components/InArticleComments.vue`;
 * dasselbe Muster wie `TicketModalComments` im tickets-Layer).
 *
 * WARUM DIE APP UND NICHT `blueprint`: der Kompositions-Layer zieht per
 * `requires` posts/events/courses samt Tabellen, Seiten und eigenem
 * Standard-Layout mit, und branding.supply trägt ihn deshalb bewusst nicht.
 * insights läuft auf genau EINER Site, die Verdrahtung existiert also auch
 * so genau einmal (Davids Entscheidung 2026-11-09, DECISION-LOG).
 *
 * Ohne Override rendert sie NICHTS — anders als der Ticket-Platzhalter, der
 * „nicht verdrahtet" sagt: dort liest ein Betreiber, hier ein anonymer Leser,
 * und dem ist ein Hinweis auf fehlende Technik keine Auskunft.
 *
 * Nur Artikel bekommen diese Stelle. Markenprofil, Duell und Ranking urteilen
 * über fremde Marken und hängen am Anwalt; der Schreib-Wächter
 * (`server/plugins/comment-target.ts`) hält das auch serverseitig zu.
 */
defineProps<{
  /** Row-Id des Beitrags — der `targetId` der Kommentare (nicht der Slug). */
  postId: string
  /** Pfad der Seite für Antwort-Benachrichtigungen, mit Locale-Präfix. */
  path: string
}>()
</script>

<template>
  <div v-if="false" />
</template>
