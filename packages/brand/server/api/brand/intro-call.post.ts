import { ID } from 'node-appwrite'
import { brandIntroTooFast, createBrandIntroCallSchema } from '../../../schemas/brandIntroCall'
import type { BrandIntroCallResponse } from '../../../shared/types/brand'
import { recordBrandEvent } from '../../utils/brandEvents'
import {
  maskBrandIntroEmail,
  notifyBrandIntroOperator,
  resolveBrandIntroProfileId,
  sendBrandIntroConfirmMail,
  toBrandIntroMailInput,
} from '../../utils/brandIntroCall'
import { BRAND_INTRO_REQUESTS_TABLE, brandDb } from '../../utils/brandStore'

/**
 * „ERSTGESPRÄCH ANFRAGEN" — die VIERTE öffentliche Schreib-Route dieses Layers
 * (neben Warteliste, Code-Prüfung und dem Melde-Weg der Galerie) und der
 * Ersatz für die R0-Weiterleitung auf pukalani.studio
 * (BS1 Paket Z0; Plan docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §4.1
 * (a), §7 Zeile Z0, Davids Entscheidung 5 vom 2026-09-07).
 *
 * ── WARUM SIE OHNE SESSION LÄUFT ──────────────────────────────────────────
 * Sie ist der Gesprächs-Einstieg. Die Hälfte der Menschen, die ihn benutzen
 * sollen, kommt von `/about` oder aus dem Brand-Check und hat kein Konto; die
 * andere Hälfte kommt aus der Werkstatt und hat eins. `requireBrandAccess`
 * davor wäre derselbe Zirkel wie bei der Warteliste — die Route existiert für
 * genau die Menschen, die das Beta-Gate nicht passieren.
 *
 * Eine ANGEMELDETE Sitzung wird trotzdem gelesen, aber nur, um die Herkunft zu
 * belegen (s. `resolveBrandIntroProfileId`): sie ist ein Zusatz, nie eine
 * Bedingung.
 *
 * ── ZWEI ZUSTELLWEGE, EINZELN ABGESICHERT ─────────────────────────────────
 * Dieselbe Regel wie im Portfolio-Erstgespräch (Davids Entscheidung
 * 2026-08-21, hier vom Plan §4.1 (a) ausdrücklich übernommen):
 *  · Die ZEILE in `brand_intro_requests` ist das Gedächtnis. Sie überlebt
 *    einen toten Mailserver, und der Betreiber sieht sie unter
 *    /dashboard/intro-calls.
 *  · Die MAILS sind der Weg, auf dem ein Mensch die Anfrage bemerkt (an den
 *    Betreiber) und der Absender seine Quittung bekommt.
 * Erfolg heisst: MINDESTENS EINER ist durchgekommen. Beide tot ⇒ 503 mit
 * `reason: intro_call_unavailable`, damit das Formular seine ehrliche
 * Fehlerzeile zeigt. Ein „ok" auf eine Anfrage, die nirgendwo angekommen ist,
 * wäre die teuerste Lüge dieser Site.
 *
 * ── DIE REIHENFOLGE IST UMGEKEHRT ZUR EINLADUNG, UND ZWAR MIT GRUND ───────
 * Bei einer EINLADUNG gilt „Mail zuerst, Row danach" (M9-Muster, s.
 * `community_invites`): ohne zugestellte Mail gibt es keinen Link, und eine
 * Einladung ohne Link ist keine — die Zeile wäre ein Anspruch ohne Gegenstück.
 * Bei einer ANFRAGE ist es genau andersherum: der Gegenstand IST die Anfrage,
 * und sie ist bereits vollständig, sobald sie abgelegt ist. Die Mail
 * beschleunigt nur, dass ein Mensch sie sieht. Deshalb wird hier ZUERST
 * geschrieben und danach gemailt — verlöre man die Reihenfolge, könnte ein
 * SMTP-Ausfall eine Anfrage kosten, die längst hätte liegen können.
 * Dieselbe Logik steht hinter der Warteliste, die ihre Mail bewusst NICHT
 * fail-soft behandelt: dort ist die Mail der Vorgang, hier ist sie die
 * Benachrichtigung darüber.
 *
 * ── DREI BREMSEN STATT EINER ANMELDUNG ────────────────────────────────────
 * (1) Die DROSSEL in `packages/core/server/middleware/05.rate-limit.ts`
 *     (`brand:intro-call`, 5/min je IP) — sie zählt VOR jedem Appwrite-Ruf und
 *     ist die einzige der drei, die serverseitig misst.
 * (2) Der HONIGTOPF `hp`: gefüllt ⇒ dieselbe 200-Antwort wie sonst, nur ohne
 *     Zeile und ohne Mail. Ein 400 oder eine andere Antwortform wäre eine
 *     Rückmeldung an den Bot, an der er seinen Schreiber verbessert. Die
 *     Antwort behauptet dabei `stored: true` — sie ist die Antwort, die ein
 *     Mensch bekäme, und darin liegt ihr Zweck.
 * (3) Die MINDESTZEIT (`elapsedMs` < 3 s ⇒ 422). Bewusst schwach und
 *     fälschbar, s. `schemas/brandIntroCall.ts`.
 * Dazu, wie überall: `.strict()` mit engen Längen — eine offene Schreibroute
 * ohne Deckel ist ein Speicher-Angebot.
 *
 * ── WAS NICHT INS LOG GEHT ────────────────────────────────────────────────
 * Weder Name noch Nachricht, und die Adresse nur MASKIERT (`x***@domain`,
 * dieselbe Form wie in `core/server/utils/mailer.ts`). Das Log sagt `source`,
 * `locale` und den Zustand — genug, um einer Meldung „meine Anfrage kam nie
 * an" nachzugehen, ohne eine Kontaktliste ins Log zu schreiben. Dasselbe gilt
 * für das Funnel-Ereignis: `intro.submitted` ist ein ZÄHLER
 * (`brandEvents.ts` Regel 1 — nie Inhaltstext).
 *
 * ── `intro.viewed` IST BEWUSST NICHT GEBAUT ───────────────────────────────
 * Der Plan nennt zwei Ereignisse. Das zweite bräuchte eine ÖFFENTLICHE
 * Schreib-Route, die auf einer anonymen Seite bei jedem Aufbau feuert — eine
 * neue Angriffsfläche und ein neuer Drossel-Eimer, um eine Zahl zu zählen, die
 * heute niemand auswertet (branding.supply hat bewusst keine
 * Reichweitenmessung, Plan §1.1). Der Seitenaufruf steht als SSR-Zeile im
 * Server-Log; wer den Trichter wirklich messen will, führt zuerst die Messung
 * ein, nicht ihr Ereignis. Notiert in §7.3 des Plans.
 */
export default defineEventHandler(async (event): Promise<BrandIntroCallResponse> => {
  const body = await readValidatedBody(event, createBrandIntroCallSchema().parse)

  // Der Honigtopf. Die Antwort ist ununterscheidbar von der echten — nur dass
  // nichts geschrieben und niemand benachrichtigt wird.
  if (body.hp) {
    logEvent('info', 'brand.intro_call_honeypot', { source: body.source, locale: body.locale })
    return { ok: true, stored: true, mailed: true }
  }

  // Die dritte Bremse. 422 und nicht 400: der Rumpf ist gültig, nur zu früh —
  // und das Formular soll „einen Moment noch" sagen können statt „ungültige
  // Eingabe".
  if (brandIntroTooFast(body.elapsedMs)) {
    logEvent('info', 'brand.intro_call_too_fast', { source: body.source, locale: body.locale })
    throw createError({
      status: 422,
      statusText: 'Submitted too fast',
      data: { code: 'too_fast' },
    })
  }

  // Die Sitzung ist ein ZUSATZ: sie belegt die Herkunft und macht die Anfrage
  // dem Konto zuordenbar (GDPR-Export). Ohne sie läuft alles Weitere gleich —
  // deshalb `event.context.user` (die Auth-Middleware des Core füllt es, wenn
  // ein gültiges Cookie da ist) statt eines `require*`, das werfen würde.
  const userId = event.context.user?.$id ?? ''
  const profileId = await resolveBrandIntroProfileId(event, { profileId: body.profileId, userId })

  const stored = await (async () => {
    try {
      const { tablesDB, databaseId } = brandDb(event)
      await tablesDB.createRow({
        databaseId,
        tableId: BRAND_INTRO_REQUESTS_TABLE,
        rowId: ID.unique(),
        data: {
          name: body.name,
          // `email` ist vom Schema schon getrimmt und kleingeschrieben — der
          // Vergleichswert und die Anrede sind hier also derselbe String.
          // Beide Spalten stehen trotzdem EXPLIZIT (CLAUDE.md: `createRow`
          // verlangt jede Spalte), damit ein späterer Wechsel zur
          // Original-Schreibweise eine Entscheidung an dieser Stelle ist.
          email: body.email,
          emailLower: body.email,
          company: body.company,
          message: body.message,
          phone: body.phone,
          locale: body.locale,
          source: body.source,
          profileId,
          userId,
          status: 'new',
          note: '',
        },
      })
      return true
    }
    catch (error) {
      logEvent('warn', 'brand.intro_call_row_failed', {
        source: body.source,
        locale: body.locale,
        email: maskBrandIntroEmail(body.email),
        message: error instanceof Error ? error.message : 'unknown',
      })
      return false
    }
  })()

  const mailInput = toBrandIntroMailInput(body, profileId)
  // Nebeneinander, nicht nacheinander: die zwei Mails gehen an verschiedene
  // Menschen und hängen nicht voneinander ab. Beide fangen ihre Fehler selbst.
  const [notified, confirmed] = await Promise.all([
    notifyBrandIntroOperator(event, mailInput),
    sendBrandIntroConfirmMail(event, mailInput),
  ])

  // Die BESTÄTIGUNG entscheidet, was das Formular sagen darf („schaut in euer
  // Postfach"). Die Betreiber-Meldung ist für den Absender unsichtbar und darf
  // seine Antwort deshalb nicht verändern — sie zählt nur für die Frage, ob
  // die Anfrage überhaupt irgendwo angekommen ist.
  if (!stored && !notified && !confirmed) {
    throw createError({
      status: 503,
      statusText: 'Intro request could not be delivered',
      data: { code: 'intro_call_unavailable' },
    })
  }

  // Fail-soft und NACH der Ablage: ein Ereignis ist eine Beobachtung, und eine
  // Anfrage, die wegen einer vollen Ereignis-Tabelle mit 500 quittiert würde,
  // wäre der teuerste denkbare Tausch (`brandEvents.ts` Regel 2).
  await recordBrandEvent(event, {
    type: 'intro.submitted',
    ...(profileId ? { profileId } : {}),
    ...(userId ? { userId } : {}),
    payload: {
      source: body.source || 'direct',
      locale: body.locale,
      stored,
      notified,
      withProfile: Boolean(profileId),
      withPhone: Boolean(body.phone),
    },
  })

  logEvent('info', 'brand.intro_call_submitted', {
    source: body.source,
    locale: body.locale,
    stored,
    notified,
    confirmed,
  })

  return { ok: true, stored, mailed: confirmed }
})
