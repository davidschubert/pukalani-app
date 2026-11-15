import type { H3Event } from 'h3'
import { type BrandCheckRow, brandCheckRankingFacts, loadOwnedProfile } from './brandStore'

/**
 * WER EIN CHECK-ERGEBNIS LESEN DARF — die EINE Regel für alle Leser einer
 * einzelnen `brand_checks`-Zeile (SEC-014).
 *
 * ── ZWEI ARTEN, ZWEI ANTWORTEN ────────────────────────────────────────────
 * Ein WEBSITE-Check urteilt über eine öffentlich erreichbare Startseite und ist
 * teilbar (Davids Entscheidung 2026-09-05) — jeder mit dem Link darf ihn sehen.
 * Ein DOKUMENT-Check (Fundament-Check, §5b) urteilt über eine NICHT
 * veröffentlichte Brand Foundation und zitiert sie wörtlich in seinen Belegen.
 * Davids Entscheidung: „Das Prüfergebnis einer nicht veröffentlichten Marke
 * sieht nur noch deren Besitzerin." Mit dem Ranking-Häkchen hat sie der
 * Veröffentlichung zugestimmt — dann gilt der Dokument-Check als öffentlich,
 * und der Link aus dem Ranking muss weiter tragen.
 *
 * Ausgeblendet (`hidden`) schlägt alles, auch die Besitzerin: der Betreiber
 * hat einem Entfernungswunsch stattgegeben, und die Seite antwortet dann für
 * alle gleich.
 *
 * Gelöscht (`erased`, brand-026, SEC-015) schlägt ebenfalls alles: Konto oder
 * Marke wurden gelöscht, und Davids Entscheidung ist „sofort für alle
 * unsichtbar". Auch die frühere Besitzerin bekommt das 404 — sie hat die
 * Löschung selbst ausgelöst, und eine Ausnahme für sie hiesse, dass ein
 * gelöschtes Ergebnis über eine noch bestehende Session weiter abrufbar wäre.
 *
 * ── WARUM ZWEI FUNKTIONEN ─────────────────────────────────────────────────
 * `canReadBrandCheck` ist die Regel, pur und als Tabelle testbar.
 * `isBrandCheckReadable` beschafft die eine Angabe, die die Regel nicht selbst
 * kennt (Besitz), und fragt sie NUR, wenn die Antwort davon abhängt — ein
 * Website-Check kostet keine zweite Abfrage.
 *
 * Die Aufrufer antworten auf `false` mit genau dem 404, das auch eine
 * unbekannte Id bekommt: ein eigener Status bestätigte, dass es die Id gibt.
 */

export interface BrandCheckVisibilityFacts {
  /** 'website' | 'document' — Bestand vor brand-017 liest sich als 'website'. */
  source: string
  rankingOptIn: boolean
  hidden: boolean
  /** Konto oder Marke gelöscht (`erasedAt` gesetzt) — dann für niemanden. */
  erased: boolean
  /** Ist die anfragende Session die Besitzerin des zugehörigen Profils? */
  isOwner: boolean
}

export function canReadBrandCheck(facts: BrandCheckVisibilityFacts): boolean {
  if (facts.hidden || facts.erased) return false
  if (facts.source !== 'document') return true
  return facts.rankingOptIn || facts.isOwner
}

/**
 * Die Regel für eine geladene Zeile und die Session des Requests.
 *
 * Die Session ist OPTIONAL: die Leser-Routen laufen ohne Anmeldung, also
 * `event.context.user` (füllt die Auth-Middleware des Core bei gültigem
 * Cookie) statt eines `require*`, das mit 401 abbräche.
 *
 * FAIL-CLOSED: jeder Fehler bei der Besitz-Frage — Profil gelöscht, fremdes
 * Profil, Ablage nicht erreichbar — heisst „nicht die Besitzerin". Ein 5xx an
 * dieser Stelle wäre von aussen von einem 404 unterscheidbar und damit selbst
 * die Auskunft, die der Riegel verhindern soll.
 */
export async function isBrandCheckReadable(event: H3Event, row: BrandCheckRow): Promise<boolean> {
  const facts = brandCheckRankingFacts(row)
  const base = {
    source: facts.source,
    rankingOptIn: facts.rankingOptIn,
    hidden: facts.hidden,
    erased: facts.erased,
  }

  // Hängt die Antwort nicht am Besitz, wird er auch nicht erfragt.
  if (canReadBrandCheck({ ...base, isOwner: true }) === canReadBrandCheck({ ...base, isOwner: false })) {
    return canReadBrandCheck({ ...base, isOwner: false })
  }

  const userId = typeof event.context.user?.$id === 'string' ? event.context.user.$id : ''
  if (!userId || !facts.profileId) return false

  try {
    await loadOwnedProfile(event, userId, facts.profileId)
    return canReadBrandCheck({ ...base, isOwner: true })
  }
  catch {
    return false
  }
}
