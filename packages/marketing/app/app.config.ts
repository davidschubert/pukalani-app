export default defineAppConfig({
  pukalani: {
    /**
     * WOHIN ZEIGT DER CHROME? — der eine Schalter dieses Layers.
     *
     * `home: false` ist die Vorgabe und damit der Zustand JEDER App außer
     * pukalani.app: Kopf und Fuß rechnen ihre internen Ziele dann als
     * ABSOLUTE URLs auf `siteUrl`. Das ist keine Feinheit, sondern die
     * Bedingung dafür, dass der Layer überhaupt anderswo laufen kann — die
     * Route-Namen (`faq`, `produkte-slug`, `vs-slug`, …) gibt es nur in
     * apps/marketing, `localePath({ name: 'faq' })` liefert auf einer fremden
     * App nichts.
     *
     * apps/marketing setzt `home: true` (dort auch die Begründung) und bekommt
     * damit exakt das bisherige Verhalten: interne Auflösung über Route-Namen,
     * inklusive der lokalisierten Segmente und Slugs.
     *
     * Die vier URLs stehen HIER und nicht als Literale im Markup: sie sind
     * Adressen der Plattform, keine Texte. Eine App kann sie überschreiben
     * (tiefer Merge), ein Deploy braucht dafür keinen Code-Eingriff im
     * Bauteil.
     */
    marketing: {
      home: false,
      siteUrl: 'https://pukalani.app',
      helpUrl: 'https://help.pukalani.app',
      // Die öffentliche Changelog-Seite der Control-App (admin-Layer,
      // ohne Anmeldung lesbar). Bis 2026-11-06 stand hier
      // changelog.pukalani.app — das war nie eine Seite, sondern der
      // Webhook-Endpunkt der stillgelegten Function `changelog-draft`.
      changelogUrl: 'https://admin.pukalani.app/changelog',
      // Die Statusseite liegt bewusst NICHT bei uns: sie muss antworten, wenn
      // unser Server es nicht tut.
      statusUrl: 'https://status.pukalani.app',
    },
  },
  ui: {
    colors: {
      /**
       * Die Marke ist die Sonne: `puka` ist die 11-stufige Palette aus
       * app/assets/css/puka-theme.css — sie liegt im LAYER, also gehört auch
       * diese Zuordnung hierher (vorher apps/marketing/app/app.config.ts).
       * Ohne sie zeigte `--ui-color-primary-*` auf jeder erbenden App weiter
       * auf die Core-Ramp, und `.marketing-site { --ui-primary:
       * var(--ui-color-primary-500) }` (puka-theme.css) löste dort zur
       * FALSCHEN Farbe auf — der Chrome trüge die Marke nur auf pukalani.app.
       *
       * `neutral` bleibt BEWUSST unangetastet auf dem Core-Wert: die
       * Neutral-Ramp färbt Text, Ränder und Flächen JEDER Nuxt-UI-Komponente
       * der erbenden Apps.
       */
      primary: 'puka',
    },
    /**
     * DAS BURGER-ZEICHEN: `UHeader` (MarketingHeader) nimmt sein
     * Umschalt-Zeichen aus `ui.icons.menu`/`.close` und wechselt es je nach
     * Zustand — als Eigenschaft am Knopf ginge der Wechsel verloren. Die
     * fette Schnittvariante ist Bestand der Marketing-Optik; `close` bleibt
     * bewusst der Core-Wert (Begründung ehemals in apps/marketing).
     */
    icons: {
      menu: 'i-ph-list-bold',
    },
  },
})
