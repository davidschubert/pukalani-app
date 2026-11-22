import { runTrialSweep } from '../utils/trialSweep'
import { pruneInviteRequests } from '../utils/inviteRequestPrune'
import { runPastDueSweep } from '../utils/pastDueSweep'
import { eraseStaleReporterEmails } from '../utils/abuseReportPrune'
import { customDomainSweepConfiguredMode, runCustomDomainSweep } from '../utils/customDomainSweep'
import { disabledMembershipSweepConfiguredMode, runDisabledMembershipSweep } from '../utils/disabledMembershipSweep'

/**
 * Testphasen-Automatik: abgelaufene Trials werden nur-lesend (F49 vom
 * 2026-08-07; bis dahin fielen sie auf den kostenlosen Tarif). Gleiches Muster
 * wie der Health-Sweep (`defineTimedJob`, Single-Instanz-Annahme) — stündlich
 * reicht, weil eine Testphase in Tagen rechnet und ein paar Minuten Nachlauf
 * niemandem schaden.
 *
 * Erster Lauf kurz nach dem Boot: sonst behielte ein über Nacht abgelaufener
 * Trial nach einem Deploy bis zur nächsten Stunde Pro-Limits.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000
/** Der Fristen-Lauf der eigenen Domain startet versetzt (60 s): er liest den
 *  Plan, den die Mitfahrer im ersten Takt eben noch zurückgesetzt haben. */
const CUSTOM_DOMAIN_FIRST_RUN_DELAY_MS = 60 * 1000

export default defineNitroPlugin(() => {
  // Vier Anmeldungen auf EINEM Takt (gleicher Takt, gleiche Startverzögerung,
  // wie bisher die vier Mitfahrer eines Timers; dazu unten der Fristen-Lauf
  // der eigenen Domain mit eigenem Startversatz) — je Lauf eine eigene
  // Kennung, damit der Wächter sieht, WELCHER von ihnen scheitert. Die
  // Fehlerzeile schreibt `defineTimedJob` (OPS-011).
  defineTimedJob({
    name: 'trial-sweep',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      const result = await runTrialSweep()
      // Nur melden, wenn wirklich etwas passiert ist — ein stündliches „0
      // Änderungen" macht das Log unlesbar.
      if (result.suspended.length) {
        console.info(`[control] Testphasen beendet (nur-lesend): ${result.suspended.join(', ')}`)
      }
    },
  })

  // Teilt sich bewusst den Takt: beides sind stündliche Aufräumarbeiten am
  // selben Register, und ein zweiter Takt wäre nur ein zweiter Ort, an dem
  // man nach dem Grund für ein verschwundenes Datum sucht.
  defineTimedJob({
    name: 'invite-request-prune',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      const result = await pruneInviteRequests()
      if (result.deleted) {
        console.info(`[control] Erledigte Anfragen gelöscht: ${result.deleted}`)
      }
    },
  })

  // Dritter Mitfahrer, gleiche Begründung (M13): Zahlungsverzug rechnet in
  // TAGEN, stündlich ist also reichlich genau, und ein eigener Takt wäre nur
  // ein weiterer Ort, an dem man nach dem Grund für eine Sperre sucht. Der
  // Sweep ist idempotent — er sperrt jede Community höchstens einmal und hebt
  // auf, was nicht mehr überfällig ist.
  defineTimedJob({
    name: 'past-due-sweep',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      const result = await runPastDueSweep()
      if (result.suspended.length) {
        console.warn(`[control] Wegen Zahlungsverzug gesperrt: ${result.suspended.join(', ')}`)
      }
      if (result.lifted.length) {
        console.info(`[control] Zahlungs-Sperre aufgehoben: ${result.lifted.join(', ')}`)
      }
    },
  })

  // Vierter Mitfahrer (F8-Rest): Melder-Adressen verfallen nach 90 Tagen. Die
  // Frist rechnet in Tagen, stündlich ist also mehr als genau — und der Takt
  // gehört aus demselben Grund hierher wie die drei darüber.
  defineTimedJob({
    name: 'reporter-email-prune',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      const result = await eraseStaleReporterEmails()
      if (result.erased) {
        logEvent('info', 'abuse.reporter_email_pruned', { erased: result.erased })
      }
    },
  })

  // Fünfter Lauf, EIGENER Startversatz (BE-014): Frist, Abschalten und
  // verfallene Einträge der eigenen Domain. Der Schalter
  // `pukalani.control.customDomainSweep` entscheidet VOR dem Anmelden: `off`
  // ⇒ der Lauf meldet sich gar nicht an (sonst hielte ihn der Wächter für
  // überfällig); `dry-run` zählt nur; `apply` schreibt. Eine belegte Sperre
  // (zweiter Prozess) ist `skipped`, ein Fehlschlag an einer Community wirft
  // NACH dem Lauf — so zählt der Alarm ihn als gescheitert, die anderen
  // Communities wurden trotzdem bearbeitet.
  const customDomainMode = customDomainSweepConfiguredMode()
  if (customDomainMode !== 'off') {
    defineTimedJob({
      name: 'custom-domain-sweep',
      everyMs: SWEEP_INTERVAL_MS,
      firstRunMs: CUSTOM_DOMAIN_FIRST_RUN_DELAY_MS,
      run: async () => {
        const result = await runCustomDomainSweep({ mode: customDomainMode })
        if ('skipped' in result) return 'skipped'
        if (result.counts.failed > 0) {
          throw new Error(`custom-domain-sweep: ${result.counts.failed} Fehlschläge`)
        }
      },
    })
  }

  // Sechster Lauf (SI1 b): `active`-Zeilen in stillgelegten Communities.
  // Schalter `pukalani.control.disabledMembershipSweep`, Layer-Vorgabe
  // `dry-run` — live zählt er nur (Davids Ja 2026-11-21: „nur zählend").
  // `off` ⇒ keine Anmeldung (sonst hielte ihn der Wächter für überfällig).
  const disabledMembershipMode = disabledMembershipSweepConfiguredMode()
  if (disabledMembershipMode !== 'off') {
    defineTimedJob({
      name: 'disabled-member-sweep',
      everyMs: SWEEP_INTERVAL_MS,
      firstRunMs: CUSTOM_DOMAIN_FIRST_RUN_DELAY_MS,
      run: async () => {
        const result = await runDisabledMembershipSweep({ mode: disabledMembershipMode })
        if (result.failed > 0) {
          throw new Error(`disabled-member-sweep: ${result.failed} Fehlschläge`)
        }
      },
    })
  }
})
