import { z } from 'zod'

/**
 * DER KORREKTUR- UND ENTFERNUNGS-VERTRAG VON BRAND INSIGHTS (Plan §9.3
 * `insights_corrections`, docs/plans/BRAND-INSIGHTS.md; Muster:
 * `brand_check_corrections` aus Migration brand-017).
 *
 * ── WARUM EINE EIGENE DATEI ──────────────────────────────────────────────
 * `insightsPost.ts` ist der REDAKTIONS-Vertrag (was ein Beitrag ist, was eine
 * Quelle mitbringen muss, was vor der Freigabe gilt) und mit 800+ Zeilen
 * ohnehin an der Grenze. Ein Korrekturvorschlag ist etwas anderes: er kommt
 * von DRAUSSEN, von einem Menschen, den wir nicht kennen, und er trägt als
 * einziges Datum des ganzen Layers einen Personenbezug. Diese zwei Dinge in
 * einer Datei zu führen hiesse, den einen Ort zu verwischen, an dem
 * personenbezogene Daten dieses Layers entstehen.
 *
 * ── EINE TABELLE, ZWEI ANLÄSSE ───────────────────────────────────────────
 * `kind: 'correction'` ist „das stimmt so nicht", `kind: 'removal'` ist der
 * Notausgang aus Entscheidung 11 („ohne Diskussion gewährt"). Beide laufen
 * über dieselbe Zeile, denselben Status und dieselbe Entscheidung — sie
 * unterscheiden sich in dem, was eine Annahme AUSLÖST, nicht in dem, was der
 * Mensch schreibt. Zwei Tabellen hätten zwei Arbeitslisten für denselben
 * Vorgang und zwei Antworten auf Anwaltsfrage 3 („funktioniert der
 * Korrekturweg?").
 *
 * ── DIE ADRESSE WIRD KLEINGESCHRIEBEN GESPEICHERT ────────────────────────
 * `contactEmail` ist der LESEPFAD des GDPR-Contributors: „welche Zeilen
 * gehören der Adresse dieses Kontos?" wird als `Query.equal('contactEmail',
 * emailLower)` gestellt, und Appwrite vergleicht Zeichen für Zeichen. Eine
 * Zeile mit `Max@Example.COM` fände diese Abfrage nie — die Auskunft wäre
 * still unvollständig, und genau das ist die teuerste Art, eine
 * Auskunftspflicht zu verfehlen. Die Normalisierung gehört deshalb ins
 * SCHEMA und nicht in die Route (dasselbe Muster wie `emailLower` bei
 * `brand_invites` und `brand_waitlist`).
 *
 * ── FREIWILLIG HEISST: LEER IST GÜLTIG ───────────────────────────────────
 * Wer nichts hinterlassen will, soll trotzdem melden dürfen (§9.3, wie
 * brand-017). Nur eine ANGEGEBENE Adresse muss eine sein — dieselbe
 * `z.union([z.literal(''), …])`-Form wie in
 * `packages/brand/schemas/brandCheck.ts`.
 */

/** `brand` = ein Markenprofil, `post` = ein Beitrag (§9.3). */
export const INSIGHTS_CORRECTION_TARGET_KINDS = ['brand', 'post'] as const
export type InsightsCorrectionTargetKind = (typeof INSIGHTS_CORRECTION_TARGET_KINDS)[number]

/** Die zwei Anlässe (s. Kopf). */
export const INSIGHTS_CORRECTION_KINDS = ['correction', 'removal'] as const
export type InsightsCorrectionKind = (typeof INSIGHTS_CORRECTION_KINDS)[number]

/** Offen → entschieden. Drei Werte, mehr wird der Ablauf nicht (§9.3). */
export const INSIGHTS_CORRECTION_STATUSES = ['open', 'accepted', 'declined'] as const
export type InsightsCorrectionStatus = (typeof INSIGHTS_CORRECTION_STATUSES)[number]

/** Die Spalten-Deckel aus §9.3 — EINMAL, damit Schema und Migration dasselbe meinen. */
export const INSIGHTS_CORRECTION_TARGET_ID_MAX = 64
export const INSIGHTS_CORRECTION_FIELD_MAX = 32
export const INSIGHTS_CORRECTION_PROPOSED_MAX = 300
export const INSIGHTS_CORRECTION_REASON_MAX = 300
export const INSIGHTS_CORRECTION_EMAIL_MAX = 254
export const INSIGHTS_CORRECTION_NOTE_MAX = 300

/**
 * WIE LANGE DIE PERSONENBEZOGENEN FELDER BLEIBEN (§9.3 „Retention und
 * Kaskaden") — 12 Monate ab Anlage, gerechnet in TAGEN.
 *
 * ── DIE EINE ZAHL ────────────────────────────────────────────────────────
 * Der Migrationskopf zeigt auf sie, der Sweep rechnet mit ihr, die
 * Datenschutz-Abschnitte zitieren sie. Zwei Stellen mit derselben Zahl sind
 * beim ersten Ändern zwei verschiedene Fristen — und die eine davon wäre die,
 * die nach aussen versprochen wurde (dieselbe Begründung wie bei
 * `BRAND_EVENTS_RETENTION_MONTHS` und `MARKET_RAW_TTL_MS`).
 *
 * ── TAGE UND NICHT KALENDERMONATE, ANDERS ALS BEI brand_events ───────────
 * Dort rechnet die Zusage in MONATEN („24 Monate"), hier in einem Jahr; 365
 * Tage sind einen Tag KÜRZER als ein Kalenderjahr mit Schalttag, und bei
 * einer Aufbewahrungsfrist ist „kürzer" die sichere Seite. Wichtiger ist der
 * Unterschied im Mechanismus: die Frist steht hier als DATUM in der Zeile
 * (`retentionAt`), nicht als Rechnung über `$createdAt` — deshalb braucht der
 * Sweep keinen Kalender, sondern nur einen Vergleich, und der Lesepfad ist
 * ein Index statt eines Scans.
 */
export const INSIGHTS_CORRECTION_PII_RETENTION_DAYS = 365

/**
 * Der Zeitpunkt, ab dem `contactEmail` und `ipHash` geleert werden.
 *
 * Er wird BEIM ANLEGEN gerechnet und in die Zeile geschrieben (§9.3): so ist
 * die Frist an der Zeile ablesbar, ohne dass jemand die Konstante kennen muss,
 * und ein späterer Wechsel der Frist verlängert NICHT rückwirkend, was schon
 * zugesagt wurde. Der ENTSCHEIDUNGS-Eintrag selbst bleibt dauerhaft — er ist
 * der Nachweis, dass der Korrekturweg funktioniert.
 */
export function insightsCorrectionRetentionAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INSIGHTS_CORRECTION_PII_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/** Was der Sweep von einer Zeile braucht — mehr geht ihn nichts an. */
export interface InsightsCorrectionRetentionRow {
  readonly retentionAt?: string | null
  readonly contactEmail?: string
  readonly ipHash?: string
}

/**
 * IST DIESE ZEILE FÄLLIG? Die pure Regel HINTER der Abfrage des Sweeps —
 * dasselbe Muster wie `brandEventSweepDue` und `marketRawSweepDue`: die
 * Abfrage ist das Netz, die Regel ist die Wahrheit, und nur die Regel lässt
 * sich mit einer Gegenprobe zeigen.
 *
 * Vier Fälle:
 *
 *  1. `retentionAt` liegt in der Vergangenheit ODER genau jetzt UND es steht
 *     noch etwas Personenbezogenes in der Zeile ⇒ JA.
 *  2. `retentionAt` liegt in der Zukunft ⇒ NEIN. Der Normalfall der ersten
 *     zwölf Monate und die Gegenprobe des ganzen Sweeps.
 *  3. Kein oder unlesbares `retentionAt` ⇒ NEIN. Fail-Richtung wie bei
 *     `brandEventSweepDue`: die Zeile ist ein NACHWEIS, und ein unlesbares
 *     Datum als „unendlich alt" zu lesen hiesse, genau den Beleg zu
 *     entwerten, für den es sie gibt. Eine Zeile ohne Frist fällt dem
 *     Betreiber in der Liste auf — eine geleerte nicht mehr.
 *  4. Beide Felder sind schon leer ⇒ NEIN. Ein zweiter Schreibvorgang auf
 *     dieselbe Zeile änderte nichts und zählte trotzdem als „geleert"; der
 *     Sweep meldete dann jeden Tag dieselbe Arbeit.
 *
 * EXAKT AUF DEM STICHTAG heisst FÄLLIG — anders als bei `brandEventSweepDue`,
 * und mit Absicht: dort ist die Grenze eine Aufbewahrungs-ZUSAGE und die
 * Sekunde gehört im Zweifel dem Aufbewahren; hier ist `retentionAt` der
 * Zeitpunkt, AB DEM geleert wird, und die Sekunde gehört der Löschung. Die
 * Abfrage des Sweeps (`lessThanEqual`) zieht dieselbe Grenze — beide Seiten
 * müssen das, sonst zählt der Sweep Zeilen als „geprüft", die er nie anfasst.
 */
export function insightsCorrectionSweepDue(row: InsightsCorrectionRetentionRow, now: Date): boolean {
  if (!row.contactEmail && !row.ipHash) return false
  if (!row.retentionAt) return false
  const due = Date.parse(row.retentionAt)
  if (!Number.isFinite(due)) return false
  return due <= now.getTime()
}

/**
 * EIN KORREKTURVORSCHLAG ODER ENTFERNUNGS-WUNSCH (§9.3).
 *
 * `field` bleibt eine freie Zeichenkette (≤ 32) und ist KEIN Enum: welche
 * Felder eines Profils korrigierbar sind, entscheidet die Redaktions-
 * Oberfläche in I2/I3, und ein neues Feld soll dort ein Eintrag in einer
 * Datei sein — nicht eine Migration auf einer laufenden Instanz (dieselbe
 * Entscheidung wie bei `brand_check_corrections.field`, brand-017).
 *
 * Bei `kind: 'removal'` ist `proposed` leer und `reason` die Sache selbst:
 * ein Entfernungs-Wunsch schlägt keinen anderen Wert vor, er nennt einen
 * Grund. Das Schema verlangt deshalb genau dort eine Begründung.
 */
/**
 * DIE FELDER — EINMAL, weil es seit I3 ZWEI Schemas darüber gibt: den vollen
 * Vertrag (wie eine Zeile aussieht) und die ÖFFENTLICHE Eingabe (was ein
 * fremder Mensch schicken darf). Zwei abgeschriebene Feldlisten wären zwei
 * Deckel über derselben Spalte, von denen einer beim nächsten Umbau grösser
 * wird — wörtlich dasselbe Argument wie bei `insightsPostFields`.
 */
const insightsCorrectionFields = {
  targetKind: z.enum(INSIGHTS_CORRECTION_TARGET_KINDS),
  targetId: z.string().min(1).max(INSIGHTS_CORRECTION_TARGET_ID_MAX),
  kind: z.enum(INSIGHTS_CORRECTION_KINDS),
  field: z.string().trim().max(INSIGHTS_CORRECTION_FIELD_MAX).default(''),
  proposed: z.string().trim().max(INSIGHTS_CORRECTION_PROPOSED_MAX).default(''),
  reason: z.string().trim().max(INSIGHTS_CORRECTION_REASON_MAX).default(''),
  // Freiwillig, kleingeschrieben, leer ist gültig (s. Kopf).
  contactEmail: z.union([
    z.literal(''),
    z.string().trim().toLowerCase().max(INSIGHTS_CORRECTION_EMAIL_MAX).pipe(z.email()),
  ]).default(''),
  status: z.enum(INSIGHTS_CORRECTION_STATUSES).default('open'),
  decisionNote: z.string().trim().max(INSIGHTS_CORRECTION_NOTE_MAX).default(''),
}

/**
 * EIN ENTFERNUNGS-WUNSCH BRAUCHT EINEN GRUND — die Regel als FUNKTION, damit
 * beide Schemas sie LESEN statt sie abzuschreiben.
 *
 * Sie gilt in beide Richtungen gleich: was die Redaktion speichert und was
 * ein Fremder schickt, muss dieselbe Bedingung erfüllen. Eine mildere Regel
 * im öffentlichen Formular ergäbe Zeilen, die der volle Vertrag nicht mehr
 * liest.
 */
export function insightsCorrectionNeedsReason(kind: InsightsCorrectionKind, reason: string): boolean {
  return kind === 'removal' && !reason.trim()
}

export const insightsCorrectionSchema = z.object(insightsCorrectionFields).superRefine((correction, ctx) => {
  if (insightsCorrectionNeedsReason(correction.kind, correction.reason)) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Entfernungs-Wunsch ohne Begründung' })
  }
  // Eine Ablehnung ohne Notiz wäre ein „nein" ohne Antwort — und genau danach
  // fragt Anwaltsfrage 3. Eine ANNAHME braucht keine: dort ist die Änderung
  // selbst die Begründung.
  if (correction.status === 'declined' && !correction.decisionNote) {
    ctx.addIssue({ code: 'custom', path: ['decisionNote'], message: 'Ablehnung ohne Notiz' })
  }
})

export type InsightsCorrection = z.infer<typeof insightsCorrectionSchema>

// ── Die Entscheidung des Betreibers (BI1 I2-Rest, §9.4) ────────────────────

/** Was die Redaktion aus einem offenen Vorschlag machen kann. */
export type InsightsCorrectionDecisionTarget = Exclude<InsightsCorrectionStatus, 'open'>

export type InsightsCorrectionDecision =
  | { ok: true }
  | { ok: false, code: 'already_decided' | 'note_required' }

/**
 * DARF DIESE ZEILE JETZT SO ENTSCHIEDEN WERDEN?
 *
 * Zwei Nein, beide mit eigenem Grund — und ein Ja nur aus `open` heraus.
 *
 * ── `already_decided`: EINE ENTSCHEIDUNG WIRD NICHT ÜBERSCHRIEBEN ────────
 * Anders als bei `brand_check_corrections`, wo ein zweites Annehmen ein
 * nachsichtiges `noop` ist. Der Unterschied liegt in dem, was die Zeile IST:
 * dort ist sie ein Schalter auf einem Wert (derselbe Wert, zweimal
 * geschrieben, ist derselbe Wert). Hier ist sie der NACHWEIS, dass der
 * Korrekturweg funktioniert — genau danach fragt Anwaltsfrage 3 —, und ein
 * `decidedAt`, das beim zweiten Klick weiterrückt, wäre ein Protokoll, das
 * sich selbst umschreibt. Wer wirklich umentscheiden will, tut das sichtbar
 * am Ziel (Beitrag oder Marke), nicht als Nebenwirkung eines zweiten Klicks.
 *
 * ── `note_required`: EIN „NEIN" OHNE ANTWORT IST KEINE ANTWORT ───────────
 * Bei einer ABLEHNUNG ist die Notiz Pflicht, bei einer ANNAHME nicht: dort
 * ist die Änderung selbst die Begründung. Dieselbe Regel steht schon im
 * `insightsCorrectionSchema` (`status === 'declined'` ⇒ `decisionNote`) —
 * hier steht sie ein zweites Mal, weil die Route den Grund VOR dem Schreiben
 * kennen muss, um ihn als `data.code` zurückzugeben. Ein Zod-Fehler trägt
 * keinen fachlichen Schlüssel, und der Mensch vor dem Formular bekäme dann
 * „Eingaben unvollständig" statt „bitte begründen".
 *
 * Die Notiz wird GETRIMMT gemessen: drei Leerzeichen sind keine Begründung.
 */
export function insightsCorrectionDecisionAllowed(
  current: InsightsCorrectionStatus,
  next: InsightsCorrectionDecisionTarget,
  note: string,
): InsightsCorrectionDecision {
  if (current !== 'open') return { ok: false, code: 'already_decided' }
  if (next === 'declined' && !note.trim()) return { ok: false, code: 'note_required' }
  return { ok: true }
}

// ── Der öffentliche Weg (BI1 I3, §9.5) ─────────────────────────────────────

/** Der Honigtopf — ein Feld, das nur ein Skript ausfüllt. */
export const INSIGHTS_CORRECTION_HONEYPOT_MAX = 200

/**
 * DAS ZIEL IST EINE ZEILEN-ID UND SONST NICHTS.
 *
 * Appwrite-Ids sind `[A-Za-z0-9_-]` und höchstens 36 Zeichen lang; der Deckel
 * hier ist die SPALTE (64). Das Muster steht im Schema und nicht in der Route,
 * weil eine Id, die keine sein kann, gar nicht erst in eine Abfrage gehört.
 */
const INSIGHTS_CORRECTION_TARGET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * WAS EIN FREMDER MENSCH SCHICKEN DARF (§9.5, Muster:
 * `createBrandPublicationReportSchema`).
 *
 * Drei Unterschiede zum vollen Vertrag, jeder mit Grund:
 *
 *  · `status` und `decisionNote` FEHLEN. Beides ist die Entscheidung der
 *    Redaktion; ein durchgereichtes `status: 'accepted'` wäre eine Annahme,
 *    die niemand getroffen hat.
 *  · `hp` (Honigtopf) kommt DAZU — und zwar immer mit, nicht erst bei
 *    Verdacht: das Schema ist `.strict()`, und ein Feld, das nur manchmal
 *    mitreist, wäre eine Falle, die sich selbst ankündigt.
 *  · `.strict()` statt Zods nachsichtiger Vorgabe. Bei der Redaktion ist
 *    Wegwerfen richtig (das Formular schickt mit, was es nicht ändern darf);
 *    hier ist ein unbekannter Schlüssel entweder ein Versuch oder ein
 *    Missverständnis — beides soll auffallen.
 *
 * Die Fabrik nimmt `t` entgegen, damit dasselbe Schema das FORMULAR prüfen
 * kann (übersetzte Meldungen, Muster `insightsForms.ts`); die Route ruft sie
 * ohne Argument, weil ein Server keine Anzeigesprache hat.
 */
export function createInsightsCorrectionSubmitSchema(t: (key: string) => string = key => key) {
  return z.object({
    targetKind: insightsCorrectionFields.targetKind,
    targetId: z.string().regex(INSIGHTS_CORRECTION_TARGET_ID_RE),
    kind: insightsCorrectionFields.kind,
    field: insightsCorrectionFields.field,
    proposed: insightsCorrectionFields.proposed,
    reason: insightsCorrectionFields.reason,
    contactEmail: insightsCorrectionFields.contactEmail,
    hp: z.string().max(INSIGHTS_CORRECTION_HONEYPOT_MAX).optional(),
  }).strict().superRefine((correction, ctx) => {
    if (insightsCorrectionNeedsReason(correction.kind, correction.reason)) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: t('insights.correction.reasonRequired') })
    }
  })
}

export type InsightsCorrectionSubmitInput
  = z.output<ReturnType<typeof createInsightsCorrectionSubmitSchema>>

/**
 * DIE DROSSEL DES ÖFFENTLICHEN WEGES (§9.5: „Honeypot und Drossel — 3/Std je
 * IP, Tages-Eimer").
 *
 * ZWEI EIMER, ENG VOR WEIT. Die Stunde fängt den Menschen, der aus Ärger
 * dreimal dasselbe schickt; der Tag fängt das Skript, das die Stunde
 * aussitzt. Beide zählen je ANSCHLUSS (`ipHash`) und nicht je Konto — wer
 * eine fremde Marke beanstandet, hat hier keines.
 *
 * Die Zahlen sind aus dem Gebrauch abgeleitet: wer mehr als drei Korrekturen
 * pro Stunde oder zehn am Tag schickt, korrigiert nicht mehr, sondern flutet
 * die Arbeitsliste — und genau die soll der Nachweis bleiben, dass der
 * Korrekturweg funktioniert (Anwaltsfrage 3).
 */
export const INSIGHTS_CORRECTION_HOUR_LIMIT = 3
export const INSIGHTS_CORRECTION_DAY_LIMIT = 10
export const INSIGHTS_CORRECTION_HOUR_WINDOW_MS = 60 * 60_000
export const INSIGHTS_CORRECTION_DAY_WINDOW_MS = 24 * 60 * 60_000

export type InsightsCorrectionQuotaCode = 'rate_limited_hour' | 'rate_limited_day'

/** Die Schlüssel der zwei Eimer — eigener Namensraum, nie der des brand-Layers. */
export function insightsCorrectionHourKey(ipHash: string): string {
  return `insights:correction:h:${ipHash}`
}

export function insightsCorrectionDayKey(ipHash: string): string {
  return `insights:correction:d:${ipHash}`
}

/**
 * `>` statt `>=` — `store.hit()` zählt diesen Versuch schon mit. Der DRITTE
 * Vorschlag einer Stunde geht also durch, der vierte nicht.
 *
 * Die STUNDE gewinnt bei Gleichstand: sie ist der engere Deckel, und ihr
 * `Retry-After` ist die kürzere und damit ehrlichere Auskunft.
 */
export function decideInsightsCorrectionQuota(
  hourCount: number,
  dayCount: number,
): InsightsCorrectionQuotaCode | null {
  if (hourCount > INSIGHTS_CORRECTION_HOUR_LIMIT) return 'rate_limited_hour'
  if (dayCount > INSIGHTS_CORRECTION_DAY_LIMIT) return 'rate_limited_day'
  return null
}
