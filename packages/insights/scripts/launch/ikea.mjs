/**
 * ARTIKEL „IKEA: Wie ein Möbelhaus zur Weltmarke wurde" (BI1 I6, Format
 * `article`, §2.3, §9.8) — der Beweis, dass Profil und Artikel zusammenspielen:
 * der Beitrag verweist auf die IKEA-Marken-Zeile (`brandSlugs`).
 *
 * ── KEINE ANDERE MARKE IM TEXT ──────────────────────────────────────────
 * Prüfregel 4 sperrt jede Marke, die eine Zeile hat und NICHT verwiesen ist
 * (`insightsFlagText`). Der Filter vergleicht ausserdem den Text OHNE
 * Leerzeichen — „von IKEA" ergibt dort `vonikea`, und darin steckt `nike`.
 * Vor dem Namen steht deshalb nie ein Wort, das auf „n" endet; der Test
 * `tests/launchContent.test.ts` hält das fest.
 */
import { site, URL, wiki } from './sources.mjs'

const bodyDe = `## Ein Versandhandel aus Småland

Am Anfang steht kein Möbelhaus, sondern ein Jugendlicher mit einer Idee. IKEA wurde 1943 von Ingvar Kamprad in dem Waldstädtchen Älmhult in Schweden als kleines Versandkatalogunternehmen ins Leben gerufen – so erzählt es das Unternehmen selbst. Verkauft wurde zunächst, was sich verschicken ließ. Möbel kamen erst 1947 dazu, als Kamprad begann, sie per Versand zu verkaufen, besonders an die Bauern der Provinz Småland.

Schon der Name ist Programm. IKEA steht für Ingvar Kamprad, Elmtaryd und Agunnaryd: für den Gründer, den Hof, auf dem er geboren wurde, und das Dorf, in dem er aufwuchs. Vier Buchstaben, die eine Herkunft tragen – eine Person, ein Hof, ein Dorf. Ein Kunstwort ohne Bedeutung hätte sich schneller erklärt, aber es hätte nichts erzählt.

## Der Katalog als Schaufenster

1951 erschien der erste Katalog, und von da an konzentrierte sich das Geschäft nur noch auf Möbel. Entscheidend war weniger das Heft als seine Bildsprache: Möbel wurden bald nicht mehr als einzelne Objekte gezeigt, sondern als Teil eines gesamten, fertig eingerichteten Zimmers. Für die damalige Zeit war das ungewöhnlich – und es verschob die Frage von „Was kostet dieser Stuhl?“ zu „So könnte ein Zuhause aussehen“.

Der Katalog wurde damit mehr als ein Verkaufsprospekt. Er wurde zum Bindeglied zu den Kunden und zum wichtigsten Marketinginstrument des Unternehmens. Über Jahrzehnte war er das, was heute eine Startseite ist: der erste Ort, an dem die Marke ihrem Publikum begegnet. Dass die gedruckte Ausgabe nach siebzig Jahren eingestellt wurde, ändert an dieser Rolle wenig. Sie ist ins Netz gewandert – allein im Geschäftsjahr 2024 zählten die Websites der Marke über 4,6 Milliarden Besuche.

## Das flache Paket

Ab 1955 bot Kamprad erstmals eigens entworfene Möbel an, ab 1956 wurden sie als Bausatz verschickt, um Montage- und Versandkosten zu sparen. Was als Kostenentscheidung begann, wurde zum Markenzeichen. Das flache Paket macht den Preis erklärbar, ohne dass jemand über Preise reden muss: Wer selbst trägt und selbst aufbaut, sieht, wo das Geld bleibt.

Für die Markenführung steckt darin eine wichtige Einsicht: Ein Zeichen muss nicht gezeichnet sein. Das flache Paket hat weder Logo noch Farbe, und trotzdem verbindet man es sofort mit der Marke. Es ist ein Verhalten, das zum Erkennungszeichen geworden ist – und deshalb schwerer nachzuahmen als jedes Logo.

Zu einer weiteren Stütze des Konzepts wurde der Selbsttransport der Möbel durch die Kundschaft. Damit ist die Marke nicht nur etwas, das man sieht, sondern etwas, das man tut. Sie lässt ihre Kundschaft viel selbst machen – und macht daraus selbstbewusst einen Teil des Erlebnisses. Wer ein Regal zusammengeschraubt hat, erinnert sich an den Abend, nicht nur an das Möbel.

## Das Möbelhaus als Bühne

Am 30. Oktober 1958 eröffnete in Älmhult das erste Möbelhaus der Marke. Von Anfang an sollte es auf Anregung Kamprads in jedem Haus auch ein Restaurant geben, damit die Einrichtungshäuser zur Mittagszeit nicht leer stehen. Aus einer betrieblichen Überlegung wurde ein Ritual: Der Besuch ist kein Einkauf mehr, sondern ein Ausflug.

Eine zweite Entscheidung entstand aus einem Engpass. 1965 eröffnete im Raum Stockholm ein weiteres Haus, das damals größte Möbelzentrum Schwedens. Der Andrang übertraf die Erwartungen, und Kamprad ließ daraufhin die Lager für die Kunden öffnen. Bis heute sind die Lager Verkaufsraum geblieben. Dass man selbst zwischen den Regalen des Lagers steht, ist also kein Zufall, sondern Geschichte.

Nach Deutschland kam das Konzept am 17. Oktober 1974, mit dem ersten Haus in Eching bei München. Der Ablauf war derselbe wie in Schweden – und gerade das machte ihn zur Marke: Wer einmal durch ein Haus gegangen ist, findet sich in jedem anderen zurecht.

## Eine Vision statt eines Slogans

Geführt wird die Marke von einem Satz, der sich seit Jahrzehnten nicht verändert hat. Auf der deutschen Website lautet er: „Den vielen Menschen einen besseren Alltag zu Hause zu ermöglichen.“ Die globale Fassung spricht von „a better everyday life for the many people“, und die Startseite kürzt ihn auf eine Zeile: „A better everyday life begins at home!“

Bemerkenswert ist, was der Satz nicht sagt. Er nennt kein Produkt, keinen Preis und keinen Stil. Er beschreibt eine Wirkung – und lässt damit Raum für alles, was die Marke seitdem verkauft hat. Genau deshalb trägt er so weit: Ein Versprechen über Möbel hätte die Marke an Möbel gebunden, ein Versprechen über den Alltag nicht.

Dazu passt, wie das Unternehmen über die eigene Zukunft spricht. Auf der Unternehmensseite steht ein Satz des Gründers: „Das meiste ist noch nicht getan. Wunderbare Zukunft!“ Eine Marke, die so über sich redet, erklärt den eigenen Erfolg nicht für abgeschlossen.

## Vom Möbelhaus zur Weltmarke

Was damals klein begann, entwickelte sich nach eigener Aussage zu einer weltweiten Möbelmarke, die Menschen in aller Welt mit erschwinglichem Design und Komfort versorgt. Seit 2008 ist IKEA der größte Möbelhändler der Welt. Der Weg dorthin war keine Abfolge großer Kampagnen, sondern eine Kette konsequenter Entscheidungen: ein Name mit Herkunft, ein Katalog, der Räume zeigt, ein Paket, das Kosten sichtbar macht, ein Haus, das man als Ausflug erlebt, und ein Satz, der die Richtung vorgibt.

Keine dieser Entscheidungen war für sich genommen spektakulär. Ihre Wirkung entsteht daraus, dass sie zusammenpassen und über Jahrzehnte durchgehalten wurden. Das ist die eigentliche Lektion: Eine Weltmarke entsteht selten aus einem großen Wurf, sondern aus vielen kleinen Entscheidungen, die alle in dieselbe Richtung zeigen.

## Was Marken davon lernen können

Drei Gedanken nehmen wir aus dieser Geschichte mit, gleich ob für eine Rösterei, ein Studio oder ein Softwarehaus:

1. **Herkunft ist ein Wert, wenn man sie zeigt.** Vier Buchstaben erzählen hier von einer Person, einem Hof und einem Dorf.
2. **Das Medium ist Teil der Marke.** Der Katalog zeigte keine Produkte, sondern Zimmer – und damit ein Versprechen.
3. **Eine Vision trägt weiter als ein Slogan.** Ein Satz über den Alltag hat mehr als acht Jahrzehnte Wachstum überdauert.

Wie stark ein Auftritt heute im Netz wirkt, misst der Brand-Check – für eine Weltmarke genauso wie für die eigene.

**Methodik:** Wie der Brand Score entsteht, steht in der [Methodik](/brand-check/methodik).`

const bodyEn = `## A mail-order business from Småland

It all starts not with a furniture store but with a teenager and an idea. According to the company itself, IKEA was founded in 1943 by Ingvar Kamprad as a small mail-order catalogue business in the forest town of Älmhult, Sweden. At first it sold whatever could be posted. Furniture only arrived in 1947, when Kamprad began selling it by mail, above all to the farmers of the province of Småland.

The name itself is a statement. IKEA stands for Ingvar Kamprad, Elmtaryd and Agunnaryd: the founder, the farm where he was born and the village where he grew up. Four letters that carry an origin – a person, a farm, a village. A made-up word without meaning would have been quicker to explain, but it would have told no story.

## The catalogue as a shop window

The first catalogue appeared in 1951, and from then on the business focused solely on furniture. What mattered was less the booklet than its imagery: furniture was soon shown not as single objects but as part of a complete, fully furnished room. For its time that was unusual – and it shifted the question from “What does this chair cost?” to “This is what a home could look like”.

The catalogue thus became more than a sales brochure. It became the link to customers and the company’s most important marketing tool. For decades it was what a homepage is today: the first place where the brand meets its audience. That the printed edition ended after seventy years changes little about this role. It has moved online – in fiscal year 2024 alone, the brand’s websites counted more than 4.6 billion visits.

## The flat pack

From 1955 Kamprad offered furniture designed specifically for the company, and from 1956 it was shipped as a kit to save on assembly and shipping costs. What began as a cost decision became a hallmark. The flat pack makes the price understandable without anyone having to talk about prices: whoever carries and assembles it themselves sees where the money goes.

There is an important lesson here for brand management: a mark does not have to be drawn. The flat pack has neither a logo nor a colour, and yet people link it with the brand at once. It is a behaviour that has become a signature – and therefore harder to imitate than any logo.

Customers transporting their own furniture became a further pillar of the concept. That makes the brand not only something you see but something you do. It asks its customers to do a lot themselves – and confidently turns that into part of the experience. Whoever has put a shelf together remembers the evening, not just the furniture.

## The store as a stage

The brand’s first store opened at Älmhult on 30 October 1958. At Kamprad’s suggestion, every store was to have a restaurant from the start, so that the stores would not stand empty at lunchtime. An operational idea turned into a ritual: a visit is no longer a shopping trip but a day out.

A second decision grew out of a bottleneck. In 1965 another store opened near Stockholm, at the time the largest furniture centre in Sweden. The rush exceeded expectations, and Kamprad responded by opening the warehouse to customers. To this day the warehouse has remained a sales floor. So standing between the warehouse shelves yourself is no accident but history.

The concept reached Germany on 17 October 1974, with the first store at Eching near Munich. The layout was the same as at home – and that is exactly what made it a brand: whoever has walked through one store finds their way through every other.

## A vision instead of a slogan

The brand is guided by a sentence that has not changed for decades. The German website puts it as “Den vielen Menschen einen besseren Alltag zu Hause zu ermöglichen”. The global version speaks of “a better everyday life for the many people”, and the homepage condenses it to a single line: “A better everyday life begins at home!”

What stands out is what the sentence does not say. It names no product, no price and no style. It describes an effect – and so leaves room for everything the brand has sold since. That is exactly why it carries so far: a promise about furniture would have tied the brand to furniture, a promise about everyday life does not.

That fits the way the company talks about its own future. Its corporate page quotes the founder: “Das meiste ist noch nicht getan. Wunderbare Zukunft!” – most things still remain to be done. A brand that talks about itself this way does not declare its own success finished.

## From furniture store to global brand

By its own account, what began small grew step by step into a worldwide furniture brand that brings affordable design and comfort to people all over the world. Since 2008, IKEA has been the world’s largest furniture retailer. The road there was not a sequence of big campaigns but a chain of consistent decisions: a name with an origin, a catalogue that shows rooms, a pack that makes costs visible, a store you experience as a day out, and a sentence that sets the direction.

None of these decisions was spectacular on its own. Their effect comes from fitting together and being kept up for decades. That is the real lesson: a global brand rarely comes from one big stroke, but from many small decisions that all point the same way.

## What brands can learn from this

We take three thoughts from this story, whether for a roastery, a studio or a software company:

1. **Origin is an asset when you show it.** Here, four letters tell of a person, a farm and a village.
2. **The medium is part of the brand.** The catalogue showed rooms, not products – and with them a promise.
3. **A vision travels further than a slogan.** A sentence about everyday life has outlasted more than eight decades of growth.

How strong a presence is online today is what the Brand Check measures – for a global brand just as for your own.

**Methodology:** How the Brand Score is calculated is explained in our [methodology](/brand-check/methodik).`

export const ikeaArticle = {
  format: 'article',
  slug: 'ikea-wie-ein-moebelhaus-zur-weltmarke-wurde',
  baseLocale: 'de',
  titleDe: 'IKEA: Wie ein Möbelhaus zur Weltmarke wurde',
  titleEn: 'IKEA: how a furniture store became a global brand',
  dekDe: 'Ein Versandhandel aus Småland, ein Katalog, ein flaches Paket: wie aus wenigen konsequenten Entscheidungen eine der bekanntesten Marken der Welt wurde.',
  dekEn: 'A mail-order business from Småland, a catalogue, a flat pack: how a handful of consistent decisions built one of the best-known brands in the world.',
  bodyDe,
  bodyEn,
  topics: ['brand-analysis'],
  sources: [
    /* 0 */ site(URL.ikeaAboutDe, 'IKEA Deutschland', 'IKEA wurde 1943 von Ingvar Kamprad in dem Waldstädtchen Älmhult in Schweden als kleines Versandkatalogunternehmen ins Leben gerufen.'),
    /* 1 */ wiki(URL.ikeaWikiDe, '1947 begann Kamprad, auch Möbel per Versand zu verkaufen, besonders an die Bauern der historischen Provinz Småland'),
    /* 2 */ wiki(URL.ikeaWikiDe, 'IKEA (Abkürzung für Ingvar Kamprad Elmtaryd Agunnaryd'),
    /* 3 */ wiki(URL.ikeaWikiEn, 'the farm where he was born; and the nearby village of Agunnaryd where he was raised'),
    /* 4 */ wiki(URL.ikeaWikiDe, '1951 erschien der erste IKEA- Katalog'),
    /* 5 */ wiki(URL.ikeaWikiDe, 'In IKEA-Katalogen wurden bald Möbel nicht nur als einzelne Objekte, sondern als Teil eines gesamten, fertig eingerichteten Zimmers abgebildet.'),
    /* 6 */ wiki(URL.ikeaWikiDe, 'Die Kataloge wurden zum Bindeglied zu den Kunden und zum wichtigsten Marketinginstrument des Unternehmens.'),
    /* 7 */ wiki(URL.ikeaWikiEn, 'its annual catalogue ceased publication after 70 years in print.'),
    /* 8 */ wiki(URL.ikeaWikiEn, 'there were over 4.6 billion visitors to IKEA\'s websites in FY2024'),
    /* 9 */ wiki(URL.ikeaWikiDe, 'Ab 1955 bot Kamprad erstmals eigens für IKEA entworfene Möbel an.'),
    /* 10 */ wiki(URL.ikeaWikiDe, 'Die Möbel wurden zur Einsparung von Montage- und Versandkosten ab 1956 als Bausatz verschickt.'),
    /* 11 */ wiki(URL.ikeaWikiDe, 'Zu einer weiteren Stütze des IKEA-Konzepts wurde der Selbsttransport der Möbel durch die Kunden.'),
    /* 12 */ wiki(URL.ikeaWikiDe, 'Am 30. Oktober 1958 eröffnete in Älmhult das erste IKEA-Möbelhaus.'),
    /* 13 */ wiki(URL.ikeaWikiDe, 'Zudem sollte es auf Anregung Kamprads von Anfang an in jedem Warenhaus auch ein Restaurant geben, um leeren Einrichtungshäusern zur Mittagszeit entgegenzuwirken.'),
    /* 14 */ wiki(URL.ikeaWikiDe, 'ein weiteres IKEA-Haus im Raum Stockholm eröffnet, das damals größte Möbelzentrum Schwedens.'),
    /* 15 */ wiki(URL.ikeaWikiDe, 'Daraufhin ließ Kamprad die Lager für die Kunden öffnen. Bis heute sind die Lager Verkaufsraum geblieben.'),
    /* 16 */ wiki(URL.ikeaWikiDe, 'Das erste IKEA-Möbelhaus in Deutschland wurde am 17. Oktober 1974 in Eching bei München eröffnet.'),
    /* 17 */ site(URL.ikeaAboutDe, 'IKEA Deutschland', 'Was aber immer bleibt, ist unsere Vision: Den vielen Menschen einen besseren Alltag zu Hause zu ermöglichen.'),
    /* 18 */ site(URL.ikeaBusiness, 'Inter IKEA Systems B.V.', 'an inspiring shared vision: to create a better everyday life for the many people'),
    /* 19 */ site(URL.ikeaGlobal, 'Inter IKEA Systems B.V.', 'A better everyday life begins at home!'),
    /* 20 */ site(URL.ikeaAboutDe, 'IKEA Deutschland', 'Das meiste ist noch nicht getan. Wunderbare Zukunft!'),
    /* 21 */ site(URL.ikeaAboutDe, 'IKEA Deutschland', 'Was damals klein begann, entwickelte sich nach und nach zu einer weltweiten Möbelmarke, die Menschen in aller Welt mit erschwinglichem Design und Komfort versorgt.'),
    /* 22 */ wiki(URL.ikeaWikiEn, 'and has been the world\'s largest furniture retailer since 2008.'),
    /* 23 */ site(URL.ikeaAboutUs, 'IKEA U.S.', 'our vision remains the same: to create a better everyday life for the many people.'),
  ],
  brandSlugs: ['ikea'],
  facts: [],
  ranking: null,
  noteInternal: '',
}
