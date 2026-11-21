<script setup lang="ts">
import type { DocsNavigation } from '../../shared/types/docs'

/**
 * Die Unternavigation der Hilfe — seit dem Chrome-Umbau (Davids Entscheidung
 * 2026-08-18) trägt die Kopfzeile die MARKE (MarketingHeader aus
 * packages/marketing), und alles Hilfe-Eigene ist in diese schmale Leiste
 * darunter gezogen: links die zwei Abschnitte (Anleitung | Entwickler),
 * rechts die Suche. Vorher saß beides im eigenen DocsHeader.
 *
 * Der Marketing-Kopf kennt die Artikel-Navigation dieser Site nicht — sein
 * Mobil-Menü zeigt die Marketing-Ziele. Die Artikel-Navigation braucht auf
 * schmalen Fenstern deshalb einen EIGENEN Ausgang: die Seitenleiste der
 * Inhaltsseiten (UPage #left) ist erst ab `lg` sichtbar, darunter öffnet der
 * Listen-Knopf hier einen Slideover mit derselben `UContentNavigation`.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const fallback = ref<DocsNavigation | null>(null)
const navigation = inject(docsNavigationKey, fallback)
const activeSection = computed(() => resolveDocsSection(route.path))
const sidebarItems = computed(() => docsSectionItems(navigation.value, activeSection.value, locale.value))

// Auf der Startseite ist KEIN Abschnitt aktiv — `resolveDocsSection` liefert
// dort die Anleitung als Rückfall, das ist für die Abfrage richtig, für die
// Leiste aber falsch. Verglichen wird gegen `localePath('/')`, nicht gegen
// den festen String '/': die deutsche Startseite heißt `/de`.
const istStartseite = computed(() => route.path.replace(/\/$/, '') === localePath('/').replace(/\/$/, ''))

const sections = computed(() => DOCS_SECTIONS.map(section => ({
  label: t(section.labelKey),
  icon: section.icon,
  to: localePath(section.prefix),
  active: activeSection.value === section.key && !istStartseite.value,
})))

// UHeader schließt sein Menü beim Routenwechsel selbst — der Slideover hier
// muss das von Hand tun, sonst steht er nach einem Klick auf einen Artikel
// noch offen über der neuen Seite.
const inhaltOffen = ref(false)
watch(() => route.path, () => {
  inhaltOffen.value = false
})
</script>

<template>
  <nav
    :aria-label="t('docs.subnav.aria')"
    class="border-b border-default bg-default/75 backdrop-blur"
  >
    <UContainer class="flex h-12 items-center justify-between gap-3">
      <UNavigationMenu
        :items="sections"
        variant="link"
        :ui="{ link: 'px-2.5 py-0.5 text-sm font-medium' }"
      />

      <div class="flex items-center gap-1.5">
        <!-- Das Label MUSS von hier kommen: die Vorgabe zieht `UContentSearchButton`
             aus Nuxt UIs EIGENER Sprachdatei (ui.locale, hängt nicht an
             @nuxtjs/i18n) — auf der deutschen Seite stünde „Search…"
             (dieselbe Falle wie beim Burger-Label im MarketingHeader). -->
        <UContentSearchButton :collapsed="false" :label="t('docs.search.button')" class="hidden sm:flex" />
        <UContentSearchButton class="sm:hidden" />
        <!-- Artikel-Navigation für schmale Fenster (siehe Kopf-Kommentar).
             Auf der Startseite gibt es nichts aufzuklappen — dort führt die
             Leiste selbst in die Abschnitte. -->
        <USlideover
          v-if="!istStartseite"
          v-model:open="inhaltOffen"
          :title="t('docs.subnav.contents')"
          class="lg:hidden"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-ph-list-bold"
            :aria-label="t('docs.subnav.contents')"
            class="lg:hidden"
          />

          <template #body>
            <UContentNavigation
              highlight
              :navigation="sidebarItems"
            />
          </template>
        </USlideover>
      </div>
    </UContainer>
  </nav>
</template>
