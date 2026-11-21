/**
 * DIE LISTE DES LINT-LAUFS (Q18, DOC-012) — EINE Stelle für beide Wege:
 * lokal `pnpm check`, in der CI der Job `lint` in `.github/workflows/lint.yml`,
 * der nichts anderes tut als `pnpm check`. Vorher stand die Liste nur im
 * Workflow; `pnpm lint` am eigenen Rechner fuhr keinen der Wächter davor, und
 * die Regeln zählten sie verschieden.
 *
 * Wächter: `packages/core/tests/checkSteps.test.ts` — der Job `lint` ruft
 * genau `pnpm check`, jeder Schritt hier nennt ein vorhandenes Skript, und
 * jedes `check:*`-Skript der Wurzel steht hier, in `lint:scripts` oder mit
 * Grund in NOT_IN_CHECK.
 *
 * Reihenfolge = Reihenfolge des Laufs. `needs`: läuft nur, wenn dieser
 * Schritt grün war (sonst wäre die Meldung ein Folgefehler).
 */
export const CHECK_STEPS = [
  { name: 'check:manifests', run: ['check:manifests'],
    why: 'Manifeste, extends, package.json, Layer-Einordnung (kind), Abhängigkeiten über Auto-Import, Lösch-Pflicht, Datentür.' },
  { name: 'check:i18n-keys', run: ['check:i18n-keys'],
    why: 'Nennt die app.config einen i18n-Schlüssel, den die App nicht hat? vue-i18n zeigt dann den Schlüssel — vier Tage stand so „legal.imprint" im Fuß eines Hosts.' },
  { name: 'check:bilanz', run: ['check:bilanz'],
    why: 'Die Produkt-Bilanz (Pool = Silo) wird erzeugt, nicht gepflegt — das committete Dokument muss zum Code passen.' },
  { name: 'check:live-beweise', run: ['check:live-beweise'],
    why: 'docs/referenz/LIVE-BEWEISE.md wird aus den Köpfen der Beweis-Skripte erzeugt (OPS-012).' },
  { name: 'check:doc-links', run: ['check:doc-links'],
    why: 'Tote Verweise in der Doku.' },
  { name: 'check:rules', run: ['check:rules'],
    why: 'Regelwerk der KI-Sitzungen: Größen-Deckel, Lade-Pfade, genannte Pfade und Skripte (Q17).' },
  { name: 'check:single-copy', run: ['check:single-copy'],
    why: 'Zwei Kopien einer Kernabhängigkeit brechen Typen oder Build, je nach Hoisting.' },
  { name: 'check:prompt-quotes', run: ['check:prompt-quotes'],
    why: 'Ein gerades Anführungszeichen im KI-Prompt beendet die JSON-Antwort des Modells (BI4).' },
  { name: 'check:themes', run: ['--filter', '@pukalani/themes', 'check:themes'],
    why: 'Der erzeugte Theme-Katalog muss zum Generator passen (E6a).' },
  { name: 'lint:prepare', run: ['lint:prepare'],
    why: 'Die typisierte Lint-Regel liest die generierten Server-tsconfigs der Apps — die gibt es nach `pnpm install` noch nicht.' },
  { name: 'lint', run: ['-r', 'lint'],
    why: 'ESLint je Workspace-Paket (Layer-Grenzen, Datentür, stilles .catch, $fetch-Typen).' },
  { name: 'lint:typed', run: ['lint:typed'], needs: 'lint:prepare',
    why: 'Lose Promises im Server-Code (SEC-023), ein ESLint-Prozess je App-Programm (SI1 c).' },
  { name: 'lint:scripts', run: ['lint:scripts'],
    why: 'scripts/ liegt in keinem Workspace-Paket — dort liegt der Code, der Produktionsdaten anfasst; davor die Wächter aus dem Skript selbst.' },
]

/**
 * `check:*`-Skripte der Wurzel, die NICHT in `pnpm check` laufen — je mit
 * Grund. Ein Eintrag ohne passendes Skript ist rot (Test).
 */
export const NOT_IN_CHECK = new Map([
  ['check:secrets', 'braucht das Programm gitleaks; in der CI ein eigener Job `secrets` mit gepinnter Binärdatei'],
])
