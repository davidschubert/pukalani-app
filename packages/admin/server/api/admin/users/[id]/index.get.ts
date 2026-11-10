import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserComment, AdminUserDetailResponse } from '../../../../../shared/types/admin'

type CommentRow = Models.Row & Omit<AdminUserComment, '$id' | '$createdAt'>

/**
 * Vollständige User-Sicht: Profil, aktive Sessions und letzte Kommentare.
 *
 * DATENTÜR (Audit-Befund 2026-08-01): die Kommentare kamen bis hierher über den
 * rohen Admin-Client und waren damit POOL-WEIT — die letzte Stelle in
 * `server/api/**`, die an der Mandanten-Tür vorbeilas. Kein Kunden-Leck (die
 * Seite hängt an `users.manage`, also am globalen Betreiber-Label), aber
 * dieselbe Bauart wie der Dashboard-Stats-Befund B2: eine host-gebundene
 * Ansicht zeigte Zeilen fremder Communities. `as: 'operator'` behält den
 * Admin-Client (der Betreiber soll auch versteckte Kommentare sehen),
 * `actor: 'operator'` sagt, dass hier wirklich der Betreiber handelt — die Tür
 * hängt den Mandanten-Filter an. Auf Kontroll-Hosts und in Silo-Apps gibt es
 * keinen Mandanten, dort ändert sich nichts.
 */
export default defineEventHandler(async (event): Promise<AdminUserDetailResponse> => {
  requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const admin = createAdminClient(event)

  let user: Models.User<Models.Preferences>
  try {
    user = await admin.users.get({ userId })
  }
  catch {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  // 'current' kommt aus der Admin-API immer als false zurück (der API-Key agiert
  // nicht als der User). Schaut ein Admin auf das EIGENE Profil, ermitteln wir
  // die aktive Session über den Session-Client und markieren sie selbst.
  const viewingSelf = event.context.user?.$id === userId
  const currentSessionId = viewingSelf
    ? await createSessionClient(event).account.getSession({ sessionId: 'current' })
        .then(s => s.$id).catch(() => '')
    : ''

  const [sessions, targets, comments] = await Promise.all([
    admin.users.listSessions({ userId }).catch(() => ({ sessions: [] as Models.Session[] })),
    // Benachrichtigungskanäle (email/sms/push-Targets)
    admin.users.listTargets({ userId }).catch(() => ({ targets: [] as Models.Target[] })),
    tenantDb(event, { as: 'operator' }).list<CommentRow>('comments', [
      Query.equal('authorId', userId), Query.orderDesc('$createdAt'), Query.limit(10),
    ]).catch(() => ({ total: 0, rows: [] as CommentRow[] })),
  ])

  const prefs = user.prefs as { bio?: string, avatarUrl?: string }

  // Online-Status über die Appwrite Presences API (frisch gefiltert): ist der
  // User in der Liste, ist er online — updatedAt ist sein „zuletzt aktiv".
  const presence = (await listOnlinePresences(event)).find(p => p.userId === userId)
  const online = !!presence
  const lastSeen = presence?.updatedAt ?? ''

  // mapSafeSession (core, Auto-Import): vollständige, Secret-freie Session-Sicht.
  // lookupCityForIp (core, Auto-Import) reichert um Stadt/Region aus der lokalen
  // MMDB an — dieselbe Kette wie in der Selbst-Sicht /api/auth/sessions, damit
  // die geteilte SessionsTable hier nicht weniger zeigt als dort. Ohne
  // konfigurierten Pfad ist das Ergebnis null und die Antwort unverändert.
  const safeSessions = await Promise.all(
    sessions.sessions.map(async s =>
      mapSafeSession(
        s,
        viewingSelf ? s.$id === currentSessionId : s.current,
        await lookupCityForIp(event, s.ip),
      ),
    ),
  )

  return {
    user: {
      $id: user.$id,
      name: user.name,
      email: user.email,
      $createdAt: user.$createdAt,
      accessedAt: user.accessedAt,
      emailVerification: user.emailVerification,
      status: user.status,
      labels: user.labels ?? [],
      phone: user.phone,
      phoneVerification: user.phoneVerification,
      registration: user.registration,
      bio: typeof prefs?.bio === 'string' ? prefs.bio : '',
      avatarUrl: typeof prefs?.avatarUrl === 'string' ? prefs.avatarUrl : '',
      mfa: user.mfa,
      passwordUpdate: user.passwordUpdate ?? '',
      online,
      lastSeen,
    },
    sessions: safeSessions,
    // Aktivitätsprotokoll: LEER, und das nicht erst seit dem SDK-Bump
    // (2026-11-10). Appwrite hat `GET /users/{id}/logs` mit Server 2.5
    // entfernt — auf 2.7.1 antwortet der Endpunkt 404, der frühere Aufruf lief
    // still in sein `.catch` und lieferte seitdem immer []. node-appwrite 30
    // hat `users.listLogs` dann auch aus dem SDK genommen. Der Nachfolger
    // `activities.listEvents` existiert self-hosted NICHT (2.7.1: 404). Feld
    // und Typ bleiben, damit die Admin-Ansicht unverändert ihren Leerzustand
    // zeigt; ob der Abschnitt ganz wegfällt, ist eine Produktentscheidung.
    activity: [],
    targets: targets.targets.map(target => ({
      $id: target.$id,
      $createdAt: target.$createdAt,
      name: target.name,
      providerType: target.providerType,
      identifier: target.identifier,
      expired: target.expired,
    })),
    comments: comments.rows.map(row => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      content: row.content,
      authorId: row.authorId,
      authorName: row.authorName,
      targetId: row.targetId,
      targetType: row.targetType,
      status: row.status,
    })),
    commentsTotal: comments.total,
  }
})
