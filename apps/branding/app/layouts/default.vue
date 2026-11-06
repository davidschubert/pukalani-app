<script setup lang="ts">
/**
 * DAS `default`-LAYOUT DER APP — die EINE Kopfzeile von branding.supply
 * (Davids Entscheidung 2026-09-03: „dieselbe Navbar wie ganz oben im Wizard,
 * eingesetzt, nicht drübergelegt" — auch auf Startseite und Übersicht).
 *
 * Es ÜBERLAGERT das Core-Default-Layout bewusst (App schlägt Layer): dessen
 * schmale Kopfzeile stand auf /team ÜBER der Wizard-Nav — zwei Köpfe
 * übereinander, live erwischt. Jetzt trägt JEDE default-Seite dieser App
 * `BwSiteNav` im Fluss und `BwSiteFooter` unten; Seiten rendern beides NICHT
 * mehr selbst.
 *
 * Der `px-6`-Wirt gehört zur Nav (sie zieht sich mit `-mx-6` bündig an die
 * Kanten, Muster wie team.vue vor dem Umzug); `bw-root` ist Token-Wirt und
 * malt den Seiten-Grund. Der Werkstatt-Vollbildmodus läuft unberührt über
 * `brand-workspace`.
 */
</script>

<template>
  <div class="bw-root flex min-h-dvh flex-col px-6">
    <BwSiteNav />
    <main class="flex-1"><slot /></main>
    <BwSiteFooter />
  </div>
</template>
