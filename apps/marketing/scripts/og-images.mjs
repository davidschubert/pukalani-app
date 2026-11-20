/**
 * OG-Bild-Generator (1200×630) — ein eigenes Social-Bild pro Seite und Sprache.
 *
 * Warum so und nicht mit einem Modul:
 *  - Die Bilder werden EINMAL erzeugt und COMMITTET. Prod braucht dadurch keinen
 *    Renderer, kein Modul, keine Laufzeit-Kosten — nur statische Dateien.
 *  - Gerendert wird mit dem bereits vorhandenen Playwright + dem SYSTEM-Chrome
 *    (channel: 'chrome'): keine neue Abhängigkeit, kein Browser-Download.
 *  - Die Titel kommen DIREKT aus den i18n-Dateien. Kein zweiter Ort, an dem
 *    Copy gepflegt werden müsste (und veralten könnte).
 *
 * Aufruf:  pnpm --filter marketing og:images
 * Danach:  public/og/*.jpg committen.
 */
import { chromium } from '@playwright/test'
import { cardHtml } from './og-card.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const OUT_DIR = resolve(APP, 'public/og')

const locales = ['de', 'en']
const messages = Object.fromEntries(
  locales.map(loc => [loc, JSON.parse(readFileSync(resolve(APP, `i18n/locales/${loc}.json`), 'utf8')).marketing]),
)

/** Pfad in der i18n-Struktur auflösen ('gdpr.title'). */
function pick(loc, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), messages[loc])
}

/**
 * Welche Bilder entstehen. `title` ist der i18n-Pfad der Überschrift, `sub` der
 * Unterzeile. Die Dateinamen spiegeln die Route (og/<name>-<locale>.png).
 */
const CARDS = [
  { name: 'home', title: 'hero.title', sub: 'hero.eyebrow' },
  { name: 'gdpr', title: 'gdpr.title', sub: 'gdpr.kicker' },
  { name: 'switch', title: 'switch.title', sub: 'switch.kicker' },
  { name: 'faq', title: 'faq.title', sub: 'faq.kicker' },
  { name: 'glossary', title: 'glossary.title', sub: 'glossary.kicker' },
  ...['circle', 'skool', 'mighty-networks'].map(slug => ({
    name: `vs-${slug}`, title: `vs.items.${slug}.title`, sub: `vs.items.${slug}.sub`,
  })),
  ...['coaches', 'kurse', 'creator', 'vereine'].map(slug => ({
    name: `use-cases-${slug}`, title: `audiencePages.items.${slug}.title`, sub: `audiencePages.items.${slug}.name`,
  })),
  // KANONISCHE Produkt-Schlüssel (shared/marketing.ts), nicht die Slugs — die
  // Bild-Dateien heißen nach dem Schlüssel (`products-beitraege-en.jpg`).
  ...['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events', 'analytics'].map(slug => ({
    name: `products-${slug}`, title: `products.items.${slug}.title`, sub: `products.items.${slug}.name`,
  })),
]

mkdirSync(OUT_DIR, { recursive: true })

// System-Chrome statt Playwright-Download: channel 'chrome'.
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })

let count = 0
for (const card of CARDS) {
  for (const loc of locales) {
    const title = pick(loc, card.title)
    const sub = pick(loc, card.sub)
    if (!title || !sub) {
      console.warn(`⚠️  ${card.name}-${loc}: i18n-Pfad leer (${card.title} / ${card.sub}) — übersprungen`)
      continue
    }
    const file = resolve(OUT_DIR, `${card.name}-${loc}.jpg`)
    await page.setContent(cardHtml({ title, sub }), { waitUntil: 'load' })
    // JPEG statt PNG: der weiche Farbverlauf komprimiert als PNG miserabel
    // (~270 KB/Bild), als JPEG bei q90 sichtbar identisch und ~6x kleiner.
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90 })
    writeFileSync(file, buffer)
    count++
  }
}

await browser.close()
console.log(`✔ ${count} OG-Bilder in public/og/ erzeugt`)
