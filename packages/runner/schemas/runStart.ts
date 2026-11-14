import { z } from 'zod'
import { permissionModeAllowed } from '../shared/runGuards'
import { PERMISSION_MODES, type PermissionMode } from '../shared/types/runner'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * Das START-FORMULAR des Lauf-Bereichs (Paket 3) — nicht zu verwechseln mit
 * `createRunSchema` in `schemas/run.ts`, das den ROUTEN-Körper prüft.
 *
 * Zwei Schemas, weil es zwei verschiedene Dinge sind: das Formular kennt
 * `maxBudgetText` (ein Textfeld) und kennt weder `promptSource` noch
 * `subjectId` — die stellt der Einbindende. Was BEIDE
 * kennen, ist die Modus-Sperre aus § 8.2, und die steht hier NUR als
 * Höflichkeit: sie sagt dem Benutzer sofort, was nicht geht. Die SICHERUNG
 * sitzt serverseitig in `runs/index.post.ts` und noch einmal im Runner —
 * eine Oberfläche, die einen Knopf ausgraut, sichert gar nichts.
 */
export function createRunStartSchema(t: TranslateFn = identity, options: { promptTrusted: boolean } = { promptTrusted: true }) {
  return z.object({
    runnerId: z.string().min(1, t('runner.form.errors.runner')),
    model: z.string().min(1, t('runner.form.errors.model')),
    permissionMode: z.enum(PERMISSION_MODES).refine(
      mode => permissionModeAllowed(mode as PermissionMode, options.promptTrusted),
      { message: t('runner.form.errors.mode') },
    ),
    repoKey: z.string().min(1, t('runner.form.errors.repo')),
    /**
     * Leer = kein eigener Deckel; der Runner kappt ohnehin gegen seinen (§ 7.2).
     *
     * ALS TEXT, nicht als Zahl: ein `type="number"`-Feld liefert einen String,
     * und ein geleertes Feld liefert '' — eine Zahl-Prüfung müsste beides
     * zusätzlich abfangen und der Formularzustand hätte zwei Typen. Der
     * Bereich rechnet beim Abschicken um.
     */
    maxBudgetText: z.string().refine(
      value => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100),
      { message: t('runner.form.errors.budget') },
    ),
    /**
     * AUSGEWÄHLT, nicht getippt (SEC-037): nur Befehle, die der gewählte
     * Rechner für das gewählte Repo meldet, stehen zur Wahl. Freitext gibt es
     * nicht mehr — die Grenze ist die lokale Liste des Rechners, und die
     * Anlege-Route prüft jeden Eintrag noch einmal exakt dagegen. Höchstens
     * zehn, wie das Routen-Schema.
     */
    testCommands: z.array(z.string()).max(10, t('runner.form.errors.tests')),
    /** true ⇒ interaktiver Lauf: der Runner öffnet ein Terminal (§ 7.3) */
    interactive: z.boolean(),
  })
}
