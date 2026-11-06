<script setup lang="ts">
import { BRAND_GRADIENTS } from '../../../../../shared/brandPalette'

/**
 * KLICKDUMMY „ANATOMIE" — die öffentliche Seite EINER Marke
 * (docs/plans/DISCOVER-BRANDS.md §4.2, angeglichen 2026-09-08).
 *
 * Form bleibt das DOSSIER: sticky Steckbrief links, rechts ein fließendes
 * Dokument mit Linien statt Karten (bewusst anders als die Galerie-Wand und
 * die Journal-Liste). Statisch.
 *
 * DREI ÄNDERUNGEN GEGENÜBER RUNDE 97 — und warum:
 *  · Der STECKBRIEF nennt nur, was der Snapshot trägt: Branche · Weiche ·
 *    Archetyp (+ Rest) · Stimme · Sprache · Veröffentlicht. „Stil" und
 *    „Positionierung" sind raus (die Daten gibt es erst mit Brand Design,
 *    §7), „Ort" ebenso — er steht in keinem Feld, sondern stand im Dummy.
 *    Auch die Creator-Zeile ist weg: es gibt keine öffentlichen Personen (§3.5).
 *  · Der RATINGS-Block (Klarheit/Mut/Handwerk) ist raus — Nutzer-Bewertung
 *    braucht Konten und Anti-Spam und ist Runde 2 (§7). An seiner Stelle steht
 *    der MARKENABDRUCK aus dem jüngsten Brand-Check, also eine Zahl, die es
 *    schon gibt, mit Link zu ihrer Herkunft.
 *  · „Ähnliche Marken" (gleicher Archetyp oder gleiche Farbwelt) und „Melden".
 *
 * Die Marke ist KAILUA COFFEE CO. — dasselbe Material wie `demoFoundation`
 * und `beispiel.vue`, damit das redaktionelle Beispiel-Branding (§9.4) im
 * Dummy dieselbe Marke ist wie in der Galerie.
 */

const KAILUA_GRADIENT = BRAND_GRADIENTS[0]!

/**
 * BK1-PROTOTYP, SCREEN 8 (docs/plans/BRAND-BOOK-KIT.md §2.7 „Beispiel",
 * §2.15 Nr. 8): mit `?kit=1` bekommt die Anatomie den Abschnitt „Das Kit".
 *
 * Er zeigt, dass das Beispiel-Branding nicht nur ein Dokument ist, sondern
 * BENUTZBARE Dateien hat — öffentlich, statisch aus dem Beispiel gerechnet
 * (im Produkt `Cache-Control: public`), ohne Konto-Daten. Das ist die
 * ehrlichste Werbung, die es für Produkt 03 gibt: man kann es anfassen,
 * bevor man es kauft.
 */
const route = useRoute()
const showKit = computed(() => route.query.kit === '1')

const kitTiles = [
  { file: 'brand.md', what: 'Der Brand Context als Markdown — als System-Prompt einsetzbar.', icon: 'i-ph-file-text' },
  { file: 'tokens.json', what: 'Design-Tokens nach DTCG 2025.10, hell und dunkel in einer Datei.', icon: 'i-ph-palette' },
  { file: 'marks/', what: 'Wortmarke und Monogramm als SVG, je hell, dunkel und einfarbig.', icon: 'i-ph-shapes' },
  { file: 'Pressekit', what: 'Boilerplates in drei Längen, Tagline, freigegebene Fakten.', icon: 'i-ph-newspaper' },
]

/* Steckbrief — nur Felder aus dem Snapshot (§4.2). */
const steckbrief = [
  ['Branche', 'Lebensmittel und Getränke'],
  ['Weiche', 'Neue Marke'],
  ['Archetyp', 'Der Weise · Rest Schöpfer'],
  ['Stimme', 'ruhig, fundiert, gerade heraus'],
  ['Sprache', 'Englisch'],
  ['Veröffentlicht', '5. September 2026'],
]

const werte = [
  { wort: 'Klartext', regel: 'Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt.' },
  { wort: 'Handwerk', regel: 'Lieber eine Röstung perfekt als fünf Sorten mittelmäßig.' },
  { wort: 'Nähe', regel: 'Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat.' },
]

/* Dieselben fünf Farben wie in demoFoundation/beispiel.vue. */
const palette = [
  { hex: '#4a3123', name: 'Roast' },
  { hex: '#b98a5e', name: 'Crema' },
  { hex: '#e8d3b8', name: 'Milk' },
  { hex: '#2f4a3a', name: 'Palm' },
  { hex: '#f7f2ea', name: 'Paper' },
]

/* Der Markenabdruck: acht Kategorie-Werte in Katalog-Reihenfolge
 * (Unterscheidbarkeit, Visuell, Konsistenz, Erlebnis, Klarheit, Emotion,
 * Anpassung, Handwerk) — eine Serie, weil hier EINE Marke steht. */
const fingerprint = [{ values: [82, 74, 90, 78, 94, 80, 68, 92], color: 'accent' as const, label: 'Kailua Coffee Co.' }]

/* „Ähnliche Marken": gleicher Archetyp ODER gleiche Farbwelt — die zwei
 * Facetten, die nur wir haben (§4.2). Der Grund steht an der Kachel. */
const aehnliche = [
  { name: 'Backhaus Lore', grund: 'Lebensmittel · der Jedermann', palette: 9 },
  { name: 'Hafenkontor', grund: 'gleiche Farbwelt', palette: 2 },
  { name: 'Nordlicht Physio', grund: 'ruhige Stimme · Gesundheit', palette: 5 },
  { name: 'Bergwerk Studio', grund: 'der Schöpfer', palette: 8 },
]

function gradientOf(index: number): string {
  const [a, b, c] = BRAND_GRADIENTS[index] ?? BRAND_GRADIENTS[0]!
  return `linear-gradient(165deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}

/* MELDEN — der öffentliche Weg für „hier stimmt etwas nicht" (§3.4). Im Dummy
 * schaltet er nur seinen Zustand; die echte Route ist gedrosselt und trägt
 * einen Honeypot (Muster Korrekturvorschläge). */
const reportOpen = ref(false)
const reportSent = ref(false)
const reportReason = ref('')
const reportEmail = ref('')

function sendReport(): void {
  reportSent.value = true
}

function closeReport(): void {
  reportOpen.value = false
  window.setTimeout(() => {
    reportSent.value = false
    reportReason.value = ''
    reportEmail.value = ''
  }, 200)
}
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="mx-auto max-w-7xl">
      <div class="mx-auto max-w-4xl">
        <NuxtLink to="/brand/demo/discover" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
          <UIcon name="i-ph-arrow-left" class="size-4" /> Discover Brands
        </NuxtLink>

        <!-- Hero in der Farbwelt der Marke -->
        <div class="bw-grain-hero mt-4 p-10" :style="`--hero-a: ${KAILUA_GRADIENT[0]}; --hero-b: ${KAILUA_GRADIENT[1]}; --hero-c: ${KAILUA_GRADIENT[2]}`">
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="bw-label uppercase tracking-widest" style="color: rgb(247 242 234 / 0.7)">Anatomie</p>
                <!-- §9.4: das redaktionelle Beispiel-Branding trägt sein
                     Etikett offen — es ist kein Kundenauftritt. -->
                <span class="bw-label rounded-full px-2.5 py-1" style="background: rgb(20 20 20 / 0.35); color: #f7f2ea">Beispiel</span>
              </div>
              <p class="mt-3 text-3xl font-extralight leading-snug tracking-tight">Kailua Coffee Co.</p>
              <p class="mt-4 max-w-xl text-xl font-extralight leading-snug">„One honest, quiet moment a day."</p>
            </div>
            <div class="bw-on-dark flex flex-none flex-col items-center gap-1 rounded-2xl px-4 py-3" style="background: rgb(20 20 20 / 0.35)">
              <BwScoreRing :value="87" :size="72" label="Brand Score" />
              <p class="bw-label" style="color: rgb(247 242 234 / 0.7)">Stark</p>
            </div>
          </div>
        </div>

        <!-- Dossier: Steckbrief-Leiste + fließendes Dokument -->
        <div class="mt-10 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <!-- Steckbrief (sticky) -->
          <aside class="self-start lg:sticky lg:top-10">
            <p class="bw-label border-b pb-3" style="color: var(--bw-muted); border-color: var(--bw-line-strong)">Steckbrief</p>
            <dl class="mt-4 space-y-3">
              <div v-for="row in steckbrief" :key="row[0]">
                <dt class="bw-label" style="color: var(--bw-muted)">{{ row[0] }}</dt>
                <dd class="mt-0.5 text-sm">{{ row[1] }}</dd>
              </div>
            </dl>
          </aside>

          <!-- Dokument -->
          <article class="min-w-0">
            <section>
              <p class="bw-label" style="color: var(--bw-muted)">Purpose</p>
              <p class="mt-3 text-xl font-extralight leading-relaxed tracking-tight">Es gibt uns, damit vielbeschäftigte Menschen auf Oʻahu einen ehrlichen, ruhigen Moment am Tag bekommen — eine Tasse, deren Anbau, Röstung und Ausschank Menschen mit Namen verantworten.</p>
            </section>

            <USeparator class="my-8" :ui="{ border: 'border-(--bw-line)' }" />

            <section>
              <p class="bw-label" style="color: var(--bw-muted)">Werte</p>
              <ul class="mt-4 space-y-4">
                <li v-for="w in werte" :key="w.wort" class="grid gap-x-6 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <p class="font-medium">{{ w.wort }}</p>
                  <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ w.regel }}</p>
                </li>
              </ul>
            </section>

            <USeparator class="my-8" :ui="{ border: 'border-(--bw-line)' }" />

            <section>
              <p class="bw-label" style="color: var(--bw-muted)">Stimme</p>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Ruhig, fundiert, gerade heraus — erklärt gern, ohne zu dozieren. Sagt „unsere Bohnen" statt „Premium-Arabica-Selektion" und „die Ernte war klein, deshalb kostet es mehr" statt „Lieferkettenherausforderungen".</p>
            </section>

            <USeparator class="my-8" :ui="{ border: 'border-(--bw-line)' }" />

            <section>
              <p class="bw-label" style="color: var(--bw-muted)">Farbwelt &amp; Typografie</p>
              <div class="mt-4 flex flex-wrap items-end gap-8">
                <div class="flex gap-2">
                  <div v-for="c in palette" :key="c.hex" class="flex flex-col items-center gap-1.5">
                    <div class="bw-swatch rounded-full" :style="`background: ${c.hex}; width: 2.5rem; height: 2.5rem`" />
                    <p class="bw-label" style="color: var(--bw-muted)">{{ c.name }}</p>
                  </div>
                </div>
                <div>
                  <p class="text-5xl font-extralight leading-none tracking-tight">Aa</p>
                  <p class="bw-label mt-1.5" style="color: var(--bw-muted)">ruhige Grotesk · zwei Rollen</p>
                </div>
              </div>
            </section>

            <USeparator class="my-8" :ui="{ border: 'border-(--bw-line)' }" />

            <!-- MARKENABDRUCK statt Bewertung: acht gemessene Kategorien aus
                 dem jüngsten Brand-Check, mit dem Weg zu ihrer Herkunft. -->
            <section>
              <div class="flex flex-wrap items-baseline justify-between gap-3">
                <p class="bw-label" style="color: var(--bw-muted)">Markenabdruck</p>
                <NuxtLink to="/brand/demo/ergebnis" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
                  Zum Brand-Check <UIcon name="i-ph-arrow-up-right" class="size-3.5" />
                </NuxtLink>
              </div>
              <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Aus der Prüfung des Auftritts vom 3. September 2026 — acht Kategorien, gewichtet zum Brand Score 87.</p>
              <div class="mt-4">
                <BwBrandFingerprint :series="fingerprint" :size="360" />
              </div>
            </section>
          </article>
        </div>

        <!-- DAS KIT (BK1 §2.7 „Beispiel") — nur mit `?kit=1`. -->
        <section v-if="showKit" class="mt-16">
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <h2 class="text-lg font-medium">Das Kit</h2>
            <NuxtLink to="/brand/demo/kit" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
              Ganzes Kit ansehen <UIcon name="i-ph-arrow-up-right" class="size-3.5" />
            </NuxtLink>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Beispiel-Kit — öffentlich, aus dem Beispiel-Branding gerechnet. Dieselben Dateien bekommt jede Marke, die Book &amp; Kit hat: bei jedem Abruf neu gerechnet, nirgends gespeichert.
          </p>
          <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NuxtLink
              v-for="tile in kitTiles" :key="tile.file"
              to="/brand/demo/kit"
              class="bw-card bw-card--hover flex flex-col p-6"
            >
              <UIcon :name="tile.icon" class="size-5" style="color: var(--bw-muted)" />
              <p class="mt-3 text-sm font-medium">{{ tile.file }}</p>
              <p class="mt-1.5 flex-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ tile.what }}</p>
              <p class="bw-label mt-4 inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
                Ansehen <UIcon name="i-ph-arrow-right" class="size-3.5" />
              </p>
            </NuxtLink>
          </div>
        </section>

        <!-- ÄHNLICHE MARKEN — die zwei Facetten, die nur wir haben. -->
        <section class="mt-16">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-medium">Ähnliche Marken</h2>
            <NuxtLink to="/brand/demo/discover" class="bw-label" style="color: var(--bw-muted)">Alle ansehen</NuxtLink>
          </div>
          <div class="mt-4 grid gap-x-4 gap-y-8 grid-cols-2 sm:grid-cols-4">
            <NuxtLink v-for="a in aehnliche" :key="a.name" to="/brand/demo/anatomie" class="group block">
              <div class="bw-tile relative overflow-hidden" style="aspect-ratio: 1 / 1">
                <div class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]" :style="`background: ${gradientOf(a.palette)}`" />
                <p class="absolute inset-0 grid place-items-center p-4 text-center text-base font-extralight leading-snug tracking-tight" style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)">{{ a.name }}</p>
              </div>
              <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ a.grund }}</p>
            </NuxtLink>
          </div>
        </section>

        <div class="bw-card mt-12 flex flex-wrap items-center justify-between gap-4 p-8">
          <p class="text-sm" style="color: var(--bw-ink-soft)">Gefällt euch, wie das gebaut ist? Marken sind keine Vorlagen — aber der Weg dorthin steht euch offen.</p>
          <UButton icon="i-ph-plus" label="Starte deine eigene" class="rounded-full" />
        </div>

        <!-- „Melden" bleibt dezent: es ist ein Notausgang, keine Handlung, die
             die Seite anbietet. -->
        <p class="mt-6 text-center">
          <button class="bw-pending underline underline-offset-4" @click="reportOpen = true">Melden</button>
        </p>
      </div>
      <BwSiteFooter />
    </div>

    <UModal v-model:open="reportOpen">
      <template #content>
        <div class="bw-root relative max-h-[85vh] overflow-y-auto p-8" style="background: var(--bw-surface-hi)">
          <button
            class="absolute right-5 top-5 grid size-8 place-items-center rounded-full"
            aria-label="Schließen" @click="closeReport"
          >
            <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
          </button>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Melden</p>
          <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">Stimmt hier etwas nicht?</h2>

          <template v-if="reportSent">
            <p class="mt-4 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Danke — wir sehen uns die Marke an. Wenn ihr eine Adresse hinterlassen habt, melden wir uns, sobald wir entschieden haben.</p>
            <UButton class="mt-6 rounded-full" label="Schließen" color="neutral" variant="outline" style="background: var(--bw-surface)" @click="closeReport" />
          </template>
          <template v-else>
            <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Sagt uns kurz, was: fremde Inhalte, ein fremdes Logo, etwas Rechtswidriges. Wir prüfen jede Meldung von Hand.</p>
            <UFormField label="Grund" class="mt-5">
              <UTextarea v-model="reportReason" :rows="4" placeholder="Was stimmt an dieser Marke nicht?" class="w-full" />
            </UFormField>
            <UFormField label="E-Mail (optional)" description="Nur für Rückfragen — wir veröffentlichen sie nicht." class="mt-4">
              <UInput v-model="reportEmail" type="email" placeholder="ihr@beispiel.de" class="w-full" />
            </UFormField>
            <div class="mt-6 flex flex-wrap items-center gap-2">
              <UButton label="Senden" class="rounded-full" :disabled="!reportReason.trim()" @click="sendReport" />
              <UButton label="Abbrechen" color="neutral" variant="ghost" @click="closeReport" />
            </div>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
