/**
 * DER NUTZUNGSVORBEHALT BEIDER AUSSEN-ABRUFE — Marktvergleich UND Brand-Check
 * (§ 44b UrhG / DSM Art. 4; Plan §2.9 Nr. 1, BS1 R2b).
 *
 * ── WARUM ER SEIT R2b IM brand-LAYER LIEGT ────────────────────────────────
 * Dieselbe Bewegung wie beim Robots-Parser nebenan: gebaut für den
 * Marktvergleich, gelegen in `packages/market/shared/marketCrawlRules.ts` — und
 * seit R2b (Davids Entscheidung 2026-09-08) prüft ihn auch der EINSEITEN-Abruf
 * des Brand-Checks. `brand` darf `market` nicht kennen (CONCEPT.md A14), eine
 * Kopie wären zwei Wahrheiten darüber, wessen Inhalt wir auswerten dürfen.
 * `market` importiert die Regel weiter unter ihrem alten Namen.
 *
 * ── ALLE VIER FORMEN ZÄHLEN GLEICH, UND ZWEIFEL HEISST VORBEHALT ──────────
 * Das BGH-Verfahren I ZR 281/25 (LG Hamburg 310 O 227/23, „LAION") ist offen,
 * und solange die Rechtslage nicht geklärt ist, ist ein nicht ausgewerteter
 * Wettbewerber ein Nachteil, ein zu Unrecht ausgewerteter ein Schaden.
 */

export interface BrandTdmSignals {
  /** Kopfzeilen der Antwort, kleingeschrieben. */
  readonly headers?: Readonly<Record<string, string>>
  /** Werte aus `<meta name="robots">` und Verwandten, klein. */
  readonly metaRobots?: readonly string[]
  /** Werte aus `<meta name="tdm-reservation">`. */
  readonly metaTdm?: readonly string[]
  /** Der Rohtext von `/.well-known/tdmrep.json`, falls es ihn gab. */
  readonly tdmrepJson?: string
  /** Der Pfad, um den es geht — `tdmrep.json` gilt je Pfad-Muster. */
  readonly path?: string
}

/** Die Wörter, mit denen eine Seite die KI-Auswertung untersagt. */
const NOAI_TOKENS = new Set(['noai', 'noimageai', 'notrain', 'noml'])

/**
 * IST EIN VORBEHALT ERKLÄRT? Ein Satz Signale hinein, ja/nein heraus.
 *
 * `TDM-Reservation: 1` im Kopf, `tdm-reservation` als Meta, `noai`/`noimageai`
 * in den robots-Metas, und `tdmrep.json` mit `tdm-reservation: 1` für einen
 * passenden Pfad — plus die Fail-closed-Regel: eine VORHANDENE, aber nicht
 * lesbare `tdmrep.json` gilt als Vorbehalt.
 */
export function brandTdmReserved(signals: BrandTdmSignals): boolean {
  const header = signals.headers?.['tdm-reservation']?.trim()
  if (header && header !== '0') return true

  for (const value of signals.metaTdm ?? []) {
    const token = value.trim()
    if (token && token !== '0') return true
  }

  for (const value of signals.metaRobots ?? []) {
    if (NOAI_TOKENS.has(value.trim().toLowerCase())) return true
  }

  const raw = signals.tdmrepJson?.trim()
  if (raw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    }
    catch {
      // FAIL-CLOSED: die Datei liegt da, sie sagt etwas, und wir verstehen es
      // nicht. Das ist der Zweifelsfall aus §2.9 Nr. 1.
      return true
    }
    if (tdmrepReserves(parsed, signals.path ?? '/')) return true
  }

  return false
}

/**
 * `/.well-known/tdmrep.json` nach der TDMRep-Spezifikation: eine Liste von
 * Einträgen mit `location` (Pfad-Präfix, `*` erlaubt) und `tdm-reservation`.
 * Ohne `location` gilt der Eintrag für alles.
 */
function tdmrepReserves(parsed: unknown, path: string): boolean {
  const entries = Array.isArray(parsed) ? parsed : [parsed]
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const reservation = record['tdm-reservation']
    const reserved = reservation === 1 || reservation === '1' || reservation === true
    if (!reserved) continue
    const location = record.location
    if (typeof location !== 'string' || !location.trim()) return true
    const prefix = location.trim().replace(/\*+$/, '')
    if (!prefix || path.startsWith(prefix)) return true
  }
  return false
}
