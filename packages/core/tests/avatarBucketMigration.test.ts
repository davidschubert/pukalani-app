import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AVATAR_BUCKET_EXTENSIONS, AVATAR_MAX_BYTES } from '../shared/avatarImage'

/**
 * SEC-001 — Migration system-039 und die Bildregel der Routen
 * (`shared/avatarImage.ts`) tragen DIESELBEN Werte. Migrations-Skripte
 * importieren nichts aus `core`; die Literale dort werden deshalb hier gelesen
 * und verglichen. Läuft eine Seite davon, lehnt der Bucket ab, was die Route
 * annimmt (oder umgekehrt) — und das zeigt sonst erst ein Upload in Production.
 */
describe('Migration system-039 spiegelt die Werte', () => {
  const migration = readFileSync(
    fileURLToPath(new URL('../../system/scripts/migrations/039-avatars-bucket-images.ts', import.meta.url)),
    'utf8',
  )

  it('dieselbe Endungsliste', () => {
    const match = migration.match(/const ALLOWED_FILE_EXTENSIONS = \[([^\]]*)\]/)
    expect(match).not.toBeNull()
    const extensions = [...match![1]!.matchAll(/'([^']+)'/g)].map(entry => entry[1])
    expect([...extensions].sort()).toEqual([...AVATAR_BUCKET_EXTENSIONS].sort())
  })

  it('dieselbe Höchstgröße', () => {
    const match = migration.match(/const MAXIMUM_FILE_SIZE = ([\d\s*_]+)\n/)
    expect(match).not.toBeNull()
    const value = match![1]!.split('*').map(part => Number(part.trim().replaceAll('_', ''))).reduce((a, b) => a * b, 1)
    expect(value).toBe(AVATAR_MAX_BYTES)
  })
})
