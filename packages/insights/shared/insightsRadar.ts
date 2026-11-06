import type { InsightsRadarVideo, InsightsTopicKey } from './insightsPost'
import { INSIGHTS_TOPIC_KEYS } from './insightsPost'

/**
 * DIE REINEN REGELN DES THEMENRADARS (BI1 I4, Plan §9.6).
 *
 * Hier steht alles, was der Radar OHNE Netz, ohne Nitro und ohne Appwrite
 * entscheiden kann: welche Kanäle es gibt, wie aus einer Kanal-Id die
 * Uploads-Playlist wird, welchem Cluster ein Video zugerechnet wird und wie
 * nah es an unseren Themen liegt. Der Abruf liegt nebenan
 * (`insightsYoutube.ts`), die Arbeit damit in
 * `server/utils/insightsRadarSweep.ts`.
 *
 * ── WARUM DIE RELEVANZ EINE SCHLAGWORTLISTE IST UND KEIN MODELL ──────────
 * §9.6 sagt es wörtlich: „Relevanz (Nähe zu unseren acht Themenclustern, per
 * Schlagwortliste)". Ein Modell wäre teurer, langsamer und vor allem NICHT
 * REPRODUZIERBAR — die Opportunity-Zahl ist UNSERE Zahl (Leitplanke a), und
 * eine eigene Zahl, die bei jedem Lauf anders ausfällt, kann man nicht
 * verteidigen. Eine Schlagwortliste ist prüfbar, und ihre Fehler sind
 * sichtbar: wer sie ändert, sieht in den Tests, was sich verschiebt.
 *
 * ── DER KANAL IST DIE VORGABE, DER TITEL DIE KORREKTUR ───────────────────
 * Jeder kuratierte Kanal trägt ein Cluster. Das ist der Grundwert: wir haben
 * ihn ausgesucht, weil er über dieses Thema spricht. Der Titel eines EINZELNEN
 * Videos darf davon abweichen (ein Typografie-Kanal macht ein SEO-Video) — er
 * muss es aber BELEGEN, und der Beleg sind Treffer aus der Liste. Ohne Treffer
 * bleibt es beim Cluster des Kanals, und die Relevanz bleibt beim Grundwert.
 */

// ── Die kuratierte Kanalliste ──────────────────────────────────────────────

/**
 * EIN KANAL, WIE IHN EIN RADAR-LAUF BRAUCHT.
 *
 * ── DIESE FORM BLIEB, DIE QUELLE WECHSELTE (BI2 K3, 2026-09-09) ─────────
 * Bis dahin stand die Liste in `pukalani.insights.radar.channels`, und hier
 * stand die Begründung dafür: sie ändere sich seltener als ein Deploy, und
 * „warum ist dieser Kanal drin?" beantworte ein Kommentar neben der Zeile.
 * Der Betrieb hat das widerlegt — an zwei Tagen drei Änderungen. Seit Davids
 * Entscheidung vom 2026-09-09 liegt die Liste in `insights_channels` und wird
 * im Dashboard gepflegt (`readActiveRadarChannels`); der Kommentar neben der
 * Zeile ist zum Feld `note` geworden.
 *
 * Der Lauf selbst merkt davon nichts: er bekommt weiter genau diese drei
 * Felder. `title` ist dabei NUR ein Lesehinweis — der Name, der in einer
 * Radar-Zeile landet, kommt aus `channels.list`.
 */
export interface InsightsRadarChannel {
  /** Die Kanal-Id (`UC…`, 24 Zeichen) — NIE ein Handle (`@name`). */
  channelId: string
  /** Das Cluster, für das dieser Kanal steht (der Grundwert, s. Kopf). */
  topic: InsightsTopicKey
  /** Anzeigename für den Menschen, der die Liste pflegt — nicht für die Daten. */
  title?: string
}

/** Wie viele Videos je Kanal ein Lauf höchstens liest (Vorgabe). */
export const INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT = 20

/**
 * Der Deckel darüber. `playlistItems.list` liefert höchstens 50 Einträge je
 * Seite; mehr zu verlangen hiesse blättern, und Blättern kostet je Seite eine
 * weitere Einheit. Der Radar ist ein SIGNAL, kein Archiv — die 50 jüngsten
 * Uploads eines Kanals reichen dafür mit Abstand.
 */
export const INSIGHTS_RADAR_MAX_VIDEOS_CAP = 50

/**
 * WIE ALT EIN VIDEO HÖCHSTENS SEIN DARF, DAMIT DER LAUF ES SPEICHERT (Vorgabe,
 * in Tagen ab Veröffentlichung). Schärfung nach dem ersten Prod-Lauf
 * (2026-09-10): drei Kanäle der Liste luden seit Jahren nichts hoch, und
 * `playlistItems.list` liefert dann die jüngsten Uploads von 2020 oder 2012 —
 * mit Opportunity 17–50 standen sie in der Morgenliste neben dem, was diese
 * Woche läuft. Das 30-Tage-Netz (`INSIGHTS_RADAR_RETENTION_DAYS`) hilft dort
 * nicht: es rechnet mit dem ABRUF-Datum, und abgerufen wurden sie heute.
 *
 * 180 Tage sind ZWEI Halbwertszeiten des Alters-Signals (90 Tage, §9.6): das
 * Signal steht dann bei 5 von 20 — der Radar sagt selbst, dass so ein Video
 * nicht mehr „läuft". Die Grenze ist eine Redaktions-Vorgabe und darum je App
 * überschreibbar (`pukalani.insights.radar.maxVideoAgeDays`), aber gedeckelt:
 * ein Jahr ist das Äusserste, was noch „was jetzt läuft" heissen kann.
 */
export const INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT = 180
export const INSIGHTS_RADAR_MAX_VIDEO_AGE_CAP = 365

/**
 * WELCHES CLUSTER EINE ZEILE BEKOMMT, DIE KEINES LESBAR MITBRINGT.
 *
 * Der Fall entsteht nur beim LESEN einer Zeile, deren `topic` ein Cluster
 * nennt, das es nicht mehr gibt (umbenannt, entfernt). Fail-soft in die
 * WEITESTE Richtung, nicht in die engste — anders als bei `state` oder
 * `status` in `insightsRows.ts`, und aus einem Grund: dort entscheidet der
 * Ersatzwert über Sichtbarkeit, hier nur über eine Rubrik. Ein falsch
 * einsortiertes Signal kostet nichts; eine Ausnahme mitten in der
 * Radar-Tabelle kostet die ganze Liste.
 */
export const INSIGHTS_RADAR_TOPIC_FALLBACK: InsightsTopicKey = 'brand-strategy'

/**
 * DIE UPLOADS-PLAYLIST EINER KANAL-ID.
 *
 * YouTube vergibt jedem Kanal `UC…` eine Uploads-Playlist `UU…` mit
 * demselben Rumpf — das ist eine dokumentierte Eigenschaft der Data-API und
 * spart uns den `channels.list?part=contentDetails`-Umweg NICHT (den Aufruf
 * brauchen wir ohnehin für die Abonnentenzahl), wohl aber jede Abhängigkeit
 * davon, dass er gelingt.
 *
 * ALLES, WAS NICHT `UC` + 22 ZEICHEN IST, WIRD ABGEWIESEN — `null`, nie ein
 * geratener Wert. Ein Handle (`@thefutur`) oder eine Playlist-Id, die
 * jemand versehentlich in die Liste schreibt, ergäbe sonst eine Adresse, die
 * mit 404 antwortet, und der Lauf zählte einen Fehler, den niemand einem
 * Tippfehler zuordnen könnte.
 */
export function insightsUploadsPlaylistId(channelId: string): string | null {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) return null
  return `UU${channelId.slice(2)}`
}

/**
 * DIE KONFIGURATION LESEN — und alles verwerfen, was nicht trägt.
 *
 * `useAppConfig()` ist zur Laufzeit ein `any`-förmiges Objekt: was in einer
 * App darin steht, hat kein Schema durchlaufen. Diese Funktion ist die
 * Eingangstür. Sie ist PUR, damit die Gegenproben (Handle statt Id, doppelter
 * Kanal, unbekanntes Cluster, absurdes `maxVideosPerChannel`) ohne Nitro
 * prüfbar sind.
 *
 * DOPPELTE KANÄLE FALLEN HERAUS: ein zweiter Eintrag derselben Id kostete
 * einen zweiten Abruf für dieselben Videos und würde beim Upsert mit sich
 * selbst um dieselbe Zeile streiten.
 */
export function readInsightsRadarConfig(appConfig: unknown): {
  maxVideos: number
  /** Videos, die älter sind, speichert der Lauf nicht (Tage ab Veröffentlichung). */
  maxVideoAgeDays: number
} {
  const radar = (appConfig as { pukalani?: { insights?: { radar?: unknown } } } | null)
    ?.pukalani?.insights?.radar as { maxVideosPerChannel?: unknown, maxVideoAgeDays?: unknown } | undefined

  const raw = typeof radar?.maxVideosPerChannel === 'number' ? radar.maxVideosPerChannel : INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT
  const maxVideos = Math.max(1, Math.min(INSIGHTS_RADAR_MAX_VIDEOS_CAP, Math.floor(raw) || INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT))

  const rawAge = typeof radar?.maxVideoAgeDays === 'number' ? radar.maxVideoAgeDays : INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT
  const maxVideoAgeDays = Math.max(1, Math.min(INSIGHTS_RADAR_MAX_VIDEO_AGE_CAP, Math.floor(rawAge) || INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT))

  return { maxVideos, maxVideoAgeDays }
}

// ── Die Schlagwortliste je Cluster ─────────────────────────────────────────

/**
 * DIE SCHLAGWÖRTER DER ACHT CLUSTER — deutsch UND englisch, alles klein.
 *
 * ── WARUM BEIDE SPRACHEN IN EINER LISTE ─────────────────────────────────
 * Der Radar liest Videotitel, und die stehen in der Sprache des Kanals. Eine
 * Liste je Sprache brauchte eine Spracherkennung, die selbst raten müsste —
 * und ein deutscher Titel auf einem englischen Kanal (oder umgekehrt) wäre
 * dann das eine, was durchfällt. Zwei Listen, die dieselbe Frage beantworten,
 * sind ausserdem zwei Listen, die auseinanderlaufen.
 *
 * ── SIE SIND ABSICHTLICH KURZ ───────────────────────────────────────────
 * Jedes zusätzliche Wort verschiebt Videos zwischen Clustern, und die
 * Verschiebung ist im Zweifel unsichtbar (die Zahl ändert sich, nicht die
 * Zeile). Aufgenommen wird, was ein Video wirklich AUSZEICHNET, nicht was
 * darin vorkommen KANN: „design" steht deshalb nirgends — es steht in jedem
 * zweiten Titel dieser Kanäle und trennte damit nichts.
 */
export const INSIGHTS_TOPIC_KEYWORDS: Record<InsightsTopicKey, readonly string[]> = {
  'rebranding': [
    'rebrand', 'rebranding', 'relaunch', 'markenrelaunch', 'redesign', 'neues logo',
    'new logo', 'logo change', 'name change', 'umbenennung', 'markenwechsel', 'makeover',
  ],
  'brand-psychology': [
    'psychology', 'psychologie', 'archetype', 'archetyp', 'archetypes', 'emotion',
    'emotionen', 'behaviour', 'behavior', 'verhalten', 'wahrnehmung', 'perception',
    'neuromarketing', 'bias', 'vertrauen', 'loyalty', 'loyalität',
  ],
  'brand-analysis': [
    'case study', 'fallstudie', 'teardown', 'breakdown', 'analyse', 'analysis',
    'audit', 'critique', 'kritik', 'vergleich', 'comparison', 'versus', 'vs',
    'why it works', 'warum es funktioniert',
  ],
  'brand-strategy': [
    'strategy', 'strategie', 'markenstrategie', 'positioning', 'positionierung',
    'differentiation', 'differenzierung', 'zielgruppe', 'target audience', 'niche',
    'nische', 'value proposition', 'pricing', 'preise', 'business model',
    'geschäftsmodell', 'brand strategy',
  ],
  'brand-language': [
    'copywriting', 'copy', 'tone of voice', 'tonalität', 'messaging', 'naming',
    'slogan', 'claim', 'tagline', 'storytelling', 'texten', 'wording', 'headline',
    'markensprache',
  ],
  'seo-geo': [
    'seo', 'search engine', 'suchmaschine', 'keyword', 'keywords', 'ranking',
    'backlink', 'backlinks', 'serp', 'google search', 'search console', 'geo',
    'ai overview', 'ai overviews', 'llm', 'answer engine', 'traffic', 'indexing',
    'indexierung', 'content marketing',
  ],
  'brand-experience': [
    'ux', 'user experience', 'usability', 'customer experience', 'journey',
    'onboarding', 'interface', 'accessibility', 'barrierefreiheit', 'service design',
    'touchpoint', 'touchpoints', 'nutzererlebnis', 'kundenerlebnis', 'website design',
  ],
  'visual-identity': [
    'logo', 'logos', 'typography', 'typografie', 'schrift', 'font', 'fonts',
    'color', 'colour', 'farbe', 'farben', 'palette', 'brand identity', 'identity',
    'identität', 'markenauftritt', 'style guide', 'styleguide', 'illustration',
    'graphic design', 'grafikdesign', 'layout', 'grid',
  ],
}

/** Der Grundwert: der Kanal ist kuratiert, das allein ist ein halbes Signal. */
export const INSIGHTS_RADAR_RELEVANCE_BASE = 0.5

/** Was ein Treffer im Gewinner-Cluster hinzufügt (gedeckelt bei 1.0). */
export const INSIGHTS_RADAR_RELEVANCE_PER_HIT = 0.25

/** `true`, wenn das Zeichen zu einem Wort gehört — Ziffern eingeschlossen. */
function isWordChar(char: string | undefined): boolean {
  if (!char) return false
  return /[\p{L}\p{N}]/u.test(char)
}

/**
 * ZÄHLT, WIE VIELE SCHLAGWÖRTER EINES CLUSTERS IM TITEL STEHEN.
 *
 * ── AUF WORTGRENZEN, NICHT AUF TEILZEICHENKETTEN ────────────────────────
 * `title.includes('seo')` trifft „season", „Museo" und jede zweite
 * Video-Beschreibung. Der Radar prüft deshalb links und rechts eines Treffers
 * auf ein Wortzeichen. Ein Bindestrich, ein Doppelpunkt oder ein Leerzeichen
 * beenden ein Wort, ein Buchstabe oder eine Ziffer nicht — „SEO:" und
 * „AI-Overviews" treffen, „season" nicht.
 *
 * ── JEDES SCHLAGWORT ZÄHLT HÖCHSTENS EINMAL ─────────────────────────────
 * Ein Titel, der „logo" dreimal sagt, ist nicht dreimal so sehr über Logos.
 * Was zählt, ist die Zahl VERSCHIEDENER Treffer — sie misst Breite, nicht
 * Lautstärke.
 */
function countKeywordHits(lowerTitle: string, keywords: readonly string[]): number {
  let hits = 0
  for (const keyword of keywords) {
    let at = lowerTitle.indexOf(keyword)
    while (at >= 0) {
      const before = at === 0 ? undefined : lowerTitle[at - 1]
      const after = lowerTitle[at + keyword.length]
      if (!isWordChar(before) && !isWordChar(after)) {
        hits += 1
        break
      }
      at = lowerTitle.indexOf(keyword, at + 1)
    }
  }
  return hits
}

/**
 * DIE EINORDNUNG EINES VIDEOS (§9.6, „Relevanz … per Schlagwortliste").
 *
 * Ergebnis: das Cluster, unter dem das Video in der Redaktion steht, und die
 * Relevanz als Zahl zwischen 0 und 1 — genau das dritte Signal, das
 * `insightsOpportunity` erwartet.
 *
 * ── DIE REGEL IN DREI SÄTZEN ────────────────────────────────────────────
 *  1. Treffer je Cluster zählen; das Cluster mit den meisten gewinnt.
 *  2. Gleichstand ⇒ das Cluster des KANALS, wenn es unter den Gleichen ist;
 *     sonst das erste in der Reihenfolge des Katalogs. Der zweite Halbsatz
 *     ist der Determinismus-Riegel: ohne ihn entschiede die Reihenfolge, in
 *     der ein `Object.entries` zufällig läuft, und derselbe Titel bekäme in
 *     zwei Läufen zwei Rubriken.
 *  3. Keine Treffer ⇒ Cluster des Kanals, Relevanz = Grundwert. Das ist KEIN
 *     geratener Mittelwert: der Kanal ist von Hand ausgesucht, und das ist
 *     eine echte, wenn auch schwache Aussage über die Nähe zu unseren Themen.
 */
export function insightsRadarClassify(
  title: string,
  channelTopic: InsightsTopicKey,
): { topic: InsightsTopicKey, relevance: number } {
  const lower = title.toLowerCase()
  let best = 0
  const winners: InsightsTopicKey[] = []

  for (const key of INSIGHTS_TOPIC_KEYS) {
    const hits = countKeywordHits(lower, INSIGHTS_TOPIC_KEYWORDS[key])
    if (hits === 0) continue
    if (hits > best) {
      best = hits
      winners.length = 0
      winners.push(key)
    }
    else if (hits === best) {
      winners.push(key)
    }
  }

  if (best === 0) return { topic: channelTopic, relevance: INSIGHTS_RADAR_RELEVANCE_BASE }

  const topic = winners.includes(channelTopic) ? channelTopic : winners[0]!
  const relevance = Math.min(1, INSIGHTS_RADAR_RELEVANCE_BASE + best * INSIGHTS_RADAR_RELEVANCE_PER_HIT)
  return { topic, relevance }
}

// ── Was der Radar von einem Video ABLEGT ───────────────────────────────────

/**
 * EIN VIDEO IN DER RADAR-TABELLE — die API-Zahlen (Leitplanke a) PLUS die
 * drei Werte, die WIR gerechnet haben.
 *
 * Die Trennung ist keine Formsache: `InsightsRadarVideo` ist das, was von
 * YouTube kommt und nach 30 Tagen geht (Policies III.E.4). `relevance`,
 * `opportunity` und `opportunitySignals` sind UNSERE Zahlen — sie fallen
 * nicht unter das Aggregations-Verbot und dürften ohne die Zahlen darunter
 * weiterleben. Dass sie es in I4 trotzdem nicht tun, ist eine eigene
 * Entscheidung, und sie steht im Kopf der Migration insights-004.
 */
export interface InsightsRadarStoredVideo extends InsightsRadarVideo {
  /** 0–1, aus der Schlagwortliste (s. `insightsRadarClassify`). */
  relevance: number
  /** 0–100, oder `null` wenn kein Signal vorlag (nie 0 als Ersatz). */
  opportunity: number | null
  /** Aus wie vielen Signalen die Zahl gerechnet ist (heute höchstens 3). */
  opportunitySignals: number
}

// ── Die Drossel des Betreiber-Knopfes ──────────────────────────────────────

/**
 * DREI LÄUFE JE STUNDE UND KONTO — und warum ein Betreiber überhaupt
 * gedeckelt wird.
 *
 * Wörtlich dieselbe Begründung wie in `insightsAiLimits.ts`: der Deckel steht
 * nicht gegen Missbrauch (hinter `insights.manage` sitzt der Betreiber
 * selbst), sondern gegen den Unfall. Hier kostet der Unfall kein Geld, sondern
 * QUOTA: ein Lauf über zwölf Kanäle verbraucht rund fünfzehn der 10.000
 * Tageseinheiten, ein verklemmter Knopf über eine Stunde verbrauchte sie alle
 * — und dann steht auch der NÄCHTLICHE Lauf still, ohne dass jemand einen
 * Fehler sähe.
 *
 * Drei und nicht zehn, weil ein Lauf das Tagesbild vollständig erneuert: wer
 * ihn dreimal in einer Stunde braucht, wartet nicht auf Daten, sondern klickt.
 */
export const INSIGHTS_RADAR_RUN_LIMIT = 3
export const INSIGHTS_RADAR_RUN_WINDOW_MS = 60 * 60_000

/** Der Eimer EINES Kontos. */
export function insightsRadarRunKey(userId: string): string {
  return `insights-radar-run:${userId}`
}

/** Der Ablehnungsgrund, der als `data.code` reist (Envelope → `reason`). */
export const INSIGHTS_RADAR_RATE_LIMIT_CODE = 'rate_limited'

/** „Es liegt kein Schlüssel vor" — dieselbe Reise, anderer Grund (503). */
export const INSIGHTS_RADAR_NOT_CONFIGURED_CODE = 'not_configured'
