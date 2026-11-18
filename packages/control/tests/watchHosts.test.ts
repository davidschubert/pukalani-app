import { describe, expect, it } from 'vitest'
import { collectWatchHosts, watchableHost } from '../shared/watchHosts'

/**
 * WA1 d (2026-11-18): welche Kundendomains der Produktions-Wächter prüfen
 * soll. Die Erwartungen stehen ausgeschrieben da — nie aus `customDomain.ts`
 * berechnet.
 */
describe('watchableHost — nur ein sauberer Hostname geht hinaus', () => {
  it.each([
    ['kunde.example.com', 'kunde.example.com'],
    ['WWW.Kunde.Example.com.', 'www.kunde.example.com'],
    ['https://kunde.example.com/pfad?x=1', 'kunde.example.com'],
  ])('%s ⇒ %s', (raw, expected) => {
    expect(watchableHost(raw)).toBe(expected)
  })

  it.each([
    ['leer', ''],
    ['null', null],
    ['ein einzelnes Label', 'localhost'],
    ['ein Leerzeichen', 'kunde example.com'],
    ['ein Unterstrich', 'kunde_a.example.com'],
    ['ein Zeilenumbruch', 'kunde.example.com\nfremd.example.org'],
    ['ein Label, das mit Bindestrich beginnt', '-kunde.example.com'],
    ['ein Stern', '*.example.com'],
    ['eine Adresse in Klammern', '[2001:db8::1]'],
  ])('%s ⇒ nichts', (_label, raw) => {
    expect(watchableHost(raw)).toBe('')
  })
})

describe('collectWatchHosts — die Liste für den Wächter', () => {
  const live = (customDomain: string, extra: Record<string, unknown> = {}) => ({ status: 'active', suspension: '', customDomain, customDomainStatus: 'active', ...extra })

  it('aktive Domain mit Geschwister-Form: die eingetragene antwortet selbst, die andere leitet um', () => {
    // Ein Paar gibt es nur bei einer zweistelligen Domain und bei einer, die schon `www.` trägt.
    expect(collectWatchHosts({ communities: [live('kundeeins.example')], websites: [] })).toEqual([
      { host: 'kundeeins.example', health: true },
      { host: 'www.kundeeins.example', health: false },
    ])
    expect(collectWatchHosts({ communities: [live('www.zweite.example.org')], websites: [] })).toEqual([
      { host: 'www.zweite.example.org', health: true },
      { host: 'zweite.example.org', health: false },
    ])
  })

  it('eine Subdomain hat kein Geschwister', () => {
    expect(collectWatchHosts({ communities: [live('forum.kunde.example.com')], websites: [] })).toEqual([
      { host: 'forum.kunde.example.com', health: true },
    ])
  })

  it.each([
    ['noch nicht aktiv (pending_dns)', live('a.example.com', { customDomainStatus: 'pending_dns' })],
    ['wartet auf das Zertifikat', live('a.example.com', { customDomainStatus: 'pending_cert' })],
    ['abgeschaltet (paused)', live('a.example.com', { customDomainStatus: 'paused' })],
    ['Fehler', live('a.example.com', { customDomainStatus: 'error' })],
    ['Status unlesbar', live('a.example.com', { customDomainStatus: 'aktiv' })],
    ['Status null (Zeile von vor der Migration)', live('a.example.com', { customDomainStatus: null })],
    ['stillgelegte Community', live('a.example.com', { status: 'disabled' })],
    ['vom Netz genommen (Sperre abuse)', live('a.example.com', { suspension: 'abuse' })],
    ['keine Domain eingetragen', live('')],
    ['kein Hostname in der Spalte', live('nicht ein host')],
  ])('fehlt in der Liste: %s', (_label, row) => {
    expect(collectWatchHosts({ communities: [row], websites: [] })).toEqual([])
  })

  it('eine nur-lesende Community (Sperre billing) bleibt in der Liste — sie ist erreichbar', () => {
    expect(collectWatchHosts({ communities: [live('forum.kunde.example.com', { suspension: 'billing' })], websites: [] })).toEqual([
      { host: 'forum.kunde.example.com', health: true },
    ])
  })

  it('Einzel-Sites zählen mit, Pool und Einzel-Site zusammen sind nach Name sortiert und ohne Doppel', () => {
    const hosts = collectWatchHosts({
      communities: [live('zebra.example'), live('forum.alpha.example.org')],
      websites: [
        { customDomain: 'mitte.example', customDomainStatus: 'active' },
        { customDomain: 'wartet.example', customDomainStatus: 'pending_platform' },
        // dieselbe Domain ein zweites Mal im Register
        { customDomain: 'zebra.example', customDomainStatus: 'active' },
      ],
    })
    expect(hosts).toEqual([
      { host: 'forum.alpha.example.org', health: true },
      { host: 'mitte.example', health: true },
      { host: 'www.mitte.example', health: false },
      { host: 'www.zebra.example', health: false },
      { host: 'zebra.example', health: true },
    ])
  })

  it('steht ein Host als Geschwister UND als eingetragene Form im Register, antwortet er selbst', () => {
    const forward = collectWatchHosts({ communities: [live('kundeeins.example'), live('www.kundeeins.example')], websites: [] })
    const backward = collectWatchHosts({ communities: [live('www.kundeeins.example'), live('kundeeins.example')], websites: [] })
    const expected = [{ host: 'kundeeins.example', health: true }, { host: 'www.kundeeins.example', health: true }]
    expect(forward).toEqual(expected)
    expect(backward).toEqual(expected)
  })

  it('je Eintrag genau zwei Felder — nichts aus der Zeile reist mit', () => {
    const row = { ...live('kunde.example.com'), $id: 'c-geheim', name: 'Geheime Community', tenantId: 't-geheim', ownerEmail: 'person@example.test' }
    for (const entry of collectWatchHosts({ communities: [row], websites: [] })) {
      expect(Object.keys(entry).sort()).toEqual(['health', 'host'])
    }
  })
})
