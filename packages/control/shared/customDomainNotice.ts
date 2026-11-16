import { createHash } from 'node:crypto'

/**
 * DIE ZWEI HINWEISE ZUR FRIST DER EIGENEN DOMAIN — die PURE Hälfte (BE-014).
 *
 * Der Fristen-Lauf im Control Plane STEMPELT `customDomainGraceEndsAt`; der
 * Hinweis-Lauf der Platform-App liest den Stempel und meldet dem Owner
 * zweimal: am ersten Tag (`start`) und drei Tage vor dem Abschalten
 * (`ending`). Ohne Stempel gibt es nichts zu melden — solange das Control
 * Plane nur zählt, schweigt der Hinweis-Lauf von selbst.
 *
 * GENAU EINMAL je (Community, Frist, Art, Empfänger): die Glocken-Zeile
 * entsteht mit fester Id (`customDomainNoticeRowId`), und nur wenn sie NEU
 * entsteht, geht die Mail. Eine NEUE Frist hat ein neues Ende und damit neue
 * Ids — sie meldet wieder.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Wie viele Tage vor dem Abschalten die Erinnerung kommt. */
export const CUSTOM_DOMAIN_NOTICE_ENDING_DAYS = 3

export const CUSTOM_DOMAIN_NOTICE_KINDS = ['start', 'ending'] as const
export type CustomDomainNoticeKind = (typeof CUSTOM_DOMAIN_NOTICE_KINDS)[number]

/** Was der Hinweis-Lauf über eine Community mit laufender Frist wissen muss. */
export interface CustomDomainGraceNotice {
  /** `communities.$id` — Anker der Mitgliedschaften und Teil der Zeilen-Id. */
  communityId: string
  /** `communities.tenantId` — Ablage-Stempel im Pool (Glocke). */
  tenantId: string
  /** Die PUKALANI-Adresse der Community (nie die eigene Domain). */
  host: string
  /** Anzeigename; '' = Bestand ohne Namen. */
  name: string
  /** Die eigene Domain, um die es geht. */
  domain: string
  /** Ende der Frist (ISO) — Teil der Zeilen-Id. */
  graceEndsAt: string
  /** Runtime-User-Ids der aktiven Owner im Pool-Projekt. */
  ownerUserIds: string[]
}

/**
 * PURE (unit-getestet): welche Hinweise sind JETZT fällig?
 *
 *  - `start`, sobald der Stempel steht und das Ende in der Zukunft liegt,
 *  - `ending` zusätzlich, wenn das Ende höchstens drei Tage entfernt ist.
 * Nach dem Ende (der Fristen-Lauf schaltet ab) und bei unlesbarem Datum:
 * nichts. Wer erst am zwölften Tag gemeldet wird (der Hinweis-Lauf war aus),
 * bekommt beide — `start` sagt dann ehrlich das Datum.
 */
export function customDomainNoticesDue(graceEndsAt: string | null | undefined, now: number): CustomDomainNoticeKind[] {
  const end = Date.parse(graceEndsAt ?? '')
  if (!Number.isFinite(end) || end <= now) return []
  return end - now <= CUSTOM_DOMAIN_NOTICE_ENDING_DAYS * DAY_MS ? ['start', 'ending'] : ['start']
}

/**
 * Der Idempotenz-Schlüssel = die Row-Id der Glocken-Zeile. Dieselbe Bauart
 * wie `pastDueNoticeRowId` (sha256, gekürzt auf 28 Hex-Zeichen, lesbares
 * Präfix — Appwrite erlaubt 36 Zeichen): Community + Ende der Frist + Art +
 * Empfänger. Ohne die Art schlüge `ending` an der Zeile von `start` ab, ohne
 * das Ende meldete eine zweite Frist nie, ohne den Empfänger gewönne der erste
 * von zwei Owners.
 */
export function customDomainNoticeRowId(
  communityId: string,
  graceEndsAt: string,
  kind: CustomDomainNoticeKind,
  recipientId: string,
): string {
  const digest = createHash('sha256').update(`${communityId}|${graceEndsAt}|${kind}|${recipientId}`).digest('hex')
  return `cdgrace-${digest.slice(0, 28)}`
}
