/**
 * SPALTEN-SOLL JE APP gegen das IST einer Datenbank — reine Logik, ohne Netz
 * (MG1 c, 2026-11-18). `scripts/ops/verify-schema-parity.mjs` holt das Ist
 * und gibt aus; die Tests in `packages/core/tests/schemaColumns.test.ts`
 * rufen diese Funktionen direkt mit ausgeschriebenem Soll und Ist.
 *
 * DAS SOLL kommt aus den Migrations-Dateien (`layerInventory` in
 * `migration-inventory.mjs`), und zwar NUR für die Layer, die die App laut
 * `site.manifest.ts` nutzt — dieselbe Auswahl, mit der der Migrations-Runner
 * entscheidet, was er in ihrem Projekt fahren darf (`allowedLayersOf` aus
 * `migrate-plan.mjs` über `LAYER_ORDER` aus `scripts/migrate.mjs`). Tabellen anderer Layer, die in einem
 * Projekt noch herumliegen (Alt-Tabellen in `portfolio`, der eingefrorene
 * Schatten `communities` und `tickets` in `account`), haben kein Soll und
 * erzeugen hier keinen Befund — ob es sie geben DARF, sagt die gepflegte
 * Tabellen-Liste im Skript.
 *
 * WAS BEWUSST NICHT VERGLICHEN WIRD — und trotzdem in der Ausgabe steht:
 *   • ein Layer, dessen Migrationen der Leser nicht ganz versteht
 *     (`inventory.unresolved`, ohne Eintrag in `MIGRATION_READ_HINTS`): sein
 *     Soll wäre lückenhaft, jede Spalte der Lücke würde als „zu viel"
 *     gemeldet. Er wird ausgelassen und als `skipped` genannt; rot wird
 *     dafür `pnpm check:manifests` (Pflicht-Prüfung `lint`).
 *   • Spalten, die ein Layer an einer Tabelle anlegt, die kein genutzter
 *     Layer anlegt (`inventory.touched` ohne Besitzer): ohne die übrigen
 *     Spalten der Tabelle gäbe es nur Scheinbefunde. Heute gibt es keinen
 *     solchen Fall.
 *   • Tabellen, die keine Migration anlegt (heute nur `intro_requests` aus
 *     `apps/portfolio/scripts/ensure-intro-requests.mjs`, und `portfolio`
 *     nutzt dafür keinen Layer): sie haben kein Spalten-Soll; ihr Dasein prüft
 *     die gepflegte Tabellen-Liste.
 *   • Appwrites eigene Felder (`$id`, `$createdAt`, …) zählen nie.
 *
 * GRENZE DES LESERS: `layerInventory` rechnet je Layer. Löscht ein Layer eine
 * Spalte an der Tabelle eines ANDEREN Layers, sieht das Soll die Spalte
 * weiter — der Lauf meldete dann „Spalte fehlt" (laut, nicht still). Heute
 * löscht keine Migration fremde Tabellen oder Spalten. Für die zwei Tabellen,
 * deren Spalten eine Migration zur Laufzeit kopiert (`MIGRATION_READ_HINTS`,
 * control-029: `communities`, `community_plans`), gilt die Kopie aus dem
 * Eintrag als Soll — sie WIRD verglichen.
 */

/**
 * `LAYER_ORDER` aus dem QUELLTEXT von `scripts/migrate.mjs` — mit derselben
 * Regel, mit der `scripts/check-manifests.mjs` sie liest (der Runner läuft
 * beim Import los, deshalb kein `import`). Leere Liste = nicht gefunden; der
 * Aufrufer muss dann laut scheitern, sonst gäbe es kein Soll und alles wäre
 * „grün".
 *
 * @param {string} source
 * @returns {string[]}
 */
export function readLayerOrder(source) {
  const match = source.match(/const LAYER_ORDER = \[([^\]]+)\]/)
  return match ? [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]) : []
}

/** Appwrites eigene Felder — tauchen je nach Version in Listen auf, zählen nie. */
export const isSystemField = key => key.startsWith('$')

/**
 * @typedef {{ tables: Map<string, Set<string>>, touched: Map<string, Set<string>>, unresolved: string[] }} Inventory
 * @typedef {{ table: string, layer: string, columns: Set<string> }} SollTable
 * @typedef {{ layer: string, table: string | null, reason: string }} Skipped
 */

/**
 * Das Spalten-Soll einer App aus den Inventaren ihrer Layer.
 *
 * @param {{ layer: string, inventory: Inventory }[]} inventories  in Lauf-Reihenfolge
 * @returns {{ tables: Map<string, SollTable>, skipped: Skipped[] }}
 */
export function columnSoll(inventories) {
  /** @type {Map<string, SollTable>} */
  const tables = new Map()
  /** @type {Skipped[]} */
  const skipped = []
  const readable = []
  for (const { layer, inventory } of inventories) {
    if (inventory.unresolved.length > 0) {
      skipped.push({
        layer,
        table: null,
        reason: `${inventory.unresolved.length} Stelle(n) seiner Migrationen nicht lesbar — Soll wäre lückenhaft (pnpm check:manifests nennt sie)`,
      })
      continue
    }
    readable.push({ layer, inventory })
    for (const [table, columns] of inventory.tables) {
      tables.set(table, { table, layer, columns: new Set(columns) })
    }
  }
  for (const { layer, inventory } of readable) {
    for (const [table, columns] of inventory.touched) {
      const target = tables.get(table)
      if (target) {
        for (const column of columns) target.columns.add(column)
      }
      else {
        skipped.push({ layer, table, reason: 'legt Spalten an einer Tabelle an, die kein genutzter Layer anlegt — ohne deren übrige Spalten gäbe es nur Scheinbefunde' })
      }
    }
  }
  return { tables, skipped }
}

/**
 * Soll gegen Ist.
 *
 * @param {Map<string, SollTable>} soll
 * @param {Map<string, Set<string> | null>} ist  Spalten je Soll-Tabelle; `null` = Tabelle fehlt
 * @returns {{
 *   missingTables: { table: string, layer: string }[],
 *   missingColumns: { table: string, layer: string, columns: string[] }[],
 *   extraColumns: { table: string, layer: string, columns: string[] }[],
 *   compared: number,
 * }}
 */
export function compareColumns(soll, ist) {
  const missingTables = []
  const missingColumns = []
  const extraColumns = []
  let compared = 0
  for (const { table, layer, columns } of [...soll.values()].sort((a, b) => a.table.localeCompare(b.table))) {
    const present = ist.get(table)
    if (!present) {
      missingTables.push({ table, layer })
      continue
    }
    compared += 1
    const actual = new Set([...present].filter(key => !isSystemField(key)))
    const missing = [...columns].filter(column => !actual.has(column)).sort()
    const extra = [...actual].filter(column => !columns.has(column)).sort()
    if (missing.length) missingColumns.push({ table, layer, columns: missing })
    if (extra.length) extraColumns.push({ table, layer, columns: extra })
  }
  return { missingTables, missingColumns, extraColumns, compared }
}

/**
 * Ausgabe-Zeilen für EINE Instanz. Mit `ci` (öffentliches Protokoll) nennt
 * sie nur, was im Repo steht: Tabelle, Layer, Soll-Spalten. Eine Spalte, die
 * kein Soll kennt, gibt es nur auf Production — dort nur die ANZAHL.
 *
 * @param {string} instance
 * @param {ReturnType<typeof columnSoll>} soll
 * @param {ReturnType<typeof compareColumns>} result
 * @param {{ ci: boolean }} options
 * @returns {{ lines: string[], fatal: number }}
 */
export function columnReport(instance, soll, result, { ci }) {
  const name = instance.padEnd(10)
  const lines = []
  for (const { table, layer } of result.missingTables) {
    lines.push(`✖  ${name} ${table}: TABELLE FEHLT (Layer ${layer}) — Migrationen des Layers nachholen`)
  }
  for (const { table, layer, columns } of result.missingColumns) {
    lines.push(`✖  ${name} ${table}: SPALTE FEHLT ${columns.join(', ')} (Layer ${layer}) — Migration des Layers nachholen`)
  }
  for (const { table, layer, columns } of result.extraColumns) {
    const what = ci ? `${columns.length} Spalte(n) — Namen am Mac: pnpm ops:schema-parity` : columns.join(', ')
    lines.push(`✖  ${name} ${table}: SPALTE OHNE SOLL ${what} (Layer ${layer}) — von Hand angelegt? Migration schreiben oder Spalte entfernen`)
  }
  for (const { layer, table, reason } of soll.skipped) {
    lines.push(`⚠  ${name} nicht verglichen: Layer ${layer}${table ? `, Tabelle ${table}` : ''} — ${reason}`)
  }
  const fatal = result.missingTables.length
    + result.missingColumns.reduce((sum, f) => sum + f.columns.length, 0)
    + result.extraColumns.reduce((sum, f) => sum + f.columns.length, 0)
  if (fatal === 0) {
    lines.unshift(`✔  ${name} ${result.compared} Tabellen spaltengleich mit dem Soll ihrer Layer`)
  }
  return { lines, fatal }
}
