import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  generateInviteCode,
  generatePassword,
  inviteCodeHash,
  parseEnvFile,
  PROBE_EMAIL_DOMAIN,
  probeEmail,
  probeSiteBody,
  runStamp,
  waitForPage,
} from '../../../scripts/lib/probe-stage.mjs'

/**
 * Die reinen Teile der gemeinsamen Hilfe für Beweis-Skripte und Bühne
 * (`scripts/lib/probe-stage.mjs`, OPS-009). Dass der Rumpf zur ECHTEN Route
 * passt, belegt `packages/onboarding/tests/probeSiteBody.test.ts`; hier geht
 * es um das Verhalten der Bausteine selbst. Kein Netz.
 */

describe('probeSiteBody', () => {
  it('liefert den vollständigen Wizard-Rumpf mit bestätigten Betreiber-Bedingungen', () => {
    expect(probeSiteBody({ name: 'Kiez', slug: 'kiez', inviteCode: 'PUKA-AB-1234' })).toEqual({
      operatorTerms: true,
      name: 'Kiez',
      slug: 'kiez',
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Probe-Community eines Beweis-Skripts.',
      vibe: 'fresh',
      inviteCode: 'PUKA-AB-1234',
      locale: 'de',
    })
  })

  it('overrides ersetzen Felder', () => {
    const body = probeSiteBody({ name: 'Kiez', slug: 'kiez', vibe: 'calm', category: 'other', description: 'Eigener Text.' })
    expect(body).toMatchObject({ vibe: 'calm', category: 'other', description: 'Eigener Text.' })
  })

  it('ein Feld mit undefined fällt ganz weg — auch das Kästchen und der Code', () => {
    const body = probeSiteBody({ name: 'Kiez', slug: 'kiez', goal: undefined, operatorTerms: undefined })
    expect(body).not.toHaveProperty('goal')
    expect(body).not.toHaveProperty('operatorTerms')
    expect(body).not.toHaveProperty('inviteCode')
    expect(Object.values(body)).not.toContain(undefined)
  })

  it('zusätzliche Felder (absichtlich ungültige Rümpfe) kommen mit', () => {
    expect(probeSiteBody({ name: 'x', slug: 'login', extra: 1 })).toMatchObject({ name: 'x', slug: 'login', extra: 1 })
  })
})

describe('Einladungs-Code', () => {
  it('Hash = sha256 des großgeschriebenen Codes (Groß-/Kleinschreibung egal)', () => {
    const expected = createHash('sha256').update('PUKA-AB-12CD', 'utf8').digest('hex')
    expect(inviteCodeHash('puka-ab-12cd')).toBe(expected)
    expect(inviteCodeHash('PUKA-AB-12CD')).toBe(expected)
  })

  it('erzeugte Codes passen ins erlaubte Format und wiederholen sich nicht', () => {
    const codes = Array.from({ length: 20 }, () => generateInviteCode('n1-kunde a'))
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9-]{6,64}$/)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('Probe-Konten', () => {
  it('Adressen liegen immer unter example.test', () => {
    expect(PROBE_EMAIL_DOMAIN).toBe('example.test')
    expect(probeEmail('buehne-a-owner', 'abc123')).toBe('buehne-a-owner-abc123@example.test')
    expect(probeEmail('Mit Leer/Zeichen', 'X1')).toMatch(/^[a-z0-9.-]+@example\.test$/)
  })

  it('kein Passwort kommt zweimal vor', () => {
    const passwords = Array.from({ length: 50 }, () => generatePassword())
    expect(new Set(passwords).size).toBe(passwords.length)
    for (const password of passwords) expect(password.length).toBeGreaterThanOrEqual(20)
  })

  it('der Lauf-Stempel taugt als Teil einer Zeilen-Id und eines Labels (alphanumerisch)', () => {
    // DIE UHR IST GESTELLT. Der Stempel ist die Millisekunde plus zwei
    // Zufalls-Bytes; 20 Stempel aus DERSELBEN Millisekunde sind rechnerisch
    // in einem von 350 Läufen zufällig doppelt — so war dieser Test am
    // 2026-11-20 auf main einmal rot. Ein Lauf ruft den Stempel einmal;
    // geprüft wird deshalb, was gilt: verschiedene Zeitpunkte ergeben
    // verschiedene Stempel.
    vi.useFakeTimers()
    try {
      const stamps = Array.from({ length: 20 }, (_, index) => {
        vi.setSystemTime(new Date(Date.UTC(2026, 10, 20, 12, 0, 0, index)))
        return runStamp()
      })
      for (const stamp of stamps) expect(stamp).toMatch(/^[a-z0-9]+$/)
      expect(new Set(stamps).size).toBe(stamps.length)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('parseEnvFile', () => {
  it('liest NAME=wert, überspringt Kommentare und Leerzeilen, nimmt Anführungszeichen ab', () => {
    const text = [
      '# Kommentar',
      '',
      'NUXT_PUBLIC_APPWRITE_ENDPOINT=http://localhost/v1',
      'NUXT_PUBLIC_APPWRITE_PROJECT_ID="account"',
      'export NUXT_PUBLIC_APPWRITE_DATABASE_ID=\'main\'',
      'MIT_KOMMENTAR=wert # Rest',
      'MIT_GLEICH=a=b',
      'kaputte zeile',
    ].join('\n')
    expect(parseEnvFile(text)).toEqual({
      NUXT_PUBLIC_APPWRITE_ENDPOINT: 'http://localhost/v1',
      NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'account',
      NUXT_PUBLIC_APPWRITE_DATABASE_ID: 'main',
      MIT_KOMMENTAR: 'wert',
      MIT_GLEICH: 'a=b',
    })
  })

  it('verträgt Windows-Zeilenenden', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })
})

describe('waitForPage (CW1 a)', () => {
  const sequence = (statuses: number[]) => {
    let index = 0
    return async () => ({ status: statuses[Math.min(index++, statuses.length - 1)] ?? 0 })
  }

  it('wartet über einen Serverfehler hinweg auf die erste fehlerfreie Seite', async () => {
    const res = await waitForPage(sequence([500, 500, 200]), { intervalMs: 1, timeoutMs: 2000 })
    expect(res?.status).toBe(200)
  })

  it('gibt nach Ablauf der Frist die letzte kaputte Antwort zurück — nichts wird verschluckt', async () => {
    const res = await waitForPage(sequence([500]), { intervalMs: 1, timeoutMs: 20 })
    expect(res?.status).toBe(500)
  })

  it('fragt bei einer sofort guten Seite genau einmal', async () => {
    let calls = 0
    const res = await waitForPage(async () => {
      calls += 1
      return { status: 200 }
    }, { intervalMs: 1, timeoutMs: 2000 })
    expect(res?.status).toBe(200)
    expect(calls).toBe(1)
  })

  it('nimmt eine eigene Bedingung (200 mit Fehlerseite zählt nicht)', async () => {
    const pages = [{ status: 200, text: 'error-page' }, { status: 200, text: 'ok' }]
    let index = 0
    const res = await waitForPage(async () => pages[Math.min(index++, 1)]!, {
      isReady: page => page.status === 200 && page.text === 'ok',
      intervalMs: 1,
      timeoutMs: 2000,
    })
    expect(res?.text).toBe('ok')
  })

  it('übersteht einen Verbindungsfehler und meldet null, wenn nie eine Antwort kam', async () => {
    const res = await waitForPage(async () => {
      throw new Error('ECONNREFUSED')
    }, { intervalMs: 1, timeoutMs: 20 })
    expect(res).toBeNull()
  })
})
