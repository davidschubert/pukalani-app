import type { Models } from 'node-appwrite'
import { normalizeBrandAdmissionMode } from '../../../shared/brandAccess'
import { brandSignupOpen } from '../../../shared/brandAdmissionView'
import type { BrandAdmissionResponse } from '../../../shared/types/brand'

/**
 * „IST DIE ANMELDUNG OFFEN?" — die Auskunft für Startseite, Einladungs-Seite
 * und Produktseiten (Davids Entscheidung 2026-11-12: offene Beta).
 *
 * ── ÖFFENTLICH, UND DAS IST IN ORDNUNG ────────────────────────────────────
 * Sie sagt, was ein Gast ohnehin sieht, sobald er auf „Konto anlegen" drückt.
 * Kein Konto, keine Marke, keine Zahl. Die Zeile `app_config/global`, aus der
 * sie liest, ist für Realtime ohnehin lesbar; hier kommen nur zwei ihrer
 * Felder zurück, und nur als fertige Antwort.
 *
 * ── SIE ENTSCHEIDET NICHTS ────────────────────────────────────────────────
 * Die Grenze bleibt `requireBrandAccess` auf jeder privaten Route. Diese Route
 * lenkt nur Knöpfe und Texte; eine falsche Antwort hier führte einen Gast auf
 * die falsche Seite, nie in eine fremde Marke.
 *
 * ── FAIL-CLOSED ───────────────────────────────────────────────────────────
 * Fehlende Zeile, fehlende Spalte oder Lesefehler ⇒ „nicht offen". Dann zeigt
 * die Site den Weg über die Einladung, und der funktioniert in jedem Modus.
 * Ein Fehler wird NICHT zwischengespeichert: die nächste Anfrage fragt neu.
 *
 * ── EINE MINUTE ZWISCHENSPEICHER ──────────────────────────────────────────
 * Die Startseite ruft sie bei jedem Aufbau. Die Antwort hängt an keinem Konto
 * und an keinem Mandanten (Silo), ein Schlüssel genügt.
 */
const TTL_MS = 60_000
const CACHE_KEY = 'global'
const cache = createMicrocache<BrandAdmissionResponse>(TTL_MS)

type AdmissionRow = Models.Row & { brandAdmissionMode?: unknown, registrationEnabled?: unknown }

export default defineEventHandler(async (event): Promise<BrandAdmissionResponse> => {
  const hit = cache.get(CACHE_KEY)
  if (hit) return hit

  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<AdmissionRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    const mode = normalizeBrandAdmissionMode(row.brandAdmissionMode)
    const response: BrandAdmissionResponse = {
      mode,
      signupOpen: brandSignupOpen({ mode, registrationEnabled: row.registrationEnabled === true }),
    }
    cache.set(CACHE_KEY, response)
    return response
  }
  catch (error) {
    logEvent('warn', 'brand.admission_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return { mode: 'closed', signupOpen: false }
  }
})
