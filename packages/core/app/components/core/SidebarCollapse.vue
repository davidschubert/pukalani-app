<script setup lang="ts">
import { ref } from 'vue'
import { useDashboard } from '@nuxt/ui/utils/dashboard'

/**
 * Der Knopf, der die Seitenleiste des Dashboards ein- und ausklappt — MIT
 * abfragbarem Zustand (UX-010, Q09).
 *
 * `UDashboardSidebarCollapse` wechselt nur Symbol und Namen („einklappen" /
 * „ausklappen"); ob die Leiste gerade offen ist, sagt er einem Vorleseprogramm
 * nicht. Der Baustein reicht fremde Attribute an seinen Knopf durch, den
 * Zustand kennt aber nur der Dashboard-Kontext der Bibliothek. Diese Hülle
 * liest ihn dort und setzt `aria-expanded` — EINE Stelle statt je Seite.
 *
 * JEDE Dashboard-Seite bindet DIESEN Baustein ein, nie den nackten der
 * Bibliothek (Wächter: `core/tests/sidebarCollapseGuard.test.ts`).
 *
 * Außerhalb einer `UDashboardGroup` gibt es keinen Kontext; dann gilt wie in
 * der Bibliothek „offen".
 */
defineOptions({ inheritAttrs: false })

const { sidebarCollapsed } = useDashboard({ sidebarCollapsed: ref(false) })
</script>

<template>
  <UDashboardSidebarCollapse v-bind="$attrs" :aria-expanded="!sidebarCollapsed" />
</template>
