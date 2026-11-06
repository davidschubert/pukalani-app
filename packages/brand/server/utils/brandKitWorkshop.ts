import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { renderBrandContextSystemPrompt } from '../../shared/brandContext'
import {
  type BrandPressSummarySection,
  brandContactFieldLabel,
  brandFactEntries,
  brandPressSummaryMissing,
  buildBrandPromptTemplates,
  formatBrandPressSummary,
  parseBrandGuardrails,
  parseBrandPressContact,
  parseBrandPressFacts,
} from '../../shared/brandKitSlots'
import { brandMarkVariantsText } from '../../shared/brandDesignMark'
import { brandSlotValueView } from '../../shared/brandSlotFormat'
import type {
  BrandKitContactTemplate,
  BrandKitWorkshopPrompt,
  BrandKitWorkshopResponse,
} from '../../shared/types/brandKit'
import type { BrandKitContext } from './brandKit'
import {
  BRAND_INTRO_REQUESTS_TABLE,
  type BrandIntroRequestRow,
  brandDb,
  brandSlotStoredValue,
  mergeStepSlotRecords,
} from './brandStore'

/**
 * DIE PUREN QUELLEN DER WERKSTATT-KAPITEL (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.3/§2.4/§2.9, Paket K5).
 *
 * ── WARUM DAS ÜBERHAUPT VOM SERVER KOMMT ─────────────────────────────────
 * Drei der Kit-Sessions rechnen PUR (§2.11: null KI-Aufrufe) — und trotzdem
 * kann der Browser sie nicht allein rechnen, aus drei verschiedenen Gründen:
 *  · `n.prompts` braucht die KURZFORM von `brand.md`, also die fertige
 *    `BrandFoundationView` über ALLE Kapitel. Der Store der Werkstatt trägt
 *    immer nur den offenen Baustein.
 *  · `p.facts` braucht die Einträge von `a.facts` — und die sind `internal`.
 *    Sie erreichen den Browser AUSSCHLIESSLICH über diesen Besitzer-Pfad
 *    (`private, no-store`), nie über Share, Publikation oder eine Kit-Datei.
 *  · `p.contact` braucht Konto-Daten und die Erstgespräch-Anfrage; beides
 *    liegt in Appwrite und geht keinen Client etwas an, ausser dem des
 *    Eigentümers.
 * `m.rules` bräuchte nur `b2.rule` aus einem fremden Baustein — es fährt
 * deshalb bei derselben Antwort mit, statt eine zweite Route zu bekommen.
 *
 * ── EINE ROUTE FÜR ALLE VIER ─────────────────────────────────────────────
 * Vier Routen wären vier Zugangsprüfungen, vier Kopfzeilen und vier Stellen,
 * an denen `private, no-store` fehlen kann. Der Zugang selbst ist NICHT neu:
 * `loadBrandKitContext` ist dieselbe Tür wie beim Manifest und bei jeder
 * Datei — fremde Marke 404, ohne Freischaltung 403 `derivation_locked`.
 *
 * ── SIE RUFT KEIN MODELL UND SCHREIBT NICHTS ─────────────────────────────
 * Zwei Abfragen (Konto, Erstgespräch), sonst reine Rechnung über einem
 * Zustand, den `loadBrandKitContext` ohnehin geladen hat. Kein Ereignis, kein
 * Eimer: es gibt keine KI und keine teure Rechnung (§2.11 — der `kitDay`-Eimer
 * zählt DATEIEN, und eine Werkstatt-Auskunft ist keine).
 */

/** Die geltenden Slot-Werte über ALLE Kapitel dieser Marke. */
export function brandKitSlotValues(context: BrandKitContext): Map<string, string> {
  const records = mergeStepSlotRecords(context.stepRows)
  return new Map(Object.keys(records).map(id => [id, brandSlotStoredValue(records[id])]))
}

/**
 * DIE VORLAGEN FÜR DEN PRESSE-KONTAKT (§2.20 Nr. 3) — höchstens zwei.
 *
 * „Anders eingeben" ist KEINE Vorlage und steht deshalb nicht in dieser
 * Liste: es ist der Zustand ohne Vorlage, und ein Eintrag dafür wäre eine
 * leere Karte, die vorgibt, etwas vorzufüllen.
 *
 * ── DIE ANFRAGE GEHÖRT DIESER MARKE, ODER SIE ERSCHEINT NICHT ────────────
 * `brand_intro_requests.profileId` trägt die Zuordnung (gesetzt über
 * `resolveBrandIntroProfileId`, das sie beim Eingang gegen den Besitz prüft).
 * Gefragt wird nach BEIDEM — Marke UND Konto —, obwohl der Besitz an dieser
 * Stelle schon feststeht: eine Anfrage, deren `userId` nicht zum heutigen
 * Eigentümer passt, gehört zur Vorgeschichte der Marke und nicht in sein
 * Formular.
 *
 * FAIL-SOFT: schlägt eine der beiden Abfragen fehl, fehlt eine Vorlage. Eine
 * Werkstatt, die wegen einer Bequemlichkeit ausfällt, ist teurer als eine
 * Karte weniger.
 */
export async function brandKitContactTemplates(
  event: H3Event,
  context: BrandKitContext,
  locale: string,
): Promise<BrandKitContactTemplate[]> {
  const templates: BrandKitContactTemplate[] = []

  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId: context.userId })
    const email = (user.email ?? '').trim()
    const name = (user.name ?? '').trim()
    if (email || name) {
      templates.push({
        id: 'account',
        name,
        // Die Rolle ist eine ANNAHME und wird als solche vorgeschlagen, nicht
        // behauptet: der Mensch bestätigt sie, bevor sie öffentlich reist.
        role: locale.toLowerCase().startsWith('de') ? 'Inhaber/in' : 'Owner',
        email,
      })
    }
  }
  catch {
    // Konto nicht lesbar ⇒ keine Vorlage. Kein Log: das ist ein Zustand.
  }

  try {
    const { tablesDB, databaseId } = brandDb(event)
    const res = await tablesDB.listRows<BrandIntroRequestRow>({
      databaseId,
      tableId: BRAND_INTRO_REQUESTS_TABLE,
      queries: [
        Query.equal('profileId', [context.profile.$id]),
        Query.equal('userId', [context.userId]),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ],
    })
    const row = res.rows[0]
    const email = (row?.email || row?.emailLower || '').trim()
    const name = (row?.name ?? '').trim()
    if (row && (email || name)) {
      // KEINE TELEFONNUMMER (§2.4): `row.phone` wird bewusst nicht gelesen.
      templates.push({ id: 'intro', name, role: (row.company ?? '').trim(), email })
    }
  }
  catch {
    // Keine Anfrage, keine Tabelle, kranke Appwrite ⇒ keine Vorlage.
  }

  return templates
}

/** Die drei Vorlagen — PUR aus Ansicht und Leitplanken. */
export function brandKitPrompts(
  context: BrandKitContext,
  values: Map<string, string>,
): BrandKitWorkshopPrompt[] {
  const locale = context.profile.contentLocale
  return buildBrandPromptTemplates({
    systemPrompt: renderBrandContextSystemPrompt(context.view, {
      title: context.profile.title ?? '',
      locale,
      stand: context.stand,
    }),
    guardrails: parseBrandGuardrails(values.get('n.guardrails') ?? ''),
    title: context.profile.title ?? '',
    locale,
  })
}

/**
 * DIE PRESSEKIT-VORSCHAU (§2.4) — sie stellt zusammen und erfindet nichts.
 *
 * Ein fehlender Teil wird BENANNT (Session-Qualität: „A part that is missing
 * is named as missing, not filled with something similar"). Deshalb steht
 * jeder Abschnitt in der Liste, auch der leere — mit dem Vermisst-Satz statt
 * mit etwas Ähnlichem.
 *
 * DIE FAKTEN KOMMEN AUS `p.facts`, NIE AUS `a.facts` (§2.12 Nr. 2). Das steht
 * hier als Satz und nicht nur als Weglassung: `a.facts` liegt in derselben
 * Map, die diese Funktion in der Hand hält, und die nächste Zeile, die es
 * bequem hätte, wäre die erste, die die Reise-Regel bricht.
 */
export function brandKitPressSummary(
  context: BrandKitContext,
  values: Map<string, string>,
): string {
  const locale = context.profile.contentLocale
  const missing = brandPressSummaryMissing(locale)
  const de = locale.toLowerCase().startsWith('de')
  const label = (deText: string, enText: string): string => (de ? deText : enText)

  const listOf = (slotId: string): string[] => {
    const view = brandSlotValueView('list', values.get(slotId) ?? '')
    return view.kind === 'list' ? view.items : []
  }

  const taglines = listOf('ep.taglines')
  const boilerplates = brandSlotValueView('structured', values.get('ep.boilerplates') ?? '')
  const facts = parseBrandPressFacts(values.get('p.facts') ?? '')
  const contact = parseBrandPressContact(values.get('p.contact') ?? '')

  const sections: BrandPressSummarySection[] = [
    {
      label: label('Tagline', 'Tagline'),
      body: taglines[0] ?? missing,
    },
    {
      label: label('Boilerplates', 'Boilerplates'),
      body: boilerplates.kind === 'blocks' && boilerplates.blocks.length > 0
        ? boilerplates.blocks.map(block => `${block.label}: ${block.body}`).join(' · ')
        : missing,
    },
    {
      label: label('Freigegebene Fakten', 'Released facts'),
      body: facts.length > 0 ? facts.join(' · ') : missing,
    },
    {
      label: label('Presse-Kontakt', 'Press contact'),
      body: contact
        ? [
            `${brandContactFieldLabel('name', locale)}: ${contact.name}`,
            `${brandContactFieldLabel('role', locale)}: ${contact.role}`,
            `${brandContactFieldLabel('email', locale)}: ${contact.email}`,
          ].filter(part => !part.endsWith(': ')).join(' · ')
        : missing,
    },
    {
      label: label('Zeichen', 'Marks'),
      // Ohne Preset sagt der Abschnitt OFFEN, dass er mit Brand Design kommt
      // (Session-Beispiel, wörtlich) — er wird nicht weggelassen.
      body: context.preset
        ? brandMarkVariantsText(locale)
        : label(
            'Kommt mit Brand Design — die Zeichen-Setzungen entstehen dort.',
            'Arrives with Brand Design — the mark settings are decided there.',
          ),
    },
  ]

  return formatBrandPressSummary(sections)
}

/** Die ganze Antwort — s. Kopf. */
export async function buildBrandKitWorkshop(
  event: H3Event,
  context: BrandKitContext,
): Promise<BrandKitWorkshopResponse> {
  const values = brandKitSlotValues(context)
  const locale = context.profile.contentLocale

  return {
    locale,
    architectureRule: values.get('b2.rule') ?? '',
    facts: brandFactEntries(values.get('a.facts') ?? ''),
    prompts: brandKitPrompts(context, values),
    contactTemplates: await brandKitContactTemplates(event, context, locale),
    summary: brandKitPressSummary(context, values),
  }
}
