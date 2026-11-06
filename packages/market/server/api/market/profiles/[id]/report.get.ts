import type { MarketReportResponse } from '../../../../../shared/types/marketApi'
import { readBrandAiEnabled } from '../../../../contracts/brandContract'
import { requireMarketProfile } from '../../../../utils/marketAccess'
import {
  latestMarketReport,
  loadMarketFindings,
  loadMarketReportState,
  toMarketReportView,
} from '../../../../utils/marketReportService'

/**
 * DER LETZTE BERICHT — mit der Auskunft, ob er noch gilt (Plan §2.4, MV1 M3).
 *
 * ── KEINE FREISCHALTUNGS-SCHRANKE ─────────────────────────────────────────
 * Anders als der Lauf und der Vergleich: die Schranke (`market_locked`) hängt
 * an dem, was KOSTET. Etwas ANSEHEN, das schon existiert, kostet nichts — und
 * ein Bericht, der nach einem Kapitel-Neustart plötzlich 409 antwortete, wäre
 * für den Menschen davor verschwunden statt überholt. Dieselbe Regel wie bei
 * der Kandidatenliste (M2: „die Kandidatenliste ist trotzdem erreichbar").
 *
 * ── `stale` IST KEIN ZWEITER MECHANISMUS ──────────────────────────────────
 * Es ist DERSELBE Schlüssel: der Stand von JETZT gegen den, der in der Zeile
 * steht. Bewegt hat ihn entweder eine eigene Korrektur (ein bestätigtes Feld
 * hat einen neuen Wert) oder ein neuer Abrufstand (ein Kandidat hat ein neues
 * Marktprofil, eine neue Adresse, oder es ist einer dazugekommen). Beides ist
 * dasselbe Ereignis: „worüber du hier liest, stimmt so nicht mehr."
 *
 * ── ANZEIGE-WORT, KEIN LÖSCHEN ────────────────────────────────────────────
 * Ein überholter Bericht bleibt vollständig lesbar. Er war zu seiner Zeit
 * richtig, seine Zitate sind belegt und sein Datum steht daneben — ihn
 * wegzunehmen, weil sich ein Wort geändert hat, nähme dem Kunden die Arbeit
 * eines ganzen Laufs für eine Kleinigkeit.
 *
 * ── DIE BEFUNDE KOMMEN FRISCH ─────────────────────────────────────────────
 * Der Bericht ist eingefroren, seine Befunde sind es nicht: ihr ZUSTAND
 * (offen/angenommen/abgelehnt) ändert sich, nachdem er geschrieben wurde. Ein
 * mitgespeicherter Zustand zeigte einen Chip, den der Mensch längst
 * entschieden hat.
 */
export default defineEventHandler(async (event): Promise<MarketReportResponse> => {
  const { profileId } = await requireMarketProfile(event)

  const [row, aiEnabled] = await Promise.all([
    latestMarketReport(event, profileId),
    readBrandAiEnabled(event),
  ])

  if (!row) return { report: null, stale: false, reused: false, aiEnabled }

  const [state, findings] = await Promise.all([
    loadMarketReportState(event, profileId),
    loadMarketFindings(event, profileId),
  ])

  return {
    report: toMarketReportView(row, findings),
    stale: state.revisionKey !== row.revisionKey,
    // Aus der Ablage — diese Route rechnet grundsätzlich nichts.
    reused: true,
    aiEnabled,
  }
})
