export default defineNuxtConfig({
  extends: ['..', '../../core'],

  devServer: {
    port: 3009,
  },

  // Brand-Design-Dummy (docs/archiv/BRAND-DESIGN.md §2.4/§2.17): die sieben
  // kuratierten Schriftfamilien der Typografie-Vorschau. Sie MÜSSEN in einer
  // vom Build gesehenen CSS-Datei stehen, sonst self-hostet @nuxt/fonts sie
  // nicht und die Vorschau zeigt Systemschriften — der Kopf der Datei sagt,
  // welche Familien es sind. Der Pfad ist relativ zu DIESER App (das Layer
  // daneben benutzt absolute Pfade, weil Apps sie sonst bei sich suchen).
  css: ['~/assets/css/demo-fonts.css'],

  // Der Foundation-Dummy nutzt `UPageAside` + `UContentToc` (Davids Wunsch
  // 2026-09-05). Nuxt UI registriert die Content-Komponenten NUR mit diesem
  // Schalter oder mit installiertem @nuxt/content — ohne ihn bleibt
  // `<UContentToc>` ein unaufgelöstes Element (live erwischt: leere Spalte,
  // Vue-Warnung „Failed to resolve component"). Gilt nur im Playground; eine
  // App, die die Leseansicht baut, setzt ihn selbst.
  ui: {
    content: true,
  },

  // Der Klickdummy ist Davids Demo-Anker und auf Deutsch abgenommen — er
  // startet deshalb unter `/` auf DE (Core-Default wäre EN); EN liegt unter
  // /en/*. Gilt nur hier im Playground, keine App erbt diese Datei.
  i18n: {
    defaultLocale: 'de',
  },
})
