<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { BwSidebarBrand } from '../../../../../../app/components/BwWorkspaceSidebar.vue'
import type { DkLicense } from '../../../../utils/demoKit'
import { DS_BRAND, DS_SHADES, dsRatioText } from '../../../../utils/demoDesign'
import {
  DK_BRAND_MD_SECTIONS,
  DK_BUNDLE,
  DK_BUNDLE_FILE,
  DK_COLORS,
  DK_FACTS,
  DK_LICENSES,
  DK_LICENSE_NOTE,
  DK_MARK_FILES,
  DK_STAND,
  demoBoilerplates,
  demoBrandJson,
  demoBrandMd,
  demoRoleRows,
  demoTokensCss,
  demoTokensJson,
  dkLevelText,
} from '../../../../utils/demoKit'
import { demoFoundation } from '../../../../utils/demoFoundation'
import { demoRailWithKit } from '../../../../utils/demoRail'

/**
 * DIE LIEFERSEITE `/brand/:id/kit` (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.1, §2.7; Entscheidung §2.20 Nr. 2: EIGENE Seite, kein viertes Kapitel —
 * hier wird nichts entschieden und nichts gespeichert).
 *
 * Screens 1 und 2 aus §2.15 in EINER Datei, über `?design=`:
 *   ohne Parameter   — das volle Kit (Brand Context, Tokens, Zeichen,
 *                      Pressekit, Lizenzen, Bündel)
 *   `?design=none`   — dieselbe Seite OHNE Design-Preset: Brand Context und
 *                      Pressekit stehen, die drei Design-Kacheln zeigen die
 *                      ruhige Sperr-Fläche „Kommt mit Brand Design" + CTA
 *                      Erstgespräch (§1.11 d: KEIN Preis an der Schranke)
 *
 * DIE HÜLLE IST DIE DES ERGEBNIS-BOARDS (`design/board.vue`): BwWorkspace
 * ohne Topbar, Rail links, 72 rem Bühne — ein Kit ist eine Fläche, kein
 * Fließtext. Rechts steht nicht das Inhaltsverzeichnis, sondern der Weg
 * zurück in die Kapitel: korrigiert wird dort, nie hier.
 *
 * ALLES IST GERECHNET (§2.6): jeder Hex, jede Token-Zeile und jeder Absatz von
 * `brand.md` kommt aus `demoKit.ts` — es gibt auf dieser Seite keine zweite
 * Farbliste und keinen abgeschriebenen Beispiel-Text. Die „Laden"-Knöpfe sind
 * Attrappen (Klickdummy); „Kopieren" ist echt.
 */
const route = useRoute()
const toast = useToast()

/* Unbekannte Werte fallen auf „mit Preset" zurück — das volle Kit ist der
 * Normalfall, die Sperr-Fläche der Sonderfall. */
const hasDesign = computed(() => route.query.design !== 'none')

const railLayers = computed(() => demoRailWithKit({ unlocked: true, done: true }))

const sidebarBrands: BwSidebarBrand[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us', current: true },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' },
]

const railCollapsed = ref(false)
const asideCollapsed = ref(false)

/** Die Vorschau von `brand.md` — ohne Preset entfällt der visuelle Abschnitt. */
const mdSections = computed(() => DK_BRAND_MD_SECTIONS.filter(section => hasDesign.value || !section.needsDesign))
const brandMd = computed(() => demoBrandMd(hasDesign.value))
const brandJson = computed(() => demoBrandJson(hasDesign.value))
const tokensJson = computed(() => demoTokensJson())
const tokensCss = computed(() => demoTokensCss())

const jsonOpen = ref(false)
const tokenTab = ref('json')
const tokenTabs = [
  { value: 'json', label: 'tokens.json' },
  { value: 'css', label: 'tokens.css' },
]

const boilerplates = demoBoilerplates()
const releasedFacts = DK_FACTS.filter(fact => fact.released)
const heldFacts = DK_FACTS.filter(fact => !fact.released)

const lightRoles = computed(() => demoRoleRows('light'))
const darkRoles = computed(() => demoRoleRows('dark'))

/* Die Bündel-Zeile: ohne Preset fehlen Tokens, Zeichen und Lizenzen — die
 * README nennt das ausdrücklich (§2.6 „Ohne Design-Preset fehlen …"). */
const bundleEntries = computed(() => DK_BUNDLE.filter(entry => hasDesign.value || !entry.needsDesign))
const missingEntries = computed(() => (hasDesign.value ? [] : DK_BUNDLE.filter(entry => entry.needsDesign)))

const copied = ref<string | null>(null)

async function copyText(label: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    /* Ohne sicheren Kontext oder ohne Erlaubnis gibt es keine Zwischenablage.
     * Die Rückmeldung bleibt trotzdem stehen: der Dummy beweist die FORM. */
  }
  copied.value = label
  window.setTimeout(() => { copied.value = null }, 1600)
}

/** Alle „Laden"-Knöpfe sind Attrappen — sie sagen das auch. */
function fakeDownload(file: string): void {
  toast.add({
    title: 'Klickdummy',
    description: `${file} würde hier geladen. Im Produkt kommt die Datei aus einer Route, die sie bei jedem Abruf neu rechnet — gespeichert wird nichts.`,
    icon: 'i-ph-download-simple',
    color: 'neutral',
  })
}

function fakeBundle(): void {
  toast.add({
    title: 'Bündel',
    description: `${DK_BUNDLE_FILE} — im Produkt in-memory gepackt, Deckel 5 MB, 60 Abrufe je Marke und Tag. Hier ist es eine Attrappe.`,
    icon: 'i-ph-file-zip',
    color: 'neutral',
  })
}

/* Lizenzen sind eine DATENLISTE — deshalb `UTable` (CLAUDE.md B6). Die
 * Swatch- und Rollen-Tabellen darüber sind bewusst handgebaut: ihre Zellen
 * tragen Farbflächen und Kontrast-Proben in echter Marken-Farbe, und die
 * Spaltenbreite folgt der Rampe (elf gleich breite Stufen), nicht dem Inhalt. */
const licenseColumns: TableColumn<DkLicense>[] = [
  { accessorKey: 'family', header: 'Familie' },
  { accessorKey: 'weights', header: 'Gewichte' },
  { accessorKey: 'role', header: 'Rolle' },
  { accessorKey: 'source', header: 'Quelle' },
  { accessorKey: 'spdx', header: 'Lizenz' },
]

useHead({ title: `Brand Kit · ${DS_BRAND.title}` })
</script>

<template>
  <BwWorkspace
    stage-width="72rem"
    :progress-pct="100"
    content-locale="de"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="asideCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        @select="() => {}"
        @select-brand="to => navigateTo(to)"
      />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="railCollapsed ? 'Navigation einblenden' : 'Navigation ausblenden'"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">Brand Book &amp; Kit</p>
          <p class="truncate font-semibold">Kit</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            to="/brand/demo/foundation?design=done&kit=done" icon="i-ph-book-open" label="Brand Book"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-md:hidden"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="asideCollapsed ? 'Seitenleiste einblenden' : 'Seitenleiste ausblenden'"
            @click="asideCollapsed = !asideCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-10 pb-6">
        <!-- ── KOPF ────────────────────────────────────────────────────── -->
        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Lieferseite</p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">{{ DS_BRAND.title }} — Brand Kit</h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">
            Stand {{ DK_STAND }} · gerechnet aus euren bestätigten Werten, nicht gespeichert · Inhaltssprache {{ demoFoundation.brand.locale }}
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-2">
            <UButton icon="i-ph-file-zip" :label="`Bündel laden (${DK_BUNDLE_FILE})`" class="rounded-full" @click="fakeBundle" />
            <span v-if="!hasDesign" class="bw-state bw-state--draft">Ohne Brand Design — drei Kacheln fehlen</span>
            <span v-else class="bw-state bw-state--confirmed"><UIcon name="i-ph-check" /> Vollständig</span>
          </div>
          <p class="bw-pending mt-3">Hier wird nichts entschieden. Korrigiert wird in den Kapiteln — rechts der Weg dorthin.</p>
        </div>

        <!-- ── KACHEL 1: BRAND CONTEXT ─────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Brand Context</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">brand.md · brand.json</span>
          </div>
          <p class="bw-doc-text mt-2">
            Eure Marke in einer Datei, die eine Maschine lesen kann. Gebt sie ChatGPT, Claude oder einem Agenten, bevor er für euch schreibt — es steht nur darin, was auch im geteilten Dokument reisen darf.
          </p>

          <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <!-- Gerenderte Vorschau: dieselbe Quelle wie die Datei. -->
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="bw-label" style="color: var(--bw-muted)">Vorschau · brand.md</span>
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
                    :icon="copied === 'brand.md' ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === 'brand.md' ? 'Kopiert' : 'Kopieren'"
                    @click="copyText('brand.md', brandMd)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    icon="i-ph-download-simple" label="Laden" @click="fakeDownload('brand.md')"
                  />
                </span>
              </div>

              <div class="fd-kit-preview mt-3 rounded-2xl px-5 py-5" style="background: var(--bw-surface)">
                <p class="text-lg font-medium">{{ DS_BRAND.title }}</p>
                <p class="bw-label mt-1" style="color: var(--bw-muted)">
                  Brand Context aus branding.supply · Stand {{ DK_STAND }} · als System-Prompt einsetzbar
                </p>
                <div v-for="section in mdSections" :key="section.title" class="mt-5">
                  <p class="text-sm font-medium">{{ section.title }}</p>
                  <p
                    v-for="(paragraph, p) in section.paragraphs ?? []" :key="`p-${p}`"
                    class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
                  >{{ paragraph }}</p>
                  <ul v-if="section.bullets?.length" class="mt-1.5 flex flex-col gap-1">
                    <li
                      v-for="bullet in section.bullets" :key="bullet"
                      class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
                    >
                      <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
                      <span class="min-w-0">{{ bullet }}</span>
                    </li>
                  </ul>
                </div>
                <p v-if="!hasDesign" class="bw-pending mt-5">
                  Der Abschnitt „Visuell" fehlt: er entsteht mit Brand Design. Alles andere steht schon.
                </p>
              </div>
            </div>

            <!-- brand.json — aufklappbarer Ausschnitt. -->
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="bw-label" style="color: var(--bw-muted)">brand.json · schemaVersion 1</span>
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
                    :icon="copied === 'brand.json' ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === 'brand.json' ? 'Kopiert' : 'Kopieren'"
                    @click="copyText('brand.json', brandJson)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    icon="i-ph-download-simple" label="Laden" @click="fakeDownload('brand.json')"
                  />
                </span>
              </div>
              <div class="mt-3 rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
                <pre class="fd-code" :class="jsonOpen ? '' : 'fd-code--clipped'">{{ brandJson }}</pre>
                <UButton
                  class="mt-2 rounded-full" size="xs" color="neutral" variant="ghost"
                  :icon="jsonOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
                  :label="jsonOpen ? 'Weniger zeigen' : 'Ganze Datei zeigen'"
                  @click="jsonOpen = !jsonOpen"
                />
              </div>
              <p class="bw-pending mt-3">
                Dieselben Werte wie oben, nur maschinenlesbar. Wettbewerber, Rohantworten und gesperrte Fakten stehen in KEINER der beiden Dateien.
              </p>
            </div>
          </div>
        </section>

        <!-- ── KACHEL 2: DESIGN-TOKENS ─────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Design-Tokens</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">tokens.json · tokens.css</span>
          </div>

          <template v-if="hasDesign">
            <p class="bw-doc-text mt-2">
              Hell und dunkel in EINER Datei, mit denselben Rollen-Namen in beiden Modi — Figma bildet die Gruppen auf zwei Modi ab, Style Dictionary auf zwei Sets.
            </p>

            <!-- Die Rampen. Handgebaut statt UTable (s. Kopf der Datei): elf
                 gleich breite Farbflächen sind eine Skala, keine Liste. -->
            <div class="mt-5 grid gap-5 sm:grid-cols-2">
              <div v-for="ramp in [{ id: 'light', label: 'Rampe hell · color.brand', values: DK_COLORS.rampLight }, { id: 'dark', label: 'Rampe dunkel · color.brand-dark', values: DK_COLORS.rampDark }]" :key="ramp.id">
                <p class="bw-label" style="color: var(--bw-muted)">{{ ramp.label }}</p>
                <div class="mt-2 flex overflow-hidden rounded-lg">
                  <span
                    v-for="shade in DS_SHADES" :key="shade"
                    class="h-9 flex-1" :style="`background: ${ramp.values[shade]}`" :title="`${shade} · ${ramp.values[shade]}`"
                  />
                </div>
                <div class="mt-1.5 flex justify-between">
                  <span v-for="shade in DS_SHADES" :key="shade" class="bw-label flex-1 text-center" style="color: var(--bw-muted); font-size: 10px">{{ shade }}</span>
                </div>
              </div>
            </div>

            <!-- Rollen je Modus mit Hex und Kontrast-Urteil. -->
            <div class="mt-6 grid gap-5 sm:grid-cols-2">
              <div v-for="mode in [{ id: 'light', label: 'Rollen hell · color.light', rows: lightRoles }, { id: 'dark', label: 'Rollen dunkel · color.dark', rows: darkRoles }]" :key="mode.id">
                <p class="bw-label" style="color: var(--bw-muted)">{{ mode.label }}</p>
                <div class="mt-2 flex flex-col gap-1.5">
                  <div
                    v-for="row in mode.rows" :key="`${mode.id}-${row.role.id}`"
                    class="bw-frame grid items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]"
                    style="background: var(--bw-surface)"
                  >
                    <!-- Drei Spalten, nicht vier (Fable-Sichtbefund am Prototyp, 2026-09-09):
                         in der Zweier-Reihe hell/dunkel blieben dem Urteil ~60 px, und
                         „4,0:1 · nur große Schrift" brach auf vier Zeilen um. Name und Hex
                         stehen jetzt übereinander, das Urteil bekommt seine Breite (`auto`)
                         und bricht nie. -->
                    <span class="bw-swatch size-6 rounded-full" :style="`background: ${row.hex}`" />
                    <span class="min-w-0 leading-tight">
                      <span class="block text-sm font-medium">{{ row.role.label }}</span>
                      <span class="bw-label block tabular-nums" style="color: var(--bw-muted)">{{ row.hex }}</span>
                    </span>
                    <span v-if="row.ratio !== null && row.level !== null" class="bw-state whitespace-nowrap" :class="row.level === 'fail' ? 'bw-state--stale' : row.level === 'AA18' ? 'bw-state--draft' : 'bw-state--confirmed'">
                      {{ dsRatioText(row.ratio) }} · {{ dkLevelText(row.level) }}
                    </span>
                  </div>
                </div>
                <p class="bw-pending mt-2">
                  Die Aliasse zeigen in die Rampen: {{ mode.rows.map(row => `${row.role.label} → ${row.alias}`).join(' · ') }}
                </p>
              </div>
            </div>

            <!-- Die zwei Dateien. -->
            <div class="mt-7">
              <div class="flex flex-wrap items-center gap-3">
                <UTabs v-model="tokenTab" :items="tokenTabs" :content="false" size="sm" />
                <span class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs" color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
                    :icon="copied === tokenTab ? 'i-ph-check' : 'i-ph-copy'"
                    :label="copied === tokenTab ? 'Kopiert' : 'Kopieren'"
                    @click="copyText(tokenTab, tokenTab === 'json' ? tokensJson : tokensCss)"
                  />
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="rounded-full"
                    icon="i-ph-download-simple" label="Laden"
                    @click="fakeDownload(tokenTab === 'json' ? 'tokens.json' : 'tokens.css')"
                  />
                </span>
              </div>
              <div class="mt-3 max-h-96 overflow-auto rounded-2xl px-5 py-4" style="background: var(--bw-surface)">
                <pre class="fd-code">{{ tokenTab === 'json' ? tokensJson : tokensCss }}</pre>
              </div>
              <p class="bw-pending mt-3">
                Jeder Hex in tokens.css stammt aus tokens.json — beide kommen aus derselben Rechnung über der Basisfarbe {{ DK_COLORS.base }}. Die Kontrast-Urteile stehen als $extensions an den Rollen: sie sind Beleg, kein Token.
              </p>
            </div>
          </template>

          <FdKitLocked v-else what="Design-Tokens" />
        </section>

        <!-- ── KACHEL 3: ZEICHEN ───────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Zeichen</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">marks/ · SVG</span>
          </div>

          <template v-if="hasDesign">
            <p class="bw-doc-text mt-2">
              Wortmarke und Monogramm, je hell, dunkel und einfarbig. Gesetzt aus eurem Schriftpaar und eurer Farbwelt — die Schriften sind als Stack referenziert, nicht eingebettet.
            </p>
            <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="mark in DK_MARK_FILES" :key="mark.file" class="min-w-0">
                <FdKitMark :mark="mark" />
                <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p class="text-sm font-medium">
                    {{ mark.label }}
                    <span v-if="mark.primary" class="bw-label ms-1" style="color: var(--bw-accent)">Primär</span>
                  </p>
                  <UButton
                    size="xs" color="neutral" variant="ghost" class="ms-auto rounded-full"
                    icon="i-ph-download-simple" label="Laden" @click="fakeDownload(mark.file)"
                  />
                </div>
                <p class="bw-label" style="color: var(--bw-muted)">{{ mark.file }}</p>
              </div>
            </div>
            <p class="bw-pending mt-4">
              Kein PNG-Raster in dieser Fassung — im Haus gibt es keinen Rasterer außer dem og-Atlas. Die behaltenen KI-Entwürfe bleiben privat und liegen in keinem Bündel.
            </p>
          </template>

          <FdKitLocked v-else what="Zeichen" />
        </section>

        <!-- ── KACHEL 4: PRESSEKIT ─────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Pressekit</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">aus Botschaften, Fakten-Freigabe und Kontakt</span>
          </div>
          <p class="bw-doc-text mt-2">
            Nichts Neues — zusammengestellt aus dem, was längst entschieden ist. Was reist, habt ihr einzeln freigegeben.
          </p>

          <div class="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <p class="bw-label" style="color: var(--bw-muted)">Tagline</p>
              <p class="mt-1.5 text-lg font-extralight leading-snug tracking-tight">{{ demoFoundation.brand.tagline }}</p>

              <p class="bw-label mt-5" style="color: var(--bw-muted)">Boilerplates</p>
              <div class="mt-2 flex flex-col gap-2">
                <div v-for="entry in boilerplates" :key="entry.title" class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)">
                  <div class="flex flex-wrap items-baseline gap-2">
                    <p class="text-sm font-medium">{{ entry.title }}</p>
                    <UButton
                      size="xs" color="neutral" variant="ghost" class="ms-auto rounded-full"
                      :icon="copied === entry.title ? 'i-ph-check' : 'i-ph-copy'"
                      :label="copied === entry.title ? 'Kopiert' : 'Kopieren'"
                      @click="copyText(entry.title, entry.text)"
                    />
                  </div>
                  <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.text }}</p>
                </div>
              </div>
            </div>

            <div>
              <p class="bw-label" style="color: var(--bw-muted)">Freigegebene Fakten · {{ releasedFacts.length }} von {{ DK_FACTS.length }}</p>
              <ul class="mt-2 flex flex-col gap-1.5">
                <li v-for="fact in releasedFacts" :key="fact.id" class="flex items-start gap-2.5 text-sm leading-relaxed">
                  <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
                  <span class="min-w-0">{{ fact.text }}</span>
                </li>
              </ul>
              <ul class="mt-3 flex flex-col gap-1.5">
                <li v-for="fact in heldFacts" :key="fact.id" class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-muted)">
                  <UIcon name="i-ph-lock-simple" class="mt-0.5 size-4 flex-none" />
                  <span class="min-w-0">{{ fact.text }} <span class="bw-label">— nicht freigegeben</span></span>
                </li>
              </ul>

              <p class="bw-label mt-5" style="color: var(--bw-muted)">Presse-Kontakt</p>
              <p class="mt-1.5 text-sm">Leilani Kahale</p>
              <p class="text-sm" style="color: var(--bw-ink-soft)">Inhaberin · leilani@kailuacoffee.co</p>

              <p v-if="!hasDesign" class="bw-pending mt-4">
                Ohne Brand Design fehlen dem Pressekit die Zeichen — Text und Fakten stehen trotzdem.
              </p>

              <UButton
                class="mt-5 rounded-full" size="xs" color="neutral" variant="outline"
                style="background: var(--bw-surface-hi)"
                to="/brand/demo/kit/presskit" trailing-icon="i-ph-arrow-right" label="Freigabe ändern → Kapitel Pressekit"
              />
            </div>
          </div>
        </section>

        <!-- ── KACHEL 5: LIZENZEN ──────────────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Lizenzen</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">LICENSES.md</span>
          </div>

          <template v-if="hasDesign">
            <!-- Sichtbefund Abnahme-Runde: mit den nowrap-Zellen lief die Tabelle bei
                 1440 px rechts aus der Karte — Zellen dürfen umbrechen, Rest scrollt. -->
            <div class="mt-4 overflow-x-auto">
              <UTable
                :data="[...DK_LICENSES]" :columns="licenseColumns"
                :ui="{ td: 'whitespace-normal align-top', th: 'whitespace-normal' }"
              />
            </div>
            <p class="bw-doc-text mt-3">{{ DK_LICENSE_NOTE }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <UButton
                size="xs" color="neutral" variant="ghost" class="rounded-full"
                icon="i-ph-download-simple" label="LICENSES.md laden" @click="fakeDownload('LICENSES.md')"
              />
              <a
                v-for="license in DK_LICENSES" :key="license.family"
                :href="license.sourceUrl" target="_blank" rel="noopener"
                class="bw-label underline underline-offset-4" style="color: var(--bw-muted)"
              >{{ license.family }}</a>
            </div>
          </template>

          <FdKitLocked v-else what="Lizenzen" />
        </section>

        <!-- ── KACHEL 6: DIE README-ZEILE ──────────────────────────────── -->
        <section class="bw-card p-7 sm:p-8">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="text-xl font-medium">Was im Bündel ist</h2>
            <span class="bw-label ms-auto" style="color: var(--bw-muted)">README.md</span>
          </div>
          <ul class="mt-4 flex flex-col gap-2">
            <li v-for="entry in bundleEntries" :key="entry.file" class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <p class="bw-label" style="color: var(--bw-ink)">{{ entry.file }}</p>
              <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.what }}</p>
            </li>
          </ul>
          <template v-if="missingEntries.length">
            <p class="bw-label mt-5" style="color: var(--bw-muted)">Was fehlt — und warum</p>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="entry in missingEntries" :key="entry.file" class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <p class="bw-label" style="color: var(--bw-muted)">{{ entry.file }}</p>
                <p class="text-sm leading-relaxed" style="color: var(--bw-muted)">{{ entry.what }} — kommt mit Brand Design.</p>
              </li>
            </ul>
          </template>
          <p class="bw-pending mt-4">
            Das Bündel heißt {{ DK_BUNDLE_FILE }} und trägt den Stand im Namen. Es wird bei jedem Abruf neu gepackt — es gibt keine gespeicherte Fassung, die altern könnte.
          </p>
        </section>
      </div>
    </template>

    <!-- RECHTS: der Weg zurück in die Kapitel — hier wird nichts entschieden. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Korrigieren</p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Jede Datei hier ist eine Rechnung über euren bestätigten Werten. Wer etwas ändern will, geht ins Kapitel — das Kit zieht nach.
          </p>
          <ul class="mt-4 flex flex-col gap-1">
            <li v-for="entry in [{ to: '/brand/demo/kit/nomenclature', label: 'Nomenklatur' }, { to: '/brand/demo/kit/aiguide', label: 'AI-Guidelines' }, { to: '/brand/demo/kit/presskit', label: 'Pressekit' }, { to: '/brand/demo/design/color', label: 'Farbwelt (Design)' }, { to: '/brand/demo/design/type', label: 'Typografie (Design)' }, { to: '/brand/demo/design/mark', label: 'Zeichen (Design)' }]" :key="entry.to">
              <NuxtLink
                :to="entry.to"
                class="bw-frame flex items-center gap-3 px-3 py-2 text-sm"
                style="background: var(--bw-surface)"
              >
                <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
                <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
              </NuxtLink>
            </li>
          </ul>

          <p class="bw-label mt-6 uppercase tracking-widest" style="color: var(--bw-muted)">Zwei Zustände zeigen</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <NuxtLink to="/brand/demo/kit" class="bw-select-card rounded-full px-3 py-1 text-xs" :class="hasDesign ? 'bw-select-card--on' : ''">mit Brand Design</NuxtLink>
            <NuxtLink to="/brand/demo/kit?design=none" class="bw-select-card rounded-full px-3 py-1 text-xs" :class="hasDesign ? '' : 'bw-select-card--on'">ohne Brand Design</NuxtLink>
          </div>

          <p class="bw-label mt-6 uppercase tracking-widest" style="color: var(--bw-muted)">Was hier nicht steht</p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Wettbewerber, Beschwerden, Rohantworten und die zwei gesperrten Fakten. Die Reise-Regel des geteilten Links ist auch die Export-Regel.
          </p>
        </div>
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter :progress-pct="100" progress-title="Book &amp; Kit" progress-count="3/3" />
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>

<style scoped>
.fd-code {
  font-family: var(--bw-font-mono);
  font-size: 11px;
  line-height: 18px;
  white-space: pre;
  color: var(--bw-ink-soft);
  margin: 0;
}
/* Der JSON-Ausschnitt bleibt zugeklappt kurz — eine ganze Datei im Kopf der
 * Seite wäre eine Wand, keine Auskunft. */
.fd-code--clipped { max-height: 14rem; overflow: hidden; }
.fd-kit-preview { max-height: 32rem; overflow-y: auto; }
</style>
