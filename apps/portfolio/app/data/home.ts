import type { Localized, LocalizedFaq } from './localized'
import { SERVICE_CORES, type ServiceCore, type ServiceId } from './services'

/**
 * Inhalte der Startseite — Single Source of Truth für Markup UND Structured
 * Data. Das FAQ-JSON-LD entsteht aus DEMSELBEN `faqs`-Array wie das sichtbare
 * FAQ (Paritäts-Prinzip, Google-Anforderung), der OfferCatalog aus `services`.
 *
 * Deutsch ist der Ursprungstext (Übernahme aus dem alten Portfolio-Repo,
 * Stand 14. Juli 2026); Englisch ist die gleichwertige Fassung derselben
 * Aussage — die Seite wirbt in beiden Sprachen um DACH-Kunden, der regionale
 * Fokus bleibt also auch im englischen Text erhalten.
 *
 * ABSENDER IST DAS STUDIO (Rebrand 21. August 2026): die Erzählstimme ist
 * durchgehend „wir/unser" (en „we/our"), nicht mehr die Ich-Form der früheren
 * Freelancer-Site. David Schubert bleibt als PERSON sichtbar, wo es um die
 * Person geht — im Person-Knoten des JSON-LD und in der Studio-Sektion
 * („Hinter Pukalani Studio steht …"). Kundenzitate bleiben unangetastet: das
 * sind Aussagen Dritter. Eine Teamgröße wird NIRGENDS behauptet — „wir" ist
 * das Studio, Partner kommen je nach Projekt dazu.
 */

export interface KeyFact {
  label: Localized
  value: Localized
}

export interface Audience {
  title: Localized
  description: Localized
}

/**
 * Was die STARTSEITE über eine Leistung zusätzlich erzählt. Id, Titel und
 * Detailseite stehen in `services.ts` — dort, weil auch die Fußzeile sie
 * braucht (Begründung im Kopf jener Datei).
 */
export interface ServiceDetail {
  description: Localized
  deliverables: Localized<string[]>
  result: Localized
  price: Localized
  duration: Localized
  /** Kurzfassung für den OfferCatalog (bewusst anders als der Fließtext). */
  schemaDescription: Localized
  minPrice?: number
  maxPrice?: number
}

/** Die vollständige Leistung, wie Karten und OfferCatalog sie sehen. */
export type HomeService = ServiceCore & ServiceDetail

export interface ProcessStep {
  title: Localized
  description: Localized
  duration: Localized
}

export interface CaseStudy {
  title: Localized
  tags: string[]
  challenge: Localized
  solution: Localized
  results: Localized<string[]>
}

export interface Testimonial {
  text: Localized
  attribution: Localized
}

export interface Milestone {
  period: Localized
  description: Localized
}

export interface StackGroup {
  title: Localized
  items: Localized<string[]>
}

export interface Guide {
  kicker: Localized
  title: Localized
  description: Localized
  to: string
}

export interface RemoteCard {
  title: Localized
  description: Localized
}

export interface SectionHeading {
  title: Localized
  lead: Localized
}

export interface ContactChannel {
  title: Localized
  description: Localized
  linkLabel: Localized
  href: string
  external: boolean
}

export const HERO = {
  availability: {
    de: 'Verfügbar für neue Projekte · UX-Audits laufend',
    en: 'Available for new projects · UX audits on a rolling basis',
  } satisfies Localized,
  eyebrow: {
    de: 'Pukalani Studio · Design & Umsetzung · Remote für DACH',
    en: 'Pukalani Studio · Design & build · Remote for DACH',
  } satisfies Localized,
  title: {
    de: 'Senior UI/UX Design für Mittelstand und Agenturen',
    en: 'Senior UI/UX design for mid-sized companies and agencies',
  } satisfies Localized,
  intro: {
    de: 'Pukalani Studio ist ein digitales Design-Studio – mit über 25 Jahren Erfahrung aus Design und Werbung im Rücken. Wir erarbeiten mit Ihnen Designkonzepte, Strategien und digitales Brand Design, gestalten Websites und digitale Produkte – und setzen sie auf Wunsch technisch um. Remote für Unternehmen und Agenturen in Deutschland, Österreich und der Schweiz, zu festen Projektpreisen.',
    en: 'Pukalani Studio is a digital design studio, backed by more than 25 years of experience in design and advertising. We develop design concepts, strategies and digital brand design with you, design websites and digital products — and build them for you if you would like. Remote for companies and agencies in Germany, Austria and Switzerland, at fixed project prices.',
  } satisfies Localized,
  brandsLead: {
    de: 'In Agentur- und Studio-Projekten verantworten wir Konzepte und Gestaltung für Marken wie',
    en: 'In agency and studio projects we have led concept and design work for brands such as',
  } satisfies Localized,
  brands: {
    de: 'Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom und T-Systems',
    en: 'Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom and T-Systems',
  } satisfies Localized,
  ctaPrimary: {
    de: 'Kostenloses Erstgespräch (30 Min)',
    en: 'Book a free 30-minute intro call',
  } satisfies Localized,
  ctaSecondary: {
    de: 'Leistungen & Preise',
    en: 'Services & pricing',
  } satisfies Localized,
}

export const TRUST_BADGES: Localized<string[]> = {
  de: [
    '25+ Jahre Erfahrung',
    'Ausgebildeter Mediengestalter',
    'Konzept, Design & Umsetzung',
    'Festpreise statt Tagessätze',
    'Antwort in 24 h',
  ],
  en: [
    '25+ years of experience',
    'Trained media designer',
    'Concept, design & build',
    'Fixed prices, not day rates',
    'Reply within 24 hours',
  ],
}

export const KEY_FACTS: KeyFact[] = [
  {
    label: { de: 'Name', en: 'Name' },
    value: { de: 'Pukalani Studio', en: 'Pukalani Studio' },
  },
  {
    label: { de: 'Profil', en: 'Profile' },
    value: {
      de: 'Digitales Design-Studio für UI/UX, Brand Design und technische Umsetzung',
      en: 'Digital design studio for UI/UX, brand design and technical implementation',
    },
  },
  {
    label: { de: 'Qualifikation', en: 'Qualifications' },
    value: {
      de: 'Mediengestalter Digital & Print · Bachelor Professional in Digital Media (IHK)',
      en: 'Media designer for digital & print · Bachelor Professional in Digital Media (German Chamber of Commerce)',
    },
  },
  {
    label: { de: 'Erfahrung', en: 'Experience' },
    value: {
      de: '25+ Jahre in Design & Werbung, davon viele Jahre in Hamburger Agenturen (zuletzt Senior UI/UX Design bei Philipp und Keuntje)',
      en: '25+ years in design and advertising, many of them in Hamburg agencies (most recently senior UI/UX design at Philipp und Keuntje)',
    },
  },
  {
    label: { de: 'Leistungen', en: 'Services' },
    value: {
      de: 'Designkonzepte & Strategie, digitales Brand Design, Websites & digitale Produkte, technische Umsetzung, Content-Produktion (Foto, Video, Werbemittel)',
      en: 'Design concepts & strategy, digital brand design, websites & digital products, technical implementation, content production (photo, video, ad assets)',
    },
  },
  {
    label: { de: 'Kunden & Marken', en: 'Clients & brands' },
    value: {
      de: 'Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom, T-Systems u. v. m. (Agentur- & Studio-Projekte)',
      en: 'Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom, T-Systems and many more (agency & studio projects)',
    },
  },
  {
    label: { de: 'Zielgruppen', en: 'Who we work with' },
    value: {
      de: 'Mittelständische Unternehmen sowie Werbe-, Marketing- & Digitalagenturen',
      en: 'Mid-sized companies as well as advertising, marketing & digital agencies',
    },
  },
  {
    label: { de: 'Region', en: 'Region' },
    value: {
      de: 'Remote für DACH (DE, AT, CH) · Sitz: Pukalani, Maui – Hawaii',
      en: 'Remote for the DACH region (DE, AT, CH) · based in Pukalani, Maui – Hawaii',
    },
  },
  {
    label: { de: 'Sprachen', en: 'Languages' },
    value: {
      de: 'Deutsch (Muttersprache), Englisch',
      en: 'German (native), English',
    },
  },
  {
    label: { de: 'Preise', en: 'Pricing' },
    value: {
      de: 'Festpreise: €2.500 (UX-Audit) bis €75.000+ (Produkt-Design)',
      en: 'Fixed prices: €2,500 (UX audit) up to €75,000+ (product design)',
    },
  },
  {
    label: { de: 'Kontakt', en: 'Contact' },
    value: {
      de: 'mail@davidschubert.com · cal.com/davidschubert/30min',
      en: 'mail@davidschubert.com · cal.com/davidschubert/30min',
    },
  },
  {
    label: { de: 'Verantwortlich', en: 'Who runs it' },
    value: {
      de: 'David Schubert, Senior UI/UX Designer & Creative Technologist – Sie arbeiten immer direkt mit der Senior-Ebene; je nach Projekt kommen ausgewählte Partner dazu',
      en: 'David Schubert, senior UI/UX designer & creative technologist — you always work directly with the senior level; selected partners join depending on the project',
    },
  },
]

export const AUDIENCES: Audience[] = [
  {
    title: {
      de: 'Mittelständische Unternehmen',
      en: 'Mid-sized companies',
    },
    description: {
      de: 'Sie brauchen einen erfahrenen Design-Partner, der Ihre Sprache spricht – ohne Fachjargon, ohne Agentur-Overhead. Von der ersten Idee über das Designkonzept bis zur fertigen Website: ein Ansprechpartner, klare Festpreise, verständliche Beratung.',
      en: 'You need an experienced design partner who speaks your language — no jargon, no agency overhead. From the first idea through the design concept to the finished website: one contact, clear fixed prices, advice you can act on.',
    },
  },
  {
    title: {
      de: 'Werbe-, Marketing- & Digitalagenturen',
      en: 'Advertising, marketing & digital agencies',
    },
    description: {
      de: 'Wir verstärken Ihr Team auf Senior-Niveau – zuverlässig, remote und auf Wunsch unsichtbar für Ihren Kunden (White Label). Konzept, UI/UX-Design, Art Direction oder technische Umsetzung: Sie buchen genau die Kompetenz, die im Projekt fehlt.',
      en: 'We add senior capacity to your team — reliable, remote and, on request, invisible to your client (white label). Concept, UI/UX design, art direction or technical implementation: you book exactly the skill your project is missing.',
    },
  },
  {
    title: {
      de: 'Auf Empfehlung hier?',
      en: 'Here on a referral?',
    },
    description: {
      de: 'Viele unserer Projekte entstehen über Empfehlungen ehemaliger Kolleginnen, Kollegen und Kunden. Schön, dass Sie da sind – Arbeitsproben, Referenzen und ein ehrliches Gespräch darüber, ob wir die richtige Besetzung sind, gibt es im kostenlosen Erstgespräch.',
      en: 'Many of our projects come through referrals from former colleagues and clients. Glad you are here — work samples, references and an honest conversation about whether we are the right fit are all part of the free intro call.',
    },
  },
]

/**
 * Die Ergänzungen je Leistung, aufgeschlüsselt nach der Anker-Id aus
 * `services.ts`. `Record<ServiceId, …>` ist hier die Sicherung: eine neue
 * Leistung dort ohne Eintrag hier bricht den Typecheck, statt eine Karte ohne
 * Beschreibung und ein Angebot ohne Schema-Text zu erzeugen.
 */
const SERVICE_DETAILS: Record<ServiceId, ServiceDetail> = {
  'brand-design': {
    description: {
      de: 'Der Auftritt, an dem man Sie erkennt: Logos, visuelle Identitäten, Designkonzepte und Strategien – digital und print, aus einem Guss.',
      en: 'The presence people recognise you by: logos, visual identities, design concepts and strategies — digital and print, consistent throughout.',
    },
    deliverables: {
      de: [
        'Designkonzept & kreative Leitidee',
        'Logo & visuelle Identität (Farben, Typografie, Bildwelt)',
        'Gestaltungsrichtlinien für digital & print',
        'Art Direction für Kampagnen & Werbemittel',
      ],
      en: [
        'Design concept & core creative idea',
        'Logo & visual identity (colour, typography, imagery)',
        'Design guidelines for digital & print',
        'Art direction for campaigns & ad assets',
      ],
    },
    result: {
      de: 'Marken-Erfahrung u. a. mit Astra, GEMA, NEFF & Telekom',
      en: 'Brand experience with Astra, GEMA, NEFF & Telekom, among others',
    },
    price: { de: 'Festpreis nach Umfang', en: 'Fixed price by scope' },
    duration: { de: 'je nach Projekt', en: 'per project' },
    schemaDescription: {
      de: 'Designkonzepte, Logos, visuelle Identitäten und Art Direction für digitale und gedruckte Markenauftritte.',
      en: 'Design concepts, logos, visual identities and art direction for digital and printed brand presences.',
    },
  },
  'ux-audit': {
    description: {
      de: 'Der schnellste Einstieg: Wir analysieren Ihre Website oder App strukturiert und liefern eine priorisierte Maßnahmenliste mit Quick Wins.',
      en: 'The fastest way in: we analyse your website or app in a structured way and deliver a prioritised action list with quick wins.',
    },
    deliverables: {
      de: [
        'Heuristische UX-Evaluation & Conversion-Analyse',
        'Performance-Check (Core Web Vitals)',
        'WCAG-2.1-Accessibility-Prüfung',
        'Priorisierte Maßnahmenliste mit Quick Wins',
      ],
      en: [
        'Heuristic UX evaluation & conversion analysis',
        'Performance check (Core Web Vitals)',
        'WCAG 2.1 accessibility review',
        'Prioritised action list with quick wins',
      ],
    },
    result: {
      de: 'Ergebnis: priorisierte Maßnahmenliste mit Quick Wins',
      en: 'Outcome: a prioritised action list with quick wins',
    },
    price: { de: '€2.500 – €5.000', en: '€2,500 – €5,000' },
    duration: { de: '1–2 Wochen', en: '1–2 weeks' },
    schemaDescription: {
      de: 'Strukturierte Analyse von Website oder App: heuristische Evaluation, Conversion-Analyse, Core-Web-Vitals-Check und WCAG-Accessibility-Prüfung mit priorisierter Maßnahmenliste.',
      en: 'Structured analysis of a website or app: heuristic evaluation, conversion analysis, Core Web Vitals check and WCAG accessibility review with a prioritised action list.',
    },
    minPrice: 2500,
    maxPrice: 5000,
  },
  'landingpage-cro': {
    description: {
      de: 'Landingpages mit Conversion-Fokus: Nutzerpsychologie, Social Proof und technische Performance – gestaltet und auf Wunsch direkt entwickelt.',
      en: 'Landing pages built for conversion: user psychology, social proof and technical performance — designed and, on request, built by us as well.',
    },
    deliverables: {
      de: [
        'Conversion-orientiertes UX/UI-Design',
        'A/B-Test-Varianten & UX Writing',
        'Mobile-First, LCP unter 2,5 s',
        'Umsetzung in Nuxt oder Handoff an Ihr Team',
      ],
      en: [
        'Conversion-focused UX/UI design',
        'A/B test variants & UX writing',
        'Mobile-first, LCP under 2.5 s',
        'Built in Nuxt or handed off to your team',
      ],
    },
    result: {
      de: 'Referenzprojekt: Checkout von sieben auf drei Schritte verkürzt',
      en: 'Reference project: checkout cut from seven steps to three',
    },
    price: { de: '€5.000 – €12.000', en: '€5,000 – €12,000' },
    duration: { de: '2–3 Wochen', en: '2–3 weeks' },
    schemaDescription: {
      de: 'Conversion-optimierte Landingpage: UX/UI-Design, A/B-Test-Varianten, Mobile-First-Umsetzung mit LCP unter 2,5 Sekunden – als Design oder komplett entwickelt.',
      en: 'Conversion-optimised landing page: UX/UI design, A/B test variants, mobile-first implementation with an LCP under 2.5 seconds — as a design or fully built.',
    },
    minPrice: 5000,
    maxPrice: 12000,
  },
  'corporate-website': {
    description: {
      de: 'Ihr Unternehmensauftritt aus einer Hand: Inhalte strukturieren, Design entwickeln, barrierefrei und schnell umsetzen – fertig zum Launch.',
      en: 'Your corporate presence end to end: structure the content, develop the design, build it accessibly and fast — ready to launch.',
    },
    deliverables: {
      de: [
        'Content-Strategie & Informationsarchitektur',
        'Responsive Design, WCAG 2.1 AA',
        'SEO- & Performance-Optimierung (PageSpeed 90+)',
        'Umsetzung in Nuxt oder developer-ready Figma-Files',
      ],
      en: [
        'Content strategy & information architecture',
        'Responsive design, WCAG 2.1 AA',
        'SEO & performance optimisation (PageSpeed 90+)',
        'Built in Nuxt or handed over as developer-ready Figma files',
      ],
    },
    result: {
      de: 'Referenzprojekt: barrierefreier Mobile-First-Relaunch',
      en: 'Reference project: accessible mobile-first relaunch',
    },
    price: { de: '€15.000 – €35.000', en: '€15,000 – €35,000' },
    duration: { de: '6–12 Wochen', en: '6–12 weeks' },
    schemaDescription: {
      de: 'Corporate Website von Content-Strategie über barrierefreies Design (WCAG 2.1 AA) bis zur SEO- und performance-optimierten Umsetzung.',
      en: 'Corporate website from content strategy through accessible design (WCAG 2.1 AA) to an SEO- and performance-optimised build.',
    },
    minPrice: 15000,
    maxPrice: 35000,
  },
  'saas-design': {
    description: {
      de: 'Komplexe Software verständlich machen: Nutzer-Recherche, klare Strukturen, Oberflächen-Design und skalierbare Design-Systeme.',
      en: 'Making complex software understandable: user research, clear structures, interface design and scalable design systems.',
    },
    deliverables: {
      de: [
        'User Research, Personas & User Journeys',
        'Informationsarchitektur & Dashboard-UX',
        'Component Library & Design Tokens in Figma',
        'Developer Handoff mit Dokumentation',
      ],
      en: [
        'User research, personas & user journeys',
        'Information architecture & dashboard UX',
        'Component library & design tokens in Figma',
        'Developer handoff with documentation',
      ],
    },
    result: {
      de: 'Referenzprojekt: +43 % Feature-Adoption, −67 % Support',
      en: 'Reference project: +43% feature adoption, −67% support load',
    },
    price: { de: 'ab €25.000 (bis €75.000+)', en: 'from €25,000 (up to €75,000+)' },
    duration: { de: 'ab 8 Wochen', en: 'from 8 weeks' },
    schemaDescription: {
      de: 'SaaS-Produkt- und Dashboard-Design: User Research, Informationsarchitektur, UI-Design und skalierbares Design System mit Component Library und Design Tokens.',
      en: 'SaaS product and dashboard design: user research, information architecture, UI design and a scalable design system with component library and design tokens.',
    },
    minPrice: 25000,
    maxPrice: 75000,
  },
  'content-produktion': {
    description: {
      de: 'Inhalte, die zum Design passen: digitale Werbemittel, Fotografie und Videografie inklusive Schnitt – aus einer Hand, mit dem Handwerk ausgebildeter Mediengestalter.',
      en: 'Content that fits the design: digital ad assets, photography and video including editing — from one studio, with the craft of a trained media designer.',
    },
    deliverables: {
      de: [
        'Digitale Werbemittel & Social-Media-Assets',
        'Fotografie (Produkt, Business, Location)',
        'Videografie & Videoschnitt (Final Cut Pro)',
        'Aufbereitung für Web, Kampagnen & Print',
      ],
      en: [
        'Digital ad assets & social media assets',
        'Photography (product, business, location)',
        'Video production & editing (Final Cut Pro)',
        'Preparation for web, campaigns & print',
      ],
    },
    result: {
      de: 'Design & Content aus einer Hand – ohne Reibungsverluste',
      en: 'Design & content end to end — no friction in between',
    },
    price: { de: 'Festpreis nach Umfang', en: 'Fixed price by scope' },
    duration: { de: 'je nach Projekt', en: 'per project' },
    schemaDescription: {
      de: 'Content-Produktion für Marken: digitale Werbemittel, Social-Media-Assets, Fotografie sowie Videografie inklusive Videoschnitt.',
      en: 'Content production for brands: digital ad assets, social media assets, photography and video production including editing.',
    },
  },
}

/**
 * Die sechs Leistungen, vollständig — Reihenfolge und Titel kommen aus
 * `SERVICE_CORES`, alles Weitere aus `SERVICE_DETAILS`. Speist die Karten der
 * Startseite UND den OfferCatalog im JSON-LD.
 */
export const SERVICES: HomeService[] = SERVICE_CORES.map(core => ({
  ...core,
  ...SERVICE_DETAILS[core.id],
}))

export const PROCESS_STEPS: ProcessStep[] = [
  {
    title: { de: 'Discovery & Zieldefinition', en: 'Discovery & goal definition' },
    description: {
      de: 'Ziele, Stakeholder, KPIs und Nutzergruppen werden gemeinsam geschärft – als belastbare Basis für alle Entscheidungen.',
      en: 'Together we define the goals, stakeholders, KPIs and user groups — a solid basis for every decision that follows.',
    },
    duration: { de: '3–5 Tage', en: '3–5 days' },
  },
  {
    title: { de: 'Research & UX-Konzept', en: 'Research & UX concept' },
    description: {
      de: 'User Research, Informationsarchitektur und Flow-Logik: Das Konzept entsteht datenbasiert, nicht nach Bauchgefühl.',
      en: 'User research, information architecture and flow logic: the concept is built on data, not on gut feeling.',
    },
    duration: { de: '1–2 Wochen', en: '1–2 weeks' },
  },
  {
    title: { de: 'UI-Design & Prototyping', en: 'UI design & prototyping' },
    description: {
      de: 'Visual Language, Komponenten und klickbare Prototypen in Figma – früh testbar mit echten Nutzern.',
      en: 'Visual language, components and clickable prototypes in Figma — testable with real users early on.',
    },
    duration: { de: '2–4 Wochen', en: '2–4 weeks' },
  },
  {
    title: { de: 'Design System & Dokumentation', en: 'Design system & documentation' },
    description: {
      de: 'Design Tokens, Component Library und Guidelines machen das Design skalierbar und konsistent.',
      en: 'Design tokens, component library and guidelines make the design scalable and consistent.',
    },
    duration: { de: '1–2 Wochen', en: '1–2 weeks' },
  },
  {
    title: { de: 'Entwicklung oder Handoff', en: 'Development or handoff' },
    description: {
      de: 'Wir entwickeln selbst in Nuxt 4 und TypeScript – oder übergeben developer-ready Figma-Files an Ihr Team.',
      en: 'We build it ourselves in Nuxt 4 and TypeScript — or hand developer-ready Figma files to your team.',
    },
    duration: { de: 'je nach Umfang', en: 'depending on scope' },
  },
  {
    title: { de: 'Launch, Messung & Optimierung', en: 'Launch, measurement & optimisation' },
    description: {
      de: 'Analytics-Setup, A/B-Tests und kontinuierliche Verbesserung – Design endet nicht beim Launch.',
      en: 'Analytics setup, A/B tests and continuous improvement — design does not end at launch.',
    },
    duration: { de: 'fortlaufend', en: 'ongoing' },
  },
]

/**
 * Anonymisierte Kundenprojekte. Die SVG-Illustrationen des alten Repos sind
 * bewusst NICHT mitgekommen: sie waren im Emerald/Blue-Farbschema gezeichnet
 * und hätten in der dunklen Syne-Welt als Fremdkörper gestanden. Die Zahlen
 * tragen die Sektion ohnehin — die Darstellung ist rein typografisch.
 */
export const CASE_STUDIES: CaseStudy[] = [
  {
    title: {
      de: '+43 % Feature-Adoption: SaaS Analytics Dashboard',
      en: '+43% feature adoption: SaaS analytics dashboard',
    },
    tags: ['B2B SaaS', 'Dashboard', 'Design System'],
    challenge: {
      de: 'Komplexe Datenvisualisierung für 50.000+ Nutzer, hohe Supportlast durch unverständliche Features.',
      en: 'Complex data visualisation for 50,000+ users and a heavy support load caused by features nobody understood.',
    },
    solution: {
      de: 'IA-Redesign, fokussiertes Dashboard und kontextuelle Feature-Discovery auf Basis einer neuen Component Library.',
      en: 'Information-architecture redesign, a focused dashboard and contextual feature discovery on top of a new component library.',
    },
    results: {
      de: ['+43 % Feature-Adoption', '−67 % Support-Tickets', '4,8/5 Nutzerzufriedenheit'],
      en: ['+43% feature adoption', '−67% support tickets', '4.8/5 user satisfaction'],
    },
  },
  {
    title: {
      de: 'Drei statt sieben Schritte: E-Commerce Checkout-Optimierung',
      en: 'Three steps instead of seven: e-commerce checkout optimisation',
    },
    tags: ['E-Commerce', 'CRO', 'Mobile'],
    challenge: {
      de: 'Hohe Kaufabbruchrate im Warenkorb und schwache Mobile Conversion.',
      en: 'High cart abandonment and weak mobile conversion.',
    },
    solution: {
      de: 'Checkout von sieben auf drei Schritte reduziert, Formular-UX verbessert, Trust-Elemente ergänzt.',
      en: 'Checkout cut from seven steps to three, form UX improved, trust elements added.',
    },
    results: {
      de: ['Checkout in drei Schritten', '−41 % Kaufabbrüche', 'LCP 1,8 s'],
      en: ['Three-step checkout', '−41% cart abandonment', 'LCP 1.8 s'],
    },
  },
  {
    title: {
      de: 'Barrierefrei und mobile-first: Corporate Website Relaunch',
      en: 'Accessible and mobile-first: corporate website relaunch',
    },
    tags: ['Corporate', 'WCAG 2.1 AA', 'SEO'],
    challenge: {
      de: 'Veraltetes Design, mangelnde Barrierefreiheit, kaum organische Leads.',
      en: 'Dated design, poor accessibility, hardly any organic leads.',
    },
    solution: {
      de: 'Mobile-First-Relaunch nach WCAG 2.1 AA mit SEO-Optimierung und schnellen Ladezeiten.',
      en: 'Mobile-first relaunch to WCAG 2.1 AA with SEO optimisation and fast load times.',
    },
    results: {
      de: ['Mobile-First-Relaunch', '+84 % Anfragen', 'PageSpeed 94'],
      en: ['Mobile-first relaunch', '+84% enquiries', 'PageSpeed 94'],
    },
  },
  {
    title: {
      de: 'Launch in 12 Wochen: B2B SaaS MVP & Design System',
      en: 'Launch in 12 weeks: B2B SaaS MVP & design system',
    },
    tags: ['Start-up', 'MVP', 'Figma Library'],
    challenge: {
      de: 'Kein Design-Team, zwölf Wochen bis zum Investoren-Pitch.',
      en: 'No design team and twelve weeks until the investor pitch.',
    },
    solution: {
      de: 'Komplettes Design System, User Testing und developer-ready Figma Library im Sprint-Verfahren.',
      en: 'A complete design system, user testing and a developer-ready Figma library, delivered in sprints.',
    },
    results: {
      de: ['Launch in 12 Wochen', 'Komplettes Design System', 'Developer-ready Figma Library'],
      en: ['Launched in 12 weeks', 'Complete design system', 'Developer-ready Figma library'],
    },
  },
]

export const TESTIMONIALS: Testimonial[] = [
  {
    text: {
      de: 'David verbindet UX-Design, Technik und Business-KPIs – genau das, was wir brauchten.',
      en: 'David connects UX design, engineering and business KPIs — exactly what we needed.',
    },
    attribution: {
      de: 'Co-Founder eines SaaS-Start-ups, Berlin',
      en: 'Co-founder of a SaaS startup, Berlin',
    },
  },
  {
    text: {
      de: 'Endlich jemand, der Design und Code verbindet. Die Übergabe an unsere Entwickler lief komplett reibungslos.',
      en: 'Finally someone who connects design and code. The handover to our developers went completely smoothly.',
    },
    attribution: {
      de: 'Lead Frontend Developer, Software-Unternehmen, München',
      en: 'Lead frontend developer, software company, Munich',
    },
  },
  {
    text: {
      de: 'Unsere Website generiert dreimal mehr Anfragen als vorher. Professionell, zuverlässig, schnell.',
      en: 'Our website generates three times as many enquiries as before. Professional, reliable, fast.',
    },
    attribution: {
      de: 'Geschäftsführerin, Mittelständler, Zürich',
      en: 'Managing director, mid-sized company, Zurich',
    },
  },
  {
    text: {
      de: 'Zwölf Tage vom Briefing bis zum Launch – PageSpeed 98, Conversion 2,7-fach.',
      en: 'Twelve days from briefing to launch — PageSpeed 98, conversion up 2.7×.',
    },
    attribution: {
      de: 'VP Marketing, Tech-Scale-up, Hamburg',
      en: 'VP marketing, tech scale-up, Hamburg',
    },
  },
]

export const TIMELINE: Milestone[] = [
  {
    period: { de: 'Ausbildung', en: 'Training' },
    description: {
      de: 'Mediengestalter Digital und Print in Hamburg – das Handwerk von Layout und Typografie bis Druck und Bildbearbeitung. Später ergänzt um den Bachelor Professional in Digital Media (IHK) und den Ausbilderschein.',
      en: 'Media designer for digital and print in Hamburg — the craft, from layout and typography to print and image editing. Later complemented by a Bachelor Professional in Digital Media (IHK) and a certified trainer qualification.',
    },
  },
  {
    period: { de: 'Agenturjahre', en: 'Agency years' },
    description: {
      de: 'Junior Art Director und Art Director in Hamburger Agenturen (u. a. Arc Worldwide, MEC, azionare) – Kampagnen, Werbemittel und digitale Konzepte für nationale und internationale Marken.',
      en: 'Junior art director and art director in Hamburg agencies (Arc Worldwide, MEC, azionare among others) — campaigns, ad assets and digital concepts for national and international brands.',
    },
  },
  {
    period: { de: '2011 – Selbstständigkeit', en: '2011 — going independent' },
    description: {
      de: 'Senior UI/UX Designer im Creative-Tech-Team von Philipp und Keuntje, Hamburg: digitale Konzeptideen und kreative Lösungen für Marken wie Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom und T-Systems.',
      en: 'Senior UI/UX designer in the creative tech team at Philipp und Keuntje, Hamburg: digital concepts and creative solutions for brands such as Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom and T-Systems.',
    },
  },
  {
    period: { de: 'Heute – Pukalani Studio', en: 'Today — Pukalani Studio' },
    description: {
      de: 'Designkonzepte, Brand Design, Websites und Content – remote von Maui für die DACH-Region, dazu KI-Beratung und -Training. Für größere Vorhaben arbeiten wir mit ausgewählten Partnern zusammen.',
      en: 'Design concepts, brand design, websites and content — remote from Maui for the DACH region, plus AI consulting and training. For larger undertakings we work with selected partners.',
    },
  },
]

export const STACK_GROUPS: StackGroup[] = [
  {
    title: { de: 'Design & Konzept', en: 'Design & concept' },
    items: {
      de: ['Figma', 'Adobe Creative Suite', 'Art Direction', 'Design Systems', 'Prototyping'],
      en: ['Figma', 'Adobe Creative Suite', 'Art direction', 'Design systems', 'Prototyping'],
    },
  },
  {
    title: { de: 'Content & Produktion', en: 'Content & production' },
    items: {
      de: ['Fotografie', 'Videografie', 'Final Cut Pro (Schnitt)', 'Digitale Werbemittel', 'Social-Media-Assets'],
      en: ['Photography', 'Video production', 'Final Cut Pro (editing)', 'Digital ad assets', 'Social media assets'],
    },
  },
  {
    title: { de: 'Technische Umsetzung', en: 'Technical implementation' },
    items: {
      de: [
        'Moderne Web-Technologie (Nuxt/Vue)',
        'TypeScript',
        'Tailwind CSS',
        'Barrierefreiheit (WCAG 2.1 AA)',
        'Performance (Core Web Vitals)',
      ],
      en: [
        'Modern web technology (Nuxt/Vue)',
        'TypeScript',
        'Tailwind CSS',
        'Accessibility (WCAG 2.1 AA)',
        'Performance (Core Web Vitals)',
      ],
    },
  },
]

export const ABOUT_QUOTE: Localized = {
  de: 'Gutes Design ist unsichtbar: Nutzer erreichen ihre Ziele ohne Reibung. Unser Ansatz – Komplexität verstehen, Einfachheit gestalten.',
  en: 'Good design is invisible: users reach their goals without friction. Our approach — understand complexity, design simplicity.',
}

export const ABOUT_AI_NOTE: Localized = {
  de: 'Als KI-Berater und -Trainer unterstützen wir Teams und Entscheider:innen dabei, KI-Tools sinnvoll im Arbeitsalltag einzusetzen – praxisnah, ohne Buzzword-Bingo.',
  en: 'As AI consultants and trainers we help teams and decision-makers put AI tools to sensible everyday use — hands-on, without buzzword bingo.',
}

export const REMOTE_CARDS: RemoteCard[] = [
  {
    title: { de: 'Zeitverschiebung als Vorteil', en: 'The time difference as an advantage' },
    description: {
      de: 'Feedback, das Sie am Ende Ihres Arbeitstags senden, wird über Nacht umgesetzt – die Ergebnisse liegen fertig vor, wenn Ihr nächster Arbeitstag beginnt.',
      en: 'Feedback you send at the end of your working day is implemented overnight — the results are waiting when your next day starts.',
    },
  },
  {
    title: { de: 'Feste Overlap-Zeiten', en: 'Fixed overlap hours' },
    description: {
      de: 'Video-Calls finden am DACH-Abend statt (Hawaii-Morgen). Der Rest läuft asynchron über Slack, Notion oder Linear – dokumentiert und nachvollziehbar.',
      en: 'Video calls happen in the European evening (our Hawaii morning). Everything else runs asynchronously via Slack, Notion or Linear — documented and traceable.',
    },
  },
  {
    title: { de: 'Vor Ort in DACH', en: 'On site in the DACH region' },
    description: {
      de: 'Für Kickoffs, Design Sprints und Workshops kommen wir nach Vereinbarung zu Ihnen – u. a. nach Berlin, Hamburg, München, Wien, Zürich oder Basel.',
      en: 'For kickoffs, design sprints and workshops we come to you by arrangement — to Berlin, Hamburg, Munich, Vienna, Zurich or Basel, among others.',
    },
  },
]

export const GUIDES: Guide[] = [
  {
    kicker: { de: 'Preis-Guide 2026', en: 'Pricing guide 2026' },
    title: { de: 'Was kostet UX/UI Design?', en: 'What does UX/UI design cost?' },
    description: {
      de: 'Stundensätze, Tagessätze und Projektpreise mit belegten Marktdaten (Freelancer-Kompass, German UPA, Malt) – plus die 5 Faktoren, die den Preis wirklich bestimmen.',
      en: 'Hourly rates, day rates and project prices backed by market data (Freelancer-Kompass, German UPA, Malt) — plus the five factors that really drive the price.',
    },
    to: '/wissen/was-kostet-ux-design',
  },
  {
    kicker: { de: 'Entscheidungshilfe', en: 'Decision guide' },
    title: { de: 'Freelancer oder Agentur?', en: 'Freelancer or agency?' },
    description: {
      de: 'Der ehrliche Vergleich: Kosten, Geschwindigkeit, Risiken – und die Fälle, in denen eine Agentur wirklich die bessere Wahl ist.',
      en: 'The honest comparison: cost, speed, risk — and the cases where an agency genuinely is the better choice.',
    },
    to: '/wissen/freelancer-oder-agentur',
  },
  {
    kicker: { de: 'Leistung im Detail', en: 'Service in detail' },
    title: { de: 'UX-Audit: Pakete & Ablauf', en: 'UX audit: packages & process' },
    description: {
      de: 'Der schnellste Einstieg in eine Zusammenarbeit: drei Festpreis-Pakete (€2.500–5.000), Ergebnisse in 1–2 Wochen, 50 % Anrechnung bei Folgeprojekten.',
      en: 'The fastest way into a collaboration: three fixed-price packages (€2,500–5,000), results in 1–2 weeks, 50% credited against follow-up projects.',
    },
    to: '/ux-audit',
  },
  {
    kicker: { de: 'Entwicklung', en: 'Development' },
    title: { de: 'Nuxt-Entwicklung als Freelancer', en: 'Freelance Nuxt development' },
    description: {
      de: 'SaaS-Frontends, Corporate Websites und Migrationen mit Nuxt 4, Vue 3 und TypeScript – Design und Code aus einer Hand.',
      en: 'SaaS frontends, corporate websites and migrations with Nuxt 4, Vue 3 and TypeScript — design and code from the same pair of hands.',
    },
    to: '/nuxt-entwickler-freelancer',
  },
]

/** FAQ — Antworten als reiner Text; identischer Inhalt landet im JSON-LD. */
export const FAQS: LocalizedFaq[] = [
  {
    question: {
      de: 'Was kostet ein UX/UI-Projekt bei Pukalani Studio?',
      en: 'What does a UX/UI project at Pukalani Studio cost?',
    },
    answer: {
      de: 'Feste Projektpreise statt Stundensätze: UX-Audit €2.500–5.000, Landingpage inkl. CRO €5.000–12.000, Corporate Website €15.000–35.000, SaaS-Produkt-Design €25.000–75.000+. Den genauen Festpreis erhalten Sie nach einem kostenlosen 30-minütigen Erstgespräch – inklusive Umfang, Zeitplan und definierten Ergebnissen.',
      en: 'Fixed project prices instead of hourly billing: UX audit €2,500–5,000, landing page including CRO €5,000–12,000, corporate website €15,000–35,000, SaaS product design €25,000–75,000+. You get the exact fixed price after a free 30-minute intro call — including scope, timeline and defined deliverables.',
    },
  },
  {
    question: {
      de: 'Warum Festpreise statt Tagessatz?',
      en: 'Why fixed prices instead of a day rate?',
    },
    answer: {
      de: 'Value-Based Pricing: Sie zahlen für ein definiertes Ergebnis, nicht für Stunden. Das macht Budgets planbar, verhindert Überraschungen und belohnt effizientes Arbeiten. Umfang, Ergebnisse und Preis werden vor Projektstart schriftlich fixiert.',
      en: 'Value-based pricing: you pay for a defined outcome, not for hours. That makes budgets predictable, avoids surprises and rewards efficient work. Scope, deliverables and price are fixed in writing before the project starts.',
    },
  },
  {
    question: {
      de: 'Studio oder Agentur – was passt besser?',
      en: 'Studio or agency — which fits better?',
    },
    answer: {
      de: 'Bei uns arbeiten Sie direkt mit der Senior-Ebene – ohne Projektleitungs-Overhead und ohne dass Juniors die Arbeit machen. Das ist in der Regel 30–50 % günstiger als eine Agentur und deutlich schneller in den Entscheidungen. Für Full-Service-Anforderungen ziehen wir bei Bedarf Partner aus unserem Netzwerk hinzu.',
      en: 'With us you work directly with the senior level — no project-management overhead and no juniors doing the work. That is usually 30–50% cheaper than an agency and decisions get made considerably faster. For full-service requirements we bring in partners from our network when needed.',
    },
  },
  {
    question: {
      de: 'Wie läuft ein Projekt ab?',
      en: 'What does the process look like?',
    },
    answer: {
      de: 'In sechs Schritten: 1. Discovery & Zieldefinition, 2. Research & UX-Konzept, 3. UI-Design & Prototyping, 4. Design System & Dokumentation, 5. Entwicklung oder Developer-Handoff, 6. Launch, Messung & Optimierung. Jede Phase ist auch einzeln buchbar und endet mit einem dokumentierten Ergebnis.',
      en: 'In six steps: 1. discovery and goal definition, 2. research and UX concept, 3. UI design and prototyping, 4. design system and documentation, 5. development or developer handoff, 6. launch, measurement and optimisation. Every phase can also be booked on its own and ends with a documented result.',
    },
  },
  {
    question: {
      de: 'Wie lange dauert ein typisches Projekt?',
      en: 'How long does a typical project take?',
    },
    answer: {
      de: 'UX-Audit: 1–2 Wochen. Landingpage: 2–3 Wochen. Corporate Website: 6–12 Wochen. SaaS-Feature: 3–6 Wochen. Komplettes Produkt-Redesign: 3–6 Monate. Express-Slots sind nach Absprache möglich.',
      en: 'UX audit: 1–2 weeks. Landing page: 2–3 weeks. Corporate website: 6–12 weeks. SaaS feature: 3–6 weeks. Complete product redesign: 3–6 months. Express slots are possible by arrangement.',
    },
  },
  {
    question: {
      de: 'Wie funktioniert Remote-Arbeit von Hawaii aus für die DACH-Region?',
      en: 'How does remote collaboration from Hawaii work for clients in the DACH region?',
    },
    answer: {
      de: 'Sehr gut – die Zeitverschiebung ist ein Vorteil: Feedback, das Sie am Ende Ihres Arbeitstags senden, wird über Nacht umgesetzt und liegt am nächsten Morgen fertig vor. Video-Calls finden am DACH-Abend statt (Hawaii-Morgen). Die restliche Kommunikation läuft asynchron über Slack, Notion oder Linear – auf Deutsch oder Englisch. Workshops vor Ort in DACH sind nach Vereinbarung möglich.',
      en: 'Very well — the time difference is an advantage: feedback you send at the end of your working day is implemented overnight and ready the next morning. Video calls happen in the European evening (our Hawaii morning). The rest of the communication is asynchronous via Slack, Notion or Linear — in German or English. On-site workshops in the DACH region are possible by arrangement.',
    },
  },
  {
    question: {
      de: 'Übernehmen Sie auch die technische Umsetzung?',
      en: 'Do you handle the technical implementation as well?',
    },
    answer: {
      de: 'Ja. Wir gestalten nicht nur, sondern setzen Websites und Web-Anwendungen auch selbst um – mit moderner, schneller und suchmaschinenfreundlicher Web-Technologie (u. a. Nuxt/Vue). Sie bekommen eine fertige, live geschaltete Website statt nur Design-Dateien. Alternativ übergeben wir sauber dokumentierte Design-Vorlagen an Ihr Entwicklungsteam oder Ihre Agentur.',
      en: 'Yes. We do not just design — we build websites and web applications ourselves, with modern, fast and search-engine-friendly web technology (Nuxt/Vue among others). You get a finished, live website instead of design files alone. Alternatively we hand over cleanly documented design files to your development team or agency.',
    },
  },
  {
    question: {
      de: 'Machen Sie auch Fotografie, Video und digitale Werbemittel?',
      en: 'Do you also do photography, video and digital ad assets?',
    },
    answer: {
      de: 'Ja. Wir produzieren auch den Content zum Design: digitale Werbemittel, Social-Media-Assets, Fotografie sowie Videografie inklusive Schnitt (Final Cut Pro) – das Handwerk dahinter kommt aus der Ausbildung zum Mediengestalter. Der Vorteil: Design und Inhalte kommen aus einer Hand und passen von Anfang an zusammen.',
      en: 'Yes. We also produce the content that goes with the design: digital ad assets, social media assets, photography and video including editing (Final Cut Pro) — the craft behind it comes from formal training as a media designer. The advantage: design and content come from one studio and fit together from the start.',
    },
  },
  {
    question: {
      de: 'Arbeiten Sie auch für Agenturen?',
      en: 'Do you work for agencies too?',
    },
    answer: {
      de: 'Ja, regelmäßig. Wir verstärken Werbe-, Marketing- und Digitalagenturen auf Senior-Niveau – für Konzept, UI/UX-Design, Art Direction oder technische Umsetzung. Auf Wunsch White Label, also unsichtbar für Ihren Endkunden. Die Agentur-Erfahrung dafür kommt aus über einem Jahrzehnt auf Agenturseite.',
      en: 'Yes, regularly. We add senior capacity to advertising, marketing and digital agencies — for concept, UI/UX design, art direction or technical implementation. White label on request, so invisible to your end client. The agency experience behind that comes from more than a decade spent on the agency side.',
    },
  },
  {
    question: {
      de: 'Machen Sie auch App-Design für iOS und Android?',
      en: 'Do you also do app design for iOS and Android?',
    },
    answer: {
      de: 'Ja – natives App-Design für iOS und Android, Progressive Web Apps und Design Systems für Apps. Die Entwicklung nativer Apps erfolgt bei Bedarf über unser Partnernetzwerk.',
      en: 'Yes — native app design for iOS and Android, progressive web apps and design systems for apps. Native app development is handled through our partner network when required.',
    },
  },
  {
    question: {
      de: 'Was ist ein UX-Audit und was bringt er?',
      en: 'What is a UX audit and what does it deliver?',
    },
    answer: {
      de: 'Ein UX-Audit ist eine strukturierte Analyse Ihrer Website oder App: heuristische Evaluation, Conversion-Analyse, Performance-Check (Core Web Vitals) und WCAG-Accessibility-Prüfung. Sie erhalten in 1–2 Wochen eine priorisierte Maßnahmenliste mit Quick Wins – der schnellste und günstigste Einstieg in eine Zusammenarbeit (€2.500–5.000).',
      en: 'A UX audit is a structured analysis of your website or app: heuristic evaluation, conversion analysis, performance check (Core Web Vitals) and WCAG accessibility review. Within 1–2 weeks you get a prioritised action list with quick wins — the fastest and most affordable way to start working together (€2,500–5,000).',
    },
  },
  {
    question: {
      de: 'Bieten Sie auch KI-Beratung an?',
      en: 'Do you offer AI consulting as well?',
    },
    answer: {
      de: 'Ja. Wir helfen Teams und Entscheider:innen, KI-Tools sinnvoll im Arbeitsalltag einzusetzen – praxisnah und ohne Buzzwords. Formate: Workshops, Team-Trainings und individuelle Beratung.',
      en: 'Yes. We help teams and decision-makers use AI tools sensibly in their daily work — hands-on and without buzzwords. Formats: workshops, team training and one-to-one consulting.',
    },
  },
  {
    question: {
      de: 'Wie schnell können wir starten?',
      en: 'How quickly can we start?',
    },
    answer: {
      de: 'Kurzfristig: Das Erstgespräch ist meist innerhalb weniger Tage direkt über cal.com buchbar, das Festpreis-Angebot folgt innerhalb von 48 Stunden nach dem Gespräch. UX-Audits sind laufend möglich. Auf E-Mails antworten wir innerhalb von 24 Stunden.',
      en: 'Quickly: the intro call can usually be booked within a few days directly via cal.com, and the fixed-price quote follows within 48 hours of the call. UX audits are available on a rolling basis. We answer emails within 24 hours.',
    },
  },
]

export const CONTACT_CHANNELS: ContactChannel[] = [
  {
    title: { de: 'Termin buchen', en: 'Book a call' },
    description: {
      de: '30 Minuten, kostenlos & unverbindlich – per Zoom, Teams oder Meet.',
      en: '30 minutes, free and without obligation — via Zoom, Teams or Meet.',
    },
    // Seit W1 (2026-08-21) führt dieser Kanal in den Erstgespräch-Wizard, nicht
    // mehr direkt zu cal.com — deshalb steht hier kein cal.com-Adress-Label
    // mehr (es wäre eine Behauptung über das Ziel) und `external: false`.
    linkLabel: { de: 'Erstgespräch starten', en: 'Start your intro call' },
    href: 'cal',
    external: false,
  },
  {
    title: { de: 'E-Mail senden', en: 'Send an email' },
    description: {
      de: 'Projektidee, Zeitrahmen, Budget – wir antworten innerhalb von 24 Stunden.',
      en: 'Project idea, timeline, budget — we reply within 24 hours.',
    },
    linkLabel: { de: 'mail@davidschubert.com', en: 'mail@davidschubert.com' },
    href: 'mail',
    external: false,
  },
  {
    title: { de: 'Anrufen', en: 'Call' },
    description: {
      de: 'Am besten am DACH-Abend erreichbar (Hawaii-Zeitzone, UTC−10).',
      en: 'Best reached in the European evening (Hawaii time, UTC−10).',
    },
    linkLabel: { de: '+1 808 866 0676', en: '+1 808 866 0676' },
    href: 'phone',
    external: false,
  },
]

/**
 * Überschrift + Vorspann jeder Sektion (Anker-Ids stehen im Markup).
 * `satisfies` statt `: Record<string, …>` — sonst kennt der Typ die Schlüssel
 * nicht mehr und jeder Zugriff im Template wäre „possibly undefined".
 */
export const SECTIONS = {
  overview: {
    title: { de: 'Auf einen Blick', en: 'At a glance' },
    lead: {
      de: 'Die wichtigsten Fakten zu Pukalani Studio – kompakt zusammengefasst.',
      en: 'The most important facts about Pukalani Studio — in brief.',
    },
  },
  audiences: {
    title: { de: 'Für wen wir arbeiten', en: 'Who we work with' },
    lead: {
      de: 'Unsere Kunden sind mittelständische Unternehmen, die einen erfahrenen Design-Partner ohne Agentur-Overhead suchen – und Agenturen, die punktuell Senior-Verstärkung brauchen. Viele kommen über Empfehlungen ehemaliger Kolleginnen und Kollegen.',
      en: 'Our clients are mid-sized companies looking for an experienced design partner without agency overhead — and agencies that need extra senior capacity for a specific job. Many of them come to us through referrals from former colleagues.',
    },
  },
  problems: {
    title: { de: 'Kommt Ihnen das bekannt vor?', en: 'Does this sound familiar?' },
    lead: {
      de: 'Sechs Situationen, mit denen Projekte bei uns häufig beginnen – und was dahintersteckt.',
      en: 'Six situations many of our projects start with — and what lies behind them.',
    },
  },
  fit: {
    title: { de: 'Passen wir zusammen?', en: 'Are we a good fit?' },
    lead: {
      de: 'Jede dieser Lösungen hat ihren Platz. Die Tabelle zeigt, wo wir stehen – und wo andere genauso gut sind. Darunter steht, für wen wir die Richtigen sind und für wen nicht.',
      en: 'Each of these options has its place. The table shows where we stand — and where others are just as good. Below it: who we are the right partner for, and who we are not.',
    },
  },
  services: {
    title: {
      de: 'Leistungen & Preise: von der Idee bis zur fertigen Website',
      en: 'Services & pricing: from the idea to the finished website',
    },
    lead: {
      de: 'Alles aus einer Hand: Designkonzept, Gestaltung, technische Umsetzung und Content. Klar definierte Leistungen mit festen Projektpreisen – vom UX-Audit ab €2.500 bis zum kompletten Produkt-Design ab €25.000. Sie wissen vor Projektstart, was Sie bekommen und was es kostet.',
      en: 'Everything from a single provider: design concept, visual design, technical implementation and content. Clearly defined services at fixed project prices — from a UX audit at €2,500 to a complete product design from €25,000. You know what you get and what it costs before the project starts.',
    },
  },
  process: {
    title: {
      de: 'Prozess: In 6 Schritten von der Analyse zum Launch',
      en: 'Process: from analysis to launch in six steps',
    },
    lead: {
      de: 'Jedes Projekt folgt einem bewährten Ablauf in sechs Schritten – von Discovery über UX-Konzept und UI-Design bis zu Entwicklung, Launch und Optimierung. Jede Phase ist auch einzeln buchbar und endet mit einem konkreten, dokumentierten Ergebnis.',
      en: 'Every project follows a proven six-step sequence — from discovery through UX concept and UI design to development, launch and optimisation. Each phase can also be booked on its own and ends with a concrete, documented result.',
    },
  },
  references: {
    title: {
      de: 'Referenzen: Case Studies aus SaaS, E-Commerce & Corporate',
      en: 'Selected work: case studies from SaaS, e-commerce & corporate websites',
    },
    lead: {
      de: 'Ausgewählte Projekte mit messbaren Ergebnissen – von +43 % Feature-Adoption in einem SaaS-Dashboard bis zu einem Checkout mit drei statt sieben Schritten. Aus Vertraulichkeitsgründen anonymisiert; Details und weitere Referenzen gern im persönlichen Gespräch.',
      en: 'Selected projects with measurable outcomes — from +43% feature adoption in a SaaS dashboard to a checkout cut from seven steps to three. Anonymised for confidentiality; we are happy to share details and further references in a call.',
    },
  },
  ownWork: {
    title: { de: 'Ausgewählte eigene Projekte', en: 'Selected projects of our own' },
    lead: {
      de: 'Produkte, die wir selbst konzipiert, gestaltet und gebaut haben – mit Details zu Architektur und Umsetzung.',
      en: 'Products we conceived, designed and built ourselves — with details on architecture and implementation.',
    },
  },
  testimonials: {
    title: {
      de: 'Das sagen Kunden über die Zusammenarbeit',
      en: 'What clients say about working together',
    },
    lead: {
      de: 'Alle Stimmen aus Vertraulichkeitsgründen anonymisiert – Referenzen mit Klarnamen gern auf Anfrage im Erstgespräch.',
      en: 'All quotes anonymised for confidentiality — named references gladly on request during the intro call.',
    },
  },
  about: {
    title: {
      de: 'Das Studio: vom Mediengestalter zum Creative Technologist',
      en: 'About the studio: from media designer to creative technologist',
    },
    lead: {
      de: 'Hinter Pukalani Studio steht David Schubert, Senior UI/UX Designer & Creative Technologist mit über 25 Jahren Erfahrung in Design und Werbung – ausgebildeter Mediengestalter, langjähriger Art Director und Senior Designer in Hamburger Agenturen. Sie arbeiten immer direkt mit der Senior-Ebene: von der kreativen Leitidee über das Design bis zur technischen Umsetzung und Content-Produktion. Je nach Projekt holen wir ausgewählte Partner dazu.',
      en: 'Behind Pukalani Studio is David Schubert, senior UI/UX designer & creative technologist with more than 25 years in design and advertising — a trained media designer, long-time art director and senior designer in Hamburg agencies. You always work directly with the senior level: from the core creative idea through design to technical implementation and content production. Depending on the project, we bring in selected partners.',
    },
  },
  remote: {
    title: {
      de: 'Remote für DACH: Zusammenarbeit über Zeitzonen hinweg',
      en: 'Remote for DACH: working across time zones',
    },
    lead: {
      de: 'Pukalani Studio arbeitet remote-first von Maui (Hawaii) aus für Kunden in Deutschland, Österreich und der Schweiz – auf Deutsch oder Englisch. Workshops und Kickoffs vor Ort, etwa in Berlin, München, Zürich oder Wien, sind nach Vereinbarung möglich.',
      en: 'Pukalani Studio works remote-first from Maui (Hawaii) for clients in Germany, Austria and Switzerland — in German or English. On-site workshops and kickoffs, for example in Berlin, Munich, Zurich or Vienna, are possible by arrangement.',
    },
  },
  knowledge: {
    title: {
      de: 'Wissen: Preise, Entscheidungshilfen & Guides',
      en: 'Knowledge: pricing, comparisons & guides',
    },
    lead: {
      de: 'Fundierte Antworten auf die Fragen, die vor jedem Projekt stehen – mit echten Marktdaten, benannten Quellen und ehrlichen Einordnungen. Alle Guides werden quartalsweise aktualisiert.',
      en: 'Well-founded answers to the questions that come before every project — with real market data, named sources and honest assessments. All guides are updated quarterly.',
    },
  },
  faq: {
    title: {
      de: 'FAQ: Kosten, Ablauf, Remote-Zusammenarbeit',
      en: 'FAQ: costs, process, remote collaboration',
    },
    lead: {
      de: 'Antworten auf die häufigsten Fragen zu Preisen, Projektablauf und Zusammenarbeit mit Pukalani Studio.',
      en: 'Answers to the most common questions about pricing, process and working with Pukalani Studio.',
    },
  },
  contact: {
    title: {
      de: 'Kontakt: Kostenloses Erstgespräch buchen',
      en: 'Contact: book a free intro call',
    },
    lead: {
      de: 'Der schnellste Weg: Buchen Sie direkt ein kostenloses, 30-minütiges Erstgespräch – oder schreiben Sie eine E-Mail. Sie erhalten innerhalb von 24 Stunden eine Antwort und nach dem Gespräch innerhalb von 48 Stunden ein Festpreis-Angebot.',
      en: 'The fastest route: book a free 30-minute intro call directly — or send an email. You get a reply within 24 hours and a fixed-price quote within 48 hours of the call.',
    },
  },
} satisfies Record<string, SectionHeading>

/**
 * W3 (Studio-Funnel, `docs/plans/STUDIO-ERSTGESPRAECH-FUNNEL.md` § 7): der
 * Problem-Spiegel steht VOR den Leistungen, Vergleich und Selbst-Selektion
 * dahinter, der Hinweis zu den Ergebnissen an den Referenzen. Die Texte sind
 * ein ENTWURF in der Studio-Stimme („wir", Anrede „Sie"); David liest sie
 * gegen. Regel „nur Belegbares": keine Zahl, keine Bewertung, kein Strohmann —
 * die Tabelle muss auch aus Sicht einer Agentur fair lesbar sein.
 */
export interface ProblemCard {
  /** Der Satz, wie Kundschaft ihn sagt — mit Anführungszeichen der Sprache. */
  quote: Localized
  text: Localized
}

export const PROBLEMS: ProblemCard[] = [
  {
    quote: { de: '„Die Website sieht gut aus – bringt aber keine Anfragen.“', en: '“The website looks good — but it brings in no enquiries.”' },
    text: {
      de: 'Design ohne Strategie ist Dekoration. Es fehlt der Weg vom Besucher zur Anfrage.',
      en: 'Design without strategy is decoration. What is missing is the path from visitor to enquiry.',
    },
  },
  {
    quote: { de: '„Agenturen sprengen das Budget, Freelancer decken nur die Hälfte ab.“', en: '“Agencies blow the budget, freelancers only cover half of it.”' },
    text: {
      de: 'Für Strategie, Design und Code brauchen Sie sonst drei Verträge – und koordinieren sie selbst.',
      en: 'Otherwise you need three contracts for strategy, design and code — and you coordinate them yourself.',
    },
  },
  {
    quote: { de: '„Der Relaunch verschleppt sich seit Monaten.“', en: '“The relaunch has been dragging on for months.”' },
    text: {
      de: 'Niemand treibt ihn, jeder wartet auf jeden – und die alte Seite verkauft derweil unter Wert.',
      en: 'Nobody drives it, everyone waits for everyone else — and meanwhile the old site sells below its value.',
    },
  },
  {
    quote: { de: '„Jede kleine Änderung braucht ein Ticket und drei Wochen.“', en: '“Every small change needs a ticket and three weeks.”' },
    text: {
      de: 'Kurze Wege gibt es nur, wenn die Person, die entscheidet, auch baut.',
      en: 'Short paths only exist when the person who decides also builds.',
    },
  },
  {
    quote: { de: '„Der Baukasten war schnell – jetzt bremst er bei allem, was zählt.“', en: '“The site builder was quick — now it slows down everything that matters.”' },
    text: {
      de: 'Sobald es speziell wird (Tempo, SEO, Anbindungen), zahlen Sie den Startvorteil doppelt zurück.',
      en: 'As soon as things get specific (speed, SEO, integrations), you pay back the head start twice over.',
    },
  },
  {
    quote: { de: '„Viele Ansprechpartner, keiner verantwortlich fürs Ergebnis.“', en: '“Lots of contacts, nobody responsible for the result.”' },
    text: {
      de: 'Zwischen Projektleitung, Design und Entwicklung versickert genau das, was Sie eigentlich kaufen wollten.',
      en: 'Between project management, design and development, exactly what you wanted to buy trickles away.',
    },
  },
]

/** ✓ trifft zu · ○ teils, je nach Anbieter · ✕ trifft nicht zu · — entfällt */
export type ComparisonMark = 'yes' | 'partly' | 'no' | 'none'

export const COMPARISON_MARK_LABELS: Record<ComparisonMark, Localized> = {
  yes: { de: 'trifft zu', en: 'applies' },
  partly: { de: 'teils, je nach Anbieter', en: 'partly, depends on the provider' },
  no: { de: 'trifft nicht zu', en: 'does not apply' },
  none: { de: 'entfällt', en: 'not applicable' },
}

export const COMPARISON = {
  caption: {
    de: 'Vergleich: Pukalani Studio, klassische Agentur, Einzel-Freelancer und Baukasten-Tool',
    en: 'Comparison: Pukalani Studio, traditional agency, solo freelancer and website builder',
  } satisfies Localized,
  columns: {
    criterion: { de: 'Kriterium', en: 'Criterion' },
    studio: { de: 'Pukalani Studio', en: 'Pukalani Studio' },
    agency: { de: 'Klassische Agentur', en: 'Traditional agency' },
    freelancer: { de: 'Einzel-Freelancer', en: 'Solo freelancer' },
    builder: { de: 'Baukasten-Tool', en: 'Website builder' },
  } satisfies Record<string, Localized>,
  legend: {
    de: '✓ trifft zu · ○ teils, je nach Anbieter · ✕ trifft nicht zu · — entfällt',
    en: '✓ applies · ○ partly, depends on the provider · ✕ does not apply · — not applicable',
  } satisfies Localized,
}

export interface ComparisonRow {
  criterion: Localized
  studio: ComparisonMark
  agency: ComparisonMark
  freelancer: ComparisonMark
  builder: ComparisonMark
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    criterion: { de: 'Strategie, Design und Code aus einer Hand', en: 'Strategy, design and code from a single source' },
    studio: 'yes', agency: 'yes', freelancer: 'partly', builder: 'no',
  },
  {
    criterion: { de: 'Sie sprechen direkt mit denen, die bauen', en: 'You talk directly to the people who build' },
    studio: 'yes', agency: 'no', freelancer: 'yes', builder: 'none',
  },
  {
    criterion: { de: 'Fester Preis vor Projektstart', en: 'Fixed price before the project starts' },
    studio: 'yes', agency: 'partly', freelancer: 'partly', builder: 'yes',
  },
  {
    criterion: { de: 'Senior-Niveau ohne Agentur-Überbau', en: 'Senior level without agency overhead' },
    studio: 'yes', agency: 'no', freelancer: 'partly', builder: 'no',
  },
  {
    criterion: { de: 'Trägt auch Spezielles (Tempo, SEO, Anbindungen)', en: 'Handles the specific too (speed, SEO, integrations)' },
    studio: 'yes', agency: 'yes', freelancer: 'partly', builder: 'no',
  },
  {
    criterion: { de: 'Bleibt nach dem Launch ansprechbar', en: 'Stays available after launch' },
    studio: 'yes', agency: 'partly', freelancer: 'partly', builder: 'no',
  },
]

export const FIT = {
  goodTitle: { de: 'Passend für uns', en: 'A good fit' } satisfies Localized,
  good: {
    de: [
      'Sie haben ein echtes Angebot und wollen, dass es online so gut dasteht, wie es ist.',
      'Sie wollen einen Partner für Strategie, Design und Code – nicht drei Gewerke koordinieren.',
      'Sie können Feedback und Inhalte beisteuern; wir treiben den Rest.',
      'Qualität ist Ihnen einen fairen, vorher festen Preis wert.',
    ],
    en: [
      'You have a real offer and want it to look as good online as it is.',
      'You want one partner for strategy, design and code — not three trades to coordinate.',
      'You can contribute feedback and content; we drive the rest.',
      'Quality is worth a fair price to you, fixed in advance.',
    ],
  } satisfies Localized<string[]>,
  badTitle: { de: 'Nicht passend', en: 'Not a good fit' } satisfies Localized,
  bad: {
    de: [
      '„Nur schnell ein Logo“ oder Design zum Stundensatz-Schnäppchen.',
      'Fertige Layouts 1:1 abtippen, ohne Spielraum für Gestaltung und Strategie.',
      'Deadline übermorgen für ein Projekt, das Substanz braucht.',
      'Ranking-Wunder über Nacht – seriös verspricht das niemand.',
    ],
    en: [
      '“Just a quick logo” or design at a bargain hourly rate.',
      'Copying finished layouts 1:1, with no room for design or strategy.',
      'A deadline the day after tomorrow for a project that needs substance.',
      'Overnight ranking miracles — nobody serious promises that.',
    ],
  } satisfies Localized<string[]>,
}

/** Hinweis an den Ergebnissen der Referenzen (W3, § 7.4). */
export const RESULTS_DISCLAIMER: Localized = {
  de: 'Alle gezeigten Ergebnisse stammen aus echten Projekten. Sie sind Beispiele, keine Garantie – jedes Vorhaben startet mit eigenen Voraussetzungen, und genau darüber sprechen wir im Erstgespräch.',
  en: 'All results shown come from real projects. They are examples, not a guarantee — every project starts from its own conditions, and that is exactly what we talk about in the intro call.',
}

export const SERVICES_NOTE: Localized = {
  de: 'Alle Preise netto, als Festpreis nach Value-Based Pricing – Sie zahlen für Ergebnisse, nicht für Stunden. Zusätzlich buchbar: Design-Sprint-Moderation, WCAG-Audits sowie KI-Workshops für Teams.',
  en: 'All prices are net, quoted as a fixed price under value-based pricing — you pay for results, not for hours. Also available: design sprint facilitation, WCAG audits and AI workshops for teams.',
}

export const HOME_META = {
  /**
   * DAS DATUM DIESER SEITE (Befund B7).
   *
   * Vorher stempelten Startseite und beide Guides alle drei `CONTACT.
   * lastUpdated` — EIN Datum für drei Dokumente, das mit jeder Pflege
   * irgendeiner Ecke der Site weiterrückte. `dateModified` ist aber eine
   * Aussage über den INHALT dieses Dokuments, und Inhalte werden hier je Seite
   * gepflegt; ein gemeinsames Datum meldet Suchmaschinen (und Lesern) eine
   * Änderung, die es nicht gab.
   *
   * `published` ist der Stand der Übernahme aus dem alten Portfolio-Repo
   * (14. Juli 2026, siehe Kopf dieser Datei). `updated` und `updatedHuman`
   * gehören zusammen — wer eines ändert, ändert beide. Der SITE-Stand in der
   * Fußzeile bleibt `CONTACT.lastUpdatedHuman`.
   */
  published: '2026-07-14',
  updated: '2026-08-21',
  updatedHuman: { de: '21. August 2026', en: '21 August 2026' } satisfies Localized,
  title: {
    de: 'Pukalani Studio – Senior UI/UX Design für Mittelstand & Agenturen',
    en: 'Pukalani Studio — Senior UI/UX Design for Mid-Sized Companies & Agencies',
  } satisfies Localized,
  description: {
    de: 'Pukalani Studio: Designkonzepte, digitales Brand Design, Websites & Content aus über 25 Jahren Design und Werbung (u. a. für Astra, GEMA, NEFF, Telekom). Remote für DACH, zu festen Projektpreisen.',
    en: 'Pukalani Studio — digital design studio for Germany, Austria & Switzerland. Design concepts, brand design, websites and content production, backed by 25+ years and brands like Astra, GEMA, NEFF, Telekom. Fixed prices.',
  } satisfies Localized,
  /**
   * Beschreibung der PERSON im JSON-LD (länger als die Meta-Description) —
   * bewusst weiterhin über David Schubert, nicht über das Studio: der
   * Organization-Knoten trägt die Marke, dieser Knoten den Menschen dahinter.
   */
  personDescription: {
    de: 'Senior UI/UX Designer, Creative Technologist und ausgebildeter Mediengestalter mit über 25 Jahren Erfahrung in Design und Werbung. Gründer von Pukalani Studio: Designkonzepte, digitales Brand Design, Websites und Content – remote für Mittelstand und Agenturen in der DACH-Region. In Agentur- und Studio-Projekten für Marken wie Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom und T-Systems tätig gewesen.',
    en: 'Senior UI/UX designer, creative technologist and trained media designer with more than 25 years in design and advertising. Founder of Pukalani Studio: design concepts, digital brand design, websites and content — remote for mid-sized companies and agencies in the DACH region. Has worked on agency and studio projects for brands such as Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom and T-Systems.',
  } satisfies Localized,
  serviceDescription: {
    de: 'Designkonzepte, digitales Brand Design, UI/UX-Design, Websites mit technischer Umsetzung und Content-Produktion (Foto, Video, Werbemittel). Remote für Mittelstand und Agenturen in Deutschland, Österreich und der Schweiz.',
    en: 'Design concepts, digital brand design, UI/UX design, websites including technical implementation and content production (photo, video, ad assets). Remote for mid-sized companies and agencies in Germany, Austria and Switzerland.',
  } satisfies Localized,
}

/** `knowsAbout` der Person — Entity-Signale für Such- und Antwortmaschinen. */
export const KNOWS_ABOUT: Localized<string[]> = {
  de: [
    'UI/UX Design',
    'Art Direction',
    'Digitales Brand Design',
    'Designkonzepte & Strategie',
    'Webdesign & Websites',
    'Content-Produktion',
    'Fotografie',
    'Videografie & Videoschnitt',
    'Conversion-Optimierung (CRO)',
    'Barrierefreiheit (WCAG 2.1 AA)',
    'Design Systems',
    'Figma',
    'Web-Entwicklung (Nuxt, Vue)',
  ],
  en: [
    'UI/UX design',
    'Art direction',
    'Digital brand design',
    'Design concepts & strategy',
    'Web design & websites',
    'Content production',
    'Photography',
    'Videography & video editing',
    'Conversion rate optimisation (CRO)',
    'Accessibility (WCAG 2.1 AA)',
    'Design systems',
    'Figma',
    'Web development (Nuxt, Vue)',
  ],
}
