/**
 * Takt für den Aufräum-Lauf der Profilbilder ohne Profil (KE3). Was der Lauf
 * tut und was er nie tut: `server/utils/avatarOrphanSweep.ts`; die Regel:
 * `shared/avatarOrphan.ts`.
 *
 * ANGEMELDET WIRD NUR, wenn die App einen Avatars-Bucket hat
 * (`public.appwriteAvatarsBucket`) UND der Schalter
 * `pukalani.storage.avatarOrphanSweep` nicht auf `off` steht (Core-Vorgabe).
 * Ein Lauf, der in einer App gar nicht fährt, meldet sich nicht an — sonst
 * hielte ihn der tägliche Wächter für überfällig. Fährt er, braucht die App
 * eine Zeile in `ops/timed-jobs.conf`.
 *
 * TAKT alle 6 Stunden: die Schonfrist rechnet in Tagen, und es eilt nichts —
 * eine verwaiste Datei kostet nur Ablage. Erster Lauf 12 min nach dem Boot,
 * VERSETZT hinter die übrigen Läufe (die Lösch-Kopien starten nach 5 min).
 * unref, damit der Timer einen sauberen Exit (CLI/Tests) nicht offen hält.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 12 * 60 * 1000

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().public.appwriteAvatarsBucket) return
  const mode = avatarOrphanSweepMode()
  if (mode === 'off') return

  defineTimedJob({
    name: 'avatar-orphan-sweep',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: retentionTick(() => runAvatarOrphanSweep(mode)),
  })
})
