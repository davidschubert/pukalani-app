import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { readInstanceSecret, type InstanceSecretKind } from './instanceSecrets'

/**
 * DIE GETEILTEN NAHT-GEHEIMNISSE — dieselbe Zeichenkette auf ZWEI Deployments
 * (Davids Entscheidung 2026-08-18, der Rest von A0).
 *
 * Zwei Nähte fallen darunter:
 *  - `onboarding-service` — das Service-Secret zwischen Runtime-Instanz und
 *    Control Plane (Header `x-pukalani-onboarding-secret`, in BEIDE Richtungen:
 *    platform→control beim Onboarding, control→silo beim Domain-Rückruf).
 *  - `events-sweep` — der Schlüssel, mit dem ein Cron den Terminerinnerungs-
 *    Sweep anstieß (Header `x-sweep-key`). Die Route dazu ist seit dem
 *    2026-11-17 gelöscht (SE1 d; erinnert wird über den Zeit-Lauf
 *    `event-reminders`). Die Sorte bleibt in `INSTANCE_SECRET_KINDS`, weil
 *    eine Instanz noch eine Zeile davon tragen kann; die Betreiber-Konsole
 *    zeigt sie nicht mehr an.
 *
 * ── WARUM SIE NICHT EINFACH WIE `ai` UMZIEHEN KONNTEN ─────────────────────
 * Ein KI-Schlüssel gehört EINER Instanz: eintragen, fertig. Ein Naht-Geheimnis
 * muss auf beiden Seiten übereinstimmen — legte man es in die Ablage einer
 * Instanz und drehte dort, risse die Naht in genau dem Moment, in dem der
 * Betreiber auf „Speichern" drückt. Der Kopf von `instanceSecrets.ts` hat
 * deshalb eine „Übergangsstufe, in der beide Seiten alten UND neuen Wert
 * annehmen" verlangt. Das ist diese Datei.
 *
 * ── DIE REGEL: SENDEN EINEN, ANNEHMEN ALLE ────────────────────────────────
 * SENDER nimmt genau EINEN Wert — Konsole zuerst, Env als Rückfall (dieselbe
 * Rangfolge wie bei jedem anderen Zugang; stünde die Env vorn, hätte ein
 * Eintrag über die Konsole auf einer Instanz mit gesetzter Env-Variable gar
 * keine Wirkung).
 * EMPFÄNGER nimmt die MENGE {Konsole, Env} an. Beides zusammen macht die
 * Rotation zu einer reinen REIHENFOLGE statt zu einer Code-Stufe:
 *
 *   1. Neuen Wert in der Konsole des EMPFÄNGERS eintragen.
 *      → Er nimmt jetzt alt (Env) UND neu (Konsole) an; niemand merkt etwas.
 *   2. Denselben Wert in der Konsole des SENDERS eintragen.
 *      → Ab dem nächsten Ruf reist der neue Wert. Fertig.
 *   3. Optional später: den alten Wert aus den `.env` beider Seiten nehmen und
 *      neu starten. Erst DAMIT ist der alte Wert ungültig — vorher bleibt er
 *      gültig, und genau das ist der Sinn.
 *
 * Kein Deployment und keine Code-Änderung. Wer die Reihenfolge umdreht (erst
 * Sender), schickt einen Wert, den die Gegenseite noch nicht kennt — deshalb
 * steht sie auch an der Empfänger-Prüfung und auf der Karte in der Konsole.
 *
 * ── UND WO DIESE DREI SCHRITTE NICHT REICHEN ──────────────────────────────
 * Sie setzen voraus, dass „Empfänger" und „Sender" ZWEI verschiedene Seiten
 * sind. Ob das stimmt, entscheiden nicht die Env-Namen, sondern die montierten
 * LAYER — eine Route existiert nur auf dem Deployment, dessen `extends` sie
 * mitbringt. Gemessen (2026-08-19) sieht `onboarding-service` so aus:
 *
 *   platform  → admin        nur senden; der Empfänger `requireControlCaller`
 *                            steckt im `domains`-Layer, den apps/platform
 *                            nicht zieht. Fensterlos rotierbar.
 *   admin     ↔ portfolio    admin nimmt an UND sendet (Domain-Settle),
 *                            portfolio nimmt an und ruft im selben Handler
 *                            zurück. HIER sitzt das Fenster.
 *
 * An dieser einen Kante ist es auch nicht wegzusortieren: portfolio hat keinen
 * `NUXT_INSTANCE_SECRETS_KEY`, also keine Ablage, also genau EINEN gültigen
 * Wert. Wer zuerst admin dreht, bricht admin→portfolio; wer zuerst portfolio
 * dreht, bricht dieselbe Kante von der anderen Seite. Ein fensterloser Weg
 * entstünde erst, wenn portfolio ebenfalls eine Ablage bekäme — dann wäre die
 * Kette linear von hinten nach vorn drehbar.
 *
 * Bis dahin wird das Fenster nicht wegdefiniert, sondern GERICHTET: es trifft
 * ausschliesslich `admin→portfolio`, also das Freischalten einer Domain für
 * das letzte Silo — eine Betreiber-Handlung, die in derselben Minute niemand
 * auslöst. `platform→admin` (Community anlegen, Team, Switcher-Handoff, 49
 * Routen) bleibt durchgehend offen. Festgenagelt in
 * `packages/core/tests/seamRotationOrder.test.ts`; die Konsolen-Karte wählt
 * ihren Hinweistext deshalb nach der INSTANZ, nicht nach der Sorte.
 */

/**
 * Vergleich in konstanter Zeit gegen JEDEN Kandidaten — pur und unit-getestet.
 *
 * Beide Seiten werden zuerst gehasht: sonst verrät schon die Länge etwas, und
 * `timingSafeEqual` verlangt gleich lange Puffer (ein Längen-Check davor wäre
 * selbst ein Seitenkanal). Wort für Wort dasselbe Verfahren wie in den
 * bisherigen Einzel-Prüfungen (`onboardingService.ts`, `controlCaller.ts`) —
 * nur eben gegen eine Menge.
 *
 * KEIN VORZEITIGER AUSSTIEG: die Schleife läuft IMMER über alle Kandidaten.
 * Ein `return true` beim ersten Treffer wäre messbar schneller als ein Treffer
 * beim zweiten und verriete damit, WELCHER der beiden Werte gilt — also, ob der
 * Betreiber schon rotiert hat. Der Preis ist ein zweiter Hash je Anfrage.
 *
 * Ein leerer `provided` trifft NIE, auch nicht gegen einen leeren Kandidaten:
 * leere Kandidaten werden vorher aussortiert (`seamSecretCandidates`), und ein
 * leerer Header ist keine Behauptung, sondern deren Abwesenheit.
 */
export function seamSecretMatches(provided: string, accepted: readonly string[]): boolean {
  if (!provided) return false
  const given = createHash('sha256').update(provided, 'utf8').digest()
  let matched = false
  for (const candidate of accepted) {
    if (!candidate) continue
    const expected = createHash('sha256').update(candidate, 'utf8').digest()
    if (timingSafeEqual(given, expected)) matched = true
  }
  return matched
}

/**
 * PURE: die Menge der gültigen Werte, geputzt — getrimmt, leere raus, Doppel
 * raus (im Normalfall steht in Konsole und Env derselbe Wert, und dann soll
 * die Prüfung nicht zweimal dasselbe rechnen).
 *
 * Die REIHENFOLGE ist Konsole zuerst — sie hat für die Prüfung keine Bedeutung
 * (es wird ohnehin gegen alle geprüft), wohl aber für `preferredSeamSecret`
 * unten, das genau den ersten nimmt.
 */
export function seamSecretCandidates(stored: string | undefined, env: string | undefined): string[] {
  const out: string[] = []
  for (const value of [stored, env]) {
    const trimmed = (value || '').trim()
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

/** PURE: Welchen Wert SENDET diese Seite? Konsole zuerst, Env als Rückfall,
 *  '' wenn nichts hinterlegt ist. */
export function preferredSeamSecret(stored: string | undefined, env: string | undefined): string {
  return seamSecretCandidates(stored, env)[0] ?? ''
}

/**
 * Die Kandidaten dieser Instanz für eine Naht — Ablage-Zeile plus Env-Wert.
 *
 * FAIL-SOFT über `readInstanceSecret`: fehlende Tabelle, fehlender Umschlag
 * oder ein Appwrite-Aussetzer liefern '' und lassen die Env-Konfiguration
 * unangetastet. Eine funktionierende Naht darf nicht daran scheitern, dass
 * eine Migration noch nicht gelaufen ist.
 */
export async function seamSecretsFor(
  event: H3Event | undefined,
  kind: InstanceSecretKind,
  envValue: string | undefined,
): Promise<string[]> {
  const stored = await readInstanceSecret(event, kind)
  return seamSecretCandidates(stored, envValue)
}

/** Der Wert, den diese Seite SENDET (Konsole zuerst). '' = nicht konfiguriert. */
export async function seamSecretToSend(
  event: H3Event | undefined,
  kind: InstanceSecretKind,
  envValue: string | undefined,
): Promise<string> {
  return (await seamSecretsFor(event, kind, envValue))[0] ?? ''
}

/**
 * Nimmt der Empfänger diesen Wert an? `false` heißt „nein" UND „hier ist gar
 * nichts konfiguriert" — die Unterscheidung trifft die Aufrufstelle, weil die
 * beiden Fälle verschiedene Antworten verdienen (404 „gibt es nicht" gegen 401
 * „falscher Schlüssel"), und weil sie je Naht anders lauten.
 */
export async function seamSecretAccepted(
  event: H3Event | undefined,
  kind: InstanceSecretKind,
  envValue: string | undefined,
  provided: string,
): Promise<boolean> {
  return seamSecretMatches(provided, await seamSecretsFor(event, kind, envValue))
}
