import { registerBrandProfileCascade } from '../contracts/brandContract'
import { MARKET_LAYER_ID, removeMarketProfileData } from '../utils/marketStore'

/**
 * Hängt den market-Layer an die Profil-Kaskade des brand-Layers
 * (`registerBrandProfileCascade`, MV1 M1) — läuft einmal beim Serverstart.
 *
 * WARUM DAS EIN PLUGIN IST UND KEINE ZEILE IN brand: die Richtung. Der
 * brand-Layer darf `market_competitors` nicht kennen (CONCEPT A14) — er kennt
 * nur die Registry. Wer sich dort einträgt, entscheidet die APP über ihr
 * `extends`: eine branding-Instanz ohne den market-Layer lädt dieses Plugin
 * nicht, und ihre Kaskade ist damit automatisch richtig kurz.
 *
 * ZWEI EINTRAGENDE VERTRÄGE, EIN AUFRÄUMER: der GDPR-Contributor daneben
 * (`user-data.ts`) beantwortet „dieses KONTO geht", diese Kaskade „dieses
 * BRANDING geht". Beide enden in derselben Funktion — es soll genau EINE
 * Stelle geben, die weiss, was zu einem Branding gehört.
 */
export default defineNitroPlugin(() => {
  registerBrandProfileCascade({
    id: MARKET_LAYER_ID,
    removeProfileData: removeMarketProfileData,
  })
})
