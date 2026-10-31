/**
 * MARKENPROFIL NIKE (BI1 I6, Format `profile`, §2.1) — die volle Marken-Zeile
 * und der Einordnungs-Beitrag dazu. Reine Daten; Verweise stehen als
 * Marken-SLUGS, nie als Ids (die löst `seed-launch.mjs` auf).
 */
import { site, URL, wiki } from './sources.mjs'

// ── Die Marken-Zeile (`insights_brands`) ────────────────────────────────────

const brandSources = [
  /* 0 */ site(URL.nikeHome, 'Nike, Inc.', 'Inspiring the world’s athletes, Nike delivers innovative products, experiences and services.'),
  /* 1 */ site(URL.nikeHome, 'Nike, Inc.', 'Nike. Just Do It.'),
  /* 2 */ wiki(URL.nikeWikiEn, 'The company was founded on January 25, 1964, as "Blue Ribbon Sports", by Bill Bowerman and Phil Knight'),
  /* 3 */ wiki(URL.nikeWikiEn, 'and officially became Nike, Inc. on May 30, 1971'),
  /* 4 */ wiki(URL.nikeWikiEn, 'It would bear the Swoosh newly designed by Carolyn Davidson'),
  /* 5 */ wiki(URL.nikeWikiEn, 'The Swoosh was first used by Nike on June 18, 1971'),
  /* 6 */ wiki(URL.nikeWikiEn, 'The following year, the agency created the first "brand ad" for Nike, called "There is no finish line", in which no Nike product was shown.'),
  /* 7 */ wiki(URL.nikeWikiEn, 'By 1980, Nike had attained a 50% market share in the US athletic shoe market, and the company went public in December of that year.'),
  /* 8 */ wiki(URL.nikeWikiEn, 'It was agency co-founder Dan Wieden who coined the now-famous slogan " Just Do It " for a 1988 Nike ad campaign'),
  /* 9 */ site(URL.nikeCompany, 'Nike, Inc.', 'Nike’s Philip H. Knight Campus in Beaverton, Ore. opened in 1990'),
  /* 10 */ wiki(URL.nikeWikiDe, 'Heute gilt der „Nike-Haken“ als eines der bekanntesten Markenzeichen der Welt, ebenso wie der Slogan Just do it'),
]

export const nikeBrand = {
  slug: 'nike',
  name: 'Nike',
  homepage: 'https://www.nike.com',
  libraryKey: 'nike',
  industry: 'manufacturing',
  country: 'US',
  foundedYear: 1964,
  archetype: 'hero',
  archetypeSecondary: '',
  paletteId: '',
  marks: [
    { kind: 'symbol', text: 'Der Swoosh, entworfen von Carolyn Davidson, ist das Bildzeichen der Marke.', sourceIndex: 4 },
    { kind: 'claim', text: '„Just Do It“ steht bis heute im Titel der eigenen Startseite.', sourceIndex: 1 },
    { kind: 'symbol', text: 'Swoosh und Slogan gelten als zwei der bekanntesten Markenzeichen der Welt.', sourceIndex: 10 },
  ],
  history: [
    { year: 1964, text: 'Bill Bowerman und Phil Knight gründen das Unternehmen als Blue Ribbon Sports.', sourceIndex: 2 },
    { year: 1971, text: 'Das Unternehmen heißt ab jetzt Nike, Inc.', sourceIndex: 3 },
    { year: 1971, text: 'Der Swoosh wird zum ersten Mal eingesetzt.', sourceIndex: 5 },
    { year: 1977, text: 'Die erste Markenanzeige „There is no finish line“ zeigt kein einziges Produkt.', sourceIndex: 6 },
    { year: 1980, text: 'Börsengang im Dezember, bei 50 Prozent Marktanteil im US-Sportschuhmarkt.', sourceIndex: 7 },
    { year: 1988, text: 'Dan Wieden prägt für eine Kampagne den Slogan „Just Do It“.', sourceIndex: 8 },
    { year: 1990, text: 'Der Campus in Beaverton, Oregon, öffnet.', sourceIndex: 9 },
  ],
  relationSlugs: ['adidas'],
  sources: brandSources,
}

// ── Der Beitrag (`insights_posts`, format `profile`) ─────────────────────────

const bodyDe = `Nike beginnt nicht als Nike. Gegründet wurde das Unternehmen am 25. Januar 1964 als „Blue Ribbon Sports“ von Bill Bowerman und Phil Knight; den heutigen Namen trägt es seit dem 30. Mai 1971. Er stammt von der griechischen Siegesgöttin – ein Versprechen, das jedes Produkt mitträgt, bevor es jemand anprobiert hat.

Im selben Jahr kam das Zeichen dazu. Den Swoosh entwarf Carolyn Davidson, zum ersten Mal eingesetzt wurde er am 18. Juni 1971. Bemerkenswert ist die Ausdauer: Mehr als fünfzig Jahre später ist der Swoosh noch immer das Zeichen der Marke.

Die Sprache folgte später. 1977 zeigte die erste Markenanzeige – „There is no finish line“ – kein einziges Produkt, und 1988 prägte Dan Wieden den Slogan „Just Do It“. Auf der eigenen Startseite steht er bis heute im Titel. Dazu kommt ein Satz, der den Anspruch erklärt: „If you have a body, you are an athlete.“ Wer so formuliert, verkauft keine Schuhe, sondern Zugehörigkeit.

Für uns ist Nike deshalb das Lehrbuchbeispiel einer Marke, deren Name, Zeichen und Sprache dieselbe Geschichte erzählen: Sieg, Bewegung, Aufbruch. Wie stark der Auftritt der heutigen Website ist, misst der Brand-Check.

**Methodik:** Wie der Brand Score entsteht, steht in der [Methodik](/brand-check/methodik).`

const bodyEn = `Nike did not start out as Nike. The company was founded on 25 January 1964 as “Blue Ribbon Sports” by Bill Bowerman and Phil Knight; it has carried its current name since 30 May 1971. The name comes from the Greek goddess of victory – a promise every product carries before anyone has tried it on.

The mark arrived that same year. Carolyn Davidson designed the Swoosh, which was first used on 18 June 1971. What stands out is its staying power: more than fifty years later, the Swoosh is still the sign of the brand.

The language came later. In 1977 the first brand ad – “There is no finish line” – showed no product at all, and in 1988 Dan Wieden coined the slogan “Just Do It”. To this day it sits in the title of the brand’s own homepage. Then there is a line that spells out the ambition: “If you have a body, you are an athlete.” Whoever writes that is not selling shoes but belonging.

For us, Nike is therefore the textbook case of a brand whose name, mark and language tell one story: victory, movement, momentum. How strong the current website is, the Brand Check measures.

**Methodology:** How the Brand Score is calculated is explained in our [methodology](/brand-check/methodik).`

export const nikeProfile = {
  format: 'profile',
  slug: 'nike',
  baseLocale: 'de',
  titleDe: 'Nike: Siegesgöttin, Swoosh und drei Wörter',
  titleEn: 'Nike: the goddess, the Swoosh and three words',
  dekDe: 'Wie aus Blue Ribbon Sports eine der bekanntesten Marken der Welt wurde – und warum Name, Zeichen und Slogan seit Jahrzehnten dieselbe Geschichte erzählen.',
  dekEn: 'How Blue Ribbon Sports became one of the best-known brands in the world – and why its name, mark and slogan have told the same story for decades.',
  bodyDe,
  bodyEn,
  topics: ['brand-analysis'],
  sources: [
    /* 0 */ site(URL.nikeHome, 'Nike, Inc.', 'Inspiring the world’s athletes, Nike delivers innovative products, experiences and services.'),
    /* 1 */ wiki(URL.nikeWikiEn, 'The company was founded on January 25, 1964, as "Blue Ribbon Sports", by Bill Bowerman and Phil Knight'),
    /* 2 */ wiki(URL.nikeWikiEn, 'and officially became Nike, Inc. on May 30, 1971'),
    /* 3 */ wiki(URL.nikeWikiEn, 'the Greek goddess of victory'),
    /* 4 */ wiki(URL.nikeWikiEn, 'It would bear the Swoosh newly designed by Carolyn Davidson'),
    /* 5 */ wiki(URL.nikeWikiEn, 'The Swoosh was first used by Nike on June 18, 1971'),
    /* 6 */ wiki(URL.nikeWikiEn, 'The following year, the agency created the first "brand ad" for Nike, called "There is no finish line", in which no Nike product was shown.'),
    /* 7 */ wiki(URL.nikeWikiEn, 'It was agency co-founder Dan Wieden who coined the now-famous slogan " Just Do It " for a 1988 Nike ad campaign'),
    /* 8 */ site(URL.nikeHome, 'Nike, Inc.', 'Nike. Just Do It.'),
    /* 9 */ site(URL.nikeAbout, 'Nike, Inc.', 'If you have a body, you are an athlete'),
  ],
  brandSlugs: ['nike'],
  facts: [],
  ranking: null,
  noteInternal: '',
}
