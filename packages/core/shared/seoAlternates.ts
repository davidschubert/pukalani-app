/**
 * `hreflang` NUR AUF VORHANDENE FASSUNGEN — PURE Filterung der Kopf-Einträge
 * (BI1 I3, Plan docs/plans/BRAND-INSIGHTS.md §9.5).
 *
 * ── WARUM ES DAS GEBEN MUSS ──────────────────────────────────────────────
 * `useLocaleHead()` meldet für JEDE konfigurierte Sprache eine Alternate-
 * Adresse — es kennt nur die Sprachen der App, nicht den Inhalt der Seite. Bei
 * einem Beitrag, dessen zweite Fassung noch nicht redigiert ist, zeigt die
 * deutsche Adresse aber auf denselben englischen Text (§3.2: „eine
 * unredigierte Maschinenfassung ist nie öffentlich"). Google bekäme damit die
 * Zusage „hier steht dieselbe Seite auf Deutsch", und sie stimmt nicht.
 * §9.5 sagt deshalb wörtlich: „ein Beitrag ohne redigierte Übersetzung darf
 * keine Alternate-Adresse melden".
 *
 * ── WARUM PUR UND IM CORE ────────────────────────────────────────────────
 * Der EINE Kopf-Aufruf jeder App ist `useLocaleSeoHead()` (CLAUDE.md), und
 * dort muss der Filter greifen — eine Seite, die ihre Alternates selbst
 * setzte, hätte einen zweiten Kopf neben dem einen. Die REGEL ist trotzdem
 * ohne Nuxt prüfbar, und nur so lässt sich die Gegenprobe zeigen: dass ein
 * NICHT versteckter Eintrag stehen bleibt.
 *
 * ── `x-default` BLEIBT IMMER ─────────────────────────────────────────────
 * Es ist keine Sprachfassung, sondern die Ansage „nimm diese, wenn keine
 * passt". Sie wegzunehmen hiesse, dem Crawler für eine fehlende Sprache gar
 * nichts anzubieten — das ist schlechter als der Rückfall auf die
 * Grundfassung, und genau den zeigt die Seite ja auch.
 *
 * ── DIE TYPEN SIND DURCHREICHE-GENERISCH (wörtlich wie `seoOrigin.ts`) ───
 * unhead typisiert `link`-Einträge seit v3 als über `rel` diskriminierte
 * Union; ein zu `Record<string, string>` verengtes Ergebnis wäre an `useHead`
 * nicht mehr übergebbar. `T` erhält deshalb genau den Typ, der hereinkam.
 *
 * ── UND DIE SCHRANKE IST `object`, NICHT `{ hreflang?: string }` ─────────
 * Naheliegend wäre eine Form-Schranke gewesen. Sie geht NICHT: `CanonicalLink`
 * (aus derselben Union) hat kein einziges Feld mit ihr gemeinsam, und TypeScript
 * lehnt eine solche Zuweisung als „weak type" ab — die Union fiele auf die
 * Schranke zusammen und wäre danach nicht mehr an `useHead` übergebbar
 * (TS2345, beim Typecheck von `branding` live erwischt). Gelesen wird deshalb
 * über `stringField()`: eine Laufzeit-Prüfung statt einer Typ-Behauptung.
 */

/** Ein Feld als Zeichenkette lesen — fehlt es oder ist es keine, dann `''`. */
function stringField(entry: object, key: string): string {
  const value = (entry as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

/** Der Sprachcode einer `hreflang`/`og:locale`-Angabe: `de-DE`/`de_DE` ⇒ `de`. */
function languageOf(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/**
 * Entfernt die Alternate-Einträge der genannten Sprachen aus `links` und
 * `meta`.
 *
 * @param hiddenLocales Sprachcodes, die diese SEITE nicht hat (z. B. `['de']`)
 * @returns dieselben Einträge ohne die versteckten Sprachen
 */
export function filterSeoAlternates<L extends object, M extends object>(
  links: readonly L[],
  meta: readonly M[],
  hiddenLocales: readonly string[],
): { links: L[], meta: M[] } {
  const hidden = new Set(hiddenLocales.map(languageOf).filter(Boolean))
  if (hidden.size === 0) return { links: [...links], meta: [...meta] }

  return {
    links: links.filter((link) => {
      const value = stringField(link, 'hreflang')
      // Kein hreflang (canonical) und `x-default` bleiben unberührt.
      if (!value || value.toLowerCase() === 'x-default') return true
      return !hidden.has(languageOf(value))
    }),
    meta: meta.filter((entry) => {
      if (stringField(entry, 'property') !== 'og:locale:alternate') return true
      const value = stringField(entry, 'content')
      if (!value) return true
      return !hidden.has(languageOf(value))
    }),
  }
}
