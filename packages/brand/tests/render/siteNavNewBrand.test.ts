import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { BwSiteNavNewBrand } from '#components'

/**
 * „Neue Marke" aus der Kopfzeile, seit PERF-006 (Bahn 5) ein eigener,
 * nachgeladener Baustein (`BwSiteNavNewBrand`). Hier: er trägt allein —
 * geöffnet zeigt er das Fenster mit seinem Titel. Die Erwartung kommt ROH aus
 * der Sprachdatei (Beweis-Regel 1); Gegenprobe: geschlossen steht er nicht da.
 */
const en = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/en.json'), 'utf8')) as { brand: { new: { title: string } } }
const de = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/de.json'), 'utf8')) as { brand: { new: { title: string } } }
const titles = [en.brand.new.title, de.brand.new.title]

describe('BwSiteNavNewBrand', () => {
  it('geöffnet: das Fenster „Neue Marke" steht da', async () => {
    const wrapper = await mountSuspended(BwSiteNavNewBrand, { props: { 'open': true, 'onUpdate:open': () => {} }, attachTo: document.body })
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(titles.some(title => text.includes(title))).toBe(true)
    wrapper.unmount()
  })

  it('Gegenprobe: geschlossen steht kein Fenster da', async () => {
    const wrapper = await mountSuspended(BwSiteNavNewBrand, { props: { 'open': false, 'onUpdate:open': () => {} }, attachTo: document.body })
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(titles.some(title => text.includes(title))).toBe(false)
    wrapper.unmount()
  })
})
