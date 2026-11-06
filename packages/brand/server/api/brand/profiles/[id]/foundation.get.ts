import { resolveDerivationAccess } from '../../../../../shared/brandDerivation'
import { brandStepAcceptance } from '../../../../../shared/brandJourney'
import { blockingFindingSlots } from '../../../../../shared/brandFindings'
import { isBrandDesignStep, slotsForStep } from '../../../../../shared/slotRegistry'
import type {
  BrandFoundationResponse,
  BrandFoundationStepState,
} from '../../../../../shared/types/brand'
import { loadBrandDocumentContext } from '../../../../utils/brandAcceptance'
import { brandDesignStand, loadBrandDesignPreset } from '../../../../utils/brandDesignPreset'
import { recordBrandEvent } from '../../../../utils/brandEvents'
import { buildBrandFoundationView } from '../../../../utils/brandFoundationView'

/**
 * „BRAND FOUNDATION" — DIE PRIVATE LESEANSICHT (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.1/§2.6, Paket G2).
 *
 * ── SIE BAUT EINEN SNAPSHOT, DEN NIEMAND SPEICHERT ───────────────────────
 * `buildBrandFoundation` nimmt wörtlich die Form des `BrandShareSnapshot`
 * (Kopf von `shared/brandFoundation.ts`). Die LIVE-Werte in genau diese Form
 * zu legen ist seit K4 nicht mehr Sache dieser Route, sondern von
 * `buildBrandFoundationView` (server/utils) — dieselbe Funktion, die auch das
 * KIT fährt (`brand.md`, `brand.json`, README). Vorher stand die Rechnung
 * zweimal da und übersprang die Kapitel der dritten Schicht unterschiedlich;
 * §2.6 sagt „`brand.md` liest DIESELBE Ansicht wie das Book", und ab hier ist
 * das derselbe Aufruf. Der Unterschied zwischen der privaten und der
 * geteilten Ansicht bleibt damit ein Testfall und kein Zufall: beide fahren
 * dieselbe Regel, die eine auf dem Jetzt, die andere auf dem eingefrorenen
 * Damals.
 *
 * ── HIER WIRD NICHT VORGEFILTERT (§2.8, das Doppelnetz) ──────────────────
 * Bewusst KEIN `brandShareableSlotValues`: was in ein Handbuch gehört,
 * entscheidet der Renderer an der Registry, und zwar an EINER Stelle. Ein
 * zweiter Filter davor sähe wie eine zusätzliche Sicherung aus, wäre aber eine
 * zweite Antwort auf dieselbe Frage — und die eine, die man später ändert, ist
 * garantiert nicht die, die noch gelesen wird. Hineingegeben wird trotzdem nur
 * BESTÄTIGTES: `confirmedSlotValues` liest `confirmed`, nie `latestDraft`.
 *
 * ── LESEN IST IMMER ERLAUBT, FREMDES IST 404 ─────────────────────────────
 * Wie beim Dokument: kein `canEnterBrandStep` (gezeigt wird nur, was der
 * Mensch selbst bestätigt hat), aber `assertBrandOwnerAccess` in
 * `loadOwnedProfile` — ein fremdes oder erfundenes Branding antwortet 404 wie
 * überall in diesem Silo-Layer (DECISION-LOG 2026-09-05). Die Seite wirft
 * daraufhin ihre Fehlerseite, keine halbe Werkstatt.
 *
 * ── SIE RUFT NICHTS AN UND ÄNDERT NICHTS ─────────────────────────────────
 * Null KI-Aufrufe (§2.9): die Story steht am Profil, der Prüfblick bleibt im
 * Dokument. Der Zähler und die Abnahme-Zustände sind Rechnung über dem, was
 * `loadBrandDocumentContext` ohnehin geladen hat — zwei Abfragen, wie beim
 * Dokument. Am BRANDING ändert sie nichts; die einzige Zeile, die sie
 * schreibt, ist `foundation.viewed` im Funnel (Paket G3) — fail-soft, und sie
 * beantwortet die Frage aus §2.10: arbeitet jemand am nächsten Tag mit dem
 * Ergebnis? Sie steht am ENDE, nach jeder Prüfung: ein fremdes Branding darf
 * nicht einmal einen Zähler bewegen.
 */
export default defineEventHandler(async (event): Promise<BrandFoundationResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows, journey, allFacts, sessionStates, findings }
    = await loadBrandDocumentContext(event, userId, betaAccount)

  const byStepKey = new Map(stepRows.map(row => [row.stepKey, row]))

  /**
   * DER ZÄHLER UND DIE ABNAHME-ZUSTÄNDE — die eine Sache, die das Kit nicht
   * braucht und die deshalb hier geblieben ist.
   *
   * Übersprungene Kapitel sind nicht das, was diese Marke IST (§2.2), und die
   * sechs Design-Kapitel zählen als EINES (s. `accepted` unten) — die
   * Kapitel-LISTE der Leseansicht baut `buildBrandFoundationView`, diese
   * Schleife baut nur den Fortschritt darüber.
   */
  const chapters: BrandFoundationStepState[] = []
  for (const entry of journey) {
    if (entry.state === 'skipped') continue
    // DIE SECHS DESIGN-KAPITEL SIND EIN KAPITEL (D8, §2.8) und stehen deshalb
    // nicht einzeln in dieser Liste — der Zähler unten rechnet sie als +1,
    // sobald das Preset steht. Die drei Kapitel der SCHICHT 3 stehen seit K4
    // sehr wohl darin: sie sind je ein eigenes Werkstatt-Kapitel, sie werden
    // einzeln abgenommen, und ohne sie könnte der Vermerk „noch nicht
    // abgenommen" an Nomenklatur, Pressekit und den AI-Guidelines nicht
    // erscheinen (`BRAND_FOUNDATION_SOURCE_STEPS`). Ohne Freischaltung sind
    // sie `skipped` und fallen schon eine Zeile darüber heraus — der Zähler
    // einer Marke ohne Ableitung ändert sich also nicht.
    if (isBrandDesignStep(entry.stepKey)) continue
    const row = byStepKey.get(entry.stepKey)
    const openConflicts = blockingFindingSlots(
      findings,
      slotsForStep(entry.stepKey).map(session => session.id),
    )
    const acceptance = brandStepAcceptance(entry.stepKey, allFacts, sessionStates, openConflicts)
    chapters.push({
      stepKey: entry.stepKey,
      // Fehlt die Zeile (Datenfehler), gilt das Kapitel als offen — eine
      // Leseansicht darf daran nicht scheitern.
      storedState: row?.state ?? 'open',
      acceptance: { accepted: acceptance.accepted, total: acceptance.total },
    })
  }

  /**
   * DAS ERGEBNIS VON BRAND DESIGN (D8, §2.8) — dieselbe Arbeitsteilung wie bei
   * der Richtung: die Route holt es, der Renderer stellt es dar.
   *
   * Es entsteht aus den bestätigten Werten der sechs Kapitel und ist `null`,
   * solange eines davon nicht abgenommen ist — dann bleibt Kapitel 10 die
   * Schranke mit der gewählten Richtung, unverändert seit G4.
   */
  const design = await loadBrandDesignPreset(event, profile, stepRows)

  /**
   * DIE SCHRANKE DER SCHICHT 3 (K1, §2.8) — dieselbe Regel, die das Kit
   * durchsetzt (`resolveDerivationAccess`), hier aber nur als ANZEIGE: die
   * Leseansicht wirft nichts, sie zeigt drei gesperrte Kapitel mit dem
   * richtigen Grund (§2.5). Gerechnet wird sie in der Route und nicht im
   * Renderer, weil sie Kontowissen braucht (Beta ODER Feld) — und ein purer
   * Renderer hat keines.
   */
  const derivation = resolveDerivationAccess({
    betaAccount,
    unlockedAt: profile.derivationUnlockedAt,
    via: profile.derivationUnlockedVia,
  })

  await recordBrandEvent(event, {
    type: 'foundation.viewed',
    profileId: profile.$id,
    userId,
    // Umfang, nicht Inhalt (Regel 1 des Ereignis-Kopfs).
    payload: {
      chapters: chapters.length,
      accepted: chapters.filter(chapter => chapter.storedState === 'done').length,
    },
  })

  return {
    profileId: profile.$id,
    title: profile.title ?? '',
    contentLocale: profile.contentLocale,
    view: buildBrandFoundationView({
      profile,
      stepRows,
      journey,
      design: design.preset,
      derivationUnlocked: derivation.unlocked,
    }),
    chapters,
    /**
     * DER ZÄHLER RECHNET KAPITEL 10 MIT, SOBALD DAS PRESET STEHT (D8).
     *
     * Er zählt sonst die Kapitel der WERKSTATT (dort wird abgenommen). Brand
     * Design hat sechs eigene Kapitel, aber im HANDBUCH ist es genau eines —
     * und es ist abgenommen, denn ohne sechs Abnahmen gäbe es das Preset nicht
     * (`loadBrandDesignPreset`). Also +1 auf beiden Seiten: „10 von 10"
     * bedeutet dasselbe wie „9 von 9" vorher, nur mit der visuellen Identität
     * darin. Sechs Zeilen dazuzuzählen hiesse dagegen, eine Foundation mit
     * fünfzehn Kapiteln zu behaupten, die niemand so liest.
     */
    accepted: {
      chapters: chapters.filter(chapter => chapter.storedState === 'done').length
        + (design.preset ? 1 : 0),
      total: chapters.length + (design.preset ? 1 : 0),
    },
    ...(design.preset ? { designStand: brandDesignStand(stepRows) } : {}),
  }
})
