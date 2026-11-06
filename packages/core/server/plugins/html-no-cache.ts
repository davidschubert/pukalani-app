/**
 * SSR-HTML IST NIE CACHEBAR — jetzt steht es auch im Header (U14-Livefund,
 * 2026-08-20).
 *
 * Der Grundsatz war längst beschlossen („kein SSR-Seiten-SWR: Session-State
 * steckt im HTML", Microcache-Regeln im Core), aber kein Header hat ihn je
 * durchgesetzt: die Seiten gingen OHNE `Cache-Control` raus, und ohne Header
 * darf ein Browser HEURISTISCH cachen. Gefunden beim ersten echten
 * Google-Login: der OAuth-Callback setzt das Session-Cookie und leitet auf
 * `/` um — der Browser bediente das Redirect-Ziel aus seinem Cache und
 * zeigte die GAST-Fassung der Startseite. Der frisch angemeldete Mensch sah
 * „Anmelden" statt seines Profils, bis er von Hand neu lud. Kein Auth-Fehler,
 * ein Cache-Fehler — die Session war da, nur das HTML war alt.
 *
 * `no-cache` (nicht `no-store`): die Seite DARF im Cache liegen, muss aber
 * vor jeder Wiederverwendung beim Server nachfragen — genau die Semantik für
 * personalisiertes HTML. `??=` lässt bewusst jede Route gewinnen, die ihren
 * Cache-Header selbst setzt.
 *
 * Der Haken sitzt am RENDER-Hook und trifft damit NUR SSR-Seiten: API-Routen
 * (eigene Cache-Entscheidungen, Microcache) und `/_nuxt/*`-Assets (immutable
 * gecacht, hashed) laufen hier nie durch.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    response.headers ??= {}
    // Eine Seite, die STRENGER sein will, hat ihren Header schon per
    // Middleware am Event gesetzt (`no-store` auf der Share-Seite der Brand
    // Foundation, BF1 G3): `response.headers` kennt ihn nicht, und der
    // Render-Header gewinnt am Ende — die Middleware wäre wirkungslos (live
    // erwischt 2026-09-07). Deshalb: was am Event steht, wird übernommen;
    // erst ohne alles greift der Default.
    const already = getResponseHeader(event, 'cache-control')
    if (typeof already === 'string' && already.length > 0) {
      response.headers['cache-control'] ??= already
      return
    }
    response.headers['cache-control'] ??= 'no-cache'
  })
})
