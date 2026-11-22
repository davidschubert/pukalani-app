/**
 * EINTRITTSKARTE JE SEITE — die puren Regeln (PK1, Etappe E1a; Plan
 * `docs/plans/PUKALANI-KONTO-E1.md`, § 5 Variante A).
 *
 * Hier steht nur, was ohne Schlüssel und ohne Anfrage rechnet: Modi, Format-
 * Kennung, Inhalt einer Karte und die zwei Fragen „zu welcher Community
 * gehört dieser Host?" und „ist dieser Host eine eigene Domain?". Versiegeln,
 * Öffnen und der Lesepunkt stehen in `core/server/utils/siteCard.ts` und
 * `core/server/utils/requestSession.ts`.
 */
import type { TenantContext } from './types/tenant'

/**
 * Die drei Stufen des Schalters `runtimeConfig.siteCard.mode`
 * (`NUXT_SITE_CARD_MODE`):
 *  - `off`   — der Lesepunkt liest das Cookie genau wie vor E1;
 *  - `read`  — Karten werden geöffnet, Klartext gilt weiter;
 *  - `write` — wie `read`, dazu gilt auf einer eigenen Domain NUR die Karte.
 *    (Das Schreiben der Karte selbst kommt in einer späteren Etappe.)
 */
export const SITE_CARD_MODES = ['off', 'read', 'write'] as const
export type SiteCardMode = (typeof SITE_CARD_MODES)[number]

/**
 * Schalter-Wert → Modus. Leer oder nicht gesetzt ⇒ `off`; ein GESETZTER,
 * aber unbekannter Wert ⇒ `null` (der Aufrufer behandelt das wie `off` und
 * sagt es im Log — ein Tippfehler soll nicht wie eine Absicht aussehen).
 */
export function parseSiteCardMode(raw: unknown): SiteCardMode | null {
  if (raw === undefined || raw === null) return 'off'
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  if (value === '') return 'off'
  return (SITE_CARD_MODES as readonly string[]).includes(value) ? value as SiteCardMode : null
}

/**
 * Format-Kennung vor jeder Karte. Ein Appwrite-Sitzungs-Geheimnis enthält
 * keinen Punkt — ein Cookie-Wert mit dieser Kennung ist also nie Klartext.
 * Ein späteres Format bekommt `c2.`; der Lesepunkt lehnt Unbekanntes ab.
 */
export const SITE_CARD_PREFIX = 'c1.'

/** Trägt dieser Cookie-Wert eine Karte (gleich welcher Fassung)? */
export function looksLikeSiteCard(value: string): boolean {
  return /^c\d+\./.test(value)
}

/** Was in einer Karte steht. Zeiten in Millisekunden seit 1970. */
export interface SiteCardClaims {
  /** Das Appwrite-Sitzungs-Geheimnis. */
  secret: string
  /** Die Appwrite-Sitzung, zu der das Geheimnis gehört. */
  sessionId: string
  /** Das Konto. */
  userId: string
  /** Der Host, für den die Karte gilt (normalisiert: klein, ohne Port). */
  host: string
  /** Die Community dieses Hosts; leer, wenn der Host kein Mandant ist. */
  communityId: string
  /** Ablauf — wie die Appwrite-Sitzung. */
  expiresAt: number
  /** Zeitpunkt der URSPRÜNGLICHEN Anmeldung (bleibt beim Host-Wechsel gleich). */
  authAt: number
}

/**
 * Zu welcher Community gehört der Host dieser Anfrage JETZT? Die Antwort kommt
 * aus dem Mandanten-Kontext, den `00.tenant.ts` gesetzt hat. Ohne Mandant
 * (Kontroll-Host, Einzel-Instanz, Silo-App ohne Trennung) ⇒ leer.
 *
 * `communityId` ist `communities.$id` (der Resolver setzt sie für jede echte
 * Zeile); ein Pool-Kontext ohne sie fällt auf die `tenantId` zurück, damit
 * „Mandant ohne Kennung" nie wie „kein Mandant" aussieht.
 */
export function siteCardCommunityOf(tenant: TenantContext | null | undefined): string {
  if (!tenant) return ''
  if (tenant.communityId) return tenant.communityId
  return tenant.mode === 'pool' ? tenant.tenantId : ''
}

/**
 * Läuft diese Anfrage über eine EIGENE DOMAIN einer Community (eine Adresse,
 * die nicht uns gehört)?
 *
 * Die Antwort kommt aus dem Kontext des Resolvers, nicht aus einer Liste von
 * Endungen: `pukalaniHost` ist die Pukalani-Adresse der Community
 * (`communities.host`). Jeder andere Host, unter dem derselbe Mandant
 * auflöst, ist ihre eigene Domain (oder deren www-/Apex-Form).
 *
 * FAIL-CLOSED: ein Mandant ohne `pukalaniHost` gilt als eigene Domain — der
 * Resolver setzt das Feld für jede echte Zeile; fehlt es, lässt sich „gehört
 * uns" nicht belegen. Ohne Mandant ⇒ nein (Kontroll-Host, Einzel-Instanz).
 */
export function isCustomDomainHost(requestHost: string, tenant: TenantContext | null | undefined): boolean {
  if (!tenant) return false
  const own = (tenant.pukalaniHost ?? '').trim().toLowerCase()
  if (!own) return true
  return requestHost !== own
}

/**
 * Für die Frische-Prüfung (`requireRecentAuth`): der ÄLTERE von
 * `$createdAt` der Sitzung und `authAt` der Karte — nur strenger als ohne
 * Karte. Unlesbares Sitzungs-Datum ⇒ `null` (die Prüfung ist dann fail-closed).
 */
export function olderAuthTime(sessionCreatedAt: string | null | undefined, cardAuthAt: number): string | null {
  if (!sessionCreatedAt) return null
  const createdMs = Date.parse(sessionCreatedAt)
  if (!Number.isFinite(createdMs)) return null
  if (!Number.isFinite(cardAuthAt)) return null
  return new Date(Math.min(createdMs, cardAuthAt)).toISOString()
}
