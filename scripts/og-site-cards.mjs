/**
 * Vorschaubilder für geteilte Links (og:image, 1200×630) der zwei Sites, die
 * bis 2026-11-20 keines hatten: die Hilfe und branding.supply (SEO-005).
 *
 * Dasselbe Verfahren wie `apps/marketing/scripts/og-images.mjs`: die Bilder
 * werden EINMAL erzeugt und COMMITTET — Production braucht keinen Renderer,
 * nur statische Dateien. Gerendert wird mit dem vorhandenen Playwright (aus
 * `apps/marketing`, keine neue Abhängigkeit) und dem System-Chrome.
 *
 *  - Hilfe: die Karte der Marke (`apps/marketing/scripts/og-card.mjs`), je
 *    Sprache eine Datei. Titel = Überschrift der Startseite.
 *  - branding.supply: Zeichen und Schriftzug der Site auf ihrem Papier-Grund
 *    (Kreis-Marke mit Fingerabdruck, „Branding Supply", Farben aus
 *    `packages/brand/app/assets/css/brand.css`). EIN Bild für beide Sprachen:
 *    es trägt nur die Wortmarke und einen englischen Leitsatz — die Site ist
 *    englisch an der Wurzel.
 *
 * Aufruf:  node scripts/og-site-cards.mjs
 * Danach:  apps/help/public/og/*.jpg und apps/branding/public/og/*.png committen.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cardHtml } from '../apps/marketing/scripts/og-card.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromMarketing = createRequire(join(ROOT, 'apps/marketing/package.json'))
const requireFromCore = createRequire(join(ROOT, 'packages/core/package.json'))
const { chromium } = requireFromMarketing('@playwright/test')

const HELP_CARDS = [
  { file: 'help-en.jpg', sub: 'Pukalani Help', title: 'Your community, explained.' },
  { file: 'help-de.jpg', sub: 'Pukalani Hilfe', title: 'Deine Community, erklärt.' },
]

/** Das Zeichen der Site: derselbe Fingerabdruck wie in der Kopfzeile. */
function fingerprintSvg() {
  const collection = JSON.parse(readFileSync(requireFromCore.resolve('@iconify-json/ph/icons.json'), 'utf8'))
  const size = collection.height ?? 256
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${collection.icons.fingerprint.body}</svg>`
}

function brandingCardHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@200;400;500&display=block">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: 'Geist', -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #e9e9e7; color: #1b1b1a;
    padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative; overflow: hidden;
  }
  .brand { display: flex; align-items: center; gap: 22px; }
  .mark {
    width: 76px; height: 76px; border-radius: 50%;
    background: #1b1b1a; color: #e9e9e7;
    display: grid; place-items: center;
  }
  .mark svg { width: 46px; height: 46px; }
  .brand span { font-size: 42px; font-weight: 400; letter-spacing: -0.01em; }
  h1 { font-size: 92px; line-height: 1.04; font-weight: 200; letter-spacing: -0.035em; max-width: 980px; }
  .foot {
    display: flex; align-items: center; gap: 14px;
    font-size: 24px; font-weight: 500; color: #4a4a48;
    border-top: 1px solid rgb(27 27 26 / 0.16); padding-top: 26px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #449e5b; }
</style></head>
<body>
  <div class="brand"><div class="mark">${fingerprintSvg()}</div><span>Branding Supply</span></div>
  <h1>Build a brand that holds.</h1>
  <div class="foot"><span class="dot"></span><span>branding.supply</span></div>
</body></html>`
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })

const helpDir = join(ROOT, 'apps/help/public/og')
mkdirSync(helpDir, { recursive: true })
for (const card of HELP_CARDS) {
  await page.setContent(cardHtml({ title: card.title, sub: card.sub, foot: 'help.pukalani.app' }), { waitUntil: 'load' })
  writeFileSync(join(helpDir, card.file), await page.screenshot({ type: 'jpeg', quality: 90 }))
  console.log(`✔ apps/help/public/og/${card.file}`)
}

const brandingDir = join(ROOT, 'apps/branding/public/og')
mkdirSync(brandingDir, { recursive: true })
await page.setContent(brandingCardHtml(), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const fontLoaded = await page.evaluate(() => document.fonts.check('200 92px Geist'))
// Einfarbiger Grund: als PNG klein (anders als der Verlauf der Marketing-Karte).
writeFileSync(join(brandingDir, 'branding-supply.png'), await page.screenshot({ type: 'png' }))
console.log(`✔ apps/branding/public/og/branding-supply.png (Schrift Geist ${fontLoaded ? 'geladen' : 'NICHT geladen — Rückfall-Schrift, bitte neu erzeugen'})`)

await browser.close()
