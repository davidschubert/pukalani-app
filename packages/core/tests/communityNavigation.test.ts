import { describe, expect, it } from 'vitest'
import {
  type CommunityNavCandidate,
  type CommunityNavItem,
  type CommunityNavOverride,
  INSTANCE_NAV_ROW_ID,
  MAX_NAV_CONFIG_CHARS,
  communityNavConfigFits,
  communityNavRowId,
  filterChromeNavEntries,
  isCustomNavLinkId,
  isGroupNavId,
  isSafeExternalNavTarget,
  isSafeInternalNavTarget,
  navItemHasTarget,
  navMenuChildren,
  nextCustomNavLinkId,
  nextGroupNavId,
  parseCommunityNavOverride,
  resolveCommunityNav,
} from '../shared/communityNavigation'

/**
 * DIE REGEL HINTER DEM NAVIGATIONS-EDITOR (U15 Teil 1).
 *
 * Jede Zusage aus dem Kopf von `resolveCommunityNav` hat hier ihre GEGENPROBE —
 * ein Test, der grün bliebe, wenn die Regel gar nichts täte, beweist nichts.
 */

const candidates: CommunityNavCandidate[] = [
  { id: 'feed', label: 'Feed', to: '/feed', order: 10 },
  { id: 'discussions', label: 'Discussions', to: '/discussions', order: 20 },
  { id: 'events', label: 'Events', to: '/events', order: 30 },
  { id: 'page-about', label: 'About us', to: '/about', order: 60 },
]

const ids = (items: { id: string }[]) => items.map(item => item.id)

describe('resolveCommunityNav — ohne gespeicherte Wahl', () => {
  it('sortiert nach order (das Verhalten von vor U15)', () => {
    expect(ids(resolveCommunityNav(candidates, null))).toEqual(['feed', 'discussions', 'events', 'page-about'])
  })

  it('behandelt undefined und ein leeres entries-Array gleich', () => {
    expect(ids(resolveCommunityNav(candidates, undefined))).toEqual(ids(resolveCommunityNav(candidates, { entries: [] })))
  })

  it('rührt die übergebene Liste nicht an (kein in-place sort)', () => {
    const input = [...candidates].reverse()
    const snapshot = ids(input)
    resolveCommunityNav(input, null)
    expect(ids(input)).toEqual(snapshot)
  })
})

describe('resolveCommunityNav — umordnen', () => {
  it('nimmt die Reihenfolge des Overrides, nicht die order', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'events' }, { id: 'feed' }] }
    expect(ids(resolveCommunityNav(candidates, override))).toEqual(['events', 'feed', 'discussions', 'page-about'])
  })

  it('GEGENPROBE: nicht erwähnte Einträge verschwinden NICHT, sie hängen hinten an', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'events' }] }
    const result = ids(resolveCommunityNav(candidates, override))
    expect(result[0]).toBe('events')
    expect(result).toContain('discussions')
    expect(result).toContain('page-about')
    expect(result).toHaveLength(4)
  })

  it('eine doppelt genannte Id erscheint genau einmal', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed' }, { id: 'feed' }] }
    expect(ids(resolveCommunityNav(candidates, override)).filter(id => id === 'feed')).toHaveLength(1)
  })
})

describe('resolveCommunityNav — ausblenden', () => {
  it('nimmt einen versteckten Eintrag aus dem Menü', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'discussions', hidden: true }] }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('discussions')
  })

  it('GEGENPROBE: hidden false versteckt nichts, und der Eintrag bleibt an seinem Platz', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'discussions', hidden: false }] }
    expect(ids(resolveCommunityNav(candidates, override))[0]).toBe('discussions')
  })

  it('GEGENPROBE: ein versteckter Eintrag kommt nicht über den Anhang zurück', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed', hidden: true }] }
    const result = ids(resolveCommunityNav(candidates, override))
    expect(result).not.toContain('feed')
    expect(result).toHaveLength(3)
  })
})

describe('resolveCommunityNav — umbenennen', () => {
  it('ersetzt den mitgelieferten Text', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed', label: 'Neuigkeiten' }] }
    expect(resolveCommunityNav(candidates, override)[0]!.label).toBe('Neuigkeiten')
  })

  it('GEGENPROBE: ein leerer Text fällt auf die Übersetzung zurück', () => {
    for (const label of ['', '   ']) {
      const override: CommunityNavOverride = { entries: [{ id: 'feed', label }] }
      expect(resolveCommunityNav(candidates, override)[0]!.label).toBe('Feed')
    }
  })

  it('GEGENPROBE: Umbenennen ändert das ZIEL nicht', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed', label: 'Woanders', to: 'https://evil.example' }] }
    const item = resolveCommunityNav(candidates, override)[0]!
    expect(item.to).toBe('/feed')
    expect(item.external).toBe(false)
  })
})

describe('resolveCommunityNav — das Plan-Gate bleibt autoritativ', () => {
  it('GEGENPROBE: ein per Tarif gesperrtes Produkt kommt durch KEIN Override zurück', () => {
    // Genau das tut das Layout: `planAllows` filtert VORHER, `events` ist also
    // gar nicht erst Kandidat.
    const gated = candidates.filter(c => c.id !== 'events')
    const override: CommunityNavOverride = { entries: [{ id: 'events', label: 'Termine' }] }
    expect(ids(resolveCommunityNav(gated, override))).not.toContain('events')
  })

  it('GEGENPROBE: auch als eigener Link getarnt nicht — die Id trägt kein link-Präfix', () => {
    const gated = candidates.filter(c => c.id !== 'events')
    const override: CommunityNavOverride = {
      entries: [{ id: 'events', label: 'Termine', to: '/events' }],
    }
    expect(ids(resolveCommunityNav(gated, override))).not.toContain('events')
  })

  it('unbekannte Ids werden still ignoriert, der Rest bleibt heil', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'ghost' }, { id: 'feed' }] }
    expect(ids(resolveCommunityNav(candidates, override))).toEqual(['feed', 'discussions', 'events', 'page-about'])
  })
})

describe('resolveCommunityNav — eigene Links', () => {
  it('nimmt einen internen Link auf', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'link-1', label: 'Hilfe', to: '/help' }] }
    const item = resolveCommunityNav(candidates, override)[0]!
    expect(item).toMatchObject({ id: 'link-1', label: 'Hilfe', to: '/help', external: false })
  })

  it('nimmt einen externen https-Link auf und markiert ihn', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'link-1', label: 'Shop', to: 'https://shop.example', external: true }],
    }
    expect(resolveCommunityNav(candidates, override)[0]!.external).toBe(true)
  })

  it('GEGENPROBE: http, javascript: und protokollrelative Ziele fallen weg', () => {
    for (const [to, external] of [
      ['http://shop.example', true],
      ['javascript:alert(1)', false],
      ['//evil.example', false],
      ['/../etc', false],
      ['', true],
    ] as const) {
      const override: CommunityNavOverride = {
        entries: [{ id: 'link-1', label: 'X', to, ...(external ? { external: true } : {}) }],
      }
      expect(ids(resolveCommunityNav(candidates, override))).not.toContain('link-1')
    }
  })

  it('GEGENPROBE: ein eigener Link ohne Text fällt weg', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'link-1', label: '  ', to: '/help' }] }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('link-1')
  })

  it('GEGENPROBE: ein externes Ziel OHNE external-Flag wird als Pfad geprüft und fällt weg', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'link-1', label: 'X', to: 'https://x.example' }] }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('link-1')
  })

  it('ein versteckter eigener Link erscheint nicht', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'link-1', label: 'Shop', to: '/shop', hidden: true }],
    }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('link-1')
  })
})

describe('Ziel-Prädikate', () => {
  it('interne Pfade', () => {
    expect(isSafeInternalNavTarget('/')).toBe(true)
    expect(isSafeInternalNavTarget('/about-us')).toBe(true)
    expect(isSafeInternalNavTarget('/a/b')).toBe(true)
    expect(isSafeInternalNavTarget('about')).toBe(false)
    expect(isSafeInternalNavTarget('//evil.example')).toBe(false)
    expect(isSafeInternalNavTarget('/a/../b')).toBe(false)
    expect(isSafeInternalNavTarget('/a?x=1')).toBe(false)
    expect(isSafeInternalNavTarget('javascript:alert(1)')).toBe(false)
  })

  it('externe Adressen', () => {
    expect(isSafeExternalNavTarget('https://x.example')).toBe(true)
    expect(isSafeExternalNavTarget('https://x.example/a?b=1')).toBe(true)
    expect(isSafeExternalNavTarget('http://x.example')).toBe(false)
    expect(isSafeExternalNavTarget('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalNavTarget('/relativ')).toBe(false)
  })

  it('erkennt eigene Link-Ids', () => {
    expect(isCustomNavLinkId('link-1')).toBe(true)
    expect(isCustomNavLinkId('link-')).toBe(false)
    expect(isCustomNavLinkId('feed')).toBe(false)
    expect(isCustomNavLinkId('page-link-1')).toBe(false)
  })

  it('erkennt Gruppen-Ids, und die beiden Namensräume schneiden sich nicht', () => {
    expect(isGroupNavId('group-1')).toBe(true)
    expect(isGroupNavId('group-')).toBe(false)
    expect(isGroupNavId('feed')).toBe(false)
    // GEGENPROBE: eine Gruppe ist KEIN eigener Link und umgekehrt — davon hängt
    // ab, welchen Zweig die Regel nimmt (Ziel prüfen vs. Ziel verbieten).
    expect(isCustomNavLinkId('group-1')).toBe(false)
    expect(isGroupNavId('link-1')).toBe(false)
  })

  it('vergibt Link-Ids über das Maximum, nicht über die Anzahl', () => {
    expect(nextCustomNavLinkId([])).toBe('link-1')
    expect(nextCustomNavLinkId([{ id: 'link-1' }, { id: 'link-7' }])).toBe('link-8')
    // Der entfernte link-7 darf seine Id nicht an den nächsten weitergeben.
    expect(nextCustomNavLinkId([{ id: 'link-7' }])).toBe('link-8')
    expect(nextCustomNavLinkId([{ id: 'feed' }])).toBe('link-1')
  })

  it('zählt Gruppen GETRENNT von eigenen Links', () => {
    expect(nextGroupNavId([])).toBe('group-1')
    expect(nextGroupNavId([{ id: 'group-3' }])).toBe('group-4')
    // GEGENPROBE: die Zähler sehen einander nicht.
    expect(nextGroupNavId([{ id: 'link-9' }])).toBe('group-1')
    expect(nextCustomNavLinkId([{ id: 'group-9' }])).toBe('link-1')
  })
})

/**
 * WESSEN MENÜ IST DAS? (U15 Teil 3 — die Frage, an der das Speichern in JEDER
 * Silo-App gescheitert ist.)
 */
describe('communityNavRowId', () => {
  it('Pool-Mandant: seine communityId (unverändert)', () => {
    expect(communityNavRowId({ communityId: 'c-1' })).toBe('c-1')
  })

  it('Silo/Single-Tenant (kein Mandant): die Instanz ist der Besitzer', () => {
    expect(communityNavRowId(null)).toBe(INSTANCE_NAV_ROW_ID)
    expect(communityNavRowId(undefined)).toBe(INSTANCE_NAV_ROW_ID)
    // Eine GÜLTIGE Appwrite-Row-Id: kein führender Unterstrich (Appwrite lehnt
    // ihn ab — `_instance` starb am 2026-09-08 im Klickbeweis mit 500), nur
    // [A-Za-z0-9_.-], höchstens 36 Zeichen.
    expect(INSTANCE_NAV_ROW_ID).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,35}$/)
  })

  it('GEGENPROBE: Kontroll-Host der Pool-App hat gar keinen Besitzer', () => {
    expect(communityNavRowId(null, true)).toBeNull()
    // Auch mit Mandant — die Fahne schlägt alles (dort ist nichts gescopt).
    expect(communityNavRowId({ communityId: 'c-1' }, true)).toBeNull()
  })

  it('GEGENPROBE: ein Mandant OHNE communityId ist fail-closed, nicht `instance`', () => {
    expect(communityNavRowId({})).toBeNull()
    expect(communityNavRowId({ communityId: '' })).toBeNull()
  })
})

// ── Unterpunkte (U15 Teil 3, Zusagen 5–8) ─────────────────────────────────

const child = (id: string, parent: string) => ({ id, parent })

describe('resolveCommunityNav — Zusage 5: ein Kind folgt seinem Hauptpunkt', () => {
  it('hängt das Kind unter den Hauptpunkt und nimmt es aus der obersten Reihe', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'feed' }, child('events', 'feed'), { id: 'discussions' }],
    }
    const items = resolveCommunityNav(candidates, override)
    expect(ids(items)).toEqual(['feed', 'discussions', 'page-about'])
    expect(ids(items[0]!.children ?? [])).toEqual(['events'])
  })

  it('die Kinder-Reihenfolge ist die Array-Reihenfolge unter Geschwistern', () => {
    const override: CommunityNavOverride = {
      entries: [child('page-about', 'feed'), { id: 'feed' }, child('events', 'feed')],
    }
    const items = resolveCommunityNav(candidates, override)
    // Das Kind steht VOR seinem Hauptpunkt im Array und landet trotzdem hinter
    // ihm — aber vor dem zweiten Kind.
    expect(ids(items[0]!.children ?? [])).toEqual(['page-about', 'events'])
  })

  it('GEGENPROBE: ohne `parent` bleibt derselbe Eintrag ein Hauptpunkt', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed' }, { id: 'events' }] }
    const items = resolveCommunityNav(candidates, override)
    expect(ids(items)).toContain('events')
    expect(items[0]!.children).toBeUndefined()
  })

  it('GEGENPROBE: ein Kind erscheint NICHT zweimal (nicht auch im Anhang)', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'feed' }, child('events', 'feed')] }
    const flat = JSON.stringify(resolveCommunityNav(candidates, override))
    expect(flat.match(/"events"/g)).toHaveLength(1)
  })

  it('ein Kind mit eigenem Text und ein eigener Link als Kind', () => {
    const override: CommunityNavOverride = {
      entries: [
        { id: 'feed' },
        { id: 'events', label: 'Termine', parent: 'feed' },
        { id: 'link-1', label: 'Shop', to: 'https://shop.example', external: true, parent: 'feed' },
      ],
    }
    const children = resolveCommunityNav(candidates, override)[0]!.children ?? []
    expect(children.map(item => item.label)).toEqual(['Termine', 'Shop'])
    expect(children[1]!.external).toBe(true)
  })
})

describe('resolveCommunityNav — Zusage 6: nichts verschwindet (fail-soft)', () => {
  it('ausgeblendeter Hauptpunkt ⇒ das Kind steht an SEINER Array-Position', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'feed', hidden: true }, child('events', 'feed'), { id: 'discussions' }],
    }
    const items = resolveCommunityNav(candidates, override)
    expect(ids(items)).toEqual(['events', 'discussions', 'page-about'])
  })

  it('GEGENPROBE: das eigene `hidden` des Kindes gilt weiter', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'feed', hidden: true }, { id: 'events', hidden: true, parent: 'feed' }],
    }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('events')
  })

  it('unbekannter Hauptpunkt ⇒ Hauptpunkt', () => {
    const override: CommunityNavOverride = { entries: [child('events', 'gibt-es-nicht')] }
    expect(ids(resolveCommunityNav(candidates, override))[0]).toBe('events')
  })

  it('Hauptpunkt gar nicht im Dokument ⇒ Hauptpunkt (Anhang bleibt Anhang)', () => {
    // `feed` steht nur im Anhang (Zusage 3) — es ist kein ERWÄHNTER Eintrag,
    // trägt also auch keine Elternschaft.
    const override: CommunityNavOverride = { entries: [child('events', 'feed')] }
    const items = resolveCommunityNav(candidates, override)
    expect(ids(items)[0]).toBe('events')
    expect(items[0]!.children).toBeUndefined()
  })

  it('Hauptpunkt ist SELBST ein Kind ⇒ das Enkelkind wird Hauptpunkt (eine Ebene)', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'feed' }, child('discussions', 'feed'), child('events', 'discussions')],
    }
    const items = resolveCommunityNav(candidates, override)
    expect(ids(items)).toEqual(['feed', 'events', 'page-about'])
    expect(ids(items[0]!.children ?? [])).toEqual(['discussions'])
    // GEGENPROBE: das Kind trägt selbst keine Kinder.
    expect(items[0]!.children![0]!.children).toBeUndefined()
  })

  it('ein Kreis (A→B, B→A) nimmt die Seite nicht mit', () => {
    const override: CommunityNavOverride = {
      entries: [child('feed', 'events'), child('events', 'feed')],
    }
    const items = resolveCommunityNav(candidates, override)
    // Eine der beiden wird Hauptpunkt, keine verschwindet, nichts hängt.
    expect(ids(items).length).toBeGreaterThan(0)
    expect(JSON.stringify(items)).toContain('feed')
    expect(JSON.stringify(items)).toContain('events')
  })

  it('ein Eintrag, der auf SICH SELBST zeigt, ist ein Hauptpunkt', () => {
    const override: CommunityNavOverride = { entries: [child('feed', 'feed')] }
    expect(ids(resolveCommunityNav(candidates, override))[0]).toBe('feed')
  })
})

describe('resolveCommunityNav — Gruppen und Zusage 7', () => {
  it('eine Gruppe mit Kindern erscheint als Hauptpunkt ohne Ziel', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'group-1', label: 'Products' }, child('feed', 'group-1'), child('events', 'group-1')],
    }
    const items = resolveCommunityNav(candidates, override)
    expect(items[0]).toMatchObject({ id: 'group-1', label: 'Products', to: '', external: false })
    expect(ids(items[0]!.children ?? [])).toEqual(['feed', 'events'])
    expect(navItemHasTarget(items[0]!)).toBe(false)
  })

  it('GEGENPROBE: eine Gruppe OHNE Kinder wird nicht gerendert', () => {
    const override: CommunityNavOverride = { entries: [{ id: 'group-1', label: 'Products' }] }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('group-1')
  })

  it('GEGENPROBE: eine Gruppe, deren Kinder ALLE ausgeblendet sind, ebenfalls nicht', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'group-1', label: 'Products' }, { id: 'feed', hidden: true, parent: 'group-1' }],
    }
    expect(ids(resolveCommunityNav(candidates, override))).not.toContain('group-1')
  })

  it('GEGENPROBE: eine Gruppe OHNE Text fällt weg, ein `to` an ihr wird ignoriert', () => {
    const leer: CommunityNavOverride = { entries: [{ id: 'group-1', label: '  ' }, child('feed', 'group-1')] }
    expect(ids(resolveCommunityNav(candidates, leer))).toEqual(['feed', 'discussions', 'events', 'page-about'])

    const mitZiel: CommunityNavOverride = {
      entries: [{ id: 'group-1', label: 'Products', to: 'https://evil.example', external: true }, child('feed', 'group-1')],
    }
    const items = resolveCommunityNav(candidates, mitZiel)
    expect(items[0]!.to).toBe('')
    expect(items[0]!.external).toBe(false)
  })

  it('GEGENPROBE: eine Gruppe als KIND ist ein toter Eintrag und fällt weg', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'feed' }, { id: 'group-1', label: 'Products', parent: 'feed' }],
    }
    const items = resolveCommunityNav(candidates, override)
    expect(items[0]!.children).toBeUndefined()
    expect(JSON.stringify(items)).not.toContain('group-1')
  })

  it('eine ausgeblendete Gruppe nimmt ihre Kinder nicht mit (Zusage 6)', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'group-1', label: 'Products', hidden: true }, child('feed', 'group-1')],
    }
    expect(ids(resolveCommunityNav(candidates, override))[0]).toBe('feed')
  })

  it('ein Hauptpunkt MIT Ziel und OHNE Kinder bleibt ein gewöhnlicher Link', () => {
    const items = resolveCommunityNav(candidates, { entries: [{ id: 'feed' }] })
    expect(items[0]!.children).toBeUndefined()
    expect(navItemHasTarget(items[0]!)).toBe(true)
  })
})

describe('resolveCommunityNav — Zusage 8: die Antwort zählt nur Hauptpunkte', () => {
  it('drei Kinder unter einem Hauptpunkt belegen EINEN Platz in der Reihe', () => {
    const override: CommunityNavOverride = {
      entries: [
        { id: 'group-1', label: 'Alles' },
        child('feed', 'group-1'),
        child('discussions', 'group-1'),
        child('events', 'group-1'),
      ],
    }
    const items = resolveCommunityNav(candidates, override)
    // Ohne Verschachtelung wären es vier Einträge (und damit ein Überlauf).
    expect(items).toHaveLength(2)
    expect(ids(items)).toEqual(['group-1', 'page-about'])
  })

  it('GEGENPROBE: ohne Gruppierung sind es wieder vier', () => {
    expect(resolveCommunityNav(candidates, null)).toHaveLength(4)
  })
})

/**
 * ZUSAGE 9 — DER BAUPLAN GIBT DIE GRUPPE VOR (Davids Korrektur 2026-09-08).
 *
 * Der Fall aus der Wirklichkeit: das Standard-Menü von branding.supply lautet
 * „Products ▾ (Brand Score) · Discover Brands · About · Team", und `products`
 * ist ein Aufklapper OHNE eigene Seite (`to: ''`).
 */
const brandCandidates: CommunityNavCandidate[] = [
  { id: 'products', label: 'Products', to: '', order: 10 },
  { id: 'brand-score', label: 'Brand Score', to: '/brand-check', order: 11, parent: 'products' },
  { id: 'discover', label: 'Discover Brands', to: '/discover', order: 20 },
  { id: 'about', label: 'About', to: '/about', order: 30 },
  { id: 'team', label: 'Team', to: '/team', order: 40 },
]

describe('resolveCommunityNav — Zusage 9: der Bauplan darf Gruppen vorgeben', () => {
  it('OHNE gespeicherte Wahl gilt die Hierarchie der Kandidaten', () => {
    const items = resolveCommunityNav(brandCandidates, null)
    expect(ids(items)).toEqual(['products', 'discover', 'about', 'team'])
    expect(ids(items[0]!.children ?? [])).toEqual(['brand-score'])
    // Der Aufklapper hat kein eigenes Ziel — und steht deshalb auch nicht
    // selbst in seinem Aufklapper (navMenuChildren).
    expect(navItemHasTarget(items[0]!)).toBe(false)
  })

  it('GEGENPROBE: ein Bauplan OHNE `parent` ergibt weiter eine flache Reihe (Zusage 4)', () => {
    // Dieselben fünf Einträge, nur ohne Vorgabe — und `products` mit eigenem
    // Ziel, damit hier NICHTS anderes mitspielt als die fehlende Elternschaft.
    const flat = brandCandidates.map(candidate => ({ ...candidate, parent: undefined, to: candidate.to || '/products' }))
    const items = resolveCommunityNav(flat, null)
    expect(ids(items)).toEqual(['products', 'brand-score', 'discover', 'about', 'team'])
    expect(items.every(item => item.children === undefined)).toBe(true)
  })

  it('GEGENPROBE: ein Kandidat, der auf SICH SELBST zeigt, bleibt Hauptpunkt', () => {
    const items = resolveCommunityNav([{ id: 'products', label: 'Products', to: '/p', order: 10, parent: 'products' }], null)
    expect(ids(items)).toEqual(['products'])
    expect(items[0]!.children).toBeUndefined()
  })

  it('GEGENPROBE: fällt die Gruppe per Gate weg, ist das Kind Hauptpunkt', () => {
    // Genau das tut ein Gate: der Eintrag ist gar nicht erst Kandidat.
    const items = resolveCommunityNav(brandCandidates.filter(c => c.id !== 'products'), null)
    expect(ids(items)).toEqual(['brand-score', 'discover', 'about', 'team'])
    expect(items[0]!.children).toBeUndefined()
  })

  it('GEGENPROBE: eine Standard-Gruppe OHNE Kinder erscheint nicht (Zusage 7)', () => {
    const items = resolveCommunityNav(brandCandidates.filter(c => c.id !== 'brand-score'), null)
    expect(ids(items)).toEqual(['discover', 'about', 'team'])
  })

  it('die gespeicherte Wahl GEWINNT: sie darf die Standard-Gruppe auflösen', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'products' }, { id: 'brand-score' }, { id: 'discover' }],
    }
    const items = resolveCommunityNav(brandCandidates, override)
    // `products` hat kein Ziel und keine Kinder mehr ⇒ Zusage 7 nimmt es weg.
    expect(ids(items)).toEqual(['brand-score', 'discover', 'about', 'team'])
  })

  it('und sie darf die Gruppe auch BESTÄTIGEN (parent im Dokument)', () => {
    const override: CommunityNavOverride = {
      entries: [{ id: 'products', label: 'Produkte' }, child('brand-score', 'products'), { id: 'about' }],
    }
    const items = resolveCommunityNav(brandCandidates, override)
    expect(items[0]!.label).toBe('Produkte')
    expect(ids(items[0]!.children ?? [])).toEqual(['brand-score'])
    expect(ids(items)).toEqual(['products', 'about', 'discover', 'team'])
  })

  it('ein NACHZÜGLER-Kind bringt seinen Standard-Hauptpunkt mit (Zusage 9c)', () => {
    // Die Wahl stammt aus einer Zeit, als es beide noch nicht gab: sie hängen
    // hinten an — aber verschachtelt, nicht als zwei gleichrangige Wörter.
    const override: CommunityNavOverride = { entries: [{ id: 'about' }, { id: 'team' }] }
    const items = resolveCommunityNav(brandCandidates, override)
    expect(ids(items)).toEqual(['about', 'team', 'products', 'discover'])
    expect(ids(items[2]!.children ?? [])).toEqual(['brand-score'])
  })

  it('GEGENPROBE: ein GENANNTES Kind hängt NICHT an einen nachgezogenen Hauptpunkt', () => {
    // `brand-score` ist genannt, `products` nur nachgezogen — das Kind bliebe
    // sonst nicht an seinem Platz, sondern spränge ans Listenende.
    const override: CommunityNavOverride = { entries: [child('brand-score', 'products'), { id: 'about' }] }
    const items = resolveCommunityNav(brandCandidates, override)
    expect(ids(items)).toEqual(['brand-score', 'about', 'discover', 'team'])
    expect(items[0]!.children).toBeUndefined()
  })
})

describe('navMenuChildren — was im Aufklapper steht', () => {
  const kind: CommunityNavItem = { id: 'events', label: 'Events', to: '/events', external: false }

  it('Hauptpunkt MIT eigenem Ziel: er selbst steht als ERSTER Eintrag', () => {
    const item: CommunityNavItem = { id: 'feed', label: 'Feed', to: '/feed', external: false, children: [kind] }
    const menu = navMenuChildren(item)
    expect(menu.map(entry => entry.id)).toEqual(['feed', 'events'])
    expect(menu[0]).toMatchObject({ label: 'Feed', to: '/feed' })
    // … und zwar OHNE Kinder, sonst wäre der erste Eintrag ein zweiter Aufklapper.
    expect(menu[0]!.children).toBeUndefined()
  })

  it('GEGENPROBE: eine Gruppe (kein eigenes Ziel) steht NICHT in ihrem eigenen Aufklapper', () => {
    const gruppe: CommunityNavItem = { id: 'group-1', label: 'Products', to: '', external: false, children: [kind] }
    expect(navMenuChildren(gruppe).map(entry => entry.id)).toEqual(['events'])
  })

  it('GEGENPROBE: ohne Kinder gibt es keinen Aufklapper', () => {
    expect(navMenuChildren({ id: 'feed', label: 'Feed', to: '/feed', external: false })).toEqual([])
    expect(navMenuChildren({ id: 'feed', label: 'Feed', to: '/feed', external: false, children: [] })).toEqual([])
  })

  it('rührt die Kinder-Liste des Eintrags nicht an', () => {
    const item: CommunityNavItem = { id: 'feed', label: 'Feed', to: '/feed', external: false, children: [kind] }
    navMenuChildren(item).push(kind)
    expect(item.children).toHaveLength(1)
  })
})

describe('resolveCommunityNav — Beschreibungen (PS1, 2026-09-09)', () => {
  const mitBeschreibung: CommunityNavCandidate[] = [
    { id: 'products', label: 'Products', to: '/products', order: 10 },
    {
      id: 'market-comparison',
      label: 'Marktvergleich',
      to: '/products/market-comparison',
      description: 'Wettbewerber im selben Raster.',
      parent: 'products',
      order: 12,
    },
  ]

  it('reicht die Beschreibung eines Kandidaten an den gerenderten Eintrag durch', () => {
    const [haupt] = resolveCommunityNav(mitBeschreibung, null)
    expect(haupt!.children?.[0]).toMatchObject({
      id: 'market-comparison',
      description: 'Wettbewerber im selben Raster.',
    })
  })

  it('GEGENPROBE: ohne Beschreibung steht das Feld gar nicht da', () => {
    const [haupt] = resolveCommunityNav(mitBeschreibung, null)
    expect(haupt).not.toHaveProperty('description')
  })

  it('sie überlebt die gespeicherte Wahl — auch eine Umbenennung', () => {
    const override: CommunityNavOverride = {
      entries: [
        { id: 'products' },
        { id: 'market-comparison', parent: 'products', label: 'Wettbewerb' },
      ],
    }
    const [haupt] = resolveCommunityNav(mitBeschreibung, override)
    expect(haupt!.children?.[0]).toMatchObject({
      label: 'Wettbewerb',
      description: 'Wettbewerber im selben Raster.',
    })
  })

  it('… und reist über navMenuChildren mit in den Aufklapper', () => {
    const [haupt] = resolveCommunityNav(mitBeschreibung, null)
    expect(navMenuChildren(haupt!).map(entry => entry.description))
      .toEqual([undefined, 'Wettbewerber im selben Raster.'])
  })
})

describe('navItemHasTarget', () => {
  it('unterscheidet Gruppe von Link', () => {
    expect(navItemHasTarget({ to: '/feed' })).toBe(true)
    expect(navItemHasTarget({ to: 'https://x.example' })).toBe(true)
    expect(navItemHasTarget({ to: '' })).toBe(false)
  })
})

describe('parseCommunityNavOverride', () => {
  it('liest ein gültiges Dokument', () => {
    expect(parseCommunityNavOverride('{"entries":[{"id":"feed","hidden":true}]}'))
      .toEqual({ entries: [{ id: 'feed', hidden: true }] })
  })

  it('GEGENPROBE: kaputtes JSON, leerer Wert und fremde Formen ergeben null', () => {
    for (const raw of ['', null, undefined, 'nicht json', '[]', '{}', '{"entries":"feed"}', '42']) {
      expect(parseCommunityNavOverride(raw)).toBeNull()
    }
  })

  it('wirft Müll-Einträge weg, statt am Dokument zu scheitern', () => {
    const parsed = parseCommunityNavOverride('{"entries":[{"id":"feed"},null,{"nope":1},{"id":""}]}')
    expect(parsed).toEqual({ entries: [{ id: 'feed' }] })
  })

  it('übernimmt nur die bekannten Felder in der richtigen Form', () => {
    const parsed = parseCommunityNavOverride('{"entries":[{"id":"a","hidden":"ja","label":5,"external":"x","to":"/b"}]}')
    expect(parsed).toEqual({ entries: [{ id: 'a', to: '/b' }] })
  })

  it('übernimmt `parent` (U15 Teil 3)', () => {
    expect(parseCommunityNavOverride('{"entries":[{"id":"events","parent":"feed"}]}'))
      .toEqual({ entries: [{ id: 'events', parent: 'feed' }] })
  })

  it('GEGENPROBE: ein `parent`, das keine Zeichenkette ist, heisst „Hauptpunkt"', () => {
    for (const raw of ['{"entries":[{"id":"a","parent":5}]}', '{"entries":[{"id":"a","parent":null}]}', '{"entries":[{"id":"a","parent":true}]}']) {
      expect(parseCommunityNavOverride(raw)).toEqual({ entries: [{ id: 'a' }] })
    }
  })
})

describe('communityNavConfigFits', () => {
  it('ein gewöhnliches Menü passt', () => {
    expect(communityNavConfigFits({ entries: candidates.map(c => ({ id: c.id, label: c.label })) })).toBe(true)
  })

  it('GEGENPROBE: ein zu großes Dokument passt nicht', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      id: `link-${i + 1}`,
      label: 'x'.repeat(64),
      to: `https://example.com/${'y'.repeat(500)}`,
      external: true,
    }))
    expect(JSON.stringify({ entries }).length).toBeGreaterThan(MAX_NAV_CONFIG_CHARS)
    expect(communityNavConfigFits({ entries })).toBe(false)
  })
})

describe('filterChromeNavEntries', () => {
  const nav = {
    feed: { labelKey: 'nav.feed', to: '/feed', order: 10 },
    events: { labelKey: 'nav.events', to: '/events', planProduct: 'events' },
    members: { labelKey: 'nav.members', to: '/members', requiresAuth: true },
    ai: { labelKey: 'nav.ai', to: '/ai', productKey: 'ai' },
    off: false as const,
  }
  const allOn = { isLoggedIn: true, productOn: () => true, planAllows: () => true }

  it('lässt alles durch, was kein Gate hat', () => {
    expect(ids(filterChromeNavEntries(nav, allOn))).toEqual(['feed', 'events', 'members', 'ai'])
  })

  it('GEGENPROBE: `false` schaltet einen Eintrag ab', () => {
    expect(ids(filterChromeNavEntries(nav, allOn))).not.toContain('off')
  })

  it('GEGENPROBE: jedes Gate greift einzeln', () => {
    expect(ids(filterChromeNavEntries(nav, { ...allOn, isLoggedIn: false }))).not.toContain('members')
    expect(ids(filterChromeNavEntries(nav, { ...allOn, planAllows: () => false }))).not.toContain('events')
    expect(ids(filterChromeNavEntries(nav, { ...allOn, productOn: () => false }))).toEqual([])
  })

  it('ohne Registry: leere Liste statt Absturz', () => {
    expect(filterChromeNavEntries(undefined, allOn)).toEqual([])
  })

  it('reicht `parent` und ein leeres `to` durch (Zusage 9)', () => {
    const grouped = {
      products: { labelKey: 'nav.products', to: '', order: 10 },
      'brand-score': { labelKey: 'nav.brandScore', to: '/brand-check', parent: 'products', order: 11 },
    }
    const entries = filterChromeNavEntries(grouped, allOn)
    expect(entries.map(entry => entry.parent)).toEqual([undefined, 'products'])
    expect(entries[0]!.to).toBe('')
  })

  it('reicht `descriptionKey` durch (PS1) — übersetzt wird er beim Aufrufer', () => {
    const withDescription = {
      products: { labelKey: 'nav.products', to: '/products', order: 10 },
      'brand-score': {
        labelKey: 'nav.brandScore',
        descriptionKey: 'nav.product.score',
        to: '/brand-check',
        parent: 'products',
        order: 11,
      },
    }
    const entries = filterChromeNavEntries(withDescription, allOn)
    expect(entries.map(entry => entry.descriptionKey)).toEqual([undefined, 'nav.product.score'])
  })
})
