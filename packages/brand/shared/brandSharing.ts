import { isBrandDesignStep, sessionTravels, slotById } from './slotRegistry'

/**
 * WAS DAS KONTO VERLASSEN DARF — PUR (BF1 §3a Nr. 7; eingelöst in MV1 M5).
 *
 * ── DIE ZUSAGE STAND, DIE PRÜFUNG FEHLTE ──────────────────────────────────
 * `BrandSessionConfig.sensitivity` trägt seit BF1 wörtlich den Satz „Was per
 * Share-Link und Export standardmässig NICHT reist" — vier Sessions stehen auf
 * `internal` (`a.competitors`, `a.complaints`, `a.challenge`, `a.facts`), und
 * `tests/slotRegistry.test.ts` begründet die Auswahl sogar namentlich:
 * „`a.competitors` nennt NAMENTLICH Dritte und zu jedem eine Schwäche — das
 * Erste, was ein Kunde nicht teilen will."
 *
 * GELESEN wurde das Feld bis MV1 M5 an genau zwei Stellen: beim Setzen des
 * Defaults und als Etikett in der Leseansicht. Der Veröffentlichen-Pfad
 * (`share.post.ts` → `confirmedSlotValues`) lief über ALLE bestätigten Slots
 * und fror die vier internen Sessions mit ein — dreissig Tage lang lesbar für
 * jeden, der den Token hat.
 *
 * Aufgefallen ist das beim Marktvergleich, und zwar an dessen eigenem
 * Massstab: Plan BRAND-MARKTVERGLEICH §2.9 Nr. 7 sagt die Vertraulichkeit der
 * Markt-Daten mit den Worten „vertraulich wie `a.competitors`" zu. Der Satz
 * hätte nichts bedeutet, solange `a.competitors` selbst mitreist — und die
 * Wettbewerber-NAMEN, die der Marktvergleich nie in einen Vorschlag lässt
 * (§ 6 UWG-Riegel), standen über diesen Umweg trotzdem in einem öffentlich
 * abrufbaren Schnappschuss.
 *
 * ── WARUM EINE EIGENE FUNKTION UND NICHT EIN FILTER IN `confirmedSlotValues` ─
 * `confirmedSlotValues` beantwortet die Frage „was hat dieser Mensch in diesem
 * Kapitel BESTÄTIGT?" — und die richtige Antwort darauf schliesst die internen
 * Sessions ein: die Werkstatt, die Kapitel-Abnahme und das Dokument zeigen sie
 * dem Eigentümer, und der market-Layer baut daraus das eigene Marktprofil
 * (mit seinem eigenen `publicOnly`-Filter obendrauf). Ein Filter IN dieser
 * Funktion hätte all das stillschweigend mitverändert. Diese Datei stellt die
 * ANDERE Frage — „was darf das Konto verlassen?" — und deshalb steht sie
 * daneben und nicht darin.
 *
 * ── ZWEI FRAGEN, EINE REGEL (Paket G1, BF-Leseansicht §2.3) ───────────────
 * Seit G1 hängt hier eine ZWEITE Bedingung: `audience: 'foundation'`.
 * `sensitivity` sagt „darf es raus", `audience` sagt „ist es eine Festlegung
 * oder nur Material" — `a.origin` (die Gründungsgeschichte) ist nicht
 * vertraulich und gehört trotzdem nicht in ein Abbild, das die Marke
 * beschreibt. Beides zusammen ist `sessionTravels` in der Registry, und diese
 * Datei ruft GENAU DIESE Funktion: der Renderer der Leseansicht
 * (`brandFoundation.ts`) stellt dieselbe Frage, und zwei Antworten darauf
 * wären der Anfang eines Lecks, das nur eine der beiden Ansichten zeigt.
 *
 * ── FAIL-CLOSED ───────────────────────────────────────────────────────────
 * Ein Slot, den die Registry nicht kennt, reist NICHT. Das ist die teure
 * Richtung des Zweifels und hier die richtige: eine unbekannte Id kann eine
 * alte, eine getippte oder eine künftige sein, und von allen dreien weiss
 * niemand, was darin steht. Ein `deactivated`-Slot reist ebenfalls nicht — er
 * gehört nicht mehr zum Bauplan der Marke, also auch nicht in ihr Abbild.
 */

/** Ein bestätigter Wert, wie ihn `confirmedSlotValues` liefert. */
export interface BrandShareableSlotValue {
  readonly slotId: string
  readonly value: string
}

/**
 * Darf dieser Slot das Konto verlassen? Nur bekannte, aktive Slots, die
 * `sessionTravels` bejaht — öffentlich UND Festlegung (s. Kopf,
 * „Fail-closed" und „Zwei Fragen").
 */
export function isBrandSlotShareable(slotId: string): boolean {
  const slot = slotById(slotId)
  if (!slot) return false
  return sessionTravels(slot)
}

/**
 * Die teilbaren Werte eines Kapitels. Die Reihenfolge bleibt, wie sie kam —
 * `confirmedSlotValues` sortiert bereits nach Katalog-Reihenfolge, und ein
 * zweites Sortieren hier wäre eine zweite Wahrheit über die Reihenfolge.
 */
export function brandShareableSlotValues<T extends BrandShareableSlotValue>(
  values: readonly T[],
): T[] {
  return values.filter(entry => isBrandSlotShareable(entry.slotId))
}

/**
 * REIST DIESES KAPITEL? — die zweite, GRÖBERE Frage neben `isBrandSlotShareable`
 * (Brand Design D9, Davids Entscheidung 2026-09-09: „der Link trägt nur, was er
 * zeigt").
 *
 * Die sechs Kapitel von Brand Design (`isBrandDesignStep`) stehen im Snapshot
 * NICHT als rohe Slot-Werte. Ihr Ergebnis reist als PRESET (`BrandShareSnapshot.
 * design`) — eine gerechnete, gerenderte Fassung derselben Wahrheit; die rohen
 * Werte daneben wären dieselbe Marke ein zweites Mal, als Katalog-Ids, Hex-Töne
 * und Token-Tabellen, die kein Leser je zu sehen bekommt.
 *
 * ── WARUM IMMER UND NICHT „SOBALD EIN PRESET DABEI IST" ───────────────────
 * Davids Satz war „sobald ein Preset dabei ist". Die schärfere Fassung kostet
 * nichts Sichtbares und deckt zwei Fälle mehr ab, die derselbe Gedanke meint:
 *
 *  1. DIE VERÖFFENTLICHUNG (Discover) reicht bewusst KEIN Preset durch — sie
 *     ist dauerhaft und indexierbar (Kopf von `BrandSnapshotOptions.design`).
 *     Unter der wörtlichen Fassung behielte ausgerechnet SIE die rohen
 *     Design-Werte, und zwar für immer. Das ist die Umkehrung der Entscheidung.
 *  2. EINE HALBFERTIGE SCHICHT hat noch kein Preset. Ihre bestätigten Werte
 *     sind Ids und Hex-Töne ohne Rendering — auch ein gesperrtes Kapitel steht
 *     in der Journey (`state: 'locked'`, nicht `'skipped'`) und käme mit.
 *
 * Sichtbar ändert sich nichts: der Renderer liest die Design-`chapters`
 * NIRGENDS (`BRAND_FOUNDATION_SOURCE_STEPS.visuell` ist leer, Kapitel 10 baut
 * ausschliesslich aus `input.design`). Die Zusage ist mit
 * `tests/brandFoundationDesign.test.ts` und dem Beweis belegt.
 *
 * ── FAIL-OPEN, UND DAS IST HIER RICHTIG ──────────────────────────────────
 * Ein unbekannter `stepKey` (alter Snapshot, künftiges Kapitel) reist mit —
 * anders als bei den SLOTS. Das Netz darunter ist `isBrandSlotShareable`: die
 * WERTE eines fremden Kapitels laufen weiterhin durch den fail-closed-Filter,
 * das Kapitel selbst ist nur eine Überschrift. Fail-closed hier hiesse, dass
 * ein umbenanntes Kapitel seinen Inhalt still verliert.
 */
export function isBrandChapterShareable(stepKey: string): boolean {
  return !isBrandDesignStep(stepKey)
}
