import type { BrandStepAcceptanceResponse } from '../../../../../../../shared/types/brand'
import {
  brandAcceptanceSessions,
  loadBrandAcceptanceContext,
} from '../../../../../../utils/brandAcceptance'

/**
 * DIE FINALE ABNAHME EINES KAPITELS (Plan §5a) — was die Seite zeigt, in
 * EINEM Abruf.
 *
 * ── DREI DINGE JE BLOCK, EIN ZÄHLER DARÜBER ──────────────────────────────
 * §5a Schritt 1: Bereich (Feldname + „fliesst später in …"), Beispiel (aus der
 * Session-Config, FREMDE Branche, je Pfad) und die eigene Eingabe — der
 * bestätigte Wert, VOLLSTÄNDIG und nicht gekürzt. Schritt 2: der Zähler
 * „7 von 10 abgenommen". Schritt 3: `acceptance.ready` sagt, ob die Frage
 * „Passt dieses Kapitel?" überhaupt erscheinen darf.
 *
 * ── WARUM DIE FRAGE ERST BEI `ready` KOMMT ───────────────────────────────
 * Dieselbe Regel wie bei `brandStepCompletion`: eine Weiche, die vor ihrer
 * Bedingung erscheint, verspricht einen Abschluss, den die Route danach
 * abweist — Davids Live-Fund im Baustein `pvm`. Neu sind nur die drei Glieder
 * (abgenommen · nicht veraltet · kein offener Konflikt), und sie stehen in
 * DERSELBEN Rechnung, die `complete` durchsetzt (`brandStepAcceptance`).
 *
 * ── DIE BLÖCKE BAUT SIE NICHT MEHR SELBST (Paket 7) ──────────────────────
 * `brandAcceptanceSessions` liegt in `server/utils/brandAcceptance.ts`, weil
 * das DOKUMENT (§10) dieselbe Liste für alle neun Kapitel braucht: es IST die
 * Finale Abnahme der Ebene 1. Zwei Bauer wären zwei Antworten auf „was steht in
 * diesem Feld" — dort stehen auch die Regeln (Schlüssel statt Text, Beispiele
 * als Inhalt, Befunde je Block).
 *
 * ── KEIN GEORGE UND KEIN MODELL ──────────────────────────────────────────
 * Diese Route ruft nichts an — auch seit Paket 4 nicht. Der Kapitel-Modus des
 * Schliess-Aufrufs (§7, „der Spezialist liest das Kapitel mit") ist eine
 * EIGENE Route (`POST …/review`), die der Client beim Öffnen der Seite
 * daneben ruft: ein Modell-Aufruf in einem GET wäre eine Leseroute, die Geld
 * kostet und die ein Reload beliebig oft auslöst.
 *
 * ── DIE BEFUNDE STEHEN JETZT DABEI (Paket 4, §8) ─────────────────────────
 * Je Block die OFFENEN Befunde, an denen dieses Feld beteiligt ist — die
 * Daten für die Chips aus Paket 5. Die SPERRE daraus rechnet nicht diese
 * Route, sondern `brandStepAcceptance` über `openConflicts` aus dem
 * gemeinsamen Kontext: ein Feld mit offenem `conflict` steht als Blocker in
 * `acceptance.blockers`, und die Frage „Passt dieses Kapitel?" bleibt weg.
 */
export default defineEventHandler(async (event): Promise<BrandStepAcceptanceResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepKey, stepRow, records, sessionStates, acceptance, journey, findings }
    = await loadBrandAcceptanceContext(event, userId, betaAccount)

  const pathKind = profile.pathKind === 'relaunch' ? 'relaunch' : 'new'
  const team = profile.team === 'team' ? 'team' : 'solo'

  const sessions = brandAcceptanceSessions({
    stepKey,
    records,
    sessionStates,
    findings,
    journey,
    pathKind,
    team,
  })

  return {
    stepKey,
    storedState: stepRow.state,
    revision: stepRow.revision ?? 0,
    confidence: stepRow.confidence ?? null,
    restartedAt: stepRow.restartedAt ?? null,
    sessions,
    acceptance,
  }
})
