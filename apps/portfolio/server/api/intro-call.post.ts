import { ID } from 'node-appwrite'
import { z } from 'zod'
import { CONTACT } from '../../app/data/contact'
import { SERVICE_CORES } from '../../app/data/services'
import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  SETUP_OPTIONS,
  TEAM_SIZE_OPTIONS,
  TIMING_OPTIONS,
  WIZARD_QUESTIONS,
  optionLabel,
} from '../../app/data/erstgespraech'
import type { Lang } from '../../app/data/localized'
import {
  INTRO_BUDGETS,
  INTRO_GOAL_UNSURE,
  INTRO_PROJECT_TYPES,
  INTRO_SETUPS,
  INTRO_TEAM_SIZES,
  INTRO_TIMINGS,
  type IntroCallResponse,
} from '#shared/types/introCall'
import { frameMail } from '../../../../packages/core/shared/mailFrame'
import { resolveMailBrand } from '../../../../packages/core/server/utils/mailBrand'

/**
 * Die Anfrage aus dem Erstgespräch-Wizard (`/erstgespraech`, W1) — die einzige
 * Schreib-Route dieser Site und die einzige OHNE Session: hier meldet sich
 * jemand, der kein Konto hat und nie eins bekommen wird.
 *
 * VIER BREMSEN STATT EINER ANMELDUNG (Muster `onboarding/request.post.ts`):
 *  - Rate-Limit in der core-Middleware (5/min und IP, Bucket
 *    `portfolio:intro-call` — die Route verschickt Mail),
 *  - Honeypot: ein für Menschen unsichtbares Feld. Ist es gefüllt, antworten
 *    wir trotzdem freundlich und schreiben NICHTS — sonst lernt der Bot, woran
 *    es lag,
 *  - Zod mit engen Längen; die Auswahl-Schlüssel kommen aus dem Vertrag
 *    (`shared/types/introCall.ts`) und aus `SERVICE_CORES`, nicht aus einer
 *    zweiten Liste,
 *  - Bot-Prüfung (Turnstile, Aktion `portfolio_intro_call`, seit NF1 b
 *    2026-11-18) nach dem Honigtopf und vor beiden Zustellwegen. Ohne die
 *    zwei Schlüssel ein No-op.
 * Die Mail geht nur an die feste Adresse des Studios (`CONTACT.email`), nie
 * an die eingetragene — eine Grenze je Empfänger braucht es deshalb nicht.
 *
 * ZWEI ZUSTELLWEGE, EINZELN ABGESICHERT (Davids Entscheidung 4 vom 2026-08-21:
 * Mail UND Appwrite-Tabelle ab v1). Sie hängen bewusst NICHT aneinander:
 *  - Die Mail ist der Weg, auf dem ein Mensch die Anfrage bemerkt. Ohne
 *    konfiguriertes SMTP gibt `sendMail()` `false` zurück und warnt selbst
 *    einmal ins Log (F44) — das zählt hier als FEHLSCHLAG dieses Zweigs.
 *  - Die Zeile in `intro_requests` ist das Gedächtnis: sie überlebt einen
 *    toten Mailserver.
 * Erfolg heißt: MINDESTENS EINER ist durchgekommen. Beide tot ⇒ 500 mit
 * `reason: delivery_failed`, damit der Wizard seine Fehlerzeile zeigt und der
 * Mensch es erneut versuchen kann. Ein „ok" auf eine Anfrage, die nirgendwo
 * angekommen ist, wäre die teuerste Lüge dieser Site.
 *
 * KEINE APPWRITE-FEHLERDETAILS NACH DRAUSSEN. Was schiefging, steht im
 * Server-Log — und dort OHNE die Angaben des Absenders (der Fehlertext einer
 * Zeilen-Anlage bräuchte keine E-Mail-Adresse, um verständlich zu sein).
 */

/** Alle gültigen Ziele: die sechs Leistungen plus „Weiß ich noch nicht". */
const GOAL_KEYS = new Set<string>([
  ...SERVICE_CORES.map(service => service.id),
  INTRO_GOAL_UNSURE,
])

const bodySchema = z.object({
  goals: z.array(z.string().refine(value => GOAL_KEYS.has(value), 'unknown_goal'))
    .min(1)
    .max(GOAL_KEYS.size),
  projectType: z.enum(INTRO_PROJECT_TYPES),
  industry: z.string().trim().max(200).optional(),
  budget: z.enum(INTRO_BUDGETS),
  teamSize: z.enum(INTRO_TEAM_SIZES),
  market: z.string().trim().max(200).optional(),
  currentSetup: z.enum(INTRO_SETUPS),
  timing: z.enum(INTRO_TIMINGS),
  note: z.string().trim().max(5000).optional(),
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).optional(),
  locale: z.enum(['de', 'en']),
  /** Honeypot — muss leer bleiben. Heißt bewusst harmlos. */
  website: z.string().max(200).optional(),
  /**
   * Der Einmal-Token des Turnstile-Widgets (Aktion `portfolio_intro_call`).
   * Ohne Turnstile-Schlüssel schickt der Wizard keinen, und der Server prüft
   * nicht (`requireTurnstile` ist dann ein No-op).
   */
  turnstileToken: z.string().max(4096).optional(),
}).strict()

type IntroCallBody = z.infer<typeof bodySchema>

/**
 * Menschenlesbare Zusammenfassung — KLARTEXT, keine Schlüssel.
 *
 * Die Beschriftungen kommen aus DERSELBEN Datei wie der Wizard
 * (`app/data/erstgespraech.ts`; die Empfänger-Adresse ebenso aus
 * `app/data/contact.ts` — beide sind reine Datenmodule ohne Vue-/Nuxt-
 * Abhängigkeiten, Nitro bündelt sie mit, denselben Weg geht
 * `server/utils/siteRoutes.ts` schon mit `app/data/cases.ts`). Ohne das stünde
 * in der Mail „budget: 15to50k", und die Übersetzung säße im Kopf des Lesers.
 */
function buildMailText(body: IntroCallBody, lang: Lang, brand: string): string {
  const q = WIZARD_QUESTIONS
  const goals = body.goals.map(goal => optionLabel(GOAL_OPTIONS, goal, lang)).join(', ')
  const contact = [
    `${q.name.label[lang]}: ${body.name}`,
    `${q.company.label[lang]}: ${body.company}`,
    `${q.email.label[lang]}: ${body.email}`,
    `${q.phone.label[lang]}: ${body.phone || '—'}`,
  ]
  const answers = [
    `${q.goals.label[lang]} ${goals}`,
    `${q.projectType.label[lang]} ${optionLabel(PROJECT_TYPE_OPTIONS, body.projectType, lang)}`,
    `${q.industry.label[lang]} ${body.industry || '—'}`,
    `${q.budget.label[lang]} ${optionLabel(BUDGET_OPTIONS, body.budget, lang)}`,
    `${q.teamSize.label[lang]} ${optionLabel(TEAM_SIZE_OPTIONS, body.teamSize, lang)}`,
    `${q.market.label[lang]} ${body.market || '—'}`,
    `${q.currentSetup.label[lang]} ${optionLabel(SETUP_OPTIONS, body.currentSetup, lang)}`,
    `${q.timing.label[lang]} ${optionLabel(TIMING_OPTIONS, body.timing, lang)}`,
  ]
  // Rahmen (Q06): Betreiber-Mail, Anrede und Gruß auf Deutsch, ohne Namen.
  // Die Feld-Beschriftungen bleiben in der Sprache des Wizards.
  return frameMail({
    brand,
    locale: 'de',
    lines: [contact.join('\n'), answers.join('\n'), `${q.note.label[lang]}\n${body.note || '—'}`],
  }).text
}

export default defineEventHandler(async (event): Promise<IntroCallResponse> => {
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.website) {
    logEvent('info', 'intro_call.honeypot', {})
    return { ok: true }
  }

  // Bot-Prüfung nach dem Honigtopf und VOR Mail und Zeile (SEC-018, NF1 b).
  // Ohne Turnstile-Schlüssel kehrt sie sofort zurück — die Route läuft dann
  // wie bisher.
  await requireTurnstile(event, 'portfolio_intro_call', body.turnstileToken)

  const lang: Lang = body.locale
  const mailOk = await sendMail(event, {
    to: CONTACT.email,
    subject: `Erstgespräch-Anfrage: ${body.name} (${body.company})`,
    text: buildMailText(body, lang, resolveMailBrand(event)),
  }).catch((error: unknown) => {
    console.error('[portfolio] intro-call mail failed:', error instanceof Error ? error.message : error)
    return false
  })

  // `goals` als JSON-Zeichenkette: eine Appwrite-Array-Spalte wäre für eine
  // Liste, über die nie gefiltert wird, nur eine Spalte mehr im Schema.
  const rowOk = await (async () => {
    try {
      const { tablesDB } = createAdminClient(event)
      await tablesDB.createRow({
        databaseId: useRuntimeConfig(event).public.appwriteDatabaseId,
        tableId: 'intro_requests',
        rowId: ID.unique(),
        data: {
          goals: JSON.stringify(body.goals),
          projectType: body.projectType,
          industry: body.industry ?? '',
          budget: body.budget,
          teamSize: body.teamSize,
          market: body.market ?? '',
          currentSetup: body.currentSetup,
          timing: body.timing,
          note: body.note ?? '',
          name: body.name,
          company: body.company,
          email: body.email,
          phone: body.phone ?? '',
          locale: body.locale,
        },
      })
      return true
    }
    catch (error) {
      // OHNE die Angaben des Absenders: ein Log ist der falsche Ort für eine
      // Adresse, und für „welche Tabelle streikt" reicht die Fehlermeldung.
      console.error('[portfolio] intro-call row write failed:', error instanceof Error ? error.message : error)
      return false
    }
  })()

  if (!mailOk && !rowOk) {
    throw createError({
      status: 500,
      statusText: 'Intro call request could not be delivered',
      data: { code: 'delivery_failed' },
    })
  }

  return { ok: true }
})
