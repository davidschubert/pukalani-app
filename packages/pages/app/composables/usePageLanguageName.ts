/**
 * Der NAME einer Sprache in der Sprache des Lesers — „Deutsch"/„German".
 *
 * Zwei Bildschirme brauchen ihn (der Hinweis auf der öffentlichen Seite und die
 * Reiter im Editor), und beide sollen dieselbe Beschriftung zeigen. Deshalb
 * eine Stelle statt zweier `t()`-Aufrufe mit demselben Schlüsselmuster.
 *
 * DER AUSWEG FÜR EINE DRITTE APP-SPRACHE ist der Grund für `te()`: seit F60
 * kommen die Sprachen aus der i18n-Config, nicht mehr aus einer Konstante.
 * Käme eine dazu, ohne dass jemand `pages.language.<code>` anlegt, stünde ohne
 * diese Zeile der rohe Schlüssel auf dem Bildschirm (vue-i18n gibt bei
 * fehlender Übersetzung den SCHLÜSSEL aus — genau der Schaden, den
 * `pnpm check:i18n-keys` für Config-Schlüssel abfängt und den es hier nicht
 * abfangen kann, weil der Code erst zur Laufzeit feststeht). Der Endonym aus
 * der i18n-Config („Deutsch", „Français") ist die richtige Notfassung: er ist
 * immer da und für jeden lesbar, der die Sprache sucht.
 */
export function usePageLanguageName() {
  const { t, te, locales } = useI18n()

  return (code: string): string => {
    const key = `pages.language.${code}`
    if (te(key)) return t(key)
    const entry = locales.value.find(locale => (typeof locale === 'string' ? locale : locale.code) === code)
    if (entry && typeof entry !== 'string' && entry.name) return entry.name
    return code
  }
}
