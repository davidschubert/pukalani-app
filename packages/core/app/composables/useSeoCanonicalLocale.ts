import type { MaybeRefOrGetter, Ref } from 'vue'
import { resolvePrimaryLocale, type PrimaryLocale } from '../../shared/primaryLocale'

/**
 * DIESE SEITE GIBT ES NUR IN EINER SPRACHE (Q10, SEO-004) — der VERTRAG
 * zwischen der Seite, die es weiß, und dem Kopf, der es schreibt.
 *
 * Wörtlich dieselbe Bauart wie `useSeoHiddenLocales()` und aus demselben
 * Grund: `useLocaleSeoHead()` ist der EINZIGE Ort, an dem `canonical` und
 * `hreflang` entstehen. Eine Seite mit Inhalt von Nutzern SAGT nur, in welcher
 * Sprache ihre maßgebliche Fassung liegt; der Kern zeigt `canonical` von jeder
 * Sprach-Adresse dorthin und lässt die Sprachfassungen weg
 * (`collapseSeoToLocale`).
 *
 * WARUM NICHT `useSeoHiddenLocales(['en'])`: das heißt „die englische Fassung
 * FEHLT" und lässt `canonical` auf der eigenen Adresse — richtig für einen
 * Beitrag mit zwei redigierten Fassungen, von denen eine noch aussteht. Hier
 * gibt es beide Adressen mit demselben Text; ohne ein gemeinsames `canonical`
 * blieben es zwei Seiten.
 *
 * Aufgeräumt wird wie dort (Begründung in `useSeoHiddenLocales.ts`): nur
 * `onUnmounted`, und nur, wenn im State noch GENAU das Objekt dieses Aufrufs
 * liegt — beim Wechsel im Browser schreibt die neue Seite, bevor die alte
 * abgeräumt wird.
 */

interface CanonicalLocaleEntry {
  locale: string
}

function canonicalLocaleState(): Ref<CanonicalLocaleEntry | null> {
  return useState<CanonicalLocaleEntry | null>('pukalani-seo-canonical-locale', () => null)
}

/** Die Leseseite für `useLocaleSeoHead()` und das canonical-Plugin: `''` = keine Angabe. */
export function useSeoCanonicalLocaleState(): Readonly<Ref<string>> {
  const state = canonicalLocaleState()
  return computed(() => state.value?.locale ?? '')
}

/**
 * Die Seite meldet die Sprache ihrer maßgeblichen Fassung.
 *
 * @param source Sprachcode (`'de'`), als Ref, Computed oder Getter. Leer =
 *   „diese Seite sagt nichts dazu".
 */
export function useSeoCanonicalLocale(source: MaybeRefOrGetter<string>): void {
  const state = canonicalLocaleState()
  let own: CanonicalLocaleEntry | null = null

  watchEffect(() => {
    const locale = toValue(source)
    const entry = locale ? { locale } : null
    own = entry
    state.value = entry
  })

  onUnmounted(() => {
    if (own && state.value === own) state.value = null
  })
}

/**
 * Die Hauptsprache der Community, auf deren Host diese Seite läuft — die Wahl
 * des Owners (SSR-Payload, `tenant-brand.server.ts`), sonst die Vorgabe
 * (`shared/primaryLocale.ts`). Auf einem Host ohne Community ebenfalls die
 * Vorgabe.
 */
export function usePrimaryLocale(): Readonly<Ref<PrimaryLocale>> {
  const chosen = useState<string | null>('pukalani-tenant-primary-locale', () => null)
  return computed(() => resolvePrimaryLocale(chosen.value))
}

/**
 * DER EINE AUFRUF FÜR EINE SEITE MIT NUTZERINHALT (Diskussion, Kurs, Lektion,
 * Termin): ihre maßgebliche Adresse ist die in der Hauptsprache der Community.
 *
 * NICHT für Übersichten und nicht für die eigenen Seiten des Owners: eine
 * Übersicht trägt übersetzte Überschriften und Kategorienamen, die eigenen
 * Seiten haben echte Fassungen je Sprache (pages-Layer).
 */
export function useCommunityContentSeo(): void {
  const primary = usePrimaryLocale()
  useSeoCanonicalLocale(() => primary.value)
}
