import { runGdprExportPrune } from '../utils/userDataOrchestration'

/**
 * Takt für die Aufbewahrungsfrist der Sicherungskopien gelöschter Konten
 * (SEC-009, Davids Entscheidung: „Die Sicherungskopien gelöschter Konten
 * räumt ein stündlicher Lauf nach 30 Tagen weg, nicht erst die nächste
 * Löschung."). Vorher räumten nur die NÄCHSTE Löschung und das Öffnen der
 * Admin-Liste auf — auf einer Instanz mit wenigen Löschungen lag eine Kopie
 * so beliebig lange. Beide Aufrufe bleiben als zusätzliches Netz; die Frist
 * garantiert dieser Lauf.
 *
 * WAS ER TUT: liest den einen Bucket `public.appwriteGdprBucket` ältestes
 * zuerst und löscht jede Datei, die älter als `GDPR_EXPORT_RETENTION_MS`
 * ist. WAS ER NIE TUT: einen anderen Bucket anfassen, eine Datei innerhalb
 * der Frist löschen, eine Zeile oder ein Konto ändern.
 *
 * Der Core läuft in JEDER App, auch ohne Bucket (help, marketing): ohne
 * konfigurierten Bucket startet hier kein Timer, das Plugin ist ein no-op.
 *
 * TAKT stündlich — die Frist rechnet in Tagen, stündlich ist mehr als genau.
 * Erster Lauf 5 min nach dem Boot, VERSETZT hinter die übrigen Läufe
 * (Entitlement-Pull, Layer-Sweeps starten früher), damit der Boot-Moment
 * nicht alle zugleich trifft, und doch früh genug, dass ein Deploy die
 * fällige Runde nicht bis zur vollen Stunde verschiebt.
 *
 * Single-Instanz-Annahme wie bei allen Sweeps hier: laufen mehrere
 * Instanzen, löschen sie dieselben Dateien — das ist idempotent (404 zählt
 * als „schon weg"). Gegen einen Doppelstart IM Prozess hält der Riegel in
 * `runGdprExportPrune`.
 *
 * Signal ist die Log-Zeile (`gdpr.exports_prune_incomplete` /
 * `gdpr.exports_prune_failed`). Ein ALARM in den Posteingang des Betreibers
 * gehört bewusst nicht zu dieser Änderung — das ist ein eigenes, späteres
 * Paket. Handroute zum Beweisen: POST /api/admin/gdpr-exports/prune (admin).
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().public.appwriteGdprBucket) return

  // Zähler und Fehler schreibt der Lauf selbst (logEvent); hier wird sein
  // Ergebnis nur für `job.run` übersetzt. unref, damit die Timer einen
  // sauberen Exit (CLI/Tests) nicht offen halten.
  defineTimedJob({
    name: 'gdpr-export-prune',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: async () => {
      const result = await runGdprExportPrune()
      // `null` = der Riegel hält, ein anderer Lauf (Hand-Route) ist im Gange.
      if (!result) return 'skipped'
      if (result.failed > 0) throw new Error(`unvollständig: ${result.failed} Dateien nicht gelöscht`)
    },
  })
})
