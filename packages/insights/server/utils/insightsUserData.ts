import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import type {
  InsightsBrandRow,
  InsightsCorrectionRow,
  InsightsPostRow,
  InsightsSubscriberRow,
} from '../../shared/insightsRows'
import {
  INSIGHTS_BRANDS_TABLE,
  INSIGHTS_CORRECTIONS_TABLE,
  INSIGHTS_POSTS_TABLE,
  INSIGHTS_SUBSCRIBERS_TABLE,
} from '../../shared/insightsRows'
import { insightsNewsletterAnonymizedEmail } from '../../shared/insightsNewsletter'
import { INSIGHTS_LAYER_ID, insightsDb, isInsightsRowMissing } from './insightsStore'

/**
 * GDPR-EXPORT UND -LÖSCHUNG DES insights-LAYERS (Plan §9.3 „Retention und
 * Kaskaden"; CLAUDE.md: „Neue Layer mit User-Daten MÜSSEN einen Contributor
 * registrieren").
 *
 * ── VIER BEZIEHUNGEN, VIER VERSCHIEDENE ANTWORTEN ────────────────────────
 * Dieser Layer schreibt über FREMDE Marken, nicht über Konten — er hat
 * deshalb wenig Personenbezug, aber nicht keinen. Es gibt genau vier Wege,
 * auf denen ein Mensch in diesen Tabellen vorkommt:
 *
 *  1. `insights_corrections.contactEmail` — die FREIWILLIG hinterlassene
 *     Adresse eines Korrekturvorschlags (§9.3).
 *  2. `insights_posts.reviewedBy` — die `userId` desjenigen, der eine
 *     Freigabe gezeichnet hat. Ein BETREIBER-Handgriff, kein Inhalt.
 *  3. `insights_brands.claimedBy` — die `userId` desjenigen, der ein Profil
 *     als seine Marke reklamiert hat.
 *  4. `insights_subscribers.emailLower` — die Newsletter-Eintragung (I5a,
 *     §9.3a). Sie ist der zweite echte personenbezogene Inhalt des Layers und
 *     kommt wie der erste von DRAUSSEN: auch sie trägt keine `userId`, nur
 *     eine Adresse.
 *
 * ── DER LESEPFAD IST DIE ADRESSE, NICHT DIE userId ───────────────────────
 * Ein Korrekturvorschlag kommt von DRAUSSEN: die Person hat kein Konto, wenn
 * sie ihn abgibt, und die Zeile trägt deshalb keine `userId`. Die einzige
 * Verbindung zwischen ihr und einem Konto ist die ADRESSE — genau wie bei
 * `brand_invites` und der Warteliste im brand-Layer. Gesucht wird deshalb
 * über `contactEmail === emailLower des Kontos`, und deshalb steht die
 * Adresse KLEINGESCHRIEBEN in der Zeile (Normalisierung im Zod-Schema,
 * `shared/insightsCorrection.ts`): Appwrite vergleicht Zeichen für Zeichen,
 * und eine Zeile mit `Max@Example.COM` fände diese Abfrage nie. Eine still
 * unvollständige Auskunft ist die teuerste Art, eine Auskunftspflicht zu
 * verfehlen.
 *
 * ── WAS IM EXPORT NICHT STEHT ────────────────────────────────────────────
 * Der `ipHash` — und bei der Newsletter-Eintragung ZUSÄTZLICH der `tokenHash`
 * mit seiner Frist: das ist der Schlüssel zu einem offenen Bestätigungs-Link,
 * also ein GEHEIMNIS und kein Datum über die Person. Ein Auskunftspaket, das
 * Geheimnisse mitliefert, ist eine zweite Kopie davon (und reist per Mail).
 * Was der Export über die Eintragung sagt, ist der ZUSTAND: seit wann
 * eingetragen, wann abgemeldet, von welcher Seite, in welcher Sprache.
 * Der `ipHash` ist kein Datum ÜBER die Person, sondern ein Tages-Stempel
 * für den Missbrauchs-Deckel — und er ist bewusst nicht rückrechenbar. Ihn
 * auszuliefern hiesse, eine Zeichenkette in ein Auskunftspaket zu legen, mit
 * der niemand etwas anfangen kann. Ebenso wenig steht dort der INHALT der
 * Beiträge und Markenprofile: sie handeln von fremden Marken und sagen nichts
 * über den Exportierenden. Was von ihm darin steckt, ist die TATSACHE seiner
 * Zeichnung — und die reist als Id mit.
 *
 * ── GELÖSCHT WIRD NICHTS, GELEERT WIRD ALLES ─────────────────────────────
 * Das ist die bewusste Abweichung vom market-Contributor (der Zeilen löscht)
 * und die Übereinstimmung mit den Einladungen im brand-Layer: die
 * Korrektur-Zeile ist der NACHWEIS, dass der Korrekturweg funktioniert — und
 * genau danach fragt Anwaltsfrage 3 (§9.3: „Der ENTSCHEIDUNGS-Eintrag bleibt
 * dauerhaft"). Verschwinden muss die PERSON, nicht der Vorgang: `contactEmail`
 * und `ipHash` werden geleert, der Rest bleibt stehen. Ein gelöschter
 * Korrekturvorgang wäre ein Beleg weniger dafür, dass wir Widerspruch
 * annehmen und entscheiden.
 * Bei der NEWSLETTER-Zeile gilt es ebenso, mit einem Zusatz: sie wird
 * zugleich ABGEMELDET (`unsubscribedAt`) und ihre Token-Felder geleert. Eine
 * Konto-Löschung, die die Adresse aus der Zeile nimmt, aber den Eintrag
 * „aktiv" lässt, wäre eine Liste mit einem Empfänger ohne Adresse — und beim
 * nächsten Versand ein Eintrag, der niemandem gehört. `emailLower` bekommt
 * dabei den PLATZHALTER (`removed:<rowId>`) und nicht '': die Spalte trägt den
 * Unique-Index, und zwei leere Werte wären ein 409 ab der zweiten Löschung.
 * Bei `reviewedBy` und `claimedBy` gilt dasselbe aus einem zweiten Grund:
 * einen Beitrag zu LÖSCHEN, weil sein Freigeber sein Konto schliesst, nähme
 * der Öffentlichkeit einen Text weg, der ihr gehört — und wäre für jeden
 * Betreiber-Admin ein Werkzeug, das er nicht haben soll.
 *
 * ── IDEMPOTENT ───────────────────────────────────────────────────────────
 * Jeder Schritt verzeiht ein 404, eine FEHLENDE TABELLE ebenfalls — auf
 * Instanzen ohne insights-Migration hat dieser Layer nichts, und ein GDPR-Lauf
 * darf daran nicht scheitern (dieselbe Zusage wie im brand- und im
 * market-Contributor). Ein zweiter Lauf findet geleerte Zeilen und
 * terminiert erfolgreich: das Leeren ist wertgleich, nicht zählend.
 */

export const INSIGHTS_USER_DATA_ID = INSIGHTS_LAYER_ID

async function safeListAll<T extends Models.Row>(
  event: H3Event,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await listAllRows<T>(tablesDB, databaseId, tableId, filters)
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return []
    throw error
  }
}

/**
 * Die Adresse des Kontos — sie ist der Schlüssel zu `insights_corrections`
 * (s. Kopf). Ist das Konto schon weg (Löschreihenfolge), sind seine
 * Korrektur-Zeilen nicht mehr zuzuordnen; das ist kein Fehlschlag, sondern
 * die Wahrheit über eine Zeile ohne Konto. Wortgleiches Vorgehen wie in
 * `brandUserData.ts`.
 */
async function accountEmailLower(event: H3Event, userId: string): Promise<string | null> {
  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    return (user.email ?? '').toLowerCase() || null
  }
  catch {
    return null
  }
}

export async function insightsExportUserData(event: H3Event, userId: string): Promise<unknown> {
  const emailLower = await accountEmailLower(event, userId)

  const corrections = emailLower
    ? await safeListAll<InsightsCorrectionRow>(event, INSIGHTS_CORRECTIONS_TABLE, [
        Query.equal('contactEmail', emailLower),
      ])
    : []

  const subscriptions = emailLower
    ? await safeListAll<InsightsSubscriberRow>(event, INSIGHTS_SUBSCRIBERS_TABLE, [
        Query.equal('emailLower', emailLower),
      ])
    : []

  const reviewedPosts = await safeListAll<InsightsPostRow>(event, INSIGHTS_POSTS_TABLE, [
    Query.equal('reviewedBy', userId),
  ])
  const claimedBrands = await safeListAll<InsightsBrandRow>(event, INSIGHTS_BRANDS_TABLE, [
    Query.equal('claimedBy', userId),
  ])

  return {
    // Der `ipHash` fällt heraus (s. Kopf) — der Rest der Zeile bleibt.
    corrections: corrections.map(({ ipHash: _ipHash, ...rest }) => rest),
    /**
     * DIE NEWSLETTER-EINTRAGUNG ALS ZUSTAND, nicht als Zeile (s. Kopf): kein
     * `tokenHash`, keine Frist, kein `ipHash`. Jedes Feld steht EXPLIZIT da —
     * ein `...rest` würde eine künftige Spalte still mit ausliefern, und bei
     * dieser Tabelle ist die nächste Spalte wahrscheinlich wieder ein
     * Geheimnis.
     */
    newsletter: subscriptions.map(row => ({
      email: row.email ?? '',
      locale: row.locale ?? '',
      source: row.source ?? '',
      signedUpAt: row.$createdAt,
      confirmedAt: row.confirmedAt ?? '',
      unsubscribedAt: row.unsubscribedAt ?? '',
    })),
    /**
     * NUR DIE IDS, NICHT DIE BEITRÄGE. Ein redigierter Artikel über eine
     * fremde Marke ist kein personenbezogenes Datum des Freigebers; was ihn
     * betrifft, ist die TATSACHE, dass er gezeichnet hat. Slug und Zustand
     * reisen mit, damit die Auskunft benennbar ist statt aus nackten Ids zu
     * bestehen.
     */
    reviewedPosts: reviewedPosts.map(row => ({ id: row.$id, slug: row.slug, state: row.state })),
    claimedBrands: claimedBrands.map(row => ({ id: row.$id, slug: row.slug, name: row.name })),
  }
}

export async function insightsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const { tablesDB, databaseId } = insightsDb(event)
  let anonymized = 0

  async function clear(tableId: string, rowId: string, data: Record<string, string | null>): Promise<void> {
    try {
      await tablesDB.updateRow({ databaseId, tableId, rowId, data })
      anonymized++
    }
    catch (error) {
      if (!isInsightsRowMissing(error)) throw error
    }
  }

  const emailLower = await accountEmailLower(event, userId)
  if (emailLower) {
    for (const row of await safeListAll<InsightsCorrectionRow>(event, INSIGHTS_CORRECTIONS_TABLE, [
      Query.equal('contactEmail', emailLower),
    ])) {
      // BEIDE Felder in EINEM Schreibvorgang: der `ipHash` ist derselbe
      // Personenbezug wie die Adresse, nur schwächer — ihn stehen zu lassen,
      // während die Adresse geht, wäre eine halbe Löschung.
      await clear(INSIGHTS_CORRECTIONS_TABLE, row.$id, { contactEmail: '', ipHash: '', retentionAt: null })
    }

    /**
     * Die Newsletter-Zeile: Adresse WEG, Eintrag ABGEMELDET, Token-Felder
     * leer, Frist genullt (s. Kopf). IDEMPOTENT: ein zweiter Lauf findet über
     * `emailLower` nichts mehr, weil dort nach dem ersten der Platzhalter
     * steht — genau das macht den Lauf wertgleich statt zählend.
     */
    for (const row of await safeListAll<InsightsSubscriberRow>(event, INSIGHTS_SUBSCRIBERS_TABLE, [
      Query.equal('emailLower', emailLower),
    ])) {
      await clear(INSIGHTS_SUBSCRIBERS_TABLE, row.$id, {
        email: '',
        emailLower: insightsNewsletterAnonymizedEmail(row.$id),
        ipHash: '',
        tokenHash: '',
        tokenExpiresAt: '',
        unsubscribedAt: row.unsubscribedAt || new Date().toISOString(),
        retentionAt: null,
      })
    }
  }

  for (const row of await safeListAll<InsightsPostRow>(event, INSIGHTS_POSTS_TABLE, [
    Query.equal('reviewedBy', userId),
  ])) {
    await clear(INSIGHTS_POSTS_TABLE, row.$id, { reviewedBy: '' })
  }

  for (const row of await safeListAll<InsightsBrandRow>(event, INSIGHTS_BRANDS_TABLE, [
    Query.equal('claimedBy', userId),
  ])) {
    await clear(INSIGHTS_BRANDS_TABLE, row.$id, { claimedBy: '' })
  }

  // `deleted: 0` ist hier kein Versäumnis, sondern die Aussage: dieser Layer
  // löscht keine Zeile für eine Konto-Löschung (s. Kopf).
  return { deleted: 0, anonymized }
}
