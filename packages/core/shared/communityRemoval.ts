/**
 * WER ENTFERNT WURDE, IST DRAUSSEN (SEC-030 Teil 2, seit 2026-11-13 — Davids
 * Entscheidung: „Wer entfernt wurde, kann in dieser Community nichts mehr
 * schreiben, auch keine privaten Antworten. Die Person sollte im Grunde
 * genommen keinen Zugriff mehr auf die Community erhalten und den Hinweis
 * erhalten, dass sie von einem Administrator der Community entfernt wurde.")
 *
 * Der pure Teil: der Grund, die Erlaubnisliste der API-Pfade, die eine
 * entfernte Person noch erreicht, und die Reihenfolge, in der „entfernt"
 * erkannt wird. Server-Seite: `server/utils/communityRemoval.ts` und
 * `server/middleware/06.community-removed.ts`; Browser-Seite:
 * `app/middleware/community-removed.global.ts` und der zentrale 403-Leser
 * `app/plugins/community-suspended-notice.client.ts`.
 *
 * „ENTFERNT" IST EINE POSITIVE TATSACHE: es gibt eine `community_members`-Zeile
 * dieser Community mit `status: 'removed'`. Wer nie Mitglied war, hat keine
 * Zeile und ist NICHT entfernt — er sieht weder Hinweis noch Sperre (dieselbe
 * Unterscheidung wie beim Zeichen „Ehemaliges Mitglied",
 * `server/utils/communityMembership.ts`).
 */

/**
 * Der Grund im 403 an eine entfernte Person. Reist als `data: { code }`, der
 * zentrale Fehler-Handler hebt ihn als `reason` ins Envelope.
 */
export const COMMUNITY_REMOVED_CODE = 'community_removed'

/**
 * Der Glocken-Typ der Nachricht einer entfernten Person an die Leitung
 * (onboarding-Layer, `POST /api/community/removed-contact`). Er steht hier,
 * weil zwei Core-Stellen ihn kennen müssen: die Glocke (Lesetext) und der
 * Digest (siehe `notificationMailedSeparately`).
 */
export const MEMBER_APPEAL_NOTIFICATION_TYPE = 'member.appeal'

/**
 * Glocken-Typen, deren Mail ihr Absender SELBST verschickt — der Digest nimmt
 * sie deshalb nicht noch einmal auf.
 *
 * Die Nachricht einer entfernten Person ist Verwaltungs-Post an die Leitung:
 * sie geht GENAU EINMAL als eigene Mail (mit `Reply-To` auf die Absenderin),
 * unabhängig von den Benachrichtigungs-Einstellungen. Stünde sie zusätzlich
 * im Tages-Digest, käme dieselbe Nachricht ein zweites Mal an.
 */
export function notificationMailedSeparately(type: string): boolean {
  return type === MEMBER_APPEAL_NOTIFICATION_TYPE
}

/**
 * DIE ERLAUBNISLISTE DES CORE — so klein wie möglich, jeder Eintrag mit Grund:
 *
 *  - `/api/auth/me` — der Sitzungszustand (Auth-Store `refresh`). Antwortet
 *    nur mit dem EIGENEN Konto, nichts aus der Community. Ohne ihn stünde
 *    eine entfernte Person nach einer Kontoprüfung als abgemeldet da.
 *  - `/api/auth/logout` — der Ausgang. Wer entfernt wurde, muss sich abmelden
 *    können, sonst ist die Hinweisseite eine Sackgasse.
 *  - `/api/health` — Betriebsprüfung ohne Sitzungsdaten; ein 403 dort sähe
 *    für Wächter und Deploy-Beweis wie ein Ausfall aus.
 *  - `/api/_nuxt_icon` — die Symbole der Hinweisseite (Nuxt Icon lädt
 *    fehlende Sätze nach). Liefert SVG-Daten der Symbolbibliothek, nichts aus
 *    einer Community.
 *
 * Weitere Pfade meldet ein Layer über `pukalani.community.removedAllowedApi`
 * an (app.config, tief gemergt, Arrays konkateniert) — der onboarding-Layer
 * trägt dort seine Kontakt-Route ein. Ein expliziter Vertrag statt eines
 * Pfads, den der Core kennen müsste.
 */
export const CORE_REMOVED_ALLOWED_API: readonly string[] = [
  '/api/auth/me',
  '/api/auth/logout',
  '/api/health',
  '/api/_nuxt_icon',
]

/** Ist das überhaupt ein API-Pfad? Nur dort wirft die Sperre. */
export function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/')
}

/**
 * Präfix-Vergleich AN DER SEGMENTGRENZE — dieselbe Regel wie
 * `isAllowedControlPath` (shared/controlCenter.ts): exakter Treffer oder es
 * folgt `/`. `/api/health` öffnet damit nicht `/api/healthcheck-export`.
 */
function matchesPrefix(path: string, prefix: string): boolean {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!base) return false
  return path === base || path.startsWith(`${base}/`)
}

/**
 * Pfade, die der Vergleich nicht ehrlich beurteilen kann — Punkt-Segmente,
 * doppelte Schrägstriche, Rückstriche, Prozent-Kodierung. Für eine
 * Erlaubnisliste gilt: im Zweifel NICHT erlaubt (fail-closed).
 */
function ambiguousPath(path: string): boolean {
  return /(^|\/)\.\.?(\/|$)|\/\/|\\|%/.test(path)
}

/**
 * PURE: Darf eine ENTFERNTE Person diesen API-Pfad noch erreichen?
 *
 * FAIL-CLOSED: nur Pfade auf der Liste (Core + angemeldete Layer-Präfixe)
 * kommen durch; mehrdeutige Pfade nie. `path` ohne Query.
 */
export function removedApiAllowed(path: string, extraPrefixes: readonly string[] = []): boolean {
  if (ambiguousPath(path)) return false
  return [...CORE_REMOVED_ALLOWED_API, ...extraPrefixes].some(prefix =>
    typeof prefix === 'string' && prefix.startsWith('/api') && matchesPrefix(path, prefix))
}

/**
 * Was das Kurzzeit-Gedächtnis des Prozesses über dieses Paar weiß
 * (`server/utils/communityJoin.ts`): gerade entzogen, gerade wieder
 * aufgenommen — oder nichts.
 */
export type CommunityRemovalMemory = 'removed' | 'readmitted' | null

export interface CommunityRemovalSources {
  /** Synchron, ohne Netzwerk. */
  memory: () => CommunityRemovalMemory
  /** Hat die Person eine AKTIVE Rolle? (Rollen-Resolver, 30-s-Cache) */
  hasActiveRole: () => Promise<boolean>
  /** Gibt es eine Zeile mit `status: 'removed'`? (gebündelter Resolver, 60-s-Cache) */
  isFormerMember: () => Promise<boolean>
}

/**
 * PURE (die Quellen werden hineingereicht): IST DIESE PERSON ENTFERNT?
 *
 * Die Reihenfolge ist die Aussage — jede Stufe ist jünger oder billiger als
 * die nächste:
 *
 *  1. Notiz „gerade entzogen" ⇒ JA. Sie schlägt den 30-s-Rollen-Cache (der
 *     noch die alte Rolle kennt) UND den 60-s-Cache „ehemalig" (der kurz vor
 *     dem Entzug „nein" gespeichert haben kann).
 *  2. Notiz „gerade wieder aufgenommen" ⇒ NEIN. Nach einer angenommenen
 *     Einladung sagt der Cache „ehemalig" bis zu 60 s lang noch „ja" — ohne
 *     diese Stufe bliebe eine zurückgeholte Person eine Minute ausgesperrt.
 *  3. Aktive Rolle ⇒ NEIN. Der Normalfall (jedes Mitglied) endet hier, ohne
 *     dass der Resolver „ehemalig" überhaupt gefragt wird.
 *  4. Sonst die positive Tatsache: eine Zeile mit `status: 'removed'`.
 *
 * FAIL-SOFT: eine gestörte Rollen-Auflösung zählt als „keine Rolle" (Stufe 4
 * entscheidet), eine gestörte Stufe 4 als „nein". Begründung beim Aufrufer
 * (`server/utils/communityRemoval.ts`).
 */
export async function detectCommunityRemoval(sources: CommunityRemovalSources): Promise<boolean> {
  const memory = sources.memory()
  if (memory === 'removed') return true
  if (memory === 'readmitted') return false
  if (await sources.hasActiveRole().catch(() => false)) return false
  return await sources.isFormerMember().catch(() => false)
}

/**
 * PURE: Wohin führt die Routen-Middleware eine Seite? `null` = bleiben.
 *
 *  - nur, wenn der Zustand „entfernt" gesetzt UND die Person angemeldet ist
 *    (nach dem Abmelden gilt der Zustand nicht mehr — Login, Startseite und
 *    alles Öffentliche sind dann wieder erreichbar);
 *  - nur, wenn ein Layer eine Hinweisseite angemeldet hat
 *    (`pukalani.community.removedNoticePath`) — der Core allein hat keine;
 *  - nie von der Hinweisseite selbst weg (sonst eine Schleife).
 *
 * `localizedNoticePath` ist der Pfad nach `localePath()`, `toPath` der
 * Zielpfad der Navigation (ohne Query).
 */
export function removedNoticeRedirect(input: {
  removed: boolean
  loggedIn: boolean
  noticePath: string
  localizedNoticePath: string
  toPath: string
}): string | null {
  if (!input.removed || !input.loggedIn || !input.noticePath) return null
  const target = input.localizedNoticePath || input.noticePath
  const strip = (value: string) => (value.length > 1 ? value.replace(/\/+$/, '') : value)
  if (strip(input.toPath) === strip(target)) return null
  return target
}
