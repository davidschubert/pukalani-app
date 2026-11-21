<script setup lang="ts">
// Sichtbares Branding über der Auth-Karte (Audit-Befund B3): /login ist für
// Mitglieder die meistgebookmarkte Seite eines Mandanten — der Community-Name
// muss im SSR-Markup stehen, nicht nur im JS-Payload. Bewusst zurückhaltend
// (eine Zeile, kein Logo/Claim): die UAuthForm-Optik der Karte bleibt der Held.
//
// Wird von JEDEM auth-Layout gerendert (core + themes-Override — App-Kopien
// gibt es seit der Layout-Konsolidierung S9 nicht mehr) — die Komponente
// hält die Kette (Tenant → App-Brand) an EINER Stelle.
//
// DAS ZEICHEN (Q24, R4): wo Pukalani selbst spricht (Kontroll-Host wie der
// Kundenbereich, kein Mandant), steht über dem Namen das Pukalani-Zeichen —
// dasselbe wie auf der Marketing-Site. In der Community eines Kunden und auf
// Silo-Sites bleibt es bei der einen Zeile mit deren Namen.
const brand = useBrandName()
const pukalaniSpeaks = usePukalaniSpeaks()
</script>

<template>
  <PukaMark v-if="pukalaniSpeaks" :size="40" class="text-default" data-auth-brand-mark />
  <p
    data-auth-brand
    class="text-center text-sm font-semibold tracking-tight text-muted"
  >
    {{ brand }}
  </p>
</template>
