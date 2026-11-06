/**
 * BRAND-DUELL adidas vs. Nike (BI1 I6, Format `duel`, §2.2).
 *
 * ── LINKS IST adidas ────────────────────────────────────────────────────
 * Der Slug ist alphabetisch (`insightsDuelSlug('adidas', 'nike')` =
 * `adidas-vs-nike`, §11 Frage 2), und die öffentliche Route ordnet LINKS die
 * Marke zu, die im Slug vorne steht (`server/api/insights/public/duels/
 * [slug].get.ts`, „Links ist, wer im Slug vorne steht"). `left` in jeder
 * Faktenzeile ist deshalb adidas, `right` Nike.
 *
 * ── EIN BELEG JE ZEILE, ZWEI SEITEN ─────────────────────────────────────
 * Eine Faktenzeile trägt EINEN `sourceIndex` (§9.3), vergleicht aber zwei
 * Marken. Eine Quelle, die beide Seiten belegt, gibt es für keine dieser
 * Zeilen. Der Zeiger zeigt deshalb auf den Beleg der Seite, die ihn eher
 * braucht; der Beleg der anderen Seite steht direkt daneben in `sources`
 * (Paare 0/1, 2/3+9, 4/5, 7/6, 12/9).
 *
 * Die Werte stehen sprachneutral da (Jahre, Eigennamen) — `left`/`right` sind
 * im Vertrag EINE Zeichenkette, keine zwei Fassungen.
 */
import { URL, wiki } from './sources.mjs'

const bodyDe = `## Zwei Gründungen, zwei Logiken

adidas ist ein Name aus der Werkstatt. Adolf Dassler gründete das Unternehmen am 18. August 1949, und der Firmenname setzt sich aus seinem Spitznamen Adi und den ersten drei Buchstaben seines Nachnamens zusammen. Noch am selben Tag ließ er drei parallele Streifen als Marke eintragen – das Zeichen ist also genauso alt wie die Firma.

Nike kommt aus der Erzählung. Bill Bowerman und Phil Knight gründeten 1964 Blue Ribbon Sports; den Namen der griechischen Siegesgöttin trägt das Unternehmen seit 1971. Im selben Jahr wurde der Swoosh zum ersten Mal eingesetzt, entworfen von Carolyn Davidson.

## Was die Zeichen leisten

Hier liegt für uns der interessanteste Unterschied. Die drei Streifen sind ein Muster: Sie sitzen auf Schuh und Kleidung und sind dort zugleich Gestaltung und Absender. Der Swoosh ist ein Symbol: Die einzige Vorgabe für das Logo war, dass es an eine Bewegung erinnert – und genau so lässt er sich auf jede Fläche setzen. Beide Wege funktionieren, weil die Marken über Jahrzehnte an ihnen festgehalten haben.

## Wer welche Zeile gewinnt

Beim Namen sehen wir Nike vorn: Wer eine Siegesgöttin im Namen trägt, muss das Versprechen nicht mehr aussprechen. Beim Zeichen sehen wir adidas vorn: Streifen, die am Gründungstag eingetragen wurden, sind ein seltener Fall von Herkunft, die man sehen kann. Gründung, Gründer, Sitz und das erste Logo sind für uns Fakten ohne Sieger.

## Unser Fazit

Zwei Klassiker, zwei Philosophien: Herkunft auf der einen Seite, Mythos auf der anderen. Welche Website heute den stärkeren Auftritt hat, misst der Brand-Check.

**Methodik:** Wie der Brand Score entsteht, steht in der [Methodik](/brand-check/methodik).`

const bodyEn = `## Two foundings, two logics

adidas is a name from the workshop. Adolf Dassler founded the company on 18 August 1949, and its name combines his nickname Adi with the first three letters of his surname. On the very same day he registered three parallel stripes as a trademark – so the mark is exactly as old as the company.

Nike comes from a story. Bill Bowerman and Phil Knight founded Blue Ribbon Sports in 1964; the company has carried the name of the Greek goddess of victory since 1971. That same year the Swoosh, designed by Carolyn Davidson, was used for the first time.

## What the marks achieve

This is where we see the most interesting difference. The three stripes are a pattern: they sit on shoes and clothing and are design and sender at once. The Swoosh is a symbol: the only brief for the logo was that it should evoke movement – and that is exactly why it works on any surface. Both paths work because the brands have stuck with them for decades.

## Who wins which row

On the name, Nike is ahead for us: a brand named after a goddess of victory never has to state its promise. On the mark, adidas is ahead for us: stripes registered on the day the company was founded are a rare case of heritage you can see. Founding year, founders, headquarters and the first logo are facts without a winner.

## Our verdict

Two classics, two philosophies: heritage on one side, myth on the other. Which website has the stronger presence today is what the Brand Check measures.

**Methodology:** How the Brand Score is calculated is explained in our [methodology](/brand-check/methodik).`

export const adidasVsNike = {
  format: 'duel',
  // Wird in `seed-launch.mjs` gegen `insightsDuelSlug('adidas', 'nike')`
  // geprüft — steht hier trotzdem ausgeschrieben, damit die Datei lesbar bleibt.
  slug: 'adidas-vs-nike',
  baseLocale: 'de',
  titleDe: 'adidas vs. Nike: Herkunft gegen Mythos',
  titleEn: 'adidas vs. Nike: heritage versus myth',
  dekDe: 'Die eine Marke trägt den Namen ihres Gründers, die andere den einer Göttin. Wir vergleichen, was Namen und Zeichen der zwei Sportmarken erzählen.',
  dekEn: 'One brand carries the name of its founder, the other that of a goddess. We compare what the names and marks of the two sports brands say.',
  bodyDe,
  bodyEn,
  topics: ['brand-strategy'],
  sources: [
    /* 0 */ wiki(URL.adidasWikiDe, 'Die heutige Adidas AG wurde am 18. August 1949 durch Adolf Dassler als Adi Dassler adidas Sportschuhfabrik mit 47 Mitarbeitern gegründet.'),
    /* 1 */ wiki(URL.nikeWikiEn, 'The company was founded on January 25, 1964, as "Blue Ribbon Sports", by Bill Bowerman and Phil Knight'),
    /* 2 */ wiki(URL.adidasWikiDe, 'Noch am selben Tag ließ Dassler ein Schuhmodell patentieren und drei parallele Streifen als Marke eintragen.'),
    /* 3 */ wiki(URL.nikeWikiEn, 'It would bear the Swoosh newly designed by Carolyn Davidson'),
    /* 4 */ wiki(URL.adidasWikiEn, 'is a German multinational athletic apparel and footwear corporation headquartered in Herzogenaurach'),
    /* 5 */ wiki(URL.nikeWikiEn, 'is an American athletic footwear and apparel corporation headquartered near Beaverton, Oregon'),
    /* 6 */ wiki(URL.adidasWikiDe, 'das sich aus Dasslers Spitznamen Adi und den ersten drei Buchstaben seines Nachnamens zusammensetzt'),
    /* 7 */ wiki(URL.nikeWikiEn, 'the Greek goddess of victory'),
    /* 8 */ wiki(URL.nikeWikiEn, 'and officially became Nike, Inc. on May 30, 1971'),
    /* 9 */ wiki(URL.nikeWikiEn, 'The Swoosh was first used by Nike on June 18, 1971'),
    /* 10 */ wiki(URL.adidasWikiEn, 'The three stripes are Adidas\'s identity mark, having been used on the company\'s clothing and shoe designs as a marketing aid.'),
    /* 11 */ wiki(URL.nikeWikiDe, 'Die einzige Vorgabe von Nike-Gründer Philip Knight war, dass das Logo an eine Bewegung angelehnt sei.'),
    /* 12 */ wiki(URL.adidasWikiEn, 'The Trefoil logo was designed in 1971 and launched in 1972'),
  ],
  brandSlugs: ['adidas', 'nike'],
  facts: [
    { key: 'founded', labelDe: 'Gegründet', labelEn: 'Founded', left: '1949', right: '1964', winner: 'tie', sourceIndex: 0 },
    { key: 'founders', labelDe: 'Gründer', labelEn: 'Founders', left: 'Adolf Dassler', right: 'Bill Bowerman, Phil Knight', winner: 'tie', sourceIndex: 1 },
    { key: 'headquarters', labelDe: 'Sitz', labelEn: 'Headquarters', left: 'Herzogenaurach', right: 'Beaverton, Oregon', winner: 'tie', sourceIndex: 4 },
    { key: 'name', labelDe: 'Name', labelEn: 'Name', left: 'Adi + Dassler', right: 'Nike (Νίκη)', winner: 'right', sourceIndex: 7 },
    { key: 'mark', labelDe: 'Zeichen', labelEn: 'Mark', left: 'Three Stripes (1949)', right: 'Swoosh (1971)', winner: 'left', sourceIndex: 2 },
    { key: 'logo', labelDe: 'Erstes Logo', labelEn: 'First logo', left: 'Trefoil (1972)', right: 'Swoosh (1971)', winner: 'tie', sourceIndex: 12 },
  ],
  ranking: null,
  noteInternal: '',
}
