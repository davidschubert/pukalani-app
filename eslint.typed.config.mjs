// Typisierter Lint-Durchgang (SEC-023, seit SI1 c eigener Durchgang):
// `pnpm lint:typed` — läuft in der CI im Job `lint` nach `pnpm -r lint`.
//
// LOSE PROMISES IM SERVER-CODE (SEC-023, 2026-11-13) — typisierte Regel
// `@typescript-eslint/no-floating-promises`.
//
// WARUM: eine asynchrone WACHE ohne `await` ist kein Typfehler, sondern ein
// Gate, das nicht hält — das Promise ist truthy, die Ablehnung kommt erst,
// wenn der Handler längst geantwortet hat. Genau so standen zwei Routen in
// `apps/control` vor `requireOnboardingCaller`. Der strukturelle Wächter
// (`packages/control/tests/onboardingCallerAwait.test.ts`) kennt nur diese
// eine Funktion; diese Regel kennt JEDES Promise.
//
// WOHER DIE TYPEN KOMMEN: die Regel braucht ein TypeScript-Programm. Nitros
// Auto-Importe (`createError`, `readBody`, alle `server/utils`) sind nur in
// den GENERIERTEN Server-tsconfigs der Apps typisiert
// (`apps/<app>/.nuxt/tsconfig.server.json`); Layer unter `packages/` haben
// keine eigene. Jeder Layer mit `server/` bekommt deshalb unten GENAU EINE
// App, deren Programm ihn enthält. App-eigene `server/`-Ordner nehmen die
// eigene App.
//
// WARUM EIN EIGENER DURCHGANG (SI1 c): solange die Regel im `eslint .` jedes
// Pakets stand, baute JEDES Paket das ganze Programm seiner App neu — das
// control-Programm achtmal, das platform-Programm zwölfmal, 34 Aufbauten für
// acht verschiedene Programme. `scripts/lint-typed.mjs` startet je App EINEN
// ESLint-Prozess über alle Server-Ordner, die zu ihr gehören; jedes Programm
// entsteht so genau einmal. `pnpm -r lint` (das `eslint .` je Paket) fährt
// diese Regel deshalb NICHT mehr — wer sie sehen will: `pnpm lint:typed`.
//
// VORBEDINGUNG: die tsconfigs entstehen erst mit `nuxi prepare`. Lokal liegen
// sie nach dem ersten `dev`/`typecheck` vor; frisch geklont oder in der CI
// zuerst `pnpm lint:prepare` (bereitet jede App vor). Fehlt eine tsconfig,
// bricht dieser Config-Load mit genau diesem Hinweis ab — nie stilles
// Nicht-Prüfen.
//
// NEUER LAYER MIT `server/`: in `SERVER_LINT_PROGRAM` eintragen, mit einer
// App, die ihn per `extends` mitbringt. Ohne Eintrag bricht der Durchgang;
// eine App, deren tsconfig den Layer nicht enthält, auch.
//
// OPTIONEN, bewusst die Standardwerte: `ignoreVoid: true` — `void promise`
// ist die ausdrückliche Aussage „Feuer und vergiss" (Log, Benachrichtigung,
// Aufräumen nach der Antwort) und genau das Zeichen, das die Durchsicht
// sehen soll. `ignoreIIFE: false` — eine asynchrone IIFE, die niemand
// abwartet, ist derselbe Fall und trägt ebenfalls `void`.
//
// NUR DIESE EINE REGEL: alle anderen Regeln fährt `pnpm -r lint` mit
// `eslint.config.mjs`. Deshalb ist hier `reportUnusedDisableDirectives` aus —
// ein `eslint-disable` für eine Regel aus jenem Lauf ist hier „unbenutzt",
// gemeldet wird ein wirklich unbenutztes dort.
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { relative as relativePath, resolve as resolvePath } from 'node:path'

export const SERVER_LINT_PROGRAM = {
  // Control Plane und die Betreiber-Produkte — nur apps/control bringt sie mit.
  control: 'control', tickets: 'control', runner: 'control', billing: 'control', feedback: 'control',
  // admin und themes: die Betreiber-Konsole bringt beide mit (dort leben ihre
  // Dashboard-Seiten und der Theme-Katalog).
  admin: 'control', themes: 'control',
  // Pool-Produkte und Nähte der Platform-App.
  comments: 'platform', posts: 'platform', events: 'platform', courses: 'platform', media: 'platform',
  activity: 'platform', messages: 'platform', moderation: 'platform', pages: 'platform',
  onboarding: 'platform', analytics: 'platform',
  // Die Silo-Produkte von branding.supply.
  brand: 'branding', market: 'branding', insights: 'branding',
  marketing: 'marketing',
  domains: 'portfolio',
  // core und system stecken in JEDER App. `marketing` ist das kleinste
  // Programm, das beide enthält (nur marketing+core+system). Was core unter
  // marketing typt, typt `nuxi typecheck` dort ebenso.
  core: 'marketing', system: 'marketing',
}

const repoRoot = fileURLToPath(new URL('.', import.meta.url))
const dirsIn = top => readdirSync(resolvePath(repoRoot, top), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
  .map(entry => entry.name)
const hasServerDir = (top, name) => existsSync(resolvePath(repoRoot, top, name, 'server'))
const serverTsconfigOf = app => resolvePath(repoRoot, 'apps', app, '.nuxt', 'tsconfig.server.json')

/**
 * Die Server-Ordner je App-Programm: `{ app: ['packages/x/server', 'apps/app/server', …] }`.
 * `scripts/lint-typed.mjs` startet daraus je App einen Prozess.
 */
export const serverDirsByProgram = () => {
  const groups = {}
  const add = (app, dir) => (groups[app] ??= []).push(dir)
  for (const [layer, app] of Object.entries(SERVER_LINT_PROGRAM)) add(app, `packages/${layer}/server`)
  for (const app of dirsIn('apps').filter(name => hasServerDir('apps', name))) add(app, `apps/${app}/server`)
  return groups
}

// Stimmt die Zuordnung mit dem Dateisystem überein? Ein Layer mit `server/`
// ohne App wäre sonst eine stille Lücke.
{
  const layersWithServer = dirsIn('packages').filter(name => hasServerDir('packages', name))
  const unmapped = layersWithServer.filter(name => !(name in SERVER_LINT_PROGRAM))
  const stale = Object.keys(SERVER_LINT_PROGRAM).filter(name => !layersWithServer.includes(name))
  if (unmapped.length || stale.length) {
    throw new Error([
      'eslint.typed.config.mjs: SERVER_LINT_PROGRAM und die server/-Ordner unter packages/ laufen auseinander (SEC-023).',
      unmapped.length ? `  ohne App für die typisierte Regel: ${unmapped.join(', ')} — eine App eintragen, die den Layer per extends mitbringt` : '',
      stale.length ? `  eingetragen, aber ohne server/: ${stale.join(', ')}` : '',
    ].filter(Boolean).join('\n'))
  }
}

// Jede tsconfig muss da sein und ihre Layer enthalten — geprüft für ALLE
// Programme, weil dieser Durchgang alle Server-Ordner lintet.
for (const [app, dirs] of Object.entries(serverDirsByProgram())) {
  const tsconfig = serverTsconfigOf(app)
  if (!existsSync(tsconfig)) {
    throw new Error(
      `eslint.typed.config.mjs: ${relativePath(repoRoot, tsconfig)} fehlt — erst \`pnpm lint:prepare\` `
      + `(nuxi prepare je App). Die typisierte Regel no-floating-promises (SEC-023) braucht sie für ${dirs.join(', ')}.`)
  }
  const { include = [] } = JSON.parse(readFileSync(tsconfig, 'utf8'))
  for (const dir of dirs.filter(d => d.startsWith('packages/'))) {
    if (!include.some(entry => entry.endsWith(`${dir}/**/*`))) {
      throw new Error(
        `eslint.typed.config.mjs: apps/${app} bringt ${dir} nicht (mehr) mit — `
        + `SERVER_LINT_PROGRAM auf eine App zeigen lassen, deren tsconfig.server.json ${dir} enthält (SEC-023).`)
    }
  }
}

// `@typescript-eslint/*` ist nur über @nuxt/eslint-config im Baum (nicht im
// Wurzel-node_modules gehoistet) — aufgelöst von DORT, damit es dieselben
// Instanzen sind, die `eslint.config.mjs` über @nuxt/eslint-config benutzt.
const requireFromNuxtConfig = createRequire(createRequire(import.meta.url).resolve('@nuxt/eslint-config'))
const { default: tsPlugin } = await import(pathToFileURL(requireFromNuxtConfig.resolve('@typescript-eslint/eslint-plugin')).href)
const { default: tsParser } = await import(pathToFileURL(requireFromNuxtConfig.resolve('@typescript-eslint/parser')).href)

/** Ein Block je Server-Ordner: genau EINE tsconfig, also genau ein Programm. */
const floatingPromiseBlock = (serverDir, app) => ({
  files: [`${serverDir}/**/*.ts`],
  plugins: { '@typescript-eslint': tsPlugin },
  languageOptions: {
    parser: tsParser,
    parserOptions: { project: [serverTsconfigOf(app)], tsconfigRootDir: repoRoot },
  },
  rules: {
    '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: false }],
  },
})

export default [
  // Dieselben Ausnahmen wie `pnpm -r lint` mit eslint.config.mjs: dessen
  // eigene Liste plus die von @nuxt/eslint-config (dort `ignores()`, darin
  // `**/public` — es trifft auch Routen-Ordner wie `server/api/…/public/`).
  // Gleiche Liste ⇒ gleiche Datei-Menge wie vor dem eigenen Durchgang.
  {
    ignores: [
      '**/.nuxt/**', '**/.output/**', '**/dist/**', '**/node_modules/**', '**/.playground/.nuxt/**',
      '**/dist', '**/node_modules', '**/.nuxt', '**/.output', '**/.vercel', '**/.netlify', '**/public',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ...Object.entries(serverDirsByProgram())
    .flatMap(([app, dirs]) => dirs.map(dir => floatingPromiseBlock(dir, app))),
]
