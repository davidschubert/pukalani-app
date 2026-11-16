import type { MarketOverviewResponse, MarketRunView } from '../../../../../shared/types/marketApi'
import { MARKET_RUN_SCOPE, noMarketRunView, toMarketRunView } from '../../../../../shared/marketRun'
import type { MarketAiView, MarketProfile } from '../../../../../shared/marketProfile'
import { MARKET_COMPETITORS_MAX } from '../../../../../shared/marketProfile'
import { resolveMarketPaywall } from '../../../../../shared/marketPaywall'
import { brandMarketVisibilityOf, readBrandAiEnabled, resolveDerivationAccess } from '../../../../contracts/brandContract'
import { MARKET_UNLOCK_STEP, marketUnlocked, requireMarketProfile } from '../../../../utils/marketAccess'
import { listMarketCompetitors, listMarketProfiles } from '../../../../utils/marketStore'
import { loadMarketBrandChecks } from '../../../../utils/marketBrandCheck'
import { marketRunStore } from '../../../../utils/marketRun'
import {
  latestProfilesByCompetitor,
  toMarketAiView,
  toMarketCompetitor,
  toMarketProfile,
} from '../../../../utils/marketViews'

/**
 * DER STAND EINES BRANDINGS (MV1 M2): Kandidaten, ihre JÜNGSTEN Marktprofile
 * und die getrennt gehaltene KI-Aussensicht.
 *
 * ── WARUM NUR DAS JÜNGSTE PROFIL ──────────────────────────────────────────
 * Die Tabelle hält den Verlauf (jeder Abrufstand legt eine neue Zeile an). Die
 * SEITE zeigt einen Stand, nicht eine Geschichte — und ein Vergleich, in dem
 * derselbe Wettbewerber zweimal mit verschiedenen Sätzen steht, wäre keiner.
 *
 * ── `aiViews` STEHT NEBEN `profiles`, NICHT DARIN ─────────────────────────
 * Die Trennung ist die Leitplanke selbst (§7.5 a): „Website sagt" und
 * „KI-Antworten sagen" dürfen sich nirgends berühren. Sie kommen aus derselben
 * ZEILE, aber aus zwei Spalten — und verlassen den Server als zwei Listen.
 *
 * ── SEIT MV1 M4 TRÄGT SIE AUCH DEN ZUSTAND DER SEITE ─────────────────────
 * Freischaltung (§2.4), Schranke (§1.9), Deckel und Opt-in (§7.2 Nr. 4). Alle
 * vier sind Tatsachen ÜBER DIESES BRANDING, sie kosten hier keine zusätzliche
 * Abfrage (die Profil-Zeile liegt schon vor, die Kapitel-Zeile ist ein
 * `getRow` auf eine deterministische Id) — und die Seite braucht sie beim
 * ERSTEN Rendern, weil sie sonst zwischen „gesperrt" und „offen" flackerte.
 * Die Route bleibt bewusst OHNE Freischaltungs-Schranke: Ansehen kostet
 * nichts, und eine Seite, die ihre eigene Sperre nicht laden dürfte, könnte
 * sie nicht erklären.
 *
 * ── SEIT GA1 P18 TRÄGT SIE DEN JÜNGSTEN LAUF (`run`) ────────────────────
 * `POST /run` antwortet 202 und rechnet dahinter; die Seite fragt DIESE Route
 * im Takt ab, solange der Lauf läuft. Der Zustand wird hier mit der
 * SERVER-Uhr gerechnet (eine schiefe Browser-Uhr soll nicht „läuft" oder
 * „abgebrochen" sagen), die Namen der Schritte kommen aus den
 * Kandidaten-Zeilen, die ohnehin geladen sind. Ein Lesefehler der
 * Lauf-Tabelle wirft die Übersicht NICHT um: dann `state: 'none'` und eine
 * Warn-Zeile — Kandidaten und Bericht sind wichtiger als der Lauf-Stand, und
 * auf einer Instanz ohne market-005 gäbe es sonst gar keine Seite.
 */
export default defineEventHandler(async (event): Promise<MarketOverviewResponse> => {
  const { profileId, profile, betaAccount } = await requireMarketProfile(event)

  const [competitors, profileRows, aiEnabled, unlocked, lease] = await Promise.all([
    listMarketCompetitors(event, profileId),
    listMarketProfiles(event, profileId),
    readBrandAiEnabled(event),
    marketUnlocked(event, profileId),
    marketRunStore(event).latest(MARKET_RUN_SCOPE, profileId).then(
      row => ({ ok: true as const, row }),
      () => ({ ok: false as const, row: null }),
    ),
  ])

  let run: MarketRunView = noMarketRunView()
  if (lease.ok) {
    run = toMarketRunView(lease.row, Date.now(), new Map(competitors.map(row => [row.$id, row.name])))
  }
  else {
    logEvent('warn', 'market.run_state_unreadable', {})
  }

  const latest = latestProfilesByCompetitor(profileRows)
  const profiles: MarketProfile[] = []
  const aiViews: MarketAiView[] = []
  for (const row of latest.values()) {
    profiles.push(toMarketProfile(row))
    const view = toMarketAiView(row)
    if (view) aiViews.push(view)
  }

  // Der BESTEHENDE Brand-Check-Score je Website-Kandidat (§7.3, MV1 M3) —
  // gelesen, nie gerechnet.
  const checks = await loadMarketBrandChecks(event, competitors)

  return {
    competitors: competitors.map(row => toMarketCompetitor(row, checks.get(row.$id) ?? null)),
    profiles,
    aiViews,
    aiEnabled,
    unlocked,
    unlockStepKey: MARKET_UNLOCK_STEP,
    /**
     * ZWEI ECHTE TATSACHEN STATT EINER VERDRAHTETEN (BK1 K1).
     *
     * Bis 2026-09-09 stand hier `betaAccess: true` mit der Begründung „wer hier
     * ankommt, ist durch `requireBrandAccess` gegangen". Das stimmte, solange
     * die Beta der einzige Weg war — und war deshalb nie eine geprüfte Aussage.
     * Jetzt kommt `betaAccess` aus dem Gate und `derivationUnlocked` aus der
     * puren Regel des brand-Layers über DIESE Marke (Feld ODER Beta, §2.8).
     * Beides zusammen ist die Schranke aus BS1 §4.1 (b).
     */
    paywall: resolveMarketPaywall({
      betaAccess: betaAccount,
      derivationUnlocked: resolveDerivationAccess({
        betaAccount,
        unlockedAt: profile.derivationUnlockedAt,
        via: profile.derivationUnlockedVia,
      }).unlocked,
    }),
    max: MARKET_COMPETITORS_MAX,
    marketVisibility: brandMarketVisibilityOf(profile),
    run,
  }
})
