/**
 * `LICENSES.md` — DIE SCHRIFTEN DIESER MARKE MIT LIZENZ UND BEZUGSWEG
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6, Paket K2).
 *
 * ── WARUM DIESE DATEI ÜBERHAUPT IM BÜNDEL LIEGT ──────────────────────────
 * Ein Kit ohne Lizenz-Auskunft ist die eine Datei, die jemanden in
 * Schwierigkeiten bringen kann: Der Empfänger sieht `font.heading` und lädt
 * irgendwo eine Datei „Source Serif" herunter — vielleicht die freie, vielleicht
 * eine kommerzielle Namensvetterin. Diese Seite nennt Familie, Schnitte,
 * QUELLE und SPDX-Kennung, und sie sagt ausdrücklich, dass im Bündel keine
 * Schriftdateien liegen.
 *
 * ── SIE NENNT NUR, WAS DIESE MARKE BENUTZT ───────────────────────────────
 * Nicht den ganzen Katalog: zwei Familien aus dem gewählten Paar (bei
 * `humanist` ist es eine) plus die feste Mono-Rolle. Eine Liste aller sieben
 * wäre eine Auskunft über unser Produkt, nicht über diese Marke.
 *
 * ── OHNE PRESET NUR DER HINWEIS ──────────────────────────────────────────
 * Solange Schicht 2 nicht steht, gibt es kein Schriftpaar. Die Datei fällt
 * dann nicht weg, sondern sagt in einem Satz, warum sie leer ist — dieselbe
 * Ehrlichkeit wie das Manifest, das `available: false` mit Grund zeigt.
 *
 * DIESE DATEI IST PUR: kein i18n-Modul, kein H3, kein Appwrite. Die zwei
 * Sprachen stehen im Code (dieselbe Regel wie in `brandDesignVocab.ts`).
 */

import {
  BRAND_DECLARED_FONT_WEIGHTS,
  BRAND_MONO_FAMILY,
  BRAND_MONO_LICENSE,
  brandFontLicense,
  brandFontPair,
} from './brandFontPairs'
import type { BrandDesignSnapshotPreset } from './types/brand'

/**
 * DIE SCHNITTE DER MONO-ROLLE. Sie steht in KEINER `brand-fonts.css`-Zeile
 * (die Mono der Werkstatt ist eine andere Sache, s. `BRAND_MONO_FAMILY`) —
 * für die MARKE ist sie eine Rolle mit genau einem Schnitt: D4 setzt fest
 * „Herkunftsangaben, Preise, Zahlen und Code", und dafür braucht niemand
 * einen zweiten Schnitt.
 */
const MONO_WEIGHTS: readonly number[] = [400]

interface LicenseRow {
  family: string
  role: string
  weights: readonly number[]
  spdx: string
  source: string
}

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/**
 * DIE ZEILEN DER TABELLE — ohne Doppelung, in der Reihenfolge Überschrift,
 * Fließtext, Mono. Exportiert, weil der Test sie ZÄHLT (jede Familie genau
 * einmal, jede mit SPDX und Quelle) und K6 sie später für die README braucht.
 */
export function brandLicenseRows(
  preset: BrandDesignSnapshotPreset | null,
  locale: string,
): LicenseRow[] {
  const de = isDe(locale)
  const rows: LicenseRow[] = []
  const pair = preset ? brandFontPair(preset.type.pair) : undefined

  const push = (family: string, role: string, weights: readonly number[], spdx: string, source: string): void => {
    // Dieselbe Familie in zwei Rollen (`humanist`) ist EINE Zeile — die Rolle
    // wird dann zusammengezogen, statt zweimal dieselbe Lizenz zu behaupten.
    const existing = rows.find(row => row.family === family)
    if (existing) {
      if (!existing.role.includes(role)) existing.role = `${existing.role}, ${role}`
      return
    }
    rows.push({ family, role, weights, spdx, source })
  }

  if (pair) {
    push(
      pair.headingFamily,
      de ? 'Überschriften' : 'Headings',
      BRAND_DECLARED_FONT_WEIGHTS[pair.headingFamily] ?? [],
      pair.headingLicense.spdx,
      pair.headingLicense.source,
    )
    push(
      pair.bodyFamily,
      de ? 'Fließtext' : 'Body text',
      BRAND_DECLARED_FONT_WEIGHTS[pair.bodyFamily] ?? [],
      pair.bodyLicense.spdx,
      pair.bodyLicense.source,
    )
    push(
      BRAND_MONO_FAMILY,
      de ? 'Herkunft, Preise, Code' : 'Origin details, prices, code',
      MONO_WEIGHTS,
      BRAND_MONO_LICENSE.spdx,
      BRAND_MONO_LICENSE.source,
    )
  }

  // Eine Familie ohne geprüfte Lizenz fällt NICHT heraus (sie wird benutzt!),
  // sondern trägt eine leere Kennung — der Wächter `validateBrandFontPairs`
  // macht diesen Zustand im Katalog rot, bevor er hier ankommt.
  return rows.map(row => ({
    ...row,
    spdx: row.spdx || (brandFontLicense(row.family)?.spdx ?? ''),
    source: row.source || (brandFontLicense(row.family)?.source ?? ''),
  }))
}

/** Der Satz, der die wichtigste Zeile dieser Datei ist. */
export function brandLicenseNote(locale: string): string {
  return isDe(locale)
    ? 'Dateien bei der Quelle laden — im Bündel liegen keine Schriftdateien. '
      + 'Die Lizenzen erlauben die Weitergabe; wir machen es trotzdem nicht: eine mitgelieferte '
      + 'Datei wäre eine zweite Fassung, die irgendwann von der Quelle abweicht.'
    : 'Download the files from the source — the bundle contains no font files. '
      + 'The licences would allow us to ship them; we do not: a bundled file is a second copy that '
      + 'will eventually drift from the source.'
}

/**
 * `LICENSES.md` als Text. Der Rahmen steht in der INHALTSSPRACHE der Marke
 * (dieselbe Regel wie `brand.md`, §2.17) — Familiennamen und SPDX-Kennungen
 * sind Eigennamen und bleiben, wie sie sind.
 */
export function renderBrandLicenses(
  preset: BrandDesignSnapshotPreset | null,
  locale: string,
): string {
  const de = isDe(locale)
  const lines: string[] = []
  lines.push(de ? '# Schriften und Lizenzen' : '# Fonts and licences')
  lines.push('')

  if (!preset) {
    lines.push(de
      ? 'Diese Marke hat noch keine Schrift-Entscheidung — sie entsteht in Brand Design '
        + '(Kapitel „Typografie"). Sobald sie steht, nennt diese Seite die Familien, ihre '
        + 'Schnitte, die Quelle und die Lizenz.'
      : 'This brand has not chosen a typeface yet — that happens in Brand Design (chapter '
        + '"Typography"). Once it has, this page names the families, their weights, the source '
        + 'and the licence.')
    lines.push('')
    lines.push(brandLicenseNote(locale))
    return `${lines.join('\n')}\n`
  }

  lines.push(de
    ? '| Familie | Rolle | Schnitte | Lizenz | Quelle |'
    : '| Family | Role | Weights | Licence | Source |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const row of brandLicenseRows(preset, locale)) {
    const weights = row.weights.length ? row.weights.join(', ') : '—'
    lines.push(`| ${row.family} | ${row.role} | ${weights} | ${row.spdx || '—'} | ${row.source || '—'} |`)
  }
  lines.push('')
  lines.push(brandLicenseNote(locale))
  return `${lines.join('\n')}\n`
}
