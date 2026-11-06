import { describe, expect, it } from 'vitest'
import { BRAND_SLOTS, slotById } from '../../brand/shared/slotRegistry'
import { MARKET_FIELDS } from '../shared/marketProfile'
import {
  marketAiViewSchema,
  marketFieldsSchema,
  parseMarketJson,
} from '../shared/types/market'

/**
 * DER VERTRAG ZWISCHEN market UND brand (Plan §2.2, Paket M1).
 *
 * ── WAS HIER GEPRÜFT WIRD UND WARUM ES EINEN TEST BRAUCHT ────────────────
 * `MARKET_FIELDS` bildet zehn Marktprofil-Felder auf Slot-Ids der
 * brand-Registry ab — als ZEICHENKETTEN. Der Grund steht im Kopf von
 * `shared/marketProfile.ts`: der Produktvertrag soll pur bleiben und den
 * brand-Layer nicht zur Laufzeit brauchen. Der Preis dafür ist genau dieser
 * Test. Ein Tippfehler in einer Id wäre sonst keine Fehlermeldung, sondern
 * eine Vergleichszeile, die für immer leer bleibt — und die sieht wie „dazu
 * hat die Marke nichts gesagt" aus, also wie ein ERGEBNIS.
 *
 * ── DER TEST GREIFT ÜBER DIE PAKETGRENZE, DER PRODUKTIV-CODE NICHT ───────
 * Das ist Absicht und kein Schlupfloch: ein Test darf mehr wissen als das,
 * was er prüft. Server-seitig läuft die Kopplung gebündelt über
 * `server/utils/brandContract.ts`; hier importieren wir die pure Registry
 * direkt, weil ein Test, der über die Vertragsdatei ginge, nur noch prüfte,
 * ob die Vertragsdatei re-exportiert.
 */
describe('MARKET_FIELDS gegen die brand-Registry', () => {
  it('bildet jede Abbildung auf einen existierenden Slot ab', () => {
    const unknown: string[] = []
    for (const field of MARKET_FIELDS) {
      for (const slotId of field.slotIds) {
        if (!slotById(slotId)) unknown.push(`${field.id} → ${slotId}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('zeigt auf keinen deaktivierten Slot', () => {
    // `deactivated` heisst im brand-Layer „nicht mehr gefragt, aber weiter
    // lesbar" (Migrationsvertrag). Für den Vergleich ist das der schlimmere
    // Fall als ein Tippfehler: die Id existiert, der Wert dahinter wird aber
    // in keinem neuen Branding mehr gefüllt — die Spalte bliebe leer, ohne
    // dass irgendwo etwas rot wird.
    const deactivated: string[] = []
    for (const field of MARKET_FIELDS) {
      for (const slotId of field.slotIds) {
        if (slotById(slotId)?.deactivated) deactivated.push(`${field.id} → ${slotId}`)
      }
    }
    expect(deactivated).toEqual([])
  })

  it('erkennt eine erfundene Slot-Id (Gegenprobe)', () => {
    // Ohne diese Gegenprobe wäre der Test oben auch dann grün, wenn
    // `slotById` je etwas Wahrheitsähnliches zurückgäbe — ein Test, der nie
    // rot werden KANN, ist keiner.
    expect(slotById('b.positioningFirstChoice')).toBeDefined()
    expect(slotById('x.gibtEsNicht')).toBeUndefined()
  })

  it('benutzt nur Slots, die im Katalog stehen', () => {
    // Zweiter Weg zur selben Aussage, absichtlich über den KATALOG statt über
    // die Nachschlagefunktion: fiele `slotById` einmal auf einen Rückfall
    // zurück (Alias, Upcaster), sagte der Test oben nichts mehr.
    const ids = new Set(BRAND_SLOTS.map(slot => slot.id))
    for (const field of MARKET_FIELDS) {
      for (const slotId of field.slotIds) {
        expect(ids.has(slotId), `${field.id} → ${slotId}`).toBe(true)
      }
    }
  })
})

/**
 * DIE PRÜFUNG DER JSON-SPALTEN (`shared/types/market.ts`).
 *
 * Sie steht hier und nicht in `marketProfile.test.ts`, weil sie eine ANDERE
 * Frage stellt: dort geht es um den Produktbegriff, hier um das, was aus der
 * Datenbank zurückkommt — geschrieben von einem Modell, gelesen Wochen später.
 */
describe('JSON-Spalten', () => {
  const evidence = {
    quote: 'Wir rösten in kleinen Mengen.',
    sourceUrl: 'https://example.test/ueber-uns',
    fetchedAt: '2026-09-05T10:00:00.000Z',
    confidence: 'stated' as const,
  }

  it('nimmt ein belegtes Feld an', () => {
    const parsed = marketFieldsSchema.safeParse([
      { fieldId: 'pitch', value: 'Kleine Röstmengen aus Maui.', evidence, source: 'website' },
    ])
    expect(parsed.success).toBe(true)
  })

  it('weist einen gefüllten Wert OHNE Beleg ab (Halluzinations-Riegel)', () => {
    const parsed = marketFieldsSchema.safeParse([
      { fieldId: 'pitch', value: 'Kleine Röstmengen aus Maui.', source: 'website' },
    ])
    expect(parsed.success).toBe(false)
  })

  it('lässt ein LEERES Feld ohne Beleg zu — „nicht gesagt" ist eine Aussage', () => {
    const parsed = marketFieldsSchema.safeParse([{ fieldId: 'purpose', value: '' }])
    expect(parsed.success).toBe(true)
  })

  it('verlangt von der eigenen Foundation keinen Beleg', () => {
    // Bestätigte eigene Felder sind BESCHLOSSEN, nicht zitiert — ein Beleg
    // wäre eine Quellenangabe auf sich selbst.
    const parsed = marketFieldsSchema.safeParse([
      { fieldId: 'purpose', value: 'Wir machen Kaffee begreifbar.', source: 'foundation' },
    ])
    expect(parsed.success).toBe(true)
  })

  it('kappt ein zu langes Zitat (Zitatschranke §2.9 Nr. 4)', () => {
    const parsed = marketFieldsSchema.safeParse([
      { fieldId: 'pitch', value: 'x', evidence: { ...evidence, quote: 'a'.repeat(201) } },
    ])
    expect(parsed.success).toBe(false)
  })

  it('lässt eine KI-Aussage erst ab zwei übereinstimmenden Modellen zu (§7.5 b)', () => {
    expect(marketAiViewSchema.safeParse([{ fieldId: 'pitch', value: 'x', agree: 1, asked: 3 }]).success).toBe(false)
    expect(marketAiViewSchema.safeParse([{ fieldId: 'pitch', value: 'x', agree: 2, asked: 3 }]).success).toBe(true)
    // Mehr Zustimmung als Befragte gibt es nicht.
    expect(marketAiViewSchema.safeParse([{ fieldId: 'pitch', value: 'x', agree: 3, asked: 2 }]).success).toBe(false)
  })

  it('macht aus kaputtem JSON `undefined` statt eines Absturzes', () => {
    expect(parseMarketJson('{kein json', marketFieldsSchema)).toBeUndefined()
    expect(parseMarketJson('', marketFieldsSchema)).toBeUndefined()
    expect(parseMarketJson(null, marketFieldsSchema)).toBeUndefined()
    // Gültiges JSON, das nicht zum Schema passt, ist derselbe Fall.
    expect(parseMarketJson('[{"fieldId":"gibtEsNicht","value":""}]', marketFieldsSchema)).toBeUndefined()
    expect(parseMarketJson('[]', marketFieldsSchema)).toEqual([])
  })
})

/**
 * DIE VERTRAULICHKEITS-ZUSAGE (MV1 M4, Plan §2.9 Nr. 7 + §7.2 Nr. 4).
 *
 * Eine FREIGEGEBENE fremde Marke liefert ihr Marktprofil aus denselben
 * bestätigten Feldern wie die eigene — aber ausschliesslich aus ÖFFENTLICHEN
 * (`loadMarketOwnProfile(..., { publicOnly: true })`). Zwei Dinge sichern
 * das ab, und beide werden hier geprüft:
 *
 *  1. KEIN Marktprofil-Feld zeigt heute auf eine nicht-öffentliche Session.
 *     Diese Prüfung ist der Wächter über die Abbildung selbst: fügte jemand
 *     `a.complaints` (Beschwerden, `internal`) zu `MARKET_FIELDS` hinzu,
 *     reiste die Aussage eines Kunden über seine unzufriedenen Kunden in das
 *     Werkzeug eines Fremden.
 *  2. Es GIBT nicht-öffentliche Sessions — sonst prüfte Nr. 1 nichts
 *     (Gegenprobe; ohne sie wäre der Test grün, wenn `sensitivity` eines
 *     Tages verschwände).
 */
describe('Vertraulichkeit fremder Marken (M4)', () => {
  it('kein Marktprofil-Feld zeigt auf eine nicht-öffentliche Session', () => {
    const leaks: string[] = []
    for (const field of MARKET_FIELDS) {
      for (const slotId of field.slotIds) {
        const slot = slotById(slotId)
        if (slot && slot.sensitivity !== 'public') leaks.push(`${field.id} → ${slotId} (${slot.sensitivity})`)
      }
    }
    expect(leaks).toEqual([])
  })

  it('GEGENPROBE: es gibt überhaupt nicht-öffentliche Sessions', () => {
    const internal = BRAND_SLOTS.filter(slot => slot.sensitivity !== 'public')
    expect(internal.length).toBeGreaterThan(0)
  })
})
