/**
 * courses meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14) — und
 * seit C4 (2026-07-31) auch seinen ÖFFENTLICHEN Nav-Eintrag in der
 * Chrome-Registry.
 */
export default defineAppConfig({
  pukalani: {
    chrome: {
      nav: {
        // C4 (2026-07-31): stand bis dahin in apps/comments/app/app.config.ts —
        // damit hatte der Pool den Menüpunkt nicht, obwohl er den Layer zieht.
        // KEIN requiresAuth (SEC-029, 2026-11-13): Übersicht und Vorschau
        // sind öffentlich, erst Lektionen und Einschreiben verlangen eine
        // Mitgliedschaft. planProduct: im Pool erst ab Pro.
        courses: { labelKey: 'courses.list.title', to: '/courses', icon: 'i-ph-graduation-cap', order: 30, productKey: 'courses', planProduct: 'courses' },
      },
    },
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte")
          id: 'courses',
          scope: 'community',
          productKey: 'courses',
          // C2: im Pool erst ab Pro (pukalani.tenancy.products) — ohne das
          // Feld stand der Menüpunkt auch dort, wo /api/courses längst 404t.
          planProduct: 'courses',
          labelKey: 'admin.nav.courses',
          icon: 'i-ph-graduation-cap',
          to: '/dashboard/courses',
          requiredCapability: 'courses.manage',
          group: 'products',
          order: 70,
        },
      ],
      /**
       * KENNZAHL DES courses-LAYERS (U9/K2, 2026-08-11) — die Kachel „Kurse".
       * Zahl aus dem Verbrauchs-Vertrag (`kind: 'courses'`), Gates und
       * Capability wie am Menüpunkt darüber.
       */
      stats: {
        courses: {
          scope: 'community',
          productKey: 'courses',
          planProduct: 'courses',
          labelKey: 'courses.stats.total',
          icon: 'i-ph-graduation-cap',
          to: '/dashboard/courses',
          requiredCapability: 'courses.manage',
          order: 70,
        },
      },
    },
  },
})
