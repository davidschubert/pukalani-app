/**
 * Meldet beim Core, unter welcher eigenen Domain diese Site zu Hause ist
 * (Vertrag `registerSiteOriginResolver`, core/server/utils/siteOrigin.ts).
 *
 * Damit nehmen Reset-, Verifizierungs- und Benachrichtigungs-Mails, der Digest
 * und der OAuth-Rückweg die eigene Domain, sobald sie `active` ist — ohne dass
 * jemand `NUXT_PUBLIC_APP_URL` umstellt. Die bleibt die Standard-Adresse und
 * ist der Rückfall: wird die eigene Domain entfernt, fallen die Links von
 * selbst zurück, statt still auf einen Namen zu zeigen, den Appwrite nicht
 * mehr als Plattform kennt.
 *
 * DIESELBE ABFRAGE WIE DIE UMLEITUNG (`siteDomainAddress`, 30 s gecacht,
 * fail-soft): Mail-Link und 301 können so nicht auseinanderlaufen, und eine
 * Mail kostet keinen zusätzlichen Ruf ins Control Plane.
 *
 * OHNE ANFRAGE (Digest): die Abfrage braucht das Event nur für die
 * Laufzeit-Konfiguration, und der Transport im Core nimmt `undefined` seit
 * 2026-11-16 an. Ein im Prozess gemerkter „letzter Stand" ist deshalb nicht
 * nötig — er wäre eine zweite Wahrheit mit eigenem Alter neben dem
 * Zwischenspeicher, der ohnehin da ist.
 *
 * SEC-010: der Host der Anfrage geht in die Antwort nicht ein. Die Abfrage
 * fragt nach der Projekt-Id dieser App; der Name kommt aus der
 * `websites`-Zeile, die das Control Plane per DNS-Nachweis gefüllt hat.
 */
import { registerSiteOriginResolver } from '../../../core/server/utils/siteOrigin'
import { siteOriginFromAddress } from '../../shared/siteOrigin'
import { siteDomainAddress } from '../utils/siteDomain'

export default defineNitroPlugin(() => {
  registerSiteOriginResolver(async (event) => {
    const address = await siteDomainAddress(event)
    return siteOriginFromAddress(address, {
      dev: Boolean(import.meta.dev),
      appUrl: useRuntimeConfig(event).public.appUrl,
    })
  })
})
