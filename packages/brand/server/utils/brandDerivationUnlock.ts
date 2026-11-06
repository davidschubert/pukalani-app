import type { H3Event } from 'h3'
import type { BrandDerivationVia } from '../../shared/brandDerivation'
import { resolveDerivationAccess } from '../../shared/brandDerivation'
import { BRAND_KIT_STEP_KEYS } from '../../shared/slotRegistry'
import type { BrandUnlockItem } from '../../shared/types/brand'
import { toBrandDesignUnlockItem } from './brandDesignUnlock'
import {
  BRAND_EMPTY_GENERATIONS,
  BRAND_PROFILES_TABLE,
  BRAND_STEPS_TABLE,
  brandDb,
  brandStepRowId,
  type BrandProfileRow,
} from './brandStore'

/**
 * DIE FREISCHALTUNG DER ABLEITUNG — DIE BETREIBER-SEITE (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.8/§2.9, Paket K1).
 *
 * ── EINE SCHRANKE, ZWEI PRODUKTE ─────────────────────────────────────────
 * Der Knopf schaltet EIN Feld (`brand_profiles.derivationUnlockedAt`), und
 * dieses eine Feld öffnet Brand Book & Kit (Schicht 3) UND den Marktvergleich.
 * Ein Knopf je Produkt hätte zwei Wahrheiten über denselben Zustand erzeugt —
 * und die zweite wäre beim ersten Verkauf falsch gewesen (BS1 §9.1: das Feld
 * ersetzt die geplante Tabelle `brand_entitlements`).
 *
 * ── WAS VON D1 ÜBERNOMMEN IST UND WARUM ──────────────────────────────────
 * Betreiber-Prüfung (`requireBrandUnlockOperator`, `users.manage`), Id aus dem
 * Pfad, das Laden der fremden Zeile und die Foundation-Frage stehen in
 * `brandDesignUnlock.ts` und werden von hier IMPORTIERT, nicht kopiert: es
 * sind Fragen über eine Marke, nicht über ein Produkt. Eine zweite Fassung
 * wäre die zweite Antwort auf „darf dieser Mensch das?" — genau die Sorte
 * Doppelung, gegen die der Kopf jener Datei argumentiert.
 *
 * EIGEN ist alles, was die Ableitung von Schicht 2 unterscheidet: die drei
 * Kit-Zeilen, die dritte Spalte (`via`), der Beta-Weg und das eigene Ereignis.
 *
 * ── DER DRITTE SCHREIBER FEHLT HIER MIT ABSICHT ──────────────────────────
 * Der Stripe-Webhook (BS1 Z1) schreibt DIESELBEN drei Spalten mit
 * `via: 'purchase'`. Er lebt später in seinem eigenen Pfad; was er tut, ist
 * `applyBrandDerivationUnlock` — deshalb steht das Schreiben hier als Funktion
 * und nicht im Handler der Betreiber-Route.
 */

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die Design-Pendants. */
export function brandDerivationUnlockUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.derivation_unlock_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Derivation unlock administration unavailable',
    data: { code: 'derivation_unlock_unavailable' },
  })
}

/**
 * DIE DREI `brand_steps`-ZEILEN VON SCHICHT 3 — angelegt, falls sie fehlen.
 *
 * ── DIE D1-LEHRE, WÖRTLICH ───────────────────────────────────────────────
 * `brand_steps` bekommt seine Zeilen bei der ANLAGE des Brandings
 * (`profiles/index.post.ts` läuft über die GANZE Journey), und
 * `loadBrandStepContext` legt bewusst nichts nach („ein fehlender Baustein ist
 * ein Datenfehler und keine Gelegenheit, ihn still zu verdecken"). Jede Marke
 * aus der Zeit VOR K0 hat deshalb keine Zeile für `nomenclature`/`aiguide`/
 * `presskit` — ohne diesen Schritt endete die erste freigeschaltete Marke auf
 * `/brand/:id/aiguide` in einem 404. Genau denselben Fehler hat D1 bei Schicht
 * 2 gemacht und behoben.
 *
 * ── AUCH DAS OPTIONALE KAPITEL BEKOMMT SEINE ZEILE ───────────────────────
 * `nomenclature` läuft NUR auf dem B2-Weg (§2.20 Nr. 4, `includeStep` erbt die
 * Weiche von `architecture`) — die Zeile entsteht hier trotzdem, wie bei D1 die
 * Zeilen aller sechs Design-Kapitel unabhängig von jeder Weiche entstehen. Der
 * Grund ist der Vertrag „entfallene Daten werden INAKTIV, nie gelöscht" (§3e):
 * eine Weiche kann sich ÄNDERN (aus „keine Untermarken" wird „doch welche"),
 * und dann muss die Zeile da sein. Was GILT, sagt die Journey — sie überspringt
 * das Kapitel weiterhin, und `state: 'locked'` in der Zeile widerspricht dem
 * nicht: was gilt, steht nie in der Spalte.
 *
 * Gibt zurück, wie viele Zeilen wirklich neu waren; die Zahl geht in das
 * Ereignis, weil sie „Bestandsmarke nachgezogen" von „war ohnehin vollständig"
 * unterscheidet. Idempotent (409 → skip).
 */
export async function ensureBrandKitStepRows(
  event: H3Event,
  profileId: string,
): Promise<number> {
  const { tablesDB, databaseId } = brandDb(event)
  let created = 0
  for (const stepKey of BRAND_KIT_STEP_KEYS) {
    try {
      await tablesDB.createRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: brandStepRowId(profileId, stepKey),
        data: {
          profileId,
          stepKey,
          state: 'locked',
          slots: '{}',
          generations: BRAND_EMPTY_GENERATIONS,
          inputHash: '',
          revision: 0,
          activeSeconds: 0,
        },
      })
      created += 1
    }
    catch (error) {
      // 409 heisst „steht schon da" — der Normalfall für jede Marke, die nach
      // K0 angelegt wurde, und für jede zweite Freischaltung.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) continue
      throw brandDerivationUnlockUnavailable(error, { profileId, stage: 'ensure_steps', stepKey })
    }
  }
  return created
}

/**
 * DIE DREI SPALTEN SETZEN — der Schreibvorgang, den ALLE Schreiber teilen.
 *
 * Er steht als Funktion und nicht im Handler, weil es ab BS1 Z1 einen ZWEITEN
 * Aufrufer gibt: der Stripe-Webhook schreibt dieselben drei Spalten mit
 * `via: 'purchase'` und der Event-Id als `by`. Zwei Stellen, die je eine
 * Teilmenge der Spalten setzen, wären der Weg zu einem `…Via` ohne `…At`.
 *
 * Er schreibt NUR die Spalten. Die Kapitel-Zeilen (`ensureBrandKitStepRows`)
 * und das Ereignis gehören dem Aufrufer: der Webhook zählt anders als der
 * Betreiber-Knopf, und ein Ereignis, das eine Hilfsfunktion mitschreibt, wäre
 * an der Stelle unsichtbar, an der man es sucht.
 */
export async function applyBrandDerivationUnlock(
  event: H3Event,
  profileId: string,
  grant: { via: BrandDerivationVia, by: string } | null,
): Promise<BrandProfileRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.updateRow<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      rowId: profileId,
      // `null` heisst hier RÜCKNAHME — und dann fallen alle drei zusammen (s.
      // Kopf von brand-025): ein Urheber ohne Datum wäre die Behauptung einer
      // Freischaltung, die es nicht mehr gibt.
      data: grant
        ? {
            derivationUnlockedAt: new Date().toISOString(),
            derivationUnlockedVia: grant.via,
            derivationUnlockedBy: grant.by,
          }
        : {
            derivationUnlockedAt: null,
            derivationUnlockedVia: null,
            derivationUnlockedBy: null,
          },
    })
  }
  catch (error) {
    throw brandDerivationUnlockUnavailable(error, {
      profileId, stage: grant ? 'unlock' : 'lock',
    })
  }
}

/**
 * EINE ZEILE DER BETREIBER-SEITE — beide Schranken nebeneinander.
 *
 * `foundationDone` UND `betaAccount` kommen GEBÜNDELT von aussen herein und
 * werden nicht je Zeile nachgeschlagen: eine Liste mit fünfzig Marken darf
 * nicht hundert Abfragen stellen (dasselbe Muster wie
 * `loadBrandFoundationDone`).
 *
 * ACHTUNG, `betaAccount` IST DER DES EIGENTÜMERS: ob die Ableitung dieser
 * fremden Marke offen ist, hängt an SEINEM Konto — nicht an dem des
 * Betreibers, der die Liste öffnet (`loadBrandBetaAccounts`).
 */
export function toBrandUnlockItem(
  row: BrandProfileRow,
  foundationDone: boolean,
  betaAccount: boolean,
): BrandUnlockItem {
  const access = resolveDerivationAccess({
    betaAccount,
    unlockedAt: row.derivationUnlockedAt,
    via: row.derivationUnlockedVia,
  })
  return {
    ...toBrandDesignUnlockItem(row, foundationDone),
    derivationUnlockedAt: row.derivationUnlockedAt ?? null,
    derivationUnlockedBy: row.derivationUnlockedBy ?? '',
    // Das ERGEBNIS der puren Regel, nicht die Spalte: `'beta'` hat gar keine.
    derivationGrant: access.unlocked ? access.grant : 'none',
  }
}
