/**
 * DIE SPRACH-REGELN DER BETREIBER-SEITEN — pur, damit sie an beiden Enden
 * (öffentliche Seite und Editor) dieselbe Antwort geben.
 *
 * Hintergrund F60: eine Seite hat seit `pages-001` je Sprache eine eigene
 * Zeile, und die öffentliche Route fällt auf eine andere Fassung zurück, wenn
 * es die gewünschte nicht gibt. Bis heute geschah das STUMM — der Leser bekam
 * unter `/imprint` deutschen Text, das Dokument behauptete `lang="en"`, und der
 * Kopf bewarb ein englisches Alternate, hinter dem nichts Englisches stand.
 * Diese Datei ist die eine Stelle, die „das ist eine Ersatzsprache" entscheidet.
 */

/**
 * Der Sprachcode ohne Region: `de-DE` ⇒ `de`.
 *
 * Bewusst eine EIGENE Zeile und kein Import aus `core/shared/seoAlternates.ts`:
 * dessen `languageOf` ist dort nicht ausgeführt (der Filter braucht es nur
 * intern), und ein Fundament-Layer soll seine Innereien nicht deshalb öffnen,
 * weil ein Produkt-Layer dieselben drei Zeichen braucht. Die Regel ist so
 * klein, dass eine geteilte Fassung mehr Kopplung als Nutzen wäre.
 */
function baseLanguage(code: string | null | undefined): string {
  return String(code ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/**
 * Ist die gelieferte Fassung eine ERSATZSPRACHE?
 *
 * Verglichen wird die Sprache ohne Region (`de-DE` und `de` sind dieselbe
 * Fassung für den Leser). Fehlt eine der beiden Angaben, lautet die Antwort
 * NEIN: ein Hinweis, den wir nicht belegen können, wäre schlimmer als keiner.
 */
export function isFallbackLocale(requested: string | null | undefined, delivered: string | null | undefined): boolean {
  const want = baseLanguage(requested)
  const got = baseLanguage(delivered)
  if (!want || !got) return false
  return want !== got
}

/**
 * Die Sprachen der App in EINER Reihenfolge: Standardsprache zuerst, der Rest
 * wie in der Config. Der Editor zeigt seine Reiter danach — die Fassung, von
 * der übersetzt wird, steht links.
 */
export function orderedLocales(available: readonly string[], defaultLocale: string): string[] {
  const wanted = baseLanguage(defaultLocale)
  const first = available.filter(code => baseLanguage(code) === wanted)
  return [...first, ...available.filter(code => baseLanguage(code) !== wanted)]
}

/**
 * Aus welcher Fassung übersetzt der KI-Vorschlag?
 *
 * Die erste ANDERE Sprache, die überhaupt Inhalt hat — bevorzugt die
 * Standardsprache, weil dort im Regelfall die Urfassung steht. Gibt es keine,
 * ist `null` die richtige Antwort und der Knopf bleibt weg: aus dem Nichts
 * übersetzt niemand.
 */
export function translationSourceLocale(
  target: string,
  filled: readonly string[],
  defaultLocale: string,
): string | null {
  const candidates = orderedLocales(filled, defaultLocale)
    .filter(code => baseLanguage(code) !== baseLanguage(target))
  return candidates[0] ?? null
}

/**
 * Ist `code` in der Liste — ohne Rücksicht auf die Region?
 *
 * `de-DE` in der Liste und `de` gefragt ist DIESELBE Fassung; wer das mit
 * `includes` prüfte, versteckte die Alternate-Adresse einer Sprache, die es
 * gibt.
 */
export function hasLocale(available: readonly string[], code: string): boolean {
  const wanted = baseLanguage(code)
  return !!wanted && available.some(entry => baseLanguage(entry) === wanted)
}
