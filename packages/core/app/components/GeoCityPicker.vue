<script setup lang="ts">
/**
 * ORTS-PICKER — tippen, auswählen, fertig (Mitglieder-Karte Etappe 1,
 * 2026-08-23).
 *
 * WARUM KEIN FREITEXTFELD: der Standort soll später auf einer Karte liegen.
 * Aus „Köln", „koeln", „Cologne" und „NRW" wird nie ein Punkt — aus einer
 * AUSWAHL schon, denn mit ihr stehen Label UND Koordinaten gemeinsam fest.
 * Deshalb ist das Modell ein Objekt oder `null`, nie ein String.
 *
 * DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF:
 *
 * (1) DIE ENTPRELLUNG (250 ms). Ohne sie fliegt je Tastendruck eine Anfrage,
 *     und die Route durchsucht je Anfrage 170.000 Orte. Der Deckel im
 *     Rate-Limit (120/min, Bucket `geo:cities`) ist auf genau diese
 *     Entprellung gerechnet.
 *
 * (2) DIE SUCHE LÄUFT AUF DEM SERVER, das Menü darf NICHT nachfiltern
 *     (`ignore-filter`). Nuxt UI filtert sonst die acht Server-Treffer noch
 *     einmal gegen den Suchbegriff — und wirft dabei genau die weg, die der
 *     Server über den ASCII-Namen gefunden hat („zue…" ⇒ „Zürich" enthält
 *     die Buchstabenfolge nicht).
 *
 * (3) DER LÄNDER-FILTER IST OPTIONAL UND BLEIBT ES (Davids Nachtrag). Er ist
 *     keine Vorstufe: ohne ihn sucht man weltweit, mit ihm findet man das
 *     kleine Berlin in Wisconsin. Fehlt das Verzeichnis auf dem Server
 *     (leere Länderliste), verschwindet das Feld ganz — ein Auswahlfeld ohne
 *     Auswahl wäre eine Lüge.
 *
 * LIZENZ: die Attribution (GeoNames, CC BY 4.0) hängt am ZEIGEN und steht
 * deshalb hier, direkt unter den Vorschlägen — dasselbe Muster wie die
 * DB-IP-Zeile unter der Sitzungsliste.
 */
import type { GeoCitiesResponse, GeoCitySuggestion, GeoCountriesResponse, ProfileLocation } from '../../shared/types/geo'
import { flagIcon } from '../utils/clientInfo'

const model = defineModel<ProfileLocation | null>({ default: null })

const { t, locale } = useI18n()

/** Kürzer als die Server-Grenze wäre sinnlos — dieselbe Zahl wie die Route. */
const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

const searchTerm = ref('')
const loading = ref(false)
const suggestions = ref<GeoCitySuggestion[]>([])

/**
 * Das ausgewählte Element des Menüs. Es trägt mehr als das Modell (den
 * Ländercode für die Flagge), deshalb ein eigener Zustand statt eines
 * Umrechnens hin und her.
 */
const selected = ref<GeoCitySuggestion | null>(toItem(model.value))

/**
 * Aus dem gespeicherten Standort wird ein Menü-Element OHNE Ländercode: der
 * Code steht nicht in den prefs (das Label reicht der Anzeige, die Karte
 * braucht die Koordinaten). Ohne Code bleibt die Flagge weg — eine ERFUNDENE
 * Flagge wäre schlimmer als keine.
 */
function toItem(location: ProfileLocation | null): GeoCitySuggestion | null {
  return location ? { label: location.label, countryCode: '', lat: location.lat, lon: location.lon } : null
}

// Von aussen gesetzter Wert (Formular-Reset, frisch geladenes Konto).
watch(model, (value) => {
  if (value?.label !== selected.value?.label) selected.value = toItem(value)
})

watch(selected, (value) => {
  model.value = value ? { label: value.label, lat: value.lat, lon: value.lon } : null
})

/** ── Länder-Filter (optional) ─────────────────────────────────────────── */

/**
 * `undefined` heißt „alle Länder". BEWUSST NICHT '' — leere Werte sind in Nuxt
 * UIs Auswahlfeldern verboten (USelectItem lässt sie gar nicht zu), und ein
 * Platzhalter-Eintrag „Alle Länder" wäre eine zweite Art, dasselbe zu sagen.
 * Geleert wird über das eingebaute X (`clear`).
 */
const country = ref<string | undefined>(undefined)
const countryCodes = ref<string[]>([])

/**
 * Die Ländernamen kommen vom BROWSER, nicht von uns: `Intl.DisplayNames`
 * kennt sie in jeder Sprache, die er ohnehin spricht. Kennt er einen Code
 * nicht, steht der Code selbst da (in Großbuchstaben) — nie ein leerer
 * Eintrag.
 */
const countryNames = computed(() => {
  const display = new Intl.DisplayNames([locale.value], { type: 'region' })
  return countryCodes.value.map(code => ({
    value: code,
    label: display.of(code.toUpperCase()) ?? code.toUpperCase(),
    icon: flagIcon(code),
  }))
})

/** Sortiert nach dem ÜBERSETZTEN Namen — alphabetisch nach Code wäre in
 *  keiner Sprache alphabetisch. */
const countryItems = computed(() =>
  [...countryNames.value].sort((a, b) => a.label.localeCompare(b.label, locale.value)),
)

onMounted(async () => {
  try {
    const response = await $fetch<GeoCountriesResponse>('/api/geo/countries')
    countryCodes.value = response.countries
  }
  catch {
    // Der Filter ist Komfort: ohne Liste bleibt er weg, die Suche läuft weiter.
    countryCodes.value = []
  }
})

/** ── Die Suche ────────────────────────────────────────────────────────── */

let timer: ReturnType<typeof setTimeout> | undefined
/**
 * Jede Anfrage bekommt eine Nummer; nur die ZULETZT gestartete darf schreiben.
 * Ohne das überholt eine langsame Antwort auf „ber" eine schnelle auf
 * „berlin" und das Menü zeigt wieder die gröberen Treffer.
 */
let requestId = 0

async function runSearch(term: string) {
  const id = ++requestId
  if (term.trim().length < MIN_QUERY_LENGTH) {
    suggestions.value = []
    loading.value = false
    return
  }

  loading.value = true
  try {
    const response = await $fetch<GeoCitiesResponse>('/api/geo/cities', {
      query: { q: term.trim(), ...(country.value ? { country: country.value } : {}) },
    })
    if (id !== requestId) return
    suggestions.value = response.cities
  }
  catch {
    if (id === requestId) suggestions.value = []
  }
  finally {
    if (id === requestId) loading.value = false
  }
}

watch(searchTerm, (term) => {
  clearTimeout(timer)
  timer = setTimeout(() => void runSearch(term), DEBOUNCE_MS)
})

// Land gewechselt ⇒ dieselbe Eingabe neu fragen (ohne Entprellung: das ist
// ein Klick, kein Tippen).
watch(country, () => {
  if (searchTerm.value.trim().length >= MIN_QUERY_LENGTH) void runSearch(searchTerm.value)
})

onScopeDispose(() => clearTimeout(timer))

// Im Script statt als Literal im Template: vue-tsc ab 3.3.9 liest jedes `//`
// in den Props einer Komponente als Zeilenkommentar, auch in einem String, und
// erzeugt ungültigen virtuellen Code (vuejs/language-tools#6240, Fix-PR #6241).
const geonamesUrl = 'https://www.geonames.org'
</script>

<template>
  <div class="space-y-2" data-geo-city-picker>
    <div class="flex flex-col gap-2 sm:flex-row">
      <USelectMenu
        v-if="countryItems.length > 0"
        v-model="country"
        :items="countryItems"
        value-key="value"
        clear
        class="sm:w-56"
        :placeholder="t('profile.locationCountryPlaceholder')"
        :aria-label="t('profile.locationCountryLabel')"
        data-geo-country-select
      />

      <UInputMenu
        v-model="selected"
        v-model:search-term="searchTerm"
        :items="suggestions"
        :loading="loading"
        ignore-filter
        clear
        class="w-full"
        :placeholder="t('profile.locationPlaceholder')"
        data-geo-city-input
      >
        <template #item-leading="{ item }">
          <UIcon v-if="item.countryCode" :name="flagIcon(item.countryCode)" class="size-4 shrink-0" />
        </template>
        <template #empty>
          {{ searchTerm.trim().length < MIN_QUERY_LENGTH ? t('profile.locationHint') : t('profile.locationNoMatch') }}
        </template>
      </UInputMenu>
    </div>

    <!-- (a) Transparenz: der Standort ist freiwillig UND er wird gezeigt. Beides
         gehört ans Feld, nicht in eine Datenschutzerklärung. -->
    <p class="text-xs text-muted">
      {{ t('profile.locationDisclosure') }}
    </p>

    <!-- (b) Attribution (CC BY 4.0) — Pflicht der Lizenz, hängt am ZEIGEN der
         Vorschläge. Muster: die DB-IP-Zeile unter der Sitzungsliste. -->
    <i18n-t keypath="profile.locationAttribution" tag="p" scope="global" class="text-xs text-dimmed">
      <template #provider>
        <ULink :to="geonamesUrl" target="_blank" rel="noopener" class="underline">GeoNames</ULink>
      </template>
    </i18n-t>
  </div>
</template>
