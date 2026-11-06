import type { H3Event } from 'h3'
import { Query, type Models } from 'node-appwrite'
import { resolveBrandJourney } from '../../shared/brandJourney'
import { BRAND_DESIGN_STEP_KEYS } from '../../shared/slotRegistry'
import type { BrandDesignUnlockItem } from '../../shared/types/brand'
import {
  BRAND_EMPTY_GENERATIONS,
  BRAND_PROFILES_TABLE,
  BRAND_STEPS_TABLE,
  brandDb,
  brandStepRowId,
  isAppwriteNotFound,
  loadStepRows,
  profileFacts,
  toStepFacts,
  type BrandProfileRow,
} from './brandStore'

/**
 * DIE FREISCHALTUNG VON BRAND DESIGN — DIE BETREIBER-SEITE (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.10, Paket D1).
 *
 * ── WARUM DAS EINE BETREIBER-HANDLUNG IST ─────────────────────────────────
 * Das Geschäftsmodell der ersten Fassung ist STUDIO-BEGLEITET (§1.11 d): kein
 * Stripe, kein Preis, keine Selbstbedienung. Eine Marke bekommt Schicht 2,
 * wenn das Erstgespräch gelaufen ist — und weil das eine Handlung mit Folgen
 * ist, hinterlässt sie ein Ereignis (`design.unlocked`), nicht nur einen
 * anderen Knopf. Der Client kann sie nicht setzen; es gibt keine Kundenroute,
 * die `designUnlockedAt` schreibt (§2.13, letzter Punkt).
 *
 * ── `users.manage`, NICHT `brand.manage` ──────────────────────────────────
 * §2.10 nennt eine Capability `brand.manage`. Die gibt es in diesem Projekt
 * nicht, und sie zu ERFINDEN wäre eine neue Rolle im RBAC für genau einen
 * Knopf. `users.manage` ist die Betreiber-Klammer DIESES Layers — dieselbe,
 * die über den Beta-Zugang (`brandWaitlistAdmin.ts`), über die Branche im
 * Ranking und darüber entscheidet, welche Marke öffentlich unter unserer
 * Adresse steht. Wer über den Zugang zur Beta entscheidet, entscheidet auch,
 * welche Marke das begleitete Produkt bekommt.
 *
 * ── FREISCHALTEN LEGT DIE SECHS ZEILEN AN ─────────────────────────────────
 * `brand_steps` bekommt seine Zeilen bei der ANLAGE des Brandings
 * (`profiles/index.post.ts` läuft über die ganze Journey). Jede Marke aus der
 * Zeit VOR Brand Design D0 hat deshalb neun Zeilen und keine für `dna` …
 * `motion` — und `loadBrandStepContext` legt bewusst nichts nach („ein
 * fehlender Baustein ist ein Datenfehler und keine Gelegenheit, ihn still zu
 * verdecken"). Ohne diesen Schritt endete die erste freigeschaltete Marke auf
 * `/brand/:id/dna` in einem 404.
 *
 * Die Freischaltung ist genau der richtige Ort dafür: sie ist der Moment, in
 * dem die sechs Kapitel zum Weg dieser Marke GEHÖREN. Idempotent (409 → skip),
 * damit eine nach D0 angelegte Marke (die ihre fünfzehn Zeilen schon hat) und
 * eine zweite Freischaltung nach einer Rücknahme dasselbe tun.
 *
 * ── DIE RÜCKNAHME LÖSCHT NICHTS ───────────────────────────────────────────
 * `design.locked` leert die zwei Spalten und sonst nichts. Die Zeilen bleiben
 * mit ihren Slots liegen — dieselbe Regel wie bei der Weiche (§3e „entfallene
 * Daten werden INAKTIV, nie gelöscht"): wer wieder freischaltet, findet den
 * Stand vor. Die Journey sperrt die Kapitel trotzdem sofort, weil sie die
 * Sperre VOR dem gespeicherten `done` prüft.
 */
export function requireBrandUnlockOperator(event: H3Event) {
  return requirePermission(event, 'users.manage')
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die Nachbar-Betreiberrouten. */
export function brandDesignUnlockUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.design_unlock_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Design unlock administration unavailable',
    data: { code: 'design_unlock_unavailable' },
  })
}

/**
 * Die Profil-Id aus dem Pfad. Der 404 danach ist hier KEINE Tarnung: wer bis
 * hierher kommt, hat `users.manage` und darf wissen, dass es diese Marke nicht
 * (mehr) gibt.
 */
export function requireBrandUnlockProfileId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || id.length > 64) throw createError({ status: 400, statusText: 'Missing id' })
  return id
}

export async function loadBrandProfileForOperator(
  event: H3Event,
  profileId: string,
): Promise<BrandProfileRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandProfileRow>({
      databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw brandDesignUnlockUnavailable(error, { profileId, stage: 'load' })
  }
}

/**
 * IST DIE FOUNDATION SO WEIT? — die zweite Hälfte der Bedingung aus §2.1.
 *
 * Gefragt wird die JOURNEY und nicht `brand_steps.state` der `result`-Zeile:
 * die pure Regel ist die eine Wahrheit über „was gilt", und ein Weichenwechsel
 * kann eine gespeicherte Zeile überholen. Die Betreiber-Liste zeigt damit
 * dieselbe Aussage, die die Werkstatt später durchsetzt.
 */
export async function brandFoundationIsComplete(
  event: H3Event,
  profile: BrandProfileRow,
): Promise<boolean> {
  const stepRows = await loadStepRows(event, profile.$id)
  // `betaAccount: false` ist hier keine Auskunft über den Eigentümer, sondern
  // die Feststellung, dass sie für DIESE Frage nichts beiträgt: gefragt wird
  // allein der Zustand von `result`, und Schicht 1 hängt an keiner
  // Freischaltung (K1). Die Beta-Zulassung des BETREIBERS wäre hier ohnehin
  // die falsche — sie gehört einem anderen Konto als die Marke.
  const journey = resolveBrandJourney(profileFacts(profile, false), toStepFacts(stepRows))
  return journey.find(entry => entry.stepKey === 'result')?.state === 'done'
}

/**
 * DIE SECHS `brand_steps`-ZEILEN VON SCHICHT 2 — angelegt, falls sie fehlen
 * (s. Kopf). Gibt zurück, wie viele wirklich neu waren; die Zahl geht in das
 * Ereignis, weil sie den Unterschied zwischen „Bestandsmarke nachgezogen" und
 * „war ohnehin vollständig" erzählt.
 *
 * `state: 'locked'` ist der ehrliche Startwert: was gilt, sagt die Journey,
 * und die sperrt die Kapitel ohnehin, bis Freischaltung UND `result` stehen.
 * Ein `open` hier wäre eine zweite Wahrheit in der Zeile.
 */
export async function ensureBrandDesignStepRows(
  event: H3Event,
  profileId: string,
): Promise<number> {
  const { tablesDB, databaseId } = brandDb(event)
  let created = 0
  for (const stepKey of BRAND_DESIGN_STEP_KEYS) {
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
      // D0 angelegt wurde, und für jede zweite Freischaltung.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) continue
      throw brandDesignUnlockUnavailable(error, { profileId, stage: 'ensure_steps', stepKey })
    }
  }
  return created
}

/** Die Betreiber-Liste: alle Brandings, neueste zuerst. */
export async function listBrandProfilesForOperator(
  event: H3Event,
  input: { limit: number, cursor?: string },
): Promise<{ rows: BrandProfileRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      queries: [
        Query.orderDesc('$createdAt'),
        Query.limit(input.limit),
        ...(input.cursor ? [Query.cursorAfter(input.cursor)] : []),
      ],
    })
    return { rows: res.rows, total: res.total }
  }
  catch (error) {
    throw brandDesignUnlockUnavailable(error, { stage: 'list' })
  }
}

/**
 * Eine Zeile für die Betreiber-Liste.
 *
 * `foundationDone` kommt GEBÜNDELT von aussen herein und wird nicht je Zeile
 * nachgeschlagen: eine Liste mit fünfzig Marken darf nicht fünfzig Abfragen
 * über `brand_steps` stellen (dasselbe Muster wie die Eigentümer in der
 * Galerie-Liste).
 */
export function toBrandDesignUnlockItem(
  row: BrandProfileRow,
  foundationDone: boolean,
): BrandDesignUnlockItem {
  // Diese Zeile spricht NUR über Schicht 2, und die hängt allein an der Spalte
  // — die Beta-Zulassung des Eigentümers ändert daran nichts (K1). Die Liste
  // der ABLEITUNG braucht sie sehr wohl und holt sie sich gebündelt
  // (`toBrandUnlockItem`).
  const facts = profileFacts(row, false)
  return {
    id: row.$id,
    title: row.title ?? '',
    pathKind: facts.pathKind,
    contentLocale: row.contentLocale,
    progressPct: row.progressPct ?? 0,
    foundationDone,
    designUnlockedAt: facts.designUnlockedAt ?? null,
    designUnlockedBy: row.designUnlockedBy ?? '',
    createdAt: row.$createdAt,
  }
}

/**
 * DIE FOUNDATION-FRAGE FÜR EINE GANZE SEITE — EINE Abfrage über
 * `brand_steps`, nicht eine je Marke.
 *
 * FAIL-SOFT: geht sie schief, gilt jede Marke als „noch nicht so weit". Das
 * ist die sichere Richtung — der Knopf ist dann aus, und niemand schaltet
 * versehentlich eine halbe Foundation frei.
 */
export async function loadBrandFoundationDone(
  event: H3Event,
  profileIds: readonly string[],
): Promise<Set<string>> {
  const done = new Set<string>()
  if (profileIds.length === 0) return done
  const { tablesDB, databaseId } = brandDb(event)
  try {
    // node-appwrite 29 verlangt für den Zeilen-Generic die Row-Basis
    // (`$id`, `$createdAt`, …) — sonst TS2344 (Typecheck auf main rot, 2026-09-08).
    const res = await tablesDB.listRows<Models.Row & { profileId: string, state: string }>({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      queries: [
        Query.equal('profileId', [...profileIds]),
        Query.equal('stepKey', 'result'),
        Query.equal('state', 'done'),
        Query.limit(profileIds.length),
      ],
    })
    for (const row of res.rows) done.add(row.profileId)
  }
  catch (error) {
    logEvent('warn', 'brand.design_unlock_foundation_lookup_failed', {
      count: profileIds.length,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
  return done
}
