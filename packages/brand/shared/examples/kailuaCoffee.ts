import { BRAND_DIRECTIONS_VERSION } from '../brandDirections'
import type { BrandFoundationInput } from '../brandFoundation'
import { formatBrandSlotList, formatBrandSlotStructured } from '../brandSlotFormat'
import { KAILUA_COFFEE_DESIGN } from './kailuaCoffeeDesign'

/**
 * DIE BEISPIEL-MARKE „KAILUA COFFEE CO." ALS FESTER SNAPSHOT (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §4 und §5 Paket G5).
 *
 * ── WARUM EIN SNAPSHOT UND KEINE SEITE MIT TEXTEN ────────────────────────
 * Die öffentliche Beispiel-Seite `/beispiel/kailua-coffee` sollte zeigen, was
 * am Ende eines Gesprächs herauskommt — nicht, wie eine Marketing-Seite
 * darüber REDET. Sie fuhr deshalb GENAU DEN Renderer, der auch das echte
 * Handbuch baut (`buildBrandFoundation`), auf genau der Eingabeform, die ein
 * eingefrorener Share-Snapshot hat (`BrandFoundationInput`).
 *
 * ── DIE SEITE GIBT ES SEIT 2026-09-09 NICHT MEHR ─────────────────────────
 * Seit Discover D5 ist „Kailua Coffee Co." eine ECHTE Veröffentlichung
 * (`brand_publications`, Badge `example`) und steht als Anatomie unter
 * `/discover/kailua-coffee-co`. Die redaktionelle Zweitfassung ist gelöscht,
 * ihre Adresse antwortet 301 (`apps/branding/nuxt.config.ts`).
 *
 * DIESER SNAPSHOT BLEIBT — als PRÜFSTAND des Renderers: `kailuaCoffeeExample.
 * test.ts` fährt an ihm die Zusagen des Fundaments ab (was reist, was nicht,
 * welche Kapitel ohne Lücke entfallen). Produktions-Code liest ihn seither
 * NICHT mehr; wer ihn wieder einbaut, sollte das hier vermerken.
 *
 * ── WAS HIER NICHT STEHT, STEHT AUCH NICHT ZUFÄLLIG NICHT ────────────────
 * Nur Sessions, die REISEN (`sessionTravels` — öffentlich UND Festlegung,
 * §2.3). Keine Rohantworten (Gründungsimpuls, Party-Persona), nichts
 * Vertrauliches (Wettbewerber, Beschwerden, harte Fakten), keine internen
 * Zwischenschritte (Kandidaten, Hypothesen). Der Renderer würde sie ohnehin
 * herausfiltern; sie hier hinzuschreiben hiesse, sich auf diesen Filter zu
 * verlassen, statt das Beispiel ehrlich zu bauen. Der Test nagelt beides fest.
 *
 * Ebenfalls bewusst NICHT dabei:
 *  · `architecture` — Kailua hat keine Untermarken, die Weiche B2 ist nie
 *    gelaufen. Das Kapitel entfällt OHNE LÜCKE (§2.2), genau wie im echten
 *    Dokument einer solchen Marke.
 *  · `naming` — die Marke hat ihren Namen. Ein Namens-Kapitel wäre eine
 *    Vorführung des Instruments, kein Bestandteil DIESES Fundaments.
 *
 * ── DIE SPRACHEN ─────────────────────────────────────────────────────────
 * `contentLocale: 'de'` — die Marke spricht hier deutsch; der RAHMEN
 * (Kapitelnamen, Beschriftungen) folgt der Sprache des Lesers, weil er aus
 * i18n-Schlüsseln kommt (Kopf von `brandFoundation.ts`). Die Tagline bleibt
 * englisch: sie ist ein Eigenname der Marke auf Oʻahu und wird so wenig
 * übersetzt wie ein Theme-Name.
 *
 * ── DIE FORM SCHREIBEN DIE SCHREIBER ─────────────────────────────────────
 * Listen und strukturierte Werte entstehen über `formatBrandSlotList` /
 * `formatBrandSlotStructured` — nicht von Hand mit `- ` und `## `. Wer die
 * Form nachbaut, ist die zweite Stelle, die beim nächsten Format-Schritt
 * vergessen wird (Kopf von `brandSlotFormat.ts`).
 *
 * Der Inhalt ist wörtlich bzw. im selben Ton aus dem abgenommenen Klickdummy
 * `packages/brand/.playground/app/pages/brand/demo/beispiel.vue` übernommen —
 * Klartext · Handwerk · Nähe, Oʻahu, eine Röstung pro Saison, Herkunftstafel.
 */

/** Wo die Seite wohnt und auf welchen Stand sie sich beruft. */
export const KAILUA_COFFEE_EXAMPLE_META = {
  slug: 'kailua-coffee',
  /** ISO-Datum; die Seite formatiert es in der Sprache des Lesers. */
  standDate: '2026-09-07',
} as const

export const KAILUA_COFFEE_EXAMPLE: BrandFoundationInput = {
  title: 'Kailua Coffee Co.',
  contentLocale: 'de',
  pathKind: 'new',
  team: 'team',

  /**
   * DIE GEWÄHLTE RICHTUNG (Paket G4) — „Warm & Editorial", dieselbe, die der
   * abgenommene Klickdummy für Kailua zeigte (Roast · Crema · Milk ist wörtlich
   * die Farbwelt dieser Richtung). Kapitel 10 des Beispiels zeigt damit den
   * Zustand, den ein Besucher NACH dem Gespräch sieht: die Richtung steht, die
   * Ausarbeitung ist die Schranke. Ohne diesen Eintrag zeigte die öffentliche
   * Beispiel-Seite als einzige Fläche des Produkts nur die leere Schranke.
   *
   * Die Fassung kommt aus dem Katalog statt als `'1'` daneben zu stehen: ein
   * Beispiel, das auf einer ALTEN Fassung stehen bliebe, renderte nach dem
   * ersten Katalog-Schritt keine Richtung mehr — und niemand hätte es gemerkt.
   */
  direction: { id: 'warm-editorial', version: String(BRAND_DIRECTIONS_VERSION) },

  /**
   * DIE VISUELLE IDENTITÄT (Brand Design D8, §2.8) — Kapitel 10 des Beispiels
   * ist damit VOLL: Farbwelt, Schriftpaar, Zeichen, Bildsprache, Bewegung.
   *
   * Sie steht als eingefrorenes Preset in `kailuaCoffeeDesign.ts` und ist dort
   * GERECHNET, nicht abgeschrieben (Begründung im Kopf jener Datei). Die
   * gewählte Richtung darüber bleibt bewusst stehen: sie ist die Ansage, aus
   * der das Preset entstanden ist — der Renderer zeigt mit Preset nur noch das
   * Ergebnis, aber die Zeile hier ist die Herkunft und keine Anzeige.
   */
  ...(KAILUA_COFFEE_DESIGN ? { design: KAILUA_COFFEE_DESIGN } : {}),

  // Georges Synthese — drei Absätze, der erste trägt als Leitsatz.
  story: [
    'Bei einer Tomate steht die Herkunft auf dem Schild. Bei einer Tasse Kaffee steht dort ein Preis.',
    'Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Anbau, Röstung und Ausschank liegen '
    + 'in einer Hand — nicht als Effizienz-Idee, sondern weil sich sonst niemand mehr erinnert, wer welche '
    + 'Entscheidung getroffen hat. Wir rösten eine Sorte pro Saison. Was in der Kanne ist, hat einen Ort, '
    + 'einen Monat und einen Namen.',
    'Der Ausschank ist kein Verkaufsraum mit Kaffee darin, sondern eine Backstube mit Theke: Die Maschine '
    + 'steht sichtbar, die Herkunftstafel hängt auf Augenhöhe und wird jede Saison neu geschrieben. Wer '
    + 'fragt, bekommt eine Antwort und keine Broschüre.',
  ].join('\n\n'),

  chapters: [
    // ── A · Kontext & Zielgruppe ─────────────────────────────────────────
    {
      stepKey: 'context',
      slots: [
        {
          slotId: 'a.pitch',
          value: 'Wir sind eine Rösterei mit Ausschank auf Oʻahu: eine Röstung pro Saison, Herkunft mit '
            + 'Namen, Preise ohne Sternchen. Wer bei uns Kaffee trinkt, weiß, was er in der Hand hält.',
        },
        {
          slotId: 'a.category',
          value: 'Spezialitätenrösterei mit eigenem Ausschank',
        },
        {
          slotId: 'a.audienceSketch',
          value: formatBrandSlotStructured([
            {
              label: 'Pendler mit Ritual',
              body: 'Kommen fünfmal die Woche vor der Arbeit, immer dasselbe. Sie kaufen keine Vielfalt, '
                + 'sie kaufen Verlässlichkeit. Brauchen von uns: gleiche Qualität, gleiche Zeit, keine '
                + 'ständig neue Karte.',
            },
            {
              label: 'Nachbarschaft am Wochenende',
              body: 'Kommen zu zweit oder mit Kindern, bleiben eine Stunde, lesen die Herkunftstafel von '
                + 'vorn bis hinten. Brauchen von uns: Platz, Ruhe und jemanden, der erzählt, ohne zu '
                + 'dozieren.',
            },
            {
              label: 'Reisende, die Herkunft suchen',
              body: 'Wollen etwas, das es nur hier gibt — und einen Grund, es mitzunehmen. Brauchen von '
                + 'uns: die Geschichte der Saison in Worten, die auch auf eine Packung passen.',
            },
          ]),
        },
      ],
    },

    // ── B · Purpose, Vision, Mission & Positionierung ────────────────────
    {
      stepKey: 'pvm',
      slots: [
        {
          slotId: 'b.purpose',
          value: 'Es gibt uns, damit vielbeschäftigte Menschen auf Oʻahu einen ehrlichen, ruhigen Moment '
            + 'am Tag bekommen — eine Tasse, deren Anbau, Röstung und Ausschank Menschen mit Namen '
            + 'verantworten.',
        },
        {
          slotId: 'b.vision',
          value: 'In fünf Jahren ist eine Tasse Kaffee auf Oʻahu so nachvollziehbar wie ein Fisch auf der '
            + 'Karte: mit Ort, Saison und Namen — und niemand findet das mehr besonders.',
        },
        {
          slotId: 'b.mission',
          value: 'Wir rösten eine Sorte pro Saison, nennen jede Herkunft und jeden Preis öffentlich und '
            + 'schenken dort aus, wo die Röstmaschine steht. Jede Saison bringt eine neue Tafel — und eine '
            + 'Erklärung, was sich geändert hat.',
        },
        {
          slotId: 'b.positioningCategory',
          value: 'Spezialitätenkaffee, lokal geröstet',
        },
        {
          slotId: 'b.positioningFirstChoice',
          value: 'Erste Wahl für Menschen auf Oʻahu, die wissen wollen, wer ihren Kaffee gemacht hat.',
        },
      ],
    },

    // ── C · Werte ────────────────────────────────────────────────────────
    {
      stepKey: 'values',
      slots: [
        {
          slotId: 'c.final',
          value: formatBrandSlotList(['Klartext', 'Handwerk', 'Nähe']),
        },
        {
          // „Wort — Definition": daran erkennt der Renderer, welche Definition
          // zu welchem Wert gehört (`splitLabelled`).
          slotId: 'c.definitions',
          value: formatBrandSlotList([
            'Klartext — Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt.',
            'Handwerk — Lieber eine Röstung perfekt als fünf Sorten mittelmäßig.',
            'Nähe — Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat.',
          ]),
        },
        {
          slotId: 'c.livedExamples',
          value: formatBrandSlotList([
            'Klartext — Als die Ernte 2026 kleiner ausfiel, stand der neue Preis eine Woche vorher an der '
            + 'Tafel, mit dem Grund darunter.',
            'Handwerk — Wir haben die zweite Maschine abbestellt und Keanu stattdessen drei Monate in Kona '
            + 'ausbilden lassen.',
            'Nähe — Jede Tüte trägt das Kürzel des Rösters; wer fragt, bekommt die Person und keine Hotline.',
          ]),
        },
        {
          slotId: 'c.conflictRule',
          value: 'Klartext schlägt Nähe. Wir sagen auch dem Stammgast, dass seine Lieblingsröstung diese '
            + 'Saison nicht kommt — freundlich, aber am selben Tag, an dem wir es wissen.',
        },
        {
          slotId: 'c.teamFilter',
          value: 'Wir stellen niemanden ein, der eine Frage nach der Herkunft als Störung erlebt. Wer an '
            + 'der Theke steht, muss erklären können, warum diese Bohne so schmeckt — und zugeben dürfen, '
            + 'wenn er es nicht weiß.',
        },
      ],
    },

    // ── D · Persönlichkeit & Stimme ──────────────────────────────────────
    {
      stepKey: 'archetype',
      slots: [
        // Gespeicherte Auswahl-Ids, keine Namen: die Oberfläche löst sie in
        // der Sprache des Lesers auf (`brandChoiceDisplayLabel`).
        { slotId: 'd.primary', value: 'sage' },
        { slotId: 'd.secondary', value: 'creator' },
        {
          slotId: 'd.emotion',
          value: 'Wer bei uns war, soll sich für einen Moment unbeeilt fühlen — und etwas wissen, das er '
            + 'vorher nicht wusste, ohne sich dabei klein vorzukommen.',
        },
        {
          // Reihenfolge = Zuordnung: Ton-Wort n bekommt Stimmprobe n.
          slotId: 'd.toneWords',
          value: formatBrandSlotList(['ruhig', 'fundiert', 'gerade heraus', 'warm, aber nie anbiedernd']),
        },
        {
          slotId: 'd.voiceSamples',
          value: formatBrandSlotList([
            'Die Maschine läuft seit sechs. Wir haben Zeit.',
            'Diese Bohne kommt aus Kona, 600 Meter, Ernte im Februar. Deshalb schmeckt sie nach Mandel.',
            'Der Preis ist gestiegen. Die Ernte war kleiner, wir zahlen mehr — ihr auch.',
            'Schön, dass du da bist. Willst du wissen, was heute in der Kanne ist?',
          ]),
        },
        {
          // Seiten-Marken auf DEUTSCH, weil die Marke deutsch spricht — die
          // Session-Regel schreibt „- benutzen:" / „- meiden:" für de vor
          // (sessionContent.ts, `d.vocabulary`); der Renderer liest beide
          // Schreibweisen.
          slotId: 'd.vocabulary',
          value: formatBrandSlotList([
            'benutzen: unsere Bohnen',
            'benutzen: langsam geröstet, 14 Minuten',
            'benutzen: eine Pause',
            'benutzen: von Hand',
            'meiden: Premium-Arabica-Selektion',
            'meiden: Genuss-Erlebnis',
            'meiden: Auszeit',
            'meiden: Deluxe',
          ]),
        },
      ],
    },

    // ── E · Manifest ─────────────────────────────────────────────────────
    {
      stepKey: 'manifesto',
      slots: [
        {
          // Der einzige `richtext`-Slot der Registry — Absätze, kein Markup.
          slotId: 'e.manifesto',
          value: [
            'Wir glauben, dass Kaffee kein Treibstoff ist, sondern eine Pause. Dass man wissen darf, woher '
            + 'er kommt und wer ihn gemacht hat. Und dass ein ruhiger Moment am Tag kein Luxus ist — '
            + 'sondern das Mindeste.',
            'Deshalb rösten wir eine Sorte pro Saison statt fünf das ganze Jahr. Deshalb hängt die Herkunft '
            + 'an der Wand und nicht im Kleingedruckten. Deshalb steht die Maschine im Raum und nicht im '
            + 'Keller.',
            'Und deshalb sagen wir es, wenn etwas teurer wird, bevor jemand die Tafel liest. Wer bei uns '
            + 'trinkt, soll nichts nachschlagen müssen.',
          ].join('\n\n'),
        },
        {
          slotId: 'e.anchorLine',
          value: 'Ein ehrlicher, ruhiger Moment am Tag.',
        },
        {
          slotId: 'e.composition',
          value: formatBrandSlotStructured([
            { label: 'Ton', body: 'Ruhig und bestimmt, in der Wir-Form, ohne Ausrufezeichen.' },
            { label: 'Länge', body: 'Drei Absätze, jeder unter sechzig Wörtern.' },
            {
              label: 'Verwendung',
              body: 'An der Wand im Ausschank, auf der Rückseite der Saisonkarte und als erste Seite jeder '
                + 'Mappe für neue Partner.',
            },
          ]),
        },
      ],
    },

    // ── EP · Tagline & Messaging ─────────────────────────────────────────
    {
      stepKey: 'verbal',
      slots: [
        {
          // Englisch, weil die Marke auf Oʻahu englisch spricht — der Rahmen
          // des Handbuchs bleibt in der Sprache des Lesers.
          slotId: 'ep.taglines',
          value: formatBrandSlotList(['One honest, quiet moment a day.']),
        },
        {
          slotId: 'ep.boilerplates',
          value: formatBrandSlotStructured([
            {
              label: 'Kurz · 25 Wörter',
              body: 'Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Eine Röstung pro Saison, '
                + 'Herkunft mit Namen, Preise ohne Sternchen.',
            },
            {
              label: 'Mittel · 50 Wörter',
              body: 'Kailua Coffee Co. ist eine Rösterei mit eigenem Ausschank in Kailua auf Oʻahu. Anbau, '
                + 'Röstung und Ausschank liegen in einer Hand. Wir rösten eine Sorte pro Saison und nennen '
                + 'Ort, Monat und Person öffentlich — an der Tafel neben der Theke. Gegründet 2026.',
            },
            {
              label: 'Lang · 100 Wörter',
              body: 'Kailua Coffee Co. ist eine Rösterei mit eigenem Ausschank in Kailua auf Oʻahu, '
                + 'gegründet 2026. Anbau, Röstung und Ausschank liegen in einer Hand — damit '
                + 'nachvollziehbar bleibt, wer welche Entscheidung getroffen hat. Statt einer großen Karte '
                + 'gibt es eine Röstung pro Saison, langsam geröstet und offen erklärt: Ort, Höhenlage, '
                + 'Erntemonat und die Person, die geröstet hat, stehen an der Tafel neben der Theke. Preise '
                + 'werden angekündigt, bevor sie sich ändern, samt Grund. Wer bei uns Kaffee trinkt, soll '
                + 'wissen, was er in der Hand hält — und dafür einen ruhigen Moment bekommen statt eines '
                + 'Bechers im Vorbeigehen.',
            },
          ]),
        },
        {
          slotId: 'ep.keyMessages',
          value: formatBrandSlotStructured([
            {
              label: 'Pendler mit Ritual',
              body: 'Dieselbe Tasse, jeden Morgen, in derselben Qualität — und immer jemand, der deinen '
                + 'Namen kennt.',
            },
            {
              label: 'Nachbarschaft am Wochenende',
              body: 'Eine Stunde bleiben, die Tafel lesen, fragen. Wir erklären gern, was gerade in der '
                + 'Kanne ist.',
            },
            {
              label: 'Reisende, die Herkunft suchen',
              body: 'Eine Röstung, die es nur diese Saison und nur hier gibt — mit Ort und Namen auf der '
                + 'Tüte.',
            },
          ]),
        },
        {
          // Die Alltagsfassung des Wort-Leitfadens (aus `d.vocabulary`
          // abgeleitet) — sie trägt ganze Sätze, nicht nur Wörter.
          slotId: 'ep.vocabulary',
          value: formatBrandSlotList([
            'benutzen: Die Ernte war klein, deshalb kostet es mehr.',
            'benutzen: Wir rösten diese Sorte bis Ende der Saison.',
            'meiden: Aufgrund von Lieferkettenherausforderungen mussten wir die Preise anpassen.',
            'meiden: Superlative ohne Beleg',
          ]),
        },
        {
          slotId: 'ep.distinctiveAsset',
          value: 'Die Herkunftstafel neben der Theke — handgeschrieben, jede Saison neu. Sie taucht in '
            + 'jedem Foto, jeder Packung und jedem Beitrag wieder auf.',
        },
      ],
    },
  ],
}
