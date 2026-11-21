import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import type { UserCounterEvent } from '../../../core/server/utils/userCounterEvents'
import {
  booksLikeLimitDay,
  decideLikeSpend,
  likeLimitForLevel,
  likeMechanicOff,
  utcDayKey,
  type LikeAllowance,
} from '../../../core/shared/likeAllowance'
import { effectiveTrustLevel } from '../../shared/trustLevels'
import {
  counterFellBehind,
  emptyMemberCounterValues,
  healedValues,
  memberCounterValues,
  seedValuesFrom,
  type MemberCounterValues,
} from '../../shared/memberCounters'
import { MEMBER_COUNTERS_TABLE, type MemberCounters } from '../../shared/types/post'
import { softFail, softFailWith } from '../../../core/server/utils/softFail'

/**
 * DIE AUTORITÄT ÜBER `member_counters` (F1, gemeinsames Paket) — die
 * posts-Seite des Core-Vertrags `registerUserCounterRecorder`.
 *
 * ── DIE KLINKE UND DER HANDELNDE: `operator` / `operator` ──────────────────
 * `as: 'operator'`, weil die Zeilen bewusst KEINE Client-Rechte tragen: gelesen
 * und geschrieben wird ausschließlich server-seitig, ein Session-Client käme
 * gar nicht an sie heran (Muster `post_views`).
 *
 * `actor: 'operator'` ist die wichtigere Hälfte, und sie hat zwei Gründe:
 *  - **A5 (Beitritt):** eine Buchung ist kein Beitritt. Die HANDLUNG, die
 *    gerade Mitglied macht, ist der Kommentar oder der Beitrag — der lief eine
 *    Zeile vorher durch dieselbe Tür mit `actor: 'member'`. Und die Hälfte
 *    aller Buchungen betrifft einen ANDEREN Menschen (den Autor, der eine
 *    Stimme bekommt); den zum Mitglied zu machen, weil jemand ihn hochgestimmt
 *    hat, wäre schlicht falsch.
 *  - **M13 (Zahlungssperre):** eine gesperrte Community ist NUR-LESEND. Ihre
 *    Inhalts-Routen scheitern also schon, bevor hier etwas gebucht würde — die
 *    Buchungen, die trotzdem ankämen (Moderation, eine Rücknahme), sind
 *    Buchhaltung und kein Inhalt. Mit `'member'` hinge die Verlässlichkeit der
 *    Zähler an einem Zahlungsstatus.
 *
 * ── ATOMAR, WEIL APPWRITE ES KANN ─────────────────────────────────────────
 * Hoch- und heruntergezählt wird über `incrementRowColumn`/`decrementRowColumn`
 * (Appwrite 1.9.x, in der Datentür als `increment`/`decrement`) — also ohne
 * Lesen-Rechnen-Schreiben. Das ist nicht Kosmetik: zwei gleichzeitige Stimmen
 * auf denselben Autor wären mit Lesen-und-Schreiben ein verlorenes Update, und
 * zwar lautlos. Dieselbe Wahl trifft der Aufruf-Zähler aus Stufe 2.
 *
 * `min: 0` beim Herunterzählen: Appwrite WEIST den Schritt ab, statt zu
 * kappen — die Zahl bleibt bei 0 stehen und der Fehlschlag wird verschluckt.
 * Genau das ist gemeint mit „nie unter 0". Die Spalte trägt dieselbe Grenze
 * noch einmal (posts-013) — der Schreibweg ist die Regel, die Spalte das Netz.
 *
 * ── EIN GEDÄCHTNIS FÜR DIE ZEILEN-ID ──────────────────────────────────────
 * Die Zeile ist über (communityId, userId) eindeutig, ihre Id aber nicht
 * berechenbar: Appwrite-Ids fassen keine 72 Zeichen. Ohne Gedächtnis kostete
 * jede Buchung eine Such-Abfrage. Die Id einer Zeile ändert sich nie, also ist
 * sie unbegrenzt haltbar; gedeckelt wird nur der Speicher.
 */

/* ─── Zeilen-Id-Gedächtnis (pro Prozess) ─────────────────────────────────── */

const rowIds = new Map<string, string>()
const MAX_REMEMBERED = 5000

function memoryKey(scope: string, userId: string): string {
  return `${scope} ${userId}`
}

function rememberRowId(scope: string, userId: string, rowId: string): void {
  if (rowIds.size >= MAX_REMEMBERED) {
    const oldest = rowIds.keys().next()
    if (!oldest.done) rowIds.delete(oldest.value)
  }
  rowIds.set(memoryKey(scope, userId), rowId)
}

/** Nur für Tests/Diagnose. */
export function __resetMemberCounterMemory(): void {
  rowIds.clear()
}

/* ─── Zugriff ────────────────────────────────────────────────────────────── */

function counterDb(event: H3Event): TenantDb {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/**
 * Die Zeile dieses Menschen — `null`, wenn es noch keine gibt.
 *
 * Über die gemerkte Id, sonst über den Unique-Index. `get` der Tür belegt
 * zusätzlich die Zugehörigkeit; ein Gedächtnis-Treffer aus einer FREMDEN
 * Community (theoretisch, weil der Schlüssel den Mandanten-Scope enthält)
 * liefe damit ins Leere statt in fremde Zahlen.
 */
async function findRow(event: H3Event, db: TenantDb, userId: string): Promise<MemberCounters | null> {
  const scope = tenantCacheScope(event)
  const remembered = rowIds.get(memoryKey(scope, userId))
  if (remembered) {
    const row = await db.get<MemberCounters>(MEMBER_COUNTERS_TABLE, remembered, 'Counters not found').catch(softFail('posts:utils/memberCounters:get', null))
    if (row) return row
    rowIds.delete(memoryKey(scope, userId))
  }

  const found = await db.find<MemberCounters>(MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
  if (found) rememberRowId(scope, userId, found.$id)
  return found
}

/**
 * Die Zeile anlegen. `seeded` sagt, ob die Werte schon geeicht sind.
 *
 * Ein 409 aus dem Unique-Index ist kein Fehler, sondern ein Wettlauf: jemand
 * anderes war schneller, also gewinnt dessen Zeile. `created` sagt dem
 * Aufrufer, welcher der beiden Fälle eingetreten ist — bei einem Wettlauf muss
 * er seine Deltas nachzählen, sie stecken sonst in der verworfenen Zeile.
 */
async function createRow(
  event: H3Event,
  db: TenantDb,
  userId: string,
  values: MemberCounterValues,
  seeded: boolean,
  /**
   * Felder NEBEN den Zählern, die beim Anlegen gleich mitgeschrieben werden
   * sollen (heute: der Tagesstand des Like-Limits). Sie stehen bewusst nicht
   * in `MemberCounterValues` — das sind die additiv geführten ZAHLEN, und
   * `likeDay` ist keine Zahl, die man hoch- oder herunterzählt.
   */
  extra: Partial<Pick<MemberCounters, 'likeDay' | 'likesToday' | 'likeLimitDay' | 'invitedBy'>> = {},
): Promise<{ row: MemberCounters | null, created: boolean }> {
  const row = await db.create<MemberCounters>(MEMBER_COUNTERS_TABLE, { userId, ...values, ...extra, seeded }, {
    // KEINE Row-Permissions: gelesen wird ausschließlich über die
    // Operator-Klinke. Ohne Leser gibt es kein Realtime-Ereignis — und ein
    // Zähler, der bei jeder fremden Stimme in offene Fenster funkt, wäre
    // Aufregung ohne Neuigkeit (dieselbe Überlegung wie bei `post_views`).
    permissions: [],
  }).catch(softFail('posts:utils/memberCounters:create', null, { quiet: [409] }))

  if (row) {
    rememberRowId(tenantCacheScope(event), userId, row.$id)
    return { row, created: true }
  }
  return { row: await findRow(event, db, userId), created: false }
}

/* ─── Der Schreibweg (Core-Vertrag) ──────────────────────────────────────── */

/**
 * Die Meldungen verbuchen. Wirft nie — der Core-Vertrag fängt zwar ab, aber
 * eine einzelne fehlgeschlagene Buchung darf auch die übrigen nicht mitnehmen.
 *
 * NEUE ZEILE MIT `seeded: false`: die Startwerte kommen erst beim ersten
 * Hinsehen (`ensureSeededCounters`), weil sie ein Aggregat über ZWEI Layer
 * sind und nur für den ANGEMELDETEN Menschen ermittelt werden können — die
 * Quellen zählen ausdrücklich nur, was `event.context.user` getan hat. Bei
 * einer Buchung geht es aber oft um jemand anderen.
 */
export async function applyMemberCounterEvents(event: H3Event, events: readonly UserCounterEvent[]): Promise<void> {
  const db = counterDb(event)

  const byUser = new Map<string, UserCounterEvent[]>()
  for (const entry of events) {
    const list = byUser.get(entry.userId)
    if (list) list.push(entry)
    else byUser.set(entry.userId, [entry])
  }

  await Promise.all([...byUser.entries()].map(async ([userId, entries]) => {
    try {
      let row = await findRow(event, db, userId)
      if (!row) {
        // Die frische Zeile trägt die positiven Deltas gleich mit — ein
        // getrenntes Anlegen und Hochzählen wäre ein Schritt mehr und ein
        // Wettlauf mehr. Negative Deltas fallen dabei weg: es gibt keinen
        // Bestand, von dem sie abziehen könnten.
        const values = emptyMemberCounterValues()
        for (const entry of entries) {
          if (entry.delta > 0) values[entry.kind] += entry.delta
        }
        const attempt = await createRow(event, db, userId, values, false)
        // Angelegt ⇒ die Deltas stecken drin, fertig. Wettlauf verloren ⇒ die
        // fremde Zeile bekommt sie unten nachgezählt.
        if (attempt.created || !attempt.row) {
          // Der Sprung von NICHTS auf die frischen Werte ist die erste
          // Überschreitung dieses Menschen — „Erster Zuspruch" entsteht genau
          // hier, bei der allerersten vergebenen Stimme.
          if (attempt.created) await awardCounterBadges(event, userId, emptyMemberCounterValues(), values)
          /**
           * BEWUSST KEINE STUFEN-PRÜFUNG auf einer frisch angelegten Zeile: sie
           * trägt die Deltas EINES Schreibvorgangs, und die kleinste Schwelle
           * verlangt zusätzlich zwei Tage Zugehörigkeit. Wer hier steht, ist
           * gerade erst angekommen — die Prüfung wäre eine garantiert
           * ergebnislose Abfrage ans Control Plane bei jedem ersten Beitrag
           * eines jeden neuen Mitglieds. Der zweite Schreibvorgang prüft, und
           * das Netz beim Hinsehen ohnehin.
           */
          return
        }
        row = attempt.row
      }

      /**
       * VORHER MERKEN, NACHHER VERGLEICHEN (F1 Teilpaket 2): die Verleihung an
       * dieser Stelle darf nur das NEUE sehen. `db.increment` gibt die
       * geschriebene Zeile zurück, der Stand davor steckt in `row` — damit ist
       * die Differenz gratis und kostet keine zusätzliche Abfrage.
       */
      const before = memberCounterValues(row)
      let latest: MemberCounters = row
      for (const entry of entries) {
        if (entry.delta > 0) {
          latest = await db.increment<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, entry.kind, { value: entry.delta }, 'Counters not found')
        }
        else {
          // `min: 0` — Appwrite weist den Schritt ab, statt unter null zu
          // gehen. Der Fehlschlag ist hier die gewünschte Wirkung.
          latest = await db.decrement<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, entry.kind, { value: -entry.delta, min: 0 }, 'Counters not found')
            .catch(softFailWith('posts:utils/memberCounters:decrement', () => latest, { quiet: [400] }))
        }
      }

      // FAIL-SOFT und ausdrücklich NACH der Buchung: ein Abzeichen darf keine
      // gezählte Stimme kosten. Was hier untergeht, holt das Netz beim
      // Hinsehen nach.
      await awardCounterBadges(event, userId, before, memberCounterValues(latest))

      /**
       * DIE VERTRAUENSSTUFE (F1 Teilpaket 3) — hier und nicht in zwanzig
       * Routen, aus demselben Grund wie die Zähler selbst: das ist die EINE
       * Stelle, an der der neue Stand vorliegt.
       *
       * `latest` ist die gerade geschriebene Zeile, die Prüfung rechnet also
       * mit dem Ergebnis dieser Buchung. Sie steigt in den allermeisten Fällen
       * schon an der billigen Hälfte aus (`countersAllowHigherLevel`), ohne das
       * Control Plane zu fragen — die Begründung dieser Reihenfolge steht dort.
       *
       * Fail-soft und zuletzt: eine Stufe ist eine Folge des Handelns, nie sein
       * Preis. `refreshTrustLevelAfterCounters` wirft nicht.
       */
      await refreshTrustLevelAfterCounters(event, userId, latest)
    }
    catch (error) {
      /**
       * BLEIBT FAIL-SOFT, BEWUSST (Bahn 2, Q13-Stelle 8): ein Zähler ist die
       * Folge einer Handlung, nie ihr Preis. Den Rückstand holt das Netz
       * beim Hinsehen nach — `ensureSeededCounters` zieht eine Zeile, die
       * HINTER den Aggregaten liegt, auf deren Stand (`counterFellBehind`);
       * ein eigener Abgleich-Lauf ist deshalb nicht nötig. Nicht geheilt
       * werden `upvotesReceived` und `edits` (dafür gibt es kein Aggregat):
       * dort bleibt ein verlorenes Delta verloren — sichtbar über diese Zeile.
       */
      logEvent('warn', 'posts.member_counters_failed', {
        kinds: entries.map(entry => entry.kind).join(','),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }))
}

/* ─── Das Tages-Limit für Likes (F57 Mechanik 3) ─────────────────────────── */

/**
 * PURE genug für hier: das Kontingent aus der App-Config.
 *
 * Gelesen über `useAppConfig()` wie das Mandanten-Kontingent
 * (`core/server/utils/tenantQuota.ts`) — es ist eine Bau-Einstellung dieser
 * Instanz, keine Zeile in `app_config`, die ein Betreiber zur Laufzeit dreht.
 * Wäre sie das, hinge an jeder einzelnen Stimme eine zusätzliche Abfrage.
 */
function likesPerDayFromConfig(): unknown {
  const appConfig = useAppConfig() as { pukalani?: { discussions?: { likesPerDayByLevel?: unknown } } }
  return appConfig.pukalani?.discussions?.likesPerDayByLevel
}

/**
 * Das Kontingent EINER Stufe — die EINE Leseweise der Staffel für alles außer
 * dem Verbrauch selbst (heute: die Auskunft in der Abzeichen-Galerie).
 *
 * Sie liegt hier und nicht bei der Galerie, damit der Config-Schlüssel genau
 * einmal im Code steht: eine zweite Lesestelle wäre die, die beim nächsten
 * Umbenennen vergessen wird und dann stillschweigend die Vorgabe anzeigt.
 */
export function memberLikeLimitFor(level: number): number {
  return likeLimitForLevel(likesPerDayFromConfig(), level)
}

/**
 * Den erreichten Tag verbuchen — über DENSELBEN Zähl-Vertrag wie jede andere
 * Buchung, nicht mit einem eigenen Schreibweg daneben.
 *
 * Der Umweg ist Absicht: `recordUserCounterEvents` ist die Stelle, an der aus
 * einem neuen Stand ein Abzeichen wird (`awardCounterBadges`). Würde hier
 * direkt hochgezählt, müsste die Verleihung ein zweites Mal angestoßen
 * werden — und ein Layer mit zwei Wegen in dieselbe Verleihung bekommt früher
 * oder später zwei Regeln.
 */
async function bookLikeLimitDay(event: H3Event, userId: string): Promise<void> {
  await recordUserCounterEvents(event, [{ userId, kind: 'likeLimitDays', delta: 1 }])
}

/**
 * Den erreichten Tag ERST FESTHALTEN, dann buchen (F57-Stufen).
 *
 * Die Reihenfolge ist eine Abwägung und keine Gewohnheit: schlägt das
 * Festhalten fehl, wird GAR NICHT gebucht — ein Tag, der nicht als gebucht
 * markiert werden konnte, könnte sonst nach einem Stufen-Aufstieg am selben
 * Tag ein zweites Mal gebucht werden. Lieber ein Tag zu wenig als ein
 * Abzeichen zu viel; das ist dieselbe gutmütige Richtung, in die der ganze
 * Verleihungs-Weg zeigt.
 */
async function stampAndBookLikeLimitDay(
  event: H3Event,
  db: TenantDb,
  rowId: string,
  userId: string,
  today: string,
): Promise<void> {
  const stamped = await db.update<MemberCounters>(MEMBER_COUNTERS_TABLE, rowId, { likeLimitDay: today }, 'Counters not found')
    .catch(softFail('posts:utils/memberCounters:update', null))
  if (!stamped) return
  await bookLikeLimitDay(event, userId)
}

/**
 * EIN LIKE VERBRAUCHEN — die posts-Seite des Core-Vertrags
 * `registerLikeAllowanceAuthority` (F57 Mechanik 3).
 *
 * ── WARUM DER STAND IN `member_counters` LIEGT UND NICHT IN EIGENEN ZEILEN ─
 * Weil es die Zeile schon gibt, und zwar genau EINE je (Community, Mensch) —
 * angelegt, im Prozess gemerkt (`rowIds`) und bei JEDER Aufstimme ohnehin
 * gelesen und geschrieben. Der Tagesstand kostet damit KEINE zusätzliche
 * Abfrage im heißen Pfad, nur drei Spalten.
 *
 * Die Alternative wäre eine Zeile je (Mensch, Tag) gewesen — sie hätte das
 * Aufräumen mitgebracht (wer räumt die Tage von vorgestern weg?) und für die
 * Frage „wie viele heute" einen eigenen Index verlangt. Und die Alternative
 * ohne jede eigene Spalte — bei jeder Stimme die heutigen Vote-Zeilen zählen —
 * ist nicht nur teurer (zwei Abfragen über zwei Tabellen in zwei Layern), sie
 * ist FALSCH: die Rücknahme LÖSCHT eine Vote-Zeile, ein Zählen des Bestands
 * gäbe das Kontingent also zurück, und das Limit wäre mit zwei Klicks je Like
 * beliebig oft zu umgehen. Der Stand muss deshalb ein VERBRAUCH sein, kein
 * Bestand.
 *
 * ── DIE KLINKE: `operator`/`operator` WIE DIE ÜBRIGEN BUCHUNGEN ───────────
 * Über `counterDb` und damit aus denselben zwei Gründen wie dort (A5: eine
 * Buchung ist kein Beitritt; M13: die Stimme selbst scheitert schon eine Zeile
 * vorher an der Mitglieds-Klinke, wenn die Community gesperrt ist). Ein
 * `actor: 'member'` hier hieße, dass ausgerechnet das VERBRAUCHEN eines Likes
 * jemanden zum Mitglied macht.
 *
 * ── ES WIRFT (und der Vertrag fängt) ──────────────────────────────────────
 * Anders als `applyMemberCounterEvents` schluckt diese Funktion nichts selbst:
 * `spendLikeAllowance` im Core hat den einen begründeten Fail-open-Zweig, und
 * zwei Netze übereinander machen aus einem Ausfall eine stille Lüge.
 */
export async function spendMemberLikeAllowance(event: H3Event, userId: string): Promise<LikeAllowance> {
  const staffel = likesPerDayFromConfig()
  /**
   * DER BILLIGE AUSSTIEG BLEIBT, ER FRAGT NUR ANDERS (F57-Stufen): seit das
   * Kontingent an der Stufe hängt, kann man es ohne die Zeile nicht mehr
   * ausrechnen — wohl aber, ob es überhaupt eines gibt. Nur wenn KEINE Stufe
   * eines hat, ist die Mechanik aus und die Zeile bleibt ungelesen.
   */
  if (likeMechanicOff(staffel)) return { ok: true }

  const db = counterDb(event)
  const today = utcDayKey(Date.now())

  let row = await findRow(event, db, userId)
  if (!row) {
    /**
     * Erste Stimme dieses Menschen überhaupt: die Zeile trägt den Tagesstand
     * gleich mit — ein getrenntes Anlegen und Hochzählen wäre ein Schritt und
     * ein Wettlauf mehr (dieselbe Überlegung wie bei den Zähler-Deltas).
     *
     * OHNE ZEILE GIBT ES KEINE STUFE, also gilt Stufe 0. Das ist keine
     * Notlösung, sondern die Wahrheit: die kleinste Schwelle verlangt zwei
     * Tage Zugehörigkeit und einen eigenen Inhalt — wer hier steht, hat beides
     * nicht.
     */
    const limit = likeLimitForLevel(staffel, 0)
    if (limit <= 0) return { ok: true }
    const books = booksLikeLimitDay(1, limit, '', today)
    const attempt = await createRow(event, db, userId, emptyMemberCounterValues(), false, {
      likeDay: today,
      likesToday: 1,
      ...(books ? { likeLimitDay: today } : {}),
    })
    if (attempt.created) {
      if (books) await bookLikeLimitDay(event, userId)
      return { ok: true }
    }
    // Wettlauf verloren ⇒ die fremde Zeile gilt; ohne Zeile (Störung) bleibt es
    // beim erlaubenden Ausgang, wie im Vertrag beschrieben.
    if (!attempt.row) return { ok: true }
    row = attempt.row
  }

  /**
   * DAS KONTINGENT DIESES MENSCHEN (F57-Stufen): Staffel-Config mal WIRKENDE
   * Stufe. Die Zeile hält beide Hälften der Stufe (erarbeitet + Ernennung),
   * sie liegt also ohnehin vor — die Staffel kostet keine einzige zusätzliche
   * Abfrage im heißesten Pfad des Produkts.
   */
  const limit = likeLimitForLevel(staffel, effectiveTrustLevel(row.trustLevel, row.trustLevelLeader === true))

  const decision = decideLikeSpend({
    limit,
    today,
    storedDay: row.likeDay ?? '',
    storedCount: row.likesToday ?? 0,
  })
  if (decision.mode === 'off') return { ok: true }
  if (decision.mode === 'denied') return { ok: false }

  if (decision.mode === 'reset') {
    /**
     * NEUER TAG: absolut setzen statt hochzählen — der alte Stand gehört einem
     * vergangenen Tag und darf nicht weiterwachsen.
     *
     * Das ist die EINE Stelle ohne atomares Hochzählen, und der Preis ist
     * benannt: treffen sich zwei erste Stimmen desselben Menschen in derselben
     * Sekunde, schreiben beide die 1 und eine Stimme bleibt ungezählt. Höchstens
     * ein Like je Tag und Mensch — dafür ein Lesen-Rechnen-Schreiben zu
     * vermeiden, hieße den Tageswechsel in einen nächtlichen Lauf über alle
     * Zeilen zu verlegen.
     */
    const books = booksLikeLimitDay(1, limit, row.likeLimitDay ?? '', today)
    await db.update<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, {
      likeDay: today,
      likesToday: 1,
      ...(books ? { likeLimitDay: today } : {}),
    }, 'Counters not found')
    if (books) await bookLikeLimitDay(event, userId)
    return { ok: true }
  }

  /**
   * DERSELBE TAG: atomar hochzählen — und die Antwort des Hochzählens ist
   * zugleich die Antwort auf „war ich der, der das Limit erreicht hat?".
   *
   * Genau daran hängt die Idempotenz des Abzeichen-Zählers: bei fünf parallelen
   * Stimmen sieht jeder Aufrufer einen ANDEREN Wert, also trifft `=== limit`
   * höchstens einen. Ein Lesen-Rechnen-Schreiben hätte hier zwei Fehler auf
   * einmal — verlorene Likes UND ein doppelt gebuchter Tag.
   */
  const latest = await db.increment<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, 'likesToday', { value: 1 }, 'Counters not found')
  if (booksLikeLimitDay(latest.likesToday ?? 0, limit, row.likeLimitDay ?? '', today)) {
    await stampAndBookLikeLimitDay(event, db, row.$id, userId, today)
  }
  return { ok: true }
}

/**
 * EIN LIKE ZURÜCKGEBEN — die posts-Seite von `refundLikeAllowance` (BE-020).
 *
 * Gerufen NUR, wenn die Route in derselben Anfrage gebucht hat und das
 * Schreiben der Stimme danach scheiterte (die Bedingungen hält der
 * Core-Vertrag). Zurückgezählt wird nur, was `spendMemberLikeAllowance`
 * gezählt haben kann: derselbe UTC-Tag, ein Kontingent für die Stufe und ein
 * Stand über 0. Ist der Tag inzwischen gewechselt, gibt es nichts zu
 * erstatten — der Stand von gestern gilt nicht mehr.
 *
 * Ein schon gebuchter Abzeichen-Tag (`likeLimitDay`) bleibt stehen: er ist
 * einmal je Tag gebucht und kein Kontingent.
 *
 * Atomar heruntergezählt (`decrement` klemmt bei 0). Wirft — der
 * Core-Vertrag fängt und protokolliert.
 */
export async function refundMemberLikeAllowance(event: H3Event, userId: string): Promise<void> {
  const staffel = likesPerDayFromConfig()
  if (likeMechanicOff(staffel)) return

  const db = counterDb(event)
  const row = await findRow(event, db, userId)
  if (!row) return
  const limit = likeLimitForLevel(staffel, effectiveTrustLevel(row.trustLevel, row.trustLevelLeader === true))
  if (limit <= 0) return
  if ((row.likeDay ?? '') !== utcDayKey(Date.now()) || (row.likesToday ?? 0) <= 0) return

  await db.decrement<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, 'likesToday', { value: 1, min: 0 }, 'Counters not found')
}

/** An DERSELBEN Registrierung wie das Verbrauchen (`registerLikeAllowanceAuthority`). */
spendMemberLikeAllowance.refund = refundMemberLikeAllowance

/* ─── Wer hat wen hergeholt? (F57-Stufen) ────────────────────────────────── */

/**
 * DEN EINLADENDEN AN DER ZEILE DES EINGELADENEN HINTERLEGEN — die posts-Seite
 * des Core-Vertrags `registerCommunityInviterRecorder`.
 *
 * Gerufen von der Annahme-Route, EINMAL im Leben einer Mitgliedschaft. Danach
 * ist der Aufstiegs-Hook (`creditInviterForAscent`) eine reine Runtime-Sache:
 * die Antwort auf „wer hat ihn hergeholt" steht in der Zeile, die er ohnehin
 * in der Hand hält.
 *
 * ── DIE ERSTE EINLADUNG GEWINNT ───────────────────────────────────────────
 * Ein bereits gesetzter Wert wird NIE überschrieben. Wer entfernt und später
 * erneut eingeladen wird, zählt weiter für den, der ihn zuerst geholt hat —
 * sonst wäre eine zweite Einladung ein Weg, eine bestehende Zuordnung
 * umzuschreiben, und mit ihr die Abzeichen zweier Menschen.
 *
 * ── DIE ZEILE KANN FEHLEN, UND DANN ENTSTEHT SIE HIER ─────────────────────
 * Ein frisch Eingeladener hat in dieser Community noch nichts getan, also gibt
 * es seine Zähler-Zeile in aller Regel noch nicht. Sie wird ungeeicht angelegt
 * (`seeded: false`) — die Startwerte holt das erste Hinsehen, wie überall
 * sonst. Die Alternative wäre, den Stempel bis zum ersten Schreibvorgang
 * aufzuschieben; dann müsste ihn dieser Schreibvorgang aus dem Control Plane
 * holen, und genau das soll dieser Weg vermeiden.
 */
export async function rememberCommunityInviter(
  event: H3Event,
  record: { userId: string, inviterId: string },
): Promise<void> {
  const db = counterDb(event)
  const row = await findRow(event, db, record.userId)

  if (!row) {
    await createRow(event, db, record.userId, emptyMemberCounterValues(), false, { invitedBy: record.inviterId })
    return
  }

  if ((row.invitedBy ?? '') !== '') return
  await db.update<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, { invitedBy: record.inviterId }, 'Counters not found')
}

/* ─── Der Leseweg (Abzeichen-Auswertung) ─────────────────────────────────── */

/** Der aktuelle Stand dieses Menschen — `null`, wenn es noch keine Zeile gibt. */
export async function readMemberCounters(event: H3Event, userId: string): Promise<MemberCounters | null> {
  return findRow(event, counterDb(event), userId).catch(softFail('posts:utils/memberCounters:findRow', null))
}

/**
 * Braucht dieser Stand die Aggregate? (Zeile fehlt oder ist noch nicht geeicht.)
 *
 * Die Auswertestelle fragt das, BEVOR sie zählt — nur dann kostet der Seed die
 * beiden zusätzlichen `count`-Abfragen, und zwar einmal je Mensch statt bei
 * jedem Blick in die Galerie.
 */
export function needsCounterSeed(row: MemberCounters | null): boolean {
  return !row || row.seeded !== true
}

/**
 * Die Zähler eichen bzw. nachziehen — und den gültigen Stand zurückgeben.
 *
 * DREI FÄLLE, EINE ANTWORT:
 *  1. keine Zeile ⇒ anlegen, geeicht,
 *  2. Zeile ohne Eichung ⇒ auf die Aggregate setzen und als geeicht markieren,
 *  3. geeichte Zeile, die HINTER dem Aggregat liegt ⇒ nachziehen
 *     (Selbstheilung, Begründung in `shared/memberCounters.ts`).
 * Sonst bleibt alles, wie es ist.
 *
 * FAIL-SOFT: schlägt das Schreiben fehl, wird der GERECHNETE Stand
 * zurückgegeben. Die Abzeichen-Seite zeigt dann das Richtige, nur ohne es
 * festzuhalten — der nächste Aufruf versucht es erneut.
 */
export async function ensureSeededCounters(
  event: H3Event,
  userId: string,
  row: MemberCounters | null,
  aggregates: { topicsCreated?: number, repliesCreated?: number, upvotesGiven?: number, reactionsGiven?: number },
): Promise<MemberCounterValues> {
  const db = counterDb(event)

  if (!row) {
    const values = seedValuesFrom(aggregates)
    await createRow(event, db, userId, values, true)
    return values
  }

  const stored = memberCounterValues(row)

  if (row.seeded !== true) {
    const values = seedValuesFrom(aggregates)
    // ABSOLUT SETZEN, nicht addieren: die Aggregate sind der vollständige
    // Bestand. Was seit dem Anlegen der Zeile hereingezählt wurde, steckt
    // bereits darin — es sei denn, es war eine Bearbeitung oder eine erhaltene
    // Stimme; die beiden Spalten bleiben deshalb erhalten.
    const merged: MemberCounterValues = {
      ...values,
      upvotesReceived: stored.upvotesReceived,
      edits: stored.edits,
    }
    await db.update(MEMBER_COUNTERS_TABLE, row.$id, { ...merged, seeded: true }, 'Counters not found').catch(softFail('posts:utils/memberCounters:update#2', null))
    return merged
  }

  if (counterFellBehind(stored, aggregates)) {
    const healed = healedValues(stored, aggregates)
    await db.update(MEMBER_COUNTERS_TABLE, row.$id, healed, 'Counters not found').catch(softFail('posts:utils/memberCounters:update#3', null))
    return healed
  }

  return stored
}
