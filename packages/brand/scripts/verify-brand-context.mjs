/**
 * H5 — TAUGT `brand.md` ALS SYSTEM-PROMPT? (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.13, Paket K3.)
 *
 * ── DIE HYPOTHESE, DIE HIER GEPRÜFT WIRD ─────────────────────────────────
 * §2.13 sagt: „ein Modell schreibt NUR mit `brand.md` einen Absatz, der
 * Dokument-Check bewertet ihn — Erwartung ‚im Ton' über der Schwelle,
 * Gegenprobe mit fremdem `brand.md` darunter." Das ist der einzige Beweis des
 * Produkts, den kein Unit-Test führen kann: ob die Datei einem MODELL etwas
 * sagt, sieht man erst, wenn eines damit schreibt.
 *
 * ── DER AUFBAU: EIN ABSATZ, ZWEI URTEILE ─────────────────────────────────
 *  1. Ein Modell bekommt Kailuas `brand.md` als System-Prompt und schreibt
 *     EINEN Absatz für die Startseite. Sonst bekommt es nichts — kein Beispiel,
 *     keinen Ton-Hinweis, keine zweite Runde.
 *  2. Derselbe Absatz wird ZWEIMAL bewertet: gegen Kailuas `brand.md`
 *     (Erwartung: über der Schwelle) und gegen ein FREMDES `brand.md` einer
 *     bewusst gegensätzlichen Marke (Erwartung: darunter). Die Gegenprobe ist
 *     der eigentliche Beweis — ein Urteil, das jeden Text lobt, ist keins.
 *
 * ── EINE ABWEICHUNG VOM KONZEPT, MIT GRUND ───────────────────────────────
 * Der DOKUMENT-CHECK (`brandCheckDocument`/`brandCheckJudge`) beantwortet eine
 * andere Frage: seine 24 Kriterien fragen, ob ein FUNDAMENT vollständig und
 * klar ist (Zielgruppe genannt? Purpose kurz und aktiv?) — nicht, ob ein
 * ABSATZ den Ton einer bestimmten Marke trifft. Auf einen 80-Wörter-Absatz
 * angewandt gäbe er ein Urteil über die falsche Sache ab. Der Ton-Richter hier
 * ist deshalb ein eigener, kurzer Prompt; er erbt vom Dokument-Check das
 * Wichtigste, nämlich die Regel „erfinde nichts, belege jedes Urteil am Text"
 * und die Antwort als striktes JSON. Wer den Katalog wirklich fahren will,
 * braucht dafür eine Marke mit Zeilen in der Datenbank — das ist ein
 * Live-Beweis (K8), kein Skript ohne Instanz.
 *
 * ── ER RUFT NUR AN, WENN ER DARF ─────────────────────────────────────────
 * Ohne Schlüssel bricht der Lauf SAUBER ab (Exit 0 mit Hinweis) statt rot zu
 * werden: er kostet Geld und läuft deshalb nur, wenn ihn jemand bewusst
 * startet. `--dry-run` zeigt die Prompts und ruft NICHTS an — damit lässt sich
 * prüfen, was das Modell zu sehen bekäme, ohne einen Token zu bezahlen.
 * Geroutet wird wie jeder Brand-Aufruf: ZDR, `data_collection: deny`, keine
 * Ausweich-Anbieter (`server/utils/brandProviderRouting.ts`).
 *
 * AUFRUF:
 *   pnpm --filter @pukalani/brand verify:context -- --dry-run
 *   NUXT_AI_KEY=… pnpm --filter @pukalani/brand verify:context
 *
 * ENV: `NUXT_AI_KEY` (Pflicht für den echten Lauf) · `NUXT_AI_BASE_URL`
 * (Default OpenRouter) · `NUXT_AI_MODEL` (Default `google/gemini-2.5-flash`,
 * dasselbe Modell, das branding.supply für Text-Urteile fährt).
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const jiti = createJiti(import.meta.url)

const DRY = process.argv.includes('--dry-run')
const KEY = process.env.NUXT_AI_KEY ?? ''
const BASE_URL = (process.env.NUXT_AI_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const MODEL = process.env.NUXT_AI_MODEL ?? 'google/gemini-2.5-flash'

/** Ab hier gilt ein Absatz als „im Ton" (§2.13). */
const THRESHOLD = 70
/** So weit muss die Gegenprobe darunter liegen, damit sie etwas beweist. */
const GAP = 15

function ok(message) {
  console.log(`✓ ${message}`)
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

// ── Die zwei Marken ────────────────────────────────────────────────────────

const { KAILUA_COFFEE_EXAMPLE } = await jiti.import(join(ROOT, 'shared/examples/kailuaCoffee.ts'))
const { KAILUA_COFFEE_DESIGN } = await jiti.import(join(ROOT, 'shared/examples/kailuaCoffeeDesign.ts'))
const { buildBrandFoundation } = await jiti.import(join(ROOT, 'shared/brandFoundation.ts'))
const { renderBrandContextMarkdown } = await jiti.import(join(ROOT, 'shared/brandContext.ts'))
const { formatBrandSlotList } = await jiti.import(join(ROOT, 'shared/brandSlotFormat.ts'))

/**
 * DIE FREMDE MARKE — bewusst das Gegenteil von Kailua: laut, superlativ,
 * Erlebnis-Wortschatz. Sie ist NICHT schlechter, sie ist ANDERS; genau das
 * macht sie zur Gegenprobe. Ihre Werte sind dieselben Sessions wie bei Kailua,
 * damit der Unterschied im TON liegt und nicht in der Menge.
 */
const RIVAL = {
  title: 'Voltaro Energy Bar',
  contentLocale: 'de',
  story: null,
  chapters: [
    {
      stepKey: 'context',
      slots: [
        {
          slotId: 'a.pitch',
          value: 'Voltaro ist der ultimative Performance-Riegel für Champions — '
            + 'maximaler Boost, jederzeit, überall.',
        },
        { slotId: 'a.category', value: 'Premium-Performance-Nutrition' },
      ],
    },
    {
      stepKey: 'values',
      slots: [
        { slotId: 'c.final', value: formatBrandSlotList(['Power', 'Speed', 'Dominanz']) },
      ],
    },
    {
      stepKey: 'archetype',
      slots: [
        { slotId: 'd.primary', value: 'hero' },
        { slotId: 'd.emotion', value: 'Unbesiegbar. Bereit für alles.' },
        {
          slotId: 'd.toneWords',
          value: formatBrandSlotList(['laut', 'kompromisslos', 'siegessicher']),
        },
        {
          slotId: 'd.vocabulary',
          value: formatBrandSlotList([
            'benutzen: maximaler Boost',
            'benutzen: Champions',
            'meiden: ruhig',
            'meiden: langsam',
          ]),
        },
      ],
    },
    {
      stepKey: 'verbal',
      slots: [
        { slotId: 'ep.taglines', value: formatBrandSlotList(['Push harder. Every single day.']) },
      ],
    },
  ],
}

const kailuaMd = renderBrandContextMarkdown(
  buildBrandFoundation(KAILUA_COFFEE_EXAMPLE),
  { title: 'Kailua Coffee Co.', locale: 'de', stand: '2026-09-09T10:00:00.000Z' },
  KAILUA_COFFEE_DESIGN ?? null,
)
const rivalMd = renderBrandContextMarkdown(
  buildBrandFoundation(RIVAL),
  { title: RIVAL.title, locale: 'de', stand: '2026-09-09T10:00:00.000Z' },
  null,
)

// ── Die zwei Aufträge ──────────────────────────────────────────────────────

const WRITE_TASK = 'Schreibe EINEN Absatz von höchstens 80 Wörtern für die Startseite: '
  + 'Die neue Saison-Röstung ist da. Nur der Absatz, keine Überschrift, keine Erklärung.'

/**
 * DER TON-RICHTER. Er bekommt die Marken-Datei und den Absatz — sonst nichts,
 * und vor allem nicht die Auskunft, WER den Absatz geschrieben hat: er soll
 * den Text messen, nicht seine Herkunft.
 */
const JUDGE_RULES = [
  'Du bewertest, ob ein Absatz im Ton der Marke geschrieben ist, deren Brand Context du bekommst.',
  'Bewerte NUR den Ton, den Wortschatz und die Haltung — nicht Rechtschreibung, nicht Länge.',
  'Erfinde nichts. Jeder Punkt deiner Begründung muss auf eine Stelle im Absatz zeigen.',
  'Antworte AUSSCHLIESSLICH als JSON: {"score": <0-100>, "reason": "<ein Satz>", "evidence": "<Zitat aus dem Absatz>"}.',
  '100 = trifft den Ton der Marke vollständig. 0 = widerspricht ihm in jedem Satz.',
].join('\n')

function judgePrompt(brandMd, paragraph) {
  return `[brand context]\n${brandMd}\n\n[paragraph]\n${paragraph}`
}

// ── Der Transport ──────────────────────────────────────────────────────────

async function complete(system, user, { json = false } = {}) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 800,
      temperature: 0.4,
      // Dieselben Bedingungen wie jeder Brand-Aufruf (BRAND_PROVIDER_ROUTING).
      provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false },
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('leere Antwort')
  return content.trim()
}

function parseScore(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  const score = Number(parsed.score)
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`Score unlesbar: ${raw}`)
  return { score, reason: String(parsed.reason ?? ''), evidence: String(parsed.evidence ?? '') }
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

console.log(`Brand Context H5 — Modell ${MODEL}${DRY ? ' (Trockenlauf)' : ''}\n`)
ok(`Kailuas brand.md: ${kailuaMd.split('\n').length} Zeilen, ${kailuaMd.length} Zeichen`)
ok(`Fremdes brand.md (${RIVAL.title}): ${rivalMd.split('\n').length} Zeilen`)

if (DRY) {
  console.log('\n── System-Prompt (Auftrag 1: schreiben) ──────────────────────')
  console.log(kailuaMd)
  console.log('\n── Nutzer-Nachricht (Auftrag 1) ──────────────────────────────')
  console.log(WRITE_TASK)
  console.log('\n── System-Prompt (Auftrag 2: bewerten) ───────────────────────')
  console.log(JUDGE_RULES)
  console.log('\n── Nutzer-Nachricht (Auftrag 2, gekürzt) ─────────────────────')
  console.log(`${judgePrompt(kailuaMd, '<hier steht der geschriebene Absatz>').slice(0, 400)}…`)
  console.log('\n── Erwartung ─────────────────────────────────────────────────')
  console.log(`eigenes brand.md ≥ ${THRESHOLD} · fremdes brand.md ≤ ${THRESHOLD - GAP}`)
  console.log('\nTrockenlauf: kein Modell angerufen, nichts bezahlt.')
  process.exit(0)
}

if (!KEY) {
  console.log('\nKein `NUXT_AI_KEY` gesetzt — dieser Lauf ruft ein Modell an und kostet Geld.')
  console.log('Setze den Schlüssel und starte erneut, oder benutze `--dry-run`.')
  process.exit(0)
}

try {
  const paragraph = await complete(kailuaMd, WRITE_TASK)
  console.log('\n── Der Absatz, geschrieben NUR mit brand.md ──────────────────')
  console.log(paragraph)
  console.log('')

  const own = parseScore(await complete(JUDGE_RULES, judgePrompt(kailuaMd, paragraph), { json: true }))
  const foreign = parseScore(await complete(JUDGE_RULES, judgePrompt(rivalMd, paragraph), { json: true }))

  console.log(`Urteil gegen Kailuas brand.md:  ${own.score} — ${own.reason}`)
  console.log(`Urteil gegen fremdes brand.md:  ${foreign.score} — ${foreign.reason}\n`)

  if (own.score >= THRESHOLD) ok(`Im Ton: ${own.score} ≥ ${THRESHOLD}.`)
  else fail(`Nicht im Ton: ${own.score} < ${THRESHOLD}. Beleg: ${own.evidence}`)

  if (foreign.score <= own.score - GAP) {
    ok(`Gegenprobe hält: ${foreign.score} liegt ${own.score - foreign.score} Punkte darunter.`)
  }
  else {
    fail(`Gegenprobe wertlos: das fremde brand.md bewertet denselben Absatz mit ${foreign.score}. `
      + 'Entweder ist der Richter blind oder die zwei Marken klingen gleich.')
  }

  if (!process.exitCode) console.log('\nAlles grün.')
}
catch (error) {
  fail(`Lauf abgebrochen: ${error instanceof Error ? error.message : String(error)}`)
}
