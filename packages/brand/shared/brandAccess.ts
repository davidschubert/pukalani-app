/**
 * WER DARF IN DEN BRAND-WIZARD? — die PURE Entscheidung (Plan §6 „Zugang",
 * Schema-Anhang §5/§8). Kein Appwrite, kein H3: dieselbe Regel gilt für das
 * Server-Gate (`server/utils/brandAccess.ts`) und für jede spätere UI-Anzeige,
 * und sie ist ohne laufende Instanz prüfbar.
 *
 * Vier Tatsachen gehen hinein — Aufnahme-Modus der Instanz
 * (`app_config.brandAdmissionMode`), Session, E-Mail-Verifizierung und die
 * `brand_access`-Zeile des Kontos — und genau eine Antwort kommt heraus.
 *
 * DREI MODI, ZWEI FRAGEN (Plan §3e „Beta-Zugang operativ" — die P1a-Fassung
 * kannte nur closed|open, das war eine Verkürzung):
 *
 *   'closed'  keine NEUEN Zugänge; bestehende `brand_access`-Zeilen bleiben
 *             gültig (ein Stopp ist keine Enteignung der Beta-Tester).
 *   'invite'  neue Zugänge nur per Einladung.
 *   'open'    jedes eingeloggte, verifizierte Konto darf.
 *
 * Im GATE verhalten sich 'closed' und 'invite' IDENTISCH — beide verlangen
 * eine nicht-widerrufene Zeile. Der Unterschied liegt in der EINLÖSUNG
 * (`admissionAllowsRedeem`): nur 'invite' verwandelt einen gültigen Code in
 * eine neue Zeile; bei 'open' braucht niemand einzulösen, bei 'closed' wird
 * abgelehnt. Zwei Funktionen statt einer, weil es zwei verschiedene Fragen
 * sind — „darf dieses Konto arbeiten?" und „darf ein Code jetzt Zugang
 * schaffen?"; eine gemeinsame Antwort müsste eine davon verfälschen.
 *
 * DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF:
 *
 * 1. **Die Konto-Pflicht gilt in ALLEN Modi.** 'open' öffnet die Beta für
 *    jedes eingeloggte, verifizierte Konto — es ist kein Anonym-Start (Plan
 *    §6: „KEIN Anonym-Start (gestrichen)"). Ohne Session gibt es deshalb nie
 *    ein Ja, auch nicht bei 'open'.
 * 2. **Ein Entzug schlägt die Öffnung.** `revokedAt` ist eine ausdrückliche
 *    Betreiber-Handlung gegen GENAU DIESES Konto; ein späteres Öffnen der Beta
 *    ist eine allgemeine Einstellung. Würde 'open' den Entzug überstimmen,
 *    käme ein hinausgeworfenes Konto durch die Öffnung stillschweigend zurück
 *    — und der Betreiber erführe es nicht.
 * 3. **Der GRUND bleibt hier drinnen.** Nach außen antwortet die Route 404
 *    (Datentür-Muster) — die Beta soll nicht enumerierbar sein. `reason` ist
 *    für Log und Test, nie für den Client.
 */

/** Aufnahme-Modus der Instanz (`app_config.brandAdmissionMode`, system-038). */
export const BRAND_ADMISSION_MODES = ['closed', 'invite', 'open'] as const
export type BrandAdmissionMode = (typeof BRAND_ADMISSION_MODES)[number]

/** Warum abgelehnt wurde. Bleibt intern (Log/Test) — der Client sieht 404. */
export type BrandAccessDenialReason = 'no_session' | 'not_verified' | 'revoked' | 'no_access'

/**
 * Die einzigen Felder der `brand_access`-Zeile, die für die Entscheidung
 * zählen. Bewusst schmal: `grantedVia`/`inviteId` sind Herkunft, kein Recht.
 */
export interface BrandAccessRowFacts {
  /** Gesetzt = Zugang entzogen. Wirkt sofort, weil die Tabellen server-only sind. */
  revokedAt?: string | null
}

export interface BrandAccessInput {
  admissionMode: BrandAdmissionMode
  /** Appwrite-User-Id der Session; `null` = kein Login. */
  userId: string | null
  emailVerified: boolean
  /** `null` = keine Zeile (der Normalfall ausserhalb der Beta). */
  accessRow: BrandAccessRowFacts | null
}

export interface BrandAccessDecision {
  allowed: boolean
  reason: BrandAccessDenialReason | null
}

/**
 * Fehlende/unbekannte Spaltenwerte fallen auf 'closed' zurück — ein Deploy VOR
 * der Migration system-038 liest `undefined`, und der geschlossene Zustand ist
 * der sichere (fail-closed).
 */
export function normalizeBrandAdmissionMode(value: unknown): BrandAdmissionMode {
  if (value === 'open') return 'open'
  if (value === 'invite') return 'invite'
  return 'closed'
}

/**
 * DARF EIN GÜLTIGER EINLADUNGSCODE JETZT ZUGANG SCHAFFEN? — die zweite Frage
 * des Modus, getrennt von `decideBrandAccess` (s. Kopf).
 *
 * Nur 'invite' sagt Ja. 'closed' lehnt ab (das ist die Bedeutung von „keine
 * NEUEN Zugänge"; ein liegengebliebener Code darf einen Stopp nicht
 * unterlaufen), und 'open' braucht die Einlösung gar nicht — dort hat jedes
 * verifizierte Konto ohnehin Zugang, eine zusätzliche `brand_access`-Zeile
 * wäre nur Rauschen mit einem `revokedAt`-Feld, das später niemand erwartet.
 * Die Einlöse-Route antwortet in beiden Fällen mit DERSELBEN neutralen
 * Ablehnung wie bei einem falschen Code (keine Enumeration, Schema-Anhang §5).
 */
export function admissionAllowsRedeem(mode: BrandAdmissionMode): boolean {
  return mode === 'invite'
}

/**
 * IST DIESES KONTO EIN BETA-KONTO? — die EINE Fassung dieser Frage.
 *
 * Sie steht neben `decideBrandAccess` und nicht darin, weil es eine ANDERE
 * Frage ist: „darf dieses Konto arbeiten?" beantwortet auch der Modus 'open'
 * mit Ja (jedes verifizierte Konto darf, ohne Zeile) — „ist es ein Beta-Konto?"
 * nicht. Die Zusage aus BS1 §9 Entscheidung 6 („Beta-Konten dauerhaft frei")
 * hängt ausdrücklich an der ZEILE: „Gilt je KONTO (`brand_access` /
 * Beta-Zulassung)". Ein offener Aufnahme-Modus verschenkt also nicht die
 * Ableitung an jeden Vorbeikommenden — er öffnet nur den Wizard.
 *
 * Ein Entzug schlägt auch hier alles (Regel 2 im Kopf): `revokedAt` gesetzt ⇒
 * kein Beta-Konto, und die Freischaltung der Ableitung fällt mit ihm weg,
 * sofern sie nicht als FELD an der Marke steht (§2.8: das Feld ist der Weg,
 * eine Zusage haltbar zu machen).
 *
 * Gelesen wird sie an ZWEI Datenwegen — im Zugangs-Gate jedes Requests
 * (`requireBrandAccess`) und gebündelt für die Betreiber-Liste
 * (`loadBrandBetaAccounts`). Beide fragen DIESE Funktion; die Regel steht
 * einmal, die Abfrage zweimal (die zweite ist ein anderer Zuschnitt derselben
 * Tabelle, kein zweiter Begriff von „Beta").
 */
export function brandAccountIsBeta(row: BrandAccessRowFacts | null | undefined): boolean {
  return !!row && !row.revokedAt
}

export function decideBrandAccess(input: BrandAccessInput): BrandAccessDecision {
  if (!input.userId) return { allowed: false, reason: 'no_session' }
  if (!input.emailVerified) return { allowed: false, reason: 'not_verified' }
  // Regel 2: der Entzug steht VOR der Modus-Frage.
  if (input.accessRow?.revokedAt) return { allowed: false, reason: 'revoked' }
  if (input.admissionMode === 'open') return { allowed: true, reason: null }
  // 'closed' UND 'invite' landen hier: beide verlangen eine Zeile. Der
  // Unterschied ist, ob eine NEUE entstehen darf — das entscheidet
  // `admissionAllowsRedeem`, nicht dieses Gate. Wer schon drin ist, bleibt
  // drin, wenn der Betreiber die Beta auf 'closed' stellt.
  if (input.accessRow) return { allowed: true, reason: null }
  return { allowed: false, reason: 'no_access' }
}
