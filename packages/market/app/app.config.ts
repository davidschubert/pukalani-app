/**
 * Die Config-FORM des Marktvergleichs. Sie liegt in `app/` und nicht im
 * Package-Root — dort wird eine `app.config.ts` stillschweigend ignoriert.
 *
 * ── WARUM DER DEFAULT HIER `false` BLEIBT UND IM brand-LAYER `true` IST ───
 * Der brand-Layer argumentiert (zu Recht): „wer den Layer extended, hat ihn
 * genau deshalb extended". Für `market` gilt das AUCH NACH M1 nicht: der
 * Layer ist ab jetzt zwar montiert (`apps/branding`), aber hinter dem
 * Schalter liegt bis M2/M4 keine Route und keine Seite — und die Schranke
 * davor ist ohnehin eine ZUTEILUNG (§1.9 „frei bauen, bezahlt anwenden"),
 * kein Deployment-Schalter. Ein Default `true` versprächen also zwei Dinge,
 * die es noch nicht gibt: ein sichtbares Produkt und einen bezahlten Zugang.
 * Die App sagt deshalb ausdrücklich Ja (`apps/branding/app/app.config.ts`),
 * und das ist genau die Stelle, an der man später sieht, WER dieses Produkt
 * anbietet.
 *
 * DIE ZWEITE UND DRITTE STUFE stehen bewusst NICHT hier, weil sie zur Laufzeit
 * umgelegt werden müssen (dasselbe Muster wie beim brand-Layer): die
 * Produkt-NOTABSCHALTUNG ist `app_config.products.market.enabled = false`
 * (der generische Runtime-Kill über die Produkt-Registry — er braucht keine
 * eigene Zeile Code, nur den Manifest-Schlüssel `market`), die
 * BEZAHL-Schranke ist eine Zuteilung — sie entscheidet je Branding und nie je
 * Deployment.
 */
export default defineAppConfig({
  pukalani: {
    /**
     * DER EINTRAG „MARKT" IN DER WERKSTATT-LEISTE (MV1 M4, Plan §2.5).
     *
     * ── WARUM ER HIER STEHT UND NICHT IM brand-LAYER ────────────────────
     * `brand` ist ein Fundament und darf kein Produkt kennen, das darauf
     * aufsetzt (CONCEPT A14). Es beschreibt deshalb nur die FORM eines
     * zusätzlichen Ebene-1-Eintrags (`BrandWorkspaceNavExtra`) und liest sie
     * aus dieser Konfiguration; defu verkettet Arrays über die Layer, also
     * meldet sich das Produkt SELBST an. Eine Silo-App ohne `market` bekommt
     * damit keinen Menüpunkt ins Leere — genau der Fehler, den die
     * Mitglieder-Verwaltung des onboarding-Layers 2026-07-29 vermieden hat.
     *
     * ── DREI FELDER, DREI ZUSAGEN ───────────────────────────────────────
     * `lockedUntil` = die Freischaltung aus §2.4 (Kapitel B abgenommen); die
     * Leiste zeigt den Eintrag dann SICHTBAR-GESPERRT, denn eine unsichtbare
     * Schranke erklärt sich nie. `counterKind: 'market'` zählt die OFFENEN
     * Markt-Befunde („2 Befunde") — dieselbe Art, die `BwFindingChip` seit
     * M3 kennt. `to` ist eine Vorlage mit `:profileId`, weil `app.config`
     * Daten sind und keine Funktionen.
     */
    brand: {
      workspaceNavExtras: [
        {
          key: 'market',
          // DER SCHALTER, UNTER DEM DIESER EINTRAG STEHT: `pukalani.market
          // .enabled` (unten in dieser Datei, Default `false`). Ohne dieses
          // Feld stünde „Markt" auch in einer App, die den Layer zwar montiert
          // hat, das Produkt aber ausgeschaltet lässt — und der Klick landete
          // auf dem 404, das die Seite selbst wirft. WÖRTLICH wie `lockedUntil`
          // und aus demselben Grund (s. Kommentar dort).
          productKey: 'market',
          labelKey: 'market.nav.market',
          icon: 'i-ph-compass',
          to: '/brand/:profileId/market',
          // WÖRTLICH und nicht importiert: `pnpm check:i18n-keys` lädt diese
          // Datei mit Nodes Typ-Strippung, und die kann einen relativen Import
          // ohne Endung nicht auflösen — ein `import` hier machte den Wächter
          // rot, der die Beschriftungen dieses Eintrags prüft. Der Preis ist
          // eine zweite Stelle für dasselbe Wort; bezahlt wird er mit einem
          // Test, der beide gegeneinander hält
          // (`tests/marketNavConfig.test.ts`).
          lockedUntil: 'pvm',
          counterKind: 'market',
        },
      ],
    },
    market: {
      enabled: false,
      /**
       * DIE MODELLE DES MARKTVERGLEICHS (MV1 M2).
       *
       * `extractModel` LEER heisst „nimm das Stufe-1-Modell des Wizards"
       * (`pukalani.brand.ai.reviewModel`, s. `server/utils/marketAi.ts`). Ein
       * hier abgeschriebener Modellname wäre eine zweite Wahrheit, die beim
       * nächsten Wechsel im brand-Layer stehen bleibt — und weil
       * `allowFallbacks: false` gilt, wäre ein ungeprüftes Modell kein
       * langsamerer Lauf, sondern gar keiner.
       *
       * `outsideViewModels` ist die KI-Aussensicht (§7.5). LEER ist der
       * Default, und das ist die Leitplanke, nicht eine fehlende Einstellung:
       * die Aussensicht verlangt Übereinstimmung zwischen ZWEI VERSCHIEDENEN
       * Modellen — ohne zwei Einträge gibt es sie nicht, und das ist besser
       * als eine ungeprüfte Einzelantwort neben belegten Feldern. Wer sie
       * einschaltet, trägt hier zwei Modelle VERSCHIEDENER Anbieter ein, die
       * beide durch `BRAND_PROVIDER_ROUTING` (ZDR) erreichbar sind.
       */
      ai: {
        extractModel: '',
        /**
         * DAS MODELL DES VERGLEICHS (MV1 M3). LEER heisst „das George-Modell"
         * — die Laufzeit-Kette des Core (`app_config.aiModel >
         * pukalani.ai.model`), aus der auch das Gespräch im Wizard sein Modell
         * nimmt; erst danach fällt es auf das Stufe-1-Modell des Spezialisten
         * zurück (s. `server/utils/marketAi.ts`). Ein hier eingetragener Name
         * wäre eine dritte Wahrheit über dasselbe Modell.
         */
        reportModel: '',
        outsideViewModels: [] as string[],
      },
      /**
       * Der instanzweite Tages-Deckel für Läufe (§2.8, vorgezogen aus M5).
       * Zahl und Prüfung stehen in `shared/marketLimits.ts` — nur eine ganze
       * Zahl > 0 gilt. ABSCHALTEN geht hierüber bewusst nicht: dafür gibt es
       * `app_config.products.market.enabled` (Produkt) und
       * `app_config.brandAiEnabled` (KI).
       */
      runDailyInstanceCap: 50,
    },
  },
})
