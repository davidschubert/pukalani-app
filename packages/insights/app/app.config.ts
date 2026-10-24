/**
 * Die Config-FORM von Brand Insights. Sie liegt in `app/` und nicht im
 * Package-Root — dort wird eine `app.config.ts` stillschweigend ignoriert.
 *
 * ── WARUM DER DEFAULT `false` IST ───────────────────────────────────────
 * „Core-Default ist immer aus" gilt hier ohne Ausnahme: die Redaktion ist ein
 * BETREIBER-Produkt — eine App, die den Layer montiert, sagt mit einer eigenen
 * Zeile Ja (`apps/branding/app/app.config.ts`). Genau dort sieht man, WER
 * diesen Bereich betreibt. Seit I2 hängt am selben Schalter auch der
 * Nav-Eintrag unten (`configFlag: 'insights.enabled'`): ohne das Ja der App
 * gibt es keinen Menüpunkt.
 *
 * Die zweite Stufe steht bewusst NICHT hier, weil sie zur Laufzeit umgelegt
 * werden muss: die Produkt-NOTABSCHALTUNG ist
 * `app_config.products.insights.enabled = false` (die Produkt-Registry über
 * den Manifest-Schlüssel `insights`, ohne eine Zeile Code hier).
 *
 * EINE BEZAHL-SCHRANKE GIBT ES NICHT und soll es nicht geben: Insights ist
 * öffentlicher Inhalt, sein Zweck ist Reichweite (Entscheidung 9). Bezahlt
 * wird, was der Leser danach tut (Brand-Check, Wizard).
 */
export default defineAppConfig({
  pukalani: {
    insights: {
      enabled: false,

      /**
       * DER RIEGEL DER ÖFFENTLICHEN SEITEN (BI1 I3 — §6, §11.3, Plan
       * docs/plans/BRAND-INSIGHTS.md).
       *
       * ── WAS ER IST ─────────────────────────────────────────────────────
       * Die Liste der Formate, die WIRKLICH öffentlich stehen. Alles andere
       * antwortet 404 — Route UND Seite —, und zwar mit demselben Code wie ein
       * unbekannter Slug (`post_not_found`): ein eigener Grund verriete, dass
       * es die Seite gibt und sie nur gesperrt ist, und das ist eine Auskunft
       * über eine FREMDE Marke.
       *
       * ── WARUM NUR `article` ────────────────────────────────────────────
       * §6 ist eindeutig: „ohne die Antworten zu 3 (Score fremder Marken) und
       * 4 (Verantwortlicher) geht KEIN Markenprofil live". Genau das sind
       * Markenprofil, Duell und Ranking — sie alle zeigen den Score einer
       * fremden Marke. Der Artikel tut das nicht: er ordnet ein, mit Quelle
       * und Zitatschranke, und dafür liegt die Rechtslage vor.
       *
       * Die drei anderen sind GEBAUT und warten hinter dieser Zeile. Sie
       * freizuschalten ist DAVIDS Handgriff nach der Anwaltsantwort: ein
       * Eintrag mehr in dieser Liste, kein Code. Genau deshalb steht der
       * Riegel im LAYER und nicht in der App — die App sagt „ich betreibe die
       * Redaktion", der Layer sagt „so weit ist sie draussen", und die zweite
       * Aussage soll nicht in jeder künftigen Brand-Site neu getroffen werden
       * müssen. `apps/branding` setzt deshalb NICHTS; es gilt dieser Default.
       *
       * ── FAIL-CLOSED ────────────────────────────────────────────────────
       * Gelesen wird über `readInsightsPublicFormats()`
       * (`shared/insightsPublic.ts`): was keine Liste gültiger Schlüssel ist,
       * ergibt LEER. Ein Tippfehler nimmt die Seiten vom Netz, statt eine
       * Rechtsfrage zu eröffnen — das ist die richtige Richtung, und es fällt
       * beim ersten Aufruf auf.
       *
       * `as string[]` und nicht `as const`: der tiefe Config-Merge muss eine
       * längere Liste überhaupt zulassen, sonst wäre der Typ der einen
       * erlaubten Zeile die Sperre für Davids Freischaltung.
       */
      publicFormats: ['article'] as string[],

      /**
       * DER RIEGEL DES NEWSLETTERS (BI1 I5a, Plan §9.3a / §11 Frage 5).
       *
       * ── WARUM ER ZU IST ────────────────────────────────────────────────
       * Nicht weil der Weg unfertig wäre, sondern weil der TEXT fehlt: die
       * Rechtstexte von branding.supply sind Entwurf (BS1 **R2** wartet auf
       * Davids Generator-Texte, **R3** ist der Anwaltstermin). Ohne einen
       * Datenschutz-Abschnitt „Newsletter" — wer erhebt, wofür, wie lange, wie
       * widerspricht man — darf keine Adresse erhoben werden. Das ist
       * dieselbe Regel, die BS1 schon für `auth.termsUrl` und für Plausible
       * (R2c) fährt: **erst Text, dann Schalter.**
       *
       * ── WAS „ZU" HEISST ────────────────────────────────────────────────
       * Beides, wie bei `publicFormats`: das Formular wird NICHT gerendert
       * (`InNewsletterForm` gibt nichts aus) UND alle drei Routen antworten
       * 404 — denselben neutralen 404 wie eine unbekannte Adresse, nicht 403
       * und nicht „Produkt aus". Eine Sperre nur in der Oberfläche ist keine.
       *
       * ── FAIL-CLOSED ────────────────────────────────────────────────────
       * Gelesen wird über `insightsNewsletterEnabled()`
       * (`shared/insightsPublic.ts`): NUR echtes `true` zählt. `'true'` oder
       * `1` sehen aus wie eine Erlaubnis und wären eine, die niemand geprüft
       * hat.
       *
       * Davids Handgriff nach den Texten ist diese EINE Zeile — kein Code,
       * kein Deploy von Neuem. `apps/branding` setzt bewusst NICHTS: die App
       * sagt „ich betreibe die Redaktion", der Layer sagt „so weit ist sie
       * draussen" (wörtlich die Arbeitsteilung des Format-Riegels).
       */
      newsletter: {
        enabled: false,
      },

      /**
       * DER THEMENRADAR (BI1 I4, §9.6) — seine KANALLISTE ist Konfiguration.
       *
       * ── WARUM EINE LISTE UND KEINE SUCHE (Leitplanke c) ────────────────
       * `search.list` kostet 100 Einheiten je Aufruf und hat einen eigenen
       * Tages-Eimer von rund 100 Aufrufen; `playlistItems.list` und
       * `videos.list` kosten je EINE. Entdeckt wird deshalb über eine von Hand
       * gepflegte Kanalliste — das ist keine Notlösung, sondern der Zuschnitt:
       * ein Radar, der findet, was WIR für relevant halten, ist ehrlicher als
       * einer, der Googles Suchranking nacherzählt.
       *
       * ── DER LAYER-DEFAULT IST LEER, UND DAS IST DIE AUSSAGE ────────────
       * Eine Kanalliste ist eine REDAKTIONELLE Entscheidung. Sie gehört der
       * App, die die Redaktion betreibt (`apps/branding/app/app.config.ts`),
       * nicht dem Layer — sonst erbte eine zweite Brand-Site fremde Kanäle,
       * ohne dass jemand sie ausgesucht hätte. Leere Liste ⇒ der Sweep tut
       * nichts und meldet `no_channels`.
       *
       * Die FORM steht trotzdem hier, damit sie EINEN Ort hat:
       * `{ channelId: 'UC…', topic: <Cluster-Schlüssel>, title?: '…' }`.
       * Was diese Form nicht erfüllt, wirft `readInsightsRadarConfig`
       * (`shared/insightsRadar.ts`) still heraus — ein Handle statt einer Id
       * ist der wahrscheinlichste Tippfehler, und er würde sonst zu einem 404
       * je Lauf, den niemand einem Konfigurationsfehler zuordnet.
       */
      radar: {
        channels: [] as { channelId: string, topic: string, title?: string }[],
        /**
         * Wie viele der jüngsten Uploads je Kanal ein Lauf liest.
         *
         * 20 ist der Zuschnitt „was in den letzten Wochen lief" — der Radar
         * ist ein Signal, kein Archiv. Der harte Deckel liegt bei 50
         * (`playlistItems.list` liefert nicht mehr je Seite, und Blättern
         * kostete je Seite eine weitere Einheit).
         */
        maxVideosPerChannel: 20,
      },
    },

    admin: {
      /**
       * DIE REDAKTION IM DASHBOARD (BI1 I2, §9.4) — der erste und einzige
       * Nav-Eintrag dieses Layers.
       *
       * `scope: 'operator'` (PFLICHT, kein Default): die Redaktion ist
       * Betreiber-Sache. Auf einem Mandanten-Host gäbe es sie nicht — dass
       * `branding` ein Silo ist und der Eintrag dort immer steht, ist die
       * Folge, nicht die Ausnahme.
       *
       * `productKey: 'insights'` — anders als die drei Betreiber-Listen des
       * brand-Layers (Warteliste, Korrekturen, Gespräche) trägt dieser Eintrag
       * den Produkt-Schlüssel: hinter ihm liegt DAS PRODUKT selbst und nicht
       * eine Pflicht, die es überlebt. Die Notabschaltung
       * (`app_config.products.insights.enabled = false`) lässt `/api/insights/**`
       * 404 antworten — ein Menüpunkt, der auf lauter 404 zeigt, ist eine
       * kaputte Navigation.
       *
       * `configFlag: 'insights.enabled'` — die App muss Ja gesagt haben. Der
       * Layer-Default ist `false` (s. oben), und ohne diesen Riegel erschiene
       * der Eintrag in JEDER App, die den Layer montiert, auch bevor sie ihn
       * betreibt. Fail-closed: unbekannter Pfad oder etwas anderes als `true`
       * ⇒ kein Eintrag.
       *
       * `order: 133` schliesst an die drei brand-Listen (130–132) an: sie
       * gehören demselben Menschen, und zwischen sie gehört nichts Fremdes.
       *
       * `children` führt ALLE VIER Adressen auf (§9.4: Liste, Marken,
       * Korrekturen, Radar). Ohne Unterpunkt käme man nur über einen Link in
       * der Liste dorthin — und die Marken-Seite und die Korrekturen sind
       * eigene Arbeiten mit eigenen Menschen davor, nicht Unterseiten des
       * Editors. Die Modul-Seite steht als erster Unterpunkt mit `exact` —
       * sonst wäre sie auf jeder Unterseite mit-aktiv.
       *
       * Die REIHENFOLGE ist die des Arbeitsflusses: geschrieben wird ein
       * Beitrag, dazu gehören Marken, danach kommen die Rückmeldungen, und
       * der Radar steht als Ideengeber am Ende (er ist das einzige der vier,
       * das noch auf ein Gate wartet).
       */
      modules: [
        {
          id: 'insights',
          scope: 'operator',
          productKey: 'insights',
          configFlag: 'insights.enabled',
          labelKey: 'insights.admin.nav',
          icon: 'i-ph-newspaper',
          to: '/dashboard/insights',
          requiredCapability: 'insights.manage',
          group: 'management',
          order: 133,
          children: [
            { id: 'insights-posts', labelKey: 'insights.admin.navPosts', to: '/dashboard/insights', exact: true },
            { id: 'insights-brands', labelKey: 'insights.admin.navBrands', to: '/dashboard/insights/brands' },
            { id: 'insights-corrections', labelKey: 'insights.admin.navCorrections', to: '/dashboard/insights/corrections' },
            { id: 'insights-radar', labelKey: 'insights.admin.navRadar', to: '/dashboard/insights/radar' },
            // Die Kanäle stehen NACH dem Radar und nicht davor: sie sind seine
            // Zutat, nicht sein Zweck. Wer morgens hereinkommt, will die
            // Videoliste — die Pflege der Quellen ist der seltenere Weg.
            { id: 'insights-channels', labelKey: 'insights.admin.navChannels', to: '/dashboard/insights/channels' },
          ],
        },
      ],
    },
  },
})
