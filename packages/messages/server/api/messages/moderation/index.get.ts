import { z } from 'zod'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/**
 * DIE MELDE-WARTESCHLANGE der privaten Nachrichten.
 *
 * Sie ist der Grund, warum dieser Layer `targetType: 'message'` überhaupt
 * registrieren darf: der Kopf von `moderation/server/utils/reportTargets.ts`
 * sagt es beim Namen — „ein `targetType`, den niemand moderiert, ist ein
 * VERSPRECHEN INS LEERE". Beides oder keins.
 *
 * ── GELISTET WIRD NUR, WAS EINGEFROREN IST ───────────────────────────────
 * Also genau das, was gemeldet wurde. Eine Liste über alle Nachrichten mit
 * nachträglichem Filter wäre der Anfang der Moderations-Ansicht „alle
 * Konversationen dieser Community", die dieses Konzept ausschließt.
 *
 * Der TEXT in dieser Liste ist der eingefrorene Beleg, nie der lebende Text —
 * und es gibt ihn nur, solange eine Meldung OFFEN ist (SEC-033). Dieselbe
 * Regel und dieselbe Funktion wie in der Einzel-Ansicht
 * (`moderatorVisibleBody`); erledigte Zeilen kommen mit `textAvailable:
 * false` und leerem Text. Gibt die Liste mindestens einen Text heraus, steht
 * das im Betreiber-Protokoll (`message_report.queue_viewed`, nur die Zahl).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  await requireCommunityPermission(event, 'reports.moderate')
  const { limit } = await getValidatedQuery(event, querySchema.parse)

  return { messages: await listReportedMessages(event, limit) }
})
