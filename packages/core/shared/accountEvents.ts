/**
 * Die eigenen KONTO-EREIGNISSE auf `/profile/activity` — Form und REGELN.
 *
 * Davids Entscheidung vom 2026-11-13 (er hatte sein Profilbild geändert und
 * fand davon nichts unter „Aktivität"): ein Nutzer sieht dort auch, was an
 * seinem KONTO geschah — Änderungen und Sicherheits-Signale, als eigener
 * Abschnitt „Konto und Sicherheit", mit dem ORT statt der IP-Adresse.
 * Normale An- und Abmeldungen stehen bewusst NICHT dabei: bei täglicher
 * Nutzung begraben sie genau die Einträge, für die der Abschnitt da ist.
 *
 * Die Daten gab es schon: `logAuthEvent` (server/utils/authAudit.ts) schreibt
 * sie in `audit_logs`. Es fehlte nur der Weg zum Nutzer — bis dahin durfte
 * allein der Betreiber sie lesen (`audit.read`).
 *
 * ── WARUM EIN ZWEITER VERTRAG NEBEN `accountActivity.ts` ───────────────────
 * Die Konto-Ereignisse ziehen NICHT als neue Arten in `ACCOUNT_ACTIVITY_KINDS`
 * ein. Drei Gründe, alle an der Form festzumachen:
 *  1. Ein `AccountActivityEntry` MUSS eine `communityId` tragen — sie ist der
 *     Gruppierungs-Schlüssel der Seite und der Wert, unter dem der Host
 *     aufgelöst wird. Ein Konto-Ereignis gehört zu KEINER Community; es
 *     bräuchte eine Schein-Community, und die Mischung würde sie zwischen
 *     echte Gruppen sortieren.
 *  2. `title` und `path` (Auszug des eigenen Textes, Sprungziel auf einem
 *     anderen Host) gibt es hier nicht — dafür Feldnamen und einen Ort, die
 *     dort keinen Sinn haben. Eine gemeinsame Form bestünde aus Feldern, die
 *     je nach Art leer sein müssen.
 *  3. Die Quelle ist EINE Tabelle, in die core selbst schreibt. Die Registry
 *     nebenan existiert, weil onboarding kein Produkt-Schema kennen darf;
 *     hier gibt es kein Produkt-Schema zu verstecken.
 * Geteilt wird trotzdem, was die Sicherheit trägt: dieselbe Route, dieselbe
 * `userId` aus der Session, dieselbe Nachprüfung an der Zeile.
 *
 * Hier steht nur, was ohne Appwrite und ohne H3 gilt — das Lesen selbst liegt
 * in `server/utils/accountEvents.ts`.
 */

/**
 * Die Arten — eine GESCHLOSSENE Union, aus demselben Grund wie nebenan: jede
 * braucht einen Text in de UND en (`onboarding.account.activity.account.
 * events.<kind>`), und vue-i18n gibt bei einem fehlenden Text den Schlüssel
 * aus. Wächter: `packages/onboarding/tests/accountActivityTexts.test.ts`.
 *
 * `password_reset` ist KEINE eigene Protokoll-Aktion: geschrieben wird
 * `user.password_changed` mit `method: 'recovery'`. Für den Menschen sind es
 * zwei verschiedene Vorgänge („ich habe es geändert" gegen „jemand kam über
 * den Link aus der Mail hinein") — deshalb zwei Arten.
 *
 * NICHT dabei, mit Grund: `user.login`/`user.logout` (Davids Entscheidung,
 * siehe oben) und `user.self_deleted` (das Konto, das es lesen könnte, gibt
 * es danach nicht mehr).
 */
export const ACCOUNT_EVENT_KINDS = [
  'profile_updated',
  'password_changed',
  'password_reset',
  'recovery_requested',
  'email_verified',
  'mfa_enabled',
  'mfa_disabled',
  'mfa_challenge_failed',
] as const
export type AccountEventKind = (typeof ACCOUNT_EVENT_KINDS)[number]

/**
 * Die Protokoll-Aktionen, die überhaupt gelesen werden — die ABFRAGE filtert
 * darauf, damit das Budget nicht von Anmeldungen aufgezehrt wird (ein Filter
 * erst nach dem Lesen zeigte von 20 Zeilen oft keine einzige).
 */
export const ACCOUNT_EVENT_AUDIT_ACTIONS = [
  'user.profile_updated',
  'user.password_changed',
  'user.recovery_requested',
  'user.email_verified',
  'user.mfa_enabled',
  'user.mfa_disabled',
  'user.mfa_challenge_failed',
] as const

/**
 * Die Profil-Felder, deren NAME gezeigt wird — wieder geschlossen, wieder mit
 * Text je Sprache (`…account.fields.<feld>`). Es sind genau die Namen, die
 * `auth/profile.put.ts` in `metadata.fields` schreibt.
 *
 * Ein unbekannter Name wird VERWORFEN statt angezeigt: was hier durchkäme,
 * stünde als roher Schlüssel in der Oberfläche. Der Eintrag selbst bleibt
 * („Profil geändert"), nur ohne dieses Detail.
 */
export const ACCOUNT_EVENT_PROFILE_FIELDS = ['name', 'avatar', 'bio', 'phone', 'location'] as const
export type AccountEventProfileField = (typeof ACCOUNT_EVENT_PROFILE_FIELDS)[number]

/** Ein Konto-Ereignis, so wie es die Seite bekommt. */
export interface AccountEventEntry {
  /** Row-Id der Protokoll-Zeile — Vue-`key`, nie angezeigt. */
  id: string
  kind: AccountEventKind
  /** ISO-8601, aus `$createdAt` der Zeile. */
  createdAt: string
  /**
   * NUR bei `profile_updated`: welche Felder sich geändert haben. Immer nur
   * die NAMEN — die Werte stehen gar nicht im Protokoll (Datenminimierung
   * beim Schreiben), also kann auch hier keiner auftauchen.
   */
  fields: AccountEventProfileField[]
  /**
   * „Stadt, Region" aus der lokalen Orts-Datenbank; LEER, wenn nichts
   * auflösbar ist. Die IP-Adresse selbst verlässt den Server NICHT (Davids
   * Entscheidung: der Ort reicht, um „das war ich nicht" zu erkennen).
   */
  place: string
}

/** Der Abschnitt „Konto und Sicherheit" in der Antwort der Aktivitäts-Route. */
export interface AccountEventsSection {
  events: AccountEventEntry[]
  /** Es gibt ältere Ereignisse, die nicht mehr ins Budget passten. */
  truncated: boolean
}

/** Was von einer `audit_logs`-Zeile gebraucht wird — mehr liest hier niemand. */
export interface AccountEventAuditRow {
  $id: string
  $createdAt: string
  actorId: string
  action: string
  targetId?: string | null
  metadata?: string | null
  ip?: string | null
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }
  catch {
    // Kaputtes JSON ist kein Grund, den Eintrag zu verschweigen — nur seine
    // Details fehlen dann.
    return {}
  }
}

/** Aktion (+ Methode) → Art; `null` = gehört nicht in diesen Abschnitt. */
export function accountEventKind(action: string, metadata: Record<string, unknown>): AccountEventKind | null {
  switch (action) {
    case 'user.profile_updated': return 'profile_updated'
    case 'user.password_changed': return metadata.method === 'recovery' ? 'password_reset' : 'password_changed'
    case 'user.recovery_requested': return 'recovery_requested'
    case 'user.email_verified': return 'email_verified'
    case 'user.mfa_enabled': return 'mfa_enabled'
    case 'user.mfa_disabled': return 'mfa_disabled'
    case 'user.mfa_challenge_failed': return 'mfa_challenge_failed'
    default: return null
  }
}

/**
 * EINE Protokoll-Zeile → ein Konto-Ereignis, oder `null`.
 *
 * DIE BESITZ-PRÜFUNG STEHT HIER, an der gelesenen Zeile, und zwar doppelt:
 *  - `actorId === userId` — dieselbe Nachprüfung, die der Vertrag der
 *    Aktivitäts-Quellen vorschreibt. Die Abfrage filtert schon darauf; diese
 *    Zeile hält, falls jemand die Abfrage je „optimiert".
 *  - `targetId` LEER — `logAuthEvent` schreibt Selbst-Ereignisse ohne Ziel.
 *    Trägt eine Zeile ein Ziel, hat jemand AN EINEM ANDEREN gehandelt (eine
 *    Admin-Aktion aus `recordAudit`); die gehört in die Betreiber-Ansicht,
 *    nicht in eine Selbstauskunft — auch wenn ihre Aktion einmal gleich hieße.
 * Eine leere `userId` trifft nie zu: Zeilen ohne Verursacher (ein
 * Fehlversuch, bei dem das Konto nicht feststand) gehören niemandem.
 *
 * `place` reicht der Aufrufer herein (aus der IP der Zeile aufgelöst) — so
 * bleibt diese Funktion pur und die IP in der Server-Schicht.
 */
export function accountEventFromAuditRow(
  row: AccountEventAuditRow,
  userId: string,
  place = '',
): AccountEventEntry | null {
  if (!userId || row.actorId !== userId) return null
  if (row.targetId) return null

  const metadata = parseMetadata(row.metadata)
  const kind = accountEventKind(row.action, metadata)
  if (!kind) return null

  // Über die ERLAUBTE Liste laufen, nicht über die gelesene: so bestimmt die
  // Liste die Reihenfolge, und ein unbekannter Name kann gar nicht durchkommen.
  const written: unknown[] = kind === 'profile_updated' && Array.isArray(metadata.fields) ? metadata.fields : []
  const fields = ACCOUNT_EVENT_PROFILE_FIELDS.filter(field => written.includes(field))

  return { id: row.$id, kind, createdAt: row.$createdAt, fields, place }
}

/**
 * Ort in EINER Zeile: „Stadt, Region". Dieselbe Regel wie auf der
 * Sitzungsliste (`formatSessionLocation`), nur ohne Land — das Protokoll kennt
 * keines, und eine zweite Auflösung dafür wäre eine zweite Datenquelle.
 */
export function formatAccountEventPlace(geo: { city: string, region: string } | null | undefined): string {
  if (!geo) return ''
  return [geo.city, geo.region].map(part => part.trim()).filter(Boolean).join(', ')
}
