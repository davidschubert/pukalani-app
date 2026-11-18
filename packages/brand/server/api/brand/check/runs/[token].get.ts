import { BRAND_RUN_SCOPES, parseBrandRunDetail, toBrandRunView } from '../../../../../shared/brandRun'
import type { BrandCheckRunStateResponse } from '../../../../../shared/types/brand'
import { brandCheckRunTokenMatches, brandCheckRunTokenRowId } from '../../../../utils/brandCheckRunToken'
import { readBrandRunRow } from '../../../../utils/brandRun'

/**
 * DER STAND EINES LAUFS DES ÖFFENTLICHEN BRAND-CHECKS (LL1 b, 2026-11-18).
 *
 * Der Start (`POST /api/brand/check`) antwortet `202` und rechnet hinter der
 * Antwort; die Seite fragt hier nach, bis der Lauf zu Ende ist. Am fertigen
 * Lauf steht die Id des Ergebnisses (`run.ref`), an einem gescheiterten der
 * kurze Grund (`run.failure`) — dieselben Wörter, die früher der Fehler-Code
 * der Anfrage waren.
 *
 * ── OHNE KONTO, ABER NICHT FÜR JEDEN ──────────────────────────────────────
 * Der Check läuft ohne Anmeldung, also gibt es hier keine Sitzung zu prüfen.
 * Der Zugang IST das Kennzeichen in der Adresse: nur der Starter hat es
 * bekommen (und ein zweiter Start desselben Besuchers für dieselbe Adresse),
 * erraten lässt es sich nicht (`brandCheckRunToken.ts`).
 *
 * ── EINE ABLEHNUNG FÜR ALLES ──────────────────────────────────────────────
 * Falsch geformt, unbekannt, verfälscht, eine Lauf-Zeile einer ANDEREN Art
 * (Entwürfe, Fundament-Check — die hängen an einer Marke und gehören nicht
 * hierher), nicht lesbar: immer dasselbe 404 `run_not_found`. Die Antwort
 * verrät nicht, ob es eine Zeile gibt. Ein falsch geformtes Kennzeichen wird
 * gar nicht erst nachgeschlagen.
 *
 * ── WAS HINAUSGEHT ────────────────────────────────────────────────────────
 * Nur der Stand (`BrandRunView`): Zustand, Zeitpunkte, Grund, Id des
 * Ergebnisses. Der Gegenstand der Sperre und der Zufallswert des Laufs
 * verlassen den Server nie. Die Id des Ergebnisses ist ohnehin die Adresse,
 * unter der es jeder mit dem Link lesen darf (`[id].get.ts`).
 *
 * ── NICHT GEBREMST, NICHT GEBUCHT ─────────────────────────────────────────
 * Eine lesende Abfrage einer einzelnen Zeile. Sie steht bewusst in keiner
 * Zeile der Bremsen-Liste: die Seite fragt alle fünf Sekunden, und die
 * Minuten-Bremse des Checks (3/min) darf das Nachfragen nicht mitzählen.
 */
export default defineEventHandler(async (event): Promise<BrandCheckRunStateResponse> => {
  const token = getRouterParam(event, 'token') ?? ''
  const rowId = brandCheckRunTokenRowId(token)
  if (!rowId) throw runNotFound()

  const row = await readBrandRunRow(event, rowId)
  if (!row || row.scope !== BRAND_RUN_SCOPES.check) throw runNotFound()
  if (!brandCheckRunTokenMatches(event, token, row.$id, parseBrandRunDetail(row.detail).key)) throw runNotFound()

  // Der Stand ändert sich alle paar Sekunden — nichts davon gehört in einen
  // Zwischenspeicher, weder im Browser noch davor.
  setHeader(event, 'Cache-Control', 'no-store')
  return { run: toBrandRunView(row, Date.now()) }
})

function runNotFound() {
  return createError({ status: 404, statusText: 'Not Found', data: { code: 'run_not_found' } })
}
