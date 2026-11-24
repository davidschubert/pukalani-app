/**
 * KM1 — PROBE: TRÄGT EIN GÜNSTIGERES TEXTMODELL DIE AUFGABEN DER APP?
 * Plan: docs/plans/KI-TEXTMODELL-WECHSEL.md
 *
 * ── WAS DAS SKRIPT TUT ───────────────────────────────────────────────────
 * Es stellt fünf Text-Aufgaben der App mit einer festen, ERFUNDENEN
 * Beispiel-Eingabe nach (keine Kundendaten) und lässt jede mit dem heutigen
 * und dem Kandidaten-Modell laufen. Prompt, `temperature`, `max_tokens` und
 * die Prüfung der Antwort kommen aus dem ECHTEN Code (per jiti geladen), nicht
 * aus einer Kopie — ändert sich ein Prompt, misst die Probe den neuen.
 * Ergebnis: `ergebnis.json` und `vergleich.md` (alt und neu nebeneinander) im
 * Ausgabe-Ordner, dazu eine Tabelle auf der Konsole.
 *
 * Die Bewertung je Aufgabe ist dieselbe Frage, die die App stellt: übersteht
 * die Antwort die Prüfung, mit der die Route sie annimmt (Klemmung, Schema)?
 * Dazu: war die Antwort abgeschnitten (`finish_reason: length`)? Brauchte das
 * JSON die Reparatur? Ob der TON stimmt, misst kein Skript — dafür liegt
 * `vergleich.md` zum Lesen da.
 *
 * Nicht in der Probe (Grund im Plan): die Aufgaben, deren Prompt in einer
 * Route steckt (Moderations-Hilfe, Tickets, Kategorien, UGC-Übersetzen —
 * dafür gibt es eigene Skripte), der Markenberater (Stream, eigenes Skript)
 * und der Marktvergleich (`market-library-compute.mjs`).
 *
 * ── TROCKEN IST DER STANDARD ─────────────────────────────────────────────
 * Ohne `--live` ruft das Skript NIEMANDEN an: es nimmt je Aufgabe eine
 * gestellte Antwort und führt sie durch dieselbe Prüfung — damit ist bewiesen,
 * dass Prompts laden und die Prüfung greift. Mit `--live` zeigt es zuerst die
 * geschätzten Höchstkosten und bricht ab, wenn sie über `--max-usd` (Standard
 * 1) liegen. Gerufen wird mit DERSELBEN Bindung wie jeder Text-Aufruf der App
 * (`buildAiRequestBody` aus dem Core-Transport; das Skript prüft vor dem Senden,
 * dass die Bindung wörtlich die unten genannte ist).
 *
 * AUFRUF:
 *   node scripts/ki-modell-probe.mjs                       # trocken
 *   node scripts/ki-modell-probe.mjs --live --env-file apps/comments/.env
 *   node scripts/ki-modell-probe.mjs --live --runs 3 --only insights-draft
 *
 * SCHALTER: `--live` · `--runs N` (Wiederholungen je Aufgabe und Modell,
 * Standard 1) · `--only <id,id>` · `--models <alt,neu>` · `--max-usd <zahl>` ·
 * `--out <ordner>` · `--reasoning <stufe>` (schickt `reasoning.effort` mit — NUR
 * zum Messen, der Transport der App kennt das nicht) · `--env-file <datei>` (liest NUR `NUXT_AI_KEY`, gibt ihn nie
 * aus; sonst gilt die Umgebungsvariable `NUXT_AI_KEY`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// jiti liegt nicht im Wurzel-Paket; brand führt es schon (kein neues Paket).
const { createJiti } = createRequire(join(ROOT, 'packages/brand/package.json'))('jiti')
const jiti = createJiti(import.meta.url)
const load = path => jiti.import(join(ROOT, path))

const { values: args } = parseArgs({
  options: {
    'live': { type: 'boolean', default: false },
    'runs': { type: 'string', default: '1' },
    'only': { type: 'string' },
    'models': { type: 'string', default: 'anthropic/claude-haiku-4.5,anthropic/claude-haiku-5.5' },
    'max-usd': { type: 'string', default: '1' },
    'out': { type: 'string' },
    'env-file': { type: 'string' },
    'reasoning': { type: 'string' },
  },
})

/**
 * PREISE IN EUROPA je Million Tokens (Eingabe, Ausgabe), gelesen am
 * 2026-11-22 aus der öffentlichen Endpunkt-Liste des Vermittlers
 * (`eu.openrouter.ai/api/v1/models/<slug>/endpoints`). Nur für die SCHÄTZUNG
 * vor dem Lauf; die echten Kosten meldet der Vermittler je Antwort (`usage.cost`).
 */
const PRICES = {
  'anthropic/claude-haiku-4.5': { input: 1.1, output: 5.5 },
  'anthropic/claude-haiku-5.5': { input: 0.11, output: 0.55 },
}

/** Die Bindung jedes Text-Aufrufs (`core/shared/aiProviderRouting.ts`), wörtlich. */
const EXPECTED_PROVIDER = {
  zdr: true,
  data_collection: 'deny',
  only: ['amazon-bedrock/eu-west-1', 'google-vertex/europe'],
  allow_fallbacks: false,
}

const BASE_URL = (process.env.NUXT_AI_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')

// ── Der echte Code ─────────────────────────────────────────────────────────

const { buildAiRequestBody } = await load('packages/core/server/utils/aiComplete.ts')
const { parseModelJson } = await load('packages/core/shared/aiJson.ts')
const { BRAND_DNA_SYSTEM_PROMPT, brandDnaPrompt } = await load('packages/brand/server/utils/dnaPrompt.ts')
const { BRAND_MARK_BRIEF_SYSTEM_PROMPT, brandMarkBriefPrompt } = await load('packages/brand/server/utils/markPrompt.ts')
const { clampBrandDnaProposal } = await load('packages/brand/shared/brandDesignDna.ts')
const { clampBrandMarkBrief } = await load('packages/brand/shared/brandDesignMark.ts')
const { BRAND_DNA_DIMENSIONS } = await load('packages/brand/shared/brandDesignVocab.ts')
const insightsPrompts = await load('packages/insights/shared/insightsPrompts.ts')
const { insightsDraftMaxTokens } = await load('packages/insights/shared/insightsDraftBudget.ts')

// ── Die erfundenen Beispiel-Eingaben ───────────────────────────────────────
// Eine Bäckerei, die es nicht gibt, und eine Marke „Musterwerk", die es nicht gibt.

const FOUNDATION = [
  { label: 'Purpose', value: 'Wir backen Brot mit langer Teigführung, damit ein Laib eine Woche frisch bleibt und weniger weggeworfen wird.' },
  { label: 'Zielgruppe', value: 'Berufstätige Familien im Viertel, die einmal pro Woche einkaufen und Wert auf Herkunft legen.' },
  { label: 'Werte', value: 'Geduld, Handwerk, Ehrlichkeit über Zutaten, keine Rabattschlachten.' },
  { label: 'Tonalität', value: 'Ruhig, warm, konkret. Wir duzen. Keine Superlative.' },
]

const INSIGHTS_POST = {
  baseLocale: 'de',
  titleDe: 'Warum Musterwerk seine Verpackung grau macht',
  titleEn: '',
  dekDe: 'Ein Werkzeughersteller verzichtet auf Farbe. Was steckt dahinter?',
  dekEn: '',
  bodyDe: [
    'Musterwerk hat im Frühjahr alle Verpackungen auf ein einheitliches Grau umgestellt.',
    '',
    '## Was hat sich geändert?',
    '',
    'Früher trug jede Produktlinie eine eigene Farbe. Heute steht nur noch der Name auf grauem Karton.',
    '',
    '> „Das Werkzeug soll auffallen, nicht die Schachtel", sagt die Gestaltungsleitung.',
    '',
    'Was meint ihr: Ist weniger Farbe mutig oder langweilig?',
  ].join('\n'),
  bodyEn: '',
}

const TASKS = [
  {
    id: 'brand-dna',
    label: 'Marke: DNA-Vorschlag',
    system: BRAND_DNA_SYSTEM_PROMPT,
    prompt: () => brandDnaPrompt({ contentLocale: 'de', foundation: FOUNDATION, readings: [] }),
    temperature: 0.2, // Transport-Standard (brandDnaProposal.ts setzt keine)
    maxTokens: 3000, // BRAND_DNA_MAX_TOKENS in brandDnaProposal.ts (nicht exportiert)
    check(value) {
      const clamped = clampBrandDnaProposal(value, false)
      return clamped.missing.length === 0
        ? { ok: true, note: `${clamped.entries.length} Zeilen` }
        : { ok: false, note: `${clamped.missing.length} Dimensionen fehlen` }
    },
    canned: () => ({
      dna: BRAND_DNA_DIMENSIONS.map(d => ({ dimension: d.id, value: d.values[0].id, origin: 'foundation', reason: 'Folgt aus „Geduld, Handwerk".' })),
    }),
  },
  {
    id: 'mark-brief',
    label: 'Marke: Zeichen-Brief',
    system: BRAND_MARK_BRIEF_SYSTEM_PROMPT,
    prompt: () => brandMarkBriefPrompt({
      contentLocale: 'de',
      brandName: 'Kornfeld',
      foundation: FOUNDATION,
      dna: ['contrast: soft (weich)', 'energy: calm (ruhig)'],
      kind: 'word (Wortmarke)',
      settled: ['Schriftpaar: eine Serif für Überschriften, eine Grotesk für Text', 'Farbwelt: Roggenbraun mit hellem Mehlweiß'],
      clearSpace: 'Schutzraum: die Höhe des K rundum.',
      variants: 'Varianten: hell, dunkel, einfarbig.',
    }),
    temperature: 0.2,
    maxTokens: 1200, // BRAND_MARK_BRIEF_MAX_TOKENS in brandMarkBrief.ts
    check(value) {
      const clamped = clampBrandMarkBrief(value, 'K', 'de')
      return clamped.brief ? { ok: true, note: 'vier Felder' } : { ok: false, note: `fehlt: ${clamped.missing.join(', ')}` }
    },
    canned: () => ({ character: 'Ruhig und warm.', formLanguage: 'Weiche Serifen.', noGos: 'Keine Ähren.', places: 'Tüte, Schild, Website.' }),
  },
  {
    id: 'insights-draft',
    label: 'Insights: Entwurf',
    prompt: () => insightsPrompts.buildInsightsDraftPrompt({
      format: 'article',
      baseLocale: 'de',
      brief: 'Musterwerk (erfundener Werkzeughersteller) hat alle Verpackungen auf Grau umgestellt. Erkläre, was das über die Marke sagt.',
      targetWords: 400,
      brandNames: ['Musterwerk'],
    }),
    temperature: 0.5, // draft.post.ts
    maxTokens: insightsDraftMaxTokens(400),
    check: value => schemaCheck(insightsPrompts.insightsAiTextSchema, value),
    canned: () => ({ title: 'Warum Grau?', dek: 'Ein Vorspann.', body: 'Text.\n\nWas meint ihr?' }),
  },
  {
    id: 'insights-translate',
    label: 'Insights: Übersetzung',
    prompt: () => insightsPrompts.buildInsightsTranslatePrompt(INSIGHTS_POST, 'en'),
    temperature: 0.2,
    maxTokens: 8000, // translate.post.ts
    check: value => schemaCheck(insightsPrompts.insightsAiTextSchema, value),
    canned: () => ({ title: 'Why grey?', dek: 'A dek.', body: 'Text.' }),
  },
  {
    id: 'insights-change-note',
    label: 'Insights: Änderungsnotiz',
    prompt: () => insightsPrompts.buildInsightsChangeNotePrompt({
      texts: [{ field: 'body', locale: 'de', removed: ['Früher trug jede Produktlinie eine eigene Farbe.'], added: ['Bis 2025 trug jede Produktlinie eine eigene Farbe.'] }],
      sources: [{ change: 'added', publisher: 'Musterwerk Pressestelle', url: 'https://example.com/presse', quote: 'Grau ist unsere neue Bühne.' }],
      facts: { changed: false, count: 0 },
      ranking: { changed: false, count: 0 },
    }),
    temperature: 0.2,
    maxTokens: 800, // change-note.post.ts
    check(value) {
      const note = insightsPrompts.insightsChangeNoteSuggestionSchema.parse(value)
      return note.de && note.en ? { ok: true, note: `${note.de.length}/${note.en.length} Zeichen` } : { ok: false, note: 'de oder en leer' }
    },
    canned: () => ({ de: 'Jahreszahl ergänzt.', en: 'Added the year.' }),
  },
]

function schemaCheck(schema, value) {
  const parsed = schema.safeParse(value)
  return parsed.success
    ? { ok: true, note: `${parsed.data.body.length} Zeichen Text` }
    : { ok: false, note: parsed.error.issues.map(issue => issue.path.join('.') || issue.message).join(', ') }
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

const runs = Math.max(1, Number.parseInt(args.runs, 10) || 1)
const models = args.models.split(',').map(model => model.trim()).filter(Boolean)
const only = args.only ? new Set(args.only.split(',').map(id => id.trim())) : null
const tasks = TASKS.filter(task => !only || only.has(task.id))
if (!tasks.length) throw new Error(`--only trifft keine Aufgabe (bekannt: ${TASKS.map(t => t.id).join(', ')})`)

/** Grobe Schätzung: etwa 3,5 Zeichen je Token; Ausgabe höchstens die Decke. */
function estimate() {
  let max = 0
  for (const model of models) {
    const price = PRICES[model]
    if (!price) throw new Error(`Kein Preis für ${model} hinterlegt — erst in PRICES eintragen.`)
    for (const task of tasks) {
      const input = Math.ceil(((task.system ?? '').length + task.prompt().length) / 3.5)
      max += runs * ((input / 1e6) * price.input + (task.maxTokens / 1e6) * price.output)
    }
  }
  return max
}

function readKey() {
  if (args['env-file']) {
    const line = readFileSync(resolve(args['env-file']), 'utf8').split('\n').find(l => l.startsWith('NUXT_AI_KEY='))
    return line ? line.slice('NUXT_AI_KEY='.length).trim().replace(/^["']|["']$/g, '') : ''
  }
  return process.env.NUXT_AI_KEY ?? ''
}

async function call(key, model, task) {
  const body = buildAiRequestBody({ model, prompt: task.prompt(), system: task.system, temperature: task.temperature, maxTokens: task.maxTokens })
  if (!isDeepStrictEqual(body.provider, EXPECTED_PROVIDER)) throw new Error('Bindung weicht ab — Abbruch vor dem Senden')
  body.usage = { include: true } // der Vermittler meldet die Kosten je Antwort
  // Seit KM1 setzt der Core-Rumpf für gemessene Modelle selbst `reasoning: none`
  // (`AI_TEXT_MODELS_REASONING_OFF`); `--reasoning` überschreibt das nur zum Messen.
  if (args.reasoning) body.reasoning = { effort: args.reasoning }
  const started = Date.now()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - started
  // Nur Status und Kennungen, nie den Fehlerrumpf (er kann den Prompt zitieren).
  if (!res.ok) return { status: res.status, ms, text: '', finish: '', provider: '', cost: 0, tokensIn: 0, tokensOut: 0, tokensReasoning: 0 }
  const data = await res.json()
  return {
    status: res.status,
    ms,
    text: data?.choices?.[0]?.message?.content ?? '',
    finish: data?.choices?.[0]?.finish_reason ?? '',
    provider: data?.provider ?? '',
    cost: Number(data?.usage?.cost ?? 0),
    tokensIn: Number(data?.usage?.prompt_tokens ?? 0),
    tokensOut: Number(data?.usage?.completion_tokens ?? 0),
    // Denk-Tokens zählen als Ausgabe: sie kosten und füllen `max_tokens`, ohne im Text zu stehen.
    tokensReasoning: Number(data?.usage?.completion_tokens_details?.reasoning_tokens ?? 0),
  }
}

function judge(task, response) {
  if (response.status !== 200) return { ok: false, note: `HTTP ${response.status}` }
  const truncated = response.finish === 'length'
  const parsed = parseModelJson(response.text)
  if (!parsed) return { ok: false, note: 'kein JSON', truncated }
  try {
    const result = task.check(parsed.value)
    return { ...result, repaired: parsed.repaired, truncated }
  }
  catch {
    return { ok: false, note: 'Prüfung warf', truncated }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = resolve(args.out ?? join(tmpdir(), `ki-modell-probe-${stamp}`))
const max = estimate()

console.log(`KM1-Probe — ${args.live ? 'ECHTER LAUF' : 'Trockenlauf (gestellte Antworten, kein Aufruf)'}`)
console.log(`Modelle: ${models.join(' · ')} · Aufgaben: ${tasks.length} · Wiederholungen: ${runs}`)
console.log(`Geschätzte Höchstkosten eines echten Laufs: ${max.toFixed(3)} $ (Ausgabe voll bis zur Decke; erwartet deutlich weniger)`)

let key = ''
if (args.live) {
  const cap = Number(args['max-usd'])
  if (!(max <= cap)) {
    console.error(`Abbruch: Schätzung ${max.toFixed(3)} $ liegt über --max-usd ${cap}.`)
    process.exit(1)
  }
  key = readKey()
  if (!key) {
    console.error('Abbruch: kein NUXT_AI_KEY (Umgebung oder --env-file).')
    process.exit(1)
  }
}

const results = []
for (const task of tasks) {
  for (const model of models) {
    for (let run = 1; run <= runs; run++) {
      const response = args.live
        ? await call(key, model, task)
        : { status: 200, ms: 0, text: JSON.stringify(task.canned()), finish: 'stop', provider: 'gestellt', cost: 0, tokensIn: 0, tokensOut: 0, tokensReasoning: 0 }
      const verdict = judge(task, response)
      results.push({ task: task.id, label: task.label, model, run, ...response, verdict })
      console.log(`${verdict.ok ? 'OK  ' : 'ROT '} ${task.id.padEnd(22)} ${model.padEnd(28)} #${run} ${verdict.note}${verdict.truncated ? ' · ABGESCHNITTEN' : ''}${verdict.repaired ? ' · repariert' : ''}${args.live ? ` · ${response.provider} · ${response.tokensOut} aus (${response.tokensReasoning} Denken) · ${response.cost.toFixed(4)} $` : ''}`)
    }
  }
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'ergebnis.json'), `${JSON.stringify({ live: args.live, models, runs, results }, null, 2)}\n`)

const md = [`# KM1-Probe ${stamp}${args.live ? '' : ' (trocken)'}`, '']
md.push('| Aufgabe | Modell | bestanden | abgeschnitten | repariert | Tokens aus | davon Denken | Kosten $ |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const task of tasks) {
  for (const model of models) {
    const rows = results.filter(r => r.task === task.id && r.model === model)
    const sum = key => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
    md.push(`| ${task.label} | ${model} | ${rows.filter(r => r.verdict.ok).length}/${rows.length} | ${rows.filter(r => r.verdict.truncated).length} | ${rows.filter(r => r.verdict.repaired).length} | ${sum('tokensOut')} | ${sum('tokensReasoning')} | ${sum('cost').toFixed(4)} |`)
  }
}
md.push('', '## Antworten nebeneinander (erste Wiederholung)', '')
for (const task of tasks) {
  md.push(`### ${task.label}`, '')
  for (const model of models) {
    const first = results.find(r => r.task === task.id && r.model === model)
    md.push(`**${model}**`, '', '```', first?.text ?? '', '```', '')
  }
}
writeFileSync(join(outDir, 'vergleich.md'), `${md.join('\n')}\n`)

const total = results.reduce((acc, r) => acc + r.cost, 0)
const failed = results.filter(r => !r.verdict.ok).length
console.log(`\n${results.length - failed}/${results.length} bestanden${args.live ? ` · bezahlt laut Vermittler: ${total.toFixed(4)} $` : ''}`)
console.log(`Ergebnis: ${outDir}`)
// Rot nur im Trockenlauf: dort heißt es „Prompt oder Prüfung kaputt". Im echten
// Lauf ist ein durchgefallenes Modell ein BEFUND, kein Skriptfehler.
if (!args.live && failed) process.exit(1)
