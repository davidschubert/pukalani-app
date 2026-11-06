/**
 * DIE LESE-FASSUNG DER 68 SESSIONS — Davids Gegenlese-Gate (BW2 Paket 2,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §15 „David liest gegen").
 *
 * ── WARUM EIN GENERATOR UND KEIN GEPFLEGTES DOKUMENT ──────────────────────
 * Der Inhalt der Sessions ist CODE (`shared/sessionContent.ts`) — dort steht
 * er einmal, dort liest ihn der Prompt-Bauer, dort prüft ihn die Registry. Ein
 * zweites, von Hand gepflegtes Markdown daneben wäre am zweiten Tag falsch,
 * und niemand sähe welches von beiden. Also: EINE Quelle, EIN Erzeugnis, und
 * ein Test, der beweist, dass das Erzeugnis aktuell ist (Muster
 * `check:themes` aus dem themes-Layer).
 *
 * Erzeugt `docs/referenz/BRAND-WIZARD-SESSION-INHALTE.md`.
 *
 * ── DIE DATEI IST FÜR EINEN MENSCHEN, NICHT FÜR EIN MODELL ────────────────
 * Deshalb steht dort die deutsche Feld-Bezeichnung aus dem Locale-Katalog
 * neben der Id, deshalb sind die Beispiele in BEIDEN Sprachen zu sehen (die
 * Abnahme-Seite zeigt sie später genauso, Plan §5a), und deshalb steht unter
 * jeder Session der mechanische Satz „fliesst später in …" aus
 * `sessionsAffectedBy` — die Frage „wofür brauchen wir das?" beantwortet die
 * Abhängigkeits-Hülle, nicht eine gepflegte Liste (§3a).
 *
 * ── AUFRUF ────────────────────────────────────────────────────────────────
 *   pnpm --filter @pukalani/brand print:sessions            schreibt die Datei
 *   pnpm --filter @pukalani/brand check:sessions            prüft nur (CI/Test)
 *
 * `--check` schreibt NICHT, sondern endet mit Exit 1, wenn die Datei im Baum
 * von der erzeugten abweicht — dieselbe Mechanik wie `check:themes`.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BRAND_ADVISORS, techniqueForStep } from '../shared/brandAdvisors'
import { sessionsAffectedBy } from '../shared/brandSessions'
import {
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandSlot,
  type BrandStepKey,
  partKeyFor,
  slotLabelKeyFor,
} from '../shared/slotRegistry'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAYER_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(LAYER_ROOT, '..', '..')

export const SESSION_CONTENT_DOC = join(REPO_ROOT, 'docs', 'referenz', 'BRAND-WIZARD-SESSION-INHALTE.md')

type LocaleNode = string | { [key: string]: LocaleNode }

const de = JSON.parse(
  readFileSync(join(LAYER_ROOT, 'i18n', 'locales', 'de.json'), 'utf8'),
) as { brand: Record<string, LocaleNode> }

/**
 * Der deutsche Text zu einem Schlüssel — ohne jedes Raten: was ein Knoten mit
 * Kindern bedeutet, weiss die Registry (`slotLabelKeyFor`), und die Aufrufer
 * unten reichen bereits den fertigen Schlüssel herein.
 */
function localeText(key: string): string {
  let node: LocaleNode | undefined = de as unknown as LocaleNode
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return ''
    node = node[part]
  }
  return typeof node === 'string' ? node : ''
}

/**
 * DIE FASSUNG, DIE IM BAUM OBEN STEHT: Gründer-Pfad, „Nur ich". Beides ist der
 * Basis-Fall der Registry — die Relaunch-Fassung steht in der Content-Referenz
 * ohnehin nicht (sie hing nie im Baum), und die Team-Fassung bekommt seit der
 * Anrede-Runde ihre eigene Zeile darunter.
 */
function soloQuestion(session: BrandSlot): string {
  return localeText(slotLabelKeyFor(session, 'new', 'solo'))
}

const KIND_LABEL: Readonly<Record<BrandSlot['kind'], string>> = {
  ask: 'Frage',
  collect: 'Sammlung',
  choose: 'Auswahl',
  derive: 'Ableitung',
  draft: 'Entwurf',
  instrument: 'Instrument',
}

const SENSITIVITY_LABEL: Readonly<Record<BrandSlot['sensitivity'], string>> = {
  public: 'öffentlich',
  internal: 'intern — reist nicht per Share-Link',
  private: 'privat',
}

const PERSON_LABEL: Readonly<Record<BrandSlot['form']['person'], string>> = {
  we: 'wir',
  I: 'ich',
  brand: 'über die Marke',
  none: 'ohne Person',
  fromTeam: 'folgt der Weiche Solo/Team',
}

const TENSE_LABEL: Readonly<Record<BrandSlot['form']['tense'], string>> = {
  present: 'Präsens',
  future: 'Futur',
  any: 'frei',
}

const SUBSTANCE_LABEL = { short: 'kurz', medium: 'mittel', long: 'ausführlich' } as const

/** Mehrzeilige Beispiele bleiben mehrzeilig — als Zitatblock, sonst reisst die Liste. */
function exampleBlock(text: string): string {
  return text.split('\n').map(line => `  > ${line}`).join('\n')
}

function bulletList(items: readonly string[]): string {
  return items.map(item => `- ${item}`).join('\n')
}

function invariantText(session: BrandSlot): string {
  if (session.invariants.length === 0) return '—'
  return session.invariants.map((invariant) => {
    switch (invariant.kind) {
      case 'count': return `zwischen ${invariant.min ?? '?'} und ${invariant.max ?? '?'} Einträgen`
      case 'subsetOf': return `jede Zeile stammt aus \`${invariant.of}\``
      case 'memberOf': return `der Wert steht in \`${invariant.of}\``
      case 'sentenceOf': return `der Wert ist ein Satz aus \`${invariant.of}\``
      case 'mentionsNone': {
        const terms = (invariant.terms ?? []).join(', ')
        if (invariant.of === undefined) return `nennt keines von: ${terms}`
        return terms
          ? `nennt weder \`${invariant.of}\` noch: ${terms}`
          : `nennt nicht dasselbe wie \`${invariant.of}\``
      }
      case 'mentionsFrom':
        return invariant.min === undefined
          ? `nennt JEDEN Eintrag aus \`${invariant.of}\``
          : `nennt mindestens ${invariant.min} Einträge aus \`${invariant.of}\``
      // Die zwei Invarianten OHNE Quell-Slot (Brand Design D3/D4). `hex` fehlte
      // hier seit D3: der Zweig gab `undefined` zurück, und im Baum stand für
      // `h.base` eine LEERE Zeile statt der Regel — sichtbar erst, als D4 die
      // zweite quellenlose Art dazulegte.
      case 'hex': return 'der Wert ist eine Farbe (`#rrggbb`)'
      case 'oneOf': return `der Wert ist eine Id aus: ${(invariant.terms ?? []).join(', ')}`
    }
  }).join(' · ')
}

function formText(session: BrandSlot): string {
  const bits = [
    `Person: ${PERSON_LABEL[session.form.person]}`,
    `Zeit: ${TENSE_LABEL[session.form.tense]}`,
    session.form.maxWords === null ? 'kein Wortdeckel' : `höchstens ${session.form.maxWords} Wörter`,
  ]
  if (session.form.forbidden.length) bits.push(`nie darin: ${session.form.forbidden.join('; ')}`)
  return bits.join(' · ')
}

function answersText(session: BrandSlot): string {
  const bits = [
    `Mindest-Substanz: ${SUBSTANCE_LABEL[session.answers.minSubstance]}`,
    `Nachfragen: höchstens ${session.answers.maxProbes}`,
    session.answers.allowUnknown ? '„weiss nicht" gilt' : '„weiss nicht" gilt hier nicht',
    session.answers.allowDefer ? 'vertagen möglich' : 'nicht vertagbar',
  ]
  return bits.join(' · ')
}

/** „Fliesst später in …" — mechanisch aus der Abhängigkeits-Hülle (§3a, §9). */
function downstreamText(session: BrandSlot): string {
  const affected = sessionsAffectedBy(session.id)
  if (affected.transitive.length === 0) {
    return 'nichts — eine Korrektur hier löst keine Warteschlange aus'
  }
  const chapters = (Object.keys(affected.byStep) as BrandStepKey[])
    .sort((a, b) => BRAND_STEP_KEYS.indexOf(a) - BRAND_STEP_KEYS.indexOf(b))
    .map(stepKey => localeText(`brand.steps.${stepKey}`))
  // Mit Komma getrennt wäre die Liste eine Falle: „Purpose, Vision & Mission"
  // ist EIN Kapitelname und sähe darin aus wie zwei.
  return `${affected.transitive.length} Felder in ${chapters.length} Kapiteln (${chapters.join(' · ')})`
}

function sessionBlock(session: BrandSlot): string {
  const label = soloQuestion(session)
  const lines: string[] = [
    `### \`${session.id}\`${label ? ` — ${label}` : ''}`,
    '',
    `**Art:** ${KIND_LABEL[session.kind]}${session.required ? '' : ' (optional)'} · `
    + `**Umfang:** ~${session.effort.minutes} Min, ${session.effort.turns} Züge · `
    + `**Vertraulichkeit:** ${SENSITIVITY_LABEL[session.sensitivity]}`,
    '',
    `**Ziel:** ${session.goal}`,
    '',
  ]

  // Eine Session mit TEAM-FASSUNG hat zwei Wortlaute (Weiche W3) — die
  // Überschrift zeigt nur den ersten. Wer gegenliest, muss beide sehen.
  if (session.teamVariant) {
    lines.push(
      `**Fassung im Team:** ${localeText(slotLabelKeyFor(session, 'new', 'team'))}`,
      '',
    )
  }

  lines.push(
    '**Woran man einen guten Wert erkennt:**',
    '',
    bulletList(session.quality),
    '',
    '**Was zurückgewiesen wird:**',
    '',
    bulletList(session.antiPatterns),
    '',
  )

  if (session.parts.length > 0) {
    lines.push(
      '**Teile (nacheinander gefragt):**',
      '',
      // DIESELBE REGEL WIE BEI DER SESSION-FRAGE (s. o.): ein Teil mit eigener
      // Fassung je Weiche W3 hat ZWEI Wortlaute, und wer gegenliest, muss
      // beide sehen. `partKeyFor` sagt, welcher Teil das betrifft.
      bulletList(session.parts.map(part => (session.teamParts?.includes(part)
        ? `\`${part}\` — ${localeText(partKeyFor(session, part, 'solo'))} `
          + `· im Team: ${localeText(partKeyFor(session, part, 'team'))}`
        : `\`${part}\` — ${localeText(partKeyFor(session, part))}`))),
      '',
    )
  }

  if (session.ladder.opening) {
    lines.push('**Gesprächsleiter:**', '')
    lines.push(`- Eröffnung: ${session.ladder.opening}`)
    for (const probe of session.ladder.probes) lines.push(`- Nachfrage: ${probe}`)
    for (const reframe of session.ladder.reframes) lines.push(`- Umdeutung: ${reframe}`)
    lines.push('')
  }

  lines.push(
    `**Form des Werts:** ${formText(session)}`,
    '',
    `**Antwort-Regeln:** ${answersText(session)}`,
    '',
    `**Invarianten (im Code geprüft):** ${invariantText(session)}`,
    '',
    `**Fliesst später in:** ${downstreamText(session)}`,
    '',
  )

  const hasExamples = (['new', 'relaunch'] as const)
    .some(path => session.examples[path].de.length > 0 || session.examples[path].en.length > 0)
  if (hasExamples) {
    lines.push('**Beispiele** (erfunden, fremde Branche — für die Form, nie für den Inhalt):', '')
    for (const [path, title] of [['new', 'Neue Marke'], ['relaunch', 'Marken-Relaunch']] as const) {
      const set = session.examples[path]
      if (set.de.length === 0 && set.en.length === 0) continue
      lines.push(`- **${title}**`)
      for (const text of set.de) lines.push(`  - de:\n${exampleBlock(text)}`)
      for (const text of set.en) lines.push(`  - en:\n${exampleBlock(text)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function renderSessionContentMarkdown(): string {
  const parts: string[] = [
    '# Brand-Wizard — die Inhalte der 68 Sessions',
    '',
    '**GENERIERT aus `packages/brand/shared/sessionContent.ts` — nicht von Hand editieren.**',
    'Korrekturen gehören in die Registry, danach `pnpm --filter @pukalani/brand print:sessions`.',
    'Ein Test hält beides zusammen: Regenerieren darf keinen Diff erzeugen.',
    '',
    'Struktur und Begründung: [BRAND-WIZARD-SESSIONS.md](../archiv/BRAND-WIZARD-SESSIONS.md) §3/§3a ·',
    'Inhaltsgrundlage: [BRAND-WIZARD-CONTENT-SPEC.md](../plans/BRAND-WIZARD-CONTENT-SPEC.md).',
    '',
    'Die Ziel-, Qualitäts- und Anti-Muster-Texte sind ENGLISCH: sie reisen wörtlich in den',
    'Prompt (Content-Spec §1.2 — sie beschreiben Verhalten, nicht Text). Die Beispiele stehen',
    'in beiden Oberflächen-Sprachen, weil die Abnahme-Seite je Kapitel sie dem Kunden zeigt.',
    '',
  ]

  for (const stepKey of BRAND_STEP_KEYS) {
    const sessions = BRAND_SLOTS.filter(slot => slot.stepId === stepKey && !slot.deactivated)
    if (sessions.length === 0) continue
    const technique = techniqueForStep(stepKey)
    const advisor = BRAND_ADVISORS.find(entry => entry.key === technique.key)!
    const minutes = sessions.reduce((sum, session) => sum + session.effort.minutes, 0)
    const turns = sessions.reduce((sum, session) => sum + session.effort.turns, 0)
    parts.push(
      `## ${localeText(`brand.steps.${stepKey}`)} (\`${stepKey}\`) — ${sessions.length} Sessions, `
      + `**Σ ~${minutes} Min** (${turns} Züge)`,
      '',
      `Interview-Technik: **${advisor.name}** (${advisor.role.de}). Gesprochen wird alles von George.`,
      '',
    )
    for (const session of sessions) parts.push(sessionBlock(session))
  }

  parts.push(pathTotals())

  return `${parts.join('\n').trimEnd()}\n`
}

/**
 * DIE ZWEI ZAHLEN, DIE DER KUNDE ALS ERSTES SIEHT (Paket 2b, Davids
 * Entscheidung 2026-09-04: „halbieren, in Kapitel-Etappen kommunizieren").
 *
 * Sie stehen am ENDE der Lese-Fassung und nicht in einer gepflegten Tabelle:
 * eine Summe, die jemand von Hand fortschreibt, ist beim zweiten Umfang falsch.
 * Der Basispfad lässt Markenarchitektur (nur bei Untermarken) und Name (nur
 * ohne Namen) weg — beides sind Zusatz-Kapitel hinter einer Weiche.
 */
function pathTotals(): string {
  const OPTIONAL: readonly BrandStepKey[] = ['architecture', 'naming']
  const active = BRAND_SLOTS.filter(slot => !slot.deactivated)
  const sum = (slots: readonly BrandSlot[]) => ({
    minutes: slots.reduce((total, slot) => total + slot.effort.minutes, 0),
    turns: slots.reduce((total, slot) => total + slot.effort.turns, 0),
  })
  const base = sum(active.filter(slot => !OPTIONAL.includes(slot.stepId)))
  const full = sum(active)
  return [
    '## Umfang insgesamt',
    '',
    `- **Basispfad** (ohne Markenarchitektur, ohne Name): ~${base.minutes} Min · ${base.turns} Züge`,
    `- **Vollpfad** (mit beiden): ~${full.minutes} Min · ${full.turns} Züge`,
    '',
    'Die Zahl je Session ist eine SCHÄTZUNG der aktiven Zeit, nicht der Sitzungsdauer;',
    'kommuniziert wird sie als Kapitel-Etappe („11 Sessions, ~14 Min"), damit sichtbar',
    'bleibt, dass man aufhören und zurückkommen kann.',
    '',
  ].join('\n')
}

/**
 * NUR ALS PROGRAMM SCHREIBEN, NIE BEIM IMPORT.
 *
 * Der Beweis (`tests/sessionContentDoc.test.ts`) importiert
 * `renderSessionContentMarkdown()` aus dieser Datei — ohne diese Klammer
 * schriebe ein Testlauf die Doku neu und wäre damit immer grün.
 */
const runAsProgram = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (runAsProgram) main()

function main(): void {
  const isCheck = process.argv.includes('--check')
  const markdown = renderSessionContentMarkdown()

  if (!isCheck) {
    writeFileSync(SESSION_CONTENT_DOC, markdown, 'utf8')
    console.log(`geschrieben: ${SESSION_CONTENT_DOC} (${markdown.split('\n').length} Zeilen)`)
    return
  }


  // Eine fehlende Datei ist derselbe Befund wie eine veraltete: „nicht auf dem
  // Stand" — deshalb der leere Rückfall statt eines eigenen Zweigs.
  let current: string
  try {
    current = readFileSync(SESSION_CONTENT_DOC, 'utf8')
  }
  catch {
    current = ''
  }
  if (current !== markdown) {
    console.error(
      'BRAND-WIZARD-SESSION-INHALTE.md ist nicht auf dem Stand von sessionContent.ts.\n'
      + 'Erzeugen mit: pnpm --filter @pukalani/brand print:sessions',
    )
    process.exit(1)
  }
  console.log('BRAND-WIZARD-SESSION-INHALTE.md ist aktuell.')
}
