import { describe, expect, it } from 'vitest'
import {
  MARKET_RAW_TTL_MS,
  marketRawExpiresAt,
  marketRawSweepDue,
  marketRawSweepPatch,
} from '../shared/marketRetention'

/**
 * DIE 24-STUNDEN-FRIST (Plan §1.7 Nr. 4, §2.9 Nr. 6; MV1 M5) — mit GEGENPROBE
 * an jeder Zusage.
 *
 * Die Gegenprobe ist hier das Ganze: eine Regel, die IMMER `true` sagt,
 * bestünde jeden Test, der nur „abgelaufen wird geleert" prüft — und würde
 * Rohtext löschen, den der Kunde in derselben Minute noch braucht. Eine, die
 * immer `false` sagt, bestünde jeden Test, der nur „frisch bleibt stehen"
 * prüft — und wäre die stille Version davon, die Zusage gar nicht zu haben.
 */

const NOW = new Date('2026-09-05T12:00:00.000Z')

describe('marketRawExpiresAt', () => {
  it('stempelt genau 24 Stunden nach dem Abruf', () => {
    expect(marketRawExpiresAt(true, NOW)).toBe('2026-09-06T12:00:00.000Z')
  })

  it('die Frist IST die Konstante — keine zweite Zahl daneben', () => {
    const stamped = Date.parse(marketRawExpiresAt(true, NOW) ?? '')
    expect(stamped - NOW.getTime()).toBe(MARKET_RAW_TTL_MS)
  })

  it('GEGENPROBE: ohne Rohtext gibt es keine Frist', () => {
    expect(marketRawExpiresAt(false, NOW)).toBeNull()
  })
})

describe('marketRawSweepDue', () => {
  it('abgelaufen ⇒ fällig', () => {
    expect(marketRawSweepDue(
      { rawText: 'irgendein Seitentext', rawExpiresAt: '2026-09-05T11:59:59.000Z' },
      NOW,
    )).toBe(true)
  })

  it('EXAKT jetzt ⇒ fällig (die Frist ist abgelaufen, nicht am Laufen)', () => {
    expect(marketRawSweepDue(
      { rawText: 'irgendein Seitentext', rawExpiresAt: NOW.toISOString() },
      NOW,
    )).toBe(true)
  })

  it('GEGENPROBE: Frist in der Zukunft ⇒ NICHT fällig', () => {
    expect(marketRawSweepDue(
      { rawText: 'irgendein Seitentext', rawExpiresAt: '2026-09-06T11:59:59.000Z' },
      NOW,
    )).toBe(false)
  })

  it('GEGENPROBE: eine frisch abgerufene Zeile bleibt die vollen 24 Stunden stehen', () => {
    const row = { rawText: 'frisch', rawExpiresAt: marketRawExpiresAt(true, NOW) }
    // Eine Millisekunde vor Ablauf: steht. Eine danach: weg.
    expect(marketRawSweepDue(row, new Date(NOW.getTime() + MARKET_RAW_TTL_MS - 1))).toBe(false)
    expect(marketRawSweepDue(row, new Date(NOW.getTime() + MARKET_RAW_TTL_MS + 1))).toBe(true)
  })

  it('GEGENPROBE: nichts da (kein Text, kein Stempel) ⇒ kein Schreibvorgang', () => {
    expect(marketRawSweepDue({}, NOW)).toBe(false)
    expect(marketRawSweepDue({ rawText: '', rawExpiresAt: null }, NOW)).toBe(false)
  })

  it('Rohtext OHNE Stempel ⇒ fällig (fremder Text ohne Ablaufdatum ist der verbotene Zustand)', () => {
    expect(marketRawSweepDue({ rawText: 'gelesener Seitentext' }, NOW)).toBe(true)
    expect(marketRawSweepDue({ rawText: 'gelesener Seitentext', rawExpiresAt: '' }, NOW)).toBe(true)
    expect(marketRawSweepDue({ rawText: 'gelesener Seitentext', rawExpiresAt: '   ' }, NOW)).toBe(true)
  })

  it('unlesbarer Stempel ⇒ fällig — hier ist der Zweifel teuer in die andere Richtung', () => {
    expect(marketRawSweepDue({ rawText: 'text', rawExpiresAt: 'irgendwann' }, NOW)).toBe(true)
  })

  it('GEGENPROBE zur Zeile darüber: ein STEMPEL ohne Text ist nach Ablauf trotzdem fällig, vorher nicht', () => {
    // Der Stempel allein ist Aufräum-Arbeit: er soll nicht ewig stehen bleiben.
    expect(marketRawSweepDue({ rawText: '', rawExpiresAt: '2026-09-04T00:00:00.000Z' }, NOW)).toBe(true)
    expect(marketRawSweepDue({ rawText: '', rawExpiresAt: '2026-09-06T00:00:00.000Z' }, NOW)).toBe(false)
  })
})

describe('marketRawSweepPatch', () => {
  it('leert Rohtext und Frist — und NICHTS sonst', () => {
    const patch = marketRawSweepPatch()
    expect(patch).toEqual({ rawText: '', rawExpiresAt: null })
    // Die Zusage der Vertraulichkeit hängt an dieser Zeile: was der Sweep
    // NICHT anfasst, sind `pagesFetched`, `fetchedAt`, `status` und vor allem
    // die Marktprofile mit ihren Zitaten (§1.7 Nr. 4: „danach bleibt nur das
    // strukturierte Marktprofil"). Ein zusätzlicher Schlüssel hier wäre eine
    // stille Erweiterung des Löschens.
    expect(Object.keys(patch).sort()).toEqual(['rawExpiresAt', 'rawText'])
  })

  it('das Ergebnis des Patches ist selbst nicht mehr fällig (der Sweep terminiert)', () => {
    expect(marketRawSweepDue(marketRawSweepPatch(), NOW)).toBe(false)
  })
})
