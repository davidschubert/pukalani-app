import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * EINE KLARE ZEILE, WENN DIE EINSTELLUNGEN FEHLEN (DOC-006, Q20 — 2026-11-21).
 *
 * Ohne `apps/<app>/.env` startete der Dev-Server normal, Startseite und Login
 * antworteten 200 — und jede Route mit Daten 500, im Log nur „Endpoint must be
 * a valid string" aus dem Appwrite-SDK. Das sieht aus wie ein Programmfehler
 * und ist keiner: es fehlt eine Datei.
 *
 * Die Prüfung läuft NUR beim Start im Dev-Modus (Aufrufer: Hook `ready` in
 * `packages/core/nuxt.config.ts`). Sie schreibt eine Zeile und hält nichts an —
 * wer nur eine Seite ohne Daten ansehen will, kann das weiter. Production und
 * die Wächter dort (`pnpm ops:site-env`, `/api/health`) bleiben, wie sie sind.
 *
 * WELCHE APP GEFRAGT WIRD, sagt deren eigene Vorlage: nennt `.env.example`
 * einen Endpunkt, braucht die App eine Datenbank. `apps/help` lässt ihn
 * bewusst leer (die Seite spricht nie mit Appwrite) und bekommt keine Zeile.
 *
 * Liegt wie `nitroRouteTypes.ts` neben der `nuxt.config`: Bauzeit, kein Bundle,
 * und als eigene Datei prüfbar (`packages/core/tests/devEnvHint.test.ts`).
 */

/** Ohne diese zwei gibt es keinen Appwrite-Client — alles Weitere ist je Funktion optional. */
export const DEV_ENV_REQUIRED = ['NUXT_PUBLIC_APPWRITE_ENDPOINT', 'NUXT_PUBLIC_APPWRITE_PROJECT_ID'] as const

export interface DevEnvHintInput {
  /** Ordner der App (`nuxt.options.rootDir`). */
  rootDir: string
  /** Wurzel des Repos — nur damit die Zeile `apps/<app>/.env` statt eines langen Pfads nennt. */
  repoDir: string
  env: Record<string, string | undefined>
}

function exampleNamesEndpoint(examplePath: string): boolean {
  if (!existsSync(examplePath)) return false
  return /^NUXT_PUBLIC_APPWRITE_ENDPOINT=[ \t]*\S/m.test(readFileSync(examplePath, 'utf8'))
}

/** Die Zeile für die Konsole — oder `null`, wenn nichts fehlt oder die App keine Datenbank braucht. */
export function devEnvHint({ rootDir, repoDir, env }: DevEnvHintInput): string | null {
  const missing = DEV_ENV_REQUIRED.filter(name => !env[name]?.trim())
  if (missing.length === 0) return null

  const examplePath = join(rootDir, '.env.example')
  if (!exampleNamesEndpoint(examplePath)) return null

  const envFile = relative(repoDir, join(rootDir, '.env'))
  const example = relative(repoDir, examplePath)
  const where = `Vorlage: ${example} · lokale Datenbank: README.md („Setup")`
  if (!existsSync(join(rootDir, '.env'))) {
    return `✗ [pukalani] ${envFile} fehlt — ohne sie antwortet jede Route mit Daten 500. ${where}`
  }
  return `✗ [pukalani] ${envFile} ist unvollständig: ${missing.join(', ')} fehlt — ohne antwortet jede Route mit Daten 500. ${where}`
}
