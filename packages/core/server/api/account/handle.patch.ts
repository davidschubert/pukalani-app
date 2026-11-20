import { z } from 'zod'
import {
  HANDLE_MAX_LENGTH,
  handleChangeAvailableAt,
  handleRejection,
  mayChangeHandleAt,
  normalizeHandle,
} from '../../../shared/handles'
import type { AccountHandleChangeResponse } from '../../../shared/types/handle'
import { activeAccountHandleRow, changeAccountHandle, ensureAccountHandleAudience } from '../../utils/accountHandles'
import { softFail } from '../../utils/softFail'

/**
 * Den eigenen @namen ändern — konto-weit (AH-7, 2026-08-11).
 *
 * ── DIE REGELN STEHEN HIER, NICHT IM CLIENT ────────────────────────────────
 * Zeichensatz, reservierte Namen und die 30-Tage-Sperrfrist kommen aus
 * `core/shared/handles.ts` — derselben Datei, die auch die Oberfläche liest.
 * Die Oberfläche KENNT die Regeln (damit sie sofort etwas sagen kann), diese
 * Route SETZT sie durch. Dasselbe Muster wie bei den Schutzregeln des Teams
 * (communityTeam.ts).
 *
 * ── DIE KOLLISION IST EIN 409 AUS DEM INDEX, KEINE ABFRAGE ────────────────
 * Es wird NICHT erst nachgesehen, ob der Name frei ist. Zwei Menschen, die im
 * selben Moment `@david` schicken, würden beide ein „ist frei" lesen und beide
 * schreiben. Der eindeutige Index auf `handleLower` ist die Wahrheit; wer den
 * 409 bekommt, war der Zweite („wer zuerst kam, behält" — dieselbe Regel, nach
 * der auch die Übernahme der Alt-Namen entschieden hat).
 *
 * Ablehnungsgründe reisen als `data: { code }` — der zentrale Fehler-Handler
 * hebt genau diesen Schlüssel als `reason` ins Envelope, die Oberfläche macht
 * daraus einen Satz. Ein blosser 400 ohne Grund wäre hier besonders ärgerlich:
 * „geht nicht" beantwortet weder „welches Zeichen stört" noch „ab wann darf
 * ich wieder".
 */
const bodySchema = z.object({
  handle: z.string().trim().min(1).max(HANDLE_MAX_LENGTH + 1),
})

export default defineEventHandler(async (event): Promise<AccountHandleChangeResponse> => {
  /**
   * Nur die Sitzung, KEINE Mitglieder-Wache — anders als beim Vorgänger
   * `PATCH /api/handles/me`. Begründung im Kopf von `handle.get.ts`: der Name
   * gehört dem Konto, nicht einer Community, und gesetzt wird er in erster
   * Linie auf `/profile`, wo es gar keine gibt. Ein Verfügbarkeits-Orakel für
   * eine fremde Community ist die Route damit auch nicht mehr — es gibt nur
   * noch EINEN Namensraum, und dass ein Name in ihm vergeben ist, erfährt
   * ohnehin jeder, der ihn selbst versucht.
   */
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const next = normalizeHandle(body.handle)

  // 1. Gestalt und Reservierung — die reine Regel.
  const rejection = handleRejection(next)
  if (rejection) {
    throw createError({ status: 400, statusText: 'Invalid handle', data: { code: rejection } })
  }

  const current = await activeAccountHandleRow(event, user.$id)

  // 2. Sperrfrist. Die Ausnahme ist bewusst: wer denselben Namen noch einmal
  //    schickt (Doppelklick, erneutes Speichern eines unveränderten Formulars),
  //    soll kein „zu früh" zu sehen bekommen — es ändert sich ja nichts.
  if (current && current.handleLower !== next && !mayChangeHandleAt(current.changedAt || null)) {
    throw createError({
      status: 400,
      statusText: 'Handle change too soon',
      data: { code: 'change_too_soon' },
    })
  }

  // 3. Schreiben. `null` heisst: der eindeutige Index hat gegriffen — der Name
  //    ist vergeben, aktiv ODER als früherer Name eines anderen Menschen.
  const row = await changeAccountHandle(event, user.$id, body.handle)
  if (!row) {
    throw createError({ status: 409, statusText: 'Handle taken', data: { code: 'taken' } })
  }

  // 4. Publikum — DIESELBE Klammer wie in handle.get.ts, und aus demselben
  //    Grund. `changeAccountHandle` erbt nur noch die Lese-Rollen der alten
  //    Zeile und vergibt selbst keine mehr (Gegenprobe 2026-08-12, §9):
  //    die Umbenennung fragt nicht nach Zugehörigkeit, sonst schriebe sich
  //    ein Fremder per Namenswechsel ins Erwähnungs-Menü einer fremden
  //    Community. Das Nachtragen gehört deshalb hierher, hinter das Gate —
  //    `ensureAccountHandleAudience` ist der EINZIGE Schreiber von
  //    `read(label:…)`. Ohne diesen Schritt verlöre ein Mitglied, das seinen
  //    ERSTEN Namen per PATCH setzt, das Publikum seiner eigenen Community.
  //    Fail-soft wie dort: die Zugehörigkeits-Frage ist fail-closed und darf
  //    eine erfolgreiche Umbenennung nicht nachträglich umbringen.
  if (await resolveCommunityMembership(event).catch(softFail('core:api/account/handle.patch:resolveCommunityMembership', false))) {
    await ensureAccountHandleAudience(event, user.$id)
  }

  return {
    handle: row.handle,
    changedAt: row.changedAt || null,
    canChange: mayChangeHandleAt(row.changedAt || null),
    availableAt: handleChangeAvailableAt(row.changedAt || null),
  }
})
