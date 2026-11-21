import type { H3Event } from 'h3'

/**
 * „DIESER MENSCH HAT GERADE ETWAS GETAN — SCHREIB ES MIT." (F1, das Fundament
 * des gemeinsamen Pakets aus Konzept Teil 5, Punkte 4–6.)
 *
 * ── WARUM ES DIESEN VERTRAG NEBEN `registerUserCounterProvider` GIBT ────────
 * Der Zähl-Vertrag von Stufe 4 fragt beim HINSEHEN: „wie viele meiner Beiträge
 * haben mindestens fünf Stimmen?" — eine feste Zahl von `count`-Abfragen, die
 * jedes Mal neu gerechnet werden. Das trägt eine Galerie, die jemand einmal am
 * Tag öffnet. Es trägt NICHT, was danach kommt:
 *
 *  - **Abzeichen mehrfach verleihen** braucht die Frage „ist seit dem letzten
 *    Mal ein neues qualifizierendes Ereignis dazugekommen?". Aggregate kennen
 *    keine Ereignisse, nur Stände.
 *  - **Benachrichtigen** heißt, im Moment des Verdienstes davon zu wissen —
 *    nicht in dem Moment, in dem der Verdiente zufällig nachsieht.
 *  - **Trust Levels** werden laut Davids Entscheidung „beim Schreiben über die
 *    mitschreibenden Zähler" ausgewertet. Acht `count`-Abfragen an jedem
 *    Kommentar wären genau das, was diese Umstellung vermeiden soll.
 *
 * Deshalb ZWEI Verträge nebeneinander und ausdrücklich keine Ablösung: der
 * Provider-Vertrag beantwortet weiterhin die VERTEILUNGS-Fragen („wie viele
 * meiner Inhalte haben ≥N Stimmen"), die ein laufender Zähler gar nicht
 * beantworten kann — dafür müsste er je Schwelle einen eigenen Stand führen und
 * bei jeder Stimme wissen, welche Schwelle ein einzelner Beitrag gerade
 * überschritten hat. Dieser Vertrag hier zählt EREIGNISSE.
 *
 * ── WER SCHREIBT? EINE AUTORITÄT, UND SIE GEHÖRT NICHT CORE ────────────────
 * Core besitzt keine Tabellen (A14). Die Zähler-Zeilen gehören dem posts-Layer
 * (Discussions-Infrastruktur); core erklärt nur die Frage und nimmt die
 * Meldungen entgegen. Ohne registrierte Autorität ist alles hier ein No-Op —
 * Silo-Apps ohne posts, der Playground und CI-Builds laufen unverändert.
 *
 * ── WIRFT NIE, UND ZWAR AUS PRINZIP ────────────────────────────────────────
 * Ein Zähler ist eine Nebenwirkung des Handelns, kein Teil davon. Niemandes
 * Kommentar darf verloren gehen, weil eine Zahl nicht hochgezählt werden
 * konnte. Der Preis ist ein möglicher Untergang einzelner Ereignisse — genau
 * dafür gibt es den Selbstheilungs-Zweig der Auswertung (siehe
 * `packages/posts/server/utils/memberCounters.ts`).
 */

/**
 * Die Ereignis-Arten. SIE SIND DER VERTRAG — nicht die Spalten einer Tabelle,
 * die nur ein Layer kennt.
 *
 * Der Zuschnitt ist „was ist heute an der QUELLE messbar und wird später
 * gebraucht", nicht „was ließe sich denken":
 *  - `topicsCreated` / `repliesCreated` — die beiden Schreib-Arten. Getrennt,
 *    weil Trust Levels sie getrennt fordern (Discourse: „Themen eröffnet" UND
 *    „Antworten geschrieben") und weil ein zusammengefasster Zähler sich später
 *    nicht mehr aufteilen ließe.
 *  - `upvotesGiven` / `upvotesReceived` — dieselbe Stimme aus zwei Blickwinkeln,
 *    zwei verschiedene Menschen. Ein Zähler für beides wäre sinnlos.
 *  - `edits` — Bearbeitungen EIGENER Inhalte. Der einzige Zähler ohne jedes
 *    Aggregat dahinter: eine Bearbeitung hinterlässt in `community_posts` und
 *    `comments` nur einen Zeitstempel, keine Anzahl. Wer sie nicht mitschreibt,
 *    kann sie nie nachrechnen.
 *  - `reactionsGiven` — selbst abgegebene Emoji-Reaktionen (F57 Mechanik 1).
 *    NUR die GEGEBENE Richtung, und das ist die Aussage: Reaktionen sind laut
 *    Konzept Teil 4 Punkt 3 **badge-neutral**, Abzeichen zählen weiterhin
 *    ausschliesslich Upvotes. Ein `reactionsReceived` wäre der Anfang einer
 *    zweiten Like-Quelle und fehlt deshalb ABSICHTLICH — wer ihn nachrüsten
 *    will, hebt damit Davids Entscheidung 4 auf und braucht ein eigenes Ja.
 *    Der eine erlaubte Verbraucher ist das Abzeichen `first-reaction` („erste
 *    ABGEGEBENE Reaktion"), die einzige Ausnahme, die das Konzept nennt.
 *
 * NICHT dabei und bewusst nicht: abgesetzte Meldungen. Die beantwortet der
 * moderation-Provider mit EINER exakten `count`-Abfrage über Zeilen, die nie
 * gelöscht werden — ein mitlaufender Zähler wäre dort mehr Bewegung für
 * dieselbe Zahl.
 */
export const USER_COUNTER_KINDS = [
  'topicsCreated',
  'repliesCreated',
  'upvotesGiven',
  'upvotesReceived',
  'edits',
  'reactionsGiven',
  /**
   * ANGENOMMENE eigene Einladungen (F57 Mechanik 2) — der Zähler hinter dem
   * Abzeichen `promoter`.
   *
   * Wie `upvotesReceived` eine Buchung auf eine FREMDE Zeile: gehandelt hat
   * der Eingeladene (er nimmt an), gutgeschrieben wird dem Einladenden.
   * Genau dafür trägt dieser Vertrag seine `userId` explizit.
   *
   * GEMELDET WIRD DIE ANNAHME, NIE DER VERSAND. Ein Zähler auf verschickte
   * Einladungen wäre eine Auszeichnung fürs Anschreiben und liefe der
   * Kontingent-Mechanik direkt zuwider.
   */
  'invitesAccepted',
  /**
   * TAGE, AN DENEN DAS LIKE-LIMIT ERREICHT WURDE (F57 Mechanik 3) — der
   * Zähler hinter „Out of Love" / „Higher Love" / „Crazy in Love" (1 / 5 / 20
   * Tage).
   *
   * DIE EINZIGE ART, DIE KEINE HANDLUNG ZÄHLT, SONDERN EINEN ZUSTAND: gemeldet
   * wird nicht „hat geliked", sondern „hat heute alles verbraucht". Genau
   * einmal je Tag — die Meldung entsteht an dem einen Hochzählen, das den
   * Stand auf das Limit setzt (`crossesLikeLimit`), nicht an den Versuchen
   * danach. Ein Zähler auf die ABGEWIESENEN Versuche wäre etwas ganz anderes
   * (er zählte Ungeduld) und ergäbe an einem einzigen Abend „20 Tage".
   *
   * Wie `edits` und `invitesAccepted` rein MITSCHREIBEND: es gibt kein
   * Aggregat, aus dem sich vergangene Tage nachrechnen ließen — ein Tag, an
   * dem das Limit erreicht war, hinterlässt in keiner Tabelle eine Spur außer
   * dieser Zahl. Das Abzeichen zählt deshalb AB JETZT.
   */
  'likeLimitDays',
  /**
   * Gesetzte Themen-Verweise (F57, letzte Mechanik) — der Zähler hinter
   * „First Link".
   *
   * Gemeldet wird die Anzahl NEU ANGELEGTER Rückverweis-Zeilen, nicht die der
   * Tokens im Text. Der Unterschied ist wichtig und beabsichtigt: ein Verweis
   * auf ein erfundenes, gelöschtes oder fremdes Thema legt keine Zeile an und
   * zählt deshalb nicht — sonst verdiente man das Abzeichen mit `#` plus
   * zwanzig ausgedachten Zeichen. Wer beim Bearbeiten einen bestehenden
   * Verweis stehen lässt, zählt ebenfalls nicht erneut.
   *
   * Wie `edits`, `invitesAccepted` und `likeLimitDays` rein MITSCHREIBEND: die
   * Verweis-Zeile trägt bewusst kein `authorId` (sie soll nichts
   * Personenbezogenes enthalten), also gibt es kein Aggregat zum Eichen. Das
   * Abzeichen zählt AB JETZT.
   */
  'linksMade',
  /**
   * EINGELADENE, DIE STUFE 1 (Basic) BZW. STUFE 2 (Member) ERREICHT HABEN
   * (F57-Stufen, 2026-08-14) — die Zähler hinter `campaigner` (3) und
   * `champion` (5).
   *
   * DIE EINZIGEN ARTEN, DEREN EREIGNIS EIN ANDERER MENSCH AUSLÖST, OHNE ES ZU
   * TUN: gemeldet wird beim STUFEN-AUFSTIEG des Eingeladenen, gutgeschrieben
   * dem, der ihn hergeholt hat. Wer wen eingeladen hat, steht seit F57-Stufen
   * an der Zähler-Zeile des Eingeladenen (`recordCommunityInviter`) — und
   * genau deshalb braucht dieser Weg keine Naht ins Control Plane.
   *
   * JE EINGELADENEM UND STUFE GENAU EINMAL, und das folgt aus der Mechanik
   * statt aus einer Prüfung: die gespeicherte Stufe wird ausschließlich nach
   * OBEN geschrieben (`raisedTrustLevel`), also wird jede Stufen-Grenze im
   * Leben eines Menschen genau einmal überschritten. Gemeldet wird die
   * DIFFERENZ dieses Aufstiegs, nie der Stand.
   *
   * DIE ERNENNUNG (Stufe 4) MELDET NICHTS. Der Katalog sagt „wurden Basic"
   * bzw. „wurden Member" — das sind ERARBEITETE Stufen. Eine Ernennung ist
   * eine Entscheidung des Owners über einen Menschen, kein Beleg dafür, dass
   * der Einladende jemand Brauchbares hergeholt hat; sie mitzuzählen hieße
   * außerdem, dass ein Owner die Abzeichen anderer Leute vergeben kann.
   *
   * Rein MITSCHREIBEND wie `edits` und `invitesAccepted`: die Stufen der
   * Eingeladenen von heute lassen sich nicht rückwirkend zuordnen (vor
   * F57-Stufen hat niemand `invitedBy` hinterlegt). Beide zählen AB JETZT.
   */
  'inviteesBasic',
  'inviteesMember',
] as const

export type UserCounterKind = (typeof USER_COUNTER_KINDS)[number]

export interface UserCounterEvent {
  /**
   * WEM wird gutgeschrieben. Ausdrücklich mitgegeben und NICHT aus
   * `event.context.user` abgeleitet — die Hälfte aller Meldungen betrifft
   * jemand anderen als den Handelnden (wer eine Stimme bekommt, hat gerade
   * nicht geklickt).
   *
   * Das ist der eine Punkt, an dem dieser Vertrag bewusst anders ist als
   * `collectUserCounters`, das eine userId GAR NICHT annimmt: dort wäre der
   * Parameter eine Auskunftsstelle über fremde Menschen, hier ist er eine
   * Buchung ohne Leseweg. Geschrieben wird nur, gelesen nie.
   */
  userId: string
  kind: UserCounterKind
  /** Ganzzahlig, darf negativ sein (zurückgenommene Stimme). 0 wird verworfen. */
  delta: number
}

export type UserCounterRecorder = (
  event: H3Event,
  events: readonly UserCounterEvent[],
) => Promise<void> | void

let recorder: UserCounterRecorder | null = null

/** Von dem Layer registriert, dem die Zähler-Zeilen gehören (Nitro-Plugin). */
export function registerUserCounterRecorder(fn: UserCounterRecorder): void {
  if (recorder) {
    console.warn('[core] registerUserCounterRecorder: bestehende Autorität wird ersetzt — pro Deployment ist EINE vorgesehen')
  }
  recorder = fn
}

export function getUserCounterRecorder(): UserCounterRecorder | null {
  return recorder
}

/**
 * PURE (unit-getestet): Meldungen zusammenfassen — je (Nutzer, Art) EINE Zeile.
 *
 * WOFÜR: eine Stimme meldet zwei Ereignisse, ein Beitrag eines. Die Autorität
 * schreibt je Meldung einen Datenbank-Schritt; ohne diese Zusammenfassung wären
 * zwei Meldungen für denselben Menschen und dieselbe Art zwei Schritte auf
 * DERSELBEN Zeile. Das passiert real: wer seinen eigenen Beitrag hochstimmt,
 * ist Geber UND Empfänger.
 *
 * Verworfen wird, was nicht zählbar ist: leere Ids, unbekannte Arten,
 * nicht-endliche oder gebrochene Deltas und die Summe 0 (nichts zu tun). Eine
 * kaputte Meldung soll nichts bewegen — nicht die ganze Buchung verhindern.
 */
export function mergeUserCounterEvents(events: readonly UserCounterEvent[]): UserCounterEvent[] {
  const known = new Set<string>(USER_COUNTER_KINDS)
  const totals = new Map<string, UserCounterEvent>()

  for (const entry of events) {
    if (!entry?.userId || !known.has(entry.kind)) continue
    if (typeof entry.delta !== 'number' || !Number.isFinite(entry.delta) || !Number.isInteger(entry.delta)) continue
    if (entry.delta === 0) continue

    const key = `${entry.userId} ${entry.kind}`
    const existing = totals.get(key)
    if (existing) existing.delta += entry.delta
    else totals.set(key, { userId: entry.userId, kind: entry.kind, delta: entry.delta })
  }

  return [...totals.values()].filter(entry => entry.delta !== 0)
}

/**
 * „Schreib das mit." — der EINE Aufruf für Quellen. Wirft nie.
 *
 * AWAIT, KEIN FEUER-UND-VERGISS: ein nicht abgewartetes Versprechen wird in
 * Nitro mit der Antwort verworfen, und dann wäre der Zähler eine Attrappe, die
 * unter Last stiller wird, je mehr los ist. Der Preis sind ein bis zwei
 * Datenbank-Schritte an einem Schreibvorgang, der ohnehin mehrere hat.
 */
export async function recordUserCounterEvents(
  event: H3Event,
  events: readonly UserCounterEvent[],
): Promise<void> {
  const merged = mergeUserCounterEvents(events)
  if (merged.length === 0) return

  const authority = getUserCounterRecorder()
  if (!authority) return

  try {
    await authority(event, merged)
  }
  catch (error) {
    logEvent('warn', 'user_counters.record_failed', {
      kinds: merged.map(entry => entry.kind).join(','),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
