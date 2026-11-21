<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ThemeDefaults } from '@nuxt/ui/runtime/types/theme.js'
import { useDashboard } from '@nuxt/ui/utils/dashboard'

/**
 * DER SCHUBLADEN-KNOPF IM SCHMALEN FENSTER SAGT SEINEN ZUSTAND (Q09-Rest,
 * Bahn 2) — für ALLE Dashboard-Seiten an EINER Stelle, ohne dass eine Seite
 * etwas tut.
 *
 * Den Knopf (`UDashboardSidebarToggle`) zeichnet `UDashboardNavbar` selbst,
 * innerhalb ihrer Kopfzeile; er wechselt Symbol und Namen, aber trägt kein
 * `aria-expanded`. Die Kopfzeile nimmt für ihn ein Objekt (`toggle`) und
 * reicht es als Attribute an ihn durch, und `UTheme` legt Vorgaben für ALLE
 * Bausteine darunter fest. Diese Hülle sitzt im Dashboard-Layout innerhalb
 * der `UDashboardGroup`, liest dort den Zustand der Schublade und gibt jeder
 * Kopfzeile darunter `toggle: { 'aria-expanded': offen }` mit. Eine Seite,
 * die `toggle` selbst setzt, behält ihr eigenes (heute: keine).
 *
 * Gegenstück für die breite Seitenleiste: `CoreSidebarCollapse`.
 */
const { sidebarOpen } = useDashboard({ sidebarOpen: ref(false) })

// Der Typ von `toggle` kennt nur die Knopf-Eigenschaften; die Kopfzeile
// bindet das Objekt aber als Attribute (`v-bind`), `aria-expanded` kommt an.
const themeProps = computed(() => ({
  dashboardNavbar: { toggle: { 'aria-expanded': sidebarOpen?.value === true } },
}) as unknown as ThemeDefaults)
</script>

<template>
  <UTheme :props="themeProps">
    <slot />
  </UTheme>
</template>
