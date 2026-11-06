<script setup lang="ts">
/** Clickdummy: "Meine Brands" (Dashboard-Modul-Vorschau). */
const newBrandOpen = ref(false)

/** Die acht Screens des BK1-Prototyps (docs/plans/BRAND-BOOK-KIT.md §2.15). */
const bk1Screens: { num: string, label: string, note: string, to: string }[] = [
  { num: 'Screen 1', label: 'Kit — voll', note: 'Brand Context, Tokens hell/dunkel, Zeichen, Pressekit, Lizenzen, Bündel.', to: '/brand/demo/kit' },
  { num: 'Screen 2', label: 'Kit — ohne Brand Design', note: 'Dieselbe Seite mit drei ruhigen Sperr-Flächen. Kein Preis, ein Gespräch.', to: '/brand/demo/kit?design=none' },
  { num: 'Screen 3', label: 'Brand Book', note: 'Die Leseansicht mit Nomenklatur, Anwendungs-Kapiteln, Pressekit, AI-Guidelines.', to: '/brand/demo/foundation?design=done&kit=done' },
  { num: 'Screen 4', label: 'Kapitel AI-Guidelines', note: 'Nika: Umfang, Freigabe, Leitplanken als Entwurf, drei Prompt-Vorlagen.', to: '/brand/demo/kit/aiguide' },
  { num: 'Screen 5', label: 'Kapitel Nomenklatur', note: 'Otto: Produkttypen als Chips, Namensmuster auf der Bühne, Regeln.', to: '/brand/demo/kit/nomenclature' },
  { num: 'Screen 6', label: 'Kapitel Pressekit', note: 'George: Fakten-Freigabe (Opt-in), Presse-Kontakt mit Vorlagen, Vorschau.', to: '/brand/demo/kit/presskit' },
  { num: 'Screen 7', label: 'Betreiber — Freischaltungen', note: 'Eine Tabelle, zwei Spalten: Brand Design und Ableitung, mit Bestätigung.', to: '/brand/demo/kit/unlock' },
  { num: 'Screen 8', label: 'Anatomie mit „Das Kit"', note: 'Das öffentliche Beispiel-Kit auf der Discover-Seite von Kailua.', to: '/brand/demo/anatomie?kit=1' },
]
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="@container mx-auto max-w-7xl">
      <div>
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-semibold">Brandings</h1>
        <p class="mt-1 text-sm" style="color: var(--bw-muted)">Jedes Branding ist ein eigener Wizard-Lauf — pausiere jederzeit, dein Stand bleibt gespeichert.</p>
      </div>
      <div class="grid gap-x-6 gap-y-20 @sm:grid-cols-2 @md:grid-cols-4">
        <!-- Runde 35 (David): der „Euer Branding"-Einstieg wohnt AN der
             Kachel — gesperrt bis zum Foundation-Abschluss, danach aktiv
             (dritte Demo-Brand „Hafenkontor" zeigt den offenen Zustand). -->
        <NuxtLink to="/brand/demo/werte" class="block">
          <BwBrandCard
            title="Kailua Coffee Co." path="Neue Marke" flag="i-circle-flags-us"
            :gradient="['#e8d3b8', '#b98a5e', '#4a3123']"
            step="Gerade dran: Werte" progress="4 von 7 Entscheidungen" remaining="~20 Min" :pct="57" :activity="[2, 0, 3, 5, 4, 0, 0, 6, 8, 5, 9, 7, 4, 10]" :score="74"
            edited="zuletzt vor 2 Stunden"
            result-to="/brand/demo/foundation" :result-ready="false"
          />
        </NuxtLink>
        <NuxtLink to="/brand/demo/archetyp" class="block">
          <BwBrandCard
            title="Schubert UX Studio" path="Marken-Relaunch" flag="i-circle-flags-de"
            :gradient="['#e2e4ea', '#8a93ad', '#2b3148']"
            step="Gerade dran: Archetyp & Stimme" progress="6 von 7 Entscheidungen" remaining="~10 Min" :pct="86" :activity="[8, 6, 9, 4, 0, 2, 5, 3, 6, 0, 1, 4, 7, 12]" :score="87"
            edited="zuletzt gestern"
            result-to="/brand/demo/ergebnis" :result-ready="false"
          />
        </NuxtLink>
        <!-- Klickdummy Produkt 02 (docs/archiv/BRAND-DESIGN.md §2.15): der
             Einstieg in Schicht 2 hängt an der FERTIGEN Marke — vorher gibt es
             nichts freizuschalten. Die zwei Links stehen NEBEN der Kachel und
             nicht darin: ein `<a>` in einem `<a>` ist kein gültiges HTML. -->
        <div>
          <NuxtLink to="/brand/demo/foundation" class="block">
            <BwBrandCard
              title="Hafenkontor" path="Neue Marke" flag="i-circle-flags-de"
              :gradient="['#dfe8e4', '#6f9184', '#22392f']"
              step="Brand Foundation abgeschlossen" progress="21 von 21 Entscheidungen" remaining="fertig" :pct="100" :activity="[3, 5, 2, 7, 9, 6, 10, 8, 12, 9, 14, 11, 8, 6]" :score="88"
              edited="zuletzt vor 3 Tagen"
              result-to="/brand/demo/foundation" :result-ready="true"
            />
          </NuxtLink>
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <NuxtLink to="/brand/demo/design/dna" class="bw-label inline-flex items-center gap-1.5 underline" style="color: var(--bw-ink-soft)">
              Brand Design (Dummy) <UIcon name="i-ph-arrow-right" class="size-3.5" />
            </NuxtLink>
            <NuxtLink to="/brand/demo/design/unlock" class="bw-label underline" style="color: var(--bw-muted)">
              Freischaltung
            </NuxtLink>
          </div>
        </div>
      </div>
      <!-- KLICKDUMMY PRODUKT 03 (docs/plans/BRAND-BOOK-KIT.md §2.15): die acht
           Screens an EINER Stelle. Sie hängen nicht an einer Marken-Kachel,
           weil sie zwei Zustände derselben Marke zeigen (mit und ohne
           Ableitung) — und weil ein Betreiber-Screen dazugehört. -->
      <div class="mt-20">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-lg font-medium">Brand Book &amp; Kit (BK1-Prototyp)</h2>
          <p class="bw-label" style="color: var(--bw-muted)">Kailua Coffee Co. · acht Screens</p>
        </div>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Die dritte Schicht: Book &amp; Kit entscheidet nichts mehr, sondern liefert aus — das Handbuch als Leseansicht, das Kit als Dateien (Design-Tokens, brand.md, brand.json, Zeichen, Pressekit).
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NuxtLink
            v-for="screen in bk1Screens" :key="screen.to"
            :to="screen.to"
            class="bw-card bw-card--hover flex flex-col p-5"
          >
            <p class="bw-label" style="color: var(--bw-muted)">{{ screen.num }}</p>
            <p class="mt-1.5 text-sm font-medium">{{ screen.label }}</p>
            <p class="mt-1 flex-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ screen.note }}</p>
          </NuxtLink>
        </div>
      </div>

      <!-- Beispiel-Brand-Teaser + Leerzustand nebeneinander (Runde 134) -->
      <div class="mt-20 grid items-stretch gap-6 lg:grid-cols-2">
      <NuxtLink to="/brand/demo/beispiel" class="bw-card bw-card--hover grid items-center gap-6 p-8 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div class="bw-tile relative hidden overflow-hidden sm:block" style="aspect-ratio: 1 / 1; background: linear-gradient(165deg, #e8d3b8 0%, #b98a5e 45%, #4a3123 100%)">
          <p class="absolute inset-0 grid place-items-center p-4 text-center text-base font-extralight leading-snug tracking-tight" style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)">Kailua Coffee Co.</p>
        </div>
        <div class="min-w-0">
          <p class="bw-label" style="color: var(--bw-muted)">Beispiel-Branding · mit George gebaut</p>
          <h2 class="mt-2 text-2xl font-medium tracking-tight">So sieht fertig aus: Kailua Coffee Co.</h2>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Eine vollständige Referenz durch alle sechs Schichten — Purpose, Werte und Stimme, Tagline und Namens-Prüfung, Farbwelt und Typografie, Book & Kit, Content-Kompass und aktives Monitoring. Brand Score 92, jede Entscheidung mit Begründung.</p>
          <p class="bw-label mt-5 inline-flex items-center gap-1.5" style="color: var(--bw-muted)">Beispiel-Branding ansehen <UIcon name="i-ph-arrow-right" class="size-3.5" /></p>
        </div>
      </NuxtLink>

      <div class="bw-rounded-card flex flex-col items-center justify-center border border-dashed p-10 text-center" style="border-color: var(--bw-line-strong)">
        <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
        <p class="mt-4 font-medium">So sieht der Leerzustand aus:</p>
        <p class="mt-1 text-sm" style="color: var(--bw-muted)">Lass uns dein erstes Branding aufbauen. Du kannst jederzeit pausieren — dein Stand bleibt gespeichert.</p>
        <UButton class="mt-4" icon="i-ph-plus" label="Erstes Branding starten" variant="outline" @click="newBrandOpen = true" />
      </div>
      </div>
      </div>
      <BwSiteFooter />
    </div>
    <BwNewBrandModal v-model:open="newBrandOpen" mode="demo" />
  </div>
</template>
