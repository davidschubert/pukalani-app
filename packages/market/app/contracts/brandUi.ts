/**
 * DER VERTRAG ZUM brand-LAYER AUF DER OBERFLÄCHEN-SEITE (MV1 M4).
 *
 * ── WARUM ES IHN NEBEN `server/contracts/brandContract.ts` GIBT ──────────
 * Jener bündelt, was der SERVER von `brand` braucht (Datentür, Abruf,
 * Befund-Speicher). Die Seite „Markt" braucht etwas anderes und ausschliesslich
 * TYPEN: die Form der Leiste, die der brand-Layer rendert, und die Form der
 * Befunde, die sein Chip entgegennimmt. Beides über den Server-Vertrag zu
 * ziehen ginge nicht — der re-exportiert Nitro-Utilities und gehört nicht in
 * ein Client-Bündel.
 *
 * ── EINE DATEI, WIE DRÜBEN ───────────────────────────────────────────────
 * Dieselbe Regel und derselbe Grund: was hier nicht steht, benutzt die
 * Oberfläche von `market` nicht. Ohne diese Bündelung wäre die Kopplung
 * wieder implizit und über die Seiten verteilt, und niemand könnte in einem
 * Blick sagen, was `market` von `brand` erwartet. ESLint erlaubt den Sprung
 * (`pukalani/no-cross-layer-relative` mit `allow: ['brand']`) — die
 * Beschränkung auf EINE Datei ist Disziplin, und ihr Ort ist dieser Kopf.
 *
 * ── NUR TYPEN, KEINE WERTE ───────────────────────────────────────────────
 * Alles, was hier steht, ist `import type`. Ein Wert-Import aus dem
 * brand-Layer in ein Client-Bündel zöge dessen Modul mit — und damit eine
 * Abhängigkeit, die in der Bündel-Analyse auftaucht und in der Layer-Matrix
 * nicht. Die KOMPONENTEN selbst (`BwWorkspace`, `BwFindingChip`,
 * `BwScoreRing`) kommen über den Auto-Import von Nuxt: sie sind in der App
 * registriert, weil `apps/branding` beide Layer listet, und genau das ist die
 * richtige Naht — die App komponiert, nicht der Layer.
 */

export type { BwRailLayer, BwRailStep } from '../../../brand/app/components/BwProgressRail.vue'
export type { BwSidebarBrand } from '../../../brand/app/components/BwWorkspaceSidebar.vue'
export type { BrandFindingView, BrandFindingsResponse } from '../../../brand/shared/types/brand'
