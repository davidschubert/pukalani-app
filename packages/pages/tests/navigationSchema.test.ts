import { describe, expect, it } from 'vitest'
import { createCommunityNavigationSchema } from '../schemas/navigation'

/**
 * WAS ÜBERHAUPT IN EIN GESPEICHERTES MENÜ DARF (U15 Teil 1 + Teil 3).
 *
 * Der erste Test-Ordner dieses Layers, angelegt am 2026-09-08 nach dem Muster
 * von `packages/brand/tests` (`vitest run` steht im package.json).
 *
 * WARUM ES IHN BRAUCHT, obwohl die Leseregel in core schon getestet ist: die
 * beiden beantworten VERSCHIEDENE Fragen. Die Regel sagt, was ein gespeichertes
 * Dokument BEDEUTET (und ist absichtlich fail-soft — sie darf einer Community
 * nie den Seitenkopf nehmen); das Schema sagt, was ein Mensch SPEICHERN darf,
 * und ist fail-loud. Ein Schema-Loch wäre in der Regel unsichtbar: sie richtet
 * still zurecht, was hier durchgekommen ist.
 *
 * Jede Zusage hat eine GEGENPROBE — ein Test, der auch grün bliebe, wenn das
 * Schema alles durchliesse, beweist nichts.
 */

const schema = createCommunityNavigationSchema()
const parse = (entries: unknown) => schema.safeParse({ entries })
/** Die Meldungen eines Fehlschlags — daran hängt, WELCHE Zusage gegriffen hat. */
const messages = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map(issue => issue.message)

describe('Bestand (U15 Teil 1) — unverändert', () => {
  it('nimmt ein gewöhnliches Menü an', () => {
    expect(parse([{ id: 'feed' }, { id: 'events', hidden: true }, { id: 'page-about', label: 'Über uns' }]).success).toBe(true)
  })

  it('eigener Link: intern und extern', () => {
    expect(parse([{ id: 'link-1', label: 'Hilfe', to: '/help' }]).success).toBe(true)
    expect(parse([{ id: 'link-2', label: 'Shop', to: 'https://shop.example', external: true }]).success).toBe(true)
  })

  it('GEGENPROBE: Umbenennen ja, umlenken nein', () => {
    expect(messages(parse([{ id: 'feed', to: '/anderswo' }])))
      .toContain('pages.navigation.validation.notRetargetable')
    expect(messages(parse([{ id: 'feed', external: true }])))
      .toContain('pages.navigation.validation.notRetargetable')
  })

  it('GEGENPROBE: doppelte Id', () => {
    expect(messages(parse([{ id: 'feed' }, { id: 'feed' }])))
      .toContain('pages.navigation.validation.duplicateId')
  })

  it('GEGENPROBE: unbekannte Felder kommen nicht durch (strict)', () => {
    expect(parse([{ id: 'feed', irgendwas: 1 }]).success).toBe(false)
  })
})

describe('Gruppen (U15 Teil 3): Text Pflicht, Ziel verboten', () => {
  it('nimmt eine Gruppe mit Text an', () => {
    expect(parse([{ id: 'group-1', label: 'Products' }, { id: 'feed', parent: 'group-1' }]).success).toBe(true)
  })

  it('GEGENPROBE: eine Gruppe mit `to` wird abgewiesen', () => {
    expect(messages(parse([{ id: 'group-1', label: 'Products', to: '/products' }])))
      .toContain('pages.navigation.validation.groupNoTarget')
  })

  it('GEGENPROBE: auch ein blosses `external` an einer Gruppe', () => {
    expect(messages(parse([{ id: 'group-1', label: 'Products', external: true }])))
      .toContain('pages.navigation.validation.groupNoTarget')
  })

  it('GEGENPROBE: eine Gruppe ohne Text wird abgewiesen', () => {
    for (const label of [undefined, '', '   ']) {
      expect(messages(parse([{ id: 'group-1', ...(label === undefined ? {} : { label }) }])))
        .toContain('pages.navigation.validation.labelRequired')
    }
  })

  it('GEGENPROBE: eine Gruppe wird NICHT wie ein eigener Link behandelt (kein „Ziel fehlt")', () => {
    expect(messages(parse([{ id: 'group-1', label: 'Products' }])))
      .not.toContain('pages.navigation.validation.targetRequired')
  })
})

describe('`parent`: genau EINE Ebene', () => {
  it('nimmt ein Kind an, dessen Hauptpunkt im Dokument steht', () => {
    expect(parse([{ id: 'feed' }, { id: 'events', parent: 'feed' }]).success).toBe(true)
  })

  it('die Reihenfolge im Array ist egal (das Kind darf vor dem Hauptpunkt stehen)', () => {
    expect(parse([{ id: 'events', parent: 'feed' }, { id: 'feed' }]).success).toBe(true)
  })

  it('GEGENPROBE: ein Hauptpunkt, der nicht im Dokument steht', () => {
    expect(messages(parse([{ id: 'events', parent: 'feed' }])))
      .toContain('pages.navigation.validation.parentInvalid')
  })

  it('GEGENPROBE: ein Eintrag, der auf sich selbst zeigt', () => {
    expect(messages(parse([{ id: 'feed', parent: 'feed' }])))
      .toContain('pages.navigation.validation.parentInvalid')
  })

  it('GEGENPROBE: ein Hauptpunkt, der selbst ein Kind ist (Ebene zwei)', () => {
    expect(messages(parse([
      { id: 'feed' },
      { id: 'discussions', parent: 'feed' },
      { id: 'events', parent: 'discussions' },
    ]))).toContain('pages.navigation.validation.parentInvalid')
  })

  it('GEGENPROBE: `parent` muss die FORM einer Id haben', () => {
    expect(messages(parse([{ id: 'feed' }, { id: 'events', parent: '/pfad' }])))
      .toContain('pages.navigation.validation.idInvalid')
  })

  it('ein AUSGEBLENDETER Hauptpunkt ist ein gültiger Hauptpunkt (die Regel ist fail-soft)', () => {
    // Das Schema darf hier nicht strenger sein als die Regel: Zusage 6 sagt,
    // das Kind erscheint dann als Hauptpunkt — der Owner soll seine Gruppierung
    // aber behalten, wenn er den Hauptpunkt wieder einschaltet.
    expect(parse([{ id: 'feed', hidden: true }, { id: 'events', parent: 'feed' }]).success).toBe(true)
  })
})

describe('Grenzen', () => {
  it('GEGENPROBE: mehr als 40 Einträge', () => {
    const entries = Array.from({ length: 41 }, (_, i) => ({ id: `link-${i + 1}`, label: 'x', to: '/x' }))
    expect(messages(parse(entries))).toContain('pages.navigation.validation.tooMany')
  })

  it('GEGENPROBE: ein Dokument, das nicht in die Spalte passt', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      id: `link-${i + 1}`,
      label: 'x'.repeat(64),
      to: `https://example.com/${'y'.repeat(400)}`,
      external: true,
    }))
    expect(messages(parse(entries))).toContain('pages.navigation.validation.tooLarge')
  })
})
