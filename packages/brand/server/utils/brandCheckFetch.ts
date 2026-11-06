import {
  BRAND_ROBOTS_ABSENT,
  type BrandRobots,
  brandRobotsAllows,
  parseBrandRobots,
} from '../../shared/brandRobots'
import { brandTdmReserved } from '../../shared/brandTdm'
import { extractMetaDirectives } from '../../shared/brandSiteCrawlParse'
import { extractSiteContent, extractSiteSignals } from '../../shared/brandSiteAnalysis'
import { crawlBrandTextResource } from './brandSiteCrawl'
import {
  BRAND_CHECK_BOT_TOKEN,
  BRAND_CHECK_USER_AGENT,
  type BrandSiteFetchResult,
  fetchBrandDocument,
} from './brandSiteFetch'

/**
 * DER ABRUF DES BRAND-CHECKS — derselbe Transport wie überall, aber mit
 * Erlaubnis-Frage davor (BS1 R2b, Davids Entscheidung 2026-09-08).
 *
 * ── WARUM EINE EIGENE HÜLLE UND KEIN SCHALTER AN `fetchBrandSite` ─────────
 * Es gibt heute genau ZWEI Wege, auf denen eine fremde Startseite gelesen
 * wird, und sie unterscheiden sich nicht in einem Flag, sondern in der
 * BEGRÜNDUNG:
 *
 *  · Der WIZARD (`server/api/brand/profiles/[id]/analyze.post.ts`) liest die
 *    Website, die der eingeloggte Betreiber SELBST als seine eigene einträgt.
 *    Der Auftrag kommt von dem, dem die Seite gehört; `robots.txt` regelt das
 *    Verhalten von Suchmaschinen und Crawlern, nicht das eines Werkzeugs, das
 *    sein Besitzer auf sein eigenes Haus richtet. Dieser Weg bleibt deshalb
 *    unverändert bei `fetchBrandSite` und bei `PukalaniBrandWizard`.
 *  · Der CHECK (`/brand-check`, öffentlich, ohne Konto) liest eine BELIEBIGE
 *    Adresse, die irgendwer eingetragen hat. Hier trägt die Begründung nicht
 *    (Faktenblatt §4c, Befund aus R2a) — also gilt, was für den Marktvergleich
 *    längst gilt: erst fragen, dann lesen.
 *
 * Ein optionaler Parameter an `fetchBrandSite` hätte den Unterschied zu einem
 * Häkchen gemacht, das ein dritter Aufrufer irgendwann vergisst — und ein
 * vergessenes Häkchen ist hier kein Fehler, den man sieht, sondern ein Abruf,
 * der stillschweigend gegen eine Ansage läuft. Zwei Namen, zwei Absender, zwei
 * Entscheidungen.
 *
 * ── DIE REGELN SIND DIESELBEN WIE IM MARKTVERGLEICH ───────────────────────
 * Wörtlich dieselben Funktionen: `brandRobotsAllows` (RFC 9309, je Absender,
 * mit Platzhaltern) und `brandTdmReserved` (vier Formen, fail-closed). Sie
 * lagen bis R2b im market-Layer und sind dafür nach `brand` gezogen — eine
 * zweite Fassung wären zwei Wahrheiten darüber, wen wir anfassen dürfen.
 *
 * ── DAS ANFRAGE-BUDGET: ZWEI ZUSÄTZLICHE ABRUFE, BEIDE VORHER ─────────────
 *  1. `<ursprung>/robots.txt` — die eine Frage, ohne die alles Weitere ein
 *     Übergriff wäre.
 *  2. `<ursprung>/.well-known/tdmrep.json` — nur, wenn `robots.txt` sie uns
 *     nicht verbietet. Sie ist der einzige Vorbehalt, der NICHT in der Seite
 *     selbst steht; ihn wegzulassen hiesse, drei der vier anerkannten Formen
 *     zu prüfen und die vierte zu behaupten.
 * Die restlichen drei Formen (Kopfzeile, `tdm-reservation`-Meta,
 * `noai`/`noimageai`) kommen aus der Antwort der Seite, die wir ohnehin holen
 * — kein Abruf mehr. Beide Zusatzabrufe sind winzige Textdateien mit eigenem
 * Byte-Deckel; gegen den KI-Aufruf, den ein Check kostet, fallen sie nicht ins
 * Gewicht.
 *
 * ── DIE BEKANNTE GRENZE, DIE WIR NICHT VERSTECKEN ─────────────────────────
 * Gefragt wird der URSPRUNG DER EINGETRAGENEN Adresse. Springt die Seite per
 * Weiterleitung auf einen ANDEREN Wirt, holen wir dessen `robots.txt` NICHT
 * nach — das wäre ein dritter Abruf für einen Fall, den der Betreiber der
 * ersten Adresse selbst angeordnet hat. Der Marktvergleich verhält sich
 * genauso (`marketFetch.ts` prüft den Ursprung der Startadresse), und zwei
 * verschiedene Antworten auf dieselbe Frage wären schlimmer als diese eine
 * benannte Lücke. Was wir SEHR WOHL nachziehen, kostet nichts: bleibt der Wirt
 * derselbe und ändert sich nur der PFAD, wird dieselbe (bereits gelesene)
 * `robots.txt` noch einmal gegen den Zielpfad gehalten.
 */

/**
 * DIE WEBSITE SAGT NEIN. Eine EIGENE Fehlerklasse neben `BrandSiteFetchError`,
 * weil es kein Fehlschlag ist: der Abruf hat funktioniert, die Antwort lautet
 * „nicht ihr". Die Route macht daraus einen 409 und keinen 422 — und wer beide
 * Klassen fängt, sieht am Namen, dass hier nichts zu wiederholen ist.
 */
export type BrandCheckBlockedReason = 'robots' | 'tdm'

export class BrandSiteBlockedError extends Error {
  // Gewöhnliches Feld statt Parameter-Eigenschaft — dieselbe Begründung wie
  // bei `BrandSiteFetchError` (Nodes „strip-only"-Modus).
  readonly reason: BrandCheckBlockedReason

  constructor(reason: BrandCheckBlockedReason, message: string) {
    super(message)
    this.name = 'BrandSiteBlockedError'
    this.reason = reason
  }
}

/** Pfad mit Query, so wie `robots.txt` und `tdmrep.json` ihn vergleichen. */
function pathOf(url: URL): string {
  return `${url.pathname}${url.search}`
}

/**
 * DIE EINE SEITE DES BRAND-CHECKS — mit Erlaubnis, oder gar nicht.
 *
 * Rückgabe und Fehlerklasse von `fetchBrandSite` bleiben erhalten (dieselbe
 * `BrandSiteFetchResult`, dieselben `BrandSiteFetchError`-Codes); dazu kommt
 * `BrandSiteBlockedError`. Der Aufrufer fängt sie ZUERST.
 */
export async function fetchBrandSiteForCheck(raw: string): Promise<BrandSiteFetchResult> {
  // Die Adresse ist vom Schema normalisiert; lässt sie sich hier trotzdem
  // nicht lesen, gibt es keinen Ursprung, den man fragen könnte — dann
  // entscheidet der Abruf selbst (er wirft `blocked_target`).
  const submitted = parseUrl(raw)

  let robots: BrandRobots = BRAND_ROBOTS_ABSENT
  let tdmrepJson: string | undefined

  if (submitted) {
    const origin = submitted.origin
    const robotsDocument = await crawlBrandTextResource(`${origin}/robots.txt`, BRAND_CHECK_USER_AGENT)
    robots = robotsDocument ? parseBrandRobots(robotsDocument.text) : BRAND_ROBOTS_ABSENT
    if (!brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, pathOf(submitted))) {
      throw new BrandSiteBlockedError('robots', 'robots.txt disallows this fetch')
    }

    // Auch die Vorbehalts-Datei ist eine Datei: wer sie uns in `robots.txt`
    // verbietet, bekommt keine Anfrage darauf. (Dass wir sie dann nicht lesen
    // können, schadet niemandem — ein Verbot in `robots.txt` ist bereits die
    // deutlichere Ansage.)
    if (brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, '/.well-known/tdmrep.json')) {
      const tdmrep = await crawlBrandTextResource(`${origin}/.well-known/tdmrep.json`, BRAND_CHECK_USER_AGENT)
      tdmrepJson = tdmrep?.text
    }
    // VOR dem Seitenabruf: liegt der Vorbehalt schon in der Wohlbekannt-Datei,
    // ist die Seite selbst gar nicht erst zu holen.
    if (brandTdmReserved({ tdmrepJson, path: pathOf(submitted) })) {
      throw new BrandSiteBlockedError('tdm', 'A text and data mining reservation applies')
    }
  }

  const document = await fetchBrandDocument(raw, { userAgent: BRAND_CHECK_USER_AGENT })
  const finalUrl = parseUrl(document.finalUrl)

  // Nach den Sprüngen noch einmal — ohne einen einzigen weiteren Abruf: die
  // `robots.txt` liegt vor, und der Pfad kann sich verschoben haben. Nur wenn
  // der WIRT gewechselt hat, gilt sie nicht mehr (s. Kopf).
  if (submitted && finalUrl && finalUrl.host === submitted.host) {
    if (!brandRobotsAllows(robots, BRAND_CHECK_BOT_TOKEN, pathOf(finalUrl))) {
      throw new BrandSiteBlockedError('robots', 'robots.txt disallows the redirect target')
    }
  }

  const meta = extractMetaDirectives(document.body)
  const reservedPath = finalUrl && submitted && finalUrl.host === submitted.host
    ? pathOf(finalUrl)
    : '/'
  if (brandTdmReserved({
    headers: document.headers,
    metaRobots: meta.robots,
    metaTdm: meta.tdmReservation,
    // Auf einem FREMDEN Wirt gilt unsere `tdmrep.json` nicht — dann zählen
    // nur Kopfzeile und Metas, die aus der Antwort selbst kommen.
    tdmrepJson: finalUrl && submitted && finalUrl.host === submitted.host ? tdmrepJson : undefined,
    path: reservedPath,
  })) {
    throw new BrandSiteBlockedError('tdm', 'A text and data mining reservation applies')
  }

  // Ab hier wörtlich `fetchBrandSite`: das rohe HTML verlässt diese Datei
  // nicht, heraus geht dieselbe Auswertung.
  return {
    content: extractSiteContent(document.body),
    signals: extractSiteSignals(document.body),
    finalUrl: document.finalUrl,
    finalHost: document.finalHost,
    httpsUpgraded: document.httpsUpgraded,
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim())
  }
  catch {
    return null
  }
}
