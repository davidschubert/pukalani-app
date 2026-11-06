<script setup lang="ts">
import { resolveBrandLegalLinks } from '../../shared/brandLegalLinks'
/** Site-Footer der öffentlichen Seiten (Runde 136) — gleiche
 *  Reihenfolge wie die Hauptnavigation: öffentlich → persönlich. */
/* Dieselben vier Punkte wie die Hauptnavigation und deshalb dieselben
 * Schlüssel — die Beschriftungen sind Davids Design und heißen in BEIDEN
 * Sprachen englisch; die Rechtstexte dahinter nicht. */
const { t } = useI18n()
const localePath = useLocalePath()
/* NUR ECHTE ZIELE (Davids 404-Audit 2026-09-03): Products/Discover/Insights
 * zeigten auf /products (404) bzw. die Klickdummy-Pfade /brand/demo/*.
 * „Discover Brands" IST seit Paket D2 (2026-09-08) zurück — die Galerie
 * `/discover` gibt es wirklich; Products und Insights bleiben draussen, bis
 * es ihre Marketing-Seiten gibt (s. BwSiteNav). */
const nav = computed(() => [
  { label: t('brand.nav.discover'), to: localePath('/discover') },
  // Zwei Seiten seit der Aufteilung (Davids Entscheidung 2026-09-04).
  { label: t('brand.nav.about'), to: localePath('/about') },
  { label: t('brand.nav.team'), to: localePath('/team') },
])
/**
 * DIE RECHTSWÖRTER SIND LINKS ODER SIE SIND NICHT DA (BS1 R0, 2026-09-07).
 *
 * Bis heute standen „Impressum · Datenschutz · AGB" hier als blosser Text:
 * drei Wörter ohne Ziel, weil es die Seiten auf branding.supply nicht gibt.
 * Das ist der schlechteste der drei Zustände — ein Wort ohne Ziel BELEGT, dass
 * die Pflicht bekannt war, und liefert dem Besucher trotzdem nichts. Ein Link
 * ins 404 wäre dasselbe mit einem Klick mehr.
 *
 * Die Regel ist pur und geprüft (`shared/brandLegalLinks.ts`), gefüttert vom
 * Schalter `pukalani.brand.legalLinks` (Pfade, keine Schlüssel). Ist er leer —
 * heutiger Layer-Default —, fällt die ganze Zeile weg; BS1 R1 füllt ihn mit
 * den `pages`-Routen, und dann sind es ohne weiteren Umbau Links.
 */
const appConfig = useAppConfig()
const legal = computed(() => resolveBrandLegalLinks(appConfig.pukalani?.brand?.legalLinks)
  .map(link => ({ ...link, to: localePath(link.to), label: t(link.labelKey) })))
</script>

<template>
  <footer class="mt-24 border-t pb-6 pt-8" style="border-color: var(--bw-line)">
    <div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <NuxtLink :to="localePath('/')" class="flex items-center gap-2">
        <span class="grid size-6 flex-none place-items-center rounded-full" style="background: var(--bw-ink); color: var(--bw-paper)">
          <UIcon name="i-ph-fingerprint" class="size-3.5" />
        </span>
        <span class="whitespace-nowrap text-sm" style="font-weight: 400; letter-spacing: -0.01em">Branding Supply</span>
      </NuxtLink>
      <nav class="flex flex-wrap gap-x-6 gap-y-2" :aria-label="t('brand.nav.footerNav')">
        <NuxtLink v-for="it in nav" :key="it.to" :to="it.to" class="text-sm whitespace-nowrap transition-colors hover:!text-(--bw-ink)" style="color: var(--bw-muted)">{{ it.label }}</NuxtLink>
      </nav>
      <nav v-if="legal.length" class="flex flex-wrap gap-x-6 gap-y-2" :aria-label="t('brand.nav.footerLegal')">
        <NuxtLink v-for="l in legal" :key="l.id" :to="l.to" class="text-sm whitespace-nowrap transition-colors hover:!text-(--bw-ink)" style="color: var(--bw-muted)">{{ l.label }}</NuxtLink>
      </nav>
    </div>
  </footer>
</template>
