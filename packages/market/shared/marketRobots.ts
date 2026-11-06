/**
 * DER ROBOTS-PARSER — SEIT BS1 R2b EINE HÜLLE, KEINE ZWEITE FASSUNG.
 *
 * Die Regel selbst steht in `packages/brand/shared/brandRobots.ts`. Sie ist
 * dorthin gezogen, weil seit R2b (Davids Entscheidung 2026-09-08) auch der
 * Einseiten-Abruf des Brand-Checks `robots.txt` auswertet — und `brand` darf
 * `market` nicht kennen (CONCEPT.md A14: die Richtung ist einseitig). Der
 * umgekehrte Weg wäre eine KOPIE gewesen, also zwei Wahrheiten darüber, wen
 * wir anfassen dürfen; von zweien gewinnt im Zweifel die schwächere.
 *
 * ── WARUM DIE DATEI TROTZDEM STEHEN BLEIBT ────────────────────────────────
 * Die market-seitigen NAMEN bleiben, was sie waren: `marketFetch.ts`, das
 * Bibliotheks-Skript und die Tests des Marktvergleichs rufen sie unverändert.
 * Eine Umbenennung an dreissig Stellen wäre Lärm um eine Bewegung, die den
 * Marktvergleich fachlich nicht anfasst.
 *
 * ── EINE ZWEITE DATEI ÜBER DER PAKETGRENZE, MIT ABSICHT ───────────────────
 * `server/contracts/brandContract.ts` bleibt der EINE Vertrag für alles, was
 * Nitro auto-importiert (dort ist die Bündelung eine Notwendigkeit, s. dessen
 * Kopf). `shared/` wird nicht gescannt: hier gibt es nichts zu beschatten, und
 * ein Umweg über den Server-Vertrag machte aus einer puren Regel eine
 * Server-Abhängigkeit — das Bibliotheks-Skript (`market-library-compute.mjs`)
 * lädt diese Datei direkt.
 */
export type { BrandRobots as MarketRobots } from '../../brand/shared/brandRobots'
export {
  BRAND_ROBOTS_ABSENT as MARKET_ROBOTS_ABSENT,
  brandRobotsAllows as marketRobotsAllows,
  parseBrandRobots as parseMarketRobots,
} from '../../brand/shared/brandRobots'
