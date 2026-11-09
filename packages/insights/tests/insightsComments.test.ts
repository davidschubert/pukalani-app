import { describe, expect, it } from 'vitest'
import { INSIGHTS_COMMENT_TARGET, insightsCommentUrl } from '../shared/insightsComments'
import { insightsPostIsVisible } from '../shared/insightsPublic'

/**
 * BI2 K7 — der Begriff, mit dem ein Kommentar an einem Insights-Beitrag hängt.
 *
 * Diese Datei prüft bewusst WENIG Code und EINE Zusage: dass die drei Stellen,
 * die das Paar `targetType`/`targetId` benutzen — die Artikel-Seite, der
 * Schreib-Wächter und die Moderation — denselben Begriff lesen. Der Wert
 * selbst ist eine Verabredung und steht in DER DATENBANK, sobald der erste
 * Kommentar geschrieben ist: ändert ihn jemand später, findet die Seite ihre
 * eigenen Kommentare nicht mehr, und kein Typfehler sagt es.
 */
describe('INSIGHTS_COMMENT_TARGET', () => {
  it('ist und bleibt `insights`', () => {
    // Der Wert ist festgenagelt, nicht nur „irgendein String": nach dem ersten
    // geschriebenen Kommentar wäre eine Umbenennung eine Datenmigration.
    expect(INSIGHTS_COMMENT_TARGET).toBe('insights')
  })

  it('kollidiert nicht mit den Zieltypen der anderen Produkte', () => {
    // 'post' gehört dem posts-Layer (geschlossene Themen), 'ticket' ist ein
    // Operator-Thread. Ein geteilter Wert hieße: ein fremder Schreib-Wächter
    // entscheidet über unsere Artikel.
    expect(['post', 'ticket', 'lesson']).not.toContain(INSIGHTS_COMMENT_TARGET)
  })
})

describe('insightsCommentUrl', () => {
  it('ist der Artikel-Pfad ohne Sprach-Präfix', () => {
    // Ohne Präfix, weil der EMPFÄNGER der Antwort-Benachrichtigung in SEINER
    // Sprache liest — `localePath()` legt sie beim Rendern davor. Stünde `/de`
    // mit in der Spalte, bekäme ein englischer Leser den deutschen Pfad.
    expect(insightsCommentUrl('warum-marken-scheitern')).toBe('/insights/warum-marken-scheitern')
  })

  it('zeigt auf dieselbe Seite, auf der der Faden steht', () => {
    expect(insightsCommentUrl('x')).toMatch(/^\/insights\//)
  })
})

/**
 * DIE SCHREIB-REGEL IST DIE LESE-REGEL (`server/plugins/comments-target.ts`).
 *
 * Der Wächter selbst ist ein Nitro-Plugin und wird hier nicht ausgeführt —
 * geprüft wird die ENTSCHEIDUNG, die er trifft: er fragt
 * `insightsPostIsVisible` und sonst nichts. Genau daraus folgt die Zusage des
 * Pakets „Kommentare nur unter ARTIKELN", ohne dass irgendwo eine zweite Liste
 * von Formaten gepflegt werden muss.
 */
describe('K7: kommentierbar ist genau das, was öffentlich ist', () => {
  const artikel = { state: 'published', format: 'article' } as const
  const riegel = ['article'] as const

  it('ein freigegebener Artikel bei Riegel `article` ⇒ sichtbar und damit kommentierbar', () => {
    expect(insightsPostIsVisible(artikel, riegel)).toBe(true)
  })

  it('ein ENTWURF ist zu — der Fall, der ohne Wächter gefährlich wäre', () => {
    // `assertContentWritable` lässt einen nicht angemeldeten Zieltyp durch
    // (fail-open), und der Gast-Weg schreibt über die Operator-Klinke. Ohne
    // den Wächter könnte ein Fremder an eine unveröffentlichte
    // Redaktionsfassung schreiben, deren Id er nur erraten müsste.
    expect(insightsPostIsVisible({ state: 'draft', format: 'article' }, riegel)).toBe(false)
    expect(insightsPostIsVisible({ state: 'review', format: 'article' }, riegel)).toBe(false)
  })

  it('Duell, Profil und Ranking bleiben zu, solange der Riegel sie nicht freigibt', () => {
    expect(insightsPostIsVisible({ state: 'published', format: 'duel' }, riegel)).toBe(false)
    expect(insightsPostIsVisible({ state: 'published', format: 'profile' }, riegel)).toBe(false)
    expect(insightsPostIsVisible({ state: 'published', format: 'ranking' }, riegel)).toBe(false)
  })

  it('GEGENPROBE: legt David den Riegel um, wandert das Kommentieren MIT', () => {
    // Das ist der Grund, keine eigene Formatliste für Kommentare zu führen:
    // nach der Anwaltsantwort (BI1-3/BI1-4) gibt es genau EINE Stelle, die
    // sich ändert.
    expect(insightsPostIsVisible({ state: 'published', format: 'duel' }, ['article', 'duel'])).toBe(true)
  })
})
