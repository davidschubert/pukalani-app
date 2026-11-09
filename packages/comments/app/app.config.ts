/**
 * comments meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      // Form entspricht PukalaniAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          // E9: die Moderations-Warteschlange gehört in Davids Struktur unter
          // „Settings · Community" — sie regelt, was in DIESER Community
          // stehen bleibt. scope 'community'; im Silo (apps/comments) ist es
          // dieselbe Seite für den Betreiber, dort greift die Ausnahme
          // „ohne Mandanten sichtbar per Operator-Capability".
          id: 'comments',
          scope: 'community',
          productKey: 'comments',
          labelKey: 'admin.nav.comments',
          icon: 'i-ph-chat-circle',
          to: '/dashboard/comments',
          requiredCapability: 'comments.moderate',
          // U7/G5 (2026-08-11): die Moderations-Warteschlange zieht aus
          // „Einstellungen" in die Gruppe, die nach ihrer Aufgabe heißt. E9
          // hatte sie unter „Settings · Community" verortet, weil sie regelt,
          // was in dieser Community stehen bleibt — genau das ist Moderation.
          group: 'moderation',
          order: 110,
        },
      ],
      /**
       * KENNZAHLEN DES comments-LAYERS (U9/K2, 2026-08-11).
       *
       * Beide standen bis hierher fest verdrahtet im Markup der Übersicht —
       * die letzte Silo-Annahme dieser Seite. Jetzt melden sie sich hier an,
       * und eine App ohne diesen Layer hat sie schlicht nicht.
       *
       * DIE ZAHL zur Kachel `comments` kommt aus dem Verbrauchs-Vertrag
       * (`kind: 'comments'`, server/plugins/community-usage.ts): die Kachel-Id
       * IST der Quota-Posten, deshalb braucht sie keinen eigenen Provider.
       * `commentsReported` hat einen (offene Meldungen sind kein
       * Zeilen-Zähler).
       *
       * BEIDE VERLANGEN `comments.moderate` — und das ist eine ECHTE Änderung
       * gegenüber vorher, nicht eine Übertragung: die Gesamtzahl hing am
       * schwachen `dashboard.access`, die Kachel verlinkte aber nach
       * /dashboard/comments, wohin ein `viewer` oder `editor` nicht darf. Sie
       * war damit für zwei der fünf Rollen ein Link ins 403 (Befund S5). Eine
       * Kachel trägt die Capability ihrer Zielseite.
       */
      stats: {
        comments: {
          scope: 'community',
          productKey: 'comments',
          labelKey: 'comments.stats.total',
          icon: 'i-ph-chat-circle',
          to: '/dashboard/comments',
          requiredCapability: 'comments.moderate',
          order: 110,
        },
        commentsReported: {
          scope: 'community',
          productKey: 'comments',
          labelKey: 'comments.stats.reported',
          icon: 'i-ph-flag',
          to: '/dashboard/comments',
          query: { status: 'reported' },
          requiredCapability: 'comments.moderate',
          order: 120,
        },
      },
      /**
       * DAS EINBETTER-REGISTER IST EIN REITER, KEIN MENÜPUNKT (U8/G7,
       * 2026-08-11). Es stand als Sidebar-Modul unter `/dashboard/embed` —
       * flach, obwohl es eine reine Owner-EINSTELLUNG ist (`community.embed`),
       * die man einmal setzt. Genau diese Willkür hat G7 benannt: was der
       * Community-Hub zeigt, liegt unter `/dashboard/community/*`.
       *
       * `order: 45` setzt ihn zwischen „Eigene Domain" (40) und „Plan" (50):
       * beide Nachbarn beantworten dieselbe Frage wie er — wo diese Community
       * erreichbar ist und wer sie sehen darf. Der Zehnerschritt bleibt für
       * einen künftigen Reiter frei, deshalb die 5.
       *
       * DIE DREI FELDER WANDERN MIT (F37, 2026-08-02) — der Reiter-Vertrag
       * kennt dieselben Gates wie die Modul-Registry, und ohne sie wäre der
       * Umzug ein stiller Rechte-Verlust:
       *
       * 1. `community.embed` statt `system.manage`. Der Eintrag stand bei
       *    „Settings · Community", verlangte aber ein INSTANZ-Label. Im
       *    Silo stimmte das (der Betreiber IST der Einbetter); im Pool war
       *    die Fläche für den Kunden-Owner unerreichbar — und mit ihr die
       *    Seite und die drei Routen. Die Capability trägt der Owner
       *    (communityAuthz.ts) UND der Operator-Admin (ALL_CAPABILITIES),
       *    der Silo-Weg bleibt also unverändert.
       * 2. `configFlag`. Das Widget ist ein Produkt mit Bau-Schalter
       *    (`pukalani.comments.embed.enabled`, Core-Default aus). Ohne
       *    Bindung stünde der Reiter in JEDER App, die den Layer zieht —
       *    und die Seite dahinter antwortet dort 404. Ein Einstieg, der
       *    ins Nichts führt, ist schlimmer als keiner.
       * 3. `productKey`. Betreiber-Schalter zur Laufzeit (app_config).
       */
      communityTabs: [
        {
          id: 'embed-sites',
          scope: 'community',
          productKey: 'comments',
          configFlag: 'comments.embed.enabled',
          labelKey: 'admin.nav.embedSites',
          icon: 'i-ph-plug',
          to: '/dashboard/community/embed',
          requiredCapability: 'community.embed',
          order: 45,
        },
      ],
    },
    comments: {
      /** targetTypes, deren Kommentare NUR Operatoren (admin/moderator)
       *  schreiben und lesen — z. B. 'ticket' (Board-Diskussionen).
       *  Andere Layer/Apps tragen sich hier ein (Array wird konkateniert). */
      operatorTargets: [] as string[],
      /**
       * DER KURATIERTE REAKTIONS-SATZ UNTER DEN ANTWORTEN (F57, Davids
       * Entscheidung 2026-08-13 „Ja, nachbauen").
       *
       * Die Liste steht hier als AUSSAGE dieses Layers, obwohl der Code ohne
       * sie denselben Satz nähme (`allowedReactions()` fällt auf die Registry
       * zurück): so ist an EINER Stelle nachlesbar, was eine Community sieht,
       * und eine App kann sie KÜRZEN, ohne den Layer anzufassen.
       *
       * EIGENER SCHLÜSSEL NEBEN `pukalani.discussions.reactions`, und das ist
       * kein Versehen: Themen und Antworten sind zwei Produkte. Eine Community
       * darf die Leiste unter den Antworten kürzen, ohne die an den Themen
       * anzufassen — und eine Silo-App wie `comments` hat den anderen
       * Schlüssel gar nicht, weil sie den posts-Layer nicht ziehen muss.
       *
       * ERWEITERN GEHT BEWUSST NICHT — was nicht in `REACTION_KEYS`
       * (`packages/core/shared/reactions.ts`) steht, wird verworfen. Dort steht
       * auch, warum weder 👍 noch ❤️ im Satz sind: beide würden neben dem
       * Aufstimm-Pfeil als zweite Zustimmung gelesen, und genau die schließt
       * Konzept-Entscheidung 4 („Like = Upvote") aus.
       */
      reactions: ['laugh', 'tada', 'thinking', 'eyes', 'sad', 'fire', 'thanks', 'idea'],
      /** Auto-Hide-Threshold: ab so vielen OFFENEN Meldungen wird ein Kommentar
       *  automatisch (zweiphasig + Cascade) ausgeblendet — Meldungen bleiben
       *  offen, der Moderator entscheidet final. 0 = aus (Default). */
      autoHideReports: 0,
      /**
       * GÄSTE AUF DEN EIGENEN ÖFFENTLICHEN SEITEN (BI2 K7, 2026-11-09).
       *
       * Bis hierher war Kommentieren ohne Konto ein EMBED-Begriff — der Weg
       * entstand fürs Widget auf fremden Seiten. Die Insights-Artikel von
       * branding.supply sind unsere eigenen öffentlichen Seiten, und ihre Leser
       * haben kein Konto: die Registrierung dort ist Einladungs-Beta, „nur
       * angemeldet" hieße also niemand.
       *
       * Core-Default AUS, die App schaltet bewusst — und die Regel aus
       * `shared/guestComments.ts` bleibt: Gäste schreiben nur, wo Gäste auch
       * LESEN dürfen. Der Bot-Beweis am Formular (Turnstile, Aktion
       * `guest_comment`) hängt NICHT an diesem Schalter, sondern an den zwei
       * Turnstile-Schlüsseln der Instanz.
       */
      guestsOnPublicPages: false,
      /** iframe-Embed (Disqus-Modell, docs/archiv/EMBED-WIDGET.md): /embed-Seite
       *  + public/embed.js. Default aus — die App aktiviert explizit. */
      embed: {
        enabled: false,
        /** Einbetter-Origins für frame-ancestors (zusätzlich zu 'self').
         *  Leer = nur 'self' (kein Fremd-Framing) · ['*'] = jede Seite darf
         *  einbetten (bewusste Betreiber-Entscheidung, Embed-Plan E7). */
        allowedOrigins: [] as string[],
        /** Gast-Kommentare im Widget (Embed-Plan E4, Task 20): Kommentieren
         *  ohne Account (Name+E-Mail, keine Verifikation). Default aus — die
         *  App aktiviert bewusst; greift nur zusätzlich zu `enabled`. */
        guests: false,
      },
    },
  },
})
