import type { Capability } from '../../shared/types/authz'
import { communityCapabilitiesFor, type CommunityRole } from '../../shared/communityAuthz'
import { roleLabelKey } from '../../shared/roleLabel'
import { trustLevelCapabilitiesFor, type TrustLevel } from '../../shared/trustLevel'

/**
 * Community-Rolle des eingeloggten Users auf DIESEM Mandanten-Host (N1) —
 * SSR-gespiegelt via tenant-brand-Plugin (Quelle: server/middleware/
 * 07.community-role.ts, derselbe Resolver + 30-s-Cache wie
 * requireCommunityPermission;
 * Rollen-Entzug erscheint im UI deshalb nach ≤30 s bzw. beim nächsten
 * Seitenwechsel — dokumentiert akzeptiert). Nach Client-Login hält der
 * Auth-Store den Wert aktuell (refresh → GET /api/community/role), Logout nullt.
 *
 * null = keine Community-Rolle (Gast, kein Tenant-Host, keine Mitgliedschaft).
 *
 * NUR UX-Schicht: die Autorität bleibt requireCommunityPermission auf den
 * Server-Routen — dieser State entscheidet Sichtbarkeit (Nav, Guards), nie Daten.
 */
export function useCommunityRole() {
  const role = useState<CommunityRole | null>('pukalani-community-role', () => null)
  /**
   * Vertrauensstufe (F1 Teilpaket 3) — die ZWEITE Quelle von Capabilities,
   * gespiegelt aus derselben Middleware wie die Rolle.
   *
   * 0 heißt „keine Stufe" und ist der Wert für Gäste, für Silo-Apps ohne
   * Discussions und für jeden Lesefehler. Eine fehlende Stufe kann also nichts
   * verstecken, was die Rolle schon erlaubt.
   */
  const trustLevel = useState<TrustLevel>('pukalani-community-trust-level', () => 0)
  /**
   * Capabilities aus BEIDEN Quellen — VEREINIGUNG, nie Ersetzung.
   *
   * Dieselbe Rechnung wie serverseitig in `decideCommunityAccess`: die Stufe
   * ERWEITERT, sie nimmt nie etwas. Ein Owner mit Stufe 0 sieht deshalb genau
   * das, was er vorher sah, und ein Mitglied der Stufe 3 zusätzlich seine
   * Aufräum-Werkzeuge. Die Autorität bleibt die Server-Route: hier entscheidet
   * sich nur, ob ein Knopf angeboten wird, der ohnehin geprüft wird.
   */
  const capabilities = computed<Set<Capability>>(() => new Set<Capability>([
    ...communityCapabilitiesFor(role.value),
    ...trustLevelCapabilitiesFor(trustLevel.value),
  ]))
  return { role, trustLevel, capabilities }
}

/**
 * Hat der User über seine COMMUNITY-Rolle ODER seine Vertrauensstufe diese
 * Capability? (reaktiv, UX-Schicht)
 */
export function useCommunityCapability(capability: Capability) {
  const { capabilities } = useCommunityRole()
  return computed(() => capabilities.value.has(capability))
}

/**
 * BEIDE Quellen zusammen — das UX-Gegenstück zu `requireCommunityPermission`
 * auf dem Server: globales Operator-Label (authz.ts) ODER Rolle/Stufe in DIESER
 * Community (communityAuthz.ts).
 *
 * Genau diese Rechnung machen das Dashboard-Layout (`can()`) und das Konto-Menü
 * seit jeher von Hand; sie steht hier, weil sie ab F58 auch auf ÖFFENTLICHEN
 * Produktseiten gebraucht wird (Kurs-/Termin-Verwaltung aus dem Produkt heraus).
 *
 * `useCommunityCapability` allein reicht dort NICHT: in einer Silo-App
 * (apps/comments, Playground) gibt es überhaupt keine Community-Rolle — der
 * Knopf wäre für den Betreiber unsichtbar, obwohl seine Route ihn durchlässt.
 *
 * Nur Sichtbarkeit. Die Autorität bleibt die Server-Route.
 */
export function useCapability(capability: Capability) {
  const auth = useAuthStore()
  const { capabilities } = useCommunityRole()
  return computed(() =>
    userHasCapability(auth.user, capability) || capabilities.value.has(capability))
}

/**
 * WELCHE ROLLE HABE ICH HIER? (Davids Frage 2026-08-17) — der Text, der in
 * beiden Konto-Menüs unter dem Namen steht (öffentliche Kopfzeile und
 * Dashboard-Seitenleiste).
 *
 * Sie war nirgends ablesbar: die Rolle entscheidet über jeden Menüpunkt, stand
 * aber an keiner Stelle der Oberfläche — man merkte sie nur daran, was FEHLT.
 * Das ist die schlechteste Art, eine Rechte-Frage zu beantworten, und genau der
 * Grund, warum ein fehlender Menüpunkt („Kurse") wie ein Fehler aussah.
 *
 * ZWEI QUELLEN, EINE ZEILE — und die Reihenfolge ist die Aussage: auf einem
 * Mandanten-Host zählt die COMMUNITY-Rolle, denn das ist die Rolle, an der hier
 * jede Sichtbarkeit hängt. Nur wo es keine gibt (Kontroll-Host, Silo,
 * Playground), tritt das globale Operator-Label an ihre Stelle — dort ist es
 * die einzige Rolle, die es überhaupt gibt.
 *
 * Ein Betreiber MIT Community-Rolle sieht bewusst nur diese: sein Label ändert
 * an dem, was ihm diese Community zeigt, nichts (der Break-Glass ist die
 * Ausnahme, nicht sein Alltag) — zwei Rollen nebeneinander wären zwei Antworten
 * auf eine Frage.
 *
 * `null` = keine Rolle nennbar; die Menüs lassen die Zeile dann weg, statt
 * „Mitglied" zu behaupten. Die Vertrauensstufe steht bewusst NICHT hier: sie
 * ist keine Rolle, sondern etwas Verdientes, und hätte im selben Satz nur
 * verwirrt.
 *
 * Die REGEL selbst ist pur und getestet (`roleLabelKey`, shared/roleLabel.ts) —
 * hier bleibt nur das Übersetzen, damit „beide Menüs sagen dasselbe" eine
 * geprüfte Tatsache ist und nicht eine Beobachtung an zwei Stellen.
 */
export function useRoleLabel() {
  const { t } = useI18n()
  const auth = useAuthStore()
  const { role } = useCommunityRole()
  return computed<string | null>(() => {
    const key = roleLabelKey(role.value, auth.user?.labels)
    return key ? t(key) : null
  })
}

/**
 * WURDE ICH AUS DIESER COMMUNITY ENTFERNT? (SEC-030 Teil 2, 2026-11-13) —
 * gespiegelt aus `event.context.communityRemoved`
 * (server/middleware/06.community-removed.ts) über tenant-brand.server.ts,
 * dieselbe Bauart wie die Rolle: kein zusätzlicher API-Aufruf.
 *
 * Leser: die globale Routen-Middleware (führt auf die Hinweisseite), das
 * Realtime-Gate (`realtimeEnabled`: eine entfernte Person öffnet keinen
 * Socket, holt keinen Token und schreibt keine Anwesenheit) und der zentrale
 * 403-Leser (setzt ihn, wenn der Entzug mitten in der Sitzung passiert).
 *
 * NUR UX-Schicht: die Grenze ist die Server-Middleware.
 */
export function useCommunityRemoved() {
  return useState<boolean>('pukalani-community-removed', () => false)
}
