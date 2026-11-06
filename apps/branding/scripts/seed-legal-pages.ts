/**
 * DAS GERÜST DER DREI RECHTSSEITEN VON branding.supply (BS1 R1, 2026-09-07).
 *
 *   pnpm --filter branding seed:legal     # gegen apps/branding/.env
 *
 * ── WARUM EIN EIGENES SKRIPT NEBEN packages/pages/scripts/seed-legal-pages.ts
 * Das Layer-Skript legt die Vorlagen an, die eine COMMUNITY braucht: sie
 * sprechen den Kunden an („deine Community", „du bist Betreiber und damit der
 * Verantwortliche") und kennen nur zwei Slugs. Hier ist der Betreiber WIR —
 * und es fehlen die drei Abschnitte, die es sonst nirgends gibt: die
 * KI-Verarbeitung von Kundentexten, der Abruf fremder Websites und die
 * öffentliche Bewertung fremder Marken (Plan §2, §9 Frage 2). Ein Vorlagentext
 * über fremde Communities auf der eigenen Seite wäre schlechter als keiner.
 *
 * ── WAS HIER STEHT UND WAS AUSDRÜCKLICH NICHT ────────────────────────────
 * NUR das Gerüst: Überschriften plus je ein `[AUSFÜLLEN: …]`-Marker, der sagt,
 * was dort hingehört. **Kein erfundener Rechtstext, keine geratene Anschrift,
 * keine erfundene Zusage.** Die Grundfassung liefert Davids Generator (Paket
 * R2), die drei Besonderheiten schreiben wir aus dem Faktenblatt (§1.2), und
 * geprüft wird alles beim Anwaltstermin (R3). Gefüllt wird im Dashboard unter
 * /dashboard/pages — genau dafür liegen die Texte im CMS und nicht im Repo.
 *
 * Zwei Abschnitte sind bewusst LEER und trotzdem benannt (§9 Frage 3):
 * „Vertreter in der Union (Art. 27 DSGVO)" und „Verbraucherstreitbeilegung
 * (§ 36 VSBG)". Die Antwort des Anwalts ist dann ein eingesetzter Satz und
 * kein Umbau der Seite.
 *
 * ── `status: 'published'` — DIE ABWEICHUNG VOM LAYER-SKRIPT, MIT GRUND ────
 * Das Layer-Skript legt `draft` an („ein leerer Rechtstext live ist schlimmer
 * als keiner"), und für eine Kunden-Community stimmt das. Hier nicht: das
 * AGB-Häkchen im Registrierformular VERLINKT die AGB-Seite, und der Fuß
 * verlinkt alle drei. Ein 404 hinter dem Häkchen wäre schlechter als ein
 * ehrlicher Entwurf — das ist Davids Entscheidung 7 („sofort, mit Entwurf und
 * sichtbarem Hinweis"). Die Ehrlichkeit trägt die App-Ansage
 * `pukalani.pages.draftNotice`: „Entwurf, in anwaltlicher Prüfung" als ERSTER
 * Block plus `noindex` (packages/pages/shared/pageDraftNotice.ts). In R3
 * fällt beides weg, die Zeilen bleiben.
 *
 * ── IDEMPOTENT ───────────────────────────────────────────────────────────
 * Je slug+locale: eine vorhandene Zeile bleibt UNBERÜHRT — auch und gerade,
 * wenn David sie schon gefüllt hat. Ein 409 aus einem Wettlauf gilt als
 * „schon da". Ein zweiter Lauf ändert deshalb nichts.
 */
import { Client, ID, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — NUXT_PUBLIC_APPWRITE_{ENDPOINT,PROJECT_ID,DATABASE_ID} + NUXT_APPWRITE_KEY setzen (--env-file).')
  process.exit(1)
}

const LOCALES = ['de', 'en'] as const
type Locale = (typeof LOCALES)[number]

interface Scaffold {
  slug: 'imprint' | 'privacy' | 'terms'
  sortOrder: number
  title: Record<Locale, string>
  body: Record<Locale, string>
}

/** Der Entwurfs-Hinweis steht auch IM Text — die Zeile überlebt jeden Umzug. */
const DRAFT_NOTE: Record<Locale, string> = {
  de: '> **Entwurf, in anwaltlicher Prüfung.** Diese Seite trägt die Struktur, aber noch keinen verbindlichen Text. Jede Zeile mit [AUSFÜLLEN: …] ist eine offene Stelle.',
  en: '> **Draft, under review by our lawyers.** This page carries the structure, but no binding text yet. Every line with [FILL IN: …] is an open spot.',
}

const SCAFFOLDS: Scaffold[] = [
  {
    slug: 'imprint',
    sortOrder: 100,
    title: { de: 'Impressum', en: 'Imprint' },
    body: {
      de: `${DRAFT_NOTE.de}

## Anbieter

[AUSFÜLLEN: Name und ladungsfähige Anschrift des Anbieters von branding.supply — nicht raten, aus dem Bestand von pukalani.studio übernehmen]

## Kontakt

[AUSFÜLLEN: E-Mail-Adresse und, falls vorhanden, Telefonnummer]

## Vertreten durch

[AUSFÜLLEN: vertretungsberechtigte Person(en), falls eine Gesellschaft Anbieter ist]

## Register und Umsatzsteuer

[AUSFÜLLEN: Register und Nummer, Umsatzsteuer-Identifikationsnummer — nur falls vorhanden; siehe A1-Frage 5 zur Umsatzsteuer bei einem US-Anbieter mit DACH-Ausrichtung]

## Verantwortlich für den Inhalt

[AUSFÜLLEN: Name und Anschrift der inhaltlich verantwortlichen Person — § 18 Abs. 2 MStV, offene Anwaltsfrage aus A1]

## Vertreter in der Union (Art. 27 DSGVO)

[AUSFÜLLEN: offen — Antwort des Anwalts (Plan §9 Frage 3). Der Abschnitt steht benannt hier, damit die Antwort ein eingesetzter Satz ist und kein Umbau.]

## Verbraucherstreitbeilegung (§ 36 VSBG)

[AUSFÜLLEN: offen — Antwort des Anwalts (Plan §9 Frage 3). Wird erst mit dem bezahlten Angebot (Paket Z1) wirklich einschlägig.]`,
      en: `${DRAFT_NOTE.en}

## Provider

[FILL IN: name and full postal address of the provider of branding.supply — do not guess, take it from the existing pukalani.studio imprint]

## Contact

[FILL IN: email address and, if available, phone number]

## Represented by

[FILL IN: the people authorised to represent the company, if a company is the provider]

## Register and VAT

[FILL IN: register and number, VAT identification number — only if they exist; see open question A1-5 about VAT for a US provider selling into the DACH region]

## Responsible for the content

[FILL IN: name and address of the person responsible for the content — § 18 (2) MStV, open question from A1]

## Representative in the Union (Art. 27 GDPR)

[FILL IN: open — waiting for our lawyer's answer (plan §9 question 3). The section is named here so the answer becomes one inserted sentence, not a rebuild.]

## Consumer dispute resolution (§ 36 VSBG)

[FILL IN: open — waiting for our lawyer's answer (plan §9 question 3). Only becomes relevant with the paid offering (package Z1).]`,
    },
  },
  {
    slug: 'privacy',
    sortOrder: 110,
    title: { de: 'Datenschutz', en: 'Privacy' },
    body: {
      de: `${DRAFT_NOTE.de}

## Verantwortlicher

[AUSFÜLLEN: wie im Impressum — Name, Anschrift, Kontakt]

## Vertreter in der Union (Art. 27 DSGVO)

[AUSFÜLLEN: offen — Antwort des Anwalts (Plan §9 Frage 3)]

## Was wir verarbeiten

[AUSFÜLLEN: die zwölf Verarbeitungen aus dem Faktenblatt (Plan §1.2) — Konto, Sitzungen, Wizard-Inhalte, KI-Aufrufe, Brand-Check, Marktvergleich, Share-Links, Warteliste, Mailversand, Server-Protokolle, Betreiber-Ereignisse; dazu je Zweck, Empfänger, Rechtsgrundlage und Speicherdauer]

## KI-Verarbeitung deiner Markentexte

[AUSFÜLLEN: Prüfpunkt für den Anwalt (Plan §9 Frage 2). Der Abschnitt sagt in einfachen Worten, dass Markentexte über OpenRouter an einen Modellanbieter gehen, unter welchen Bedingungen (Zero-Data-Retention, kein Fallback, kein Training) und wie lange das Ergebnis bei uns bleibt. Grundlage: das Faktenblatt, Zeile 4.]

## Abruf fremder Websites

[AUSFÜLLEN: Prüfpunkt für den Anwalt. Brand-Check und Marktvergleich rufen fremde Seiten ab; die Bot-Auskunft steht unter /market-bot, dazu der TDM-Vorbehalt und der PII-Filter. Grundlage: Faktenblatt, Zeilen 5 und 6.]

## Öffentliche Bewertung fremder Marken

[AUSFÜLLEN: Prüfpunkt für den Anwalt. Was der Brand-Score misst, wer im Ranking erscheint (Opt-in des Prüfenden) und welcher Korrekturweg offen steht.]

## Empfänger und Unterauftragnehmer

[AUSFÜLLEN: die Subprozessoren-Liste (Plan §2.2 Punkt 7) — mindestens Hetzner, ploi.io, OpenRouter samt der zugelassenen Modellanbieter, der SMTP-Anbieter, und nur beim Google-Login Google]

## Was NICHT stattfindet

[AUSFÜLLEN: kein Werbenetzwerk, kein eingebetteter Drittinhalt, keine fremden Schriften, keine Reichweitenmessung, kein Cookie-Banner — weil es nichts einzuwilligen gibt. Grundlage: Faktenblatt, Absatz nach der Tabelle.]

## Speicherdauer

[AUSFÜLLEN: je Verarbeitung; zwei Fristen sind heute offen (Server-Protokolle, Betreiber-Ereignisse)]

## Deine Rechte

[AUSFÜLLEN: Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit, Widerspruch, Beschwerde bei einer Aufsichtsbehörde — und wo im Konto Export und Löschung liegen]`,
      en: `${DRAFT_NOTE.en}

## Controller

[FILL IN: same as in the imprint — name, address, contact]

## Representative in the Union (Art. 27 GDPR)

[FILL IN: open — waiting for our lawyer's answer (plan §9 question 3)]

## What we process

[FILL IN: the twelve processing activities from the fact sheet (plan §1.2) — account, sessions, wizard content, AI calls, brand check, market comparison, share links, waiting list, email, server logs, operator events; each with purpose, recipients, legal basis and retention]

## AI processing of your brand texts

[FILL IN: review point for our lawyer (plan §9 question 2). This section says in plain words that brand texts go through OpenRouter to a model provider, under which conditions (zero data retention, no fallback, no training) and how long the result stays with us. Source: fact sheet, row 4.]

## Fetching third-party websites

[FILL IN: review point for our lawyer. Brand check and market comparison fetch third-party pages; the bot notice lives at /market-bot, plus the TDM reservation and the PII filter. Source: fact sheet, rows 5 and 6.]

## Public scoring of third-party brands

[FILL IN: review point for our lawyer. What the brand score measures, who appears in the ranking (opt-in by the person running the check) and which correction route is open.]

## Recipients and sub-processors

[FILL IN: the sub-processor list (plan §2.2 point 7) — at least Hetzner, ploi.io, OpenRouter including the allowed model providers, the SMTP provider, and Google only for the Google sign-in]

## What does NOT happen

[FILL IN: no ad network, no embedded third-party content, no third-party fonts, no analytics, no cookie banner — because there is nothing to consent to. Source: fact sheet, paragraph after the table.]

## Retention

[FILL IN: per processing activity; two retention periods are open today (server logs, operator events)]

## Your rights

[FILL IN: access, rectification, erasure, restriction, portability, objection, complaint to a supervisory authority — and where export and deletion live inside the account]`,
    },
  },
  {
    slug: 'terms',
    sortOrder: 120,
    title: { de: 'AGB', en: 'Terms' },
    body: {
      de: `${DRAFT_NOTE.de}

## Geltungsbereich

[AUSFÜLLEN: für welches Angebot diese Bedingungen gelten und wer Vertragspartner ist]

## Was branding.supply leistet

[AUSFÜLLEN: Brand Foundation, Brand-Check, Marktvergleich — und ausdrücklich, dass Entwürfe von einem Sprachmodell erzeugt werden und keine Beratung ersetzen]

## Konto und Zugang

[AUSFÜLLEN: Anlage, Sperre, Löschung; Zugang zur Beta über Warteliste und Einladungscode]

## Beta-Konten

[AUSFÜLLEN: Davids Entscheidung 6 (Plan §9) — Beta-Konten bleiben dauerhaft frei, je KONTO und nicht als unbegrenzte Zahl von Brandings; die bestehenden Tages-Kontingente bleiben; der Betreiber kann die Zusage je Konto bei Missbrauch widerrufen]

## Preise und Zahlung

[AUSFÜLLEN: erst mit Paket Z1 — Name des Kaufgegenstands und Betrag stehen noch aus (Plan §9.2). Bis dahin ist das Angebot unentgeltlich.]

## Widerrufsbelehrung für digitale Inhalte

[AUSFÜLLEN: erst mit Paket Z1 — § 356 Abs. 5 BGB, Verzicht beim Start der Ausführung (Plan §9 Frage 4)]

## Verfügbarkeit und Datenverlust

[AUSFÜLLEN: was in einer Beta zugesagt wird und was nicht]

## Laufzeit und Kündigung

[AUSFÜLLEN: beidseitig, und was mit den Inhalten danach geschieht]

## Haftung

[AUSFÜLLEN: Anwalt]

## Änderungen dieser Bedingungen

[AUSFÜLLEN: wie eine neue Fassung angekündigt wird. Technisch ist der Weg vorbereitet: wir halten am Konto fest, WELCHER Fassung jemand zugestimmt hat (pukalani.auth.termsVersion).]`,
      en: `${DRAFT_NOTE.en}

## Scope

[FILL IN: which offering these terms cover and who the contracting party is]

## What branding.supply delivers

[FILL IN: brand foundation, brand check, market comparison — and explicitly that drafts are produced by a language model and do not replace advice]

## Account and access

[FILL IN: creation, suspension, deletion; beta access through the waiting list and an invite code]

## Beta accounts

[FILL IN: David's decision 6 (plan §9) — beta accounts stay free permanently, per ACCOUNT and not as an unlimited number of brandings; the existing daily quotas remain; the operator may revoke the promise per account in case of abuse]

## Prices and payment

[FILL IN: only with package Z1 — the name of the purchased item and the amount are still open (plan §9.2). Until then the offering is free of charge.]

## Right of withdrawal for digital content

[FILL IN: only with package Z1 — § 356 (5) BGB, waiver when execution starts (plan §9 question 4)]

## Availability and data loss

[FILL IN: what a beta promises and what it does not]

## Term and termination

[FILL IN: for both sides, and what happens to the content afterwards]

## Liability

[FILL IN: lawyer]

## Changes to these terms

[FILL IN: how a new version is announced. The technical side is ready: we record on the account WHICH version someone agreed to (pukalani.auth.termsVersion).]`,
    },
  },
]

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

console.log(`Rechtsseiten-Gerüst für branding.supply — ${projectId} @ ${endpoint}`)

let created = 0
let skipped = 0

for (const locale of LOCALES) {
  for (const scaffold of SCAFFOLDS) {
    const existing = await tablesDB.listRows({
      databaseId,
      tableId: 'pages',
      queries: [
        Query.equal('slug', scaffold.slug),
        Query.equal('locale', locale),
        Query.limit(1),
      ],
    })
    if (existing.rows[0]) {
      console.log(`↷ ${scaffold.slug} (${locale}) existiert — unberührt`)
      skipped++
      continue
    }

    try {
      await tablesDB.createRow({
        databaseId,
        tableId: 'pages',
        rowId: ID.unique(),
        data: {
          slug: scaffold.slug,
          locale,
          title: scaffold.title[locale],
          body: scaffold.body[locale],
          // Siehe Kopf: bewusst veröffentlicht, weil Fuß und AGB-Häkchen
          // darauf zeigen — die Ehrlichkeit trägt `pukalani.pages.draftNotice`.
          status: 'published',
          sortOrder: scaffold.sortOrder,
        },
      })
      console.log(`✔ ${scaffold.slug} (${locale}) angelegt — Gerüst, veröffentlicht mit Entwurfs-Hinweis`)
      created++
    }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 409) {
        console.log(`↷ ${scaffold.slug} (${locale}) — 409, Wettlauf: schon da`)
        skipped++
        continue
      }
      throw error
    }
  }
}

console.log(`\nFertig: ${created} angelegt, ${skipped} übersprungen.`)
console.log('Füllen und prüfen: /dashboard/pages — die Texte kommen mit Paket R2, geprüft wird in R3.')
