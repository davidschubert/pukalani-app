import type { BrandEventsSweepResult } from '../../../utils/brandEventsSweep'
import { runBrandEventsSweep } from '../../../utils/brandEventsSweep'

/**
 * DEN EREIGNIS-SWEEP JETZT LAUFEN LASSEN (BS1 R1b) — der Handgriff neben dem
 * Takt aus `server/plugins/brand-events-sweep.ts`.
 *
 * Dieselbe Form wie `POST /api/market/ops/sweep` und `POST
 * /api/notifications/run-digest` im core: `system.manage`, kein Rumpf, das
 * Ergebnis des Sweeps als Antwort. Sie existiert aus zwei Gründen, und beide
 * sind Betrieb:
 *
 *  1. **Beweisbarkeit.** Der Beweis (`scripts/verify-brand-events-sweep.mjs`)
 *     kann zwei Jahre nicht abwarten und soll auch keine interne Funktion über
 *     einen Dev-Hook aufrufen — das wäre ein zweiter Einstieg, den nur der Test
 *     kennt. Ein Betreiber-Knopf, den der Beweis mitbenutzt, misst dagegen
 *     genau den Weg, den es auch in Produktion gibt.
 *  2. **Nach einem Vorfall.** Wer aufräumen muss, will nicht bis zum nächsten
 *     Tagestakt warten.
 *
 * ── SIE NIMMT KEINEN ZEITPUNKT ENTGEGEN ──────────────────────────────────
 * `runBrandEventsSweep(now)` hat sein `now` für den TAKT und für Unit-Tests —
 * über die Route wäre es eine Waffe: ein `now` in der Zukunft löschte die
 * gesamte Tabelle mit einem Aufruf. Der Beweis braucht es auch nicht, denn
 * Appwrite nimmt `$createdAt` beim Anlegen mit dem Server-Schlüssel an; eine
 * wirklich zwei Jahre alte Zeile ist also herstellbar, und der Sweep läuft im
 * Beweis mit derselben Uhr wie in Produktion.
 *
 * ── WARUM `system.manage` UND NICHT DIE BRANDING-TÜR ─────────────────────
 * Der Sweep läuft über ALLE Brandings und alle Konten (die Frist gehört der
 * Tabelle, nicht dem einzelnen Kunden). `assertBrandOwnerAccess` wäre hier also
 * die falsche Frage: es gibt kein Branding, dessen Besitz etwas beweisen würde.
 * Betreiber-Handgriff, Betreiber-Recht.
 *
 * ── SIE HÄNGT UNTER `/api/brand` UND FÄLLT MIT DER NOTABSCHALTUNG ────────
 * `04.product-gate.ts` prüft jede `/api/brand/**`-Route gegen den
 * Produkt-Schalter. Das ist hingenommen und nicht umgangen: die ZUSAGE hält der
 * Takt (er läuft weiter, Begründung dort), diese Route ist der Handgriff. Ein
 * zweites API-Präfix im Manifest, nur damit ein Ops-Knopf die Notabschaltung
 * überlebt, wäre der teurere Tausch.
 */
export default defineEventHandler(async (event): Promise<BrandEventsSweepResult> => {
  requirePermission(event, 'system.manage')
  return await runBrandEventsSweep()
})
