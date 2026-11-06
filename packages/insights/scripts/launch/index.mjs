/**
 * DER LAUNCH-INHALT (BI1 I6, §9.8) als EINE Liste je Tabelle — die Mechanik
 * (`../seed-launch.mjs`) und der Test (`tests/launchContent.test.ts`) kennen
 * die Inhalte nur hierüber.
 *
 * Ein redigierter Beispiel-Beitrag je Format (Mengen-Bremse, Entscheidung 1):
 * Profil, Duell, Artikel, Ranking — nicht neunzehn.
 */
import { adidasVsNike } from './adidas-vs-nike.mjs'
import { LAUNCH_BRANDS } from './brands.mjs'
import { ikeaArticle } from './ikea.mjs'
import { nikeProfile } from './nike.mjs'
import { strongestPresenceRanking } from './ranking.mjs'

export { LAUNCH_BRANDS }

export const LAUNCH_POSTS = [nikeProfile, adidasVsNike, ikeaArticle, strongestPresenceRanking]
