/**
 * Der Prototyp ist die EINZIGE Stelle, an der das Produkt-Gate `insights` an
 * ist (`packages/insights/app/app.config.ts` erklärt, warum es sonst aus
 * ist): ohne den Schalter zeigte der Klickdummy einen Zustand, den es im
 * Produkt gar nicht gibt.
 */
export default defineAppConfig({
  pukalani: {
    insights: {
      enabled: true,
    },
  },
})
