import type { Lang, Localized } from './localized'
import { SERVICE_CORES, type ServiceId } from './services'
import {
  INTRO_BUDGETS,
  INTRO_GOAL_UNSURE,
  INTRO_PROJECT_TYPES,
  INTRO_SETUPS,
  INTRO_TEAM_SIZES,
  INTRO_TIMINGS,
} from '#shared/types/introCall'

/**
 * Der komplette Inhalt des Erstgespräch-Wizards (`/erstgespraech`), zweisprachig
 * als typisierte Daten — dasselbe Muster wie `home.ts` und `uxAudit.ts`.
 *
 * WARUM ALLES HIER UND NICHTS IN `i18n/locales/*.json`: auf dieser Site tragen
 * die Daten-Dateien die INHALTE, die JSONs nur das Chrome (Navigation, „Lesen →").
 * Ein Wizard ist von vorne bis hinten Inhalt — Fragen, Optionen, Microcopy,
 * Fehlerzeilen und die Erfolgsseite gehören zusammen gepflegt, und wer eine
 * Budget-Spanne ändert, will Titel UND Unterzeile nebeneinander sehen. Der
 * Nebeneffekt ist ein Wächter geschenkt: `tests/localized-parity.test.ts` läuft
 * über dieses Modul und meldet jede halb übersetzte Zeile.
 *
 * DIE OPTIONS-LISTEN SIND ÜBER IHRE SCHLÜSSEL-ARRAYS AN DEN VERTRAG GENAGELT
 * (`shared/types/introCall.ts`): `optionsFor()` verlangt zu JEDEM Schlüssel
 * einen Eintrag — eine neue Option ohne Text ist ein Typfehler und keine leere
 * Karte. Die REIHENFOLGE ist die des Schlüssel-Arrays; sie ist Teil der
 * Gesprächsführung (aufsteigendes Budget, absteigende Dringlichkeit) und darf
 * nicht nach Alphabet sortiert werden.
 *
 * DIESELBEN TEXTE SPEISEN DIE MAIL. `server/api/intro-call.post.ts` liest die
 * Listen hier, um in der Anfrage-Mail KLARTEXT statt Schlüssel zu schreiben —
 * ohne das stünde dort „budget: 15to50k", und die Übersetzung säße im Kopf des
 * Lesers.
 */

/** Eine Auswahl-Karte: Titel plus erklärende Unterzeile. */
export interface IntroOption<K extends string = string> {
  id: K
  title: Localized
  /** Die Unterzeile — Pflicht, weil eine nackte Karte die Frage nicht erklärt. */
  note: Localized
}

/**
 * Baut die geordnete Karten-Liste aus dem Schlüssel-Array und einem
 * VOLLSTÄNDIGEN Text-Verzeichnis. Der `Record`-Typ ist die Sicherung: fehlt ein
 * Schlüssel, meldet es der Typecheck.
 */
function optionsFor<K extends string>(
  keys: readonly K[],
  texts: Record<K, Omit<IntroOption, 'id'>>,
): IntroOption<K>[] {
  return keys.map(id => ({ id, ...texts[id] }))
}

/** Klartext einer Option — Rückfall auf den Schlüssel, damit nie „undefined" in der Mail steht. */
export function optionLabel(options: IntroOption[], id: string, lang: Lang): string {
  return options.find(option => option.id === id)?.title[lang] ?? id
}

/* ── SCHRITT 1: ZIEL ─────────────────────────────────────────────────────── */

/**
 * Die Unterzeilen der sechs Leistungs-Karten. Getrennt von `SERVICE_CORES`,
 * weil dort bewusst NUR Anker-Id, Titel und Ziel stehen (Bundle-Schnitt: die
 * Fußzeile lädt diese Datei nicht mit). `ServiceId` als Schlüssel-Typ ist die
 * Sicherung: eine siebte Leistung ohne Unterzeile ist ein Typfehler.
 */
const SERVICE_GOAL_NOTES: Record<ServiceId, Localized> = {
  'brand-design': {
    de: 'Erscheinungsbild, Farb- und Typo-System, Design-Grundlagen.',
    en: 'Visual identity, colour and type system, design foundations.',
  },
  'ux-audit': {
    de: 'Bestehende Seite prüfen: wo verlieren Sie Besucher und Anfragen?',
    en: 'Review an existing site: where are you losing visitors and enquiries?',
  },
  'landingpage-cro': {
    de: 'Eine Seite mit EINEM Ziel — Anfragen, Anmeldungen, Verkäufe.',
    en: 'One page with ONE goal — enquiries, sign-ups, sales.',
  },
  'corporate-website': {
    de: 'Neue Unternehmens-Website inklusive technischer Umsetzung.',
    en: 'A new company website including technical implementation.',
  },
  'saas-design': {
    de: 'Software, Dashboards, App-Oberflächen — Produkt statt Broschüre.',
    en: 'Software, dashboards, app interfaces — product, not brochure.',
  },
  'content-produktion': {
    de: 'Foto, Video und Werbemittel für Website und Kanäle.',
    en: 'Photo, video and ad assets for the site and your channels.',
  },
}

/**
 * Die sechs Leistungen kommen aus `SERVICE_CORES` — dieselbe Quelle wie
 * Startseite und Fußzeile. Eine siebte Leistung erscheint damit automatisch
 * hier; eine hier zweitgeschriebene Liste wäre der Weg, auf dem der Wizard
 * still etwas anderes anbietet als die Seite (derselbe Fehler, an dem der Fuß
 * einmal einen anderen Leistungsnamen trug als die Seite).
 */
export const GOAL_OPTIONS: IntroOption[] = [
  ...SERVICE_CORES.map(service => ({
    id: service.id as string,
    title: service.title,
    note: SERVICE_GOAL_NOTES[service.id],
  })),
  {
    id: INTRO_GOAL_UNSURE,
    title: {
      de: 'Weiß ich noch nicht',
      en: 'Not sure yet',
    },
    note: {
      de: 'Klären wir im Gespräch — dafür ist es da.',
      en: 'We will work it out in the call — that is what it is for.',
    },
  },
]

export const PROJECT_TYPE_OPTIONS = optionsFor(INTRO_PROJECT_TYPES, {
  new: {
    title: { de: 'Neues Projekt', en: 'New project' },
    note: {
      de: 'Es gibt noch nichts — wir fangen bei der Idee an.',
      en: 'Nothing exists yet — we start from the idea.',
    },
  },
  relaunch: {
    title: { de: 'Relaunch', en: 'Relaunch' },
    note: {
      de: 'Es gibt etwas, es soll aber neu gedacht und neu gebaut werden.',
      en: 'Something exists, but it should be rethought and rebuilt.',
    },
  },
  optimize: {
    title: { de: 'Bestehendes verbessern', en: 'Improve what exists' },
    note: {
      de: 'Die Substanz stimmt, die Wirkung nicht — gezielt nachschärfen.',
      en: 'The substance is fine, the effect is not — sharpen it deliberately.',
    },
  },
  retainer: {
    title: { de: 'Laufende Betreuung', en: 'Ongoing support' },
    note: {
      de: 'Ein fester Ansprechpartner für Design und Umsetzung über Monate.',
      en: 'A fixed partner for design and implementation, month after month.',
    },
  },
})

/* ── SCHRITT 2: PROJEKT ──────────────────────────────────────────────────── */

export const BUDGET_OPTIONS = optionsFor(INTRO_BUDGETS, {
  'lt5k': {
    title: { de: 'unter 5.000 €', en: 'Under €5,000' },
    note: {
      de: 'Ein klar geschnittenes Einzelstück — etwa ein UX-Audit.',
      en: 'One clearly cut piece of work — a UX audit, for example.',
    },
  },
  '5to15k': {
    title: { de: '5.000 – 15.000 €', en: '€5,000 – €15,000' },
    note: {
      de: 'Landingpage oder kompakte Website mit Design und Umsetzung.',
      en: 'Landing page or a compact website, design and build.',
    },
  },
  '15to50k': {
    title: { de: '15.000 – 50.000 €', en: '€15,000 – €50,000' },
    note: {
      de: 'Unternehmens-Website oder Produkt-Design mit mehreren Etappen.',
      en: 'Company website or product design across several stages.',
    },
  },
  'gt50k': {
    title: { de: 'über 50.000 €', en: 'Over €50,000' },
    note: {
      de: 'Marke, Produkt und Umsetzung über einen längeren Zeitraum.',
      en: 'Brand, product and build over a longer period.',
    },
  },
  'open': {
    title: { de: 'Noch offen', en: 'Still open' },
    note: {
      de: 'Sie wissen es noch nicht — wir ordnen es im Gespräch ein.',
      en: 'You do not know yet — we will place it in the call.',
    },
  },
})

/* ── SCHRITT 3: UNTERNEHMEN ──────────────────────────────────────────────── */

export const TEAM_SIZE_OPTIONS = optionsFor(INTRO_TEAM_SIZES, {
  'solo': {
    title: { de: 'Solo / selbstständig', en: 'Solo / self-employed' },
    note: {
      de: 'Sie entscheiden allein — kurze Wege, schnelle Freigaben.',
      en: 'You decide alone — short paths, fast approvals.',
    },
  },
  '2to10': {
    title: { de: '2 – 10 Mitarbeitende', en: '2 – 10 people' },
    note: {
      de: 'Kleines Team, meist eine Person mit Entscheidungsbefugnis.',
      en: 'Small team, usually one person with the final say.',
    },
  },
  '11to50': {
    title: { de: '11 – 50 Mitarbeitende', en: '11 – 50 people' },
    note: {
      de: 'Mehrere Beteiligte — Abstimmung gehört mit in den Zeitplan.',
      en: 'Several stakeholders — alignment belongs in the schedule.',
    },
  },
  'gt50': {
    title: { de: 'über 50 Mitarbeitende', en: 'More than 50 people' },
    note: {
      de: 'Feste Prozesse, Freigabe-Runden, oft mehrere Abteilungen.',
      en: 'Established processes, approval rounds, often several departments.',
    },
  },
})

/* ── SCHRITT 4: STATUS & ZEITRAHMEN ──────────────────────────────────────── */

export const SETUP_OPTIONS = optionsFor(INTRO_SETUPS, {
  agency: {
    title: { de: 'Über eine Agentur', en: 'Through an agency' },
    note: {
      de: 'Betreut, aber oft langsam und teuer in der Abstimmung.',
      en: 'Looked after, but often slow and expensive to coordinate.',
    },
  },
  freelancer: {
    title: { de: 'Über Freelancer', en: 'Through freelancers' },
    note: {
      de: 'Flexibel, aber je Gewerk eine andere Person.',
      en: 'Flexible, but a different person for every discipline.',
    },
  },
  inhouse: {
    title: { de: 'Intern im Team', en: 'In-house' },
    note: {
      de: 'Eigene Leute — meist neben dem Tagesgeschäft.',
      en: 'Your own people — usually alongside their day job.',
    },
  },
  diy: {
    title: { de: 'Mit einem Baukasten', en: 'With a website builder' },
    note: {
      de: 'Selbst gebaut, etwa mit WordPress, Wix oder Squarespace.',
      en: 'Self-built, for example with WordPress, Wix or Squarespace.',
    },
  },
  none: {
    title: { de: 'Noch gar nicht', en: 'Not at all yet' },
    note: {
      de: 'Es gibt bisher nichts — wir beginnen auf der grünen Wiese.',
      en: 'Nothing exists yet — we start on a blank page.',
    },
  },
})

export const TIMING_OPTIONS = optionsFor(INTRO_TIMINGS, {
  'now': {
    title: { de: 'Sofort', en: 'Right away' },
    note: {
      de: 'Budget und Entscheidung stehen, es kann losgehen.',
      en: 'Budget and decision are in place, we can start.',
    },
  },
  '1to3months': {
    title: { de: 'In 1 – 3 Monaten', en: 'In 1 – 3 months' },
    note: {
      de: 'Der Start ist geplant, die Vorbereitung läuft.',
      en: 'The start is planned, preparation is under way.',
    },
  },
  'exploring': {
    title: { de: 'Erstmal informieren', en: 'Just gathering information' },
    note: {
      de: 'Völlig in Ordnung — wir sagen ehrlich, was realistisch ist.',
      en: 'Perfectly fine — we will tell you honestly what is realistic.',
    },
  },
})

/* ── RAHMEN: KOPF, SCHRITTE, VERTRAUENSZEILEN ────────────────────────────── */

export const WIZARD_META = {
  title: {
    de: 'Kostenloses Erstgespräch — Pukalani Studio',
    en: 'Free intro call — Pukalani Studio',
  },
  description: {
    de: 'In drei Minuten die Eckdaten Ihres Projekts schildern — danach buchen Sie den Termin direkt oder wir melden uns innerhalb von 24 Stunden.',
    en: 'Outline your project in three minutes — then book the call straight away or we get back to you within 24 hours.',
  },
  breadcrumb: { de: 'Erstgespräch', en: 'Intro call' },
  /** Überschrift der Seite selbst — kürzer als der Seitentitel. */
  heading: {
    de: 'Kostenloses Erstgespräch',
    en: 'Free intro call',
  },
  intro: {
    de: 'Damit wir das Gespräch vorbereiten können — ein paar Eckdaten reichen. Kostenlos und unverbindlich.',
    en: 'So we can prepare the call — a few key facts are enough. Free and without obligation.',
  },
} satisfies Record<string, Localized>

/** Die fünf Schritte: Titel in der Seitenleiste, Microcopy über der Frage. */
export const WIZARD_STEPS: { title: Localized, microcopy: Localized }[] = [
  {
    title: { de: 'Ziel', en: 'Goal' },
    microcopy: {
      de: 'Damit wir das Gespräch vorbereiten können — ein paar Eckdaten reichen.',
      en: 'So we can prepare the call — a few key facts are enough.',
    },
  },
  {
    title: { de: 'Projekt', en: 'Project' },
    microcopy: {
      de: 'Zwei Angaben zum Vorhaben. Die Budget-Spanne hilft uns, realistisch zu antworten.',
      en: 'Two facts about the project. The budget range helps us answer realistically.',
    },
  },
  {
    title: { de: 'Unternehmen', en: 'Company' },
    microcopy: {
      de: 'Wer entscheidet und für welchen Markt — das prägt Umfang und Ablauf.',
      en: 'Who decides and for which market — that shapes scope and process.',
    },
  },
  {
    title: { de: 'Status & Zeitrahmen', en: 'Status & timing' },
    microcopy: {
      de: 'Wo Sie heute stehen und wann es losgehen soll. Wir sind ehrlich, falls wir nicht der richtige Hebel sind.',
      en: 'Where you stand today and when you want to start. We will say honestly if we are not the right lever.',
    },
  },
  {
    title: { de: 'Kontakt', en: 'Contact' },
    microcopy: {
      de: 'Fast geschafft — wohin dürfen wir antworten?',
      en: 'Almost there — where may we reply?',
    },
  },
]

/** Die zwei Vertrauenszeilen unter der Schritt-Leiste. */
export const WIZARD_TRUST: Localized[] = [
  { de: 'Dauer: ca. 3 Minuten', en: 'Takes about 3 minutes' },
  {
    de: 'Ihre Angaben werden nur zur Vorbereitung des Gesprächs verwendet.',
    en: 'Your answers are used only to prepare the call.',
  },
]

/* ── FRAGEN & FELDER ─────────────────────────────────────────────────────── */

export const WIZARD_QUESTIONS = {
  goals: {
    label: { de: 'Woran sollen wir arbeiten?', en: 'What should we work on?' },
    hint: { de: 'Mehrfachauswahl möglich.', en: 'You can pick more than one.' },
  },
  projectType: {
    label: { de: 'Was existiert schon?', en: 'What exists already?' },
    hint: { de: 'Eine Auswahl.', en: 'Pick one.' },
  },
  industry: {
    label: { de: 'In welcher Branche sind Sie unterwegs?', en: 'Which industry are you in?' },
    hint: { de: 'Optional.', en: 'Optional.' },
    placeholder: { de: 'z. B. Maschinenbau, Steuerberatung, SaaS', en: 'e.g. engineering, tax advice, SaaS' },
  },
  budget: {
    label: { de: 'Welche Projektbudget-Spanne haben Sie im Kopf?', en: 'Which project budget range do you have in mind?' },
    hint: { de: 'Eine Auswahl. Kein Angebot — nur eine Einordnung.', en: 'Pick one. Not a quote — just a bearing.' },
  },
  teamSize: {
    label: { de: 'Wie ist Ihr Unternehmen aufgestellt?', en: 'How is your company set up?' },
    hint: { de: 'Eine Auswahl.', en: 'Pick one.' },
  },
  market: {
    label: { de: 'Für welchen Markt oder welche Region?', en: 'For which market or region?' },
    hint: { de: 'Optional.', en: 'Optional.' },
    placeholder: { de: 'z. B. DACH, bundesweit, Hamburg', en: 'e.g. DACH, nationwide, Hamburg' },
  },
  currentSetup: {
    label: { de: 'Wie entsteht Ihre Website oder Ihr Produkt heute?', en: 'How does your website or product get built today?' },
    hint: { de: 'Eine Auswahl.', en: 'Pick one.' },
  },
  timing: {
    label: { de: 'Wann soll es losgehen?', en: 'When would you like to start?' },
    hint: { de: 'Eine Auswahl.', en: 'Pick one.' },
  },
  note: {
    label: { de: 'Etwas, das wir vorab wissen sollten?', en: 'Anything we should know in advance?' },
    hint: { de: 'Optional.', en: 'Optional.' },
    placeholder: {
      de: 'Gern auch der Link zu Ihrer bestehenden Seite.',
      en: 'The link to your existing site is welcome here too.',
    },
  },
  name: {
    label: { de: 'Ihr Name', en: 'Your name' },
    placeholder: { de: 'Vor- und Nachname', en: 'First and last name' },
  },
  company: {
    label: { de: 'Unternehmen', en: 'Company' },
    placeholder: { de: 'Firmenname', en: 'Company name' },
  },
  email: {
    label: { de: 'E-Mail', en: 'Email' },
    placeholder: { de: 'name@unternehmen.de', en: 'name@company.com' },
  },
  phone: {
    label: { de: 'Telefon', en: 'Phone' },
    hint: { de: 'Optional — wir rufen nicht unangekündigt an.', en: 'Optional — we do not call unannounced.' },
    placeholder: { de: '+49 …', en: '+49 …' },
  },
  /**
   * Die Datenschutz-Zeile in DREI Teilen: der Link steht mitten im Satz und
   * wird mit `localePath('/privacy')` gerendert. Ein zusammenhängender Satz
   * mit HTML wäre in einer Datendatei die Sorte Text, die man später mit
   * `v-html` ausgibt — und das ist an einem Formular genau die falsche Tür.
   */
  privacy: {
    before: { de: 'Ich habe die ', en: 'I have read the ' },
    link: { de: 'Datenschutzerklärung', en: 'privacy policy' },
    after: {
      de: ' gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage einverstanden.',
      en: ' and agree that my details may be processed to handle this enquiry.',
    },
  },
  /** Honeypot — trägt eine echte Beschriftung, weil Ausfüll-Bots Labels lesen. */
  honeypot: { label: { de: 'Website', en: 'Website' } },
}

/* ── BEDIENUNG, FEHLER, ERFOLG ───────────────────────────────────────────── */

export const WIZARD_UI = {
  stepOf: { de: 'Schritt', en: 'Step' },
  stepSeparator: { de: 'von', en: 'of' },
  back: { de: 'Zurück', en: 'Back' },
  next: { de: 'Weiter', en: 'Next' },
  submit: { de: 'Anfrage absenden', en: 'Send enquiry' },
  submitting: { de: 'Wird gesendet …', en: 'Sending …' },
  required: { de: 'Pflichtfeld', en: 'Required' },
}

/**
 * Fehlerzeilen — Sie-Form (die Site siezt; die Vorlage duzte). Sie stehen
 * DIREKT unter der Frage, auf die sie sich beziehen, nicht gesammelt oben:
 * ein Sammel-Kasten zwingt zum Suchen.
 */
export const WIZARD_ERRORS = {
  goals: { de: 'Bitte wählen Sie mindestens eine Option.', en: 'Please select at least one option.' },
  projectType: { de: 'Bitte wählen Sie eine Option.', en: 'Please select an option.' },
  budget: { de: 'Bitte wählen Sie eine Spanne.', en: 'Please select a range.' },
  teamSize: { de: 'Bitte wählen Sie eine Option.', en: 'Please select an option.' },
  currentSetup: { de: 'Bitte wählen Sie eine Option.', en: 'Please select an option.' },
  timing: { de: 'Bitte wählen Sie eine Option.', en: 'Please select an option.' },
  name: { de: 'Bitte geben Sie Ihren Namen an.', en: 'Please enter your name.' },
  company: { de: 'Bitte geben Sie Ihr Unternehmen an.', en: 'Please enter your company.' },
  email: { de: 'Bitte geben Sie eine E-Mail-Adresse an.', en: 'Please enter an email address.' },
  emailInvalid: { de: 'Diese E-Mail-Adresse sieht nicht gültig aus.', en: 'That email address does not look valid.' },
  privacy: { de: 'Bitte bestätigen Sie die Datenschutzerklärung.', en: 'Please confirm the privacy policy.' },
  /** Der Netz-/Serverfehler beim Absenden — nennt einen zweiten Weg. */
  submit: {
    de: 'Das Absenden hat nicht geklappt. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt eine E-Mail.',
    en: 'Sending failed. Please try again or simply send us an email.',
  },
  /**
   * Die drei Gründe der Bot-Prüfung (Turnstile, NF1 b) — nur sichtbar, wenn
   * die Site Turnstile-Schlüssel hat. Zuordnung wie `auth.botCheck.*` im Core.
   */
  botCheckRequired: {
    de: 'Bitte bestätigen Sie die Roboter-Prüfung.',
    en: 'Please confirm that you are not a robot.',
  },
  botCheckFailed: {
    de: 'Die Roboter-Prüfung ist fehlgeschlagen. Bitte versuchen Sie es noch einmal.',
    en: 'The robot check failed, please try again.',
  },
  botCheckUnavailable: {
    de: 'Die Roboter-Prüfung ist gerade nicht erreichbar. Bitte versuchen Sie es in ein paar Minuten noch einmal oder schreiben Sie uns direkt eine E-Mail.',
    en: 'The robot check is unavailable right now. Please try again in a few minutes or simply send us an email.',
  },
} satisfies Record<string, Localized>

/**
 * Die Erfolgsansicht ERSETZT den Wizard auf derselben Seite (kein Redirect:
 * eine eigene Danke-Adresse wäre per Zurück-Taste erreichbar und würde ohne
 * Absenden angezeigt). Buchen steht VORNE, die 24-Stunden-Zusage darunter —
 * Davids Entscheidung 2026-08-21: beides, nicht eines von beidem.
 */
export const WIZARD_SUCCESS = {
  title: { de: 'Danke — Ihre Anfrage ist da.', en: 'Thank you — we have your enquiry.' },
  lead: {
    de: 'Wir haben Ihre Angaben erhalten und bereiten das Gespräch damit vor.',
    en: 'We have received your answers and will use them to prepare the call.',
  },
  bookCta: { de: 'Termin direkt buchen (30 Min)', en: 'Book your slot now (30 min)' },
  fallback: {
    de: 'Oder lehnen Sie sich zurück — wir melden uns innerhalb von 24 Stunden.',
    en: 'Or lean back — we will get back to you within 24 hours.',
  },
} satisfies Record<string, Localized>
