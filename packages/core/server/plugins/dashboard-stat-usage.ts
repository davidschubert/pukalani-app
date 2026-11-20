import { softFail } from '../utils/softFail'

/**
 * DIE ZÄHLENDEN KACHELN — EINMAL, FÜR ALLE LAYER (U9/K2, 2026-08-11).
 *
 * „Wie viele Beiträge/Termine/Kurse/Medien/Kommentare hat dieser Mandant?" ist
 * fünfmal dieselbe Abfrage über eine andere Tabelle. Genau diese Frage
 * beantwortet der Verbrauchs-Vertrag schon (`registerCommunityUsageCounter`,
 * F51 Paket 2) — jeder Produkt-Layer hat seinen Posten dort angemeldet, weil
 * der Reiter „Speicher" ihn braucht.
 *
 * Deshalb zählt hier EIN Provider für alle: kein Layer bekommt fünf Zeilen
 * Server-Code, die sich nur im Tabellennamen unterscheiden, und die Zahl auf
 * der Übersicht kann per Bauart nicht von der Zahl im Speicher-Reiter
 * abweichen. Wer eine zählende Kachel will, deklariert sie in seiner
 * `app.config` — mehr nicht.
 *
 * DIE KACHEL-ID IST DER QUOTA-`kind`. Das ist die ganze Verdrahtung, und sie
 * ist bewusst eine Konvention statt eines vierten Feldes: der `kind` ist ohnehin
 * schon zweimal dasselbe Wort (Bremse `assertPoolWriteQuota` und Zähler), ein
 * drittes Feld daneben wäre eine weitere Stelle, an der es auseinanderlaufen
 * kann. Wer eine Kachel `posts` deklariert, bekommt den Posten `posts`; wer
 * eine Id ohne Posten deklariert, bekommt hier nichts (und braucht einen
 * eigenen Provider — so wie `commentsReported` und `members`).
 *
 * DAS KONTINGENT KOSTET NICHTS: `tenantLimitsFor` liest den Tarif-Katalog aus
 * der Config, keine Abfrage. Ohne Quota (Silo, Katalog ohne Zahlen) steht dort
 * schlicht nichts und die Kachel zeigt nur die Zahl statt „x von y".
 *
 * MANDANTENDICHT über die Datentür (`tenantDb`, Befund B2). Die
 * operator-Klinke behält den Admin-Client, wie beim Speicher-Reiter und beim
 * früheren Kommentar-Zähler: die Kennzahl soll auch ausgeblendete Zeilen
 * mitzählen, die Row-Permissions dürfen sie also nicht filtern. Die Tür hängt
 * den communityId-Filter an; im Silo ist das ein No-Op.
 *
 * `db.count` ist EINE Abfrage je Kachel mit `Query.limit(1)` — gelesen wird
 * nur das `total`, nie eine Liste.
 */
export default defineNitroPlugin(() => {
  registerDashboardStatValueProvider({
    id: 'usage',
    async collect(event, ids) {
      const counters = listCommunityUsageCounters().filter(counter => ids.has(counter.kind))
      if (!counters.length) return {}

      const db = tenantDb(event, { as: 'operator' })
      const entries = await Promise.all(counters.map(async (counter) => {
        // Eine fehlende Tabelle (Layer komponiert, Migration noch nicht
        // gelaufen) darf die Nachbar-Kachel nicht mitnehmen.
        const total = await db.count(counter.tableId).catch(softFail('core:plugins/dashboard-stat-usage:count', null))
        if (total === null) return null
        const limit = tenantLimitsFor(event, counter.kind)?.total
        return [counter.kind, { value: total, ...(limit && limit > 0 ? { limit } : {}) }] as const
      }))

      return Object.fromEntries(entries.filter(entry => entry !== null))
    },
  })
})
