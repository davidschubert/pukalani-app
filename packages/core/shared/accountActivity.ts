/**
 * Die eigene Aktivität über alle Communities — Form und REGELN (AH-3).
 *
 * Hier steht nur, was ohne Appwrite, ohne H3 und ohne Layer-Wissen gilt: der
 * Eintrags-Typ, das Mischen mehrerer Beiträge zu EINER Zeitleiste und die
 * Gruppierung nach Community. Das Lesen selbst gehört den Produkt-Layern
 * (`registerAccountActivityContributor`, core/server/utils/accountActivity.ts) —
 * dieselbe Arbeitsteilung wie beim GDPR-Export.
 *
 * WARUM DIE MISCHUNG PUR IST: sie ist die einzige Stelle, an der Einträge aus
 * vier Quellen eine Reihenfolge bekommen, und eine falsche Reihenfolge sieht
 * man einer Liste nicht an. Pur heißt: mit Tests festnagelbar, ohne Instanz.
 */
import type { AccountEventsSection } from './accountEvents'

/**
 * Die Arten, die es gibt — BEWUSST eine geschlossene Union.
 *
 * Jede Art braucht einen Text in de UND en (`account.activity.kinds.<kind>`);
 * ein Rückfall auf eine andere Art würde ein Loch unsichtbar machen (dieselbe
 * Lehre wie bei den Glocken-Texten, C17). Der Wächter dafür ist
 * `packages/core/tests/accountActivity.test.ts`, nicht die Disziplin.
 *
 * Es sind vier, und zwar GENAU die vier, die Davids AH-3-Beschreibung nennt:
 * eigene Beiträge, eigene Kommentare, Event-Zusagen, Kurs-Einschreibungen.
 *
 * KONTO-EREIGNISSE („Profilbild geändert", „Passwort geändert") gehören NICHT
 * hierher, obwohl sie seit 2026-11-13 auf derselben Seite stehen: sie haben
 * keine Community, keinen Titel und kein Sprungziel. Ihr eigener Vertrag samt
 * Begründung: `shared/accountEvents.ts`.
 */
export const ACCOUNT_ACTIVITY_KINDS = ['post', 'comment', 'rsvp', 'enrollment'] as const
export type AccountActivityKind = (typeof ACCOUNT_ACTIVITY_KINDS)[number]

export function isAccountActivityKind(value: string): value is AccountActivityKind {
  return (ACCOUNT_ACTIVITY_KINDS as readonly string[]).includes(value)
}

/**
 * Unter diesem Namen meldet die Route den Konto-Abschnitt als `unavailable`.
 * Mit Bindestrich, damit er nie mit einer Contributor-Id (Layer-Name)
 * zusammenfällt.
 */
export const ACCOUNT_EVENTS_SOURCE_ID = 'account-events'

/** Ein einzelner Beleg eigener Aktivität. */
export interface AccountActivityEntry {
  /** Row-Id des Belegs — Vue-`key` und Dedup-Schlüssel, nie angezeigt. */
  id: string
  /** Welcher Layer ihn beigesteuert hat ('posts' | 'comments' | …). */
  source: string
  kind: AccountActivityKind
  /**
   * `communities.tenantId` (`t-…`) — der Wert, den die Datentür in die Zeile
   * stempelt, und derselbe, unter dem `resolveCommunityHosts()` nachschlägt.
   * ACHTUNG: das ist NICHT `communities.$id` (den trägt die /communities-Karte).
   */
  communityId: string
  /** ISO-8601, aus `$createdAt` der Zeile. */
  createdAt: string
  /** Bereits gekürzter Klartext — die Seite kürzt nicht nach. */
  title: string
  /**
   * Pfad AUF dem Community-Host, mit führendem '/'. Leer = kein Ziel
   * (dann rendert die Seite den Eintrag ohne Link statt eines toten Klicks).
   */
  path: string
}

/** Eine Community mit ihren Einträgen. */
export interface AccountActivityGroup {
  communityId: string
  /**
   * Kanonischer Host, ohne Schema. LEER, wenn der Resolver ihn nicht kennt —
   * das passiert bei stillgelegten und bei `abuse`-gesperrten Communities
   * (`createCommunityHostResolver` lässt beide bewusst weg). Die Einträge
   * bleiben trotzdem stehen: es sind die eigenen, und sie verschweigen wäre
   * eine Lücke in der Selbstauskunft. Klickbar sind sie dann nicht.
   */
  host: string
  entries: AccountActivityEntry[]
}

export interface AccountActivityResponse {
  /**
   * Der Abschnitt „Konto und Sicherheit" — eigene Konto-Ereignisse aus dem
   * Protokoll, OHNE Community und deshalb neben `groups`, nicht darin.
   */
  account: AccountEventsSection
  groups: AccountActivityGroup[]
  /**
   * Es gab mehr Einträge als das Budget — die Seite sagt das, statt eine
   * abgeschnittene Liste als vollständig auszugeben.
   */
  truncated: boolean
  /**
   * Quellen, deren Abfrage fehlgeschlagen ist: Contributor-Ids, dazu
   * `ACCOUNT_EVENTS_SOURCE_ID` für den Konto-Abschnitt. FAIL-SOFT mit ANSAGE:
   * die anderen Quellen erscheinen, und die Seite schreibt hin, dass etwas
   * fehlt. Ein stilles `catch(() => [])` liest sich hier als „du hast dort
   * nichts getan" — das ist der Unterschied zwischen leer und unbekannt.
   */
  unavailable: string[]
}

/** Wie lang ein Titel höchstens wird, bevor er ein Auslassungszeichen bekommt. */
export const ACCOUNT_ACTIVITY_EXCERPT_MAX = 120

/**
 * Klartext-Auszug: Zeilenumbrüche und Mehrfach-Leerzeichen zusammenziehen,
 * dann auf `max` Zeichen kürzen.
 *
 * Der Text kommt aus Markdown-Körpern (`posts.body`, `comments.content`) und
 * wird als TEXT gerendert, nicht als HTML — hier wird deshalb nicht
 * ausgezeichnet, nur beruhigt.
 */
export function accountActivityExcerpt(text: string | null | undefined, max = ACCOUNT_ACTIVITY_EXCERPT_MAX): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max).trimEnd()}…`
}

/**
 * Neueste zuerst, über alle Quellen hinweg.
 *
 * Der Zweit-Schlüssel ist die Row-Id und er ist kein Schmuck: zwei Einträge
 * mit identischem `$createdAt` sind bei Appwrite (Sekunden-Auflösung im
 * ISO-String) alltäglich, und ohne festen Zweit-Vergleich hinge ihre
 * Reihenfolge davon ab, welcher Contributor zuerst geantwortet hat — die
 * Liste sähe dann bei jedem Neuladen anders aus.
 *
 * Dedupliziert über `source:id`, damit ein doppelt registriertes Plugin
 * (HMR) keine Zwillinge in die Liste legt.
 */
export function mergeAccountActivity(
  batches: ReadonlyArray<readonly AccountActivityEntry[]>,
  limit: number,
): AccountActivityEntry[] {
  const seen = new Set<string>()
  const all: AccountActivityEntry[] = []
  for (const batch of batches) {
    for (const entry of batch) {
      const key = `${entry.source}:${entry.id}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(entry)
    }
  }
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  return limit >= 0 ? all.slice(0, limit) : all
}

/**
 * Nach Community gruppieren, Gruppen nach ihrem NEUESTEN Eintrag sortiert.
 *
 * Nicht nach Name oder Host: wer die Seite öffnet, sucht „was habe ich zuletzt
 * gemacht" — die Community, in der das war, gehört nach oben. Innerhalb einer
 * Gruppe bleibt die Reihenfolge, die `mergeAccountActivity` gesetzt hat.
 *
 * `hosts` ist die Karte aus `resolveCommunityHosts()`; ein fehlender Eintrag
 * ist FAIL-SOFT und ergibt `host: ''` (siehe AccountActivityGroup.host).
 */
export function groupAccountActivityByCommunity(
  entries: readonly AccountActivityEntry[],
  hosts: Readonly<Record<string, string>>,
): AccountActivityGroup[] {
  const groups = new Map<string, AccountActivityGroup>()
  for (const entry of entries) {
    const existing = groups.get(entry.communityId)
    if (existing) {
      existing.entries.push(entry)
      continue
    }
    groups.set(entry.communityId, {
      communityId: entry.communityId,
      host: hosts[entry.communityId] ?? '',
      entries: [entry],
    })
  }
  // Die Reihenfolge der Map ist die Einfüge-Reihenfolge, und eingefügt wurde
  // in der bereits sortierten Reihenfolge — die erste Begegnung mit einer
  // Community ist also ihr neuester Eintrag. Kein zweites Sortieren nötig.
  return [...groups.values()]
}
