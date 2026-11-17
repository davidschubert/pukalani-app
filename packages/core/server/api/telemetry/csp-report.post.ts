import { CSP_REPORT_MAX_BYTES, cspViolationKey, readCspReports } from '../../../shared/cspReport'
import { CSP_REPORT_CAP_MAX, takeCspReportSlot } from '../../utils/cspReportCap'

/**
 * POST /api/telemetry/csp-report — Annahme für die Berichte der Skript-Regel
 * (SE1 a, 2026-11-17).
 *
 * Die Regel beobachtet nur (`Content-Security-Policy-Report-Only`); ihre
 * Kopfzeile nennt diese Adresse (`report-uri`). Der Browser schickt den
 * Bericht selbst, ohne Zutun der Seite — angemeldet oder nicht.
 *
 * BEWUSST EIN EIGENER EINGANG, nicht `telemetry/error`: dort zählt jede
 * Meldung als Fehler der App. Ein Bericht hier ist erst einmal eine
 * Beobachtung, und die meisten stammen von Browser-Erweiterungen.
 *
 * VIER BREMSEN, in dieser Reihenfolge:
 *  1. je Anschluss 30 in der Minute (`05.rate-limit.ts`),
 *  2. die GRÖSSE: angegebene Länge vor dem Einlesen, echte Länge danach,
 *  3. die FORM: nur die zwei Rümpfe, die ein Browser schickt
 *     (`shared/cspReport.ts`); Erweiterungen und fremde Seiten fallen dort
 *     heraus,
 *  4. die MENGE: je Stunde jeder Verstoß einmal und höchstens 40 verschiedene
 *     (`utils/cspReportCap.ts`).
 *
 * GESCHRIEBEN wird je Verstoß eine Zeile `csp.report` mit vier kurzen
 * Wörtern — keine Adresse des Aufrufers, kein Konto, keine volle Seiten-
 * Adresse. Das Zähl-Skript (`ops/app-watch-counts.mjs`) zählt die Zeilen,
 * der tägliche Blick berichtet die Zahl je App.
 *
 * Die Antwort ist IMMER leer (204), auch für Aussortiertes und Gedeckeltes:
 * der Browser liest sie nicht, und ein Fremder soll an ihr nichts ablesen.
 */
export default defineEventHandler(async (event) => {
  const declared = getRequestHeader(event, 'content-length')
  if (!declared || !/^\d+$/.test(declared.trim()) || Number(declared) > CSP_REPORT_MAX_BYTES) {
    // Ohne Längenangabe (gestückelt gesendet) liest die Route nichts ein —
    // jeder Browser nennt die Länge seines Berichts.
    throw createError({ status: 413, statusText: 'Report too large' })
  }

  const raw = await readRawBody(event, 'utf8')
  if (!raw || Buffer.byteLength(raw, 'utf8') > CSP_REPORT_MAX_BYTES) {
    throw createError({ status: 400, statusText: 'Invalid report' })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid report' })
  }

  const batch = readCspReports(getRequestHeader(event, 'content-type'), body, getRequestURL(event).host)
  if (!batch) throw createError({ status: 400, statusText: 'Invalid report' })

  for (const violation of batch.violations) {
    const slot = takeCspReportSlot(cspViolationKey(violation))
    if (slot === 'accept') logEvent('warn', 'csp.report', { ...violation })
    else if (slot === 'cap') logEvent('warn', 'csp.report_capped', { max: CSP_REPORT_CAP_MAX })
  }

  setResponseStatus(event, 204)
  return null
})
