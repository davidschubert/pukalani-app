/**
 * DIE DATENSCHUTZ-BEDINGUNGEN JEDES BRAND-AUFRUFS — an EINER Stelle.
 *
 * `zdr` (nur Anbieter mit Zero-Data-Retention) und `dataCollection: 'deny'`
 * sind der Grund, warum Markeninhalte überhaupt über einen fremden Anbieter
 * gehen dürfen. `allowFallbacks: false` ist die Sicherung dahinter: ohne sie
 * weicht OpenRouter bei Last auf einen Anbieter AUSSERHALB dieser Bedingungen
 * aus, und der Lauf gelänge — mit genau dem Ergebnis, das die zwei Felder
 * verhindern sollen. Lieber „gerade nicht verfügbar".
 *
 * ── WARUM JETZT EINE DATEI UND NICHT DREI KONSTANTEN ──────────────────────
 * Bis zum Brand-Check gab es zwei Kopien mit einer geschriebenen Begründung
 * („die eine hängt an der Stream-Naht, die andere am JSON-Transport") und dem
 * Zusatz, dass die drei WERTE nie abweichen dürfen. Mit dem dritten Aufrufer
 * ist das keine tragfähige Verabredung mehr: eine Regel, die drei Dateien
 * gleichzeitig einhalten müssen, ohne dass irgendetwas es prüft, ist keine
 * Regel, sondern eine Hoffnung. Die Kopplung, die die alte Begründung fürchtet
 * („beim nächsten Umbau versehentlich gelöst"), ist genau die, die hier
 * gewollt ist: WER auch immer ein Modell ruft, ruft es unter diesen
 * Bedingungen.
 *
 * Wer für einen künftigen Aufrufer ANDERE Bedingungen braucht, schreibt sie
 * dort als eigene Konstante hin — mit einem Satz, warum. Ein zusätzliches Feld
 * hier hätte still auf alle drei gewirkt.
 *
 * ── UND SEIT AI1 AUCH EIN ORT (2026-11-09, Davids Entscheidung) ──────────
 * `zdr: true` sagt „der Anbieter speichert nichts", es sagt NICHTS darüber,
 * WO er rechnet. Ungepinnt bediente **Amazon Bedrock** unseren Textweg, und
 * welche Region das war, stand nirgends. Deshalb nennt diese Konstante jetzt
 * BEIDE EU-Endpunkte des Textmodells. Gemessen am 2026-11-09 (Plan § 18,
 * neun echte Aufrufe): `amazon-bedrock/eu-west-1` und `google-vertex/europe`
 * antworten beide unter `zdr` + `deny` + `allowFallbacks: false`, einzeln und
 * zusammen in EINER Allowlist.
 *
 * ZWEI EINTRÄGE UND NICHT EINER — das ist der Unterschied zur Bild-/Video-
 * Fassung unten, und er ist beabsichtigt: mit `allowFallbacks: false` macht
 * ein einzelner Pin den Ausfall EINES Anbieters zum Ausfall des ganzen
 * Textwegs. Zwei EU-Endpunkte verschiedener Anbieter geben Redundanz
 * INNERHALB der EU, ohne die Klemme zu lockern — OpenRouter darf nur zwischen
 * ihnen wählen, nach draußen führt kein Weg (Gegenprobe: ein erfundener Tag
 * antwortet 404 „No allowed providers are available", es gibt also keinen
 * stillen Rückfall).
 *
 * DER PREIS IST GEMESSEN: jeder REGIONS-gepinnte Endpunkt kostet 10 % mehr
 * als die ortlosen `global`-Endpunkte — für EU und US gleich, wir zahlen
 * also den Zuschlag für „feste Region", nicht für „Europa". Verfügbarkeit, maximale
 * Ausgabe und die Cache-Bepreisung sind auf allen acht Endpunkten identisch;
 * der Pin kostet keine Funktion.
 *
 * WAS ER DAFÜR KOSTET: diese Konstante ist nicht mehr modell-agnostisch. Ein
 * Textmodell OHNE diese zwei Endpunkte läuft hier nicht langsamer, sondern
 * gar nicht (404). Das ist die gewollte Richtung — lieber „gerade nicht
 * verfügbar" als „irgendwo gerechnet" —, aber es ist eine Bedingung an die
 * MODELLWAHL, und die prüft `pnpm ops:ai-models` je konfiguriertem Slug.
 *
 * UND EINE FALLE, DIE NICHT WIEDER AUFKOMMEN SOLL: die Generation-Metadaten
 * von OpenRouter führen ein Feld `data_region`, und es stand bei JEDER Probe
 * auf `"global"` — auch bei dem Vertex-Pin unten, der auf Prod seit Wochen
 * Bild und Video bedient. Das Feld ist eine Richtlinien-Kategorie, nicht der
 * Ort der Rechnung. Der Beleg ist der erzwungene Tag plus die 404er
 * Gegenprobe, nichts anderes.
 *
 * Der Typ bleibt bewusst ungenannt (`as const` statt `: AiProviderRouting`):
 * `AiProviderRouting` liegt im Core und wird per Auto-Import gefunden — ein
 * `import type` quer über die Layer-Grenze wäre der einzige in diesem Ordner.
 */
export const BRAND_PROVIDER_ROUTING = {
  zdr: true,
  dataCollection: 'deny',
  allowFallbacks: false,
  only: ['amazon-bedrock/eu-west-1', 'google-vertex/europe'],
} as const

/**
 * DERSELBE SCHUTZ, EIN ANDERER ORT — die Fassung für die GEMINI-Wege.
 *
 * Seit AI1 (2026-11-09) nennt auch die Basis oben einen Ort; der Unterschied
 * ist also nicht mehr „mit Ort / ohne Ort", sondern WELCHE Endpunkte. Darum
 * heißt diese Konstante nach dem Endpunkt, den sie enthält, und nicht nach
 * einem Modell oder nach „EU": ein Modellwechsel soll den Namen nicht zur
 * Lüge machen.
 *
 * `google-vertex/eu` ist der EU-Endpunkt der Gemini-Modelle, und dort gehen
 * genau die zwei Läufe hin, die KUNDENMATERIAL hinreichen: die
 * **Inspirationslesung** (Bilder, die jemand hochgeladen hat) und das
 * **Videolesen** der Redaktion (K5). Davids Entscheidung vom 2026-10-27
 * („nur für Bild und Video pinnen") hat diesen Pin angelegt; die Entscheidung
 * vom 2026-11-09 hat den Textweg nachgezogen, diesen hier aber nicht
 * angefasst — die Gemini-Modelle haben die zwei Endpunkte der Basis nicht,
 * und die Basis-Endpunkte haben kein Gemini.
 *
 * WARUM HIER NUR EIN EINTRAG, oben aber zwei: `google-vertex/eu` ist der
 * EINZIGE EU-Endpunkt dieser Modelle. Eine zweite Zeile gäbe es nur als
 * Wunsch, nicht als Route. Der Preis bleibt gewollt: mit
 * `allowFallbacks: false` daneben heißt ein Ausfall dieses Endpunkts ein
 * Ausfall der Funktion — lieber „gerade nicht verfügbar" als „irgendwo
 * gerechnet".
 *
 * ── UND WARUM BILDER-ERZEUGEN GAR NICHT GEPINNT IST ──────────────────────
 * `google/gemini-2.5-flash-image`, mit dem die Zeichen-Entwürfe entstehen,
 * hat als einzigen Endpunkt `google-vertex/global`. Ein EU-Pin würde die
 * Funktion dort nicht schützen, sondern abschalten. Gemessen, nicht vermutet
 * — und `pnpm ops:ai-models` hält es nach.
 */
export const BRAND_PROVIDER_ROUTING_VERTEX_EU = {
  ...BRAND_PROVIDER_ROUTING,
  only: ['google-vertex/eu'],
} as const
