import { TENANT_PLANS } from '../../shared/types/tenantRecord'

/**
 * Namen der Pläne im Kasten „Pläne & Limits (Pool)" (PD1 c, 2026-11-17).
 *
 * Der Kasten zeigt JEDE Zeile der Tabelle `community_plans` — nicht nur die
 * drei heutigen Pläne. Migration control-014 hat `free`, `pro` und `business`
 * angelegt; seit der Umbenennung (2026-07-26: free→basic, pro→personal,
 * business→pro) gibt es `basic`/`personal`/`pro`, die Alt-Zeilen `free` und
 * `business` stehen aber weiter in der Tabelle. vue-i18n gab für sie den
 * rohen SCHLÜSSEL aus (`control.tenants.plan.free`).
 *
 * Jetzt: bekannte Pläne (heutige + Alt-Pläne) über `control.tenants.plan.*`,
 * Alt-Pläne mit dem Zusatz „Alt-Plan". Ein UNBEKANNTER Schlüssel bleibt roh
 * sichtbar — nie „Unbekannt", sonst sähe der Betreiber nicht, welche Zeile es ist.
 * Nur Anzeige: an Limits, Katalog und `normalizeTenantPlan` ändert das nichts.
 */
export const LEGACY_PLAN_KEYS = ['free', 'business'] as const

/** Jeder Schlüssel, für den der Kasten einen Namen kennt (der Test prüft beide Sprachen). */
export const LABELLED_PLAN_KEYS: readonly string[] = [...TENANT_PLANS, ...LEGACY_PLAN_KEYS]

/** i18n-Schlüssel für den Plan-Namen — oder `null`, dann zeigt der Kasten den rohen Wert. */
export function planLabelKey(planKey: string): string | null {
  return LABELLED_PLAN_KEYS.includes(planKey) ? `control.tenants.plan.${planKey}` : null
}
