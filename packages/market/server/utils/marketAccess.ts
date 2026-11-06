import type { H3Event } from 'h3'
import type { BrandProfileRow } from '../contracts/brandContract'
import { loadStepRow, requireBrandAccess, requireProfileIdParam } from '../contracts/brandContract'
import { MARKET_LOCKED_CODE } from '../../shared/marketLimits'
import { MARKET_UNLOCK_STEP } from '../../shared/marketProfile'
import { requireOwnedMarketProfile } from './marketStore'

/**
 * DIE TÜR JEDER `/api/market`-ROUTE — vier Fragen in dieser Reihenfolge, und
 * die Reihenfolge ist selbst eine Regel.
 *
 *  0. BIETET DIESE APP DAS PRODUKT ÜBERHAUPT AN? (`requireMarketEnabled`,
 *     Build-Gate `pukalani.market.enabled`, 404.) Ganz vorn, weil sie ohne
 *     jede Auskunft beantwortbar ist — eine App ohne dieses Produkt hat diese
 *     Adressen nicht.
 *  1. DARF DIESES KONTO ÜBERHAUPT? (`requireBrandAccess`, Beta-Gate des
 *     Wizards, 404 statt 403.) Dann, weil die Antwort keinen Datenzugriff
 *     braucht: ohne Session ist sie fest.
 *  2. GEHÖRT IHM DIESES BRANDING? (`loadOwnedProfile` über den Store, 404.)
 *     Alle market_*-Tabellen sind server-only; das hier IST die
 *     Zugriffsgrenze, es gibt keine Row-Permission dahinter.
 *  3. IST DAS PRODUKT FÜR DIESES BRANDING FREIGESCHALTET? (Kapitel B
 *     abgenommen, §2.4.) Zuletzt, weil es eine FACHLICHE Antwort ist: sie
 *     antwortet 409 mit Grund, nicht 404 — der Mensch soll erfahren, was ihm
 *     fehlt, und dieses Branding gehört ihm ja.
 *
 * ── WARUM DIE FREISCHALTUNG NICHT ÜBERALL GILT ────────────────────────────
 * Die LESE-Route und das Führen der Kandidatenliste laufen ohne sie: einen
 * Wettbewerber einzutragen, während man an Kapitel B arbeitet, ist eine
 * sinnvolle Reihenfolge. Gesperrt ist der LAUF — er kostet Geld und liefert
 * einen Vergleich, für den es ohne Kapitel B keine eigene Seite gäbe („vorher
 * gibt es keine eigene Behauptung, die man vergleichen könnte", §2.4).
 */

/**
 * Das Kapitel, dessen Abnahme den Marktvergleich freischaltet (§2.4).
 *
 * Die WAHRHEIT steht seit MV1 M4 im Produktvertrag (`shared/marketProfile.ts`)
 * — auch Leiste und Seite brauchen sie, und die laufen im Browser. Hier steht
 * nur der Name, unter dem die Server-Seite sie kennt.
 */
export { MARKET_UNLOCK_STEP } from '../../shared/marketProfile'

export interface MarketRouteContext {
  userId: string
  /**
   * Hat das KONTO einen gültigen Beta-Zugang (`brand_access`)? — die Tatsache
   * aus dem Gate des Wizards, nicht hier ermittelt (BK1 K1, §2.17: „ein
   * zweiter Leser der Beta-Wahrheit wäre ein Leck").
   *
   * Sie steht hier, weil die Schranke des Marktvergleichs sie braucht
   * (`resolveMarketPaywall`) — bis BK1 K1 stand dort ein hart verdrahtetes
   * `true`, weil „wer hier ankommt, ist durch das Beta-Gate gegangen". Das
   * stimmte, solange die Beta der einzige Weg war; ab dem ersten Kauf ist es
   * eine Behauptung, die niemand mehr prüft.
   */
  betaAccount: boolean
  profileId: string
  profile: BrandProfileRow
}

/**
 * Die Kandidaten-Id aus dem Pfad — vorhanden und plausibel, sonst 404.
 * Dieselbe Form wie `requireProfileIdParam` im brand-Layer, und aus demselben
 * Grund an EINER Stelle: zwei Routen, die den Deckel verschieden setzen, sind
 * zwei Routen mit verschiedenem Verhalten auf denselben Unsinn.
 */
export function requireCompetitorIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'cid')
  if (!id || id.length > 64) throw createError({ status: 404, statusText: 'Not Found' })
  return id
}

/**
 * SCHRITT 0 — DAS BUILD-GATE DES PRODUKTS (`pukalani.market.enabled`).
 *
 * ── ZWEI EBENEN, ZWEI FRAGEN, KEIN DOPPEL (MV1 M4-Nachfix) ───────────────
 * Der Core hat mit `04.product-gate.ts` schon einen Wächter vor diesen
 * Routen — der prüft aber etwas ANDERES: den LAUFZEIT-Zustand
 * `app_config.products.market.enabled`, also die Notabschaltung des
 * Betreibers ohne Deploy. Fehlt dort ein Eintrag, gilt das Produkt als AN
 * (`isProductStateEnabled`), und genau das war die Lücke: eine App, die den
 * Layer montiert, das Produkt in ihrer `app.config` aber auf `false` lässt,
 * beantwortete jede `/api/market`-Route trotzdem.
 *
 * Diese Zeile prüft die andere Ebene: „bietet dieses DEPLOYMENT das Produkt
 * an?". Dieselbe Frage stellt die Seite (`market.vue`) vor ihrem ersten
 * Abruf, und sie muss dieselbe Antwort geben — sonst hätte eine dunkle App
 * eine unsichtbare, aber bediente API.
 *
 * 404, nicht 403: eine App ohne dieses Produkt hat diese Adresse nicht, und
 * das ist die ehrliche Antwort auf eine unbekannte Adresse.
 */
export function requireMarketEnabled(): void {
  // OHNE `event` — wie überall sonst im Layer (`marketAi`, `marketQuota`):
  // die App-Config ist eine Eigenschaft des Builds, nicht des Requests.
  const appConfig = useAppConfig() as { pukalani?: { market?: { enabled?: boolean } } }
  if (appConfig.pukalani?.market?.enabled === true) return
  throw createError({ status: 404, statusText: 'Not Found' })
}

/**
 * Schritt 0, 1 und 2 — für jede Route. ALLE zehn `/api/market`-Handler gehen
 * hier durch (geprüft beim Nachfix); eine neue Route, die es nicht täte,
 * stünde ohne Produkt-Gate und ohne Eigentums-Beleg da — sie gehört deshalb
 * ebenfalls hierher und nicht an eine eigene Prüfkette.
 */
export async function requireMarketProfile(event: H3Event): Promise<MarketRouteContext> {
  requireMarketEnabled()
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await requireOwnedMarketProfile(event, userId, profileId)
  return { userId, betaAccount, profileId, profile }
}

/**
 * IST KAPITEL B ABGENOMMEN?
 *
 * Ein Kapitel gilt als abgenommen, wenn seine `brand_steps`-Zeile auf `done`
 * steht — das setzt ausschliesslich `…/steps/pvm/complete`, und zwar erst,
 * wenn jede zählende Session abgenommen ist (`brandStepAcceptance`). Gelesen
 * wird über den Vertrag, nicht über die Tabelle: sonst gäbe es eine zweite
 * Wahrheit darüber, was „abgenommen" heisst.
 *
 * FAIL-CLOSED: keine Zeile ⇒ nicht abgenommen. Das ist der Zustand vor dem
 * ersten Öffnen des Kapitels und darf den Lauf nicht freigeben.
 */
export async function marketUnlocked(event: H3Event, profileId: string): Promise<boolean> {
  const row = await loadStepRow(event, profileId, MARKET_UNLOCK_STEP)
  return row?.state === 'done'
}

/** Schritt 3 — nur für die Routen, die etwas kosten. */
export async function requireMarketUnlocked(event: H3Event, profileId: string): Promise<void> {
  if (await marketUnlocked(event, profileId)) return
  throw createError({
    status: 409,
    statusText: 'Market comparison is not unlocked yet',
    // Der Grund reist als `data.code` und wird vom zentralen Handler als
    // `reason` ins Envelope gehoben — der Client liest `error.data.reason`.
    data: { code: MARKET_LOCKED_CODE },
  })
}
