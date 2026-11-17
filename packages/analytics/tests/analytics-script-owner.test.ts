import { describe, expect, it } from 'vitest'
import { normalizeSiteHost, scriptBelongsToCommunity, scriptSiteDomain } from '../shared/analyticsScriptOwner'

/**
 * BE-022 (1) — WEM GEHÖRT EINE ZÄHL-KENNUNG? Die puren Regeln.
 *
 * Die Form der Zähl-Datei ist am 2026-11-17 an unserer Instanz gemessen: genau
 * EIN Konfigurations-Objekt, Schlüssel ohne Anführungszeichen, Text-Werte
 * JSON-kodiert, Reihenfolge nicht fest, `true` als `!0`, `false` fehlt.
 */
const REAL = '!function(){"use strict";var t={endpoint:"https://plausible.example.test/api/event",domain:"communities.pukalani.app",formSubmissions:!0,fileDownloads:!0,outboundLinks:!0};function n(){}n()}();'

describe('scriptSiteDomain', () => {
  it('liest die Adresse aus dem echten Format', () => {
    expect(scriptSiteDomain(REAL)).toBe('communities.pukalani.app')
  })

  it('die Reihenfolge der Schlüssel ist egal', () => {
    const source = 'var t={outboundLinks:!0,domain:"kunde-a.pukalani.app",endpoint:"https://plausible.example.test/api/event"};'
    expect(scriptSiteDomain(source)).toBe('kunde-a.pukalani.app')
  })

  it('dekodiert maskierte Zeichen im Wert wie JSON', () => {
    // `.` ist ein Punkt — ein naiver Vergleich auf den Rohtext sähe ihn nicht.
    const source = 'var t={endpoint:"https:\\/\\/plausible.example.test\\/api\\/event",domain:"kunde-a\\u002epukalani.app"};'
    expect(scriptSiteDomain(source)).toBe('kunde-a.pukalani.app')
  })

  it('normalisiert die gefundene Adresse (Kleinschreibung, Punkt am Ende)', () => {
    expect(scriptSiteDomain('{domain:"Kunde-A.Pukalani.App."}')).toBe('kunde-a.pukalani.app')
  })

  it('nimmt auch einen Schlüssel in Anführungszeichen', () => {
    expect(scriptSiteDomain('{"endpoint":"x","domain":"kunde-a.pukalani.app"}')).toBe('kunde-a.pukalani.app')
  })

  it('zweimal DIESELBE Adresse ist eindeutig', () => {
    expect(scriptSiteDomain('{domain:"a.example"};{domain:"A.example"}')).toBe('a.example')
  })

  it('zwei VERSCHIEDENE Adressen sind nicht prüfbar ⇒ null', () => {
    expect(scriptSiteDomain('{domain:"a.example"};{domain:"b.example"}')).toBeNull()
  })

  it('keine Adresse ⇒ null', () => {
    expect(scriptSiteDomain('var t={endpoint:"https://plausible.example.test/api/event"};')).toBeNull()
    expect(scriptSiteDomain('')).toBeNull()
  })

  it('ein leerer Wert ist keine Adresse ⇒ null', () => {
    expect(scriptSiteDomain('{domain:""}')).toBeNull()
  })

  it('ein Wort, das nur auf „domain" ENDET, ist kein Treffer', () => {
    expect(scriptSiteDomain('{subdomain:"x.example"}')).toBeNull()
  })

  it('ein kaputtes Literal ⇒ null, keine Ausnahme', () => {
    expect(scriptSiteDomain('{domain:"\\x41.example"}')).toBeNull()
  })
})

describe('scriptBelongsToCommunity', () => {
  it('die eigene Adresse gehört dazu', () => {
    expect(scriptBelongsToCommunity('kunde-a.pukalani.app', ['kunde-a.pukalani.app'])).toBe(true)
  })

  it('eine fremde Adresse nicht', () => {
    expect(scriptBelongsToCommunity('communities.pukalani.app', ['kunde-a.pukalani.app'])).toBe(false)
  })

  it('das www-Geschwister gehört dazu — in beide Richtungen', () => {
    expect(scriptBelongsToCommunity('www.kunde-a.example', ['kunde-a.example'])).toBe(true)
    expect(scriptBelongsToCommunity('kunde-a.example', ['www.kunde-a.example'])).toBe(true)
  })

  it('Groß-/Kleinschreibung und Punkt am Ende zählen nicht', () => {
    expect(scriptBelongsToCommunity('KUNDE-A.example.', ['kunde-a.example'])).toBe(true)
  })

  it('eine von mehreren eigenen Adressen reicht (Pukalani-Adresse UND eigene Domain)', () => {
    expect(scriptBelongsToCommunity('kunde-a.example', ['kunde-a.pukalani.app', 'kunde-a.example'])).toBe(true)
  })

  it('ein Nachbar-Host mit gleichem Ende gehört NICHT dazu', () => {
    expect(scriptBelongsToCommunity('evil-kunde-a.example', ['kunde-a.example'])).toBe(false)
    expect(scriptBelongsToCommunity('x.kunde-a.example', ['kunde-a.example'])).toBe(false)
  })

  it('leere Werte gehören nie dazu', () => {
    expect(scriptBelongsToCommunity('', ['kunde-a.example'])).toBe(false)
    expect(scriptBelongsToCommunity('kunde-a.example', [])).toBe(false)
    expect(scriptBelongsToCommunity('kunde-a.example', [''])).toBe(false)
  })
})

describe('normalizeSiteHost', () => {
  it('Kleinschreibung, Leerraum und Punkt am Ende weg', () => {
    expect(normalizeSiteHost('  Kunde-A.Example. ')).toBe('kunde-a.example')
  })
})
