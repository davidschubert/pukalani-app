/**
 * DIE MARKEN-ZEILEN DES LAUNCH-INHALTS (BI1 I6) — jede genannte Marke hat
 * eine Zeile (Prüfregel 6), alle als `draft`.
 *
 * Nike trägt das volle Dossier (`nike.mjs`); die übrigen fünf sind SCHLANK:
 * Name, Homepage, Katalog-Felder und mindestens eine belegte Quelle. Werte nur
 * aus den Katalogen des brand-Layers (`brandIndustries.ts`,
 * `brandChoiceOptions.ts` → BRAND_ARCHETYPES) — die Seed-Mechanik prüft das
 * nicht noch einmal, der Test tut es.
 *
 * `libraryKey` nur für die vier handgeprüften Einträge der Marktvergleichs-
 * Bibliothek (`market/shared/library/index.ts`: the-barn, apple, nike,
 * anthropic). `foundedYear` nur, wo eine Quelle der Zeile ihn belegt.
 * `relationSlugs` sind Marken-SLUGS; die Ids setzt der Seed im zweiten
 * Durchgang.
 */
import { nikeBrand } from './nike.mjs'
import { site, URL, wiki } from './sources.mjs'

const adidas = {
  slug: 'adidas',
  name: 'adidas',
  homepage: 'https://www.adidas.com',
  libraryKey: '',
  industry: 'manufacturing',
  country: 'DE',
  foundedYear: 1949,
  archetype: '',
  archetypeSecondary: '',
  paletteId: '',
  marks: [
    { kind: 'symbol', text: 'Drei parallele Streifen, am Gründungstag als Marke eingetragen.', sourceIndex: 1 },
  ],
  history: [
    { year: 1949, text: 'Adolf Dassler gründet die Adi Dassler adidas Sportschuhfabrik.', sourceIndex: 0 },
    { year: 1972, text: 'Das Trefoil-Logo erscheint.', sourceIndex: 3 },
  ],
  relationSlugs: ['nike'],
  sources: [
    /* 0 */ wiki(URL.adidasWikiDe, 'Die heutige Adidas AG wurde am 18. August 1949 durch Adolf Dassler als Adi Dassler adidas Sportschuhfabrik mit 47 Mitarbeitern gegründet.'),
    /* 1 */ wiki(URL.adidasWikiDe, 'Noch am selben Tag ließ Dassler ein Schuhmodell patentieren und drei parallele Streifen als Marke eintragen.'),
    /* 2 */ wiki(URL.adidasWikiEn, 'is a German multinational athletic apparel and footwear corporation headquartered in Herzogenaurach'),
    /* 3 */ wiki(URL.adidasWikiEn, 'The Trefoil logo was designed in 1971 and launched in 1972'),
  ],
}

const ikea = {
  slug: 'ikea',
  name: 'IKEA',
  homepage: 'https://www.ikea.com',
  libraryKey: '',
  industry: 'ecommerce',
  country: 'SE',
  foundedYear: 1943,
  archetype: 'citizen',
  archetypeSecondary: '',
  paletteId: '',
  marks: [
    { kind: 'claim', text: '„A better everyday life begins at home!“ – die Vision als Zeile auf der Startseite.', sourceIndex: 2 },
  ],
  history: [
    { year: 1943, text: 'Ingvar Kamprad gründet in Älmhult ein kleines Versandkatalogunternehmen.', sourceIndex: 0 },
    { year: 1958, text: 'In Älmhult eröffnet das erste Möbelhaus.', sourceIndex: 3 },
    { year: 2008, text: 'Seitdem der größte Möbelhändler der Welt.', sourceIndex: 1 },
  ],
  relationSlugs: [],
  sources: [
    /* 0 */ site(URL.ikeaAboutDe, 'IKEA Deutschland', 'IKEA wurde 1943 von Ingvar Kamprad in dem Waldstädtchen Älmhult in Schweden als kleines Versandkatalogunternehmen ins Leben gerufen.'),
    /* 1 */ wiki(URL.ikeaWikiEn, 'and has been the world\'s largest furniture retailer since 2008.'),
    /* 2 */ site(URL.ikeaGlobal, 'Inter IKEA Systems B.V.', 'A better everyday life begins at home!'),
    /* 3 */ wiki(URL.ikeaWikiDe, 'Am 30. Oktober 1958 eröffnete in Älmhult das erste IKEA-Möbelhaus.'),
  ],
}

const apple = {
  slug: 'apple',
  name: 'Apple',
  homepage: 'https://www.apple.com',
  libraryKey: 'apple',
  industry: 'software',
  country: 'US',
  foundedYear: null,
  archetype: '',
  archetypeSecondary: '',
  paletteId: '',
  marks: [],
  history: [],
  relationSlugs: [],
  sources: [
    site(URL.appleHome, 'Apple Inc.', 'Discover the innovative world of Apple'),
  ],
}

const anthropic = {
  slug: 'anthropic',
  name: 'Anthropic',
  homepage: 'https://www.anthropic.com',
  libraryKey: 'anthropic',
  industry: 'software',
  country: 'US',
  foundedYear: null,
  archetype: '',
  archetypeSecondary: '',
  paletteId: '',
  marks: [],
  history: [],
  relationSlugs: [],
  sources: [
    site(URL.anthropicCompany, 'Anthropic PBC', 'Anthropic is an AI safety and research company'),
  ],
}

const theBarn = {
  slug: 'the-barn',
  name: 'The Barn',
  homepage: 'https://thebarn.de',
  libraryKey: 'the-barn',
  industry: 'food',
  country: 'DE',
  foundedYear: null,
  archetype: '',
  archetypeSecondary: '',
  paletteId: '',
  marks: [],
  history: [],
  relationSlugs: [],
  sources: [
    site(URL.theBarnHome, 'THE BARN Coffee Roasters', 'Freshly Roasted Coffee to your door'),
  ],
}

/** Reihenfolge = Anlage-Reihenfolge des Seeds. */
export const LAUNCH_BRANDS = [nikeBrand, adidas, ikea, apple, anthropic, theBarn]
