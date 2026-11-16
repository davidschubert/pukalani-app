import { describe, expect, it } from 'vitest'
import { dataDoorGlobs, dataDoorProblems } from '../../../scripts/lib/data-door-layers.mjs'
import { layerInventory, readMigrationSource } from '../../../scripts/lib/migration-inventory.mjs'

/**
 * OPS-012 (GA1 P20): der Leser, aus dem drei Wächter ihre Listen ziehen
 * (Lösch-Pflicht, Datentür, Soll der Schema-Parität). Er liest Quelltext,
 * keinen Syntaxbaum — deshalb steht hier je Schreibstil der Migrationen eine
 * Probe, und eine dafür, dass er Unverstandenes MELDET statt verschweigt.
 */
const events = (source: string) => readMigrationSource(source).events
  .map(event => `${event.kind} ${event.table}${event.column ? `.${event.column}` : ''}`)

describe('Leser der Migrationen', () => {
  it('Literal und Konstante derselben Datei', () => {
    expect(events(`
      const CHECKS = 'brand_checks'
      await tablesDB.createTable({ databaseId, tableId: CHECKS, name: 'Checks' })
      await tablesDB.createVarcharColumn({ databaseId, tableId: CHECKS, key: 'userId', size: 36 })
      await tablesDB.createDatetimeColumn({ databaseId, tableId: 'brand_checks', key: 'erasedAt', required: false })
    `)).toEqual(['create brand_checks', 'create brand_checks.userId', 'create brand_checks.erasedAt'])
  })

  it('Kommentare zählen nicht — auch nicht, wenn sie wie ein Aufruf aussehen', () => {
    expect(events(`
      // tablesDB.createTable({ databaseId, tableId: 'alt' })
      /* tablesDB.createVarcharColumn({ databaseId, tableId: 'alt', key: 'userId' }) */
      const url = 'http://localhost/v1' // kein Kommentar-Anfang im Text
      await tablesDB.createTable({ databaseId, tableId: 'neu', name: 'Neu' })
    `)).toEqual(['create neu'])
  })

  it('Schleife über eine Listen-Konstante', () => {
    expect(events(`
      const TABLES = ['comments', 'comment_votes']
      for (const table of TABLES) {
        await tablesDB.createVarcharColumn({ databaseId: db, tableId: table, key: 'communityId', size: 36 })
      }
    `)).toEqual(['create comments.communityId', 'create comment_votes.communityId'])
  })

  it('Schleife über Objekte: Destrukturierung und `eintrag.eigenschaft`', () => {
    expect(events(`
      const TARGETS = [{ table: 'posts', index: 'a' }, { table: 'post_votes', index: 'b' }]
      for (const { table, index } of TARGETS) {
        await tablesDB.createVarcharColumn({ databaseId, tableId: table, key: 'communityId', size: 36 })
      }
      const COLUMNS: readonly { key: string, size: number }[] = [{ key: 'industry', size: 120 }, { key: 'about', size: 2_000 }]
      for (const column of COLUMNS) {
        await tablesDB.createVarcharColumn({ databaseId, tableId: 'brand_profiles', key: column.key, size: column.size })
      }
    `)).toEqual([
      'create posts.communityId', 'create post_votes.communityId',
      'create brand_profiles.industry', 'create brand_profiles.about',
    ])
  })

  it('Schleife über Paare an Ort und Stelle, samt Löschen', () => {
    expect(events(`
      for (const [source, target] of [['tenants', 'communities'], ['tenant_plans', 'community_plans']] as const) {
        await tablesDB.deleteTable({ databaseId: db, tableId: source })
      }
    `)).toEqual(['drop tenants', 'drop tenant_plans'])
  })

  it('Hilfsfunktion: der Parameter nimmt die Werte jeder Aufrufstelle an', () => {
    expect(events(`
      async function dropTable(tableId: string) {
        await tablesDB.deleteTable({ databaseId, tableId })
      }
      await dropTable('comment_votes')
      await tablesDB.createTable({ databaseId, tableId: 'comment_votes', name: 'Votes' })
    `)).toEqual(['drop comment_votes', 'create comment_votes'])
  })

  it('ein Aufruf in einer Hilfsfunktion zählt dort, wo sie GERUFEN wird (Umbau „löschen, neu anlegen", pages-002)', () => {
    // Die Hilfsfunktion steht OBEN in der Datei. Zählte ihr Aufruf an der
    // Definition, stünde „anlegen" vor „löschen" — und die Spalte gälte als weg.
    const source = `
      const TABLE = 'pages'
      async function createMediumtext(key: string) {
        await tablesDB.createMediumtextColumn({ databaseId, tableId: TABLE, key, required: false })
      }
      await createMediumtext('body_tmp')
      await tablesDB.deleteColumn({ databaseId, tableId: TABLE, key: 'body' })
      await createMediumtext('body')
      await tablesDB.deleteColumn({ databaseId, tableId: TABLE, key: 'body_tmp' })
    `
    expect(events(source)).toEqual(['create pages.body_tmp', 'drop pages.body', 'create pages.body', 'drop pages.body_tmp'])
    const inventory = layerInventory('/x', 'pages', {
      files: [
        { rel: 'x/001.ts', file: '/x/001.ts' },
        { rel: 'x/002.ts', file: '/x/002.ts' },
      ],
      read: (file: string) => (file === '/x/001.ts'
        ? `await tablesDB.createTable({ databaseId, tableId: 'pages' })
           await tablesDB.createVarcharColumn({ databaseId, tableId: 'pages', key: 'body' })`
        : source),
      hints: {},
    })
    expect([...inventory.tables.get('pages')!]).toEqual(['body'])
  })

  it('ein Parameter überdeckt eine gleichnamige Konstante — jeder Aufruf bringt seinen eigenen Wert mit', () => {
    expect(events(`
      const table = 'falsch'
      async function addOwner(table: string) {
        await tablesDB.createVarcharColumn({ databaseId, tableId: table, key: 'ownerId', size: 36 })
      }
      await addOwner('notes')
      await addOwner('lists')
    `)).toEqual(['create notes.ownerId', 'create lists.ownerId'])
  })

  it('Fabrik mit Parameter-Objekt (Stil von scripts/migrations-lib/runLeaseTable.mts)', () => {
    expect(events(`
      export async function ensureRunLeaseTable(input: { tablesDB: TablesDB, databaseId: string, tableId: string, name: string }): Promise<void> {
        const { tablesDB, databaseId, tableId, name } = input
        await tablesDB.createTable({ databaseId, tableId, name, permissions: [] })
        await tablesDB.createVarcharColumn({ databaseId, tableId, key: 'scope', size: 64 })
      }
      await ensureRunLeaseTable({ tablesDB, databaseId, tableId: 'market_runs', name: 'Runs' })
    `)).toEqual(['create market_runs', 'create market_runs.scope'])
  })

  it('GEGENPROBE: was er nicht lesen kann, meldet er — mit Zeile und Aufruf', () => {
    const result = readMigrationSource(`
      const target = process.env.TABLE
      await tablesDB.createTable({ databaseId, tableId: target, name: 'x' })
      for (const raw of src.columns) {
        await tablesDB.createVarcharColumn({ databaseId, tableId: 'communities', key: raw.key })
      }
    `)
    expect(result.events).toEqual([])
    expect(result.unresolved).toHaveLength(2)
    expect(result.unresolved[0]).toContain('createTable — tableId nicht lesbar')
    expect(result.unresolved[1]).toContain('createVarcharColumn an communities — Spaltenname nicht lesbar')
  })

  it('Stand nach allen Dateien eines Layers: gelöschte Spalten und Tabellen fallen weg, fremde Tabellen stehen unter `touched`', () => {
    const files = new Map([
      ['/x/001.ts', `await tablesDB.createTable({ databaseId, tableId: 'notes' })
        await tablesDB.createVarcharColumn({ databaseId, tableId: 'notes', key: 'tenantId' })
        await tablesDB.createVarcharColumn({ databaseId, tableId: 'notes', key: 'userId' })
        await tablesDB.createTable({ databaseId, tableId: 'alt' })`],
      ['/x/002.ts', `await tablesDB.deleteColumn({ databaseId, tableId: 'notes', key: 'tenantId' })
        await tablesDB.deleteTable({ databaseId, tableId: 'alt' })
        await tablesDB.createBooleanColumn({ databaseId, tableId: 'app_config', key: 'notesEnabled' })`],
    ])
    const inventory = layerInventory('/x', 'notes', {
      files: [...files.keys()].map(file => ({ rel: file.slice(1), file })),
      read: (file: string) => files.get(file)!,
      hints: {},
    })
    expect([...inventory.tables].map(([table, columns]) => [table, [...columns]])).toEqual([['notes', ['userId']]])
    expect([...inventory.touched].map(([table, columns]) => [table, [...columns]])).toEqual([['app_config', ['notesEnabled']]])
    expect(inventory.unresolved).toEqual([])
  })

  it('ein Hinweis für eine Datei, die inzwischen ganz lesbar ist, ist eine tote Ausnahme', () => {
    const inventory = layerInventory('/x', 'notes', {
      files: [{ rel: 'x/001.ts', file: '/x/001.ts' }],
      read: () => `await tablesDB.createTable({ databaseId, tableId: 'notes' })`,
      hints: { 'x/001.ts': { reason: 'früher eine Kopie', copies: [] } },
    })
    expect(inventory.staleHints).toHaveLength(1)
    expect(inventory.staleHints[0]).toContain('Eintrag streichen')
  })
})

describe('Datentür-Liste gegen die Migrationen', () => {
  const layer = (key: string, tenantTables: string[] = [], hasServerApi = true) => ({ key, tenantTables, hasServerApi })
  const reason = 'Per Definition mandantenübergreifend; die Grenze ziehen die Rollen-Gates der Routen.'

  it('ESLint bekommt je Layer seine zwei Ordner, `admin` nur die Routen', () => {
    const globs = dataDoorGlobs()
    expect(globs).toContain('packages/comments/server/api/**')
    expect(globs).toContain('packages/comments/server/plugins/**')
    expect(globs).toContain('packages/admin/server/api/**')
    expect(globs).not.toContain('packages/admin/server/plugins/**')
  })

  it('GEGENPROBE: ein neuer Layer mit `communityId`, der nirgends steht, ist rot', () => {
    const problems = dataDoorProblems({
      layers: [layer('comments', ['comments']), layer('polls', ['polls', 'poll_answers'])],
      door: [{ layer: 'comments', scope: 'api+plugins' }],
      exempt: {},
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('packages/polls')
    expect(problems[0]).toContain('polls, poll_answers')
    expect(problems[0]).toContain('DATA_DOOR_LAYERS')
  })

  it('in der Liste oder begründet ausgenommen: nichts zu melden', () => {
    expect(dataDoorProblems({
      layers: [layer('comments', ['comments']), layer('control', ['communities']), layer('admin')],
      door: [{ layer: 'comments', scope: 'api+plugins' }, { layer: 'admin', scope: 'api' }],
      exempt: { control: reason },
    })).toEqual([])
  })

  it('tote Einträge sind rot: Layer weg, Ausnahme ohne `communityId`, Ausnahme ohne Grund, doppelt geführt', () => {
    const problems = dataDoorProblems({
      layers: [layer('comments', ['comments']), layer('control'), layer('system', ['notifications'])],
      door: [{ layer: 'comments', scope: 'api+plugins' }, { layer: 'forum', scope: 'api+plugins' }],
      exempt: { control: reason, system: 'so halt', comments: reason },
    })
    expect(problems.some(p => p.includes('„forum" — den Layer gibt es nicht'))).toBe(true)
    expect(problems.some(p => p.includes('„control" legt keine `communityId`-Spalte'))).toBe(true)
    expect(problems.some(p => p.includes('„system" — ohne tragfähigen Grund'))).toBe(true)
    expect(problems.some(p => p.includes('„comments" steht auch in DATA_DOOR_LAYERS'))).toBe(true)
    expect(problems).toHaveLength(4)
  })
})
