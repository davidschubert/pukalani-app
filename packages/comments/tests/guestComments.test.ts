import { describe, expect, it } from 'vitest'
import { guestCommentsAllowed } from '../shared/guestComments'

/**
 * F4 — Gäste schreiben genau dort, wo Gäste auch lesen dürfen.
 *
 * Der Befund war eine Kante von C18: in einer Community mit Publikum 'members'
 * trägt jede neue Zeile `read(label:<communityId>)`, und ein Gast trägt kein
 * Label — er sah seinen eigenen Kommentar nach dem nächsten Seitenaufbau nicht
 * wieder. Die Regel ist PURE, weil Route und Ansicht sie GEMEINSAM brauchen:
 * liefen sie auseinander, stünde ein Formular da, dessen Absenden 404 wird.
 */
describe('guestCommentsAllowed (F4)', () => {
  const open = { embedEnabled: true, guestsEnabled: true, publicPagesEnabled: false, communityIsPublic: true }

  it('offen, freigegeben, im Embed ⇒ Gäste dürfen', () => {
    expect(guestCommentsAllowed(open)).toBe(true)
  })

  it('geschlossene Community schließt Gäste aus — auch bei freigegebenem Schalter', () => {
    expect(guestCommentsAllowed({ ...open, communityIsPublic: false })).toBe(false)
  })

  it('der Betreiber-Schalter bleibt die erste Sperre', () => {
    expect(guestCommentsAllowed({ ...open, guestsEnabled: false })).toBe(false)
  })

  it('ohne Embed gar nicht', () => {
    expect(guestCommentsAllowed({ ...open, embedEnabled: false })).toBe(false)
  })

  it('kein Schalter gleicht einen anderen aus (jede Sperre allein genügt)', () => {
    const zu = { embedEnabled: false, guestsEnabled: false, publicPagesEnabled: false, communityIsPublic: false }
    expect(guestCommentsAllowed(zu)).toBe(false)
    expect(guestCommentsAllowed({ ...zu, embedEnabled: true })).toBe(false)
    expect(guestCommentsAllowed({ ...zu, guestsEnabled: true, communityIsPublic: true })).toBe(false)
  })
})

/**
 * BI2 K7 — der zweite Träger: die EIGENEN öffentlichen Seiten.
 *
 * Die Insights-Artikel von branding.supply sind keine fremde Seite im iframe,
 * sondern unsere eigene; ihre Leser haben kein Konto. Dieser Block nagelt die
 * zwei Sätze fest, die der neue Schalter sagen SOLL — und vor allem den, den
 * er NICHT sagen darf.
 */
describe('guestCommentsAllowed — Gäste auf den eigenen öffentlichen Seiten (K7)', () => {
  const seite = { embedEnabled: false, guestsEnabled: false, publicPagesEnabled: true, communityIsPublic: true }

  it('ohne Embed, nur mit dem Seiten-Schalter ⇒ Gäste dürfen', () => {
    expect(guestCommentsAllowed(seite)).toBe(true)
  })

  it('GEGENPROBE: eine geschlossene Community schlägt auch diesen Träger', () => {
    // Die Regel, aus der der ganze Dateikopf entstand, bleibt unangetastet:
    // wer nicht lesen darf, schreibt ins Loch. Fiele dieser Fall, wäre der
    // neue Schalter eine Hintertür in jede mitglieder-interne Community.
    expect(guestCommentsAllowed({ ...seite, communityIsPublic: false })).toBe(false)
  })

  it('der Seiten-Schalter ersetzt den Embed-Schalter NICHT in der anderen Richtung', () => {
    // Aus ⇒ es bleibt beim alten Dreiklang. Sonst hätte das Einschalten des
    // einen Trägers den anderen stillschweigend mitgeöffnet.
    expect(guestCommentsAllowed({ ...seite, publicPagesEnabled: false })).toBe(false)
    expect(guestCommentsAllowed({ embedEnabled: true, guestsEnabled: true, publicPagesEnabled: false, communityIsPublic: true })).toBe(true)
  })

  it('beide Träger an ist kein Sonderfall', () => {
    expect(guestCommentsAllowed({ embedEnabled: true, guestsEnabled: true, publicPagesEnabled: true, communityIsPublic: true })).toBe(true)
  })
})
