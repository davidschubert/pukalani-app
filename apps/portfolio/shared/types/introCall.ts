/**
 * Der Vertrag des Erstgespräch-Wizards (`/erstgespraech` ⇄ `POST /api/intro-call`).
 *
 * WARUM `shared/types/` UND NICHT `app/types/`: der Server sieht `app/types/`
 * nicht — dieselbe Regel wie überall im Monorepo. Beide Enden dieser Route
 * lesen diese Datei, und genau das ist ihr Zweck: Nitros Routen-Typisierung ist
 * projektweit AUS (`$fetch` liefert `unknown`), der Antworttyp muss also an
 * BEIDEN Enden genannt werden — Handler-Annotation hier, `$fetch<IntroCallResponse>`
 * dort. Ohne diese Datei gäbe es dafür keine gemeinsame Wahrheit.
 *
 * WARUM HIER AUCH LAUFZEIT-ARRAYS STEHEN (und nicht nur Typen): die Antwort-
 * Schlüssel werden an drei Stellen gebraucht — als Auswahl-Liste im Wizard, als
 * `z.enum` in der Route und als Spaltenwert in der Ablage. Eine Union allein
 * kann die Route nicht validieren (Typen sind zur Laufzeit weg), also stünde die
 * Liste sonst zweimal da: einmal als Union, einmal als Zod-Literale. Zwei Listen
 * derselben Sache laufen auseinander, sobald eine Option dazukommt — und der
 * Bruch wäre still (der Wizard bietet etwas an, die Route weist es mit 400 ab).
 * Deshalb: das `as const`-Array ist die Quelle, die Union wird daraus abgeleitet.
 *
 * DIE SCHLÜSSEL SIND ZUGLEICH PLAUSIBLE-EIGENSCHAFTEN (`studio_wizard_submitted`
 * trägt `goal`/`budget`/`timing`) — sie sind damit veröffentlichte Namen, an
 * denen Goals und Auswertungen hängen. Umbenennen heißt: alte Anfragen in der
 * Ablage tragen den alten Wert, und die Plausible-Zeitreihe bricht.
 */

/** Was existiert schon? — Schritt 2 des Wizards. */
export const INTRO_PROJECT_TYPES = ['new', 'relaunch', 'optimize', 'retainer'] as const
export type IntroProjectType = typeof INTRO_PROJECT_TYPES[number]

/**
 * Projektbudget als SPANNEN, nicht als Regler (Davids Entscheidung 2026-08-21,
 * Plan-Abschnitt 6): ein Monatsbudget-Slider ist bei Projektgeschäft
 * irreführend. `open` ist eine echte Antwort und keine Verweigerung — wer das
 * wählt, bekommt im Gespräch die Einordnung.
 */
export const INTRO_BUDGETS = ['lt5k', '5to15k', '15to50k', 'gt50k', 'open'] as const
export type IntroBudget = typeof INTRO_BUDGETS[number]

/** Aufstellung des Unternehmens — Schritt 3. */
export const INTRO_TEAM_SIZES = ['solo', '2to10', '11to50', 'gt50'] as const
export type IntroTeamSize = typeof INTRO_TEAM_SIZES[number]

/** Wie entsteht die Website/das Produkt heute? — Schritt 4, Reifegrad. */
export const INTRO_SETUPS = ['agency', 'freelancer', 'inhouse', 'diy', 'none'] as const
export type IntroSetup = typeof INTRO_SETUPS[number]

/** Startzeitpunkt — Schritt 4, Dringlichkeit. */
export const INTRO_TIMINGS = ['now', '1to3months', 'exploring'] as const
export type IntroTiming = typeof INTRO_TIMINGS[number]

/**
 * Sonder-Ziel neben den sechs Leistungen: „Weiß ich noch nicht". Die sechs
 * anderen Schlüssel sind die `ServiceId`s aus `app/data/services.ts` — sie
 * werden hier bewusst NICHT zweitgeschrieben, sondern in der Route aus
 * `SERVICE_CORES` gebildet (eine neue Leistung erscheint damit automatisch im
 * Wizard und ist automatisch gültig).
 */
export const INTRO_GOAL_UNSURE = 'unsure'

/**
 * Was der Wizard sendet. `goals` bleibt `string[]` statt einer Union: die
 * gültigen Werte hängen an `SERVICE_CORES`, und diese Datei soll nichts aus
 * `app/` importieren (der Server bündelt sie mit).
 */
export interface IntroCallRequest {
  /** Mindestens ein Eintrag: Service-Id oder `unsure`. */
  goals: string[]
  projectType: IntroProjectType
  /** Freitext, optional. */
  industry?: string
  budget: IntroBudget
  teamSize: IntroTeamSize
  /** Markt/Region als Freitext, optional. */
  market?: string
  currentSetup: IntroSetup
  timing: IntroTiming
  /** „Etwas, das wir vorab wissen sollten?" — optional. */
  note?: string
  name: string
  company: string
  email: string
  /** Telefon ist OPTIONAL (Davids Entscheidung 2026-08-21) — wir rufen nicht kalt zurück. */
  phone?: string
  /** Sprache des Absenders — steuert die Klartext-Labels in der Mail. */
  locale: 'de' | 'en'
  /**
   * Honeypot. Für Menschen unsichtbar; ist es gefüllt, war es ein Bot. Heißt
   * bewusst harmlos, damit ein Formular-Ausfüller es überhaupt anfasst.
   */
  website?: string
  /** Einmal-Token des Turnstile-Widgets — nur, wenn die Site Turnstile-Schlüssel hat. */
  turnstileToken?: string
}

/**
 * Die Antwort ist IMMER dieselbe — auch für den Bot, der in den Honeypot
 * getappt ist. Wer eine abweichende Antwort bekommt, lernt, woran es lag.
 */
export interface IntroCallResponse {
  ok: true
}
