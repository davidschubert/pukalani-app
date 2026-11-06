import type { BrandKitWorkshopResponse } from '../../shared/types/brandKit'

/**
 * DIE PUREN QUELLEN DER DRITTEN SCHICHT IM BROWSER (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.9, Paket K5).
 *
 * ── WARUM DIESE VIER DINGE NICHT IM STORE STEHEN ─────────────────────────
 * Der Werkstatt-Store trägt IMMER NUR DEN OFFENEN Baustein (`applyStepDetail`
 * ersetzt `serverSlots`). Die Prompt-Vorlagen brauchen aber die ganze
 * Foundation, die Pressekit-Vorschau vier fremde Kapitel, und die Fakten
 * (`a.facts`) dürfen den Browser überhaupt nur über einen Eigentümer-Pfad
 * erreichen. Genau dafür gibt es die eine Route
 * (`/api/brand/profiles/:id/kit/workshop`, `private, no-store`).
 *
 * ── SIE LÄDT IM BROWSER, NICHT BEIM SERVER-RENDERN ───────────────────────
 * `server: false` mit Absicht: die Antwort ist unzwischenspeicherbar und
 * enthält interne Fakten — sie hat im ausgelieferten HTML nichts verloren.
 * Der Preis ist ein kurzer Ladezustand in einem Panel, das ohnehin erst nach
 * der Freischaltung erscheint.
 *
 * ── FAIL-SOFT ─────────────────────────────────────────────────────────────
 * Fehler ⇒ leerer Zustand, kein Wurf. Die Kapitel bleiben bedienbar: Chips,
 * Karten und Bühne hängen am Store, nur die VORSCHLÄGE fehlen dann. Ein
 * Kapitel, das wegen einer Bequemlichkeit gar nicht mehr aufgeht, wäre der
 * teurere Fehler.
 */
const EMPTY: BrandKitWorkshopResponse = {
  locale: 'en',
  architectureRule: '',
  facts: [],
  prompts: [],
  contactTemplates: [],
  summary: '',
}

/**
 * SIE NIMMT EINEN GETTER, KEINE ZEICHENKETTE — die Werkstatt-Seite WECHSELT
 * die Marke, ohne neu zu montieren (`/brand/:profileId/:stepKey`, der
 * Marken-Wähler in der Seitenleiste). Ein einmal gelesener Id-Wert bliebe
 * danach stehen, und das Kapitel zeigte die Fakten der VORIGEN Marke.
 * `watch` lädt deshalb nach, sobald sich die Id ändert.
 */
export function useBrandKitWorkshop(profileId: MaybeRefOrGetter<string>) {
  // `useRequestFetch()` statt rohem `$fetch` — der Core-Wächter
  // `ssrTenantFetch.test.ts` verlangt es für jeden Abruf in `useAsyncData`:
  // im SSR reist sonst kein Host mit (main war damit rot, 2026-09-10).
  const requestFetch = useRequestFetch()
  const { data, pending, refresh } = useAsyncData<BrandKitWorkshopResponse>(
    'brand-kit-workshop',
    () => requestFetch<BrandKitWorkshopResponse>(
      `/api/brand/profiles/${encodeURIComponent(toValue(profileId))}/kit/workshop`,
    ),
    { server: false, default: () => EMPTY, watch: [() => toValue(profileId)] },
  )

  const workshop = computed<BrandKitWorkshopResponse>(() => data.value ?? EMPTY)

  return {
    workshop,
    pending,
    refresh,
    facts: computed(() => workshop.value.facts),
    prompts: computed(() => workshop.value.prompts),
    contactTemplates: computed(() => workshop.value.contactTemplates),
    summary: computed(() => workshop.value.summary),
    architectureRule: computed(() => workshop.value.architectureRule),
    contentLocale: computed(() => workshop.value.locale),
  }
}
