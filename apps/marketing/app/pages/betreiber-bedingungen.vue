<script setup lang="ts">
// Bedingungen für Community-Betreiber (Entwurf, seit 2026-11-16). Der Wizard
// verlinkt diese Seite und lässt sie per Kästchen bestätigen
// (packages/onboarding/shared/operatorTerms.ts, Adressen in
// apps/platform/app/app.config.ts — ein neuer Pfad hier muss dort mit).
definePageMeta({ layout: 'site' })
defineI18nRoute({ paths: { en: '/community-operator-terms', de: '/betreiber-bedingungen' } })
</script>

<template>
  <LegalPage scope="operator" :section-count="16" />
</template>
