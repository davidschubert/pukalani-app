import {
  type BrandPathKind,
  type BrandSlot,
  type BrandTeamKind,
  partKeyFor,
  partLabelKeyFor,
  slotById,
  slotLabelKeyFor,
} from '../../shared/slotRegistry'
import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'

/**
 * DIE MENSCHLICHE BESCHRIFTUNG EINES SLOTS FÜR PROMPTS (2026-09-03, Davids
 * Live-Fund): die Eingabe-Blöcke reisten als `[a.customerPraise]` zum Modell,
 * und George sprach die internen Ids im Chat nach („Die Felder
 * a.customerPraise, a.oneThing … enthalten Platzhalter"). Ein Mensch kennt
 * diese Namen nicht — die Blöcke tragen jetzt die FRAGE bzw. das Label aus
 * dem Locale-Katalog, in der INHALTSSPRACHE des Profils.
 *
 * Der Katalog ist dieselbe Quelle wie die UI (`brand.q.<id>`, von
 * `questionKeyFor` adressiert): eine zweite Label-Liste hier wäre das fünfte
 * getrennte Regelwerk. Pfad-Varianten ({ new, relaunch }) löst `pathKind`
 * auf; fehlt ein Eintrag (deaktivierte Alt-Slots), bleibt die Id der
 * ehrliche Rückfall — besser ein interner Name als ein erfundenes Label.
 */

type CatalogNode = string | { [key: string]: CatalogNode }

/**
 * DIE GANZEN KATALOGE — von der Wurzel her gelesen, weil hier drei
 * Konventionen zusammenkommen: die Frage einer Session unter `brand.q.<id>`,
 * die Frage eines TEILS einer Sammel-Session unter `brand.part.<id>.<teil>`
 * und sein kurzes Etikett unter `brand.partLabel.…` (`slotRegistry.ts`,
 * Begründung dort). Ein zweiter Zugriffspfad auf dieselbe Datei, keine zweite
 * Datei — und seit der Anrede-Runde auch kein zweiter Einstiegspunkt mehr
 * (`brand.q` als eigener Wurzel-Knoten ist entfallen).
 */
const ROOTS: Record<string, CatalogNode> = {
  de: de as unknown as CatalogNode,
  en: en as unknown as CatalogNode,
}

function lookup(root: CatalogNode | undefined, key: string): string | null {
  let node: CatalogNode | undefined = root
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = node[segment]
  }
  return typeof node === 'string' ? node : null
}

/**
 * DIE FRAGE EINES TEILS einer Sammel-Session, in der gewünschten Sprache.
 *
 * Sie geht in Georges Prompt („frage jetzt genau nach diesem einen Teil") und
 * folgt damit derselben Regel wie `brandSlotPromptLabel`: kein erfundener Text,
 * sondern der Katalog-Satz, den die Oberfläche auch zeigt. Fehlt er, bleibt
 * die Teil-Id der ehrliche Rückfall.
 *
 * `team` ist ein PFLICHT-Argument, aus derselben Begründung wie bei
 * `brandSlotPromptLabel`: die einzige Aufrufstelle ist die Chat-Route, und die
 * liest `profileFacts(profile)` ohnehin. Ein stiller Default hätte hier genau
 * den Fehler eingebaut, den die Weiche beheben soll — im Solo-Gespräch stand
 * bis 2026-09-09 „Seit wann gibt es euch?" (die Weiche kennt `partKeyFor`).
 */
export function brandSessionPartQuestion(
  slot: BrandSlot,
  part: string,
  locale: string,
  team: BrandTeamKind,
): string {
  return lookup(ROOTS[locale] ?? ROOTS.en, partKeyFor(slot, part, team)) ?? part
}

/**
 * DAS KURZE ETIKETT EINES TEILS — die Überschrift seines Blocks im
 * zusammengelegten `structured`-Wert („Team", „Seit", „Märkte").
 *
 * IMMER in der INHALTSSPRACHE der Marke, nie in der der Seite: der Wert gehört
 * dem Brand-Dokument, und das ist einsprachig (dieselbe Trennung wie bei
 * `contentLocale` gegenüber `uiLocale`).
 *
 * SIE KENNT DIE WEICHE W3 BEWUSST NICHT (2026-09-09), anders als die FRAGE
 * darüber: ein Etikett ist ein Hauptwort („Team", „Seit", „Märkte") und redet
 * niemanden an — es gibt dort nichts zu drehen. Ein `team`-Argument wäre ein
 * Versprechen auf eine zweite Fassung, die der Katalog nie führen wird.
 */
export function brandSessionPartLabel(slot: BrandSlot, part: string, contentLocale: string): string {
  return lookup(ROOTS[contentLocale] ?? ROOTS.en, partLabelKeyFor(slot, part)) ?? part
}

/**
 * DER NAME DES ENTWURFS-KNOPFES (converse-11, Befund 8) — „George, entwirf
 * das", in den Design-Kapiteln „Frida, entwirf das".
 *
 * IN DER SPRACHE DER SEITE, nicht der Marke: der Knopf steht in der Oberfläche,
 * und George nennt ihn in einem Chat-Zug, der ohnehin der Chat-Sprache folgt
 * (Regel 9 des System-Prompts). Deshalb `uiLocale` und nicht `contentLocale` —
 * die einzige Stelle dieser Datei, an der das so herum gilt.
 *
 * Gelesen wird derselbe Katalog-Eintrag, den die Bühne rendert
 * (`brand.workspace.generate.start`) — ein zweiter Satz hier wäre beim ersten
 * Umbenennen still falsch. Fehlt er (unbekannte Sprache), gibt es `''`, und der
 * Prompt nennt den Knopf schlicht nicht beim Namen.
 */
export function brandDraftButtonLabel(uiLocale: string, voiceName: string): string {
  const template = lookup(ROOTS[uiLocale] ?? ROOTS.en, 'brand.workspace.generate.start')
  return template ? template.replace('{voice}', voiceName) : ''
}

/**
 * DER NAME DES BESTÄTIGEN-KNOPFES (converse-14, Davids Entscheidung
 * 2026-09-09) — „Passt so, bestätigen".
 *
 * Dieselbe Quelle, dieselbe Sprache und dieselbe Begründung wie bei
 * `brandDraftButtonLabel`: der Knopf steht in der Oberfläche, George nennt ihn
 * in einem Chat-Zug, also `uiLocale`. Gelesen wird der Eintrag, den die Bühne
 * rendert (`brand.workspace.confirmChoice.confirm`) — ein zweiter Satz hier
 * wäre beim ersten Umbenennen still falsch. Fehlt er, gibt es `''`, und der
 * Auftrag nennt den Knopf schlicht nicht beim Namen.
 */
export function brandConfirmButtonLabel(uiLocale: string): string {
  return lookup(ROOTS[uiLocale] ?? ROOTS.en, 'brand.workspace.confirmChoice.confirm') ?? ''
}

/**
 * DER NAME DES ZWEITEN KNOPFES — „Ich ergänze noch etwas" (Testlauf-Befund D).
 *
 * Er steht NICHT im Auftrag (das Modell soll keine Knopf-Texte schreiben),
 * sondern im FILTER: eine `OPTION:`-Zeile mit dieser Beschriftung wäre ein
 * zweiter Knopf für dieselbe Entscheidung, und ihr Klick liefe als Antwort in
 * das Feld (s. `dropControlOptions`). Dieselbe Quelle wie der erste Knopf, aus
 * derselben Begründung: die Bühne rendert genau diesen Eintrag.
 */
export function brandKeepWritingButtonLabel(uiLocale: string): string {
  return lookup(ROOTS[uiLocale] ?? ROOTS.en, 'brand.workspace.confirmChoice.more') ?? ''
}

/**
 * DER KURZE NAME EINES FELDES — Label vor Frage (Testlauf-Befund 3,
 * 2026-09-09).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Der Abschlusszug nannte sein Ziel mit `brandSlotPromptLabel`, und das ist
 * für eine Frage-Session der FRAGETEXT. Im Live-Lauf stand deshalb: „Der
 * nächste Schritt heißt „Was sagen deine glücklichsten Kunden über euch — in
 * DEREN Worten?"" — ein zitierter Fragebogen mitten in einem Satz, der einen
 * WEG beschreiben soll. Gemeint war „Kundenstimmen".
 *
 * ── DIESELBE REGEL WIE IN DER OBERFLÄCHE ──────────────────────────────────
 * `useBrandFieldLabel` beantwortet dieselbe Frage im Browser und beantwortet
 * sie genauso: `brand.labels.<id>` wenn es ihn gibt, sonst die Frage. Ein
 * eigener Wortlaut hier wäre der zweite Name für dasselbe Feld — und der
 * Mensch erkennt das Feld nicht wieder, auf das er klicken soll.
 *
 * ── WOFÜR ER GILT UND WOFÜR NICHT ─────────────────────────────────────────
 * Für NAMEN: das Ziel des Abschlusszuges, die übersprungenen Sessions. NICHT
 * für die Eingabe-Blöcke — dort steht der Wert UNTER seiner Frage, und die
 * Frage sagt dem Modell, worauf der Wert antwortet („Kundenstimmen" allein
 * täte das nicht).
 */
export function brandSlotShortLabel(
  slotId: string,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): string {
  const short = lookup(ROOTS[contentLocale] ?? ROOTS.en, `brand.labels.${slotId}`)
  return short ?? brandSlotPromptLabel(slotId, contentLocale, pathKind, team)
}

/** Dieselbe Beschriftung für eine ganze Dependency-Liste (Prompt-Aufbau). */
export function labelSlotDependencies<T extends { slotId: string }>(
  dependencies: readonly T[],
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): (T & { label: string })[] {
  return dependencies.map(dependency => ({
    ...dependency,
    label: brandSlotPromptLabel(dependency.slotId, contentLocale, pathKind, team),
  }))
}

/**
 * DIE WEICHEN GEHÖREN BEIDE HIERHER (Paket 8, Rest aus 2b).
 *
 * `brand.q.<id>` kann ein Kind-Objekt sein, und es gibt ZWEI Gründe dafür:
 * die Pfad-Weiche W1 (`{ new, relaunch }`) und die Team-Weiche W3
 * (`{ solo, team }`). Der alte Rückfall
 * `node[pathKind] ?? node.new ?? Object.values(node)[0]` traf beim
 * Team-Objekt zwangsläufig `solo` — im Prompt stand für ein Team-Branding
 * also das Etikett der Solo-Frage („Nie geduldet …") über einem Wert, der
 * die Entscheidungsregel des Teams beschreibt. George redet dann über das
 * falsche Feld.
 *
 * ── DIE FORM WIRD NICHT MEHR ERRATEN (Anrede-Runde 2026-09-09) ────────────
 * Der Nachfolger dieses Rückfalls war ein Absteigen durch den Katalog-Knoten:
 * er musste raten, ob `{ solo, team }` eine Team-Weiche ist oder ein Kapitel
 * namens „solo". Seit `a.origin` BEIDE Achsen trägt
 * (`{ new: { solo, team }, relaunch: { … } }`) wäre daraus eine zweite,
 * mitwachsende Regel geworden — und die zweite Regel ist immer die, die
 * hinterherhinkt. Gefragt wird jetzt die REGISTRY (`slotLabelKeyFor`, dieselbe
 * Rechnung wie Bühne, Log und Abnahme), und der Katalog wird nur noch an
 * genau diesem Schlüssel gelesen. Ein unbekannter Slot (deaktivierte
 * Alt-Slots) fällt weiter auf `brand.q.<id>` und zuletzt auf die Id zurück —
 * besser ein interner Name als ein erfundenes Label.
 *
 * `team` ist ein PFLICHT-Argument, nicht eines mit Default: die
 * Aufrufstellen sind alle Server-Routen, die `profileFacts(profile)` ohnehin
 * lesen — ein stiller Default hätte genau diesen Fehler wieder eingebaut,
 * und die Typprüfung ist hier der einzige Wächter, der ihn findet.
 * (`questionKeyFor`/`exampleKeyFor` in `shared/` bleiben bewusst optional:
 * sie werden auch von Stellen gerufen, die die Weiche nicht kennen können.)
 */
export function brandSlotPromptLabel(
  slotId: string,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): string {
  const root = ROOTS[contentLocale] ?? ROOTS.en
  const slot = slotById(slotId)
  const key = slot ? slotLabelKeyFor(slot, pathKind, team) : `brand.q.${slotId}`
  return lookup(root, key) ?? lookup(root, `brand.q.${slotId}`) ?? slotId
}
