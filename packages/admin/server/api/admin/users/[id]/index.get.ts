import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserActivity, AdminUserComment, AdminUserDetailResponse } from '../../../../../shared/types/admin'
import { USER_ACTIVITY_LIMIT } from '../../../../../shared/userActivity'

type CommentRow = Models.Row & Omit<AdminUserComment, '$id' | '$createdAt'>

/**
 * Vollständige User-Sicht: Profil, aktive Sessions, Aktivität (aus dem
 * Betreiber-Protokoll `audit_logs`) und letzte Kommentare.
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

  // ZUGRIFF FESTHALTEN (BE-021, 2026-11-16): wer das Konto einer Person
  // öffnet, steht im Protokoll — höchstens einmal je (Betreiber, Konto) in 15
  // Minuten, nicht strikt (eine Ansicht ist keine Herausgabe). Ohne Namen und
  // ohne Adresse: die Ziel-Id reicht, und ein Name im Protokoll ist eine
  // zweite Kopie, die bei einer Löschung erst wieder geleert werden muss.
  await recordAuditView(event, `user:${event.context.user?.$id ?? ''}:${userId}`, {
    action: 'user.viewed',
    targetType: 'user',
    targetId: userId,
  })

  // 'current' kommt aus der Admin-API immer als false zurück (der API-Key agiert
  // nicht als der User). Schaut ein Admin auf das EIGENE Profil, ermitteln wir
  // die aktive Session über den Session-Client und markieren sie selbst.
  const viewingSelf = event.context.user?.$id === userId
  const currentSessionId = viewingSelf
    ? await createSessionClient(event).account.getSession({ sessionId: 'current' })
        .then(s => s.$id).catch(() => '')
    : ''

  // Startet hier, damit es neben den drei Abfragen darunter läuft (Begründung
  // und Regeln am `await` weiter unten).
  const activityRead = listUserActivity(event, userId, USER_ACTIVITY_LIMIT)
    .then(section => ({ ...section, failed: false }))
    .catch((error: unknown) => {
      const { type, code } = (error ?? {}) as { type?: unknown, code?: unknown }
      logEvent('error', 'admin.user_activity_read_failed', {
        type: typeof type === 'string' ? type : '',
        code: typeof code === 'number' ? code : 0,
      })
      return { activity: [] as AdminUserActivity[], truncated: false, failed: true }
    })

  const [sessions, targets, comments] = await Promise.all([
    admin.users.listSessions({ userId }).catch(() => ({ sessions: [] as Models.Session[] })),
    // Benachrichtigungskanäle (email/sms/push-Targets)
    admin.users.listTargets({ userId }).catch(() => ({ targets: [] as Models.Target[] })),
    tenantDb(event, { as: 'operator' }).list<CommentRow>('comments', [
      Query.equal('authorId', userId), Query.orderDesc('$createdAt'), Query.limit(10),
    ]).catch(() => ({ total: 0, rows: [] as CommentRow[] })),
  ])

  // AKTIVITÄT (AL1, 2026-11-17): bis Appwrite 2.5 kam die Liste aus
  // `users.listLogs` — den Endpunkt gibt es seit 2.5 nicht mehr (auf 2.7.1
  // 404, node-appwrite 30 hat ihn entfernt), die Liste war seitdem leer.
  // Davids Entscheidung: FÜLLEN statt entfernen, aus dem vorhandenen
  // Betreiber-Protokoll `audit_logs` (Selbst-Ereignisse aus `logAuthEvent` +
  // Betreiber-Aktionen am Konto aus `recordAudit`; Regeln in
  // shared/userActivity.ts). Gelesen NACH `recordAuditView`, aber dessen
  // `user.viewed` filtert die Abfrage ohnehin aus.
  // EIN LESEFEHLER IST KEIN LEERER TAG: Profil und Sitzungen kommen
  // trotzdem, die Antwort sagt `activityFailed` — die Seite zeigt dann einen
  // Hinweis statt „Keine Aktivität". Im Log keine Namen oder Ids von Personen.
  // Nur Art und Code des Fehlers ins Log: die Meldung einer Abfrage kann die
  // Konto-Id wiederholen.
  const activity = await activityRead

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
    // Aktivität aus dem Betreiber-Protokoll `audit_logs` (AL1) — s. oben.
    activity: activity.activity,
    activityTruncated: activity.truncated,
    activityFailed: activity.failed,
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
