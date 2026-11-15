/**
 * `messages` meldet seine Dashboard-Flächen bei den Registries des Cores an
 * (`pukalani.admin.modules` + `pukalani.admin.settingsTabs`, deep-merged) —
 * das Admin-Layout rendert sie capability-gefiltert (Layer-Grenze A14).
 *
 * DREI EINTRÄGE, DREI ZIELGRUPPEN — dasselbe Muster und derselbe Grund wie bei
 * posts (C16): eine Registrierung trägt genau EINE `requiredCapability`, und
 * die drei Gruppen überschneiden sich nicht.
 */
export default defineAppConfig({
  pukalani: {
    account: {
      /** Zeile in „Was beim Löschen geschieht" (AuthAccountDeleteCard, core): private Nachrichten werden gelöscht, gemeldete bleiben bis zu 90 Tage als Beleg. */
      deleteNotices: ['messages.account.deleteNotice'],
    },
    chrome: {
      /**
       * DER EINSTIEG NEBEN DEM NAMEN (F56, Konzept § 1) — die eine Zeile, mit
       * der „Nachricht schreiben" an fremden Autorenzeilen erscheint.
       *
       * Dieselben zwei Tore wie die Menüpunkte unten, und aus demselben Grund
       * (Gate-Asymmetrie, F51): ein Knopf ohne Plan wäre sichtbar, klickbar
       * und eine Sackgasse. Owner-Schalter und Vertrauensstufe kann eine
       * Config nicht kennen — die prüft die Hülle selbst.
       */
      authorActions: {
        messages: {
          component: 'MessageWriteAuthorAction',
          productKey: 'messages',
          planProduct: 'messages',
          order: 10,
        },
      },
    },
    admin: {
      modules: [
        {
          /**
           * DER POSTEINGANG — für JEDES Mitglied.
           *
           * `dashboard.access` ist die Capability des VIEWERS, also der Rolle,
           * die jeder Beitritt vergibt. Das ist Absicht: EMPFANGEN geht ab
           * Vertrauensstufe 0 (Konzept § 2.4, Folge 1), und wer angeschrieben
           * wurde, muss seinen Posteingang öffnen können — sonst wäre die
           * erste Nachricht an ein junges Konto unzustellbar.
           *
           * Das Gate fürs ERÖFFNEN sitzt an der Route (`messages.write`), und
           * die Seite selbst blendet den Knopf entsprechend aus. Ein
           * Menüpunkt, den man erst ab TL1 sähe, wäre die falsche Grenze am
           * falschen Ort.
           */
          id: 'messages',
          scope: 'community',
          productKey: 'messages',
          // Tarif-Gate (C2/P4): im Pool ab Personal — dieselbe Zuordnung, die
          // `requirePlanProduct` an /api/messages durchsetzt.
          planProduct: 'messages',
          labelKey: 'messages.nav.inbox',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/messages',
          requiredCapability: 'dashboard.access',
          group: 'products',
          order: 90,
        },
        {
          /**
           * DIE MELDE-WARTESCHLANGE. Sie ist keine Kür, sondern die Bedingung
           * dafür, dass dieser Layer `targetType: 'message'` überhaupt
           * registrieren darf — ein meldbarer Typ ohne Warteschlange ist ein
           * „Versprechen ins Leere" (moderation/server/utils/reportTargets.ts).
           */
          id: 'messages-reports',
          scope: 'community',
          productKey: 'messages',
          planProduct: 'messages',
          labelKey: 'messages.nav.reports',
          icon: 'i-ph-flag-banner',
          to: '/dashboard/message-reports',
          requiredCapability: 'reports.moderate',
          // U7/G5 (2026-08-11): die Melde-Warteschlange stand unter
          // „Einstellungen" — dort stellt ein Moderator nichts ein.
          group: 'moderation',
          order: 100,
        },
      ],
      communityTabs: [
        {
          /**
           * DER OWNER-SCHALTER (Konzept § 2.6, Davids Entscheidung 4).
           *
           * Als EINSTELLUNGS-REITER und nicht als eigener Menüpunkt: er wird
           * einmal gesetzt und danach nie wieder angefasst — genau das
           * unterscheidet eine Einstellung von einer Fläche.
           *
           * Seit F51 (2026-08-07) in der COMMUNITY-Hülle statt in der Konto-
           * Hülle: „darf es hier private Nachrichten geben?" ist eine
           * Entscheidung über die Community, nicht über das eigene Konto.
           *
           * U8/G7 (2026-08-11): und seither heißt der Pfad `private-messages`
           * statt `messages`. Er lag EIN Segment neben dem Posteingang
           * (`/dashboard/messages`, jedes Mitglied) — zwei Adressen mit
           * verschiedenen Publika, die sich um ein Wort unterschieden. Der
           * Menü-NAME war nie das Problem („Private Nachrichten" stand längst
           * da), die Adresse schon.
           */
          id: 'messages',
          scope: 'community',
          // DASSELBE TOR WIE DIE SEITE (Session-Audit 2026-08-09). Die Seite
          // dahinter hängt an `requirePlanProduct(event, 'messages')` und
          // antwortet ohne den Tarif hart 404 — ein Reiter ohne diese Felder
          // ist genau die Gate-Asymmetrie, gegen die F51 sie eingeführt hat:
          // sichtbar, klickbar, Sackgasse. Die Schwester `messages-reports`
          // oben trägt sie längst.
          productKey: 'messages',
          planProduct: 'messages',
          labelKey: 'messages.nav.settings',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/community/private-messages',
          requiredCapability: 'messages.manage',
          order: 60,
        },
      ],
    },
  },
})
