/**
 * posts meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte"). Im Silo dieselbe
          // Seite für den Betreiber — die Ausnahme ohne Mandanten trägt das.
          id: 'posts',
          scope: 'community',
          productKey: 'posts',
          // C2: im Pool erst ab Personal — dieselbe Zuordnung, die
          // `requirePlanProduct` an /api/posts durchsetzt, und dieselbe, die
          // der öffentliche Feed-Eintrag schon trägt (blueprint app.config).
          planProduct: 'posts',
          labelKey: 'admin.nav.posts',
          icon: 'i-ph-chat-text',
          to: '/dashboard/posts',
          requiredCapability: 'posts.moderate',
          // U7/G5 (2026-08-11): die Moderationsfläche zieht aus „Produkte" in
          // die neue Gruppe „Moderation" — sie ist die Aufsicht über den
          // Inhalt, nicht das Produkt selbst. Die drei Geschwister unten
          // bleiben, wo sie sind. Der Pfad ändert sich nicht.
          group: 'moderation',
          order: 10,
        },
        {
          // C16: ZWEI Einträge auf dasselbe Produkt, und das ist kein Versehen.
          // Eine Registrierung trägt genau EINE `requiredCapability` — und die
          // beiden Zielgruppen überschneiden sich nicht: ein Editor hat
          // `posts.write` OHNE `posts.moderate`, ein Moderator umgekehrt
          // (communityAuthz.ts — Editor und Moderator sind Geschwister, kein
          // Chain). Ein einzelner Eintrag müsste sich für eine der beiden
          // entscheiden und ließe die andere Rolle vor einer Wand stehen; genau
          // so war `posts.write` bis hierher eine Capability ohne jede Fläche.
          // Admin und Owner halten beide Capabilities und sehen deshalb beide
          // Einträge — das ist richtig so, es sind zwei verschiedene Aufgaben
          // (fremde Beiträge moderieren vs. eigene verwalten).
          id: 'posts-mine',
          scope: 'community',
          productKey: 'posts',
          planProduct: 'posts',
          labelKey: 'admin.nav.myPosts',
          icon: 'i-ph-article',
          to: '/dashboard/my-posts',
          requiredCapability: 'posts.write',
          group: 'products',
          order: 20,
        },
        {
          // F1 Stufe 1: die STRUKTUR der Discussions. Dritter Eintrag auf
          // dasselbe Produkt, aus demselben Grund wie der zweite (C16): eine
          // Registrierung trägt genau EINE `requiredCapability`, und
          // `posts.manage` hat weder der Editor noch der Moderator — sie
          // gehört dem Admin (communityAuthz.ts). Ein Eintrag, der sich eine
          // der drei Capabilities aussuchen müsste, ließe zwei Rollen vor
          // einer Wand stehen.
          id: 'posts-categories',
          scope: 'community',
          productKey: 'posts',
          planProduct: 'posts',
          labelKey: 'posts.nav.categories',
          icon: 'i-ph-chats-circle',
          to: '/dashboard/categories',
          requiredCapability: 'posts.manage',
          group: 'products',
          order: 30,
        },
        {
          // F1 Teilpaket 3: die Vertrauensstufen. VIERTER Eintrag auf dasselbe
          // Produkt, aus demselben Grund wie der zweite und dritte (C16) — eine
          // Registrierung trägt genau EINE `requiredCapability`, und
          // `posts.appoint` hat AUSSCHLIESSLICH der Owner (communityAuthz.ts).
          //
          // Warum eine eigene Seite und nicht ein Abschnitt in
          // /dashboard/categories: die Kategorien-Seite verlangt
          // `posts.manage` und steht damit auch dem Admin offen. Ein Abschnitt
          // darin, den nur der Owner bedienen darf, wäre für jeden Admin eine
          // Wand — genau die Lage, die C16 hier schon einmal aufgelöst hat.
          id: 'posts-trust-levels',
          scope: 'community',
          productKey: 'posts',
          planProduct: 'posts',
          labelKey: 'posts.nav.trustLevels',
          icon: 'i-ph-medal',
          to: '/dashboard/trust-levels',
          requiredCapability: 'posts.appoint',
          group: 'products',
          order: 40,
        },
      ],
      /**
       * KENNZAHL DES posts-LAYERS (U9/K2, 2026-08-11) — die Kachel „Beiträge"
       * auf der Übersicht.
       *
       * DIE ZAHL kommt aus dem Verbrauchs-Vertrag, den dieser Layer schon
       * bedient (`kind: 'posts'`, server/plugins/community-usage.ts): die
       * Kachel-Id IST der Quota-Posten. Kein eigener Provider, kein zweiter
       * Zähler — und sobald jemand im Katalog Zahlen für `posts` einträgt,
       * zeigt die Kachel von selbst „x von y".
       *
       * DIESELBEN GATES WIE DER MENÜPUNKT (`productKey` + `planProduct`): eine
       * Beitrags-Kachel in einer Community, deren Tarif Beiträge nicht
       * enthält, wäre dieselbe Lüge wie ein Menüpunkt, der in eine Wand führt
       * (C2). `posts.moderate` ist die Capability der Zielseite.
       */
      stats: {
        posts: {
          scope: 'community',
          productKey: 'posts',
          planProduct: 'posts',
          labelKey: 'posts.stats.total',
          icon: 'i-ph-chat-text',
          to: '/dashboard/posts',
          requiredCapability: 'posts.moderate',
          order: 20,
        },
      },
    },

    /**
     * DER KURATIERTE REAKTIONS-SATZ (F57 Mechanik 1).
     *
     * Die Liste steht hier als AUSSAGE dieses Layers, obwohl der Code ohne sie
     * denselben Satz nähme (`allowedReactions()` fällt auf die Registry
     * zurück): so ist an EINER Stelle nachlesbar, was eine Community sieht,
     * und eine App kann sie KÜRZEN, ohne den Layer anzufassen.
     *
     * ERWEITERN GEHT BEWUSST NICHT — was nicht in `REACTION_KEYS` steht, wird
     * verworfen. Sonst wanderte ein per Config erfundenes Zeichen in die
     * Datenbank und wäre danach nicht mehr darstellbar; ein freier Picker ist
     * zudem eine Moderationsfläche, die es im MVP nicht gibt.
     *
     * WARUM WEDER 👍 NOCH ❤️ DARIN STEHEN, steht bei der Registry
     * (`packages/core/shared/reactions.ts` — seit 2026-08-14 dort, weil die
     * Antworten im comments-Layer dieselbe Liste brauchen): beide würden neben
     * dem Aufstimm-Pfeil als zweite Zustimmung gelesen — genau die zweite
     * Like-Quelle, die Konzept-Entscheidung 4 ausschließt.
     *
     * DIESER SCHALTER GILT NUR FÜR THEMEN. Die Leiste unter den ANTWORTEN hat
     * ihren eigenen (`pukalani.comments.reactions`) — zwei Produkte, zwei
     * Entscheidungen; eine Community darf das eine kürzen, ohne das andere
     * anzufassen.
     */
    discussions: {
      reactions: ['laugh', 'tada', 'thinking', 'eyes', 'sad', 'fire', 'thanks', 'idea'],

      /**
       * DAS TAGES-LIMIT FÜR LIKES, GESTAFFELT NACH VERTRAUENSSTUFE
       * (F57 Mechanik 3 + F57-Stufen, Davids Zahlen vom 2026-08-14).
       *
       * Der INDEX ist die Vertrauensstufe: **TL0 und TL1 bekommen 50, TL2
       * bekommt 75, TL3 (und die ernannte TL4) bekommen 100** Aufstimmen je
       * Mensch, Community und UTC-Kalendertag. Im Alltag unspürbar — wer der
       * Reihe nach durch einen Feed klickt, merkt es.
       *
       * WARUM ÜBERHAUPT GESTAFFELT: das Limit ist eine Missbrauchs-Bremse, und
       * eine Bremse soll den treffen, über den man nichts weiß. Wer 60 Tage
       * dabei ist, 25 Inhalte geschrieben und 25 Zustimmungen bekommen hat,
       * ist genau der, über den man etwas weiß — ihn so knapp zu halten wie
       * ein frisches Konto wäre eine Bremse gegen die eigenen Leute.
       *
       * EINE LISTE UND NICHT VIER SCHLÜSSEL, weil das eine Aussage ist und
       * nicht vier (Begründung in `core/shared/likeAllowance.ts`). Eine App
       * darf sie kürzen; `[0, 0, 0, 0]` schaltet die Mechanik ganz aus — und
       * damit auch die drei Abzeichen, die daran hängen (ohne Limit gibt es
       * keinen Tag, an dem es erreicht wäre).
       *
       * DIE ZAHLEN STEHEN HIER UND NICHT IN EINER DATENBANK-ZEILE: sie sind
       * eine Eigenschaft dieses Bauplans, keine Stellschraube, die ein
       * Betreiber je Community dreht. Lägen sie in `app_config`, hinge an
       * JEDER Aufstimme eine zusätzliche Abfrage — und die Frage „warum ging
       * das gestern noch" hätte keine nachlesbare Antwort mehr. Der
       * Code-Default ist zugleich das Produktversprechen.
       */
      likesPerDayByLevel: [50, 50, 75, 100],
    },
  },
})
