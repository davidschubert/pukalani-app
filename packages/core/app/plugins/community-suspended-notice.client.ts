import { COMMUNITY_REMOVED_CODE } from '../../shared/communityRemoval'
import { COMMUNITY_SUSPENDED_CODE } from '../../shared/communitySuspension'
import { notAMemberNoticeApplies } from '../../shared/communityParticipation'
import { FETCH_ERROR_HOOK, type FetchErrorNotice } from '../../shared/fetchErrorBridge'

/**
 * DIE SPERRE ERREICHT DEN MENSCHEN (M13-Wechselwirkung, Befund 1).
 *
 * WAS FEHLTE: `tenantDb()` weist in einer billing-gesperrten Community jedes
 * Schreiben eines Mitglieds mit 403 und `data.code = COMMUNITY_SUSPENDED_CODE`
 * ab, der zentrale Fehler-Handler hebt den Schlüssel als `reason` ins Envelope —
 * und im Browser las ihn NIEMAND. Wer einen Beitrag abschickte, bekam den
 * generischen „hat nicht geklappt"-Toast seines Layers. Die Mahnung war damit
 * für genau die Leute unsichtbar, die sie am ehesten zum Owner tragen.
 *
 * WARUM HIER UND NICHT IN DEN FORMULAREN: durch die Datentür geht JEDER
 * Schreibvorgang eines Mandanten-Layers — Kommentare, Beiträge, Umfragen,
 * Zu-/Absagen, Kursfortschritt. Ein Satz in zwanzig `catch`-Zweigen wäre zwanzig
 * Stellen, an denen jemand ihn beim nächsten Formular vergisst; es ist derselbe
 * Grund, aus dem die Sperre selbst an der Tür hängt und nicht in den Routen.
 *
 * WIE DER HAKEN DORTHIN KOMMT: nicht von hier. `globalThis.$fetch` in einem
 * Plugin zu ersetzen, erreicht das auto-importierte `$fetch` der Komponenten
 * NICHT (Momentaufnahme, live nachgemessen) — der Interceptor sitzt deshalb in
 * Nuxts `fetch.mjs`, gesetzt vom `app:templates`-Hook in
 * `packages/core/nuxt.config.ts`. Begründung in `shared/fetchErrorBridge.ts`.
 * Dieses Plugin liefert nur den Leser, der Toasts und Sprachen kennt.
 *
 * DER GRUND BLEIBT DRAUSSEN: der Text sagt „vorübergehend schreibgeschützt" und
 * „die Verantwortlichen sind informiert", nie „Zahlungsverzug". Warum gesperrt
 * ist, verlangt `community.billing` (`GET /api/community/suspension` antwortet
 * einem Mitglied 403) — ein Toast darf diese Grenze nicht unterlaufen, nur weil
 * er dieselbe Tatsache erklärt.
 *
 * FESTE `id`: eine Liste mit mehreren Knöpfen (Stimmen, Zu-/Absagen) kann
 * mehrere Antworten kurz hintereinander produzieren. Nuxt UI ersetzt bei
 * gleicher id, statt zu stapeln.
 *
 * WAS DIESER HINWEIS NICHT KANN: den generischen Toast des Layers unterdrücken,
 * der im `catch` danach folgt — der Hinweis steht davor und beantwortet die
 * Frage, die der allgemeine offenlässt. Wer so eine Stelle ohnehin anfasst,
 * prüft `error.data.reason === COMMUNITY_SUSPENDED_CODE` und schweigt dann.
 *
 * ZWEITER GRUND, DERSELBE LESER (SEC-030, 2026-11-13): `not_a_member`. Seit
 * Schreiben, Abstimmen, Zusagen und Melden Zugehörigkeit verlangen, bekommt ein
 * Konto aus einer anderen Community dort ein 403 — und sah bis dahin nur den
 * generischen Toast seines Layers. Es ist derselbe Haken, weil es nur EINEN
 * gibt (`FETCH_ERROR_HOOK` ist ein einzelner Platz; ein zweites Plugin würde
 * diesen überschreiben). Wann der Hinweis erscheint, sagt die pure Regel
 * `notAMemberNoticeApplies`: nur bei Schreibversuchen und nicht für Adressen,
 * deren Seiten es selbst erklären (Kurse — `pukalani.notices.
 * notAMemberSelfExplained`, sonst meldete die Einschreibung es doppelt).
 *
 * DRITTER GRUND, KEIN TOAST (SEC-030 Teil 2, 2026-11-13): `community_removed`.
 * Wird jemand MITTEN in der Sitzung entfernt, antwortet die nächste
 * API-Anfrage (oft eine im Hintergrund: Anwesenheit, Glocke, Realtime-Token)
 * mit diesem Grund. Statt eines Toasts geht es auf die Hinweisseite — als
 * VOLLES Neuladen, nicht als Navigation: erst der neue Seitenaufbau bringt
 * den Zustand „entfernt" per SSR mit, und damit bleiben Socket, Token-Refresh
 * und Heartbeat aus (Realtime-Gate). Eine Navigation ließe sie laufen, und
 * jede weitere Antwort käme wieder hier an. Auf der Hinweisseite selbst und
 * nach dem ersten Auslösen passiert nichts mehr (keine Schleife). Ohne
 * angemeldete Hinweisseite (`pukalani.community.removedNoticePath`) bleibt es
 * still — die Grenze ist ohnehin der Server. Und solange der Zustand gesetzt
 * ist, schweigt auch der Hinweis `not_a_member`: für eine entfernte Person
 * ist er die falsche Erklärung.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const appConfig = useAppConfig() as { pukalani?: { notices?: { notAMemberSelfExplained?: string[] } } }
  const selfExplained = appConfig.pukalani?.notices?.notAMemberSelfExplained ?? []

  const show = (toast: { id: string, title: string, description: string, icon: string }) => {
    nuxtApp.runWithContext(() => {
      // `nuxtApp.$i18n` statt useI18n(): der Haken läuft außerhalb jedes
      // Komponenten-Setups, useI18n() würde dort werfen.
      const { t } = nuxtApp.$i18n as { t: (key: string) => string }
      useToast().add({
        id: toast.id,
        title: t(toast.title),
        description: t(toast.description),
        color: 'warning',
        icon: toast.icon,
      })
    })
  }

  const removedNoticePath = (useAppConfig() as { pukalani?: { community?: { removedNoticePath?: string } } })
    .pukalani?.community?.removedNoticePath ?? ''
  const removed = useCommunityRemoved()
  let leaving = false
  const leaveToRemovedNotice = () => {
    removed.value = true
    if (leaving || !removedNoticePath) return
    nuxtApp.runWithContext(() => {
      const noticeTarget = useLocalePath()(removedNoticePath)
      const here = useRouter().currentRoute.value.path.replace(/\/+$/, '') || '/'
      if (here === (noticeTarget.replace(/\/+$/, '') || '/')) return
      leaving = true
      reloadNuxtApp({ path: noticeTarget, persistState: false })
    })
  }

  const target = globalThis as unknown as Record<string, unknown>
  target[FETCH_ERROR_HOOK] = (notice: FetchErrorNotice) => {
    if (notice.status === 403 && notice.reason === COMMUNITY_REMOVED_CODE) {
      leaveToRemovedNotice()
      return
    }
    if (notice.status === 403 && notice.reason === COMMUNITY_SUSPENDED_CODE) {
      show({
        id: 'community-suspended',
        title: 'error.communitySuspended',
        description: 'error.communitySuspendedHint',
        icon: 'i-ph-lock-simple',
      })
      return
    }
    if (!removed.value && notAMemberNoticeApplies(notice, selfExplained)) {
      show({
        id: 'community-not-a-member',
        title: 'error.notAMember',
        description: 'error.notAMemberHint',
        icon: 'i-ph-users-three',
      })
    }
  }
})
