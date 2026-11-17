import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'onboarding',
  // foundation: kein zubuchbares Kunden-Produkt, sondern der Trichter der
  // Plattform selbst — er wird nie pro Site an- oder abgeschaltet.
  tier: 'foundation',
  hasMigrations: false,
  userData: true,
  // KEIN `apiPrefixes` (WL1 d, 2026-11-17): die Stufe `foundation` ist nicht
  // abschaltbar — die Schalt-Route lehnt alles außer `optional` ab, ein
  // Entitlement schaltet `foundation` nie ab (`pnpm check:manifests`, Prüfung
  // 7, hält beide Stellen fest). Ein Präfix hier bewirkte nur eine Abfrage
  // der Produkt-Sperre je Anfrage, die immer „an" antwortete.
  title: { en: 'Onboarding', de: 'Onboarding' },
  description: {
    en: 'Public self-service funnel: sign up, set up a community in four steps, land in it.',
    de: 'Öffentlicher Selbstbedienungs-Trichter: registrieren, Community in vier Schritten einrichten, drin sein.',
  },
  icon: 'i-ph-rocket-launch',
} satisfies ProductManifest
