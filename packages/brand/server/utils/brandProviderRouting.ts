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
 * Der Typ bleibt bewusst ungenannt (`as const` statt `: AiProviderRouting`):
 * `AiProviderRouting` liegt im Core und wird per Auto-Import gefunden — ein
 * `import type` quer über die Layer-Grenze wäre der einzige in diesem Ordner.
 */
export const BRAND_PROVIDER_ROUTING = {
  zdr: true,
  dataCollection: 'deny',
  allowFallbacks: false,
} as const

/**
 * DASSELBE, PLUS EIN ORT — für die Läufe, die KUNDENMATERIAL hinreichen.
 *
 * `zdr: true` sagt „der Anbieter speichert nichts". Es sagt NICHTS darüber,
 * WO er rechnet. Das ist am 2026-10-27 in einer echten Probe aufgefallen:
 * ohne `only` wählt OpenRouter jede Route, die ZDR und `deny` erfüllt, und
 * unser Textmodell wurde von **Amazon Bedrock** bedient — nicht, wie im Plan
 * notiert, von `google-vertex/eu`. Die Notiz war eine Annahme, keine Messung.
 *
 * Diese Konstante nagelt deshalb den ORT fest, und zwar genau dort, wo
 * Material des Kunden hineingeht: die **Inspirationslesung** (Bilder, die
 * jemand hochgeladen hat) und — ab K5 — das **Videolesen** der Redaktion.
 * Davids Entscheidung vom 2026-10-27: „nur für Bild und Video pinnen".
 *
 * DER PREIS IST GEWOLLT: mit `allowFallbacks: false` daneben heißt ein
 * Ausfall dieses einen Endpunkts ein Ausfall der Funktion. Genau so ist die
 * Reihenfolge gemeint — lieber „gerade nicht verfügbar" als „irgendwo
 * gerechnet".
 *
 * ── WARUM NICHT ÜBERALL ──────────────────────────────────────────────────
 * Zwei Gründe, beide gemessen: (1) `google/gemini-2.5-flash-image`, mit dem
 * die Zeichen-Entwürfe entstehen, hat als einzigen Endpunkt
 * `google-vertex/global` — ein EU-Pin würde die Funktion nicht schützen,
 * sondern abschalten. (2) Das Textmodell (`anthropic/claude-haiku-4.5`) hat
 * EU-Routen bei zwei verschiedenen Anbietern; welche davon ZDR erfüllt, sagt
 * die öffentliche Auskunft nicht, das braucht je Modell eine eigene Probe.
 * Beides steht offen in OPEN-ITEMS `AI1`.
 */
export const BRAND_PROVIDER_ROUTING_EU = {
  ...BRAND_PROVIDER_ROUTING,
  only: ['google-vertex/eu'],
} as const
