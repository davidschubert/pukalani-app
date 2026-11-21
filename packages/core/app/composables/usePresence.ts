import type { Ref } from 'vue'
import { presencePermissions } from '../../shared/presencePermissions'
import { createSharedPoll, type SharedPollSource } from '../../shared/sharedPoll'

export interface PresenceUser {
  userId: string
  userName: string
  /** Profilbild-URL (aus den Account-prefs) — sonst Initialen-Fallback */
  avatarUrl?: string
  /** Was der User gerade ansieht, z.B. 'post:demo-post' (Thread) */
  scope?: string
  /** Was der User gerade tut, z.B. 'reviewing:report:42' oder 'editing:changelog:7' */
  action?: string
  typing: boolean
  /** Welche (Dashboard-)Seite der User gerade betrachtet, z.B. '/dashboard/users/42' */
  page?: string
  /** ID des Kommentars, auf den der User gerade antwortet */
  replyingTo?: string
  /** ID des Kommentars, bei dem der User gerade liest (Scroll-Position) */
  near?: string
  /** Tab ist gerade im Hintergrund (anderer Tab/minimiert) — „im anderen Tab" */
  away?: boolean
}

interface RawPresence { userId: string, status?: string, $updatedAt?: string, metadata?: Record<string, unknown> }

const HEARTBEAT_MS = 20_000
/** Fenster, in dem Anlässe zu EINEM Herzschlag gebündelt werden (Q23-Rest). */
const PRESENCE_BUNDLE_MS = 300
/** Längste Wartezeit ab dem ersten Anlass (Q23-Rest). */
const PRESENCE_BUNDLE_MAX_MS = 1_000
// Realtime ist der schnelle Pfad: WS-Upsert → Event → Reader-Refresh in ~280ms
// (gemessen, konsistent). Der Poll ist nur Backstop, falls ein Event verloren geht
// oder der WS kurz weg ist → 20s. WICHTIG: setzt einen GESUNDEN realtime-Worker
// voraus (ein degradierter/gecrashter Worker stellt Events nicht zu — dann Container
// neu erstellen: `docker compose up -d --no-deps appwrite-realtime`).
const POLL_MS = 20_000
// „online jetzt" bestimmen wir über die Aktualität (updatedAt). Das Fenster MUSS
// deutlich größer sein als die Heartbeat-Lücke eines Hintergrund-Tabs, sonst
// FLACKERT dessen Avatar (fällt raus + kommt beim nächsten gedrosselten Heartbeat
// zurück). Browser drosseln setInterval in versteckten Tabs auf ~1×/Minute (nach
// längerer Zeit „intensive throttling"). 180s toleriert das mit Puffer → ein
// offener/anschauender Tab bleibt STABIL sichtbar. Sauberes Verlassen entfernt die
// Presence ohnehin sofort (leave-Beacon); nur ein Absturz lingert bis zum Fenster.
const FRESH_MS = 180_000

function isFresh(p: RawPresence): boolean {
  return !!p.$updatedAt && (Date.now() - Date.parse(p.$updatedAt) < FRESH_MS)
}

/**
 * Gehört diese Presence auf diesen Host? Strikt in BEIDE Richtungen
 * (fail-closed, spiegelt server/utils/presenceFilter.ts): ohne tenantId gehört
 * sie nicht auf einen Mandanten-Host, mit tenantId nicht auf einen Kontroll-Host.
 */
function belongsToTenant(p: RawPresence, expectedTenantId: string | null): boolean {
  const actual = typeof p.metadata?.tenantId === 'string' ? p.metadata.tenantId : ''
  return actual === (expectedTenantId ?? '')
}

// Die geteilte, JWT-authentifizierte Realtime-Verbindung + der Cookie-Client für
// presences.list() leben in useRealtimeClient (auto-import): EINE WS für die ganze
// App (Presence + Row-Streams). Verifiziert: Event-Round-Trip ~280ms.

const toUser = (p: RawPresence): PresenceUser => ({
  userId: p.userId,
  userName: String(p.metadata?.userName ?? 'User'),
  avatarUrl: typeof p.metadata?.avatarUrl === 'string' ? p.metadata.avatarUrl : undefined,
  scope: typeof p.metadata?.scope === 'string' ? p.metadata.scope : undefined,
  action: typeof p.metadata?.action === 'string' ? p.metadata.action : undefined,
  typing: p.metadata?.typing === true,
  page: typeof p.metadata?.page === 'string' ? p.metadata.page : undefined,
  replyingTo: typeof p.metadata?.replyingTo === 'string' ? p.metadata.replyingTo : undefined,
  near: typeof p.metadata?.near === 'string' ? p.metadata.near : undefined,
  away: p.metadata?.away === true,
})

// ════════════ MEINE Presence — EINE Upsert-Autorität pro Tab ════════════
// Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
// typing. Verschiedene Produkte (Thread, Moderation, Edit) SETZEN Teile davon,
// statt jeweils eigene (kollidierende) Presences zu upserten.
interface Meta { scope?: string, action?: string, typing?: boolean, page?: string, replyingTo?: string, near?: string, away?: boolean }
let stateStarted = false
/** Der WS-Upsert-Fehlschlag wird EINMAL pro Tab gemeldet (siehe upsertWs). */
let wsUpsertWarned = false
const myMeta: Ref<Meta> = ref({})

/**
 * Verwaltet die EIGENE Presence des eingeloggten Users (Appwrite Presences API,
 * self-hostbar seit 1.9.5): upsert bei Login/metadata-Änderung + Heartbeat,
 * Server-Expiry räumt ab. Lesbar ist sie für das Publikum aus
 * shared/presencePermissions (Pool: nur wer das Site-Label trägt; Silo: jede/r
 * eingeloggte). SSR: no-op. Idempotenter Start (Modul-Flag) → genau ein
 * Heartbeat/Watcher.
 */
export function usePresenceState() {
  const noop = {
    setScope: (_?: string) => {}, setAction: (_?: string) => {}, setTyping: (_: boolean) => {},
    setPage: (_?: string) => {}, setReplyingTo: (_?: string) => {}, setNear: (_?: string) => {},
  }
  if (import.meta.server) return noop
  // Kein Realtime in dieser App (F14) ⇒ auch keine Anwesenheit: der HTTP-
  // Heartbeat schriebe sonst Presences, die niemand lesen kann (usePresence()
  // unten braucht denselben SDK-Client). Der Aufrufer ist ein Plugin, das jede
  // core-App erbt — das Gate gehört deshalb hierher, nicht dorthin.
  if (!realtimeEnabled()) return noop

  const auth = useAuthStore()
  const tenantId = useTenantId()
  // Label-Schlüssel der Community (A4): der WS-Upsert ERSETZT die Permissions
  // der server geschriebenen Presence — ohne ihn wäre sie bis zum nächsten
  // HTTP-Heartbeat wieder pool-weit lesbar.
  const communityId = useSiteId()

  // Zwei Schreibwege — bewusst kombiniert:
  // 1) HTTP-Heartbeat (Admin-Client, server-seitig): ZUVERLÄSSIG (Cookie-Auth,
  //    funktioniert immer), aber löst KEIN Realtime-Event aus.
  // 2) WS-Upsert (realtime.upsertPresence, JWT-authentifiziert): löst das
  //    Realtime-Event `presences.[id].upsert` aus → andere sehen es SOFORT.
  //    Nur der WS-Handler publiziert Events (verifiziert am 1.9.5-Quellcode).
  //    Owner-Rechte (update/delete) nötig, sonst wirft der Handler beim Update.
  function upsertHttp() {
    if (!auth.user) return
    $fetch('/api/presence/heartbeat', { method: 'POST', body: { ...myMeta.value } }).catch(() => {})
  }
  function upsertWs() {
    const user = auth.user
    if (!user) return
    // AWAY LÄUFT NUR ÜBER DEN HTTP-HEARTBEAT (2026-08-18): der WS-Upsert ersetzt
    // die metadata DIREKT in Appwrite und liefe damit an der Vorfahrts-Regel des
    // Servers vorbei (shared/presencePriority.ts). Ein versteckter Tab kann
    // nicht wissen, ob gerade ein sichtbarer Tab EINER ANDEREN Community
    // dieselbe Presence schreibt — der Server kann nachsehen, also entscheidet
    // er allein. Preis: die „im anderen Tab"-Meldung erreicht andere über den
    // 20-s-Poll statt in ~280 ms; für einen Tab, den niemand ansieht, ist das
    // unerheblich. Zurück auf sichtbar (away = false) upsertet sofort wieder
    // per WS, inklusive Sofort-Ereignis.
    if (myMeta.value.away === true) return
    // Das Web-SDK kommt erst hier (B4) — für einen GAST wird es nie geladen:
    // upsertWs kehrt oben ohne user zurück, und der Heartbeat-Plugin-Aufruf
    // von usePresenceState() allein zieht nichts nach.
    Promise.all([sharedRealtime(), ensureRealtimeJwt()])
      .then(([realtime]) => {
        // `null` = Config-Gate aus (F14) — hier unerreichbar, weil
        // usePresenceState() dann gar nicht erst startet; der Typ verlangt es.
        if (!realtime) return
        // Ohne gültigen JWT ist die WS ein Gast → upsertPresence würde server-
        // seitig „User must be authorized" werfen. Dann nur der HTTP-Heartbeat
        // (upsertHttp) trägt die Presence — kein Realtime-Event, aber sauber.
        if (!hasRealtimeJwt()) return
        const prefs = user.prefs as { avatarUrl?: string } | undefined
        const metadata: Record<string, unknown> = { userName: user.name, ...myMeta.value }
        if (prefs?.avatarUrl) metadata.avatarUrl = prefs.avatarUrl
        // tenantId MUSS mit (Audit B1): der WS-Upsert ERSETZT die metadata der
        // server geschriebenen Presence. Ohne das Merkmal wäre sie bis zum
        // nächsten HTTP-Heartbeat mandantenlos — und damit für jeden Leser
        // (fail-closed) unsichtbar. Wert kommt aus dem SSR-Payload, nicht vom
        // User; der Server stempelt beim HTTP-Heartbeat denselben.
        if (tenantId.value) metadata.tenantId = tenantId.value
        return realtime.upsertPresence({
          presenceId: user.$id,
          status: 'online',
          // DIESELBE Grenze wie der Server (A4) — Pool: read("label:<communityId>"),
          // Silo/Single-Tenant: read("users"). Der Bauer ist geteilt und per
          // Test an tenantRowPermissionsFor genagelt (tests/presencePermissions).
          permissions: presencePermissions(!!tenantId.value, communityId.value, user.$id),
          metadata,
        })
      })
      .catch((error: unknown) => {
        // WS nicht verfügbar → der HTTP-Heartbeat trägt die Presence weiter
        // (nur ohne Sofortmeldung), der Ausfall ist also gutartig. SEIT A4 wird
        // er trotzdem gemeldet statt still geschluckt: Appwrite lässt einen
        // JWT-Aufrufer nur Rechte setzen, deren Rolle er SELBST trägt — fehlt
        // das Site-Label (Vergabe fehlgeschlagen), scheitert GENAU HIER der
        // Upsert, und zwar unsichtbar. EINMAL pro Tab, sonst schriebe der
        // 20-s-Heartbeat die Konsole voll.
        if (!wsUpsertWarned) {
          wsUpsertWarned = true
          console.warn('[presence] WS-Upsert fehlgeschlagen — Anwesenheit läuft nur über den HTTP-Heartbeat (kein Sofort-Signal). Fehlt das Site-Label?', error)
        }
      })
  }
  function upsert() {
    upsertHttp()
    upsertWs()
  }

  /**
   * BÜNDELN (Q23-Rest, Bahn 2): beim Öffnen einer Seite melden sich mehrere
   * Bausteine kurz nacheinander (Anmeldung bekannt, `setPage`, `setScope`,
   * `focus`) — vorher schrieb jeder Anlass sofort, also zwei bis vier
   * Herzschläge (HTTP UND WS) in der ersten Sekunde. Jetzt wartet das
   * Schreiben auf 300 ms Ruhe (höchstens 1 s ab dem ersten Anlass) und
   * schreibt dann EINMAL den Stand von dann. Der Takt (`HEARTBEAT_MS`) und das Verlassen (`pagehide`)
   * schreiben weiter sofort.
   */
  let bundled: ReturnType<typeof setTimeout> | null = null
  let bundleStartedAt = 0
  function scheduleUpsert() {
    const now = Date.now()
    if (!bundled) bundleStartedAt = now
    else clearTimeout(bundled)
    // Ruhe abwarten, aber nie länger als PRESENCE_BUNDLE_MAX_MS ab dem
    // ersten Anlass — sonst schöbe Dauertippen den Herzschlag ewig hinaus.
    const wait = Math.min(PRESENCE_BUNDLE_MS, Math.max(0, bundleStartedAt + PRESENCE_BUNDLE_MAX_MS - now))
    bundled = setTimeout(() => {
      bundled = null
      upsert()
    }, wait)
  }

  if (!stateStarted) {
    stateStarted = true
    watch(() => auth.user?.$id, id => { if (id) scheduleUpsert() }, { immediate: true })
    watch(myMeta, scheduleUpsert, { deep: true })
    setInterval(upsert, HEARTBEAT_MS)
    // `away` = Tab im Hintergrund (anderer Tab/minimiert). Bei JEDEM Sichtbarkeits-
    // wechsel aktualisieren + sofort upserten: andere sehen den „im anderen Tab"-
    // Status, UND das Frische-Fenster startet genau dann neu, wenn die setInterval-
    // Drosselung eines versteckten Tabs beginnt (Avatar bleibt so stabil sichtbar).
    const syncAway = () => {
      const away = document.visibilityState !== 'visible'
      if (myMeta.value.away !== away) myMeta.value = { ...myMeta.value, away }
    }
    syncAway() // initialer Stand (falls Tab beim Laden schon versteckt ist)
    document.addEventListener('visibilitychange', () => { syncAway(); scheduleUpsert() })
    window.addEventListener('focus', () => { syncAway(); scheduleUpsert() })
    // Tab schließt / Seite verlässt (kein SPA-Wechsel) → Presence sofort entfernen,
    // statt bis zur Expiry (240 s, `PRESENCE_TTL_MS` im Heartbeat) „online" zu bleiben. sendBeacon überlebt Unload.
    window.addEventListener('pagehide', () => {
      if (auth.user) navigator.sendBeacon('/api/presence/leave')
    })
  }

  // Setter no-oppen bei gleichem Wert → keine redundanten Upserts (z.B. pro Tastenschlag).
  return {
    setScope: (scope?: string) => { if (myMeta.value.scope !== scope) myMeta.value = { ...myMeta.value, scope } },
    setAction: (action?: string) => { if (myMeta.value.action !== action) myMeta.value = { ...myMeta.value, action } },
    setTyping: (typing: boolean) => { if (myMeta.value.typing !== typing) myMeta.value = { ...myMeta.value, typing } },
    setPage: (page?: string) => { if (myMeta.value.page !== page) myMeta.value = { ...myMeta.value, page } },
    setReplyingTo: (replyingTo?: string) => { if (myMeta.value.replyingTo !== replyingTo) myMeta.value = { ...myMeta.value, replyingTo } },
    setNear: (near?: string) => { if (myMeta.value.near !== near) myMeta.value = { ...myMeta.value, near } },
  }
}

// ════════════ Reader — ANDERE Presences, nach predicate gefiltert ════════════
// EIN Abruf je Reiter (PERF-011, Q23): alle Leser teilen Liste, Abo und Takt
// (`shared/sharedPoll.ts`). Der Stand enthält schon den Mandanten- und den
// Frische-Filter; das Prädikat wendet jeder Leser selbst an.
// Kurz entprellt (250 ms), um Event-Bursts (mehrere Tipp-Toggles) zu EINEM
// list()-Call zu bündeln; 2 s Nachlauf überbrücken einen Seitenwechsel.
const presenceFeed = createSharedPoll<PresenceUser[]>({ pollMs: POLL_MS, debounceMs: 250, lingerMs: 2_000 })

/**
 * Baut die Quelle des geteilten Stands — nur beim ERSTEN Leser eines Reiters.
 * Realtime-Events sind nur der „etwas hat sich geändert"-Auslöser — den
 * autoritativen Zustand holt list() (kennt $updatedAt für die
 * Aktualitäts-Filterung, unabhängig vom Payload-Shape).
 */
async function connectPresenceSource(
  clientsReady: ReturnType<typeof ensureRealtimeClients>,
  tenantId: () => string | null,
  myUserId: () => string | undefined,
): Promise<SharedPollSource<PresenceUser[]> | null> {
  // Direkt destrukturiert (Tree-Shaking, siehe useRealtimeClient.ts).
  const [{ Channel, Presences, Query }, clients] = await Promise.all([import('appwrite'), clientsReady])
  // `clients === null` = Config-Gate aus (F14) — der Guard in usePresence()
  // hat das abgefangen; der nullable Typ verlangt die Zeile trotzdem.
  if (!clients) return null
  const presences = new Presences(clients.cookieClient)
  await ensureRealtimeJwt() // WS authentifizieren, BEVOR er sich verbindet (sonst Gast)
  /** Mein Eintrag im letzten Stand — Vergleich für das eigene Herzschlag-Ereignis. */
  let mine: string | undefined
  return {
    async list() {
      // Explizites Limit statt Default 25 → auch bei vielen Online-Usern vollständig.
      const res = await presences.list({ queries: [Query.limit(200)] })
      const users: PresenceUser[] = []
      for (const p of (res.presences ?? []) as unknown as RawPresence[]) {
        // Mandanten-Filter VOR dem predicate (B1): die meisten Prädikate
        // vergleichen Row-Ids (global eindeutig), aber `page` ist auf JEDEM
        // Mandanten derselbe String ('/dashboard/pages') — ohne diese Zeile
        // zeigte useViewingPresence die Namen fremder Kunden.
        if (!belongsToTenant(p, tenantId())) continue
        if (p.status && isFresh(p)) users.push(toUser(p))
      }
      const me = myUserId()
      const own = users.find(u => u.userId === me)
      mine = own ? JSON.stringify(own) : undefined
      return users
    },
    async subscribe(onChange) {
      const sub = await clients.realtime.subscribe(Channel.presences(), (event) => {
        // DER EIGENE HERZSCHLAG OHNE ÄNDERUNG (Q23): der WS-Upsert von
        // usePresenceState() kommt alle 20 s als Ereignis zurück — im selben
        // Takt wie der Rückhalt-Abruf, also zwei Abrufe je Takt. Ändert er an
        // meinem Eintrag nichts außer der Zeit, gibt es nichts nachzuladen
        // (das Frische-Fenster ist 180 s, der Takt hält die Zeit aktuell).
        // Jede andere Form — fremde Person, geänderte Angabe, unbekannte
        // Gestalt — lädt wie bisher nach.
        const p = event.payload as RawPresence | undefined
        if (mine && p && p.userId === myUserId() && p.status && JSON.stringify(toUser(p)) === mine) return
        onChange()
      })
      return () => { void (sub.unsubscribe ?? sub.close)?.() }
    },
  }
}

/**
 * Liest die Presences anderer (via Channel.presences() + presences.list()),
 * gefiltert per `predicate` (z.B. `u => u.scope === scope` für einen Thread,
 * `u => u.action === 'reviewing:report:42'` für Moderations-Locks, oder Default
 * = alle für „wer ist online"). SSR: leer.
 */
export function usePresence(predicate: (u: PresenceUser) => boolean = () => true) {
  const map = ref(new Map<string, PresenceUser>())
  const present = computed(() => [...map.value.values()])
  // false, bis der erste list()-Aufruf durch ist → Konsumenten können bis dahin
  // einen SSR-Erststand zeigen (kein Nachladen nach hartem Reload).
  const loaded = ref(false)

  // SSR — und Apps ohne Realtime (F14): dort gibt es keine Presences zu lesen,
  // und die Zeile steht VOR dem `import('appwrite')` unten, damit eine solche
  // App das Web-SDK auch dann nicht nachlädt, wenn ein Bauteil den Reader ruft.
  if (import.meta.server || !realtimeEnabled()) {
    const empty = computed(() => [] as PresenceUser[])
    return { present: empty, others: empty, typingOthers: empty, viewerCount: computed(() => 0), loaded }
  }

  const auth = useAuthStore()
  const tenantId = useTenantId()
  // Web-SDK + Clients dynamisch (B4). SYNCHRON angestoßen, weil
  // ensureRealtimeClients() die Runtime-Config liest — nach dem ersten await
  // gibt es keinen Nuxt-Kontext mehr. Aufgelöst wird erst beim ersten Leser.
  const clientsReady = ensureRealtimeClients()

  const others = computed(() => present.value.filter(u => u.userId !== auth.user?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  // Der geteilte Stand (PERF-011): EIN presences.list() je Takt und Reiter,
  // EIN Abo — dieser Leser filtert nur mit seinem Prädikat.
  const onFeed = (all: PresenceUser[]) => {
    const next = new Map<string, PresenceUser>()
    for (const u of all) if (predicate(u)) next.set(u.userId, u)
    map.value = next
    loaded.value = true
  }

  let release: (() => void) | undefined
  let disposed = false
  onMounted(() => {
    if (disposed) return
    // GÄSTE LESEN KEINE ANWESENHEIT (gemessen 2026-08-14 auf demo.pukalani.app):
    // `presences.list()` läuft über den COOKIE-Client, ein Gast hat aber keine
    // Session — Appwrite antwortet 401, und zwar bei jedem Seitenaufruf eines
    // öffentlichen Mandanten-Hosts. Sichtbar wurde nur die Konsolenmeldung; der
    // eigentliche Preis waren das nachgeladene Web-SDK und ein 20-s-Poll, die
    // beide nie ein Ergebnis liefern konnten. Wer nicht angemeldet ist, sieht
    // ohnehin niemanden: die Presence-Rows tragen `read(label:<communityId>)`
    // bzw. `read("users")` (A4/A5), also nichts für Gäste.
    if (!auth.user) { loaded.value = true; return }
    release = presenceFeed.acquire(onFeed, () => connectPresenceSource(clientsReady, () => tenantId.value, () => auth.user?.$id))
  })
  onScopeDispose(() => {
    disposed = true
    release?.()
  })

  return { present, others, typingOthers, viewerCount, loaded }
}
