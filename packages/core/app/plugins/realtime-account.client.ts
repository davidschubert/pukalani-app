import { isSessionDeleteEvent } from '../../shared/realtimeAuth'
import { accountVerifyAt } from '../../shared/realtimeGate'

/**
 * Live-Session-Widerruf (#9): Beendet ein Admin die Sessions eines Users (oder
 * der User meldet sich auf einem anderen Gerät komplett ab), feuert der
 * `account`-Channel ein Session-Delete-Event. Wir laden den Auth-State nach —
 * ist die EIGENE Session weg, sofortiger Force-Logout zur Login-Seite.
 *
 * Andere Sessions zu beenden lässt die eigene unangetastet → kein Logout.
 * Client-only, app-weit (detached EffectScope).
 *
 * NICHT AUF EINEM HOST, DEN ES NICHT GIBT (2026-08-03): dort antwortet jeder
 * Pfad 404, der damalige Cookie-WS konnte nie stehen, und das Nachprüfen unten
 * wurde zum Dauerläufer. Messung, Begründung und die Nachhol-Regel stehen in
 * `app/utils/hostGate.ts`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const localePath = useLocalePath()
  const toast = useToast()
  // useI18n() ist im Plugin-Setup nicht erlaubt → globale $i18n-Instanz nutzen
  const i18n = nuxtApp.$i18n as { t: (key: string) => string }
  const scope = effectScope(true)
  let timer: ReturnType<typeof setTimeout> | undefined
  // Wann der geplante Abruf feuert (0 = keiner geplant) — ein späteres Signal
  // darf einen früheren Termin nie nach hinten schieben.
  let timerAt = 0
  // 0 = noch nie geprüft → das erste Signal prüft SOFORT (accountVerifyAt).
  let lastVerifyAt = 0

  // Auth nachprüfen (entprellt): ist die eigene Session weg → Force-Logout.
  // Läuft bei Account-Events UND wenn Appwrite dem Socket den Zugang entzieht
  // (401-Frame beim Widerruf, RT2) — Event und Frame kommen beim Widerruf
  // direkt hintereinander, die Entprellung macht daraus EINEN Abruf.
  function verify(urgent = false) {
    const now = Date.now()
    // Mindestabstand gegen 401-Stürme (Regel + Begründung in
    // shared/realtimeGate.ts) — aber ein Session-Lösch-Ereignis geht vorbei,
    // und was im Fenster ankommt, wird nachgeholt statt verworfen (RT2-
    // Nachtrag: in Prod fiel der Widerruf so ins Fenster einer Prüfung beim
    // Seitenladen, abgemeldet erst nach 33 s). Plus 400 ms Entprellung.
    const at = Math.max(accountVerifyAt(lastVerifyAt, now, urgent), now) + 400
    if (timerAt && timerAt <= at) return
    clearTimeout(timer)
    timerAt = at
    timer = setTimeout(() => {
      timerAt = 0
      lastVerifyAt = Date.now()
      void nuxtApp.runWithContext(async () => {
        if (!auth.user) return
        await auth.refresh()
        if (auth.user) return // eigene Session lebt weiter (z.B. nur Netz-Blip)
        toast.add({
          title: i18n.t('auth.sessionRevoked'),
          description: i18n.t('auth.sessionRevokedDescription'),
          color: 'warning',
          icon: 'i-ph-sign-out',
        })
        await navigateTo(localePath('/login'))
      })
    }, at - now)
  }

  startWhenHostResolves(nuxtApp, () => {
    scope.run(() => {
      // Nur für eingeloggte User verbinden — für Gäste hätte der account-Channel
      // nichts zu melden und der Reconnect-Loop liefe ins Leere. Bei Logout
      // schließen, bei Login (auch späterem) öffnen.
      let stop: (() => void) | undefined
      watch(() => auth.user?.$id, (id) => {
        if (id && !stop) {
          stop = useRealtimeAccount(event => verify(isSessionDeleteEvent(event.events)), { onAccessEnded: () => verify() })
        }
        else if (!id && stop) {
          stop()
          stop = undefined
        }
      }, { immediate: true })
    })
  })
})
