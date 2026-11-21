import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * DIE KOPIE DES RUNNERS BLEIBT GLEICH (Q26, ARC-005).
 *
 * `tools/ai-runner/src/protocol.ts` kopiert die Typen der Naht bewusst, statt
 * sie zu importieren (der Kopf dort sagt warum). Dieser Test vergleicht beide
 * Dateien als TEXT — ein Import der Runner-Datei zöge sie in den Layer, und
 * ein Typ ist zur Laufzeit nicht da. Er wird rot, sobald eine Liste oder ein
 * Feldname auf einer Seite wandert und auf der anderen nicht.
 */

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const PROTOCOL = read('../../../tools/ai-runner/src/protocol.ts')
const LAYER_TYPES = read('../shared/types/runner.ts')
const LAYER_GUARDS = read('../shared/runGuards.ts')

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Die Zeichenketten zwischen `export const NAME` und dem nächsten `]`. */
function constList(source: string, name: string): string[] {
  const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(stripComments(source))
  if (!match) throw new Error(`Liste ${name} nicht gefunden`)
  return [...match[1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!)
}

/** Die Zeichenketten einer Union `export type NAME = 'a' | 'b'`. */
function unionMembers(source: string, name: string): string[] {
  const match = new RegExp(`export type ${name}\\s*=([^;]*?)(?:\\n\\n|\\nexport|$)`).exec(stripComments(source))
  if (!match) throw new Error(`Typ ${name} nicht gefunden`)
  return [...match[1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!)
}

/** Die Feldnamen der obersten Ebene eines `export interface NAME`. */
function interfaceFields(source: string, name: string): string[] {
  const clean = stripComments(source)
  const start = clean.search(new RegExp(`export interface ${name}\\b`))
  if (start < 0) throw new Error(`Interface ${name} nicht gefunden`)
  const end = clean.indexOf('\n}', start)
  const body = clean.slice(clean.indexOf('{', start) + 1, end)
  return [...body.matchAll(/^ {2}(\$?\w+)\??:/gm)].map(m => m[1]!)
}

/** Der Typ eines Felds als Text, z. B. `'status' | 'tool'`. */
function fieldType(source: string, iface: string, field: string): string[] {
  const clean = stripComments(source)
  const start = clean.search(new RegExp(`export interface ${iface}\\b`))
  const body = clean.slice(start, clean.indexOf('\n}', start))
  const match = new RegExp(`^ {2}${field}\\??:\\s*([^\\n]+)`, 'm').exec(body)
  if (!match) throw new Error(`Feld ${iface}.${field} nicht gefunden`)
  return [...match[1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!)
}

describe('tools/ai-runner/src/protocol.ts gegen packages/runner', () => {
  it('kennt dieselben Berechtigungs-Modi', () => {
    expect(constList(PROTOCOL, 'PERMISSION_MODES')).toEqual(constList(LAYER_TYPES, 'PERMISSION_MODES'))
  })

  it('sperrt ungeprüfte Aufträge auf dieselben Modi', () => {
    expect(constList(PROTOCOL, 'UNTRUSTED_PERMISSION_MODES')).toEqual(constList(LAYER_GUARDS, 'UNTRUSTED_PERMISSION_MODES'))
  })

  it('kennt dieselben Lauf-Zustände', () => {
    const layer = constList(LAYER_TYPES, 'RUN_STATUSES')
    expect(unionMembers(PROTOCOL, 'RunStatus')).toEqual(layer)
    for (const status of unionMembers(PROTOCOL, 'RunFinalStatus')) expect(layer).toContain(status)
  })

  it('liest nur Felder, die der Lauf im Layer hat', () => {
    const layer = new Set(['$id', ...interfaceFields(LAYER_TYPES, 'RunRow')])
    const copy = interfaceFields(PROTOCOL, 'RunPayload')
    expect(copy.length).toBeGreaterThan(10)
    expect(copy.filter(field => !layer.has(field))).toEqual([])
  })

  it('kennt dieselben Ereignis-Arten', () => {
    expect(unionMembers(PROTOCOL, 'RunEventKind')).toEqual(fieldType(LAYER_TYPES, 'RunEventRow', 'kind'))
  })

  it.each([
    ['RunAttachment', 'RunAttachment'],
    ['EventsAckResponse', 'EventsAckResponse'],
    ['TranscriptUploadResponse', 'TranscriptUploadResponse'],
    ['HeartbeatResponse', 'HeartbeatResponse'],
    ['SessionEndState', 'SessionEndStateResponse'],
  ])('%s hat dieselben Felder wie %s im Layer', (copyName, layerName) => {
    expect(interfaceFields(PROTOCOL, copyName)).toEqual(interfaceFields(LAYER_TYPES, layerName))
  })
})
