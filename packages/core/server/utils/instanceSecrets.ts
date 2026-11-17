import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { decryptSecretWithKeys, encryptSecret, parseSecretBoxKey } from './secretBox'

/**
 * GEHEIMNISSE DIESER INSTANZ, EINGETRAGEN ÜBER DIE OBERFLÄCHE
 * (Davids Entscheidung 2026-08-18, nach dem Vorbild der Stripe-Einstellungen).
 *
 * Der Anlass: `NUXT_AI_KEY` fehlte monatelang auf `platform`, damit war das im
 * Pro-Tarif VERKAUFTE KI-Produkt auf jeder Kunden-Community dunkel — und
 * niemandem fiel es auf, weil ein fehlender Schlüssel sich exakt wie ein
 * abgeschaltetes Produkt verhält. Ein Feld in der Betreiber-Konsole macht den
 * Zustand sichtbar UND änderbar, ohne ssh.
 *
 * ── WARUM NICHT IN `app_config` ───────────────────────────────────────────
 * Weil die Tabelle `read(any)` trägt (system-005) — mit Absicht: daran hängt
 * die Live-Propagation von Themes und Produkt-Flags, und die Migration sagt
 * ausdrücklich „DAS HEISST AUFZÄHLBAR — geprüft und akzeptiert". Ein
 * API-Schlüssel dort wäre für jeden Besucher abrufbar. Diese Tabelle hat
 * deshalb LEERE Permissions und `rowSecurity: false`: nur der Admin-Client
 * kommt heran.
 *
 * ── WAS DER UMSCHLAG LEISTET UND WAS NICHT ────────────────────────────────
 * Steht vollständig im Kopf von `secretBox.ts`, in einem Satz: er schützt
 * gegen einen DB-Dump, NICHT gegen ein Env-Leck (wer die Env liest, hat auch
 * den Appwrite-Admin-Key). Er ist deshalb nie die Begründung dafür, das
 * Geheimnis überhaupt in die DB zu legen — die Begründung ist „Betrieb ohne
 * Terminal".
 *
 * ── DB SCHLÄGT ENV, und das ist keine Geschmacksfrage ─────────────────────
 * Dieselbe Rangfolge wie bei Stripe (F55) und aus demselben Grund: stünde die
 * Env vorn, hätte ein Eintrag über die Konsole auf einer Instanz, die die
 * Env-Variable GESETZT hat, keinerlei Wirkung — der Betreiber klickt, die
 * Karte meldet Erfolg, und benutzt wird weiter der alte Schlüssel. Genau die
 * Sorte stiller Wirkungslosigkeit, gegen die dieses Feld gebaut ist.
 *
 * ── FAIL-SOFT BEIM LESEN ──────────────────────────────────────────────────
 * Fehlende Tabelle (Migration noch nicht gelaufen), fehlender Umschlag-
 * Schlüssel oder ein Appwrite-Aussetzer dürfen nicht dazu führen, dass eine
 * funktionierende Env-Konfiguration ausfällt. Ein NICHT ENTSCHLÜSSELBARER
 * Wert ist dagegen ein Vorfall und wird protokolliert — er sieht sonst aus wie
 * „nichts hinterlegt", und niemand fragt nach.
 */

export const INSTANCE_SECRETS_TABLE = 'instance_secrets'

/**
 * Welche Geheimnisse es gibt. Die Zeilen-Id IST die Sorte — eine
 * `ID.unique()`-Zeile bräuchte eine Abfrage, einen Index und die Frage
 * „welche gilt, wenn zwei da sind"; die feste Id lässt sie nicht entstehen.
 *
 * WAS HIER NICHT STEHEN DARF (Davids Zuschnitt vom 2026-08-18): Geheimnisse,
 * die man BRAUCHT, um an diese Zeile heranzukommen — `NUXT_APPWRITE_KEY`
 * (öffnet die Datenbank), `NUXT_INSTANCE_SECRETS_KEY` (öffnet den Umschlag),
 * der Control-Plane-Schlüssel, die Redis-Adresse. Henne und Ei: läge einer
 * davon hier, käme niemand mehr an ihn heran.
 *
 * DAS GETEILTE Geheimnis zwischen zwei Deployments (`onboarding-service`)
 * ist seit dem 2026-08-18 dabei — mit genau der Übergangsstufe, die hier
 * vorher als Bedingung stand. Es muss auf beiden Seiten gleich sein; deshalb nimmt der EMPFÄNGER die MENGE {Ablage, Env} an,
 * während der SENDER genau einen Wert schickt (Ablage zuerst). Rotieren ist
 * damit eine Reihenfolge — erst beim Empfänger eintragen, dann beim Sender —
 * und braucht weder Deployment noch Code-Stufe. Regel, Begründung und die
 * Reihenfolge im Wortlaut: `sharedSeamSecret.ts`.
 *
 * SMTP kam am 2026-08-18 dazu — als EIN Block (`smtp`), nicht als einzelnes
 * Passwort: Host, Port, Benutzer, Passwort und Absender gehören zusammen, und
 * ein halb umgezogener Block wäre eine Konfiguration, die niemand mehr
 * erklären kann. Dafür musste diese Datei eventlos lesbar werden — der
 * Digest-Versand läuft in einem Sweep OHNE Request.
 *
 * `events-sweep` ist seit dem 2026-11-17 KEINE Sorte mehr (SE1 d): die Route,
 * die ein Cron damit aufrief, ist gelöscht, Termin-Erinnerungen laufen als
 * Zeit-Lauf `event-reminders`. Eine alte Zeile mit dieser Id darf in der
 * Tabelle liegen bleiben — gelesen wird hier nur je feste Sorte, nie die
 * ganze Tabelle; der einzige Leser über alle Zeilen ist die Auskunft und
 * Löschung (`system`-Contributor, fragt nur `updatedBy`).
 */
export const INSTANCE_SECRET_KINDS = ['ai', 'analytics', 'tickets-ai', 'smtp', 'onboarding-service'] as const
export type InstanceSecretKind = typeof INSTANCE_SECRET_KINDS[number]

export interface InstanceSecretRow extends Models.Row {
  /** `v1.`-Umschlag aus secretBox — NIE der Klartext. */
  value: string
  updatedAt: string
  updatedBy: string
}

/** Woher der benutzte Wert stammt — für die Anzeige in der Konsole. */
export type InstanceSecretSource = 'settings' | 'env' | 'none'

function envKey(event?: H3Event): Buffer | null {
  // Wirft bei falscher Form (nicht 64 Hex) — das ist Absicht: ein halb
  // gesetzter Umschlag-Schlüssel soll auffallen, nicht stillschweigend
  // „nichts gespeichert" bedeuten.
  return parseSecretBoxKey(useRuntimeConfig(event).instanceSecretsKey, 'NUXT_INSTANCE_SECRETS_KEY')
}

/** Ist der Umschlag überhaupt einsatzbereit? Ohne ihn gibt es kein Feld. */
export function instanceSecretsConfigured(event?: H3Event): boolean {
  try {
    return envKey(event) !== null
  }
  catch {
    return false
  }
}

/**
 * Den Klartext lesen — oder '' wenn nichts hinterlegt ist.
 *
 * Bewusst OHNE die Datentür: `instance_secrets` gehört der INSTANZ, nicht
 * einem Mandanten (dieselbe Ebene wie `app_config`). Der Admin-Client ist
 * hier die einzige Zugangsart, die Tabelle trägt keine Client-Rechte.
 *
 * `event` ist OPTIONAL, und das ist kein Komfort: Sweeps laufen ohne Request
 * (Digest-Versand, Health-Sweep). `useRuntimeConfig()` und
 * `createAdminClient()` kommen beide ohne aus — ohne diese Freiheit wäre der
 * Mailversand nicht umziehbar gewesen.
 */
export async function readInstanceSecret(event: H3Event | undefined, kind: InstanceSecretKind): Promise<string> {
  let key: Buffer | null
  try {
    key = envKey(event)
  }
  catch {
    logEvent('error', 'core.instance_secret_key_malformed', { kind })
    return ''
  }
  if (!key) return ''

  const config = useRuntimeConfig(event)
  try {
    const row = await createAdminClient(event).tablesDB.getRow<InstanceSecretRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INSTANCE_SECRETS_TABLE,
      rowId: kind,
    })
    if (!row.value) return ''
    const plain = decryptSecretWithKeys(row.value, [key])
    if (!plain) {
      // Da LIEGT etwas, es lässt sich nur nicht öffnen — meist ein
      // gewechselter Umschlag-Schlüssel. Lautes Protokoll, weil es sonst
      // aussieht wie „nie eingetragen".
      logEvent('error', 'core.instance_secret_undecryptable', { kind })
      return ''
    }
    return plain
  }
  catch (error) {
    // 404 = keine Zeile (Normalfall vor dem ersten Eintrag) oder Tabelle
    // fehlt (Migration nicht gelaufen). Beides ist kein Vorfall.
    const code = (error as { code?: number })?.code
    if (code !== 404) logEvent('error', 'core.instance_secret_read_failed', { kind, code })
    return ''
  }
}

/** Eintragen bzw. ersetzen. Leerer Wert LÖSCHT die Zeile — siehe unten. */
export async function writeInstanceSecret(
  event: H3Event,
  kind: InstanceSecretKind,
  plain: string,
  userId: string,
): Promise<void> {
  const key = envKey(event)
  if (!key) {
    throw createError({ status: 503, statusText: 'Instance secrets not configured', data: { code: 'secrets_key_missing' } })
  }

  const config = useRuntimeConfig(event)
  const tablesDB = createAdminClient(event).tablesDB
  const trimmed = plain.trim()

  const data = {
    // Leeren Wert NICHT verschlüsseln: '' ist die ehrliche Ablage für
    // „entfernt", und ein Umschlag um nichts wäre nur ein zweiter Zustand,
    // der dasselbe bedeutet.
    value: trimmed ? encryptSecret(trimmed, key) : '',
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }

  try {
    await tablesDB.updateRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INSTANCE_SECRETS_TABLE,
      rowId: kind,
      data,
    })
  }
  catch (error) {
    if ((error as { code?: number })?.code !== 404) throw error
    await tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INSTANCE_SECRETS_TABLE,
      rowId: kind,
      data,
      // Keine Permissions: nur der Admin-Client, wie die Tabelle selbst.
      permissions: [],
    })
  }
}
