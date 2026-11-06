import type { BrandKitFileId, BrandKitReadmeManifest } from './types/brandKit'

/**
 * `README.md` — WAS IM BÜNDEL LIEGT, VON WANN ES IST UND WAS FEHLT
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6, Paket K3).
 *
 * ── SIE BEKOMMT DAS MANIFEST, SIE RECHNET ES NICHT ───────────────────────
 * Wer im Bündel liegt, weiss die REGISTRY (`brandKitFiles.ts`) — sie kennt die
 * Dateien und ihre Voraussetzungen. Diese Datei bekommt das Ergebnis als
 * `BrandKitReadmeManifest` herein und schreibt es auf. Das ist nicht Zierde,
 * sondern der Grund, warum es hier keinen Zirkel gibt: die Registry ruft den
 * Renderer, der Renderer ruft die Registry NICHT zurück. Und es hält die
 * Zusage aus §2.6 ein — die README nennt, was fehlt, statt ein volles Kit zu
 * behaupten.
 *
 * ── DER TEXT JE DATEI STEHT HIER, NICHT IN DER REGISTRY ──────────────────
 * Die Registry sagt, WAS es gibt (Id, Dateiname, MIME, Voraussetzung); dieser
 * Katalog sagt, WOZU es gut ist — in zwei Sprachen. Beides in einer Tabelle
 * hiesse, eine technische Karte mit Prosa zu mischen, die nur eine einzige
 * Datei liest.
 *
 * DIESE DATEI IST PUR: kein H3, kein Appwrite, kein i18n-Modul.
 */

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

function text(locale: string, de: string, en: string): string {
  return isDe(locale) ? de : en
}

/** Ein Satz je Datei — was sie ist und wofür man sie nimmt. */
const WHAT: Readonly<Record<BrandKitFileId, { de: string, en: string }>> = {
  'brand.md': {
    de: 'Der Brand Context als Markdown — direkt als System-Prompt einsetzbar.',
    en: 'The brand context as markdown — ready to use as a system prompt.',
  },
  'brand.json': {
    de: 'Dieselben Werte maschinenlesbar, schemaVersion 1.',
    en: 'The same values machine-readable, schemaVersion 1.',
  },
  'tokens.json': {
    de: 'Design-Tokens nach DTCG 2025.10, hell und dunkel in einer Datei.',
    en: 'Design tokens per DTCG 2025.10, light and dark in one file.',
  },
  'tokens.css': {
    de: 'Dieselben Werte als CSS-Variablen plus Tailwind-@theme-Block.',
    en: 'The same values as CSS variables plus a Tailwind @theme block.',
  },
  'licenses.md': {
    de: 'Schriftfamilien mit Gewichten, Quelle und Lizenz — ohne Schriftdateien.',
    en: 'Font families with weights, source and licence — without the font files.',
  },
  'readme.md': {
    de: 'Diese Datei.',
    en: 'This file.',
  },
}

/** Warum eine Datei fehlt — in Worten, nicht als Code. */
function reasonText(reason: string | undefined, locale: string): string {
  if (reason === 'design_missing') {
    return text(locale, 'kommt mit Brand Design', 'arrives with Brand Design')
  }
  return text(locale, 'noch nicht gebaut', 'not built yet')
}

/**
 * `README.md` — vier kurze Abschnitte: was es ist, was drin ist, was fehlt,
 * wie man es einsetzt.
 *
 * Die drei Sätze unter „Wie einsetzen" sind die einzige ANLEITUNG des ganzen
 * Bündels (§2.6). Sie nennen je Datei genau EIN Werkzeug und keinen
 * Werkzeugkasten: wer mehr will, findet es; wer weniger weiss, fängt an.
 */
export function renderBrandKitReadme(manifest: BrandKitReadmeManifest, locale: string): string {
  const de = isDe(locale)
  const stand = /^(\d{4}-\d{2}-\d{2})/.exec(manifest.stand.trim())?.[1] ?? ''
  const title = manifest.title.replace(/\s+/g, ' ').trim() || 'Brand'
  const there = manifest.files.filter(file => file.available)
  const missing = manifest.files.filter(file => !file.available)

  const lines: string[] = []
  lines.push(`# ${de ? 'Brand Kit' : 'Brand kit'} — ${title}`)
  lines.push('')
  lines.push([
    de ? 'Aus branding.supply' : 'From branding.supply',
    ...(stand ? [de ? `Stand ${stand}` : `as of ${stand}`] : []),
    de ? 'gerechnet, nie gespeichert' : 'computed, never stored',
  ].join(' · '))

  lines.push('')
  lines.push(`## ${de ? 'Inhalt' : 'Contents'}`)
  lines.push('')
  for (const file of there) {
    lines.push(`- \`${file.filename}\` — ${text(locale, WHAT[file.id].de, WHAT[file.id].en)}`)
  }
  /*
   * DER ORDNER `marks/` ALS EINE ZEILE (K6) — er ist keine Registry-Datei,
   * sondern eine je Setzung wechselnde Menge. Deshalb steht hier die ZAHL und
   * nicht acht Dateinamen: eine Liste, die mit jedem Katalog-Eintrag anders
   * aussieht, ist in einer README keine Auskunft, sondern Rauschen.
   */
  if (manifest.marks > 0) {
    lines.push(`- \`marks/\` — ${text(
      locale,
      `${manifest.marks} Setzungen als SVG: Wortmarke und Monogramm je Variante, `
      + 'Schriften als Stack referenziert, nicht eingebettet.',
      `${manifest.marks} settings as SVG: wordmark and monogram per variant, `
      + 'fonts referenced as a stack, not embedded.',
    )}`)
  }

  if (missing.length > 0 || manifest.marks === 0) {
    lines.push('')
    lines.push(`## ${de ? 'Was fehlt' : 'What is missing'}`)
    lines.push('')
    for (const file of missing) {
      lines.push(`- \`${file.filename}\` — ${reasonText(file.reason, locale)}`)
    }
    if (manifest.marks === 0) {
      lines.push(`- \`marks/\` — ${reasonText('design_missing', locale)}`)
    }
    lines.push('')
    lines.push(de
      ? 'Ohne Brand Design gibt es keine Farbwelt und kein Schriftpaar — die '
      + 'Token- und Lizenz-Dateien wären dann eine Behauptung. Der Brand Context '
      + '(`brand.md`, `brand.json`) steht unabhängig davon.'
      : 'Without Brand Design there is no colour world and no font pair — the '
      + 'token and licence files would be a claim. The brand context (`brand.md`, '
      + '`brand.json`) stands on its own.')
  }

  lines.push('')
  lines.push(`## ${de ? 'Wie einsetzen' : 'How to use it'}`)
  lines.push('')
  lines.push(de
    ? '1. `brand.md` als System-Prompt in ChatGPT, Claude oder Cursor einsetzen — '
    + 'davor, nicht dazwischen.'
    : '1. Use `brand.md` as a system prompt in ChatGPT, Claude or Cursor — up '
    + 'front, not in between.')
  lines.push(de
    ? '2. `tokens.json` in Figma importieren (Variablen) oder mit Style Dictionary '
    + 'in eigene Formate übersetzen.'
    : '2. Import `tokens.json` into Figma (variables) or run it through Style '
    + 'Dictionary into your own formats.')
  lines.push(de
    ? '3. `tokens.css` in die Anwendung einbinden — die Variablen tragen dieselben '
    + 'Namen wie im Theme.'
    : '3. Drop `tokens.css` into the app — the variables carry the same names as '
    + 'in the theme.')

  return `${lines.join('\n').trimEnd()}\n`
}
