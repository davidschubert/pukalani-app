import { describe, expect, it } from 'vitest'
import { SITE_SESSION_PROVIDER, sessionMethodIcon, sessionMethodLabel, visibleSessionFactors } from '../shared/sessionMethod'

const t = (key: string) => `t:${key}`

describe('sessionMethod (PK1-EIN, Befund 1)', () => {
  it('nennt eine vom Server angelegte Sitzung „Community-Seite"', () => {
    expect(sessionMethodLabel(SITE_SESSION_PROVIDER, t)).toBe('t:account.sessions.method.server')
    expect(sessionMethodIcon(SITE_SESSION_PROVIDER)).toBe('i-ph-globe')
  })

  it('lässt die anderen Wege, wie sie waren', () => {
    expect(sessionMethodLabel('email', t)).toBe('t:account.sessions.method.email')
    expect(sessionMethodIcon('email')).toBe('i-ph-envelope-simple')
    expect(sessionMethodLabel('google', t)).toBe('Google')
    expect(sessionMethodIcon('google')).toBe('i-ph-plugs-connected')
  })

  it('zeigt den Faktor `server` nicht als Anmelde-Faktor', () => {
    expect(visibleSessionFactors(['server'])).toEqual([])
    expect(visibleSessionFactors(['password', 'totp'])).toEqual(['password', 'totp'])
  })
})
