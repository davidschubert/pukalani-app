import { z } from 'zod'
import type { InsightsTopicKey } from './insightsPost'
import { INSIGHTS_TOPIC_KEYS } from './insightsPost'
import { insightsUploadsPlaylistId } from './insightsRadar'

/**
 * EIN KURATIERTER KANAL DES THEMENRADARS (BI2 K3, Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §1).
 *
 * ── WARUM DIESE DATEI ÜBERHAUPT ENTSTEHT ────────────────────────────────
 * Bis BI2 stand die Kanalliste in `apps/branding/app/app.config.ts`, und der
 * Kopf von `insightsRadar.ts` begründete das ausführlich: die Liste ändere
 * sich seltener als ein Deploy, und „warum ist dieser Kanal drin?" beantworte
 * ein Kommentar neben der Zeile. Die Begründung war nicht falsch, sie rechnete
 * nur mit einer Annahme, die der Betrieb widerlegt hat — die Liste änderte
 * sich an zwei Tagen DREIMAL (Pentagram war ein Privatkonto, Ogilvy und
 * Marketing Examples luden seit Jahren nichts mehr hoch). Davids Entscheidung
 * vom 2026-09-09: die Liste zieht in eine Tabelle, und der Betreiber pflegt
 * sie selbst. Was der Code-Kommentar leistete, leistet jetzt das Feld `note`.
 *
 * ── EIN KANAL IST ERST GEPRÜFT, WENN TITEL UND UPLOAD PASSEN ────────────
 * Die teuerste Lehre aus I4 steht hier als MECHANIK und nicht als Merksatz:
 * `@PentagramDesign` ist eine echte Kanal-Id mit einem echten Kanal dahinter
 * — nur gehört der einem Privatkonto mit einem Dublin-Video von 2012. Wer
 * einen Kanal anlegt, bekommt deshalb VOR dem Speichern Titel, Abonnentenzahl
 * und das Datum des jüngsten Uploads zu sehen und bestätigt DIESEN Kanal
 * (`InsightsChannelPreview`). Die Vorschau kostet zwei Quota-Einheiten; ein
 * falscher Kanal in der Liste kostet jeden Tag einen Lauf.
 *
 * ── AUSSCHALTEN STATT LÖSCHEN ───────────────────────────────────────────
 * Ein Kanal, der nichts mehr liefert, bekommt `active: false` und BLEIBT mit
 * seiner Notiz stehen. Löschen wäre der sichere Weg, denselben Irrtum in einem
 * halben Jahr ein zweites Mal zu machen: ohne die Zeile fehlt auch der Satz,
 * warum er damals raus ist. Gelöscht wird nur, was nie hingehörte.
 */

// ── Der Vertrag ────────────────────────────────────────────────────────────

export interface InsightsChannel {
  /** Die Kanal-Id (`UC…`, 24 Zeichen) — die fachliche Identität der Zeile. */
  channelId: string
  /** Das Cluster, für das dieser Kanal steht (der Grundwert der Einordnung). */
  topic: InsightsTopicKey
  /**
   * Der Name, wie ihn `channels.list` zuletzt geliefert hat. NICHT von Hand
   * gepflegt: ein getippter Name wird still falsch, sobald der Kanal sich
   * umbenennt, und ein veralteter Name in einer Redaktions-Ansicht ist
   * schlimmer als gar keiner.
   */
  title: string
  /**
   * Das Handle (`@thefutur`) — das, was ein Mensch in der Hand hat. Die API
   * will die Id, der Betreiber kennt das Handle; beides steht an der Zeile,
   * damit niemand das eine aus dem anderen suchen muss.
   */
  handle: string
  /** Abonnenten beim letzten Abruf — der Nenner der Popularität. */
  subscribers: number
  /** Läuft dieser Kanal im täglichen Lauf mit? */
  active: boolean
  /** Warum ist der drin (oder warum ist er aus)? Ersetzt den Code-Kommentar. */
  note: string
  /** Der jüngste Upload beim letzten Abruf (`YYYY-MM-DD`) — leer = unbekannt. */
  lastUploadAt: string
  /** Wann zuletzt gegen die API geprüft (ISO) — leer = noch nie. */
  checkedAt: string
}

/** Was eine Vorschau über einen Kanal sagt, BEVOR er gespeichert wird. */
export interface InsightsChannelPreview {
  channelId: string
  title: string
  handle: string
  subscribers: number
  /** `YYYY-MM-DD` oder leer, wenn der Kanal nie etwas hochgeladen hat. */
  lastUploadAt: string
  /** Steht er schon in der Liste? Dann ist „Anlegen" ein Irrtum, kein Fehler. */
  known: boolean
}

// ── Deckel ─────────────────────────────────────────────────────────────────

/**
 * Wie viele Kanäle die Liste höchstens trägt.
 *
 * Nicht gegen Missbrauch (dahinter sitzt der Betreiber), sondern gegen das
 * QUOTA: der Lauf kostet rund `2 + 2 × Kanäle` Einheiten von 10.000 am Tag,
 * und `insightsRadarQuotaEstimate` bricht ohnehin bei der Hälfte ab. 50 ist
 * genau die Zahl, die §9.6 Leitplanke (c) als „mit grossem Abstand tragbar"
 * nennt — und eine Liste, die länger ist, liest ohnehin niemand mehr durch.
 */
export const INSIGHTS_CHANNELS_MAX = 50

/** Wie lang eine Notiz sein darf — ein Satz, kein Protokoll. */
export const INSIGHTS_CHANNEL_NOTE_MAX = 400

/** Wie viele Vorschauen ein Konto je Stunde ziehen darf (Quota-Schutz). */
export const INSIGHTS_CHANNEL_PREVIEW_LIMIT = 30
export const INSIGHTS_CHANNEL_PREVIEW_WINDOW_MS = 60 * 60_000

/** Der Eimer EINES Kontos für die Vorschau. */
export function insightsChannelPreviewKey(userId: string): string {
  return `insights-channel-preview:${userId}`
}

// ── Ablehnungsgründe, die als `data.code` reisen ───────────────────────────

export const INSIGHTS_CHANNEL_CODES = {
  /** Die Eingabe ist weder Id noch Handle noch eine Adresse, die wir lesen. */
  unreadable: 'channel_unreadable',
  /** Die API kennt diesen Kanal nicht. */
  notFound: 'channel_not_found',
  /** Steht schon in der Liste. */
  duplicate: 'channel_duplicate',
  /** Die Liste ist voll. */
  tooMany: 'channel_limit',
  /** Kein API-Schlüssel — ohne ihn gibt es keine Vorschau. */
  notConfigured: 'not_configured',
  /** Zu viele Vorschauen in dieser Stunde. */
  rateLimited: 'rate_limited',
} as const

// ── Die Eingabe eines Menschen lesen ───────────────────────────────────────

/**
 * WAS DER BETREIBER EINTIPPT, UND WAS DIE API DARAUS BRAUCHT.
 *
 * Erlaubt ist alles, was man aus einem Browser kopiert: die Kanal-Id, das
 * Handle mit oder ohne `@`, und jede YouTube-Adresse, die eines von beiden
 * enthält. `channels.list` kann beides nachschlagen (`id` bzw. `forHandle`),
 * also muss der Mensch nicht wissen, welches er gerade hat.
 *
 * ── WAS BEWUSST NICHT GEHT: /c/ UND /user/ ──────────────────────────────
 * Die alten Adressformen (`youtube.com/c/Name`, `youtube.com/user/Name`)
 * lassen sich seit der Handle-Umstellung NICHT mehr verlässlich auflösen —
 * `forUsername` trifft nur Konten, die vor 2012 angelegt wurden, und `/c/`
 * hat gar keinen Endpunkt. Sie hier „irgendwie" zu probieren hiesse, dem
 * Betreiber bei jedem zweiten Versuch ein unerklärliches Nichts zu zeigen.
 * Stattdessen fallen sie klar durch, und die Oberfläche sagt, was zu tun ist:
 * die Kanalseite öffnen und das Handle oder die Id kopieren.
 */
export type InsightsChannelLookup =
  | { kind: 'id', channelId: string }
  | { kind: 'handle', handle: string }

/** Ein Handle besteht aus 3–30 Zeichen: Buchstaben, Ziffern, Punkt, Strich, Unterstrich. */
const HANDLE_RE = /^[A-Za-z0-9._-]{3,30}$/

export function insightsChannelLookup(input: string): InsightsChannelLookup | null {
  const raw = input.trim()
  if (!raw) return null

  // 1. Eine nackte Kanal-Id. `insightsUploadsPlaylistId` ist der EINE Prüfer
  //    dafür (er beantwortet dieselbe Frage für den Sweep) — eine zweite
  //    Regexp hier wäre eine zweite Wahrheit über dasselbe Format.
  if (insightsUploadsPlaylistId(raw)) return { kind: 'id', channelId: raw }

  // 2. Ein nacktes Handle, mit oder ohne `@`.
  //
  // DIE EINE AUSNAHME: eine PLAYLIST-Id. `UU-b3c7kxa5vU-bnmaROgvog` (die
  // Uploads-Playlist desselben Kanals) und jedes `PL…` passen auf die
  // Handle-Form — Buchstaben, Ziffern, Strich, 24 Zeichen. Ohne diesen Riegel
  // ginge eine aus der Adresszeile kopierte Playlist als Handle an die API und
  // käme als „diesen Kanal gibt es nicht" zurück: eine wahre Aussage über die
  // falsche Frage, und eine Quota-Einheit für nichts. Die Formen stehen hier,
  // weil genau sie beim Kopieren danebengreifen.
  const bare = raw.startsWith('@') ? raw.slice(1) : raw
  const looksLikeList = bare.length === 24 && (bare.startsWith('UU') || bare.startsWith('PL'))
  if (!raw.includes('/') && !looksLikeList && HANDLE_RE.test(bare)) return { kind: 'handle', handle: bare }

  // 3. Eine Adresse. Nur der PFAD zählt; Query und Fragment werfen wir weg
  //    (ein kopiertes `?si=…` soll nicht das Handle verfälschen).
  const path = extractYoutubePath(raw)
  if (!path) return null

  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return null

  if (segments[0] === 'channel' && segments[1]) {
    return insightsUploadsPlaylistId(segments[1]) ? { kind: 'id', channelId: segments[1] } : null
  }
  if (segments[0]!.startsWith('@')) {
    const handle = segments[0]!.slice(1)
    return HANDLE_RE.test(handle) ? { kind: 'handle', handle } : null
  }

  // `/c/…` und `/user/…` fallen hier bewusst durch (s. Kopf).
  return null
}

/** Den Pfad aus einer YouTube-Adresse ziehen — oder `null`, wenn es keine ist. */
function extractYoutubePath(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  }
  catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
  if (host !== 'youtube.com' && host !== 'youtu.be') return null
  return url.pathname
}

// ── Die Formulare ──────────────────────────────────────────────────────────

const topicSchema = z.enum(INSIGHTS_TOPIC_KEYS as [InsightsTopicKey, ...InsightsTopicKey[]])

/**
 * ANLEGEN — die Id kommt aus der VORSCHAU, nicht aus dem Eingabefeld.
 *
 * Das ist der Grund, warum hier `channelId` steht und nicht die rohe Eingabe:
 * gespeichert wird nur, was der Mensch GESEHEN hat. Eine Route, die selbst
 * noch einmal auflöste, könnte einen anderen Kanal treffen als den, der in der
 * Vorschau stand (Handle umgezogen, Tippfehler korrigiert) — und genau das
 * soll die Vorschau ausschliessen.
 */
export const insightsChannelCreateSchema = z.object({
  channelId: z.string().trim().refine(value => Boolean(insightsUploadsPlaylistId(value)), 'keine Kanal-Id'),
  topic: topicSchema,
  note: z.string().trim().max(INSIGHTS_CHANNEL_NOTE_MAX).default(''),
})
export type InsightsChannelCreateInput = z.infer<typeof insightsChannelCreateSchema>

/**
 * ÄNDERN — nur die drei Felder, die einem MENSCHEN gehören.
 *
 * Titel, Handle, Abonnenten, jüngster Upload und Prüfzeitpunkt stehen
 * absichtlich NICHT drin: die holt der Lauf (oder die Vorschau) von der API,
 * und ein von Hand überschriebener Kanalname wäre eine Angabe, die niemand
 * mehr nachprüfen kann. Die Kanal-Id fehlt ebenfalls — sie ist die Identität
 * der Zeile; ein anderer Kanal ist eine andere Zeile.
 */
export const insightsChannelPatchSchema = z.object({
  topic: topicSchema.optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(INSIGHTS_CHANNEL_NOTE_MAX).optional(),
}).refine(
  body => body.topic !== undefined || body.active !== undefined || body.note !== undefined,
  'nichts zu ändern',
)
export type InsightsChannelPatchInput = z.infer<typeof insightsChannelPatchSchema>

/** Die Eingabe der Vorschau — roh, wie getippt. */
export const insightsChannelResolveSchema = z.object({
  input: z.string().trim().min(1).max(300),
})
