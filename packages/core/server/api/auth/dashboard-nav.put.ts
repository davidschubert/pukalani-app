import { z } from 'zod'
import { createSessionClient } from '../../lib/appwrite'
import {
  DASHBOARD_NAV_ID_PATTERN,
  MAX_DASHBOARD_NAV_IDS,
  MAX_DASHBOARD_NAV_ID_LENGTH,
  parseDashboardNavPrefs,
} from '../../../shared/dashboardNav'
import type { DashboardNavResponse } from '../../../shared/types/auth-responses'

/**
 * Persönliche Reihenfolge der Dashboard-Navigation speichern (NAV1 Paket 3,
 * Entscheidung 3 vom 2026-09-08 — docs/plans/DASHBOARD-NAV-JE-PERSON.md).
 *
 * MECHANIK WIE `timezone.put.ts`: Session-Client, `account.updatePrefs` MIT
 * MERGE (updatePrefs ERSETZT sonst bio/avatarUrl & Co.), keine Tabelle. Die
 * Wahl gehört dem KONTO und gilt damit auf jeder Site desselben Konten-Stamms;
 * `/api/auth/` steht in `pukalani.tenancy.controlApiPrefixes`, die Route
 * antwortet also auch auf den Kontroll-Hosts.
 *
 * ZURÜCKSETZEN ENTFERNT DEN SCHLÜSSEL — und zwar bei `null` UND bei einem
 * Dokument ohne brauchbare Liste (`{}`): beides ist dieselbe Aussage „keine
 * eigene Wahl". Es wird NIE ein `{}` gespeichert — das stünde für immer im
 * Prefs-Dokument und müsste bei jeder künftigen additiven Erweiterung
 * mitgedacht werden. Der Editor schickt `{}`, nicht `null`, weil ofetch einen
 * `null`-Body ganz weglässt (Klick-Beweis 2026-09-08); ein FEHLENDER Body
 * bleibt bewusst 400 — ein Client, der seinen Body vergisst, darf nicht still
 * die Wahl löschen. Umgesetzt per Destructuring (`dashboardNav` herausnehmen,
 * Rest übernehmen), nicht per `delete` auf dem Live-Objekt.
 *
 * IDS WERDEN NICHT GEGEN DIE REGISTRY GEPRÜFT: der Server kennt die effektive
 * Modul-Registry der App je Ort nicht (sie entsteht aus dem `extends` der App
 * und den drei Produkt-Gates im Browser), und Zusage 2 von
 * `applyDashboardNavPrefs` macht unbekannte Ids ohnehin harmlos. Geprüft wird
 * nur die FORM — dieselben Zahlen wie in der Regel, aus derselben Datei.
 *
 * STRENGER ALS DAS LESEN, mit Absicht: `parseDashboardNavPrefs` kürzt eine zu
 * lange Liste still (dort liegt ein bestehendes Dokument vor, und „Dashboard
 * weiß" ist die schlechtere Antwort), hier ist sie eine 400 — dort schickt
 * gerade ein Client etwas, das er sich ausgedacht hat.
 */
const navIdSchema = z.string()
  .max(MAX_DASHBOARD_NAV_ID_LENGTH)
  .regex(DASHBOARD_NAV_ID_PATTERN)

const navIdsSchema = z.array(navIdSchema).max(MAX_DASHBOARD_NAV_IDS)

const dashboardNavSchema = z.object({
  groups: navIdsSchema.optional(),
  items: navIdsSchema.optional(),
  hidden: navIdsSchema.optional(),
}).strict()

/** `null` oder `{}` = zurücksetzen. Alles andere muss dem Vertrag entsprechen. */
const bodySchema = z.union([z.null(), dashboardNavSchema])

export default defineEventHandler(async (event): Promise<DashboardNavResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // `dashboardNav` bewusst herausgezogen: beim Zurücksetzen bleibt der Rest
  // stehen, beim Speichern schreibt die Zeile darunter den neuen Wert.
  const { dashboardNav: _previous, ...rest } = event.context.user.prefs

  // Der GESPEICHERTE Stand ist der GELESENE: leere Listen und Doppelungen
  // fallen hier weg, damit Antwort und spätere Anzeige nicht auseinanderlaufen.
  const dashboardNav = body === null ? null : (parseDashboardNavPrefs(body) ?? null)

  // DIE EINE AUSNAHME VOM „SCHLÜSSEL ENTFERNEN": Appwrite 2.0 lehnt ein LEERES
  // Prefs-Dokument ab (`PATCH /account/prefs` mit `{}` ⇒ 400
  // general_argument_invalid „Value must be a valid object" — gemessen
  // 2026-09-08; PHP dekodiert `{}` zu einem leeren Array). Wer außer der
  // Nav-Wahl nichts in seinen Prefs hat, bekäme beim Zurücksetzen also ein
  // 500. Dann bleibt `dashboardNav: {}` stehen — ein Dokument ohne Liste, das
  // `parseDashboardNavPrefs` als „keine Wahl" liest (⇒ undefined). Es ist die
  // einzige Form, in der ein `{}` je gespeichert wird, und sie verschwindet
  // mit dem nächsten Schreiben irgendeiner anderen Pref.
  const nextPrefs = dashboardNav === null
    ? (Object.keys(rest).length ? rest : { dashboardNav: {} })
    : { ...rest, dashboardNav }

  const { account } = createSessionClient(event)
  await account.updatePrefs({ prefs: nextPrefs })

  return { ok: true, dashboardNav }
})
