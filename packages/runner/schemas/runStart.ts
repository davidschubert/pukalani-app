import { z } from 'zod'
import { permissionModeAllowed } from '../shared/runGuards'
import { PERMISSION_MODES, type PermissionMode } from '../shared/types/runner'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** Der höchste Deckel, den das Formular annimmt — derselbe wie im Routen-Schema (`schemas/run.ts`). */
const MAX_BUDGET_USD = 100

/**
 * Was im Budget-Feld steht, als Dollar-Betrag: '' (oder nur Leerzeichen) = 0 =
 * kein eigener Deckel, eine Zahl oder ein Zahl-Text von 0 bis 100 = dieser
 * Betrag, alles andere = `null` (ungültig). EINE Lesart für die Prüfung und
 * fürs Abschicken — sonst prüft das Formular etwas anderes, als es schickt.
 */
export function budgetFromInput(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return 0
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_BUDGET_USD ? amount : null
}

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
     * TEXT ODER ZAHL: `UInput type="number"` wandelt die Eingabe selbst in
     * eine Zahl um (`looseToNumber`) und lässt nur das geleerte Feld als ''
     * stehen. Ein reines `z.string()` lehnte deshalb JEDE getippte Zahl ab,
     * und der Start-Knopf blieb gesperrt (RU1 b, 2026-11-21). Gelesen wird
     * beides über `budgetFromInput`, auch beim Abschicken.
     */
    maxBudgetText: z.union([z.string(), z.number()], { error: t('runner.form.errors.budget') }).refine(
      value => budgetFromInput(value) !== null,
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
