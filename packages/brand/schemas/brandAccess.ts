import { z } from 'zod'
import { isBrandIndustryValue } from '../shared/brandIndustries'

/**
 * DIE ÖFFENTLICHEN RÜMPFE: Einladungs-Code, Veröffentlichung, Widerruf,
 * Verlaufs-Abruf.
 *
 * ── WARUM DER CODE HIER NUR EINE LÄNGE HAT ────────────────────────────────
 * Format und Bedeutung eines Codes gehören dem Layer, nicht dem Schema: geprüft
 * wird er über seinen sha256-Hash gegen `brand_invites`. Ein Muster-Regex wäre
 * ein ORAKEL — ein Angreifer erführe an der Fehlermeldung, wie ein echter Code
 * AUSSIEHT, noch bevor er einen einzigen probiert hat. Deshalb: nur eine obere
 * Schranke gegen Speicher-Unfug, alles andere entscheidet der Hash-Vergleich,
 * und der antwortet in jedem Fall gleich.
 *
 * ── DER SHARE-TOKEN TAUCHT HIER NICHT AUF ─────────────────────────────────
 * Er steht im PFAD (`/api/brand/share/:token`), nicht im Rumpf, und wird dort
 * gegen seinen Hash geprüft. Ein Token in einem Rumpf wäre bequemer zu
 * validieren und schlechter zu benutzen: geteilt wird ein LINK.
 */

/** Grosszügig, aber endlich — der Wert ist Hash-Eingabe, keine Anzeige. */
export const BRAND_INVITE_CODE_MAX = 256

export function createBrandInviteCodeSchema() {
  return z.object({
    code: z.string().trim().min(1).max(BRAND_INVITE_CODE_MAX),
  }).strict()
}

/**
 * Veröffentlichen. Bewusst OHNE Inhaltsfelder: WAS im Snapshot landet,
 * entscheidet der Server aus den BESTÄTIGTEN Slots (Audit 3) — käme es aus dem
 * Rumpf, könnte ein Aufrufer Entwürfe oder fremden Text veröffentlichen.
 */
export function createBrandSharePublishSchema() {
  return z.object({}).strict()
}

/**
 * IN DIE ÖFFENTLICHE GALERIE EINREICHEN (docs/plans/DISCOVER-BRANDS.md §4.3).
 *
 * ── DAS HÄKCHEN MUSS AM SERVER ANKOMMEN ───────────────────────────────────
 * „Ich darf diese Marke veröffentlichen und weiss, dass sie nach Freigabe
 * öffentlich und indexierbar ist" ist eine RECHTLICH gemeinte Zustimmung (§3.5:
 * eigene Kunden-Inhalte mit ausdrücklicher Zustimmung). Ein Häkchen, das nur
 * einen Knopf entgrauen würde, wäre Zierde — die Zustimmung muss Teil der
 * Anfrage sein, sonst gibt es sie nicht. `literal(true)`: ein `false` ist keine
 * Zustimmung und deshalb kein gültiger Rumpf.
 *
 * WIE beim Teilen KEINE Inhaltsfelder: WAS veröffentlicht wird, entscheidet
 * der Server aus den bestätigten Slots (Audit 3).
 */
export function createBrandPublicationSubmitSchema() {
  return z.object({
    consent: z.literal(true),
    // Die Branche für Galerie-Facette und Steckbrief — eine Katalog-Id aus
    // `BRAND_INDUSTRIES` (Nachzug 2026-09-08: der Freitext der Startkarte trifft
    // den Katalog selten, „Nicht zugeordnet" wäre die Regel). Fehlt sie, gilt
    // die Normalisierung des Freitexts wie bisher.
    industry: z.string().trim().min(1).max(40).refine(isBrandIndustryValue).optional(),
  }).strict()
}

/**
 * Widerruf. Ohne `shareId` werden ALLE aktiven Veröffentlichungen des Profils
 * widerrufen — das ist der Knopf „Link deaktivieren", und er soll nicht die
 * Hälfte stehen lassen, wenn zwischendurch rotiert wurde.
 */
export function createBrandShareRevokeSchema() {
  return z.object({
    profileId: z.string().min(1).max(64),
    shareId: z.string().min(1).max(64).optional(),
  }).strict()
}

export const BRAND_MESSAGES_LIMIT_DEFAULT = 50
export const BRAND_MESSAGES_LIMIT_MAX = 100

/** Query-Parameter des Verlaufs (cursor-paginiert über `$id`). */
export function createBrandMessagesQuerySchema() {
  return z.object({
    stepKey: z.string().max(32).optional(),
    /**
     * DER VERLAUF EINER SESSION (brand-011, BW2 §6) — ohne ihn kommt wie
     * bisher das GANZE Kapitel. Zwei Fragen, ein Endpunkt: die Werkstatt zeigt
     * den Faden einer Session, der Wiedereinstieg zeigt das Kapitel.
     */
    session: z.string().max(32).optional(),
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(BRAND_MESSAGES_LIMIT_MAX)
      .default(BRAND_MESSAGES_LIMIT_DEFAULT),
  }).strict()
}
