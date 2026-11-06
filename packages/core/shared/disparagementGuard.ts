/**
 * DER § 6 UWG-RIEGEL — PUR, damit die Gegenprobe ohne Modell, ohne Route und
 * ohne Ablage läuft.
 *
 * ── WARUM IM FUNDAMENT UND NICHT IM PRODUKT (BI1 I1a) ─────────────────────
 * Gebaut wurde er für den Marktvergleich (`market`, MV1 M4). Brand Insights
 * (`insights`) stellt dieselbe Frage an einen redaktionellen Text, und ein
 * Produkt-Layer importiert keinen anderen (CONCEPT.md A14). Abschreiben wäre
 * der teurere Fehler: zwei Riegel driften, und der schwächere gewinnt. Er
 * steht deshalb hier — EINE Regel, die jeder Layer per Auto-Import kennt.
 *
 * WAS HIER NICHT STEHEN DARF: Produktwissen. Diese Datei kennt keine
 * Marktfelder, keine Slot-Ids und keinen Beitrags-Zustand — sie kennt Namen,
 * Domains und Texte. Woher die eigenen Texte des Kunden kommen (`ownTexts`),
 * entscheidet der aufrufende Layer.
 *
 * ── WAS ER VERHINDERT ─────────────────────────────────────────────────────
 * Vergleichende Werbung ist in Deutschland erlaubt, solange sie den
 * Wettbewerber nicht HERABSETZT (§ 6 Abs. 2 Nr. 5 UWG). Die Produkte darüber
 * gehen bewusst noch einen Schritt weiter: sie erzeugen **keinen
 * veröffentlichungsfähigen Vergleichs-Claim**. Ein Markt-Befund sagt „euer
 * Satz klingt wie zwei andere im Feld" — nie „anders als X". Damit kann der
 * Kunde einen Vorschlag ohne Rückfrage verwenden, und genau das ist der
 * Produktwert.
 *
 * Zwei Dinge werden deshalb geprüft:
 *
 *  (a) NENNT DER TEXT EINEN WETTBEWERBER? — sein Name, ein Namens-Teil ab vier
 *      Zeichen, oder seine Domain (auch ein Domain-Label). Wer „anders als
 *      Pacific" schreibt, hat einen Dritten erkennbar gemacht, auch ohne den
 *      vollen Firmennamen.
 *  (b) SETZT DER TEXT HERAB? — eine Wortliste in beiden Inhaltssprachen.
 *
 * ── VERWORFEN, NICHT UMFORMULIERT ─────────────────────────────────────────
 * Ein Treffer LÖSCHT das Element. Umschreiben hiesse, dem Modell den Satz zu
 * korrigieren, den es gerade falsch gebaut hat — mit demselben Modell. Ein
 * fehlender Befund ist ein verlorener Hinweis; ein durchgelassener ist eine
 * Abmahnung.
 *
 * ── DER STÄRKSTE TEIL DES RIEGELS STEHT NICHT HIER ────────────────────────
 * Der Vergleichs-Prompt des Marktvergleichs bekommt die Wettbewerber gar nicht
 * mit NAMEN, sondern nur als `c1 … c5`. Ein Modell kann einen Namen also nicht
 * einmal versehentlich abschreiben — es kennt ihn nicht. Diese Datei ist das
 * Netz darunter: sie fängt den Fall, dass ein Name ÜBER DEN ROHTEXT ins Modell
 * gelangt ist (ein Zitat nennt oft die eigene Marke) oder dass jemand die
 * Anonymisierung später „vereinfacht".
 *
 * ── GESPERRT WIRD, WAS UNTERSCHEIDET (nachgeschärft in MV1 M4) ────────────
 * Bis M3 galt: JEDES Namens-Token ab vier Zeichen ist gesperrt. Der Preis war
 * als „lieber zu viel als zu wenig" verbucht, und in der Praxis war er zu
 * hoch: ein Wettbewerber „Kailua Coffee" sperrte `coffee` in JEDEM Vorschlag
 * — in der Kaffee-Kategorie also das Wort, um das es geht. Der Riegel
 * verwarf damit systematisch die brauchbarsten Befunde und liess ausgerechnet
 * die Kategorie-Sprache nicht mehr benennen.
 *
 * Gesperrt sind seither drei Dinge:
 *  (a) der VOLLE normalisierte Name (auch zusammengezogen: `kailuacoffee`),
 *  (b) die Domain und ihre Labels (`pacificbean`),
 *  (c) UNTERSCHEIDENDE Tokens — Namens-Teile ab vier Zeichen, die WEDER in
 *      der generischen Wortliste stehen (Rechtsformen, Kategorie- und
 *      Branchenwörter de/en) NOCH in den eigenen bestätigten Texten des
 *      Kunden vorkommen.
 *
 * Die zweite Hälfte von (c) ist der eigentliche Zuschnitt: ein Wort, das der
 * Kunde SELBST über seine eigene Marke sagt, kann keinen Dritten erkennbar
 * machen. Sagt seine Kategorie „Rösterei", darf ein Befund „Rösterei" sagen —
 * auch wenn ein Wettbewerber so heisst. Was NUR im fremden Namen vorkommt,
 * bleibt gesperrt: genau das ist die Unterscheidungskraft, um die es § 6 UWG
 * geht.
 *
 * Fail-closed bleibt der Riegel trotzdem: ohne eigene Texte (leerer Kunde,
 * früher Stand) fällt (c) auf die generische Liste zurück, und der volle Name
 * ist IMMER gesperrt — auch wenn er kurz ist und auch, wenn er zufällig in
 * einem eigenen Satz vorkommt.
 */

/**
 * WORTSTAMM-NORMALISIERUNG: Umlaute, ß, Akzente und Kleinschreibung.
 *
 * `Müller` und `mueller` sind derselbe Name; ein Filter, der das nicht sieht,
 * ist mit einer Tastatur-Umschreibung zu umgehen. Beides wird auf DIESELBE
 * Form gebracht (`ue`), nicht nur die Akzente entfernt: sonst wären `mller`
 * und `mueller` zwei verschiedene Dinge.
 */
export function normalizeForFilter(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Die kürzeste Zeichenkette, die als Namens-TEIL noch identifiziert. */
export const NAME_TOKEN_MIN = 4

/**
 * WAS IN EINEM FIRMENNAMEN NIEMANDEN IDENTIFIZIERT — Rechtsformen,
 * Bindewörter UND Kategorie-/Branchenwörter (de + en).
 *
 * ── WARUM DIE KATEGORIEWÖRTER DAZUGEHÖREN (M4) ───────────────────────────
 * „Coffee", „Studio", „Agentur", „Supply" sind die Wörter, mit denen eine
 * BRANCHE sich selbst benennt — und deshalb stehen sie in jedem zweiten
 * Firmennamen dieser Branche. Ein Wettbewerber, der eines davon im Namen
 * trägt, macht es nicht zu seinem Erkennungszeichen; er macht es nur
 * unbrauchbar für jeden Satz über die Kategorie. Genau dieser Fall hat den
 * Riegel in M3 zu scharf gemacht.
 *
 * Bewusst KURZ und WÖRTLICH gehalten: jedes Wort hier ist ein Loch im Netz,
 * und die Liste darf nur Wörter enthalten, die für sich genommen NIEMANDEN
 * bezeichnen. Ein Markenname, der AUS EINEM SOLCHEN WORT ALLEIN besteht
 * („Supply"), bleibt trotzdem gesperrt — über den vollen Namen (s. Kopf), der
 * diese Liste gar nicht erst befragt.
 */
export const GENERIC_NAME_TOKENS: ReadonlySet<string> = new Set([
  // Rechtsformen und Gesellschaftswörter
  'gmbh', 'mbh', 'ohg', 'kgaa', 'gbr', 'ug', 'ltd', 'limited', 'inc', 'incorporated',
  'corp', 'corporation', 'llc', 'plc', 'company', 'holding', 'holdings', 'group',
  'gruppe', 'partner', 'partners', 'sohn', 'soehne', 'sons',
  // Bindewörter und Artikel
  'und', 'and', 'the', 'der', 'die', 'das', 'von', 'for', 'with',
  // Adress- und Technikwörter
  'www', 'com', 'net', 'org', 'info', 'shop', 'online', 'example', 'test',
  // Kategorie- und Branchenwörter (de + en) — s. Kopf
  'coffee', 'kaffee', 'kaffeeroesterei', 'roesterei', 'roast', 'roasters', 'roastery',
  'cafe', 'kaffeehaus', 'bakery', 'baeckerei', 'kitchen', 'kueche',
  'studio', 'atelier', 'werkstatt', 'agency', 'agentur', 'design', 'branding',
  'marketing', 'werbung', 'media', 'medien', 'creative', 'kreativ',
  'supply', 'trading', 'handel', 'store', 'markt', 'market', 'goods', 'waren',
  'consulting', 'beratung', 'coaching', 'training', 'akademie', 'academy',
  'software', 'digital', 'labs', 'lab', 'tech', 'technik', 'systems', 'solutions',
  'praxis', 'klinik', 'clinic', 'care', 'pflege', 'health', 'gesundheit',
  'immobilien', 'realestate', 'bau', 'build', 'haus', 'home', 'wohnen',
  'reisen', 'travel', 'tours', 'hotel', 'restaurant', 'bistro', 'bar',
  'sport', 'fitness', 'yoga', 'schule', 'school', 'institut', 'institute',
  'verlag', 'press', 'foto', 'photo', 'photography', 'film', 'music', 'musik',
])

/**
 * Die Domain-Endungen, die als LABEL nichts identifizieren. Mehrteilige
 * Endungen (`co.uk`) sind darin enthalten, weil jedes Label einzeln geprüft
 * wird.
 */
const DOMAIN_STOP_LABELS = new Set([
  'www', 'com', 'net', 'org', 'info', 'biz', 'shop', 'de', 'at', 'ch', 'io', 'app',
  'co', 'uk', 'eu', 'us', 'nl', 'fr', 'it', 'es', 'dev', 'supply', 'example', 'test', 'local',
])

/**
 * DIE HERABSETZENDEN AUSDRÜCKE (de + en). Geprüft wird JEDER Text, den ein
 * Kunde am Ende in seiner eigenen Kommunikation verwendet — ein Befund des
 * Marktvergleichs ebenso wie ein Titel, ein Vorspann oder ein Fliesstext von
 * Brand Insights.
 *
 * Geprüft wird auf WORTGRENZE nach der Normalisierung (`billiger` trifft
 * `billig` nicht — dafür steht es selbst in der Liste, wo es gemeint ist).
 * Eine Stammform-Erkennung wäre hier die falsche Genauigkeit: sie fiele über
 * `schlechthin` und liesse `Abzocke` durch.
 */
export const DISPARAGING_TERMS: readonly string[] = [
  // Deutsch
  'billig', 'billiger', 'billigste', 'schlecht', 'schlechter', 'schlechteste',
  'veraltet', 'altbacken', 'unseriös', 'unserioes', 'abzocke', 'betrug', 'betrueger',
  'dilettantisch', 'lieblos', 'austauschbar', 'minderwertig', 'schwaecher', 'schwächer',
  'rueckstaendig', 'rückständig', 'ueberteuert', 'überteuert', 'unfaehig', 'unfähig',
  'laecherlich', 'lächerlich', 'primitiv', 'schwammig', 'nichtssagend',
  // Englisch
  'worse', 'worst', 'cheap', 'cheaper', 'cheapest', 'outdated', 'inferior', 'scam',
  'sloppy', 'lazy', 'dishonest', 'shady', 'overpriced', 'incompetent', 'ridiculous',
  'clueless', 'generic', 'bland', 'lousy', 'mediocre', 'obsolete', 'dated',
]

const DISPARAGING_SET = new Set(DISPARAGING_TERMS.map(normalizeForFilter))

/** Woran ein Element gescheitert ist — Zahl fürs Log, nie der Text. */
export type DisparagementReason = 'competitor_name' | 'competitor_domain' | 'disparagement'

export interface GuardCandidate {
  readonly name: string
  /** Leer bei den Nicht-Website-Quellen (Foundation, Bibliothek). */
  readonly url?: string
}

/**
 * DER RIEGEL, EINMAL GEBAUT UND N-MAL GEFRAGT.
 *
 * Er wird je Bericht EINMAL aus den Kandidaten gebaut und dann über jedes
 * erzeugte Element gezogen. Ein `check` je Aufruf neu zu bauen wäre bei fünf
 * Kandidaten × vier Listen dieselbe Rechnung dreissigmal.
 */
export interface DisparagementGuard {
  /** `null` = sauber. Sonst der Grund, aus dem das Element verworfen wird. */
  readonly check: (text: string) => DisparagementReason | null
  /** Die Sperrliste — nur für Tests und die Erklärung im Beweis. */
  readonly nameTokens: ReadonlySet<string>
  readonly domainTokens: ReadonlySet<string>
}

/**
 * DIE WÖRTER, DIE DER KUNDE SELBST ÜBER SEINE MARKE SAGT.
 *
 * Aus ihnen entsteht die zweite Ausnahme von (c): was der Kunde über SICH
 * gesagt hat, kann keinen Dritten erkennbar machen. WOHER diese Texte kommen,
 * weiss diese Datei bewusst nicht — im Marktvergleich sind es die bestätigten
 * Foundation-Felder, anderswo etwas anderes; hier sind es Zeichenketten.
 *
 * Kurze Wörter fallen raus (unter der Token-Schwelle sperrt der Riegel
 * ohnehin nicht), damit die Menge klein und die Ausnahme scharf bleibt.
 */
function ownTokensOf(texts: readonly string[]): Set<string> {
  const tokens = new Set<string>()
  for (const text of texts) {
    for (const part of normalizeForFilter(text).split(' ')) {
      if (part.length >= NAME_TOKEN_MIN) tokens.add(part)
    }
  }
  return tokens
}

/**
 * DIE SPERRLISTE EINES NAMENS — voller Name IMMER, Teile nur, wenn sie
 * UNTERSCHEIDEN (s. Kopf, Regel (a) und (c)).
 */
function nameTokensOf(name: string, generic: ReadonlySet<string>): string[] {
  const normalized = normalizeForFilter(name)
  if (!normalized) return []
  const tokens: string[] = []
  // (a) Der GANZE Name (ohne Trenner) zählt immer — auch wenn er kurz ist:
  // „Ada" identifiziert eine Marke, obwohl das Token unter der Mindestlänge
  // liegt, und „Nike" ist ein Wort, das nur diese eine Marke meint. Er wird
  // BEWUSST nicht gegen die generische Liste geprüft: eine Marke, die sich
  // genau wie ihre Kategorie nennt, hat diesen Namen trotzdem.
  const whole = normalized.replace(/\s+/g, '')
  if (whole.length >= 3) tokens.push(whole)
  if (normalized.includes(' ')) tokens.push(normalized)
  // (c) Die TEILE: Vier-Zeichen-Schwelle UND Unterscheidungskraft.
  for (const part of normalized.split(' ')) {
    if (part.length < NAME_TOKEN_MIN) continue
    if (generic.has(part)) continue
    tokens.push(part)
  }
  return tokens
}

function domainTokensOf(rawUrl: string): string[] {
  let host: string
  try {
    host = new URL(rawUrl).hostname.toLowerCase()
  }
  catch {
    return []
  }
  if (!host) return []
  const tokens = [host]
  // `www.` weg — sonst fände der Filter `www.marke.de` und nicht `marke.de`.
  const bare = host.replace(/^www\./, '')
  if (bare !== host) tokens.push(bare)
  for (const label of bare.split('.')) {
    if (label.length < NAME_TOKEN_MIN) continue
    if (DOMAIN_STOP_LABELS.has(label)) continue
    tokens.push(label)
  }
  return tokens.map(normalizeForFilter).filter(token => token.length >= 3)
}

export interface GuardOptions {
  /**
   * Die eigenen bestätigten Texte des Kunden. Ihre Wörter sind von der
   * Namens-Sperre ausgenommen — s. Kopf, Regel (c). Welche Texte das sind,
   * entscheidet der aufrufende Layer, nicht diese Datei.
   */
  readonly ownTexts?: readonly string[]
}

/**
 * DEN RIEGEL AUS DEN KANDIDATEN BAUEN.
 *
 * Die EIGENE Marke gehört ausdrücklich NICHT in `candidates`: der Text redet
 * über sie, und ein Satz, der ihren Namen nennt, ist genau richtig. Ihre TEXTE
 * gehören dagegen sehr wohl herein (`ownTexts`) — sie entscheiden mit, welches
 * Wort eines fremden Namens überhaupt unterscheidet.
 */
export function createDisparagementGuard(
  candidates: readonly GuardCandidate[],
  options: GuardOptions = {},
): DisparagementGuard {
  const nameTokens = new Set<string>()
  const domainTokens = new Set<string>()

  // Generische Wörter UND eigene Wörter bilden zusammen die Ausnahme — die
  // eine Menge ist gepflegt, die andere kommt vom Kunden. Sie wird EINMAL je
  // Bericht gebaut, nicht je Kandidat.
  const generic = new Set(GENERIC_NAME_TOKENS)
  for (const token of ownTokensOf(options.ownTexts ?? [])) generic.add(token)

  for (const candidate of candidates) {
    for (const token of nameTokensOf(candidate.name, generic)) nameTokens.add(token)
    if (candidate.url) for (const token of domainTokensOf(candidate.url)) domainTokens.add(token)
  }

  function check(text: string): DisparagementReason | null {
    const normalized = normalizeForFilter(text)
    if (!normalized) return null
    const words = normalized.split(' ')
    const wordSet = new Set(words)

    // (b) zuerst: eine Herabsetzung ist der schwerere Vorwurf, und ein Text
    // kann beides sein — die Meldung soll dann die schärfere sein.
    for (const word of wordSet) {
      if (DISPARAGING_SET.has(word)) return 'disparagement'
    }
    // Mehrwortige Einträge der Liste (heute keine, morgen vielleicht).
    for (const term of DISPARAGING_SET) {
      if (term.includes(' ') && normalized.includes(term)) return 'disparagement'
    }

    // (a) Domain vor Name: eine Adresse im Text ist der eindeutigere Treffer.
    // Der Vergleich läuft über die ZUSAMMENGEZOGENE Form, weil
    // `normalizeForFilter` den Punkt zu einem Leerzeichen macht — „marke.de"
    // steht danach als „marke de" da, und `marke de` fände `hausmarke de`
    // nicht als Wort. Deshalb wird zusätzlich ohne Trenner geprüft.
    const joined = words.join('')
    for (const token of domainTokens) {
      const bare = token.replace(/ /g, '')
      if (wordSet.has(token) || (bare.length >= NAME_TOKEN_MIN && joined.includes(bare))) {
        return 'competitor_domain'
      }
    }
    for (const token of nameTokens) {
      if (token.includes(' ')) {
        if (normalized.includes(token)) return 'competitor_name'
        continue
      }
      // Als WORT — und zusätzlich in der zusammengezogenen Form, weil ein
      // Name auch ohne Leerzeichen auftaucht („KailuaCoffee", ein Hashtag,
      // eine Adresse). Die Vier-Zeichen-Schwelle gilt dort weiter: ohne sie
      // fände `ada` jedes „Kanada".
      if (wordSet.has(token)) return 'competitor_name'
      if (token.length >= NAME_TOKEN_MIN && joined.includes(token)) return 'competitor_name'
    }
    return null
  }

  return { check, nameTokens, domainTokens }
}

/**
 * DER RIEGEL ÜBER MEHRERE TEXTE EINES ELEMENTS.
 *
 * Ein Element besteht fast nie aus EINEM Text: ein Markt-Befund aus Begründung
 * UND Vorschlag, ein Beitrag aus Titel, Vorspann und Fliesstext. Fällt EIN
 * Teil, fällt das ganze Element — ein Befund mit gestrichenem Vorschlag wäre
 * ein halber Befund, und ein Beitrag mit gestrichenem Titel gar keiner.
 */
export function checkGuardedTexts(
  guard: DisparagementGuard,
  texts: readonly (string | undefined)[],
): DisparagementReason | null {
  for (const text of texts) {
    if (!text) continue
    const reason = guard.check(text)
    if (reason) return reason
  }
  return null
}
