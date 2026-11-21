import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'courses',
  tier: 'optional',
  kind: 'product',
  // KEIN requires auf billing: der Layer kennt billing bewusst nicht —
  // die App registriert den Access-Guard (courseAccess-Vertrag).
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): courses-007 legt translations auf courses UND lessons an (lessons zuletzt); 008 ändert nur Rechte.
  schema: { latest: '008', probe: { migration: '007', table: 'lessons', column: 'translations' } },
  apiPrefixes: ['/api/courses', '/api/lessons'],
  title: { en: 'Courses', de: 'Kurse' },
  description: {
    en: 'Courses with lessons, progress tracking and AI translation; paid access plugs in via the app-level access guard.',
    de: 'Kurse mit Lektionen, Fortschritt und KI-Übersetzung; Bezahl-Zugang dockt über den App-seitigen Access-Guard an.',
  },
  customerDescription: {
    en: 'Courses with lessons and learning progress, translated on request.',
    de: 'Kurse mit Lektionen und Lernfortschritt, auf Wunsch übersetzt.',
  },
  icon: 'i-ph-graduation-cap',
} satisfies ProductManifest
