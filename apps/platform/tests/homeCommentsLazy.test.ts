import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * DER KOMMENTAR-BLOCK DER COMMUNITY-STARTSEITE LÄDT BEI BEDARF (PERF-006,
 * Bahn 5). Fest eingebunden zog `CommentSection` Formular, Realtime und zod in
 * JEDE Community-Startseite — auch ohne `[[comments]]` (2026-11-21 gemessen:
 * 64 KB gepackt, 17 %). Die Gewichts-Grenze merkt es erst im Ausliefern.
 */
const source = readFileSync(join(__dirname, '../app/pages/index.vue'), 'utf8')

export function homeLoadsCommentsEagerly(vue: string): boolean {
  return /<CommentSection\b/.test(vue)
}

describe('Community-Startseite', () => {
  it('bindet den Kommentar-Block nur nachgeladen und nur mit [[comments]] ein', () => {
    expect(homeLoadsCommentsEagerly(source)).toBe(false)
    expect(source).toMatch(/<LazyCommentSection\s+v-if="parts\.showComments"/)
  })

  it('Gegenprobe: ein fester Einbau wird erkannt', () => {
    expect(homeLoadsCommentsEagerly('<CommentSection v-if="x" />')).toBe(true)
  })
})
