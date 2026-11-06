import type { BrandUnlockResponse } from '../../../../../../shared/types/brand'
import {
  brandFoundationIsComplete,
  loadBrandProfileForOperator,
  requireBrandUnlockOperator,
  requireBrandUnlockProfileId,
} from '../../../../../utils/brandDesignUnlock'
import {
  applyBrandDerivationUnlock,
  ensureBrandKitStepRows,
  toBrandUnlockItem,
} from '../../../../../utils/brandDerivationUnlock'
import { loadBrandBetaAccounts } from '../../../../../utils/brandAccess'
import { recordBrandEvent } from '../../../../../utils/brandEvents'

/**
 * BETREIBER: DIE ABLEITUNG FÜR EINE MARKE FREISCHALTEN (`users.manage`,
 * Konzept docs/plans/BRAND-BOOK-KIT.md §2.8/§2.9, Paket K1).
 *
 * ── EIN KNOPF, ZWEI PRODUKTE ─────────────────────────────────────────────
 * Er setzt EIN Feld, und dieses Feld öffnet Brand Book & Kit (Schicht 3) UND
 * den Marktvergleich (§2.8, BS1 §9.1). Deshalb heisst die Spalte in der
 * Betreiber-Liste „Ableitung" und nicht „Book & Kit".
 *
 * ── DIESELBE VORBEDINGUNG WIE BEI SCHICHT 2 ──────────────────────────────
 * Ohne abgeschlossenes Ergebnis-Kapitel der Foundation ⇒ 409
 * `foundation_incomplete`. Nicht weil die Journey es bräuchte (die sperrt
 * ohnehin weiter), sondern weil eine Freischaltung, die nichts öffnet, eine
 * Lüge in der Betreiber-Liste wäre: dort stünde „freigeschaltet", während der
 * Kunde weiter vor der Schranke steht. Der Knopf in der Liste ist aus
 * demselben Grund AUS — die Regel steht an beiden Enden.
 *
 * ── ZWEITER KLICK IST KEIN FEHLER ────────────────────────────────────────
 * Eine bereits freigeschaltete Marke bekommt kein neues Datum und keine zweite
 * Ereignis-Zeile: die Route antwortet mit der unveränderten Zeile. Die Frage
 * lautet „ist offen?", nicht „wie oft wurde geklickt?".
 *
 * ── EIN BETA-KONTO IST KEIN GRUND, NICHT ZU SCHREIBEN ────────────────────
 * Die Marke eines Beta-Kontos IST schon frei (`grant: 'beta'`), und der Knopf
 * bleibt trotzdem bedienbar: die Zusage „Beta-Konten dauerhaft frei" gilt dem
 * KONTO und fällt mit einem Widerruf; das FELD gehört der MARKE und bleibt.
 * Wer hier klickt, macht aus einer allgemeinen Zusage eine haltbare — genau
 * das, was ein Betreiber vor einem Widerruf tun will.
 *
 * ── ERST DIE ZEILEN, DANN DER STEMPEL ────────────────────────────────────
 * `ensureBrandKitStepRows` legt die drei `brand_steps`-Zeilen an, falls sie
 * fehlen (Bestandsmarke aus der Zeit vor K0 — Begründung dort). In dieser
 * Reihenfolge, weil die umgekehrte im Fehlerfall eine freigeschaltete Marke
 * ohne Kapitel-Zeilen zurückliesse: der Kunde bekäme auf `/brand/:id/aiguide`
 * einen 404 statt der Schranke. So herum sind im schlimmsten Fall drei
 * `locked`-Zeilen entstanden, die die Journey ohnehin überspringt.
 */
export default defineEventHandler(async (event): Promise<BrandUnlockResponse> => {
  const operator = requireBrandUnlockOperator(event)
  const profileId = requireBrandUnlockProfileId(event)
  const profile = await loadBrandProfileForOperator(event, profileId)

  const foundationDone = await brandFoundationIsComplete(event, profile)
  // Die Beta-Zulassung des EIGENTÜMERS — sie entscheidet, was der Chip in der
  // Liste sagt, nicht ob geschrieben werden darf (s. Kopf).
  const beta = await loadBrandBetaAccounts(event, [profile.ownerId])
  const betaAccount = beta.has(profile.ownerId)

  if (profile.derivationUnlockedAt) {
    return { ok: true, item: toBrandUnlockItem(profile, foundationDone, betaAccount) }
  }

  if (!foundationDone) {
    throw createError({
      status: 409,
      statusText: 'Brand foundation is not complete',
      data: { code: 'foundation_incomplete' },
    })
  }

  const createdRows = await ensureBrandKitStepRows(event, profileId)
  const updated = await applyBrandDerivationUnlock(event, profileId, {
    via: 'operator',
    by: operator.$id,
  })

  // Kennzahlen, kein Inhalt (Regel 1 im Kopf von `brandEvents.ts`): kein Titel,
  // keine Adresse. `createdRows` erzählt, ob eine Bestandsmarke nachgezogen
  // wurde; `beta` beantwortet die Frage, die man nach dem ersten Verkauf
  // stellen wird — schalten wir überhaupt Marken frei, die nicht ohnehin über
  // ein Beta-Konto frei wären?
  await recordBrandEvent(event, {
    type: 'derivation.unlocked',
    profileId,
    userId: operator.$id,
    payload: {
      via: 'operator',
      createdRows,
      beta: betaAccount,
      progressPct: profile.progressPct ?? 0,
    },
  })

  return { ok: true, item: toBrandUnlockItem(updated, foundationDone, betaAccount) }
})
