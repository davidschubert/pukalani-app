// Geteilte Flat Config für das gesamte Monorepo — ESLint findet sie von
// jedem Package aus (Lookup in Eltern-Verzeichnissen).
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import { dataDoorGlobs } from './scripts/lib/data-door-layers.mjs'
import { staticPublicIgnores } from './scripts/lib/lint-static-public.mjs'
import { noSilentCatchRule } from './scripts/lib/eslint-no-silent-catch.mjs'
import { readLayerKinds } from './scripts/lib/layer-kinds.mjs'

// Layer-Grenzen-Durchsetzung (CONCEPT.md A14, Stufe 2 / Backstop).
// Verhindert KÜNFTIGE explizite Cross-Layer-Imports. Implizite Kopplung
// (Auto-Import, tableId-Strings) fängt das NICHT — die löst Stufe 1 (Verträge).
// Jeweils Paketname + Subpfade (`/**`) abdecken.
const pkg = name => [`@pukalani/${name}`, `@pukalani/${name}/**`]

/**
 * Die A14-Matrix — wer wen kennen darf.
 *
 * DIE EINTEILUNG STEHT NICHT HIER (Q18, ARC-008): jeder Layer sagt sie selbst,
 * im Feld `kind` seines `product.manifest.ts`. Diese Datei liest sie nur
 * (scripts/lib/layer-kinds.mjs). Ein Layer ohne Manifest oder ohne lesbare
 * Zeile bricht den Lint SOFORT — sonst wüchse wieder eine stille Lücke.
 *
 *  - BASE (`kind: 'base'`): Fundament, Stufe 1 — `core` und `system`. In
 *    jeder App dabei, kennen NUR einander. Ein Import von dort in irgendeinen
 *    anderen Layer bräche jede App, die diesen Layer nicht mitliefert.
 *  - FOUNDATION (`kind: 'foundation'`): Fundament, Stufe 2 (Davids
 *    Entscheidung R1, 2026-11-21: `admin`, `billing`, `themes` gehören
 *    hierher). Kennt Stufe 1, hängt NIE von einem Produkt oder einer Naht ab
 *    und greift auch nicht quer in einen Nachbarn der eigenen Stufe.
 *    `themes` hat dazu seinen eigenen, schärferen Block (rein visuell).
 *  - PRODUCTS (`kind: 'product'`): kennen einander nicht; Fundament nutzen sie
 *    über Auto-Import, nicht über `@pukalani/*`.
 *  - SEAM (`kind: 'seam'`): Naht-Layer. Sie DÜRFEN mehrere andere kennen, weil
 *    genau das ihre Aufgabe ist — `blueprint` verdrahtet Produkte miteinander
 *    (CLAUDE.md: „der EINZIGE Layer, der mehrere Produkt-Layer kennen darf"),
 *    `onboarding` und `control` bilden die Naht zum Control Plane, `domains`
 *    ist die Naht aus dem Silo (eigener, engerer Block). Sie sind deshalb von
 *    der Produkt-Sperre ausgenommen — aber NICHT von allem: was sie trotzdem
 *    nicht dürfen, steht in ihren eigenen Blöcken.
 */
const { fileURLToPath } = await import('node:url')
const { dirname, relative: relativePath, resolve: resolvePath, sep } = await import('node:path')
const repoRoot = dirname(fileURLToPath(import.meta.url))
const packagesDir = resolvePath(repoRoot, 'packages')
const {
  layers: layersOnDisk,
  base: BASE,
  foundation: FOUNDATION,
  seam: SEAM,
  product: PRODUCTS,
} = readLayerKinds(repoRoot)

const featureLayers = PRODUCTS.flatMap(pkg)
const allPukalaniFeatures = [...featureLayers, ...[...BASE, ...FOUNDATION].filter(n => n !== 'core').flatMap(pkg)]
/** Datei-Globs eines Topfes — für die `files`-Angabe der Blöcke. */
const filesOf = names => names.map(name => `packages/${name}/**`)
/**
 * Alle Layer-Pakete AUSSER Stufe 1 (`core`/`system` — die kommen per
 * Auto-Import, ein expliziter Import darauf ist erlaubt) und außer den
 * ausdrücklich erlaubten.
 * So steht in jedem Block, was ERLAUBT ist — die Sperre ergibt sich daraus,
 * statt dass jemand eine Verbotsliste nachpflegen muss.
 */
const otherLayers = (allowed = []) => layersOnDisk
  .filter(name => ![...BASE, ...allowed].includes(name))
  .flatMap(pkg)
/** Die Kehrseite von `otherLayers` — was der relative Wächter DURCHLÄSST. */
const alsoAllowed = (allowed = []) => [...BASE, ...allowed]

/**
 * DER WÄCHTER GRIFF NIE (F41, Paritäts-Audit 2026-08-02).
 *
 * Alle Blöcke oben verbieten Cross-Layer-Importe über `no-restricted-imports`
 * — aber `no-restricted-imports` vergleicht den SPEZIFIZIERER-TEXT, und die
 * Muster dort lauten `@pukalani/<layer>`. Im ganzen Repo gibt es KEINEN
 * einzigen solchen Import: sämtliche 244 realen Cross-Layer-Importe sind
 * relativ (`../../control/shared/onboarding`). Die Regeln oben schützen
 * also ausschließlich hypothetische Fälle; die echte Kopplung lief daran
 * vorbei. Nachgewiesen mit einer Probe-Datei.
 *
 * WARUM EINE EIGENE REGEL UND KEIN REGEX/GLOB. Naheliegend wäre gewesen, die
 * relativen Pfade textlich zu prüfen (`no-restricted-imports` mit `patterns`
 * oder `no-restricted-syntax` auf `ImportDeclaration[source.value=/…/]`). Das
 * ist in DIESEM Repo beweisbar falsch: jeder Layer-Name existiert auch als
 * UNTERORDNER. `app/pages` gibt es in allen 18 Layern, dazu `server/api/admin`,
 * `server/api/comments`, `app/components/core`, `public/themes`, … Ein Glob auf
 * das Segment `pages` bzw. ein Regex `^(\.\./)+pages/` kann nicht
 * unterscheiden, ob `../../pages/x` den LAYER `pages` meint oder den Ordner
 * `app/pages` desselben Layers — die Zahl der `../` hängt an der Tiefe der
 * Quelldatei und ist im Selektor nicht bekannt. Eine textliche Regel wäre
 * entweder löchrig oder voller Fehlalarme.
 *
 * Diese Regel löst den Pfad deshalb WIRKLICH auf (`path.resolve` gegen das
 * Verzeichnis der Quelldatei) und liest den Ziel-Layer aus dem Ergebnis. Damit
 * ist der Selbst-Import eines Layers automatisch erlaubt (Quelle und Ziel
 * ergeben denselben Ordner), egal wie tief er verschachtelt ist, und Importe
 * aus dem Repo-Wurzelwerkzeug (`scripts/migrations-lib/indexRetry.mts`)
 * fallen gar nicht erst in den Geltungsbereich.
 *
 * `allow` = die Ziel-Layer, die dieser Topf kennen darf (Gegenstück zu
 * `otherLayers`). `allowTypeFrom` = Layer, aus denen nur `import type` erlaubt
 * ist — ein Typ-Import wird beim Bauen restlos gelöscht und erzeugt keine
 * Laufzeit-Abhängigkeit. Gebraucht wird das genau einmal: CLAUDE.md verlangt
 * von JEDEM Layer eine `product.manifest.ts` mit `import type { ProductManifest }
 * from '../core/…'` — auch von `themes`, das sonst gar nichts aus core kennen darf.
 */
const layerAt = (absolutePath) => {
  const rel = relativePath(packagesDir, absolutePath)
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) return null
  return rel.split(sep)[0]
}
const isTypeOnly = (node, kind) => node[kind] === 'type'
  || (Array.isArray(node.specifiers) && node.specifiers.length > 0
    && node.specifiers.every(spec => spec.importKind === 'type' || spec.exportKind === 'type'))

const pukalaniPlugin = {
  rules: {
    'no-cross-layer-relative': {
      meta: {
        type: 'problem',
        docs: { description: 'Relative Importe in einen fremden Layer unter packages/ (CONCEPT.md A14).' },
        schema: [{
          type: 'object',
          properties: {
            allow: { type: 'array', items: { type: 'string' } },
            allowTypeFrom: { type: 'array', items: { type: 'string' } },
            hint: { type: 'string' },
          },
          additionalProperties: false,
        }],
        messages: {
          crossLayer: 'Layer-Grenze: `{{from}}` importiert relativ aus `{{to}}` ("{{spec}}"). {{hint}}',
        },
      },
      create(context) {
        const { allow = [], allowTypeFrom = [], hint = '' } = context.options[0] ?? {}
        const allowed = new Set(allow)
        const typeAllowed = new Set(allowTypeFrom)
        const filename = context.filename
        if (typeof filename !== 'string' || !filename.startsWith(sep)) return {}
        const from = layerAt(filename)
        if (!from) return {}
        const here = dirname(filename)

        const check = (source, typeOnly) => {
          if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return
          if (!source.value.startsWith('.')) return
          const to = layerAt(resolvePath(here, source.value))
          if (!to || to === from || allowed.has(to)) return
          if (typeOnly && typeAllowed.has(to)) return
          context.report({ node: source, messageId: 'crossLayer', data: { from, to, spec: source.value, hint } })
        }

        return {
          ImportDeclaration: node => check(node.source, isTypeOnly(node, 'importKind')),
          ExportNamedDeclaration: node => check(node.source, isTypeOnly(node, 'exportKind')),
          ExportAllDeclaration: node => check(node.source, isTypeOnly(node, 'exportKind')),
          ImportExpression: node => check(node.source, false),
        }
      },
    },
    /**
     * KEIN STILLES `.catch` IM SERVER-CODE (Q13, ARC-002).
     *
     * `.catch(() => null)` macht aus „konnte nicht gelesen werden" ein „gibt
     * es nicht" und schreibt nichts ins Protokoll. Rot ist deshalb jedes
     * `.catch(<Funktion>)`, dessen Funktion ihren Fehler WEDER ANSIEHT (kein
     * Parameter, oder einer, den der Rumpf nie liest) NOCH WEITERWIRFT (kein
     * `throw`). Der Weg daran vorbei ist die Hilfe aus dem Core:
     * `.catch(softFail('<layer>:<pfad>:<aufruf>', ersatz))` — derselbe
     * Ersatzwert, dazu eine gezählte Zeile `soft_fail`
     * (packages/core/server/utils/softFail.ts).
     *
     * WARUM EINE EIGENE REGEL UND KEIN `no-restricted-syntax`: der wird von
     * einem späteren Block ERSETZT, nicht ergänzt (Flat Config) — ein Selektor
     * für alle `server`-Ordner hätte die tablesDB-Sperre der gepoolten Layer
     * abgeschaltet (s. u., Block „JEDER $fetch NENNT SEINEN ANTWORTTYP").
     *
     * ZWEITE PRÜFUNG: die Kennung von `softFail`/`softFailWith` ist ein festes
     * Text-Literal. Eine zusammengesetzte Kennung trüge Ids ins Protokoll, und
     * der tägliche Wächter könnte Stellen nicht mehr auseinanderhalten.
     *
     * WAS SIE NICHT SIEHT (bewusst): `try { … } catch { … }` ohne Weiterwurf
     * (dort steht meist mehr als ein Ersatzwert, das ist keine mechanische
     * Form), eine Funktion, die ihren Fehler liest und dann doch nichts damit
     * tut, und einen NAMEN als Argument (`.catch(noop)`). Wer wirklich
     * schweigen muss (das Ende einer Sperr-Kette, deren Fehler der Aufrufer
     * schon bekommt), schreibt eine `eslint-disable-next-line` MIT GRUND.
     */
    'no-silent-catch': noSilentCatchRule,
  },
}

// LOSE PROMISES IM SERVER-CODE (SEC-023): die typisierte Regel
// `@typescript-eslint/no-floating-promises` steht NICHT hier, sondern in
// `eslint.typed.config.mjs` und läuft als eigener Durchgang `pnpm lint:typed`
// (SI1 c) — ein Programm je App statt eines je Paket. Dort stehen Begründung,
// Zuordnung Layer→App (`SERVER_LINT_PROGRAM`) und die Vorbedingung
// `pnpm lint:prepare`.

export default createConfigForNuxt({
  features: {
    stylistic: false,
    // AUSDRÜCKLICH AN (Q18, ARC-004): ohne Angabe schaut die Vorlage, ob das
    // Paket im ARBEITSVERZEICHNIS `typescript` kennt. Aus dem Hauptordner tut
    // es das nicht — dann fehlten Parser und Regeln für jede `.ts`-Datei, und
    // `eslint packages/<layer>/server/…` meldete „ignored" mit Code 0 oder
    // las TypeScript mit dem JavaScript-Parser. Wächter:
    // packages/core/tests/eslintRootProbes.test.ts.
    typescript: true,
  },
}).append({
  ignores: [
    '**/.nuxt/**',
    '**/.output/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/.playground/.nuxt/**',
    // LN1: die Ausnahme von @nuxt/eslint-config für JEDEN Ordner namens
    // `public` traf auch Routen-Ordner (`server/api/…/public/`). Aufgehoben
    // und auf die statischen Ordner begrenzt — scripts/lib/lint-static-public.mjs.
    ...staticPublicIgnores,
  ],
}).append({
  // Nuxt benennt diese Dateien per Konvention einwortig (login.vue, auth.vue,
  // error.vue) — die Default-Ausnahmen der Nuxt-Config greifen für
  // Layer-Pfade (packages/*/app/…) nicht
  files: ['**/app/pages/**/*.vue', '**/app/layouts/**/*.vue', '**/app/error.vue'],
  rules: {
    'vue/multi-word-component-names': 'off',
  },
}).append({
  // Der relative Wächter (F41) wird EINMAL bereitgestellt; die Erlaubnislisten
  // stehen unten in denselben Blöcken wie ihre `@pukalani/*`-Gegenstücke, damit
  // eine Grenze an EINER Stelle beschrieben ist und nicht an zweien.
  files: ['packages/**'],
  plugins: { pukalani: pukalaniPlugin },
}).append({
  // themes ist rein visuell: keine Appwrite-, keine Feature-/Layer-Imports.
  files: ['packages/themes/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['appwrite', 'node-appwrite', ...allPukalaniFeatures, ...pkg('core')],
          message: 'themes ist rein visuell — keine Appwrite-/Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
    // `allowTypeFrom: ['core']` ist keine Aufweichung, sondern die einzige
    // Stelle, an der die Sperre oben mit CLAUDE.md kollidiert: die von JEDEM
    // Layer verlangte `product.manifest.ts` importiert `ProductManifest` als
    // TYP aus core. Werte aus core bleiben auch hier verboten.
    'pukalani/no-cross-layer-relative': ['error', {
      allow: [],
      allowTypeFrom: ['core'],
      hint: 'themes ist rein visuell — keine Layer-Imports; aus core nur `import type` (CONCEPT.md A14).',
    }],
  },
}).append({
  // Produkt-Layer importieren keine ANDEREN Produkt-Layer. Fundament
  // (core, moderation, …) wird per Auto-Import genutzt, nicht via @pukalani/*.
  // Die Dateiliste kommt aus PRODUCTS — pages/media/activity fehlten hier bis
  // zum Paritäts-Audit 2026-08-02 und durften ungebremst zugreifen.
  files: filesOf(PRODUCTS),
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(),
          message: 'Produkt-Layer importieren keine anderen Layer (CONCEPT.md A14). Fundament nur über Auto-Import.' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(),
      hint: 'Produkt-Layer importieren keine anderen Produkt-Layer (CONCEPT.md A14) — gemeinsame Verdrahtung gehört in blueprint.',
    }],
  },
}).append({
  /**
   * DIE EINE PRODUKT-AUSNAHME: feedback ↔ control.
   *
   * `feedback` besitzt keine eigenen Tabellen — es ist die Kunden-Oberfläche
   * auf den Vertrag des Control Plane (E10, Davids Entscheidung 7). Die Naht
   * ist bewusst und heute schon real (`control/shared/customerFeedback.ts`,
   * `control/schemas/customerFeedback.ts`). Sie steht deshalb HIER als
   * benannte Ausnahme statt als stille Lücke in der Regel darüber.
   */
  files: ['packages/feedback/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(['control']),
          message: 'feedback darf NUR die Control-Plane-Verträge kennen (E10) — sonst keine Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
    // Naht 1 von 4: feedback → control (20 Importe, alle auf
    // control/shared/customerFeedback + control/schemas/customerFeedback).
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(['control']),
      hint: 'feedback darf NUR die Control-Plane-Verträge kennen (E10) — sonst keine Layer-Imports (CONCEPT.md A14).',
    }],
  },
}).append({
  /**
   * DIE ZWEITE PRODUKT-AUSNAHME: market → brand (MV1 M1, Plan
   * docs/archiv/BRAND-MARKTVERGLEICH.md §2.1 + Davids Entscheidungen 1 und 7).
   *
   * `market` ist ein eigener Produkt-Layer mit eigenen Tabellen — und trotzdem
   * hängt er an `brand`: der Vergleich läuft gegen die BESTÄTIGTEN Felder der
   * Foundation, benutzt deren Slot-Registry als Adressraum und teilt sich den
   * SSRF-festen Abruf. Davids Entscheidung 7 sagt ausdrücklich, dass der
   * Abruf-Vertrag in `brand` BLEIBT und `market` ihn importiert; ihn nach
   * `core` zu ziehen wäre sauberer, aber ein Schritt mehr als nötig (§6,
   * „verworfen und warum").
   *
   * Die Richtung ist EINSEITIG: brand kennt market nicht und darf es nicht —
   * dafür sorgt der Block über diesem hier (PRODUCTS), der für
   * `packages/brand/**` unverändert gilt. Was brand von market braucht (die
   * Profil-Kaskade), läuft über eine Registry, in die market sich einträgt.
   *
   * Und sie ist GEBÜNDELT: im market-Layer greift genau EINE Datei über die
   * Paketgrenze (`server/utils/brandContract.ts`), alle anderen importieren
   * von dort. Die Regel hier kann das nicht erzwingen — sie erlaubt den
   * Ziel-Layer, nicht die Quelldatei —, aber der Kopf jener Datei sagt es,
   * und eine zweite Sprungstelle fällt in der Durchsicht auf.
   */
  files: ['packages/market/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(['brand']),
          message: 'market darf NUR den brand-Vertrag kennen (MV1 §2.1) — sonst keine Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(['brand']),
      hint: 'market darf NUR den brand-Vertrag kennen (MV1 §2.1) — gebündelt in server/utils/brandContract.ts (CONCEPT.md A14).',
    }],
  },
}).append({
  /**
   * DIE DRITTE PRODUKT-AUSNAHME: insights → brand (BI1 I1, Plan
   * docs/plans/BRAND-INSIGHTS.md §9.1 Nr. 2 + Davids Entscheidung 1 in §11).
   *
   * Bis I0 stand hier „KEINE DRITTE AUSNAHME — NOCH NICHT": der Prototyp
   * importierte NICHTS aus einem fremden Layer, was dem brand-Layer gehörte
   * (Score-Ring, Farbwelt, Archetyp-Namen), kam als Prop oder Slot in die
   * `In*`-Komponenten. Mit I1 gibt es den Vertrag, und damit ist die Ausnahme
   * eine Erlaubnis für etwas, das es gibt.
   *
   * Dieselbe Lage wie bei `market` eine Zeile darüber: `insights` ist ein
   * eigener Produkt-Layer mit eigenen Tabellen — und trotzdem hängt er an
   * `brand`. Von dort kommen der BESTEHENDE Brand-Score (Entscheidung 7:
   * „keine zweite Skala"), die Farbwelt, der Archetyp- und der
   * Branchen-Katalog, die Slug-Regel (§9.2: „geteilt wird nur die FUNKTION,
   * nie der Index") und der SSRF-feste Abruf samt robots.txt- und
   * TDM-Prüfung. Ein zweiter SSRF-Schutz oder eine zweite Slug-Regel wären
   * zwei Wahrheiten über dieselbe Sache.
   *
   * Die Richtung ist EINSEITIG: brand kennt insights nicht und darf es nicht
   * — dafür sorgt der PRODUCTS-Block weiter oben, der für `packages/brand/**`
   * unverändert gilt. Und `market` steht NICHT in der Erlaubnis: zwei
   * Produkt-Layer nebeneinander importieren einander nie (CONCEPT A14).
   * Genau deshalb sind `evidenceIsGrounded` und der Herabsetzungs-/
   * Namensfilter mit Paket I1a nach `packages/core/shared` gezogen —
   * `insights` liest sie dort, und `core` ist ohnehin immer erlaubt.
   *
   * Und sie ist GEBÜNDELT: im insights-Layer greift genau EINE Datei über die
   * Paketgrenze (`server/contracts/brandContract.ts`), alle anderen
   * importieren von dort. Die Regel hier kann das nicht erzwingen — sie
   * erlaubt den Ziel-Layer, nicht die Quelldatei —, aber der Kopf jener Datei
   * sagt es, und eine zweite Sprungstelle fällt in der Durchsicht auf.
   *
   * ── WARUM `insights` NICHT IM DATENTÜR-BLOCK STEHT (tablesDB-Sperre) ────
   * Weiter unten verbietet ein `no-restricted-syntax`-Block rohes `.tablesDB`
   * in `server/api/**` und `server/plugins/**` der GEPOOLTEN Layer. `insights`
   * gehört bewusst NICHT dazu — aus demselben Grund wie `brand` und `market`:
   * seine drei Tabellen tragen kein `communityId`, und der Layer läuft
   * ausschliesslich auf der Single-Tenant-Instanz `branding` (Silo). Es gibt
   * dort keinen zweiten Mandanten, gegen den `tenantDb` scopen könnte — die
   * Tür wäre eine Tür in einer freistehenden Wand. Die Grenze dieses Layers
   * ist eine andere: die Redaktion hängt an der Capability `insights.manage`,
   * und was öffentlich wird, entscheidet die Leseroute über `state` und
   * `translationReviewed`. Käme je eine insights-Tabelle mit `communityId`
   * dazu, gehört der Layer in denselben Moment in jenen Block.
   */
  files: ['packages/insights/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(['brand']),
          message: 'insights darf NUR den brand-Vertrag kennen (BI1 §9.1) — sonst keine Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(['brand']),
      hint: 'insights darf NUR den brand-Vertrag kennen (BI1 §9.1) — gebündelt in server/contracts/brandContract.ts (CONCEPT.md A14).',
    }],
  },
}).append({
  // STUFE 1 (`core`, `system`) KENNT NUR SICH SELBST (Q18, ARC-008). Bis
  // dahin galt hier die Erlaubnis „Fundament kennt Fundament" — ein Import
  // aus dem Core nach `admin` oder `billing` ging ohne Meldung durch, und
  // `apps/marketing` und `apps/help` liefern beide Layer gar nicht mit.
  files: filesOf(BASE),
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(),
          message: 'Fundament Stufe 1 (core/system) hängt von KEINEM anderen Layer ab (CONCEPT.md A14).' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: BASE,
      hint: 'Fundament Stufe 1 (core/system) hängt von KEINEM anderen Layer ab — auch nicht von admin, billing oder themes (CONCEPT.md A14).',
    }],
  },
}).append({
  // STUFE 2 hängt NIE von Produkten oder Nähten ab (azyklisch) und greift
  // nicht quer in einen Nachbarn der eigenen Stufe: erlaubt ist nur Stufe 1
  // (heute real: ein admin-Test liest `system/server/utils/userDataContributor`).
  // Was ein Layer dieser Stufe von einem Nachbarn per Auto-Import braucht,
  // steht in seinem `requires` (`pnpm check:manifests`, Prüfung 12).
  // `themes` hat weiter oben seinen schärferen eigenen Block.
  files: filesOf(FOUNDATION.filter(name => name !== 'themes')),
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(),
          message: 'Fundament Stufe 2 kennt nur core und system — keine Produkt-, Naht- oder Nachbar-Layer (CONCEPT.md A14).' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: BASE,
      hint: 'Fundament Stufe 2 kennt nur core und system — keine Produkt-, Naht- oder Nachbar-Layer (CONCEPT.md A14).',
    }],
  },
}).append({
  /**
   * DER BAUPLAN — sein Vertrag hatte als EINZIGER keinen Wächter
   * (Paritäts-Audit 2026-08-02).
   *
   * `blueprint` DARF mehrere Produkt-Layer kennen; das ist sein ganzer Zweck
   * (CLAUDE.md: „der EINZIGE Layer, der mehrere Produkt-Layer kennen darf").
   * Verboten ist deshalb nicht das Kennen, sondern das BESITZEN: keine
   * Produkt-Logik, keine Tabellen, kein `server/`. Was hier geschützt wird,
   * ist die Aussage „Pool und Silo zeigen identisches Produktverhalten" —
   * die hält nur, solange der Bauplan reine Verdrahtung bleibt. Ein eigener
   * Datenzugriff wäre Verhalten, das es nur in Apps MIT blueprint gibt.
   *
   * Die Naht-Layer stehen ebenfalls hier: sie dürfen die Verträge kennen, die
   * sie bedienen, nicht aber quer durch die Produkte greifen.
   */
  files: ['packages/blueprint/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['appwrite', 'node-appwrite'],
          message: 'blueprint ist reine Komposition — kein eigener Datenzugriff, keine Tabellen (CLAUDE.md). Daten holen die Produkt-Layer.' },
        { group: [...SEAM.filter(n => n !== 'blueprint').flatMap(pkg), ...pkg('admin'), ...pkg('billing')],
          message: 'blueprint verdrahtet PRODUKTE — Control Plane, Onboarding und Betreiber-Layer gehören nicht in eine Produkt-Komposition (CONCEPT.md A14).' },
      ],
    }],
    // Naht 4 von 4: blueprint → Produkte (heute events + pages, je ein
    // Typ-Import). Das Kennen ist hier der ZWECK — gesperrt bleiben Nähte
    // und Betreiber-Layer.
    'pukalani/no-cross-layer-relative': ['error', {
      allow: layersOnDisk.filter(name => !['onboarding', 'control', 'admin', 'billing'].includes(name)),
      hint: 'blueprint verdrahtet PRODUKTE — Control Plane, Onboarding und Betreiber-Layer gehören nicht in eine Produkt-Komposition (CONCEPT.md A14).',
    }],
  },
}).append({
  /**
   * KEIN `server/`, KEINE MIGRATIONEN IM BAUPLAN — als Verhalten, nicht als
   * Merksatz. Jede Datei unter diesen Pfaden bricht den Lint mit der
   * Begründung; die Regel greift ab dem ersten Zeichen (Selector `Program`).
   * Genau das war die Lücke: eine `blueprint/server/api/*.ts` mit rohem
   * `tablesDB` lief am 2026-08-02 sauber durch `eslint .`.
   */
  files: ['packages/blueprint/server/**', 'packages/blueprint/scripts/**', 'packages/blueprint/shared/**'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'Program',
        message: 'blueprint hat kein server/, keine Migrationen und kein eigenes Datenmodell — die Datei gehört in den Produkt-Layer, dessen Daten sie braucht (CLAUDE.md, CONCEPT.md A14).' },
    ],
  },
}).append({
  /**
   * DIE NAHT ZUM CONTROL PLANE (`onboarding`, `control`).
   *
   * Beide dürfen einander und die Fundament-Verträge kennen — `onboarding`
   * bedient die Control-Plane-Schemata und sät beim Anlegen einer Community
   * die Rechtsseiten (`pages/server/utils/seedLegalPages`), `control` liest den
   * Theme-Katalog. Was sie NICHT dürfen: quer in die übrigen Produkte greifen.
   * Ohne diesen Block hatten beide gar keinen Wächter.
   */
  files: ['packages/onboarding/**', 'packages/control/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(['control', 'onboarding', 'pages', 'themes']),
          message: 'Naht-Layer (onboarding/control) kennen die Control-Plane-Verträge, pages und themes — sonst keine Produkt-Layer (CONCEPT.md A14).' },
      ],
    }],
    // Nähte 2+3 von 4: onboarding → control (20) / pages (2) / themes (1) und
    // control → themes (2) / pages (1, Backfill-Skript). `control → events`
    // ist NICHT erlaubt und steht bewusst als begründete Einzelausnahme in
    // packages/control/scripts/verify-audience-flip.mjs (F41-Fund).
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(['control', 'onboarding', 'pages', 'themes']),
      hint: 'Naht-Layer (onboarding/control) kennen die Control-Plane-Verträge, pages und themes — sonst keine Produkt-Layer (CONCEPT.md A14).',
    }],
  },
}).append({
  /**
   * DIE NAHT AUS DEM SILO (`domains`, control-036) — ENGER als ihre
   * Geschwister, und der Unterschied ist der ganze Grund für den Block.
   *
   * `onboarding` und `control` leben in Apps, die den control-Layer
   * MITLIEFERN; sie dürfen seine Verträge deshalb direkt lesen. `domains`
   * läuft in Silo-Apps (portfolio, comments), die ihn NICHT mitliefern — ein
   * Import darauf wäre kein Stilbruch, sondern ein Build, der einen Layer
   * hineinzieht, der dort nichts zu suchen hat (und mit ihm die
   * Betreiber-Schemata).
   *
   * Erlaubt sind deshalb nur `core` und `system`. Alles, was dieser Layer vom
   * Control Plane braucht, geht über die Naht: Transport aus core
   * (`callControlService`), der gemeinsame Vertrag als reiner Typ in
   * `core/shared/types/siteDomain.ts`. Die REGELN (was gilt als Domain, wie
   * sieht der Nachweis aus) bleiben drüben — sie werden hier nicht
   * nachgebaut, sondern erfragt.
   */
  files: ['packages/domains/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: otherLayers(),
          message: '`domains` läuft in Silo-Apps ohne control-Layer — alles vom Control Plane kommt über die Naht, nicht per Import (CONCEPT.md A14).' },
      ],
    }],
    'pukalani/no-cross-layer-relative': ['error', {
      allow: alsoAllowed(),
      hint: '`domains` läuft in Silo-Apps ohne control-Layer — alles vom Control Plane kommt über die Naht, nicht per Import (CONCEPT.md A14).',
    }],
  },
}).append({
  // DATENTÜR-BACKSTOP (CLAUDE.md „Mandanten-Isolation: EINE Datentür"): in
  // server/api/** UND server/plugins/** der gepoolten Layer geht Datenzugriff
  // NUR über tenantDb — rohes `.tablesDB` der Client-Factories umgeht Scoping,
  // tenantId-Stempel und Zugehörigkeitsbeleg. Genau so sind am 2026-07-26/27
  // vier echte Cross-Tenant-Lecks entstanden bzw. gefunden worden (drei
  // Moderations-Routen, mentions, embed-sites).
  //
  // WARUM server/plugins DAZUGEHÖRT (Audit-Befund B2, 2026-07-27): der
  // Dashboard-Stats-Contributor von comments liegt in server/plugins, nicht in
  // server/api — er zählte deshalb ungebremst pool-weit und lieferte die Zahl
  // an eine Kunden-Ansicht. Plugins, die einen H3Event bekommen, bedienen einen
  // REQUEST und gehören damit hinter dieselbe Tür wie eine Route.
  //
  // AUSSERHALB dieser beiden Verzeichnisse bleibt rohes tablesDB erlaubt
  // (Migrationen, Sweeps, GDPR-Contributors in server/utils, Control Plane —
  // die Ausnahmen aus CLAUDE.md), deshalb ist der Scope bewusst eng. Ein
  // eventloser Sweep-Plugin bräuchte künftig eine begründete
  // eslint-disable-next-line — nicht eine Aufweichung der Regel.
  //
  // DIE LISTE steht seit GA1 P20 in scripts/lib/data-door-layers.mjs (mit den
  // Begründungen je Layer) — `pnpm check:manifests` hält sie gegen die
  // Migrationen: wer `communityId` anlegt, steht dort oder in der begründeten
  // Ausnahmeliste.
  files: dataDoorGlobs(),
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'MemberExpression[property.name="tablesDB"]',
        message: 'Datenzugriff in server/api gepoolter Layer NUR über tenantDb(event) — rohes tablesDB umgeht die Mandanten-Tür (CLAUDE.md).' },
      { selector: 'ObjectPattern > Property[key.name="tablesDB"]',
        message: 'Kein Destructuring von tablesDB aus den Client-Factories — Datenzugriff über tenantDb(event) (CLAUDE.md).' },
    ],
  },
}).append({
  /**
   * DIE BETREIBER-TABELLEN DES ADMIN-LAYERS — EINE Begründung statt zwanzig
   * eslint-disable-Zeilen.
   *
   * `app_config`, `custom_themes`, `custom_fonts`, `changelog` und `audit_log`
   * sind PROJEKT-global, nicht mandantenfähig: sie tragen keine
   * `communityId`-Spalte, und im Pool gilt bewusst EINE Zeile für das ganze
   * Projekt (CLAUDE.md: „`app_config.themeSettings` ist EINE Row pro Projekt").
   * Die Tür hätte hier nichts zu scopen — sie würde nur `list` mit einem Filter
   * auf eine Spalte belegen, die es nicht gibt.
   *
   * Der Ausschluss ist deshalb nach TABELLE begründet und nach ORDNER gezogen,
   * und er ist eng: alles ANDERE unter `packages/admin/server/api/**` trifft die
   * Regel weiterhin. Wer hier eine neue Route mit rohem tablesDB anlegt, muss
   * also erst entscheiden, ob seine Tabelle wirklich in diese Aufzählung
   * gehört — genau die Entscheidung, die bei der Nutzer-Detailseite ausgefallen
   * ist.
   */
  files: [
    'packages/admin/server/api/admin/config.patch.ts',
    'packages/admin/server/api/admin/audit.get.ts',
    'packages/admin/server/api/admin/products/**',
    'packages/admin/server/api/admin/changelog/**',
    'packages/admin/server/api/admin/fonts/**',
    'packages/admin/server/api/admin/themes/**',
  ],
  rules: {
    'no-restricted-syntax': 'off',
  },
}).append({
  /**
   * INDEX-ANLAGE NUR ÜBER DIE FABRIK (F19-Nachlese, 2026-08-02).
   *
   * Der Cache-Anstoß gegen `column_not_available` war zuerst ein OPTIONALES
   * Argument von `indexStep`. Ergebnis nach einem Tag: 2 von 63 Migrationen
   * reichten ihn durch, 61 nicht — und eine davon (posts-004) legte die CI-E2E
   * lahm. Seitdem ruft `createIndexSteps(tablesDB, databaseId)` das
   * `createIndex` selbst; vergessen kann man den Anstoß nicht mehr.
   *
   * Diese Regel schließt den letzten Weg daran vorbei: `tablesDB.createIndex`
   * von Hand. Sie ist der einzige greifende Wächter für Migrationen — die
   * Dateien liegen in KEINER tsconfig (weder `nuxi typecheck` der Apps noch
   * das Playground des Cores nimmt die scripts-Ordner der Layer auf), ein
   * Typfehler würde also nirgends auffallen — `eslint .` jedes Layers sieht sie
   * sehr wohl.
   */
  files: ['packages/*/scripts/migrations/**'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'CallExpression > MemberExpression[property.name="createIndex"]',
        message: 'Indizes in Migrationen NUR über createIndexSteps(tablesDB, databaseId) anlegen — der Cache-Anstoß gegen column_not_available gehört in die Schnittstelle, nicht in die Disziplin (CLAUDE.md, scripts/migrations-lib/indexRetry.mts).' },
    ],
  },
})
.append({
  /**
   * JEDER `$fetch`/`useFetch` NENNT SEINEN ANTWORTTYP (2026-08-14).
   *
   * Der Wächter zu der Entscheidung in `packages/core/nuxt.config.ts`
   * (`types:extend` leert Nitros `InternalApi`). Dort steht das WARUM samt
   * Messung; hier steht die Durchsetzung.
   *
   * KURZ: Nitros Routen-Typisierung ist aus, weil sie an JEDER Aufrufstelle
   * den Routen-Literal gegen ALLE Routen auflöst — Kosten `Aufrufstellen ×
   * Routen`, gemessen 92 % aller Typ-Instanziierungen der Platform-App und die
   * Ursache jedes `TS2589`, das zuletzt fremde Dateien umwarf. Der Preis ist
   * genau diese Regel: ohne Ableitung liefert `$fetch('/api/x')` `unknown`.
   *
   * SIE GREIFT NUR, WO DAS ERGEBNIS AUCH GEBUNDEN WIRD — und das ist der
   * ganze Trick. Gemessen im Bestand: 111 der 114 `$fetch`-Aufrufe ohne
   * Typangabe stehen in ANWEISUNGSPOSITION (`await $fetch('/api/x', { method:
   * 'POST' })`) und werfen ihre Antwort weg. Dort ist eine erfundene
   * `<{ ok: boolean }>`-Angabe reines Rauschen: sie behauptet eine Form, die
   * niemand liest, und muss bei jeder Routen-Änderung mitgepflegt werden. Ein
   * Wächter, der 111 Stellen zu Lärm zwingt, wird abgeschaltet — und nimmt die
   * 3 echten Fälle mit.
   *
   * DIE 3 ECHTEN: `const payload = await $fetch('/api/…')` — `payload` ist
   * `unknown` und wandert weiter. TypeScript schweigt dazu, solange niemand ein
   * FELD daraus liest (`JSON.stringify(unknown)` ist erlaubt), genau deshalb
   * braucht es hier einen Wächter neben `strict`. Wird ein Feld gelesen, meldet
   * schon der Compiler `TS18046` — beim Umstellen waren das 6 Stellen in 2
   * Dateien, die der Typecheck von selbst gefunden hat.
   *
   * `useFetch` steht OHNE Einschränkung drin: sein Ergebnis wird über `data`
   * IMMER gelesen, eine Anweisungsposition gibt es dort nicht. Bestand: 0
   * Verstöße.
   *
   * NICHT ERFASST (bewusst): `$fetch.raw`/`$fetch.create` (MemberExpression,
   * anderer Rückgabetyp) und die aus `useRequestFetch()` gezogenen lokalen
   * Funktionen — deren NAME ist Konvention, kein Vertrag, und ein Selektor auf
   * einen Variablennamen wäre ein Wächter, den man durch Umbenennen abschaltet.
   * Sie tragen ihre Typangabe heute alle; wer dort eine vergisst, merkt es am
   * `unknown`.
   *
   * NUR `app/**`, UND DAS IST KEINE NACHLÄSSIGKEIT: `no-restricted-syntax` wird
   * von einem späteren Block ERSETZT, nicht ergänzt (Flat Config). Ein Glob,
   * der auch die `server`-Ordner der Layer fängt, hätte hier unten die
   * tablesDB-Sperre der gepoolten Layer (Block „EINE Datentür") ABGESCHALTET — also genau
   * den Wächter, an dem die Mandanten-Isolation hängt. Beim Bau dieser Regel
   * einmal so gebaut und am Gegentest gemerkt. Server-Code braucht sie ohnehin
   * nicht: dort steht kein einziger untypisierter `$fetch` (nachgemessen), und
   * die wenigen Aufrufe zeigen auf FREMDE Dienste, wo `<T, string>` schon
   * heute die richtige Angabe ist.
   */
  files: ['packages/*/app/**/*.{ts,vue}', 'apps/*/app/**/*.{ts,vue}'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'VariableDeclarator > CallExpression[callee.name="$fetch"]:not([typeArguments])',
        message: 'Ein gebundenes $fetch-Ergebnis braucht ein Typ-Argument: $fetch<AntwortTyp>(…). Nitros Routen-Ableitung ist bewusst aus (packages/core/nuxt.config.ts, types:extend) — ohne Angabe ist die Variable `unknown` und reist unbemerkt weiter. Antwort-Typ nach shared/types/ (CLAUDE.md).' },
      { selector: 'VariableDeclarator > AwaitExpression > CallExpression[callee.name="$fetch"]:not([typeArguments])',
        message: 'Ein gebundenes $fetch-Ergebnis braucht ein Typ-Argument: $fetch<AntwortTyp>(…). Nitros Routen-Ableitung ist bewusst aus (packages/core/nuxt.config.ts, types:extend) — ohne Angabe ist die Variable `unknown` und reist unbemerkt weiter. Antwort-Typ nach shared/types/ (CLAUDE.md).' },
      { selector: 'CallExpression[callee.name="useFetch"]:not([typeArguments])',
        message: 'useFetch braucht ein Typ-Argument: useFetch<AntwortTyp>(…). Nitros Routen-Ableitung ist bewusst aus (packages/core/nuxt.config.ts, types:extend) — ohne Angabe ist `data` vom Typ `unknown`. Antwort-Typ nach shared/types/ (CLAUDE.md).' },
    ],
  },
})
.append({
  /**
   * KEINE RÜCKFRAGE ÜBER DAS FENSTER DES BROWSERS (UI-005, Q14). `confirm()`,
   * `alert()` und `prompt()` folgen weder Farbwelt noch Sprache der Seite und
   * sehen in jedem Browser anders aus. Der Weg ist `useConfirm()` (Dialog
   * `CoreConfirmDialog`, mit Doppelklick-Schutz über `action`); ein Hinweis
   * ist ein Toast. Eine Variable namens `confirm` (`const confirm =
   * useConfirm()`) ist erlaubt — die Regel trifft nur den globalen Namen.
   */
  files: ['packages/*/app/**/*.{ts,vue}', 'apps/*/app/**/*.{ts,vue}'],
  rules: {
    'no-restricted-globals': ['error',
      ...['confirm', 'alert', 'prompt'].map(name => ({ name, message: `Kein ${name}() des Browsers (UI-005, Q14): Rückfragen über useConfirm() (CoreConfirmDialog), Hinweise über useToast().` })),
    ],
    'no-restricted-properties': ['error',
      ...['confirm', 'alert', 'prompt'].map(property => ({ object: 'window', property, message: `Kein window.${property}() (UI-005, Q14): Rückfragen über useConfirm() (CoreConfirmDialog), Hinweise über useToast().` })),
    ],
  },
})
.append({
  /**
   * KEIN STILLES `.catch` IM SERVER-CODE (Q13) — Regel und Begründung stehen
   * oben am Plugin (`no-silent-catch`). Das Plugin wird hier noch einmal
   * genannt, weil der Block oben nur `packages/**` kennt und die Server-Ordner
   * der Apps dazugehören. Tests sind ausgenommen: dort ist ein geschluckter
   * Fehler oft genau die Probe.
   */
  files: ['packages/*/server/**/*.ts', 'apps/*/server/**/*.ts'],
  ignores: ['**/*.test.ts', '**/tests/**'],
  plugins: { pukalani: pukalaniPlugin },
  rules: {
    'pukalani/no-silent-catch': 'error',
  },
})
