/**
 * Schema-Stand (OPS-008) — die reine Logik hinter dem Feld `schema` von
 * `/api/health`.
 *
 * Deploys laufen automatisch, Migrationen von Hand. Zweimal ging neuer Code
 * live, bevor seine Migration gelaufen war. Davids Entscheidung: „Die
 * Plattform zeigt, ob die Datenbank zum ausgerollten Programm passt, und der
 * tägliche Wächter prüft es."
 *
 * Gemessen wird NICHT über einen Zeiger (der lügt, sobald eine Migration
 * einzeln von Hand läuft), sondern am wirklichen Schema: jeder Produkt-Layer
 * nennt in seinem `product.manifest.ts` EINE Probe (Tabelle, meist mit
 * Spalte), die es erst nach seiner jüngsten ablesbaren Migration gibt. Die
 * Abfrage dazu macht `server/utils/schemaState.ts`; hier steht nur, wie ein
 * Ergebnis zu lesen ist — pur, ohne Netz, ohne SDK.
 */

/** Was die Öffentlichkeit sieht: ein Zustandswort und zwei Zahlen, NIE Namen. */
export interface SchemaState {
  /**
   * ok      — alle Proben gefunden
   * behind  — mindestens eine Probe fehlt SICHER (Migration ausstehend)
   * unknown — nichts fehlt sicher, aber mindestens eine Probe ließ sich nicht
   *           lesen (Ausfall, Frist, falscher Schlüssel) — KEIN Alarmgrund
   */
  state: 'ok' | 'behind' | 'unknown'
  /** Anzahl der Proben (= Layer mit Migrationen in diesem Build). */
  expected: number
  /** Davon gefunden; `null`, wenn der Zustand `unknown` ist. */
  found: number | null
}

/** Ergebnis EINER Probe. */
export type ProbeOutcome = 'present' | 'missing' | 'unknown'

/**
 * Appwrite-Fehler einer Probe → „fehlt sicher" oder „weiß nicht".
 *
 * Gemessen gegen Appwrite 2.7.1 mit dem Laufzeit-Schlüssel:
 *  - fehlende Tabelle ⇒ 404 mit `type: 'table_not_found'`
 *  - fehlende Spalte  ⇒ 400 mit `type: 'general_query_invalid'`
 *    („Invalid query: Attribute not found in schema: …")
 *
 * Alles andere ist KEIN Beweis für eine ausstehende Migration: ein 404 ohne
 * Art kommt vom Proxy vor Appwrite (Dienst fehlt), 401/403 heißt falscher
 * Schlüssel, 5xx und Netzfehler sind Ausfälle — dieselbe Strenge wie
 * `isAppwriteTableMissing` (server/utils/listAllRows.ts). Bewusst per
 * Duck-Typing statt `instanceof AppwriteException`: `shared/` zieht kein SDK.
 *
 * Grenzfall, bewusst hingenommen: `general_query_invalid` meldet Appwrite für
 * JEDE ungültige Abfrage. Die Probe-Abfrage ist fest (`limit(1)` +
 * `select([spalte])`) und nur der Spaltenname ändert sich — ein Tippfehler im
 * Manifest zeigte also dauerhaft `behind`, und genau das soll er auch.
 */
export function classifyProbeError(error: unknown): 'missing' | 'unknown' {
  if (typeof error !== 'object' || error === null) return 'unknown'
  const { code, type } = error as { code?: unknown, type?: unknown }
  if (code === 404 && type === 'table_not_found') return 'missing'
  if (code === 400 && type === 'general_query_invalid') return 'missing'
  return 'unknown'
}

/**
 * Proben → Zustand. Ein SICHERES Fehlen schlägt jeden Lesefehler: fehlt eine
 * Spalte, ist die Datenbank hinter dem Programm, egal ob eine andere Probe
 * gerade nicht antwortete (`found` zählt dann nur die gefundenen). Ohne
 * sicheres Fehlen macht schon EIN Lesefehler den Zustand `unknown`. Keine
 * Proben (Build ohne Layer mit Migrationen) ⇒ `ok` mit 0/0.
 */
export function aggregateSchemaState(outcomes: readonly ProbeOutcome[]): SchemaState {
  const expected = outcomes.length
  const found = outcomes.filter(outcome => outcome === 'present').length
  if (outcomes.includes('missing')) return { state: 'behind', expected, found }
  if (outcomes.includes('unknown')) return { state: 'unknown', expected, found: null }
  return { state: 'ok', expected, found }
}
