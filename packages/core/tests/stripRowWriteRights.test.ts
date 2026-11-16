import { describe, expect, it } from 'vitest'
import { hasRowWriteRight, leaseRowId, parseArgs, samePermissions, withoutRowWriteRights } from '../../../scripts/ops/strip-row-write-rights.mjs'
import { dropAccountWriteRight, restoreAccountCreateRight, withAccountCreateRight, withoutWriteRights } from '../../../scripts/migrations-lib/tableWriteRights.mts'
import { runLeaseRowId } from '../server/utils/runLease'

/**
 * SEC-002 (GA1 P13): die zwei Werkzeuge, die Rechte an der Datenbank ändern —
 * die Hilfe für das Tabellenrecht (Migration und Rückweg) und der Aufräum-Lauf
 * für vorhandene Zeilen. Beide dürfen NUR Schreibrechte anfassen; ein
 * verlorenes Leserecht machte Inhalte unsichtbar und Realtime stumm.
 */

const READS = ['read("any")', 'read("label:c1")', 'read("user:u1")', 'read("label:modc1")']

describe('Zeilen: Schreibrechte fallen, Leserechte bleiben', () => {
  it('nimmt update, delete, write und create — in jeder Rolle', () => {
    const before = ['read("any")', 'update("user:u1")', 'delete("user:u1")', 'read("user:u1")', 'write("label:x")', 'create("users")']
    expect(withoutRowWriteRights(before)).toEqual(['read("any")', 'read("user:u1")'])
  })

  it('lässt jede Art Leserecht unberührt und in ihrer Reihenfolge', () => {
    expect(withoutRowWriteRights(READS)).toEqual(READS)
    expect(hasRowWriteRight(READS)).toBe(false)
  })

  it('erkennt eine Zeile mit Schreibrecht; eine leere Liste ist sauber', () => {
    expect(hasRowWriteRight(['read("any")', 'update("user:u1")'])).toBe(true)
    expect(hasRowWriteRight([])).toBe(false)
    expect(withoutRowWriteRights(undefined)).toEqual([])
  })

  it('der Vergleich nach dem Schreiben: gleiche Rechte in anderer Reihenfolge sind gleich, ein fehlendes Leserecht nicht', () => {
    expect(samePermissions(['read("any")', 'read("user:u1")'], ['read("user:u1")', 'read("any")'])).toBe(true)
    expect(samePermissions(['read("any")'], ['read("any")', 'read("user:u1")'])).toBe(false)
    expect(samePermissions(['read("any")', 'update("user:u1")'], ['read("any")'])).toBe(false)
    expect(samePermissions(undefined, [])).toBe(true)
  })

  it('ein Leserecht, das wie ein Schreibrecht anfängt, gibt es nicht — geprüft wird der Anfang der Zeichenkette', () => {
    expect(hasRowWriteRight(['read("label:update")'])).toBe(false)
  })
})

describe('Aufruf des Aufräum-Laufs', () => {
  const known = ['community_posts', 'comments']

  it('ohne --apply wird nur gezählt', () => {
    expect(parseArgs(['--table', 'comments'], known)).toMatchObject({ tables: ['comments'], apply: false, errors: [] })
  })

  it('eine Tabelle, deren Code noch nicht über den Server schreibt, wird abgelehnt', () => {
    const args = parseArgs(['--table', 'comments,post_votes', '--apply'], known)
    expect(args.errors).toHaveLength(1)
    expect(args.errors[0]).toContain('post_votes')
  })

  it('ohne Tabelle, mit unbekanntem Argument oder unsinnigem Stapel: Fehler', () => {
    expect(parseArgs([], known).errors.length).toBeGreaterThan(0)
    expect(parseArgs(['--table', 'comments', '--alles'], known).errors).toHaveLength(1)
    expect(parseArgs(['--table', 'comments', '--batch', '0'], known).errors).toHaveLength(1)
  })

  it('die Lauf-Sperre nutzt dieselbe Zeilen-Id wie der Server', () => {
    expect(leaseRowId('strip-row-rights', 'comments', 3)).toBe(runLeaseRowId('strip-row-rights', 'comments', 3))
  })
})

describe('Tabellenrecht: nehmen und zurückgeben', () => {
  it('nehmen entfernt jedes Schreib-Recht, Leserechte der Tabelle bleiben', () => {
    expect(withoutWriteRights(['create("users")', 'read("any")', 'update("label:admin")'])).toEqual(['read("any")'])
    expect(withoutWriteRights(['create("users")'])).toEqual([])
  })

  it('zurückgeben setzt genau das Anlege-Recht für Konten, einmal', () => {
    expect(withAccountCreateRight([])).toEqual(['create("users")'])
    expect(withAccountCreateRight(['create("users")'])).toEqual(['create("users")'])
    expect(withAccountCreateRight(['read("any")'])).toEqual(['read("any")', 'create("users")'])
  })

  function fakeTables(table: { name: string, $permissions: string[], rowSecurity: boolean, enabled: boolean } | null) {
    const writes: Record<string, unknown>[] = []
    const tablesDB = {
      async getTable() {
        if (!table) throw Object.assign(new Error('Table not found'), { code: 404 })
        return { ...table, $permissions: [...table.$permissions] }
      },
      async updateTable(input: { name: string, permissions: string[], rowSecurity: boolean, enabled: boolean }) {
        writes.push(input)
        Object.assign(table!, { name: input.name, $permissions: input.permissions, rowSecurity: input.rowSecurity, enabled: input.enabled })
      },
    }
    return { tablesDB: tablesDB as never, writes }
  }

  it('schreibt Name, Zeilen-Rechte-Schalter und „aktiv" unverändert zurück und ist wiederholbar', async () => {
    const table = { name: 'Comments', $permissions: ['create("users")'], rowSecurity: true, enabled: true }
    const { tablesDB, writes } = fakeTables(table)
    expect(await dropAccountWriteRight(tablesDB, 'main', 'comments')).toBe('changed')
    expect(writes).toEqual([{ databaseId: 'main', tableId: 'comments', name: 'Comments', permissions: [], rowSecurity: true, enabled: true }])
    expect(await dropAccountWriteRight(tablesDB, 'main', 'comments')).toBe('unchanged')
    expect(writes).toHaveLength(1)
    // Rückweg: genau der Zustand von vorher.
    expect(await restoreAccountCreateRight(tablesDB, 'main', 'comments')).toBe('changed')
    expect(table.$permissions).toEqual(['create("users")'])
    expect(await restoreAccountCreateRight(tablesDB, 'main', 'comments')).toBe('unchanged')
  })

  it('eine Tabelle, die es im Projekt nicht gibt, ist kein Fehler', async () => {
    const { tablesDB, writes } = fakeTables(null)
    expect(await dropAccountWriteRight(tablesDB, 'main', 'discussion_links')).toBe('missing')
    expect(writes).toEqual([])
  })
})
