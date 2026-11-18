import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { commentNotificationRowId } from '../server/utils/commentNotifications'

/**
 * EL1 (d): das Aufräum-Skript (`scripts/ops/erasure-backfill.mjs`, Regel
 * `notification-excerpts`) leert den Auszug alter Meldungen. „Alt" erkennt es
 * an der ID: seit dem 2026-11-15 trägt jede Meldung dieses Layers die feste Id
 * aus `commentNotificationRowId`. Das Skript importiert nichts aus dem Layer —
 * ändert sich hier die Form der Id oder kommt ein Typ mit Auszug dazu, würde
 * es NEUE Meldungen für Bestand halten und leeren. Dieser Test wird dann rot.
 */
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'ops', 'erasure-backfill.mjs')
const source = readFileSync(SCRIPT, 'utf8')

function scriptConstant(name: string): string {
  const match = new RegExp(`const ${name} = (.+)`).exec(source)
  if (!match) throw new Error(`${name} fehlt im Skript`)
  return match[1]!
}

describe('erasure-backfill: alte Textauszüge in Meldungen', () => {
  const fixedId = new RegExp(scriptConstant('NOTIFICATION_FIXED_ID').replace(/^\/|\/$/g, ''))
  const types = JSON.parse(scriptConstant('NOTIFICATION_EXCERPT_TYPES').replace(/'/g, '"')) as string[]

  it('hält die feste Id jeder neuen Meldung für „neu"', () => {
    for (const type of types) {
      for (const communityId of ['', 'community-1']) {
        const id = commentNotificationRowId({ communityId, commentId: 'c1', recipientId: 'u1', type })
        expect(fixedId.test(id)).toBe(true)
      }
    }
  })

  it('Gegenprobe: eine zufällige Appwrite-Id und eine Beitrags-Id gelten nicht als feste Id', () => {
    expect(fixedId.test('6740f0a1002b8c1e2d3f')).toBe(false)
    expect(fixedId.test(`pmn${'a'.repeat(32)}`)).toBe(false)
    expect(fixedId.test(`cmn${'a'.repeat(31)}`)).toBe(false)
  })

  it('kennt genau die Typen des Layers, die einen Auszug tragen', () => {
    // CommentNotificationType = 'reply' | 'mention' | 'reply.guest'
    const layer = readFileSync(join(dirname(SCRIPT), '..', '..', 'packages', 'comments', 'server', 'utils', 'commentNotifications.ts'), 'utf8')
    const union = /export type CommentNotificationType = (.+)/.exec(layer)
    expect(union).not.toBeNull()
    const declared = [...union![1]!.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
    expect([...types].sort()).toEqual(declared)
  })

  it('schreibt nur den Auszug leer und fasst nichts sonst an', () => {
    const patch = /patchRow\('notifications', row\.\$id,\s*\{([^}]*)\}/.exec(source)
    expect(patch).not.toBeNull()
    expect(patch![1]!.trim()).toBe(`body: ''`)
  })
})
