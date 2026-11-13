import type { ModeratableCommentRow } from '../utils/commentModeration'
import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * Auto-Hide-Threshold (OPEN-ITEMS Idee 5, Embed-Plan § 3f): erreichen die
 * OFFENEN Meldungen zu einem Kommentar den Schwellwert
 * pukalani.comments.autoHideReports (0 = aus, Default), wird er automatisch
 * zweiphasig ausgeblendet — inkl. Cascade (Antworten), wie beim manuellen
 * Hide. Die Meldungen bleiben OFFEN: der Moderator sieht den Fall weiter in
 * der Queue („Gemeldet" + Badge „Ausgeblendet") und entscheidet final
 * (Wiederherstellen hebt den Auto-Hide auf, Meldungen erledigen schließt ihn).
 *
 * Hier meldet comments AUSSERDEM an, dass 'comment' überhaupt ein meldbarer
 * Ziel-Typ ist (Moderations-Audit Befund 8) — dieselbe Stelle, weil derselbe
 * Layer auch die Queue baut, die die Meldungen später zeigt.
 *
 * WER HANDELT (F17): KEIN `actor` — hier handelt gar niemand. Der Auto-Hide
 * löst sich selbst aus, im Request eines MELDERS, und blendet den Beitrag eines
 * DRITTEN aus. Ein `actor: 'member'` machte den Melder zum Autor dieser
 * Moderation (A5) und hinge den Schutzmechanismus an die Zahlungsmoral der
 * Community (M13) — ausgerechnet den.
 */
export default defineNitroPlugin(() => {
  /**
   * MELDBAR: Kommentare. Die Prüfung läuft durch die Datentür über die
   * MITGLIEDER-Klinke (SEC-031, 2026-11-13 — vorher als Operator): gemeldet
   * werden kann, was das Konto LESEN darf. Ein Kommentar aus einer FREMDEN
   * Community, ein ausgeblendeter (kein Leserecht mehr) und eine erfundene Id
   * sind damit gleichermaßen „nicht vorhanden" — die Melde-Route verrät keine
   * Existenz mehr. Tombstones (`status: 'deleted'`) bleiben meldbar, solange
   * ihre Zeile lesbar ist: sie kann Anlass zur Moderation geben.
   */
  registerReportTarget('comment', async (event, targetId) => {
    const row = await tenantDb(event)
      .get<ModeratableCommentRow>(COMMENTS_TABLE, targetId, 'Comment not found')
      .catch(() => null)
    return !!row
  })

  registerReportEscalationHandler('comment', async (event, { targetId, openCount }) => {
    const appConfig = useAppConfig(event) as { pukalani?: { comments?: { autoHideReports?: number } } }
    const threshold = appConfig.pukalani?.comments?.autoHideReports ?? 0
    if (threshold <= 0 || openCount < threshold) return

    // Nur aktive Kommentare — hidden (schon moderiert/auto-versteckt) und
    // deleted (Tombstone) bleiben unangetastet. Die Tür weist zusätzlich
    // fremde Mandanten ab; ein
    // Auto-Hide über die Grenze hinweg wäre besonders tückisch, weil ihn
    // niemand auslöst und niemand sieht.
    const row = await tenantDb(event, { as: 'operator' })
      .get<ModeratableCommentRow>(COMMENTS_TABLE, targetId, 'Comment not found')
      .catch(() => null)
    if (!row || row.status !== 'active') return

    await hideCommentRow(event, row)
    await hideCommentDescendants(event, row)
    console.warn(`[comments] Auto-Hide: Kommentar ${targetId} nach ${openCount} offenen Meldungen ausgeblendet (Threshold ${threshold}) — Meldungen bleiben offen für die Moderation.`)
  })
})
