import { describe, expect, it } from 'vitest'
import { shouldAutoLinkTicketText } from '../shared/ticketAutolink'

/** RU1 (c) — Dateinamen bleiben Text, echte Adressen werden Links. */
describe('shouldAutoLinkTicketText', () => {
  it.each([
    'README.md',
    'package.json',
    'nuxt.config.ts',
    'app.vue',
    'docs/OPEN-ITEMS.md',
    'example.com',
    'pukalani.app/preise',
    'mail@example.com',
  ])('%s wird NICHT von selbst verlinkt', (text) => {
    expect(shouldAutoLinkTicketText(text)).toBe(false)
  })

  it.each([
    'https://pukalani.app',
    'http://localhost:3000/dashboard',
    'mailto:mail@example.com',
    'www.example.com',
    'www.example.com/pfad?x=1',
  ])('%s wird verlinkt', (text) => {
    expect(shouldAutoLinkTicketText(text)).toBe(true)
  })
})
