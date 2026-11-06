import type { H3Event } from 'h3'
import { AppwriteException, ID } from 'node-appwrite'
import { BRAND_EVENTS_TABLE, brandDb } from './brandStore'

/**
 * DER APPEND-ONLY FUNNEL (`brand_events`, Schema-Anhang §6).
 *
 * ── ZWEI REGELN, DIE MAN NICHT AUFWEICHEN DARF ────────────────────────────
 *
 * 1. **NIE INHALTSTEXT.** `payload` ist auf 4096 Zeichen begrenzt und trägt
 *    Kennzahlen, Schlüssel und Zustände — keinen Prompt, keinen Slot-Text,
 *    keinen Namen, keine E-Mail (Log-Regel Plan §6). Der Funnel beantwortet
 *    „wie viele kamen bis Baustein D?", nicht „was stand drin?".
 *
 * 2. **FAIL-SOFT.** Ein Ereignis ist eine BEOBACHTUNG. Scheitert sie, ist die
 *    Handlung trotzdem passiert — ein Profil, das angelegt wurde, aber wegen
 *    einer vollen Ereignis-Tabelle mit 500 quittiert wird, wäre der teuerste
 *    denkbare Tausch. Deshalb: gefangen, geloggt, weiter. (Das ist die
 *    Umkehrung von `touchProfile` nebenan, und der Unterschied ist Absicht:
 *    dort sieht der Mensch den Fehler sofort, hier nie.)
 */

export type BrandEventType =
  | 'profile.created'
  | 'step.completed'
  | 'share.published'
  /**
   * DIE LESEANSICHT UND IHR GETEILTES GEGENSTÜCK (Brand-Foundation-Konzept
   * §2.7/§2.10, Paket G3). Sie beantworten die Frage der Startseite — „arbeitet
   * jemand am nächsten Tag mit dem Ergebnis?" — und die zweite dahinter: gibt
   * es den zweiten Leser überhaupt?
   *
   * `share.viewed` trägt die `shareId`, NIE den Token (er ist das ganze
   * Geheimnis; eine Zeile in einer Tabelle wäre eine Kopie davon an einer
   * Stelle, die andere lesen dürfen) und NIE eine IP. Regel 1 im Kopf gilt
   * unverändert: kein Inhalt, nur Kennzahlen.
   */
  | 'foundation.viewed'
  | 'share.viewed'
  | 'share.revoked'
  | 'invite.redeemed'
  // Der Generierungs-Trichter (§3e). `payload` trägt Slot-Id, Modell, Dauer und
  // Fehlercode — NIE Prompt und NIE den erzeugten Text (Regel 1 im Kopf).
  | 'generation.requested'
  | 'generation.completed'
  | 'generation.failed'
  // Die Konversations-Runde (P3.2). `payload` trägt Baustein, Slot-Id, Modell
  // und Dauer — NIE den getippten Text und NIE die Antwort (Regel 1 im Kopf).
  | 'conversation.turn'
  | 'conversation.failed'
  /**
   * DER SCHNAPPSCHUSS VOR „NOCHMAL VON VORN" (§5a). Die EINE Ausnahme von
   * Regel 1 im Kopf, und sie ist eng gefasst: dieser Eintrag trägt Slot-TEXT,
   * weil er genau dafür da ist — ein versehentlicher Restart soll für den
   * Betreiber rekonstruierbar sein, während er für den Kunden wirklich „von
   * vorn" ist. Er ist damit KEINE Messung, sondern ein AUDIT-Eintrag; dieselbe
   * Aufbewahrung (24 Monate), dieselbe Löschkaskade.
   *
   * Was NICHT hineinpasst, wird gekürzt und als `truncated` markiert — der
   * Deckel liegt bei 4096 Zeichen, und ein Kapitel darf 200k tragen. Ein
   * halber Schnappschuss mit ehrlicher Marke ist mehr wert als gar keiner
   * (`payload` wird sonst KOMPLETT verworfen, s. u.).
   */
  | 'step.restarted'
  /**
   * DIE GESPRÄCHSANFRAGE (BS1 Z0). `payload` trägt Herkunft, Sprache und die
   * zwei Zustell-Ergebnisse — NIE Name, Adresse oder Anliegen (Regel 1 im
   * Kopf). Die Anfrage selbst steht vollständig in `brand_intro_requests`;
   * dieser Eintrag beantwortet nur „wie viele fragen, und von wo?".
   *
   * `profileId` und `userId` sind LEER, wenn ein Gast von der öffentlichen
   * Seite fragt — das ist der erwartete Normalfall und kein Mangel.
   */
  | 'intro.submitted'
  /**
   * DER WEG IN DIE ÖFFENTLICHE GALERIE (Discover D1, §4.3). Er beantwortet die
   * Frage hinter „Discover": reichen Menschen ihre Marke überhaupt ein, und
   * ziehen sie sie wieder zurück?
   *
   * `payload` trägt Umfang und Vorzustand — nie den Snapshot, nie den Titel
   * (Regel 1 im Kopf). Die FREIGABE selbst schreibt hier nichts: sie ist eine
   * Handlung des Betreibers und gehört in dessen Protokoll (Paket D3).
   */
  | 'publication.submitted'
  | 'publication.withdrawn'
  /**
   * DIE FREISCHALTUNG VON BRAND DESIGN (Konzept §2.10, Paket D1) — die EINZIGE
   * Handlung des Betreibers in diesem Funnel, und sie steht hier, weil sie
   * Folgen für den KUNDEN hat: Schicht 2 ist ab dieser Zeile für seine Marke
   * offen. Die Freigabe einer Veröffentlichung (`publication.*`) hat das
   * bewusst nicht — dort entsteht nichts Neues für den Kunden, dort wird nur
   * sichtbar, was er schon eingereicht hat.
   *
   * `payload` trägt Kennzahlen: beim Freischalten, wie viele `brand_steps`-
   * Zeilen nachgezogen wurden (Bestandsmarke aus der Zeit vor D0) und den
   * Foundation-Fortschritt; beim Zurücknehmen die Zahl der Tage, die das
   * Produkt offen war. `userId` ist hier der BETREIBER, nicht der Eigentümer —
   * die Marke steht in `profileId`. Kein Titel, keine Adresse (Regel 1 im Kopf).
   */
  | 'design.unlocked'
  | 'design.locked'
  /**
   * DIE FREISCHALTUNG DER ABLEITUNG (Konzept docs/plans/BRAND-BOOK-KIT.md
   * §2.8/§2.13, Paket K1) — die zweite Betreiber-Handlung in diesem Funnel,
   * und sie steht hier aus demselben Grund wie `design.unlocked`: sie hat
   * Folgen für den KUNDEN. Ab dieser Zeile sind Brand Book & Kit UND der
   * Marktvergleich für seine Marke offen — EIN Feld, zwei Produkte.
   *
   * `payload` trägt Kennzahlen: `via` (`operator`, ab BS1 Z1 auch `purchase`),
   * beim Freischalten die Zahl nachgezogener `brand_steps`-Zeilen und den
   * Foundation-Fortschritt, beim Zurücknehmen die Tage, die das Produkt offen
   * war. `beta` sagt, ob das Konto des Eigentümers ohnehin frei ist — die
   * Zahl, an der man nach dem ersten Verkauf ablesen kann, ob wir überhaupt
   * etwas freischalten, das nicht schon frei war. `userId` ist der BETREIBER
   * (bzw. leer beim Webhook), die Marke steht in `profileId`. Kein Titel,
   * keine Adresse (Regel 1 im Kopf).
   *
   * §2.13 nennt sie als Messpunkt: der Abstand zwischen `derivation.unlocked`
   * und dem ersten Kit-Download ist die Zeit, die das Produkt braucht, um
   * benutzt zu werden.
   */
  | 'derivation.unlocked'
  | 'derivation.locked'
  /**
   * DIE VORBILDER (Konzept §2.2 Schritt 2, Paket D2a) — die zwei Handlungen am
   * Upload-Instrument. Sie beantworten die Frage, an der die ganze Weiche
   * hängt: bringen Kunden überhaupt Vorbilder mit, und WOFÜR (Bereich)?
   *
   * `payload` trägt Bereich, Bytes, Format, ob eine Notiz dabei war und die
   * neue Anzahl. NIE den Dateinamen, nie die Notiz, nie ein Bild (Regel 1 im
   * Kopf) — ein Vorbild ist ein FREMDWERK und bleibt privat (§2.13); der
   * Funnel ist der letzte Ort, an dem etwas davon stehen dürfte.
   */
  | 'design.inspiration.added'
  | 'design.inspiration.removed'
  /**
   * EIN VISION-LAUF ÜBER DIE VORBILDER (D2b, §2.14). Kennzahlen: Bildzahl,
   * gelesene Zeilen, Urteils-Verteilung, Modell-Kennung, Dauer — nie ein Bild,
   * nie ein Prompt, nie eine Begründung.
   */
  | 'design.reading.run'
  /**
   * DER DNA-VORSCHLAG (D2c, §2.2 Schritt 4). Kennzahlen: Zeilenzahl, wie viele
   * davon auch auf ein Vorbild zeigen, ob der Lauf überhaupt Vorbilder hatte,
   * Modell-Kennung, Dauer — nie eine Begründung, nie ein Prompt, nie eine
   * Foundation-Stelle.
   *
   * Der Anteil `both` ist die Zahl, an der die WEICHE des Kapitels hängt:
   * Vorbilder bringt nur, wer welche hochlädt, und ob sie den Vorschlag
   * wirklich tragen, sagt keine Upload-Zahl.
   */
  | 'design.dna.run'
  /**
   * DAS ZEICHEN-BRIEFING (D5a, §2.5 Stufe 1). Kennzahlen: Zahl der Felder,
   * Modell-Kennung, Dauer — und im Fehlerfall der Grund. NIE ein Feld des
   * Briefings, nie der Prompt, nie eine Foundation-Stelle.
   *
   * Es ist das Ereignis, an dem hängt, ob Stufe 1 überhaupt benutzt wird: ein
   * Kapitel, in dem alle sofort zu den Setzungen springen, sagt etwas über
   * die Reihenfolge, die das Produkt behauptet (§2.5).
   */
  | 'design.mark.brief'
  /**
   * DIE KI-ENTWÜRFE DES ZEICHENS (D5c, §2.5 Stufe 3 / §2.14) — drei Ereignisse
   * für die drei Fragen, die dieses Produkt an die Fläche hat.
   *
   * `run`: wie viele Bilder ein Lauf wirklich gebracht hat (Teilerfolg ist
   * Erfolg), Modell-Kennung, Prompt-Hash, Dauer — und im Fehlerfall der Grund.
   * `kept`/`discarded`: wie viele Entwürfe der Mensch danach BEHÄLT. Das ist
   * die eigentliche Produktfrage: Entwürfe, die niemand behält, sind eine
   * teure Attrappe, und Entwürfe, die alle behalten, sagen etwas über die
   * Reihenfolge der drei Stufen.
   *
   * NIE ein Bild, NIE der Prompt, NIE ein Briefing-Feld und NIE ein Name
   * (Regel 1 im Kopf). Der HASH darf mit: er ist dieselbe Herkunfts-Auskunft,
   * die auf der Karte steht, und sagt für sich genommen nichts über die Marke.
   */
  | 'design.drafts.run'
  | 'design.drafts.kept'
  | 'design.drafts.discarded'
  /**
   * EIN ABGERUFENES KIT (Konzept docs/plans/BRAND-BOOK-KIT.md §2.13, Paket
   * K2). `payload` trägt die DATEI-ID (`tokens.json`, `tokens.css`, …) und ob
   * ein Design-Preset dahinterstand — nie einen Dateinamen (er enthält den
   * Markennamen) und nie einen Inhalt (Regel 1 im Kopf).
   *
   * Es ist der Messpunkt, an dem §2.13 zwei Fragen hängt: der Abstand
   * zwischen `derivation.unlocked` und dem ERSTEN Download (wie lange braucht
   * das Produkt, bis es benutzt wird?) und der Anteil der Marken ohne Design,
   * die trotzdem etwas laden (der Beleg für §1.11 d „Design ist keine
   * Voraussetzung"). Das MANIFEST schreibt hier nichts: es ist die Seite,
   * nicht die Datei.
   */
  | 'kit.downloaded'

export interface BrandEventInput {
  type: BrandEventType
  profileId?: string
  userId?: string
  /** Klein halten. Wird beim Überschreiten der Spaltengrösse VERWORFEN, nie gekappt. */
  payload?: Record<string, string | number | boolean>
}

/**
 * Der Spaltendeckel (`brand_events.payload`, varchar 4096, Migration
 * brand-007). EXPORTIERT, weil der Restart-Schnappschuss VOR dem Schreiben
 * wissen muss, wie viel hineinpasst: hier wird ein zu grosser `payload`
 * KOMPLETT verworfen (gekappt wäre er kaputtes JSON), und ein Audit-Eintrag,
 * der still leer ankommt, ist schlimmer als einer, der sagt, dass er gekürzt
 * wurde.
 */
export const BRAND_EVENT_PAYLOAD_MAX = 4096
const PAYLOAD_MAX = BRAND_EVENT_PAYLOAD_MAX

export async function recordBrandEvent(event: H3Event, input: BrandEventInput): Promise<void> {
  try {
    const { tablesDB, databaseId } = brandDb(event)
    let payload = ''
    if (input.payload) {
      const json = JSON.stringify(input.payload)
      // Gekappt wäre es kaputtes JSON — ein leeres Feld ist ehrlicher als ein
      // halbes Objekt, das kein Leser mehr parsen kann.
      payload = json.length <= PAYLOAD_MAX ? json : ''
    }
    await tablesDB.createRow({
      databaseId,
      tableId: BRAND_EVENTS_TABLE,
      rowId: ID.unique(),
      data: {
        type: input.type,
        profileId: input.profileId ?? '',
        userId: input.userId ?? '',
        payload,
      },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.event_write_failed', {
      type: input.type,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * EIN EREIGNIS EINES AUFSETZENDEN PRODUKT-LAYERS (MV1 M5).
 *
 * ── WARUM ES DIESE ZWEITE FUNKTION GIBT ───────────────────────────────────
 * `BrandEventType` ist eine GESCHLOSSENE Aufzählung, und das ist ihr Wert: sie
 * fängt den Tippfehler in einem Ereignis-Namen, den sonst niemand bemerkt (die
 * Spalte ist ein varchar, s. Migration brand-007 — die Datenbank hilft hier
 * nicht). Ein Produkt-Layer wie `market` kann seinen Namen aber nicht in diese
 * Liste eintragen: `brand` ist Fundament und darf kein Produkt KENNEN, das
 * darauf aufsetzt (CONCEPT A14). Und die Liste zu einem Template-Literal zu
 * öffnen (`${string}.${string}`) hätte sie für ALLE Ereignisse wertlos
 * gemacht — inklusive der eigenen.
 *
 * Deshalb die zweite Tür: `brand` kennt hier die FORM eines Produkt-
 * Ereignisses (`<produkt>.<name>`), nicht das Produkt. Dasselbe Muster wie bei
 * `BrandWorkspaceNavExtra` und `registerBrandProfileCascade` — die Richtung
 * der Abhängigkeit bleibt, wo sie hingehört.
 *
 * ── DER RÜCKGABEWERT IST DIE IDEMPOTENZ ───────────────────────────────────
 * `recordBrandEvent` daneben ist reine Beobachtung und darf still scheitern.
 * Hier gibt es einen Aufrufer, der WISSEN muss, ob es das Ereignis schon gab —
 * die freiwillige Bewertung nach dem ersten Marktbericht soll genau einmal je
 * Branding zählen. Der Weg dahin ist derselbe wie bei `notify()` im core: eine
 * DETERMINISTISCHE Zeilen-Id, und ein 409 heisst „gab es schon". Kein „erst
 * nachsehen, dann schreiben" — das wäre bei zwei gleichzeitigen Klicks zwei
 * Zeilen.
 *
 * Ohne `rowId` verhält sich die Funktion wie ihre Nachbarin: eine neue Zeile,
 * `true` zurück. FAIL-SOFT bleibt sie in beiden Fällen — ein Ereignis, das
 * nicht geschrieben werden konnte, darf die Handlung nicht mitnehmen; es
 * meldet das nur als `false`.
 */
export interface BrandProductEventInput {
  /** Der Manifest-Schlüssel des Produkts, z. B. `market`. */
  product: string
  /** Der Ereignis-Name innerhalb des Produkts, z. B. `rating`. */
  name: string
  profileId?: string
  userId?: string
  /**
   * Deterministische Zeilen-Id für „genau einmal". Weglassen heisst „jedes Mal
   * eine neue Zeile". Appwrite erlaubt bis 36 Zeichen aus `a-zA-Z0-9._-` und
   * kein führendes Sonderzeichen.
   */
  rowId?: string
  /** Klein halten. Wird beim Überschreiten der Spaltengrösse VERWORFEN, nie gekappt. */
  payload?: Record<string, string | number | boolean>
}

/** `false` = nicht geschrieben (gab es schon, oder es ist schiefgegangen). */
export async function recordBrandProductEvent(
  event: H3Event,
  input: BrandProductEventInput,
): Promise<boolean> {
  const type = `${input.product}.${input.name}`
  try {
    const { tablesDB, databaseId } = brandDb(event)
    let payload = ''
    if (input.payload) {
      const json = JSON.stringify(input.payload)
      payload = json.length <= PAYLOAD_MAX ? json : ''
    }
    await tablesDB.createRow({
      databaseId,
      tableId: BRAND_EVENTS_TABLE,
      rowId: input.rowId ?? ID.unique(),
      data: {
        type,
        profileId: input.profileId ?? '',
        userId: input.userId ?? '',
        payload,
      },
    })
    return true
  }
  catch (error) {
    // 409 ist KEIN Fehler, sondern die Antwort: dieses Ereignis gab es schon.
    // Es wird deshalb auch nicht geloggt — sonst stünde bei jedem zweiten
    // Seitenaufruf eine Warnung im Log, die nichts bedeutet.
    if (error instanceof AppwriteException && error.code === 409) return false
    logEvent('warn', 'brand.event_write_failed', {
      type,
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
