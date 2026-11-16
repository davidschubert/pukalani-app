// Cross-Layer als EXPLIZITER Vertrag (A14): der Onboarding-Vertrag gehört dem
// Control Plane (es besitzt tenants/community_members) — dieser Layer konsumiert ihn,
// definiert ihn aber nicht. Reine Zod-/Daten-Module, kein Laufzeit-Coupling.
import { onboardingSiteSchema } from '../../../../control/schemas/onboarding'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'
import {
  OPERATOR_TERMS_RECORD_FAILED_CODE,
  OPERATOR_TERMS_REQUIRED_CODE,
  resolveOperatorTerms,
  splitOperatorTerms,
  type OperatorTermsConfig,
} from '../../../shared/operatorTerms'
// Der pages-Layer besitzt die Tabelle und stellt die Seed-Helfer bereit (A14).
import { seedHomePage } from '../../../../pages/server/utils/seedHomePage'
import { seedLegalPages } from '../../../../pages/server/utils/seedLegalPages'

/**
 * Community anlegen — der öffentliche Abschluss des Wizards (Schritt 7).
 *
 * Diese Route erzeugt selbst NICHTS: sie beweist die Session, mintet ein
 * kurzlebiges JWT und lässt das Control Plane anlegen. Damit bleibt genau eine
 * Stelle im System schreibberechtigt auf das Mandanten-Register.
 */
export interface CreatedSite {
  communityId: string
  host: string
  url: string
  plan: string
  trialEndsAt: string | null
  tenantId: string
  reused: boolean
}

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const userId = event.context.user.$id

  /**
   * BETREIBER-BEDINGUNGEN (seit 2026-11-16, Regeln: shared/operatorTerms.ts).
   * Das Kästchen wird IMMER vom Body abgenommen — das Schema des Control
   * Plane ist `.strict()` und wird getrennt ausgerollt, ein neues Feld im
   * Umschlag wäre dort ein 400. Bei eingeschaltetem Schalter ist es Pflicht,
   * und zwar VOR dem JWT und vor dem Control Plane: ohne Bestätigung entsteht
   * nichts — und ohne festgehaltene Bestätigung auch nicht (s. unten).
   */
  const { accepted, rest } = splitOperatorTerms(await readBody(event))
  const appConfig = useAppConfig() as { pukalani?: { onboarding?: { operatorTerms?: OperatorTermsConfig } } }
  const operatorTerms = resolveOperatorTerms(appConfig.pukalani?.onboarding?.operatorTerms)
  if (operatorTerms && !accepted) {
    throw createError({
      status: 400,
      statusText: 'Operator terms not accepted',
      data: { code: OPERATOR_TERMS_REQUIRED_CODE },
    })
  }

  const parsed = onboardingSiteSchema.safeParse(rest)
  if (!parsed.success) {
    // Dieselbe Antwort wie vorher `readValidatedBody`: 400, ohne Grund-Code.
    throw createError({ status: 400, statusText: 'Validation Error' })
  }
  const site = parsed.data

  /**
   * DER NACHWEIS STEHT, BEVOR ETWAS ENTSTEHT: EINE Zeile je (Konto,
   * `operator`, Fassung) — der Server hat das Kästchen in DIESER Anfrage
   * gesehen. Lässt sie sich nicht schreiben, entsteht keine Community (503):
   * eine Community ohne festgehaltene Bestätigung wäre genau die Lücke, für
   * die es das Kästchen gibt („eine Sicherung, die nicht prüfen kann, lehnt
   * ab"). Umgekehrt schadet eine Zeile ohne Community nicht — bestätigt hat
   * die Person in dieser Anfrage trotzdem (etwa wenn die Adresse danach schon
   * vergeben ist). Eine schon stehende Zeile bleibt unverändert (409 =
   * `exists`), also auch bei einer wiederholten Anlage. Der Eintrag im Log
   * nennt nur die Konto-Kennung.
   */
  if (operatorTerms) {
    await writeConsentRecord(event, {
      userId,
      kind: 'operator',
      version: operatorTerms.version,
      way: 'wizard',
    }).catch((error: unknown) => {
      logEvent('error', 'onboarding.operator_terms_record_failed', {
        userId,
        message: error instanceof Error ? error.message : String(error),
      })
      throw createError({
        status: 503,
        statusText: 'Operator terms could not be recorded',
        data: { code: OPERATOR_TERMS_RECORD_FAILED_CODE },
      })
    })
  }

  const jwt = await mintRuntimeJwt(event)

  const result = await callControlPlane<CreatedSite>(event, '/api/control/onboarding/site', { jwt, site })

  // Das Site-Label sofort, nicht erst beim ersten Besuch: der Wizard leitet
  // direkt auf den frischen Community-Host weiter, und dort soll der Gründer
  // ohne Umweg lesen können. Der Helfer lebt seit A4 in core (auto-import) und
  // wird ab jetzt zusätzlich von server/middleware/06.community-label.ts an JEDES
  // Mitglied vergeben — hier bleibt er, weil dieser Request auf dem
  // KONTROLL-Host läuft, wo es noch keinen Mandanten-Kontext gibt.
  await grantCommunityLabel(event, result.communityId)

  // Erste Startseite (Schritt 8). BEST EFFORT und bewusst nach der Anlage: die
  // Community existiert schon: an einer fehlgeschlagenen Seite darf sie nicht
  // scheitern. Der Owner sieht dann die Willkommens-Variante und kann selbst
  // eine anlegen — der Fehler steht im Log, nicht im Gesicht des Kunden.
  if (!result.reused) {
    /**
     * BEIDE SPRACHEN, DERSELBE TEXT (Trichter-M4).
     *
     * Gesät wurde bisher nur `site.locale`; GELESEN wird die Startseite aber
     * für die aktuelle UI-Locale des Besuchers (apps/platform/app/pages/
     * index.vue). Ein englischsprachiger Gast auf einer deutsch angelegten
     * Community sah deshalb den Platzhalter „Diese Community ist gerade im
     * Aufbau" — obwohl eine Startseite existierte und der Owner einen Text
     * dafür geschrieben hatte.
     *
     * ÜBERSETZT WIRD NICHTS: die Beschreibung aus dem Wizard ist Nutzertext
     * und gehört der Community; sie steht in beiden Sprachfassungen wörtlich
     * gleich. Nur der Rückfalltext (leere Beschreibung) ist je Sprache
     * gefasst. `seedHomePage` ist idempotent je (Community, slug, locale) und
     * fasst bestehende Zeilen nie an — der Owner kann jede Fassung danach
     * einzeln ändern, ohne dass ein zweiter Lauf sie überschreibt.
     */
    for (const locale of ['de', 'en'] as const) {
      await seedHomePage(event, {
        tenantId: result.tenantId,
        locale,
        title: site.name,
        description: site.description,
        fallbackBody: locale === 'en'
          ? `Welcome to ${site.name}. This page is yours — edit it in the dashboard whenever you like.`
          : `Willkommen bei ${site.name}. Diese Seite gehört dir — du kannst sie im Dashboard jederzeit ändern.`,
      }).catch((error) => {
        logEvent('error', 'onboarding.home_page_failed', {
          communityId: result.communityId,
          locale,
          message: error instanceof Error ? error.message : String(error),
        })
        return null
      })
    }

    // Impressum + Datenschutz als VORLAGEN-ENTWÜRFE (Audit-Befund S7). Bewusst
    // unveröffentlicht: der Kunde ist Betreiber seiner Community, er muss die
    // Angaben selbst machen und selbst veröffentlichen — ein Rechtstext voller
    // Platzhalter darf nie öffentlich erreichbar sein. Best effort wie die
    // Startseite: die Community existiert schon, daran darf sie nicht scheitern.
    await seedLegalPages(event, {
      tenantId: result.tenantId,
      locale: site.locale ?? 'de',
    }).catch((error) => {
      logEvent('error', 'onboarding.legal_pages_failed', {
        communityId: result.communityId,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })

    // Community-Regeln als VERÖFFENTLICHTE Startseite (F1 Stufe 2, Davids
    // Entscheidung 6: nur Guidelines). Anders als die Rechtstexte darüber
    // trägt sie keine Platzhalter und funktioniert unverändert — Regeln, die
    // niemand sehen kann, sind keine. Best effort wie alles hier: die
    // Community existiert schon, daran darf sie nicht scheitern.
    await seedGuidelinesPage(event, {
      tenantId: result.tenantId,
      locale: site.locale ?? 'de',
    }).catch((error) => {
      logEvent('error', 'onboarding.guidelines_page_failed', {
        communityId: result.communityId,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })

    /**
     * DER ERSTE BEITRAG IM FEED (Benchmark-E2) — der erste Zustand darf nicht
     * leer sein. EINMAL und in `site.locale`, nicht in beiden Sprachen wie die
     * Startseite: `community_posts` hat kein locale-Feld und der Feed filtert
     * nicht danach — ein Beitrag ist genau ein Beitrag, in genau der Sprache,
     * in der er geschrieben wurde. Zwei Fassungen wären zwei Beiträge.
     *
     * Über die core-Registry `registerCommunityFirstContentProvider`, NICHT
     * per Import: `onboarding` ist ein Naht-Layer und darf `posts` nicht
     * kennen (A14 — anders als `pages`, das für Naht-Layer erlaubt ist und
     * deshalb oben direkt importiert werden darf). Eine App ohne Feed-Produkt
     * hat keinen Anbieter, dann passiert hier schlicht nichts.
     *
     * Das `.catch()` fehlt hier bewusst: der Registry-Helfer ist SELBST
     * fail-soft (er protokolliert und schluckt) — die Sicherung sitzt einmal
     * im Vertrag statt an jeder Aufrufstelle.
     */
    if (event.context.user) {
      await seedCommunityFirstContent(event, {
        tenantId: result.tenantId,
        ownerUserId: event.context.user.$id,
        ownerName: event.context.user.name ?? '',
        siteName: site.name,
        description: site.description,
        category: site.category,
        locale: site.locale ?? 'de',
      })
    }

    /**
     * „Deine Community steht" (Trichter-G6) — der einzige Beleg, der den
     * geschlossenen Tab überlebt: Adresse, Dashboard, Kundenbereich, Ende der
     * Testphase.
     *
     * NUR BEI EINER ECHTEN NEUANLAGE (im `!reused`-Zweig): ein Retry oder ein
     * Doppelklick soll keine zweite Bestätigung derselben Community
     * verschicken.
     *
     * BEST EFFORT wie die Saat darüber — die Community existiert schon, an
     * einem SMTP-Aussetzer darf die Anlage nicht scheitern. Der Kundenbereich
     * kommt aus der Konfiguration (`controlHosts`), nicht aus einer festen
     * Zeichenkette: dieser Request LÄUFT auf genau diesem Host, und beim
     * nächsten Host-Umzug wandert die Mail von selbst mit.
     */
    const accountHost = controlHosts(event)[0]
    if (event.context.user?.email && accountHost) {
      await sendCommunityReadyMail(event, {
        to: event.context.user.email,
        siteName: site.name,
        host: result.host,
        accountHost,
        trialEndsAt: result.trialEndsAt,
        wizardLocale: site.locale ?? 'de',
        prefs: event.context.user.prefs as Record<string, unknown> | undefined,
      }).catch((error) => {
        logEvent('error', 'onboarding.ready_mail_failed', {
          communityId: result.communityId,
          message: error instanceof Error ? error.message : String(error),
        })
        return false
      })
    }
  }

  logEvent('info', 'onboarding.site_requested', {
    communityId: result.communityId,
    host: result.host,
    reused: result.reused,
  })
  return result
})
