import type { Localized } from './localized'

/**
 * Kontaktwege und Stammdaten — EINE Quelle für Kopfzeile, Fußzeile, CTA-Bänder,
 * Kontakt-Sektion und die `sameAs`/`email`/`telephone`-Felder im JSON-LD.
 *
 * Die E-Mail steht bewusst im Klartext (das alte Repo hatte sie base64-kodiert):
 * gegen Adress-Sammler hilft das nachweislich nicht, es kostet aber die
 * Lesbarkeit im Quelltext und macht die Adresse im SSR-HTML unsichtbar für
 * genau die Crawler, die sie sehen SOLLEN (Structured Data, KI-Antwortmaschinen).
 */
export interface ContactData {
  email: string
  phoneHuman: string
  phoneTel: string
  calLink: string
  socialProfiles: string[]
  /** ISO-Datum für dateModified/article:modified_time. */
  lastUpdated: string
  lastUpdatedHuman: Localized
  location: Localized
}

export const CONTACT: ContactData = {
  email: 'mail@davidschubert.com',
  phoneHuman: '+1 808 866 0676',
  phoneTel: '+18088660676',
  calLink: 'https://cal.com/davidschubert/30min',
  socialProfiles: [
    'https://www.linkedin.com/in/davidschubert-uiux/',
    'https://github.com/davidschubert',
    'https://www.instagram.com/davidschubert/',
  ],
  lastUpdated: '2026-08-21',
  lastUpdatedHuman: { de: '21. August 2026', en: '21 August 2026' },
  location: {
    de: 'Pukalani, Maui · Hawaii (USA) · Remote für DACH',
    en: 'Pukalani, Maui · Hawaii (USA) · Remote for the DACH region',
  },
}

/** Fester Text des CTA-Bandes vor der Fußzeile (Antwort- und Angebotsfristen). */
export const CTA_NOTE: Localized = {
  de: 'Kostenlos und unverbindlich · Anfrage in ca. 3 Minuten · Antwort innerhalb von 24 Stunden · Festpreis-Angebot innerhalb von 48 Stunden nach dem Gespräch',
  en: 'Free and without obligation · request takes about 3 minutes · reply within 24 hours · fixed-price quote within 48 hours of the call',
}

/** Beschriftung der beiden Kontakt-Knöpfe — überall dieselbe Zusage. */
export const CTA_LABELS = {
  primary: {
    de: 'Kostenloses Erstgespräch (30 Min)',
    en: 'Book a free 30-minute intro call',
  } satisfies Localized,
  secondary: {
    de: 'E-Mail senden',
    en: 'Send an email',
  } satisfies Localized,
}
