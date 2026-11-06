/**
 * Der Prototyp ist die EINZIGE Stelle, an der das Produkt-Gate `market` an
 * ist (`packages/market/app/app.config.ts` erklärt, warum es sonst aus ist):
 * ohne den Schalter zeigte der Klickdummy einen Zustand, den es im Produkt
 * gar nicht gibt.
 */
export default defineAppConfig({
  pukalani: {
    market: {
      enabled: true,
    },
  },
})
