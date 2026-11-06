import { describe, expect, it } from 'vitest'
import { PAGE_DRAFT_ROBOTS, pageHasDraftNotice } from '../shared/pageDraftNotice'

/**
 * Der dritte Zustand einer CMS-Seite (BS1 R1) — veröffentlicht, aber Entwurf.
 *
 * Die wichtigste Prüfung ist die GEGENPROBE: ohne Ansage der App darf sich an
 * keiner bestehenden Seite etwas ändern. portfolio, control und platform
 * fahren diesen Layer mit fertigen bzw. kundeneigenen Texten.
 */
describe('pageHasDraftNotice', () => {
  it('schweigt ohne Config (Layer-Default) — Gegenprobe', () => {
    expect(pageHasDraftNotice(undefined, 'imprint')).toBe(false)
    expect(pageHasDraftNotice([], 'imprint')).toBe(false)
    expect(pageHasDraftNotice(null, 'imprint')).toBe(false)
  })

  it('meldet genau die genannten Slugs', () => {
    const cfg = ['imprint', 'privacy', 'terms']
    expect(pageHasDraftNotice(cfg, 'imprint')).toBe(true)
    expect(pageHasDraftNotice(cfg, 'terms')).toBe(true)
    expect(pageHasDraftNotice(cfg, 'guidelines')).toBe(false)
    expect(pageHasDraftNotice(cfg, 'home')).toBe(false)
  })

  it('vergleicht ganze Slugs, nicht Teilstücke', () => {
    expect(pageHasDraftNotice(['terms'], 'terms-of-use')).toBe(false)
    expect(pageHasDraftNotice(['imprint'], 'im')).toBe(false)
  })

  it('verträgt Leerraum und ignoriert Nicht-Zeichenketten', () => {
    expect(pageHasDraftNotice([' terms '], 'terms')).toBe(true)
    expect(pageHasDraftNotice([42, null, 'terms'], 'terms')).toBe(true)
    expect(pageHasDraftNotice(['terms'], '')).toBe(false)
  })

  it('nennt dieselbe robots-Ansage wie die Entwurfs-Seiten in apps/marketing', () => {
    expect(PAGE_DRAFT_ROBOTS).toBe('noindex, follow')
  })
})
