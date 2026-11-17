/**
 * ÜBERSETZUNGEN VON NUTZER-INHALTEN (Davids Entscheidungen 2026-08-17:
 * Beiträge + Kommentare · ein Knopf je Inhalt, keine Automatik · Produkt-Gate
 * ist das jeweilige INHALTS-Produkt, bewusst nicht 'ai' · seit 2026-11-17 nur Mitglieder der Community, MM1).
 *
 * Dieselbe Bauform wie die Kategorie-Namen (`posts/shared/categoryI18n.ts`):
 * EINE JSON-Spalte auf der Zeile, Sprachcode → Überschreibung, gelesen über
 * genau diese pure, fail-softe Datei. Was die beiden unterscheidet, steht
 * unten — es ist mehr als die Feldnamen.
 *
 * ── WARUM SIE IN CORE LIEGT ───────────────────────────────────────────────
 * Zwei Konsumenten in zwei Produkt-Layern: `posts` (Titel + Text) und
 * `comments` (nur Text). `comments` steht in jedem `extends` VOR `posts` und
 * darf von dort nichts holen (A14) — eine Kopie im comments-Layer wäre die
 * zweite Wahrheit, die beim nächsten Feld auseinanderläuft. Also liegt die
 * REGEL hier und das DATENMODELL bei jedem Produkt selbst; genau dieselbe
 * Aufteilung wie bei `core/shared/reactions.ts`.
 *
 * ── WARUM MEDIUMTEXT UND NICHT VARCHAR(4000) WIE BEI DEN KATEGORIEN ───────
 * Weil hier der TEXT übersetzt wird, nicht eine Beschriftung. Ein Beitrag darf
 * 10.000 Zeichen tragen, ein Kommentar ebenso; sechs Sprachen sind damit bis zu
 * 60.000 Zeichen — mal vier Byte (utf8mb4) weit jenseits des MariaDB-
 * Zeilenbudgets von ~65 KB. Ein VARCHAR zählt voll in dieses Budget, ein
 * MEDIUMTEXT liegt off-row (nur ein Zeiger zählt). Bei den Kategorien war
 * VARCHAR die richtige Wahl (rund 1200 Zeichen, dafür kein zweiter Lesezugriff)
 * — hier ist es dieselbe Rechnung mit dem anderen Ergebnis.
 *
 * ── DIE GRUNDFASSUNG IST KEINE SPRACHE ────────────────────────────────────
 * Wie bei den Kategorien gibt es bewusst KEIN Feld „Ausgangssprache": es wäre
 * eine Angabe, die niemand pflegt und die beim ersten Irrtum die Anzeige
 * verdreht. Der Text auf der Zeile ist das, was jemand geschrieben hat; die
 * Einträge hier sind ÜBERSETZUNGEN daneben, nie ein Ersatz. Fehlt eine, wird
 * die Grundfassung gezeigt — der Zustand „nichts übersetzt" ist deshalb exakt
 * das Verhalten von vor diesem Paket.
 *
 * ── ABGELEITET, NICHT ERZEUGT ─────────────────────────────────────────────
 * Der Inhalt dieser Spalte ist ein CACHE: ein zweites Mal übersetzen liefert
 * dasselbe, nur gegen Geld beim KI-Anbieter. Daraus folgt beides — er darf
 * jederzeit verworfen werden (eine Bearbeitung des Originals LEERT ihn, sonst
 * stünde dort eine stille Lüge), und er ist kein Inhalt des Schreibenden: wer
 * eine Übersetzung anstößt, wird davon nicht Mitglied und schreibt nichts, was
 * eine Inhalts-Sperre angehen müsste.
 *
 * Aufgelöst wird im BROWSER, nicht auf dem Server — dieselbe Begründung wie bei
 * den Kategorien: die Sprache steht in der Adresse, ein Umschalten soll die
 * Anzeige sofort ändern statt einen zweiten Abruf auszulösen, und ein
 * `?locale=`-Parameter an jeder Leseroute wäre eine Angabe, die eine künftige
 * Aufrufstelle vergessen KANN.
 */

/** Ein plausibler Sprachcode ('de', 'en', 'pt-BR') — keine Liste, weil neue
 *  App-Sprachen hier nichts zu ändern haben sollen. */
export const LOCALE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/

/**
 * EINE Sprachfassung eines Inhalts.
 *
 * `body` ist PFLICHT, `title` nicht: einen Kommentar ohne Text gibt es nicht,
 * einen Beitrag ohne Titel schon (Fragen und Umfragen tragen ihn oft nur im
 * Text). Ein Eintrag ohne `body` ist deshalb kein halber Eintrag, sondern
 * keiner — er fällt beim Normalisieren heraus.
 */
export interface UgcTranslationEntry {
  title?: string
  body: string
  /**
   * Die übersetzten UMFRAGE-OPTIONEN, in der Reihenfolge des Originals
   * (Davids Entscheidung 2026-08-18) — nur bei `type: 'poll'`, sonst gar nicht.
   *
   * ADDITIV UND OPTIONAL, und das ist der Grund, warum die Spalte keine
   * Migration braucht: ein Bestands-Cache aus der Zeit davor trägt das Feld
   * nicht, ist aber weiterhin vollständig gültig (Titel und Text bleiben
   * nutzbar). Dasselbe gilt in der anderen Richtung — liefert die KI keine
   * brauchbare Liste, wird der Eintrag OHNE `options` gespeichert.
   *
   * Der INDEX trägt die Stimme (`poll_votes.optionIndex`), nicht der Text: eine
   * Übersetzung kann deshalb kein Votum verfälschen — solange die Reihenfolge
   * und die ANZAHL stimmen. Genau dafür gibt es `translatedPollOptions`.
   */
  options?: string[]
}

/** Sprachcode → Fassung. Sprachcodes wie in @nuxtjs/i18n ('de', 'en'). */
export type UgcTranslations = Record<string, UgcTranslationEntry>

/**
 * Wie viele Sprachen EIN Inhalt tragen darf.
 *
 * Keine Produkt-Entscheidung, sondern ein Riegel: der Sprachcode kommt aus dem
 * Rumpf der Übersetzungs-Route, und der Wertebereich ist bewusst offen (siehe
 * `LOCALE_CODE_PATTERN`). Ohne Deckel könnte ein einzelnes Konto dieselbe Zeile
 * über erfundene Codes ('aa', 'ab', 'ac', …) beliebig weit füllen — jedes Mal
 * 10.000 Zeichen, jedes Mal Geld beim KI-Anbieter. Sechs deckt jede App-Sprache
 * dieses Hauses mit Luft ab.
 */
export const MAX_UGC_TRANSLATION_LOCALES = 6

/**
 * Beliebige Eingabe (JSON-Wert) → saubere Karte.
 *
 * Unbekannte Formen (Zahlen, Arrays, fremde Felder) fallen still heraus, statt
 * sich später als `[object Object]` in einem Beitrag zu zeigen.
 *
 * HIER WIRD NICHT GEDECKELT, und das ist Absicht: `MAX_UGC_TRANSLATION_LOCALES`
 * gilt beim SCHREIBEN (die Route weist eine siebte Sprache mit 400 ab). Ein
 * Deckel im LESER würde eine vorhandene Übersetzung unsichtbar machen, und
 * welche der sechs überlebt, entschiede die Reihenfolge der Schlüssel — eine
 * Willkür, die niemand erklären kann.
 */
export function normalizeUgcTranslations(input: unknown): UgcTranslations {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: UgcTranslations = {}
  for (const [locale, value] of Object.entries(input as Record<string, unknown>)) {
    if (!LOCALE_CODE_PATTERN.test(locale)) continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const { title, body } = value as { title?: unknown, body?: unknown }
    if (typeof body !== 'string' || !body.trim()) continue
    const entry: UgcTranslationEntry = { body: body.trim() }
    // Ein leerer Titel ist KEIN Titel — sonst stünde über einem übersetzten
    // Beitrag eine leere Überschrift statt der Grundfassung.
    if (typeof title === 'string' && title.trim()) entry.title = title.trim()
    /**
     * Umfrage-Optionen: ENTWEDER GANZ ODER GAR NICHT.
     *
     * Ein einzelnes unbrauchbares Element lässt die ganze Liste fallen, statt
     * sie zu filtern — ein gefiltertes Array wäre um eins kürzer, und damit
     * zeigte die Anzeige jede Option auf der falschen Position. Der Eintrag
     * bleibt ohne `options` gültig: Titel und Text sind davon unberührt.
     */
    const { options } = value as { options?: unknown }
    if (Array.isArray(options) && options.length > 0
      && options.every(option => typeof option === 'string' && option.trim())) {
      entry.options = (options as string[]).map(option => option.trim())
    }
    out[locale] = entry
  }
  return out
}

/**
 * JSON von der Zeile lesen. FAIL-SOFT: was sich nicht lesen lässt, gilt als
 * „nichts übersetzt" — eine kaputte Spalte darf keinen Beitrag unlesbar machen.
 * Der Preis ist ein verlorener Cache, und der ist wiederherstellbar.
 */
export function parseUgcTranslations(raw: string | null | undefined): UgcTranslations {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return {}
  }
  return normalizeUgcTranslations(parsed)
}

/** Karte → Spaltenwert. Leere Karte ⇒ '' (nicht '{}'), damit „nichts
 *  übersetzt" auch in der Datenbank leer aussieht. */
export function serializeUgcTranslations(input: unknown): string {
  const clean = normalizeUgcTranslations(input)
  return Object.keys(clean).length ? JSON.stringify(clean) : ''
}

/** Die Fassung für DIESE Sprache — `null` heißt „nicht übersetzt", nie
 *  „leerer Text". */
export function ugcTranslationFor(
  raw: string | null | undefined,
  locale: string,
): UgcTranslationEntry | null {
  return parseUgcTranslations(raw)[locale] ?? null
}

/**
 * IST DIESE FASSUNG IN WAHRHEIT DIE GRUNDFASSUNG? (Davids Entscheidung
 * 2026-08-21: KI-Marker + UI-Hinweis statt eines teuren en→en-Echos.)
 *
 * Wer einen englischen Text mit englischer Spracheinstellung übersetzen lässt,
 * bekam bis dahin denselben Text zurück — bezahlt, und in der Anzeige ein
 * Umschalter zwischen zwei identischen Fassungen. Seither antwortet das Modell
 * in diesem Fall `{"same": true}`, und die Route legt die GRUNDFASSUNG wörtlich
 * in den Cache (damit jeder weitere Klick ein Treffer bleibt und nichts mehr
 * kostet). Diese Funktion ist die Gegenprobe dazu auf der Anzeige-Seite: sie
 * sagt „hier gibt es nichts umzuschalten".
 *
 * ── WARUM EIN VERGLEICH UND KEIN FLAG IN DER ANTWORT ──────────────────────
 * Ein Feld in der Antwort der Route wüsste nur der eine Klick, der sie gerufen
 * hat. Der Cache in der Spalte reist aber in JEDER Listen-Antwort mit und wird
 * von SPÄTEREN Lesern aufgeschlagen, die nie eine Route gerufen haben — die
 * bekämen ihr Flag nie zu sehen. Der Vergleich gilt für beide Wege.
 *
 * ── WARUM NUR DER BODY ────────────────────────────────────────────────────
 * Der Server schreibt im `same`-Fall die Grundfassung WÖRTLICH, und auch ein
 * Modell, das den Marker ignoriert und den gleichsprachigen Text zurückechot,
 * ist am Body erkennbar. Ein zusätzlicher Titel-Vergleich brächte also nichts
 * als einen zweiten Parameter — den der comments-Konsument gar nicht hat (ein
 * Kommentar hat keinen Titel).
 *
 * `null` (nichts übersetzt) ist NICHT die Grundfassung, sondern ihr Fehlen —
 * dort steht der gewöhnliche „Übersetzen"-Knopf, kein Hinweis.
 */
export function ugcTranslationIsOriginal(
  entry: UgcTranslationEntry | null,
  originalBody: string,
): boolean {
  if (!entry) return false
  return entry.body.trim() === originalBody.trim()
}

/**
 * DIE ÜBERSETZTEN UMFRAGE-OPTIONEN — oder `null` (Davids Entscheidung
 * 2026-08-18).
 *
 * `null` heißt „nimm die Originale", nie „leere Liste". Zurückgegeben wird nur,
 * was EXAKT so viele Elemente hat wie das Original und in dem jedes Element ein
 * nicht-leerer String ist.
 *
 * ── WARUM DER ANZAHL-WÄCHTER DIE GANZE FUNKTION IST ───────────────────────
 * Die Stimme einer Umfrage ist ein INDEX (`poll_votes.optionIndex`), kein Text.
 * Solange Reihenfolge und Anzahl stimmen, kann eine Übersetzung deshalb kein
 * Votum verfälschen — sie beschriftet nur um. Fehlt aber eine Option oder
 * kommt eine dazu, verschiebt sich ab dort ALLES: der Leser klickt auf „Ja"
 * und stimmt für „Nein". Und die Reihenfolge verspricht hier niemand außer dem
 * PROMPT, also ein Modell — das ist die schwächste Zusage im ganzen Haus, und
 * sie braucht eine Prüfung, die nicht auf Wohlwollen baut.
 *
 * Eine Umfrage mit verschobenen oder fehlenden Optionen wäre schlimmer als
 * eine unübersetzte: die unübersetzte sieht man, die verschobene nicht.
 * Deshalb ist der Rückfall vollständig — entweder alle Optionen übersetzt oder
 * keine.
 *
 * `maxLength` klemmt jedes Element (die Grenze des Originals, im posts-Layer
 * `MAX_POLL_OPTION_LENGTH`) — geklemmt wird NACH der Anzahl-Prüfung, denn eine
 * zu lange Antwort ist ein Darstellungsproblem, kein Zuordnungsproblem.
 */
export function translatedPollOptions(
  original: string[],
  returned: unknown,
  maxLength: number,
): string[] | null {
  if (original.length === 0) return null
  if (!Array.isArray(returned) || returned.length !== original.length) return null
  const out: string[] = []
  for (const option of returned) {
    if (typeof option !== 'string' || !option.trim()) return null
    out.push(option.trim().slice(0, maxLength))
  }
  return out
}

/**
 * Darf für DIESE Sprache noch eine Fassung dazukommen?
 *
 * Eine schon vorhandene Sprache darf IMMER geschrieben werden, auch am Deckel:
 * sonst wäre eine Zeile mit sechs Fassungen für immer eingefroren und ein
 * Nachziehen nach einer Bearbeitung unmöglich. Der Deckel begrenzt die ANZAHL
 * der Sprachen, nicht das Aktualisieren.
 */
export function mayAddUgcTranslationLocale(translations: UgcTranslations, locale: string): boolean {
  if (locale in translations) return true
  return Object.keys(translations).length < MAX_UGC_TRANSLATION_LOCALES
}

/**
 * DER TAGES-DECKEL JE KONTO (Davids Entscheidung 2026-08-17, Nachtrag).
 *
 * Neben der Burst-Drossel in den Routen (10 je Mensch, Community und zehn
 * Minuten), und sie beantwortet eine ANDERE Frage: die Burst-Drossel bremst das
 * Tempo, dieser Deckel begrenzt die RECHNUNG. Ohne ihn könnte ein einzelnes
 * Konto Tag und Nacht im Zehn-Minuten-Takt weiterlaufen — 1440 Übersetzungen am
 * Tag, jede bis zu 10.000 Zeichen, alle auf unsere Rechnung beim KI-Anbieter.
 *
 * 100 deckt einen sehr aktiven Leser: Kommentare sind kurz, und ein Thread hat
 * selten mehr als ein paar Dutzend fremdsprachige Antworten. Nach oben deckelt
 * es den Schaden eines durchdrehenden Skripts auf rund eine Million Zeichen je
 * Tag und Konto.
 *
 * CACHE-TREFFER ZÄHLEN NIE: der Eimer wird erst angefasst, nachdem feststeht,
 * dass gerechnet werden muss (in beiden Routen direkt neben der Burst-Drossel,
 * hinter dem Cache-Treffer). Wer eine schon übersetzte Fassung noch einmal
 * aufschlägt, kostet nichts — also darf es ihn auch nichts kosten.
 */
export const TRANSLATE_DAILY_LIMIT = 100

/** Das Fenster dazu: rollierende 24 Stunden, kein Kalendertag — sonst wäre um
 *  Mitternacht schlagartig wieder alles offen. */
export const TRANSLATE_DAILY_WINDOW_MS = 24 * 60 * 60_000

/**
 * Der Eimer-Schlüssel — EINE Funktion, weil BEIDE Routen exakt denselben
 * Schlüssel brauchen.
 *
 * OHNE `communityId`, und das ist der Punkt: der Deckel gehört dem KONTO, nicht
 * der Community. Wer in fünf Communities liest, hat trotzdem eine Rechnung.
 * (Die Burst-Drossel daneben ist bewusst je Community gezählt — sie schützt vor
 * Tempo, nicht vor Summe.)
 *
 * UND ÜBER BEIDE INHALTSARTEN GETEILT: stünden hier zwei Schlüssel (`post-…`,
 * `comment-…`), wären es in Wahrheit 200 je Tag. Zwei Literale in zwei Dateien
 * hätten genau diesen Fehler beim ersten Umbenennen gemacht — deshalb ist der
 * Schlüssel eine Funktion und keine Zeichenkette, die man abschreibt.
 */
export function ugcTranslationDayKey(userId: string): string {
  return `ugc-translate-day:${userId}`
}

/** Der Ablehnungsgrund des Tages-Deckels, wie er als `data.code` in der 429
 *  reist und vom zentralen Fehler-Handler als `reason` ins Envelope gehoben
 *  wird (core/server/error.ts). EIN Wort, zwei Enden: Route und Anzeige. */
export const TRANSLATION_DAILY_LIMIT_CODE = 'translation_daily_limit'

/**
 * WELCHER HINWEIS ERSCHEINT, WENN DIE ROUTE ABLEHNT.
 *
 * Pur und hier, nicht im Composable: es ist eine ABBILDUNG (Status → Text), die
 * man ohne Vue prüfen kann — und die einzige Stelle, an der die Fälle benannt
 * sind, die dem Menschen etwas anderes sagen als „hat nicht geklappt".
 *
 * 503 heißt „für diese Instanz ist keine KI eingerichtet" (kein Schlüssel, Gate
 * aus) und ist damit ein DAUERZUSTAND — ein „bitte nochmal" wäre dort gelogen.
 * 429 ist das Gegenteil: dieselbe Handlung wird gleich wieder gehen. Alles
 * andere (401 nach abgelaufener Sitzung, 400 am Sprachen-Deckel, 502 vom
 * Anbieter) ist für den Leser dieselbe Auskunft — der Unterschied liegt im Log,
 * nicht in seiner Handlung.
 *
 * ZWEI 429 SIND NICHT DASSELBE (Nachtrag 2026-08-17): die Burst-Drossel ist in
 * Minuten vorbei, der Tages-Deckel erst morgen. „Bitte versuche es in ein paar
 * Minuten noch einmal" wäre dort eine Aufforderung, die ins Leere läuft —
 * deshalb unterscheidet der `reason` sie. Er ist OPTIONAL: eine Antwort ohne
 * ihn (alter Server, Proxy-429) fällt auf den bisherigen Text zurück.
 */
export function ugcTranslationErrorKey(status: number | undefined, reason?: string): string {
  if (status === 503) return 'translation.unavailable'
  if (status === 429) {
    return reason === TRANSLATION_DAILY_LIMIT_CODE ? 'translation.dailyLimit' : 'translation.rateLimited'
  }
  return 'translation.failed'
}
