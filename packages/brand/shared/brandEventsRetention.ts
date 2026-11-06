/**
 * DIE AUFBEWAHRUNGSFRIST DER FUNNEL-EREIGNISSE — PUR (Migration
 * `scripts/migrations/007-brand-events.ts`, Kopfabschnitt „RETENTION";
 * Faktenblatt `docs/plans/BRANDING-SUPPLY-FAKTENBLATT.md` §2 Zeile 12).
 *
 * ── DIE ZUSAGE, UM DIE ES GEHT ────────────────────────────────────────────
 * „Betreiber-Ereignisse leben 24 Monate." Der Satz stand ab Tag eins im Kopf
 * der Migration — die MECHANIK dazu fehlte bis BS1 R1b, und das Faktenblatt
 * hat es beim Erheben gefunden („Migration nennt 24 Monate — der zugehörige
 * Sweep ist NICHT gebaut. Faktisch also unbefristet"). Eine genannte Frist
 * ohne Sweep ist keine Kleinigkeit im Betrieb, sondern eine öffentliche
 * Falschaussage über das eigene Verhalten, sobald sie in einer
 * Datenschutzerklärung steht.
 *
 * ── EINE WAHRHEIT, DREI LESER ─────────────────────────────────────────────
 * `BRAND_EVENTS_RETENTION_MONTHS` ist die EINE Zahl. Der Migrationskopf zeigt
 * auf sie, die Datenschutz-Abschnitte zitieren sie, der Sweep rechnet mit ihr.
 * Zwei Stellen mit derselben Zahl sind beim ersten Ändern zwei verschiedene
 * Fristen — und die eine davon wäre die, die nach aussen versprochen wurde
 * (dieselbe Begründung wie bei `MARKET_RAW_TTL_MS` im market-Layer).
 *
 * ── WARUM DIE ENTSCHEIDUNG PUR IST UND NICHT IN DER ABFRAGE STECKT ───────
 * `Query.lessThan('$createdAt', cutoff)` ist die schnelle VORAUSWAHL. Was
 * GILT, sagt `brandEventSweepDue` — dasselbe Muster wie `shouldPruneGuestAuthor`
 * (comments) und `marketRawSweepDue` (market): die Abfrage ist das Netz, die
 * Regel ist die Wahrheit, und nur die Regel lässt sich mit einer Gegenprobe
 * zeigen.
 *
 * ── IM ZWEIFEL WIRD NICHT GELÖSCHT ────────────────────────────────────────
 * Ohne lesbaren Zeitstempel ⇒ NICHT fällig. Das ist die Fail-Richtung von
 * `shouldPruneGuestAuthor` und bewusst NICHT die von `marketRawSweepDue`: dort
 * liegt FREMDER Seitentext, den wir versprochen haben loszuwerden, hier liegt
 * unsere EIGENE Messung — und darunter der `step.restarted`-Schnappschuss, der
 * als Audit-Eintrag existiert. Ein unlesbares Datum als „unendlich alt" zu
 * lesen hiesse, genau den Eintrag zu vernichten, für den es ihn gibt.
 */

/** Die Frist aus dem Kopf von `007-brand-events.ts` — 24 Monate ab dem Ereignis. */
export const BRAND_EVENTS_RETENTION_MONTHS = 24

/**
 * Der Stichtag: älter als dieser Zeitpunkt ⇒ fällig.
 *
 * KALENDER-Monate, nicht 24 × 30 Tage. Der Unterschied sind bei zwei Jahren
 * gut drei Wochen, und die Zusage nennt Monate — eine Rechnung in Tagen wäre
 * eine zweite, stillere Frist neben der geschriebenen.
 *
 * DER 29. FEBRUAR ROLLT WEITER, und das ist die richtige Richtung: 24 Monate
 * vor dem 29.02.2028 gibt es nicht, JavaScript macht daraus den 01.03.2026.
 * Der Stichtag liegt damit einen Tag SPÄTER, die betroffene Zeile fällt also
 * einen Tag FRÜHER — bei einer Aufbewahrungsfrist ist „kürzer" die sichere
 * Seite, „länger" wäre der Bruch der Zusage.
 */
export function brandEventsRetentionCutoff(now: Date): string {
  const cutoff = new Date(now.getTime())
  cutoff.setUTCMonth(cutoff.getUTCMonth() - BRAND_EVENTS_RETENTION_MONTHS)
  return cutoff.toISOString()
}

/** Was der Sweep von einer Zeile braucht — mehr geht ihn nichts an. */
export interface BrandEventRetentionRow {
  readonly $createdAt?: string
}

/**
 * IST DIESE ZEILE FÄLLIG? Drei Fälle, jeder mit einer Gegenprobe im Test:
 *
 *  1. Älter als der Stichtag ⇒ JA.
 *  2. Jünger (auch nur um eine Sekunde) ⇒ NEIN. Das ist der Normalfall der
 *     ersten 24 Monate und zugleich die Gegenprobe des ganzen Sweeps.
 *  3. Kein oder unlesbarer Zeitstempel ⇒ NEIN (s. Kopf, „Fail-Richtung").
 *
 * EXAKT AUF DEM STICHTAG heisst NICHT fällig: die Frist ist dann gerade
 * abgelaufen und nicht überschritten, und die Sekunde gehört im Zweifel dem
 * Aufbewahren. Die Abfrage (`lessThan`) sagt dasselbe — beide Seiten müssen
 * hier dieselbe Grenze ziehen, sonst zählt der Sweep Zeilen als „geprüft", die
 * er nie anfasst.
 */
export function brandEventSweepDue(row: BrandEventRetentionRow, now: Date): boolean {
  if (!row.$createdAt) return false
  const created = Date.parse(row.$createdAt)
  if (!Number.isFinite(created)) return false
  return created < Date.parse(brandEventsRetentionCutoff(now))
}
