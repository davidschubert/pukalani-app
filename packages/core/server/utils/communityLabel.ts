import type { H3Event } from 'h3'
import { isRole } from '../../shared/authz'
import { communityModeratorLabel } from '../../shared/communityModeratorLabel'
import { mutateUserLabels, type UserLabelsFailure, type UserLabelsResult } from './userLabels'

/**
 * Das Community-Label des Mitglieds (H3-Naht 4) — der Schlüssel, mit dem Appwrite
 * die Mandanten-Grenze SELBST zieht.
 *
 * Warum es das braucht: eine Community trägt ihre Zeilen mit
 * `read(Role.label(communityId))` (tenantRowPermissionsFor) — seit A4 auch die
 * Presence jedes Anwesenden. Appwrite gewährt diesen Lesezugriff nur, wer das
 * Label AUCH HAT; ohne Label wäre ein Mitglied in seiner eigenen Community
 * blind.
 *
 * Warum in CORE (seit 2026-07-29, vorher packages/onboarding): der einzige
 * Aufrufer war die Wizard-Route — also bekam nur der GRÜNDER das Label. Der
 * Helfer benutzt nur die Users-API und den Tenant-Kontext, hängt also an keinem
 * Produkt (A14 erfüllt).
 *
 * Warum HIER und nicht im Control Plane: Labels gehören dem RUNTIME-Projekt
 * (Pool), und nur diese App hat dafür einen Schlüssel. Das Control Plane
 * besitzt die Mitgliedschaft, die Runtime das Label — dieselbe Trennung wie
 * überall sonst in H3. Deshalb muss auch der ENTZUG hier passieren
 * (revokeCommunityLabel): `members/remove` im Control Plane kann Labels nicht
 * anfassen, es hat keinen Pool-Schlüssel.
 *
 * WAS DAS LABEL SEIT A5 BEDEUTET (2026-07-29): „ist Mitglied dieser Community",
 * abgeleitet aus einer `community_members`-Zeile mit Zugang — NICHT mehr „hat den
 * Host benutzt" (A4). Vergeben wird es deshalb nur noch dort, wo Mitgliedschaft
 * feststeht: joinCommunity() (Beitritt/Bestand), die Label-Middleware (bestehende
 * Mitgliedschaft) und der Wizard (Gründung). Der Unterschied ist nicht
 * akademisch: unter der A4-Regel bekam eine entfernte Person ihr Leserecht beim
 * nächsten eingeloggten Besuch zurück.
 *
 * ADDITIV: bestehende Labels bleiben (ein Mitglied kann in mehreren Communities
 * sein, und `admin`/`moderator` des Betreibers dürfen nicht verloren gehen).
 *
 * EIN SCHREIBER, ZWEI HALTUNGEN (SEC-024, seit 2026-11-13): geschrieben wird
 * über `mutateUserLabels` (userLabels.ts — serialisiert je Konto, liest frisch,
 * prüft nach, wiederholt einmal). Die VERGABE bleibt nach außen fail-soft: sie
 * ist additiv und heilt sich beim nächsten Request selbst, und sie darf nie
 * einen Request brechen. Der ENTZUG dagegen gibt sein Ergebnis ZURÜCK
 * (`{ revoked }`): „Zugang entziehen" darf nur `ok` sagen, wenn das
 * Lese-Publikum nachweislich weg ist.
 */

/** Appwrite akzeptiert für Labels nur Alphanumerik — ID.unique() liefert genau das. */
const SAFE_LABEL = /^[a-zA-Z0-9]{1,36}$/

/**
 * Ist dieser Wert als Community-Label überhaupt zulässig?
 *
 * Ein Community-Label darf NIE eine Operator-Rolle sein. Labels sind bei uns zwei
 * Dinge in einem Feld: Betreiber-RBAC ('admin'/'moderator', hasCapability) und
 * Community-Zugehörigkeit (die $id). Seit die Vergabe an JEDES Mitglied geht,
 * wäre eine Community mit der $id 'admin' eine Rechteausweitung per Tippfehler. Kostet
 * einen String-Vergleich.
 *
 * Fail-loud im Log statt Appwrite-400 im Gesicht des Kunden: die Community
 * existiert schon, nur das Lesen wäre kaputt — das muss sichtbar sein.
 */
function labelUsable(communityId: string): boolean {
  if (isRole(communityId)) {
    logEvent('error', 'community_label.reserved', { communityId })
    return false
  }
  if (!SAFE_LABEL.test(communityId)) {
    logEvent('error', 'community_label.invalid', { communityId })
    return false
  }
  return true
}

/**
 * DER EINE SCHREIBVORGANG auf `users.labels` (add ∪ remove, idempotent).
 *
 * Warum generisch: seit dem Moderations-Audit (Befund 1) gibt es je Community
 * ZWEI abgeleitete Labels — die Zugehörigkeit (`<communityId>`) und das
 * Moderations-Team (`mod<communityId>`, communityModeratorLabel.ts). Beide
 * werden mit derselben Vorsicht geschrieben, und beim Entzug fallen sie
 * GEMEINSAM in EINEM `updateLabels` — zwei Schreibvorgänge hintereinander
 * wären zwei Gelegenheiten, sich gegenseitig zu überschreiben.
 *
 * Gibt das Ergebnis des EINEN Schreibers zurück (SEC-024) und protokolliert
 * es; ob ein Fehlschlag den Request bricht, entscheidet der Aufrufer. Wirft
 * NIE (auch `mutateUserLabels` wirft nie).
 */
async function writeLabels(
  event: H3Event | undefined,
  targetId: string,
  { add = [], remove = [] }: { add?: string[], remove?: string[] },
  action: 'granted' | 'revoked',
): Promise<UserLabelsResult> {
  const user = event?.context.user
  const isRequestUser = targetId === user?.$id
  const usable = add.filter(labelUsable)
  if (usable.length === 0 && remove.length === 0) {
    return { ok: true, changed: false, labels: [...(isRequestUser ? user?.labels ?? [] : [])] }
  }

  // Billiger Vorab-Ausschluss aus dem Request-Kontext: nach dem ersten Kontakt
  // ist das der Normalfall und kostet KEINEN Appwrite-Roundtrip. Gilt nur für
  // den Nutzer DIESES Requests — seine Labels hat 02.auth.ts gerade frisch
  // gelesen.
  if (isRequestUser) {
    const have = user?.labels ?? []
    const nothingToAdd = usable.every(label => have.includes(label))
    const nothingToRemove = remove.every(label => !have.includes(label))
    if (nothingToAdd && nothingToRemove) return { ok: true, changed: false, labels: [...have] }
  }

  // FRISCH lesen, rechnen, schreiben, nachlesen — alles im einen Schreiber.
  const result = await mutateUserLabels(event, targetId, { add: usable, remove })
  if (result.ok) {
    // Der laufende Request sieht seinen neuen Stand sofort (nachgelagerte
    // Autorisierung/Permission-Bauer lesen aus dem Kontext, nicht aus Appwrite).
    if (isRequestUser && user) user.labels = result.labels
    if (result.changed) {
      logEvent('info', `community_label.${action}`, {
        labels: (action === 'granted' ? usable : remove).join(','),
        userId: targetId,
      })
    }
    return result
  }
  logEvent('error', `community_label.${action === 'granted' ? 'failed' : 'revoke_failed'}`, {
    labels: [...usable, ...remove].join(','),
    userId: targetId,
    reason: result.reason,
    ...(result.message ? { message: result.message } : {}),
  })
  return result
}

/** Ergebnis eines Entzugs (SEC-024). `revoked: true` heißt: nachweislich weg —
 *  auch „war nie da" und „Konto gibt es nicht mehr". */
export type CommunityLabelRevokeResult =
  | { revoked: true }
  | { revoked: false, reason: UserLabelsFailure | 'no_user' }

/**
 * Community-Label vergeben. `userId` nur angeben, wenn es NICHT der Nutzer des
 * Requests ist (Anmeldung: der Kontext-User existiert noch nicht).
 */
export async function grantCommunityLabel(event: H3Event, communityId: string, userId?: string): Promise<void> {
  const targetId = userId ?? event.context.user?.$id
  if (!targetId || !communityId) return
  // Fail-soft: das Ergebnis ist protokolliert, der Request läuft weiter.
  await writeLabels(event, targetId, { add: [communityId] }, 'granted')
}

/**
 * MODERATIONS-LABEL setzen oder einziehen (Moderations-Audit Befund 1).
 *
 * Es folgt der ROLLE, nicht der Mitgliedschaft: wer in dieser Community
 * `reports.moderate` hält, trägt es — wer degradiert wird, verliert es beim
 * nächsten Request (der Rollen-Cache ist 30 s). Der Aufrufer entscheidet nur
 * anhand einer AUFGELÖSTEN Rolle; bei einem transienten Auflösungsfehler wird
 * diese Funktion bewusst gar nicht erst gerufen (siehe Middleware), sonst
 * flackerte das Publikum eines Moderators bei jedem Netz-Schluckauf.
 */
export async function setCommunityModeratorLabel(
  event: H3Event,
  communityId: string,
  isModerator: boolean,
  userId?: string,
): Promise<void> {
  const targetId = userId ?? event.context.user?.$id
  const label = communityModeratorLabel(communityId)
  if (!targetId || !label) return
  await writeLabels(
    event,
    targetId,
    isModerator ? { add: [label] } : { remove: [label] },
    isModerator ? 'granted' : 'revoked',
  )
}

/**
 * Community-Label EINZIEHEN — „draußen" heißt draußen (A5, Davids Entscheidung 1).
 *
 * Der Gegenzug zu grantCommunityLabel und der Grund, warum „Zugang entziehen" jetzt
 * hält, was die Seite verspricht: ohne diesen Schritt bliebe der Lesezugriff auf
 * alle `read(label:<communityId>)`-Zeilen bestehen (Presence, Activity-Feed,
 * mitglieder-sichtbare Inhalte) — die Rolle war weg, das Publikum nicht.
 *
 * CHIRURGISCH: nur die Labels DIESER Community fallen weg. Andere Communities
 * und die Operator-Rollen ('admin'/'moderator') bleiben unangetastet — ein
 * `labels: []` hätte einen Betreiber, der zufällig Mitglied einer
 * Kunden-Community ist, aus seiner eigenen Instanz ausgesperrt.
 *
 * BEIDE LABELS, EIN SCHREIBVORGANG (Moderations-Audit Befund 1): „draußen"
 * heißt auch für das Moderations-Team draußen. Das hier ist die einzige Stelle,
 * an der man es vergessen KÖNNTE — deshalb steht es hier und nicht in den
 * Aufrufern (Entfernen-Route, Community-Löschung, Selbstheilung).
 *
 * Kein Fehler, wenn nichts wegzunehmen ist (idempotent): der Entzug läuft an
 * drei Stellen — sofort in der Entfernen-Route, als Selbstheilung in der
 * Label-Middleware und im stündlichen Abgleich-Lauf
 * (onboarding/server/utils/labelReconcile.ts).
 *
 * DAS ERGEBNIS ZÄHLT (SEC-024, seit 2026-11-13): die Funktion gibt zurück, ob
 * das Lese-Publikum NACHWEISLICH weg ist (nachgelesen, einmal wiederholt). Die
 * Entfernen-Route macht aus `revoked: false` einen Fehler statt `ok`; die
 * Selbstheilung und der Beitritt bleiben still und protokollieren. „Nichts
 * wegzunehmen" und „Konto gibt es nicht mehr" sind Erfolg. `event` darf
 * fehlen (Abgleich-Lauf ohne Request) — dann schreibt der Admin-Client ohne
 * Request-Kontext.
 *
 * ── SEIT AH-7 FÄLLT DER @NAME MIT AUS DEM BLICKFELD ───────────────────────
 * Ein Handle gehört seit 2026-08-11 dem KONTO (`account_handles`), nicht mehr
 * der Community. Sein Lese-Publikum steht deshalb als LISTE an der Zeile —
 * eine Rolle je Mitgliedschaft. Der Entzug nimmt genau diese eine Rolle weg:
 * der Mensch BEHÄLT seinen Namen (er ist seiner), er wird hier nur nicht mehr
 * vorgeschlagen. Ohne diesen Schritt stünde ein Entfernter weiter im
 * Erwähnungs-Menü — dieselbe Lücke, die A5 für alle anderen Zeilen geschlossen
 * hat. Fail-soft (siehe Implementierung): der Label-Entzug ist die Grenze,
 * dies hier räumt die Anzeige nach.
 */
export async function revokeCommunityLabel(
  event: H3Event | undefined,
  communityId: string,
  userId?: string,
): Promise<CommunityLabelRevokeResult> {
  const targetId = userId ?? event?.context.user?.$id
  if (!targetId) return { revoked: false, reason: 'no_user' }
  // Ein Wert, der kein Community-Label sein kann, wird NICHT angefasst — und
  // auch nicht als Erfolg gemeldet: wer `admin` als Community-Id einzieht,
  // hat einen Datenfehler, keinen Entzug.
  if (!communityId || !labelUsable(communityId)) return { revoked: false, reason: 'invalid_label' }

  const modLabel = communityModeratorLabel(communityId)
  const result = await writeLabels(
    event,
    targetId,
    { remove: modLabel ? [communityId, modLabel] : [communityId] },
    'revoked',
  )
  // Die Anzeige räumt auch nach einem gescheiterten Label-Entzug auf (fail-soft,
  // siehe oben) — die GRENZE ist das Label, und über das berichtet das Ergebnis.
  await revokeAccountHandleAudience(event, targetId, communityId)
  // Ein gelöschtes Konto trägt kein Label mehr — das ist „weg".
  if (!result.ok && result.reason === 'not_found') return { revoked: true }
  if (!result.ok) return { revoked: false, reason: result.reason }
  return { revoked: true }
}
