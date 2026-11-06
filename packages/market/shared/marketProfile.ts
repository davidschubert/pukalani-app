/**
 * DER VERGLEICHS-VERTRAG — das Marktprofil (Plan §2.2,
 * docs/archiv/BRAND-MARKTVERGLEICH.md).
 *
 * STAND M1: hier stehen die TYPEN und die Abbildung `MARKET_FIELDS` auf die
 * Slot-Ids der brand-Registry. Die ZOD-Schemas der Ablage stehen daneben in
 * `shared/types/market.ts` (sie prüfen, was aus der Datenbank zurückkommt);
 * die deterministische Prüfung `evidence ⊂ rawText` kommt mit M2 — sie braucht
 * den Rohtext und gehört deshalb an die Extraktion, nicht in ein Schema.
 *
 * ── WARUM DIE SLOT-IDS HIER ZEICHENKETTEN BLEIBEN ─────────────────────────
 * Diese Datei importiert `brand` NICHT, obwohl sie es seit M1 dürfte (Plan
 * §2.2). Der Grund ist nicht Vorsicht, sondern Zuschnitt: sie ist der PURE
 * Produktvertrag und wird auch dort gelesen, wo es keinen brand-Layer gibt
 * (Komponenten, Tests, später der Prompt-Bau). Ein Wert-Import machte aus
 * einem Vertrag eine Abhängigkeit.
 *
 * Der Preis einer Zeichenkette ist eine Sicherung, und die steht:
 * `tests/marketBrandContract.test.ts` hält JEDE Abbildung gegen die
 * brand-Registry (existiert der Slot, ist er nicht `deactivated`?) — mit
 * Gegenprobe. Ein Tippfehler wäre sonst eine Zeile, die im Vergleich einfach
 * leer bleibt, und die sieht aus wie ein Ergebnis.
 *
 * ── WAS NICHT INS MARKTPROFIL GEHÖRT (§2.2, Absatz „Nicht im Marktprofil") ─
 * Gründungsimpuls, Beschwerden, Konfliktregel, Vision-Zehnjahres-Bild und
 * Manifest. Sie sind von aussen nicht ehrlich ableitbar; ein Modell, das sie
 * trotzdem füllt, erfindet sie.
 */

import { EVIDENCE_QUOTE_MAX } from '../../core/shared/evidenceGrounding'

/** Die zehn Felder, die man von AUSSEN über eine Marke sagen kann (§2.2). */
export const MARKET_FIELD_IDS = [
  'categoryLanguage',
  'pitch',
  'audience',
  'firstChoice',
  'purpose',
  'values',
  'toneWords',
  'tagline',
  'keyMessages',
  'distinctiveAsset',
] as const

export type MarketFieldId = (typeof MARKET_FIELD_IDS)[number]

/**
 * DIE FORM eines Feldes — sie steuert die Anzeige (eine Zeile, ein Satz, eine
 * Liste) UND später die Klemmung der Modell-Antwort. Sie steht am Feld und
 * nicht in der Komponente, damit beide Enden dieselbe Erwartung haben.
 */
export type MarketFieldForm = 'shortText' | 'sentence' | 'list'

export interface MarketFieldDefinition {
  readonly id: MarketFieldId
  /**
   * Die EIGENEN Felder, gegen die verglichen wird — Slot-Ids der
   * brand-Registry. Mehrere heisst: der Vergleich zieht sie zusammen
   * (`categoryLanguage` liest `a.category` UND `b.positioningCategory`).
   */
  readonly slotIds: readonly string[]
  readonly form: MarketFieldForm
  /** Deckel für `list`-Felder (§2.2: Werte ≤ 5, Tonwörter ≤ 5, Botschaften ≤ 3). */
  readonly maxItems?: number
}

/** Die Abbildung aus §2.2, in der Reihenfolge der Tabelle dort. */
export const MARKET_FIELDS: readonly MarketFieldDefinition[] = [
  { id: 'categoryLanguage', slotIds: ['a.category', 'b.positioningCategory'], form: 'shortText' },
  { id: 'pitch', slotIds: ['a.pitch'], form: 'sentence' },
  { id: 'audience', slotIds: ['a.audienceSketch'], form: 'sentence' },
  { id: 'firstChoice', slotIds: ['b.positioningFirstChoice'], form: 'sentence' },
  { id: 'purpose', slotIds: ['b.purpose'], form: 'sentence' },
  { id: 'values', slotIds: ['c.final'], form: 'list', maxItems: 5 },
  { id: 'toneWords', slotIds: ['d.toneWords'], form: 'list', maxItems: 5 },
  { id: 'tagline', slotIds: ['ep.taglines'], form: 'shortText' },
  { id: 'keyMessages', slotIds: ['ep.keyMessages'], form: 'list', maxItems: 3 },
  { id: 'distinctiveAsset', slotIds: ['ep.distinctiveAsset'], form: 'shortText' },
]

/**
 * Zitatschranke je Feld (§1.7 Nr. 4) — die Zahl gehört zum Vertrag, aber sie
 * ist nicht MEHR die einzige Stelle: seit BI1 I1a steht die Schranke des § 51
 * UrhG EINMAL im Fundament (`EVIDENCE_QUOTE_MAX`), und Brand Insights leitet
 * seine `INSIGHTS_QUOTE_MAX` aus derselben Zahl ab. Der MARKT-Name bleibt, weil
 * er im ganzen Layer und im Ablage-Schema steht — zwei verschiedene ZAHLEN für
 * dieselbe Rechtsfrage wären dagegen eine Einladung, die kleinere zu vergessen.
 */
export const MARKET_EVIDENCE_MAX: number = EVIDENCE_QUOTE_MAX

/** Höchstzahl Wettbewerber je Branding (§2.9 Nr. 8). */
export const MARKET_COMPETITORS_MAX = 5

/**
 * DAS KAPITEL, DESSEN ABNAHME DEN MARKTVERGLEICH FREISCHALTET (§2.4).
 *
 * ── WARUM DIESE ZEILE IM PRODUKTVERTRAG STEHT UND NICHT NUR IM SERVER ────
 * Drei Stellen brauchen sie, und zwei davon laufen im Browser: das Gate der
 * Routen (`server/utils/marketAccess.ts`), der Leisten-Eintrag „Markt", der
 * bis dahin gesperrt ist (`app/app.config.ts`), und die Seite, die den
 * gesperrten Zustand ERKLÄRT und in genau dieses Kapitel verlinkt. Drei
 * getippte `'pvm'` wären drei Stellen, an denen eine spätere Verschiebung der
 * Freischaltung halb ankommt — und die halb angekommene Fassung sieht in der
 * Leiste richtig aus und antwortet an der Route 409.
 */
export const MARKET_UNLOCK_STEP = 'pvm'

/**
 * WIE SICHER IST DIE AUSSAGE? `stated` = wörtlich so gesagt, `implied` = aus
 * mehreren Stellen abgeleitet. Ein drittes Wort gibt es bewusst nicht:
 * „geraten" wäre kein Zustand, sondern ein Grund zum Verwerfen.
 */
export type MarketEvidenceConfidence = 'stated' | 'implied'

/** Der Beleg — ohne ihn gibt es das Feld nicht (§1.10, Halluzinations-Riegel). */
export interface MarketEvidence {
  /** Wörtliches Zitat, höchstens `MARKET_EVIDENCE_MAX` Zeichen. */
  readonly quote: string
  /** Die Seite, auf der es steht — vollständige URL. */
  readonly sourceUrl: string
  /** Abrufdatum (ISO, Tagesgenauigkeit reicht). */
  readonly fetchedAt: string
  readonly confidence: MarketEvidenceConfidence
}

/**
 * WOHER EIN KANDIDAT KOMMT (Plan §7.2, vier Quellen) — und damit auch, woher
 * eine einzelne Aussage stammt (§7.6: `source` am Feld).
 *
 * VIER WERTE, WEIL ES VIER VERSCHIEDENE VERSPRECHEN SIND: `website` ist
 * ABGELESEN (mit Beleg), `foundation` ist ENTSCHIEDEN (bestätigte eigene
 * Felder, deshalb ohne Beleg — sie sind nicht zitiert, sondern beschlossen),
 * `library` ist von UNS gerechnet und VON HAND GEPRÜFT, `shared` ist die
 * freigegebene Marke eines anderen Kontos (nur mit Opt-in, nur die zehn
 * Aussen-Felder). Wer die Herkunft nicht anzeigt, behauptet für alle vier
 * dieselbe Belastbarkeit — und genau das wäre gelogen.
 *
 * Die KI-Aussensicht steht BEWUSST NICHT in dieser Aufzählung: sie ist keine
 * fünfte Quelle für dieselbe Zelle, sondern eine EIGENE Sicht neben „Website
 * sagt" (§7.5 d). Vermischt man beides, ist die ungeprüfte Aussage nicht mehr
 * von der belegten zu unterscheiden.
 */
export type MarketCandidateSource = 'website' | 'foundation' | 'library' | 'shared'

export const MARKET_CANDIDATE_SOURCES: readonly MarketCandidateSource[] = [
  'website',
  'foundation',
  'library',
  'shared',
]

/**
 * WIE OFT EINE AUSSAGE WIEDERKEHRT (§7.4: Aggregation als „Aussage mit
 * Häufigkeit", nicht als Mittelwert).
 *
 * `pages` von `of` gelesenen Seiten. Eine Aussage auf vier von sechs Seiten
 * ist zentral, eine auf einer von sechs ist Rand — DAS macht Websites
 * vergleichbar, nicht eine gemittelte Zahl. Fehlt die Angabe, wurde nur eine
 * Seite gelesen (oder die Quelle hat gar keine Seiten: eine Foundation
 * bestätigt, sie wiederholt nicht).
 */
export interface MarketFrequency {
  readonly pages: number
  readonly of: number
}

/**
 * EIN FELD EINES MARKTPROFILS. `value` LEER heisst „nicht öffentlich
 * formuliert" — und das ist eine Aussage über die Kategorie, kein Fehler
 * (§1.10). Deshalb bleibt das Feld in der Liste stehen, statt zu fehlen.
 */
export interface MarketProfileField {
  readonly fieldId: MarketFieldId
  readonly value: string
  /** Nur bei `form: 'list'` gefüllt. */
  readonly items?: readonly string[]
  /** Fehlt, wenn `value` leer ist — sonst Pflicht. */
  readonly evidence?: MarketEvidence
  /** Woher diese eine Aussage stammt (§7.6). Fehlt = `website`. */
  readonly source?: MarketCandidateSource
  /** Auf wie vielen der gelesenen Seiten sie steht (§7.4). */
  readonly frequency?: MarketFrequency
}

/**
 * DER BRAND-CHECK-SCORE EINES KANDIDATEN (§7.3) — der BESTEHENDE Score des
 * Brand-Checks (`brand_checks.score`/`band`), NICHT ein zweiter.
 *
 * ── WARUM `band` HIER EINE ZEICHENKETTE IST ──────────────────────────────
 * Die sieben Bänder gehören `packages/brand`
 * (`BRAND_SCORE_BANDS`/`brandScoreBand`), und `market` importiert `brand`
 * nicht (CONCEPT A14, Plan §2.1) — die Kopplung wird ein EXPLIZITER Vertrag
 * (M3), kein relativer Sprung. Bis dahin reist das Band als Wert, und die
 * ÜBERSETZUNG des Wortes kommt von aussen herein (`resolveBandLabel`), damit
 * in diesem Layer kein `brand.*`-Schlüssel steht.
 *
 * `checkId` ist die Adresse des Ergebnisses (`/brand-check/<id>`): ein Score
 * ohne den Weg zu seiner Begründung wäre eine Note ohne Zeugnis.
 */
export interface MarketBrandCheck {
  readonly score: number
  readonly band: string
  readonly checkId: string
}

export type MarketCompetitorStatus = 'pending' | 'reading' | 'fetched' | 'excluded' | 'failed'

/**
 * WARUM EIN WETTBEWERBER NICHT AUSGEWERTET WIRD. Die Gründe sind AUFZÄHLBAR,
 * weil der Kunde sie in ehrlichen Worten lesen soll (§2.3) — ein freier Text
 * vom Server wäre in der zweiten Sprache nicht übersetzt.
 */
export type MarketExclusionReason = 'robots' | 'tdm' | 'noText' | 'unreachable' | 'withdrawn'

/**
 * WOFÜR EIN KANDIDAT IM VERGLEICH STEHT (MV1 M4, Plan §7.2 Nr. 2).
 *
 * `competitor` ist der Normalfall und zählt gegen `MARKET_COMPETITORS_MAX`.
 * `self` ist die EIGENE alte Website im Relaunch-Fall — dieselbe Mechanik
 * (Abruf, Marktprofil, Belege), aber eine andere ROLLE: sie ist kein
 * Mitbewerber, sondern der Vorher-Zustand derselben Marke.
 *
 * ── WARUM DAS NICHT `sourceKind` SEIN KANN ────────────────────────────────
 * `sourceKind` sagt, WOHER die Aussagen kommen (Website, Foundation,
 * Bibliothek, freigegebene Marke). Die Rolle sagt, WESSEN Aussagen es sind.
 * Beide Fragen sind unabhängig: die alte eigene Website ist `website` +
 * `self`, ein zweites eigenes Branding ist `foundation` + `self`, und die
 * Website eines Mitbewerbers ist `website` + `competitor`. Ein Wert, der
 * beides gleichzeitig ausdrücken müsste, ginge beim ersten dieser drei Fälle
 * kaputt.
 *
 * FOLGEN, die an dieser Zeile hängen (§2.3 „Feld = Wettbewerber"):
 * `self` zählt NICHT gegen den Fünfer-Deckel, erscheint NICHT in
 * Konventionen/Überschneidungen/freien Stellen und geht dem Modell gar nicht
 * erst zu — sonst wäre die eigene alte Website eine Stimme im Feld, und jede
 * Quote („3 von 4 sagen das") zählte uns selbst mit.
 */
export type MarketCandidateRole = 'competitor' | 'self'

export const MARKET_CANDIDATE_ROLES: readonly MarketCandidateRole[] = ['competitor', 'self']

export interface MarketCompetitor {
  readonly id: string
  /** Kommt als VORSCHLAG aus `a.competitors` — die Adresse trägt der Kunde ein. */
  readonly name: string
  readonly url: string
  readonly status: MarketCompetitorStatus
  readonly excludedReason?: MarketExclusionReason
  /** Welche Seiten gelesen wurden — die Belege zeigen darauf. */
  readonly pagesRead?: readonly string[]
  readonly fetchedAt?: string
  /** Welche der vier Quellen (§7.2). Fehlt = `website`, der Normalfall. */
  readonly source?: MarketCandidateSource
  /** Bei `foundation`/`library`/`shared`: der gewählte Eintrag. */
  readonly sourceRefId?: string
  /** Wettbewerber oder eigene alte Website (§7.2 Nr. 2). Fehlt = `competitor`. */
  readonly role?: MarketCandidateRole
  /** Der Brand-Check dieser Marke (§7.3) — fehlt, solange keiner vorliegt. */
  readonly brandCheck?: MarketBrandCheck
}

/**
 * IST DAS DIE EIGENE ALTE WEBSITE? Fehlt die Rolle, ist es ein Wettbewerber —
 * das ist der Bestand aus M1–M3 und der Normalfall.
 */
export function marketIsSelfCandidate(candidate: { readonly role?: string }): boolean {
  return candidate.role === 'self'
}

/**
 * DAS FELD — alle Kandidaten OHNE die eigene alte Website (§2.3: „Feld =
 * Wettbewerber").
 *
 * Sie steht an EINER Stelle und wird von vier Aufrufern gebraucht (Deckel,
 * Modell-Eingabe, Matrix, Quoten). Vier eigene `filter`-Zeilen wären vier
 * Stellen, an denen die Regel beim nächsten Feld vergessen wird — und ein
 * vergessener Filter fällt nicht auf: die Zahlen sind dann nur um eins zu
 * gross.
 *
 * `role?: string` und nicht `MarketCandidateRole`: die Funktion wird auch auf
 * ROHE Appwrite-Zeilen angewandt (dort ist die Spalte ein varchar), und ein
 * `as`-Cast an der Aufrufstelle wäre eine Behauptung über einen Wert, den
 * genau diese Funktion gerade prüft.
 */
export function marketFieldCandidates<T extends { readonly role?: string }>(
  candidates: readonly T[],
): T[] {
  return candidates.filter(candidate => !marketIsSelfCandidate(candidate))
}

/**
 * EIN WÄHLBARER EINTRAG EINER NICHT-WEBSITE-QUELLE (§7.2 Nr. 2–4).
 *
 * `label` und `hint` sind INHALT (Markenname, Branche, Adresse) und laufen
 * nie über i18n. Was die QUELLE bedeutet — „nur mit Zustimmung sichtbar",
 * „Marktprofil folgt" — ist dagegen ein Satz von uns und steht am
 * Quellen-Wähler, nicht am Eintrag: sonst stünde derselbe Hinweis sechsmal
 * in den Daten und in der zweiten Sprache gar nicht.
 */
export interface MarketSourceOption {
  readonly id: string
  readonly label: string
  readonly hint?: string
  /** Nur bei Einträgen, die eine echte Adresse haben (eigene alte Website). */
  readonly url?: string
  /**
   * NUR BEI `library`: der Tag der Handprüfung (`YYYY-MM-DD`).
   *
   * Er ist der Grund, warum man einem Bibliotheks-Eintrag glauben darf — ein
   * Mensch hat seine Zitate am Original gehalten (`marketLibrary.ts`). Die
   * anderen beiden Quellen haben nichts dergleichen: eine eigene Marke ist
   * BESCHLOSSEN, eine freigegebene gehört jemand anderem.
   */
  readonly verifiedAt?: string
  /**
   * NUR BEI `library`: die Prüfung ist älter als 90 Tage (Runbook Schritt 4).
   *
   * Gerechnet vom SERVER (`marketLibrarySourceOption`), nicht im Browser: an
   * der Tagesgrenze kämen SSR und Client sonst zu zwei verschiedenen Antworten.
   */
  readonly stale?: boolean
}

/** Das Marktprofil EINES Wettbewerbers. */
export interface MarketProfile {
  readonly competitorId: string
  readonly fields: readonly MarketProfileField[]
}

/** Ein Beleg MIT Absender — für die drei Listen und die Profil-Karten. */
export interface MarketCitation {
  readonly competitorId: string
  readonly competitorName: string
  readonly evidence: MarketEvidence
  /** Auf wie vielen der gelesenen Seiten dieser Absender es sagt (§7.4). */
  readonly frequency?: MarketFrequency
}

export type MarketClaimKind = 'convention' | 'overlap' | 'whitespace'

/**
 * EIN EINTRAG DER DREI LISTEN (§2.3 Schritt 4).
 *
 * `statement` steht in der INHALTSSPRACHE der Marke und läuft NICHT über
 * i18n — es ist der Satz, den jemand gesagt hat (oder bei `whitespace` die
 * Frage, die niemand beantwortet). Die Zahlen daneben („3 von 3 sagen das")
 * sind Oberfläche und tragen Platzhalter.
 */
export interface MarketClaimEntry {
  readonly id: string
  readonly fieldId: MarketFieldId
  readonly statement: string
  /** Nur bei `convention`/`overlap`: wie viele im Feld sagen es, von wie vielen. */
  readonly sharedBy?: number
  readonly of?: number
  readonly citations?: readonly MarketCitation[]
  /**
   * Wie oft die Aussage im Feld über SEITEN wiederkehrt (§7.4) — zwei Zahlen
   * neben `sharedBy`/`of`, weil sie eine ANDERE Frage beantworten: „wie viele
   * Marken" ist Breite, „auf wie vielen Seiten" ist Gewicht. Eine Marke, die
   * ihren Satz auf jeder Seite wiederholt, meint ihn anders als eine, die ihn
   * einmal im Fussbereich stehen hat.
   */
  readonly frequency?: MarketFrequency
}

export interface MarketClaimList {
  readonly kind: MarketClaimKind
  readonly entries: readonly MarketClaimEntry[]
}

/**
 * EIN MARKT-BEFUND (§2.3, Art `market` im Befund-Speicher des brand-Layers).
 *
 * EIN EIGENES FELD, nie zwei: ein Markt-Befund richtet sich IMMER an die
 * eigene Marke („euer Satz klingt wie …"), nie an einen Dritten — anders als
 * ein `conflict`, der zwei eigene Felder gegeneinander stellt. Und er nennt
 * keinen Wettbewerber: § 6 UWG greift, sobald ein Mitbewerber erkennbar ist
 * (§2.9 Nr. 5).
 */
export type MarketFindingStatus = 'open' | 'accepted' | 'dismissed'

export interface MarketFinding {
  readonly id: string
  /** Slot-Id des EIGENEN Feldes. */
  readonly slotId: string
  readonly why: string
  /** Bei Markt-Befunden Pflicht — ein Hinweis ohne Vorschlag ist eine Sorge. */
  readonly suggestion: string
  readonly status: MarketFindingStatus
}

/**
 * DIE KI-AUSSENSICHT EINER MARKE (§7.5, Davids Entscheidung GEGEN die
 * Empfehlung — deshalb mit den schärfsten Leitplanken im ganzen Vertrag).
 *
 * ── SIE IST EINE EIGENE SICHT, KEINE ZWEITE SPALTE IM PROFIL ─────────────
 * Sie steht deshalb NEBEN `MarketProfile` und nicht darin: „Website sagt" und
 * „KI-Antworten sagen" dürfen sich nirgends berühren (§7.5 a/d). Ein Feld,
 * das beides in einem Wert trüge, wäre nicht mehr trennbar — und die
 * ungeprüfte Aussage sähe aus wie die belegte.
 *
 * ── SIE TRÄGT KEINEN BELEG, UND ZWAR ABSICHTLICH ─────────────────────────
 * Es GIBT keinen: eine Modellantwort ist keine Quelle. Statt eines Zitats
 * trägt sie den Konsens (`agree` von `asked`); übernommen wird nur, was
 * mindestens zwei Modelle übereinstimmend sagen (§7.5 b). Kein Einfluss auf
 * den Brand-Score (§7.5 c) — der bleibt belegbasiert.
 */
export interface MarketAiStatement {
  readonly fieldId: MarketFieldId
  readonly value: string
  /** Wie viele der befragten Modelle das übereinstimmend sagten. */
  readonly agree: number
  readonly asked: number
}

/** `competitorId` ist bei der eigenen Marke `MARKET_OWN_ID`. */
export interface MarketAiView {
  readonly competitorId: string
  readonly statements: readonly MarketAiStatement[]
}

/**
 * DIE EIGENE MARKE ALS SPALTEN-ID. Sie braucht eine, weil die KI-Aussensicht
 * auch für UNS erhoben wird (§7.5 d: der Unterschied zwischen beiden IST der
 * Befund). Der Unterstrich hält sie von jeder Row-Id fern — Row-Ids beginnen
 * nie mit `_`, dasselbe Muster wie `notificationScope`.
 */
export const MARKET_OWN_ID = '_own'

/** Die KI-Aussagen EINER Marke holen. */
export function marketAiStatement(
  views: readonly MarketAiView[],
  competitorId: string,
  fieldId: MarketFieldId,
): MarketAiStatement | undefined {
  return views
    .find(view => view.competitorId === competitorId)
    ?.statements.find(statement => statement.fieldId === fieldId)
}

/**
 * Der Lauf-Zustand eines Wettbewerbers (Oberfläche des Fortschritts, §2.11
 * Nr. 2), seit M0b mit der ERWEITERTEN Kette aus §7.4.
 *
 * JEDER SCHRITT IST EINE TATSACHE, KEIN VERSPRECHEN: die Zeile erscheint
 * erst, wenn er wahr ist. `llmsTxt: 'missing'` ist deshalb ein eigener Wert
 * und nicht `undefined` — „nicht vorhanden" ist eine geprüfte Auskunft über
 * die Website, „noch nicht nachgesehen" ist keine.
 */
export interface MarketRunStep {
  readonly competitorId: string
  readonly name: string
  readonly status: MarketCompetitorStatus
  readonly robotsChecked: boolean
  readonly pagesRead: number
  readonly excludedReason?: MarketExclusionReason
  /** Wie viele Adressen die sitemap.xml nannte (§7.4). */
  readonly sitemapUrls?: number
  /** Die Selbstbeschreibung für KI-Suchen — wo vorhanden die dichteste Quelle. */
  readonly llmsTxt?: 'found' | 'missing'
  /** schema.org Organization/description/sameAs gelesen. */
  readonly jsonLd?: boolean
  /** Der Brand-Check wurde mit angestossen (§7.3, derselbe 7-Tage-Cache). */
  readonly brandCheckStarted?: boolean
}

/** Der eigene Abschnitt „KI-Aussensicht" im Lauf (§7.5). */
export interface MarketAiRunStep {
  readonly agree: number
  readonly asked: number
  /** Unter dem Konsens-Deckel (< 2 übereinstimmend) wird verworfen, nicht gezeigt. */
  readonly adopted: boolean
}

export type MarketRunPhase = 'idle' | 'running' | 'comparing' | 'done'

/** Der Bericht je Stand (§2.6 `market_reports`). */
export interface MarketReport {
  readonly createdAt: string
  /** Hash über Foundation-Revisionen, URL-Liste und Abrufstände (§2.3 Nr. 5). */
  readonly revisionKey: string
  readonly own: readonly MarketProfileField[]
  readonly competitors: readonly MarketCompetitor[]
  readonly profiles: readonly MarketProfile[]
  readonly claims: readonly MarketClaimList[]
  readonly findings: readonly MarketFinding[]
  /** Die ungeprüfte Aussensicht — getrennt gespeichert, getrennt gezeigt (§7.5). */
  readonly aiViews?: readonly MarketAiView[]
}

/**
 * DER RELAUNCH-VERGLEICH (§7.2 Nr. 2, „der stärkste Relaunch-Fall: alte
 * Website gegen neue Foundation").
 *
 * FÜNF ZUSTÄNDE, WEIL VIER ZU WENIG SIND: `onlyFoundation` ist der ganze
 * Nutzen dieser Quelle — „das sagt eure neue Foundation, eure Website aber
 * noch nicht". Ihn mit `different` zu verschmelzen hiesse, genau die Liste zu
 * verlieren, wegen der es den Screen gibt. `onlyWebsite` ist der Gegenfall
 * (die Website sagt etwas, das ihr nicht mehr bestätigt) und `neither` sagt
 * über die Kategorie dasselbe wie ein leeres Feld sonst auch.
 */
export type MarketRelaunchState = 'same' | 'different' | 'onlyFoundation' | 'onlyWebsite' | 'neither'

/**
 * Der Vergleich normalisiert BEWUSST nur Schreibweise, Leerraum und einen
 * Schlusspunkt — nicht Bedeutung. „Wir rösten in kleinen Mengen." und „Kleine
 * Röstmengen" bleiben `different`, und das ist richtig so: ob zwei Sätze
 * dasselbe MEINEN, entscheidet der Mensch vor dem Bildschirm. Eine Funktion,
 * die hier klüger sein will, meldet Gleichheit, wo eine Entscheidung ansteht.
 */
export function marketRelaunchState(
  website: MarketProfileField | undefined,
  foundation: MarketProfileField | undefined,
): MarketRelaunchState {
  const left = normalizeForCompare(website?.value ?? '')
  const right = normalizeForCompare(foundation?.value ?? '')
  if (!left && !right) return 'neither'
  if (!left) return 'onlyFoundation'
  if (!right) return 'onlyWebsite'
  return left === right ? 'same' : 'different'
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
}

/** Das Feld einer Profil-Liste holen — fehlt es, gilt „nicht formuliert". */
export function marketField(
  fields: readonly MarketProfileField[],
  fieldId: MarketFieldId,
): MarketProfileField | undefined {
  return fields.find(field => field.fieldId === fieldId)
}
