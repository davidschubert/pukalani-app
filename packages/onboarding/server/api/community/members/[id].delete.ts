import { callControlPlane } from '../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../utils/communityTeamGate'

/**
 * Einem Mitglied den Zugang entziehen.
 *
 * DELETE als Methode, aber KEIN Löschen: die Mitgliedschaft wird auf
 * status='removed' gesetzt, Inhalte und Namen bleiben (Davids Entscheidung 1 vom
 * 2026-07-29). Die Methode beschreibt, was der Betreiber tut („diesen Zugang
 * weg"), nicht was in der Zeile passiert — die Begründung steht in
 * control/api/control/community/members/remove.post.ts.
 *
 * ZWEI SCHRITTE, ZWEI PROJEKTE (A5): das Control Plane nimmt die ROLLE (seine
 * Tabelle), diese Route nimmt das LESE-PUBLIKUM (das Site-Label lebt im
 * Pool-Projekt, und nur die Runtime hat dafür einen Schlüssel). Ohne den zweiten
 * Schritt wäre „Zugang entziehen" ein Versprechen ohne Wirkung: die Rolle war
 * weg, das Label blieb — und mit ihm der Lesezugriff auf Presence, Activity-Feed
 * und mitglieder-sichtbare Zeilen.
 *
 * Reihenfolge ist Absicht: erst die Rolle (das Control Plane darf ablehnen, z. B.
 * „letzter Owner"), dann das Label. Der umgekehrte Weg hätte einem Mitglied nach
 * einer abgelehnten Entfernung das Publikum genommen.
 *
 * DER ENTZUG WIRD NACHGEPRÜFT (SEC-024, seit 2026-11-13 — Davids
 * Entscheidung „Eine Sicherung, die nicht prüfen kann, lehnt ab"): bis dahin
 * war er best-effort, die Route sagte `ok`, und ein hängendes Label heilte erst
 * der nächste Besuch der ENTFERNTEN Person — die das gerade nicht will.
 * Jetzt liest `revokeCommunityLabel` nach und wiederholt einmal; ist das Label
 * danach noch da, antwortet die Route mit einem Fehler (502,
 * `reason: label_revoke_failed`), nicht mit `ok`. Die Mitgliedschaft IST
 * trotzdem entfernt (Schritt 1 ist geschehen, ein Zurückrollen wäre ein
 * zweiter Schreibvorgang, der ebenso scheitern kann) — die Oberfläche sagt
 * das und lädt die Liste neu. Den hängenden Rest holt der stündliche Abgleich
 * nach (onboarding/server/utils/labelReconcile.ts).
 *
 * WARUM 502: der Request war gültig und der eigene Teil gelang; gescheitert
 * ist der nachgelagerte Dienst (Appwrite, Users-API). 500 hieße „Fehler in
 * dieser Route", 503 „versuch es gleich noch einmal" — ein zweiter Klick
 * fände die Person aber schon als entfernt vor (Control Plane: 404/409) und
 * führte nie mehr zum Entzug. Nachholen ist Aufgabe des Abgleichs.
 *
 * BEWUSST OHNE FRISCHE ANMELDUNG (RA2, 2026-11-08): `requireRecentAuth` gehört
 * an Unumkehrbares (Konto löschen, Besitz übertragen, Community stilllegen).
 * Entziehen ist umkehrbar — Inhalte und Name bleiben, eine neue Einladung
 * holt die Person zurück — und es ist Alltagsarbeit des Teams (Admin,
 * nicht nur Owner). Die Schutzregeln, die hier zählen (nie der letzte Owner,
 * kein Selbst-Entzug, Owner nur per Übergabe), setzt das Control Plane durch.
 * Ein 10-Minuten-Login vor jedem Aufräumen der Liste kostete mehr, als er
 * schützt.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'team.manage')
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }

  const result = await callControlPlane<{
    ok: boolean
    memberId: string
    status: string
    runtimeUserId?: string
  }>(
    event,
    '/api/control/community/members/remove',
    { jwt, communityId, memberId },
  )

  if (result.runtimeUserId) {
    // Erst merken, dann einziehen: der Rollen-Resolver cacht 30 s, und ohne
    // diese Notiz vergäbe die Label-Middleware das Publikum beim nächsten
    // Request der entfernten Person sofort wieder (siehe communityJoin.ts).
    rememberCommunityAccessRevoked(communityId, result.runtimeUserId)
    const revoke = await revokeCommunityLabel(event, communityId, result.runtimeUserId)
    if (!revoke.revoked) {
      logEvent('error', 'community.member_remove_label_failed', {
        communityId,
        userId: result.runtimeUserId,
        reason: revoke.reason,
      })
      throw createError({
        status: 502,
        statusText: 'Membership removed, but read access could not be revoked yet',
        data: { code: 'label_revoke_failed' },
      })
    }
  }

  return { ok: result.ok, memberId: result.memberId, status: result.status }
})
