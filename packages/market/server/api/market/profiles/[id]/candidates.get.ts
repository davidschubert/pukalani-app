import { z } from 'zod'
import type { MarketCandidateOptionsResponse } from '../../../../../shared/types/marketApi'
import type { MarketSourceOption } from '../../../../../shared/marketProfile'
import { marketLibraryEntries, marketLibrarySourceOption } from '../../../../../shared/marketLibrary'
import { listBrandProfilesForOwner, listSharedMarketProfiles } from '../../../../contracts/brandContract'
import { MARKET_UNLOCK_STEP, requireMarketProfile } from '../../../../utils/marketAccess'

/**
 * DIE WÄHLBAREN EINTRÄGE EINER QUELLE (Plan §7.2 Nr. 2–4, MV1 M4).
 *
 * Der Quellen-Wähler auf der Seite „Markt" hat vier Quellen. Eine davon
 * braucht keine Liste (`website` — dort tippt der Kunde eine Adresse), die
 * drei anderen schon:
 *
 *  · `foundation` — die eigenen Brandings des Kontos. Der Relaunch-Fall.
 *  · `library`    — die handgeprüfte Bibliothek aus dem Repo (seit M6b echte
 *                   Marken: `the-barn`, `apple`).
 *  · `shared`     — die freigegebenen Marken FREMDER Konten (Opt-in, §7.2
 *                   Nr. 4), Name-Präfix-Suche über `q`.
 *
 * ── DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF ────────────────────────
 *
 * 1. **`shared` gibt NIE eine `ownerId` heraus.** Zurück gehen Id, Name und
 *    das Kategorie-Feld — mehr braucht eine Auswahlliste nicht, und mehr
 *    wäre eine Auskunft über einen Menschen, der nur seiner MARKE eine
 *    Freigabe erteilt hat.
 * 2. **Die eigenen Brandings erscheinen NICHT unter `shared`.** Sie haben
 *    ihre eigene Quelle; zweimal derselbe Eintrag in zwei Quellen wäre eine
 *    Frage, die niemand beantworten kann. Der Filter sitzt im brand-Layer, wo
 *    die `ownerId` bleibt.
 * 3. **`shared` verlangt ein ABGENOMMENES Kapitel B** — dieselbe Bedingung
 *    wie die eigene Freischaltung (§2.4). Eine fremde Marke ohne eigene
 *    Behauptung lieferte ein leeres Marktprofil, und das sähe aus wie ein
 *    Fehler unseres Abrufs.
 *
 * ── OHNE FREISCHALTUNGS-SCHRANKE ─────────────────────────────────────────
 * Wie die Kandidatenliste: Kandidaten vorzubereiten, während man an Kapitel B
 * arbeitet, ist eine sinnvolle Reihenfolge (Kopf von `marketAccess.ts`).
 * Gesperrt ist der LAUF.
 */

const querySchema = z.object({
  source: z.enum(['foundation', 'library', 'shared']),
  /** Namens-Präfix; nur bei `library` und `shared` von Bedeutung. */
  q: z.string().trim().max(80).optional().default(''),
})

/**
 * Wie viele Einträge eine Auswahlliste höchstens zeigt. Zehn ist die Zahl aus
 * dem Auftrag und zugleich die, ab der eine Liste zu einer Suche wird — das
 * Suchfeld steht deshalb im Wähler und nicht als „mehr laden".
 */
const OPTIONS_LIMIT = 10

export default defineEventHandler(async (event): Promise<MarketCandidateOptionsResponse> => {
  const { userId, profileId } = await requireMarketProfile(event)

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ status: 400, statusText: 'Invalid source' })
  const { source, q } = parsed.data
  const prefix = q.toLowerCase()

  if (source === 'foundation') {
    // Das AKTUELLE Branding gehört nicht in die Liste: es mit sich selbst zu
    // vergleichen ergäbe zehn Zeilen „gleich".
    const own = (await listBrandProfilesForOwner(event, userId))
      .filter(entry => entry.id !== profileId && entry.title.trim())
      .filter(entry => !prefix || entry.title.toLowerCase().startsWith(prefix))
      .slice(0, OPTIONS_LIMIT)
    return {
      source,
      options: own.map((entry): MarketSourceOption => ({
        id: entry.id,
        label: entry.title,
        ...(entry.industry ? { hint: entry.industry } : {}),
      })),
    }
  }

  if (source === 'library') {
    // WORTNAME UND KATEGORIE — mehr nicht (Plan §7.2 Nr. 3, Anhang G a).
    //
    // Seit M6b stehen hier ECHTE Marken. Was von ihnen sichtbar wird, ist
    // deshalb eine rechtliche Entscheidung und keine Gestaltungsfrage: der
    // NAME, wie die Marke ihn selbst schreibt, und die grobe Einordnung, die
    // das Paar erklärt („Kaffeerösterei"). KEIN Logo, KEINE Bildmarke, KEIN
    // Favicon — auch nicht über einen Umweg wie einen Favicon-Dienst, dem man
    // die `homepage` hinreicht. `hint` ist dasselbe Feld, in dem die anderen
    // beiden Quellen ihre Branche zeigen; der Wähler rendert daraus zwei
    // Textzeilen und sonst nichts.
    //
    // DAZU SEIT 2026-09-06 DAS PRÜFDATUM UND SEIN ALTER (`stale`). Die Zeile
    // baut `marketLibrarySourceOption()` — eine pure Funktion neben der
    // Bibliothek, damit sie ohne Nitro-Kontext prüfbar ist. Die UHR liest
    // ausdrücklich DIESE Stelle: die Regel selbst kennt kein „heute".
    const now = new Date()
    const entries = marketLibraryEntries()
      .filter(entry => !prefix || entry.name.toLowerCase().startsWith(prefix))
      .slice(0, OPTIONS_LIMIT)
    return {
      source,
      options: entries.map((entry): MarketSourceOption => marketLibrarySourceOption(entry, now)),
    }
  }

  const shared = await listSharedMarketProfiles(event, {
    requiredStepKey: MARKET_UNLOCK_STEP,
    prefix: q,
    limit: OPTIONS_LIMIT,
    excludeOwnerId: userId,
  })
  return {
    source,
    options: shared.map((entry): MarketSourceOption => ({
      id: entry.id,
      label: entry.title,
      ...(entry.industry ? { hint: entry.industry } : {}),
    })),
  }
})
