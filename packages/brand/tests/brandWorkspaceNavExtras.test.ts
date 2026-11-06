import { describe, expect, it } from 'vitest'
import type { BrandWorkspaceNavExtra } from '../shared/brandWorkspaceNav'
import { resolveWorkspaceNavExtras } from '../shared/brandWorkspaceNav'

/**
 * DER ERWEITERUNGSPUNKT DER WERKSTATT-LEISTE (MV1 M4,
 * docs/archiv/BRAND-MARKTVERGLEICH.md §2.5).
 *
 * `brand` kennt kein Produkt, das auf ihm aufsetzt (CONCEPT A14) — es kennt
 * nur die FORM eines zusätzlichen Ebene-1-Eintrags. Diese Rechnung ist die
 * ganze Logik dahinter, und weil drei Seiten sie benutzen (Werkstatt,
 * Dokument, Markt), gehört sie festgenagelt: ein falsch gerechnetes `locked`
 * wäre ein Knopf, der in ein 409 führt, und ein falscher Zähler eine Zahl,
 * die niemand nachrechnen kann.
 */

const MARKET: BrandWorkspaceNavExtra = {
  key: 'market',
  productKey: 'market',
  labelKey: 'market.nav.market',
  icon: 'i-ph-compass',
  to: '/brand/:profileId/market',
  lockedUntil: 'pvm',
  counterKind: 'market',
}

/** „Das Produkt ist angeschaltet" — der Normalfall der übrigen Prüfungen. */
const ON = () => true

describe('resolveWorkspaceNavExtras', () => {
  it('setzt die Profil-Id in die Adress-Vorlage ein', () => {
    const [entry] = resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [],
      productEnabled: ON,
    })
    expect(entry?.to).toBe('/brand/p1/market')
    expect(entry?.icon).toBe('i-ph-compass')
  })

  it('sperrt, solange das genannte Kapitel nicht abgenommen ist', () => {
    const [locked] = resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['context'],
      findings: [],
      productEnabled: ON,
    })
    expect(locked?.locked).toBe(true)
  })

  it('GEGENPROBE: mit abgenommenem Kapitel ist er offen', () => {
    const [open] = resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['context', 'pvm'],
      findings: [],
      productEnabled: ON,
    })
    expect(open?.locked).toBe(false)
  })

  it('ohne `lockedUntil` ist ein Eintrag nie gesperrt', () => {
    const [entry] = resolveWorkspaceNavExtras([{ ...MARKET, lockedUntil: undefined }], {
      profileId: 'p1',
      doneStepKeys: [],
      findings: [],
      productEnabled: ON,
    })
    expect(entry?.locked).toBe(false)
  })

  it('zählt NUR offene Befunde der genannten Art', () => {
    const [entry] = resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [
        { kind: 'market', status: 'open' },
        { kind: 'market', status: 'open' },
        // Entschieden — er ist Protokoll, keine Arbeit.
        { kind: 'market', status: 'dismissed' },
        // Andere Art — sie gehört an ihr Kapitel, nicht an diesen Eintrag.
        { kind: 'conflict', status: 'open' },
      ],
      productEnabled: ON,
    })
    expect(entry?.count).toBe(2)
  })

  it('ohne `counterKind` gibt es keinen Zähler', () => {
    const [entry] = resolveWorkspaceNavExtras([{ ...MARKET, counterKind: undefined }], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [{ kind: 'market', status: 'open' }],
      productEnabled: ON,
    })
    expect(entry?.count).toBe(0)
  })

  /**
   * DAS PRODUKT-GATE (MV1 M4-Nachfix).
   *
   * Vor diesem Nachfix las nur die SEITE `pukalani.market.enabled` — der
   * Leisten-Eintrag stand auch bei ausgeschaltetem Produkt da und führte auf
   * ihr 404. Ausgeschaltet heisst deshalb WEG, nicht gesperrt: „gibt es hier
   * nicht" ist ein anderer Satz als „noch nicht freigeschaltet".
   */
  it('ein ausgeschaltetes Produkt hat keinen Eintrag', () => {
    expect(resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [{ kind: 'market', status: 'open' }],
      productEnabled: () => false,
    })).toEqual([])
  })

  it('GEGENPROBE: eingeschaltet steht er da — und ist offen', () => {
    const [entry] = resolveWorkspaceNavExtras([MARKET], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [{ kind: 'market', status: 'open' }],
      productEnabled: key => key === 'market',
    })
    expect(entry?.key).toBe('market')
    expect(entry?.locked).toBe(false)
  })

  it('gefragt wird nach dem `productKey` des Eintrags, nicht nach seinem `key`', () => {
    const seen: string[] = []
    resolveWorkspaceNavExtras([{ ...MARKET, key: 'nav-markt', productKey: 'market' }], {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [],
      productEnabled: (key) => {
        seen.push(key)
        return true
      },
    })
    expect(seen).toEqual(['market'])
  })

  it('ein Eintrag ohne `productKey` fällt weg — ungedeckt heisst nicht offen', () => {
    const undeclared = [{ ...MARKET, productKey: '' }] as BrandWorkspaceNavExtra[]
    expect(resolveWorkspaceNavExtras(undeclared, {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [],
      productEnabled: ON,
    })).toEqual([])
  })

  it('eine halb ausgefüllte Zeile fällt still weg', () => {
    const broken = [
      { ...MARKET, key: '' },
      { ...MARKET, labelKey: '' },
      { ...MARKET, to: '' },
    ] as BrandWorkspaceNavExtra[]
    expect(resolveWorkspaceNavExtras(broken, {
      profileId: 'p1',
      doneStepKeys: ['pvm'],
      findings: [],
      productEnabled: ON,
    })).toEqual([])
  })

  it('ohne Einträge ist die Leiste, was sie war', () => {
    expect(resolveWorkspaceNavExtras([], {
      profileId: 'p1',
      doneStepKeys: [],
      findings: [],
      productEnabled: ON,
    })).toEqual([])
  })
})
