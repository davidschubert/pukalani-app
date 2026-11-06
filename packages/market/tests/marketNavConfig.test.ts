import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MARKET_UNLOCK_STEP } from '../shared/marketProfile'

/**
 * DER LEISTEN-EINTRAG „MARKT" GEGEN DEN PRODUKTVERTRAG (MV1 M4).
 *
 * ── WARUM DIESER TEST DEN QUELLTEXT LIEST ────────────────────────────────
 * `app/app.config.ts` trägt die Freischaltung als WÖRTLICHES `'pvm'` und
 * nicht als Import. Das ist kein Geschmack, sondern eine Rücksicht auf
 * `pnpm check:i18n-keys`: der Wächter lädt jede `app.config.ts` mit Nodes
 * Typ-Strippung, und die kann einen relativen Import ohne Dateiendung nicht
 * auflösen — ein Import machte genau den Wächter rot, der die Beschriftung
 * dieses Eintrags prüft.
 *
 * Der Preis ist eine zweite Stelle für dasselbe Wort. Bezahlt wird er hier:
 * bewegt jemand die Freischaltung im Produktvertrag, ohne die Konfiguration
 * nachzuziehen, wäre der Leisten-Eintrag OFFEN und die Route antwortete 409 —
 * ein Knopf, der garantiert eine Absage kassiert. Die Datei zu IMPORTIEREN
 * ginge hier ebenfalls nicht (`defineAppConfig` ist ein Nuxt-Global und in
 * vitest nicht definiert), also wird sie gelesen.
 */
const CONFIG = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/app.config.ts'),
  'utf8',
)

describe('pukalani.brand.workspaceNavExtras', () => {
  it('sperrt bis zu genau dem Kapitel aus dem Produktvertrag', () => {
    expect(CONFIG).toContain(`lockedUntil: '${MARKET_UNLOCK_STEP}'`)
  })

  it('meldet den Eintrag unter dem Schlüssel an, den die Leiste erwartet', () => {
    expect(CONFIG).toContain('workspaceNavExtras')
    expect(CONFIG).toContain(`key: 'market'`)
    expect(CONFIG).toContain(`labelKey: 'market.nav.market'`)
    expect(CONFIG).toContain(`counterKind: 'market'`)
    expect(CONFIG).toContain(`to: '/brand/:profileId/market'`)
  })

  /**
   * DER EINTRAG NENNT SEINEN PRODUKT-SCHALTER (MV1 M4-Nachfix).
   *
   * Ohne `productKey` liesse `resolveWorkspaceNavExtras` den Eintrag weg —
   * die Leiste wäre also nicht falsch, sondern leer, und das fiele erst
   * jemandem auf, der „Markt" sucht. Der Wert muss ausserdem der Schalter
   * DIESER Datei sein: zeigte er auf ein fremdes Produkt, stünde der Eintrag
   * genau dann da, wenn etwas anderes angeschaltet ist.
   */
  it('nennt den Produkt-Schalter, den diese Datei selbst deklariert', () => {
    expect(CONFIG).toContain(`productKey: 'market'`)
    // `market: { enabled: … }` — der Schalter, auf den `productKey` zeigt.
    expect(CONFIG).toMatch(/\n\s{4}market:\s*\{[\s\S]*?enabled:/)
  })

  it('GEGENPROBE: der Vertrag nennt wirklich ein Kapitel', () => {
    expect(MARKET_UNLOCK_STEP.length).toBeGreaterThan(0)
  })
})
