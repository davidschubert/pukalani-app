/**
 * DIE AUFBEWAHRUNGSFRIST DES ROHTEXTS — PUR (Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §1.7 Nr. 4, §2.6, §2.9 Nr. 6; MV1 M5).
 *
 * ── DIE ZUSAGE, UM DIE ES GEHT ────────────────────────────────────────────
 * „Rohtext ist Zwischenprodukt, kein Bestand: gespeichert höchstens 24
 * Stunden, danach bleibt nur das strukturierte Marktprofil mit KURZEN
 * Belegzitaten und der Quell-URL." Das ist der Satz, mit dem wir fremden
 * Website-Betreibern gegenübertreten (Erklärseite `/market-bot`) — er ist
 * damit kein Aufräum-Detail, sondern eine Aussage nach aussen.
 *
 * ── ZWEI HÄLFTEN, EINE ZAHL ───────────────────────────────────────────────
 * Die Frist wird beim ABRUF gestempelt (`run.post.ts`) und vom SWEEP
 * eingelöst (`server/utils/marketRawSweep.ts`). Bis MV1 M5 stand die 24 in
 * `run.post.ts` als Rechnung mitten im Schreibvorgang; sie steht jetzt HIER,
 * weil zwei Stellen mit derselben Zahl beim ersten Ändern zwei verschiedene
 * Fristen sind — und die eine davon wäre die, die nach aussen versprochen
 * wurde.
 *
 * ── WARUM DIE ENTSCHEIDUNG PUR IST UND NICHT IN DER ABFRAGE STECKT ───────
 * Die Appwrite-Abfrage (`Query.lessThan('rawExpiresAt', jetzt)` auf dem Index
 * `idx_raw_expires`) ist die schnelle VORAUSWAHL. Was gilt, sagt
 * `marketRawSweepDue` — dasselbe Muster wie bei `shouldPruneGuestAuthor` im
 * comments-Layer: die Abfrage ist das Netz, die Regel ist die Wahrheit, und
 * nur die Regel lässt sich mit einer Gegenprobe zeigen.
 *
 * ── DIE FAIL-RICHTUNG IST HIER UMGEKEHRT ──────────────────────────────────
 * Andere Sweeps dieses Projekts löschen im Zweifel NICHT (ein unlesbares
 * Datum als „unendlich alt" zu lesen wäre dort die teure Richtung). Hier ist
 * es umgekehrt, und zwar aus einem sachlichen Grund: der Rohtext gehört uns
 * nicht. Was hier im Zweifel stehen bleibt, ist FREMDER Seitentext ohne
 * Ablaufdatum — und das ist genau der Zustand, den §2.9 Nr. 6 ausschliesst.
 * Ein zu früh geleerter Rohtext kostet dagegen nichts: das Marktprofil mit
 * seinen Zitaten ist längst geschrieben, und der nächste Lauf holt die Seite
 * ohnehin neu (die Idempotenz hängt am `inputHash` des PROFILS, nicht am
 * Rohtext).
 */

/** Die Frist aus §2.9 Nr. 6 — 24 Stunden ab dem Abruf. */
export const MARKET_RAW_TTL_MS = 24 * 60 * 60_000

/**
 * Der Stempel, der beim Abruf gesetzt wird. `null` heisst „es gibt keinen
 * Rohtext" — und dann darf auch keine Frist daneben stehen, sonst hätte eine
 * leere Zeile ein Ablaufdatum, das nie etwas beträfe.
 */
export function marketRawExpiresAt(hasRawText: boolean, fetchedAt: Date): string | null {
  return hasRawText ? new Date(fetchedAt.getTime() + MARKET_RAW_TTL_MS).toISOString() : null
}

/** Was der Sweep von einer Zeile braucht — mehr geht ihn nichts an. */
export interface MarketRawRetentionRow {
  readonly rawText?: string | null
  readonly rawExpiresAt?: string | null
}

/**
 * IST DIESE ZEILE FÄLLIG?
 *
 * Vier Fälle, jeder mit einer Gegenprobe im Test:
 *
 *  1. Nichts da (kein Rohtext UND kein Stempel) ⇒ NEIN. Ein Schreibvorgang
 *     ohne Wirkung wäre eine Zeile, die sich ohne Grund ändert — und
 *     `$updatedAt` ist an anderer Stelle eine Aussage.
 *  2. Stempel in der Zukunft ⇒ NEIN. Das ist der Normalfall der ersten 24
 *     Stunden, und er ist zugleich die Gegenprobe des ganzen Sweeps.
 *  3. Stempel abgelaufen ⇒ JA.
 *  4. Rohtext OHNE (oder mit unlesbarem) Stempel ⇒ JA. Fremder Seitentext
 *     ohne Ablaufdatum ist genau der Zustand, den die Zusage ausschliesst
 *     (s. Kopf, „Fail-Richtung").
 *
 * FALL 4 IST ENGER ALS DIE ABFRAGE, und das ist Absicht: Appwrites
 * `lessThan` findet keine Zeile mit leerem Stempel. Er steht hier trotzdem,
 * weil diese Funktion sagt, was GILT, und nicht, was die Abfrage findet —
 * fiele der Stempel je aus (ein halb geschriebener Abruf, eine Migration, ein
 * Hand-Eingriff in der Konsole), wäre die Zeile sonst für immer unsichtbar
 * fällig.
 */
export function marketRawSweepDue(row: MarketRawRetentionRow, now: Date): boolean {
  const hasText = Boolean(row.rawText)
  const stamp = row.rawExpiresAt?.trim() ?? ''

  if (!stamp) return hasText

  const parsed = Date.parse(stamp)
  if (!Number.isFinite(parsed)) return true

  return parsed <= now.getTime()
}

/**
 * WAS DER SWEEP SCHREIBT — und nur das.
 *
 * `rawText: ''` statt `null`: beide sind für jeden Leser dasselbe „kein
 * Rohtext" (`Boolean(row.rawText)`), aber die leere Zeichenkette ist der Wert,
 * den der Zeilen-Typ ohnehin zulässt, und sie macht aus einer MEDIUMTEXT-Zeile
 * nachweislich eine leere statt einer nicht gesetzten. `rawExpiresAt: null`,
 * weil eine Frist ohne Text nichts mehr beträfe (s. `marketRawExpiresAt`).
 *
 * DIE FUNKTION GIBT NUR DIESE ZWEI FELDER ZURÜCK. Das ist die halbe
 * Vertraulichkeits-Zusage: der Sweep fasst `market_profiles` NIE an — die
 * Zitate mit ihrer Quell-Adresse sind das ERGEBNIS und leben mit dem Branding
 * (§1.7 Nr. 4: „danach bleibt nur das strukturierte Marktprofil"). Ein Sweep,
 * der auch die Belege nähme, würde die Zusage nicht einlösen, sondern das
 * Produkt löschen.
 */
export function marketRawSweepPatch(): { rawText: string, rawExpiresAt: null } {
  return { rawText: '', rawExpiresAt: null }
}
