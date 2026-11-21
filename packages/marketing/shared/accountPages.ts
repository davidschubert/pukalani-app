/**
 * KONTO-SEITEN OHNE KONTEN (SEO-002, 2026-11-21).
 *
 * pukalani.app und help.pukalani.app erben vom Core die Seiten `/login`,
 * `/register`, `/forgot-password` & Co., haben aber keine Konten — die Seiten
 * antworteten 200 mit einem Formular, das hier nichts anmelden kann, und
 * standen damit als Doppel des Kundenbereichs im Index. Sie leiten jetzt per
 * 301 dorthin, wo es Konten gibt.
 *
 * DAS ZIEL KOMMT AUS DERSELBEN QUELLE WIE DIE KNÖPFE: `marketingSignInUrl`
 * und `marketingStartUrl` (runtimeConfig.public, `packages/marketing/
 * nuxt.config.ts`, per `NUXT_PUBLIC_MARKETING_*` überschreibbar). Deshalb
 * eine Server-Middleware je App statt `routeRules`: eine feste Adresse dort
 * schickte eine lokale oder Probe-Instanz auf Production.
 *
 * Zuordnung: `/register` → Registrierung, alles andere → Anmeldung (die
 * Code-, Passwort- und Bestätigungs-Schritte haben ohne den Anfang dort
 * keinen Sinn). Ein `/de`-Vorsatz reist mit, weil der Kundenbereich dieselbe
 * Sprach-Strategie fährt (`prefix_except_default`, en ohne Vorsatz). Die
 * Query bleibt bewusst zurück: diese Hosts haben nie Links mit Kennungen
 * verschickt, und eine durchgereichte Query wäre ein fremder Eingang in den
 * Kundenbereich.
 *
 * Bewusst NICHT im Layer als Middleware: eine künftige App mit Marketing-
 * Chrome UND Konten verlöre sonst still ihre Anmeldung. Die Regel liegt hier,
 * das Einschalten in jeder App selbst (`server/middleware/account-pages.ts`).
 */

/** Die Konto-Seiten des Core-Layers (ohne Sprach-Vorsatz). */
export const ACCOUNT_ONLY_PATHS = [
  '/login',
  '/login/code',
  '/register',
  '/register/code',
  '/forgot-password',
  '/reset-password',
  '/verify',
] as const

export interface AccountPageTargets {
  /** Anmeldung im Kundenbereich (`marketingSignInUrl`). */
  signInUrl: string
  /** Registrierung im Kundenbereich (`marketingStartUrl`). */
  startUrl: string
}

/**
 * Wohin leitet eine Konto-Seite dieser Site? `null` heißt: keine Konto-Seite
 * (oder kein brauchbares Ziel) — die Anfrage läuft normal weiter.
 */
export function accountPageRedirect(pathname: string, targets: AccountPageTargets): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const german = path === '/de' || path.startsWith('/de/')
  const bare = german ? path.slice(3) || '/' : path
  if (!(ACCOUNT_ONLY_PATHS as readonly string[]).includes(bare)) return null

  const base = bare === '/register' ? targets.startUrl : targets.signInUrl
  let target: URL
  try {
    target = new URL(base)
  }
  catch {
    return null
  }
  if (german && !target.pathname.startsWith('/de/') && target.pathname !== '/de') {
    target.pathname = `/de${target.pathname === '/' ? '' : target.pathname}`
  }
  return target.toString()
}
