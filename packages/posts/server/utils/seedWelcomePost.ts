import { Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'
import { POSTS_TABLE, type CommunityPost } from '../../shared/types/post'
import { welcomePostRowId } from '../../shared/welcomePost'

/**
 * DER ERSTE BEITRAG IM FEED (U4 Teil 5, Benchmark-E2: „der erste Zustand darf
 * nicht leer sein").
 *
 * Gerufen vom Wizard-Abschluss NACH der Anlage — aber NICHT direkt: anders als
 * `seedHomePage` (der `pages`-Layer ist für Naht-Layer ausdrücklich erlaubt)
 * darf `onboarding` diesen Produkt-Layer gar nicht importieren. Der Weg führt
 * über die core-Registry `registerCommunityFirstContentProvider`
 * (server/plugins/community-first-content.ts) — A14, durchgesetzt von
 * `pukalani/no-cross-layer-relative`. Beide Richtungen laufen darüber: das
 * SÄEN und das WIEDERERKENNEN (`communityHasAuthoredPost`, unten).
 *
 * ── EHRLICH, NICHT VORGETÄUSCHT ────────────────────────────────────────────
 * `community_posts` hat KEIN „Beispiel"-Flag, und es bekommt hier auch keines:
 * eine Spalte für eine Zeile, die nach fünf Minuten gelöscht wird, wäre eine
 * Migration für nichts. Ehrlich ist der Beitrag trotzdem, und zwar doppelt:
 * er nennt sich im TEXT ein Beispiel von Pukalani und sagt, wie man ihn
 * loswird — und als Autor steht der ECHTE Owner, keine erfundene Person. Kein
 * „Team Pukalani"-Fantasiekonto in einer fremden Community.
 *
 * ── MIT EINEM KLICK LÖSCHBAR, OHNE NEUES WERKZEUG ──────────────────────────
 * Genau deshalb ist `authorId` der Owner: das Löschrecht hängt in diesem Layer
 * ausschließlich an `authorId === user.$id` (`decidePostAuthorAction`), und
 * das Menü der Beitragskarte rechnet mit derselben puren Regel. Der Owner
 * bekommt also den vorhandenen „Löschen"-Eintrag, ohne dass irgendetwas gebaut
 * werden musste. Ein synthetischer Autor hätte einen unlöschbaren Beitrag
 * ergeben — der Fehler, den der Demo-Seed macht (`seed-demo-morgenlicht.mjs`,
 * dort folgenlos, hier fatal).
 *
 * ── `type: 'post'`, NICHT `'poll'` ─────────────────────────────────────────
 * Eine Umfrage mit fremden Stimmen ist nicht mehr bearbeitbar
 * (`poll_locked`). Ein Beispiel, das sich nicht mehr anfassen lässt, wäre das
 * Gegenteil des Zwecks.
 *
 * ── PERMISSIONS SIND PFLICHT ───────────────────────────────────────────────
 * Anders als bei `pages` (dort liest nur der Server) steht `community_posts`
 * auf `rowSecurity: true`: eine Zeile OHNE Permissions ist für alle unsichtbar,
 * auch für ihren Autor. `read(any)` ist hier korrekt, weil eine frisch
 * angelegte Community `audience: 'public'` trägt (onboardingProvision) —
 * dieselbe Permission, die die normale Anlege-Route für sie setzt. Wird das
 * Lese-Publikum später umgestellt, zieht die vorhandene Umstellung diese Zeile
 * mit, wie jede andere auch.
 */

const MESSAGES: Record<string, Record<string, unknown>> = { de, en }

/** Punktgetrennten Schlüssel im Wörterbuch dieses Layers nachschlagen. */
function lookup(messages: Record<string, unknown>, key: string): string | null {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : null
}

export interface WelcomePostText {
  title: string
  body: string
}

export interface WelcomePostTextInput {
  /** Name der Community (aus dem Wizard). */
  siteName: string
  /** Beschreibung aus dem Wizard — leer/fehlend lässt den Absatz weg. */
  description?: string
  /** Kategorie-Schlüssel aus dem Wizard (SITE_CATEGORIES). */
  category?: string
  locale: string
}

/**
 * Der Text, pur und ohne Server — gebaut aus den drei Zutaten, die der Wizard
 * ohnehin erhoben hat (Name · Beschreibung · Kategorie). Die Kategorie war
 * bis hierher reine Marktforschung (Trichter-G1); jetzt trägt sie eine Zeile,
 * die zur Sache des Kunden passt.
 *
 * ÜBERSETZT WIRD AUS DER LOCALE-DATEI DIESES LAYERS, nicht aus einer zweiten
 * Liste daneben — dasselbe Verfahren und derselbe Grund wie beim
 * Abzeichen-Text der Benachrichtigungs-Mail (`server/plugins/
 * notification-text.ts`): eine Server-Kopie bliebe beim nächsten Umbenennen
 * zurück, und der Fehler fiele niemandem auf.
 *
 * DIE KATEGORIE-ZEILE IST DEKORATION, KEINE FUNKTION: ein unbekannter
 * Schlüssel (umbenannte Kategorie, fehlende Übersetzung) lässt sie weg, statt
 * einen rohen Schlüssel in den Beitrag zu schreiben. Dass alle acht
 * Kategorien eine Zeile haben, sichert stattdessen ein Test.
 */
export function buildWelcomePostText(input: WelcomePostTextInput): WelcomePostText {
  const locale = input.locale === 'de' ? 'de' : 'en'
  const messages = MESSAGES[locale] ?? MESSAGES.en!
  const t = (key: string) => lookup(messages, `posts.welcome.${key}`) ?? ''

  const description = input.description?.trim()
  const categoryLine = input.category ? lookup(messages, `posts.welcome.categories.${input.category}`) : null

  const body = [
    ...(description ? [description, ''] : []),
    t('feedIntro'),
    ...(categoryLine ? ['', categoryLine] : []),
    '',
    t('exampleNote'),
  ].join('\n')

  return { title: t('title').replace('{name}', input.siteName), body }
}

export interface SeedWelcomePostInput {
  /** Zeilen-Scope im Pool (`communities.tenantId`) — ohne ihn wird nichts geschrieben. */
  tenantId: string
  /** Appwrite-Id des Owners: Autor UND damit der, der löschen darf. */
  ownerUserId: string
  /** Anzeigename des Owners (leer erlaubt — die Spalte hat Default ''). */
  ownerName: string
  siteName: string
  description?: string
  category?: string
  locale: string
  /**
   * Zeilen-Id der gesäten ersten Kategorie (`seedDefaultCategory`), leer wenn
   * die Saat nicht griff. Sie macht aus dem Beispiel-Beitrag zugleich das
   * erste THEMA: ohne `categoryId` erscheint er nur im Feed, und Discussions
   * stünde am Tag eins leer daneben — zwei Produkte, von denen eines beim
   * Anlegen bedacht wurde und das andere nicht.
   */
  categoryId?: string
}

export async function seedWelcomePost(event: H3Event, input: SeedWelcomePostInput): Promise<CommunityPost | null> {
  // Ohne Scope wird NICHTS geschrieben — im Pool wäre eine Zeile ohne
  // communityId die Zeile von allen (wörtlich dieselbe Sicherung wie in
  // seedHomePage).
  if (!input.tenantId || !input.ownerUserId) {
    logEvent('error', 'posts.seed_welcome_without_scope', { locale: input.locale })
    return null
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const now = new Date().toISOString()
  const { title, body } = buildWelcomePostText(input)

  try {
    /**
     * `communityId` STEHT BEWUSST NICHT IN `CommunityPost` — „sie gehört der
     * Datentür" (shared/types/post.ts). Genau deshalb steht sie hier im
     * Generic: dieser Seed läuft auf dem KONTROLL-Host, wo es keinen
     * Mandanten-Kontext und damit keine Tür gibt, die stempeln könnte. Der
     * Scope kommt als Argument — dieselbe begründete Ausnahme wie in
     * `seedHomePage`, nur muss sie hier im Typ ausgesprochen werden statt
     * still zu passieren. Ohne diese Spalte wäre die Zeile im Pool die Zeile
     * von allen.
     */
    return await admin.tablesDB.createRow<CommunityPost & { communityId: string }>({
      databaseId,
      tableId: POSTS_TABLE,
      // ABLEITBARE Id (shared/welcomePost.ts): sie ist hier die Idempotenz —
      // es gibt keinen Unique-Index, an dem ein Doppelklick sonst bräche —
      // und sie ist zugleich das, woran die Willkommens-Checkliste den
      // Beispiel-Beitrag beim Zählen wiedererkennt.
      rowId: welcomePostRowId(input.tenantId),
      // ALLE Felder ausdrücklich: der Typ verlangt sie (posts-011), damit
      // genau diese Entscheidung hier steht und nicht stillschweigend aus
      // Spalten-Defaults fällt.
      data: {
        type: 'post',
        title,
        body,
        authorId: input.ownerUserId,
        authorName: input.ownerName,
        status: 'published',
        scheduledAt: null,
        publishedAt: now,
        lastActivityAt: now,
        pollOptions: null,
        pollEndsAt: null,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        // Die gesäte erste Kategorie (shared/defaultCategory.ts) — damit ist
        // der Beispiel-Beitrag zugleich das erste Thema. '' bleibt der
        // Rückfall, wenn die Kategorie-Saat nicht griff: dann steht er wie
        // bisher nur im Feed, statt dass die ganze Anlage daran scheitert.
        categoryId: input.categoryId ?? '',
        pinned: false,
        closed: false,
        solved: false,
        editedAt: null,
        communityId: input.tenantId,
      },
      permissions: [
        Permission.read(Role.any()),
      ],
    })
  }
  catch (error) {
    // 409 = die Zeile gibt es schon (Doppelklick auf „Community anlegen").
    // Das ist kein Fehler, das ist der gewünschte Ausgang — dieselbe Lesart
    // wie in seedLegalPages/seedGuidelinesPage.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) return null
    throw error
  }
}

/**
 * HAT HIER JEMAND SELBST GESCHRIEBEN? — die Lese-Hälfte desselben Vertrags
 * (`CommunityFirstContentProvider.hasAuthored`), gebraucht vom ersten Punkt
 * der Willkommens-Checkliste.
 *
 * DIE SAAT ZÄHLT AUSDRÜCKLICH NICHT MIT. Ohne diese Ausnahme hakte die Liste
 * ihren ersten Punkt mit unserem eigenen Beispiel ab und gratulierte dem Owner
 * zu einem Beitrag, den er nicht geschrieben hat.
 *
 * Erkannt wird das Beispiel an seiner ABLEITBAREN Zeilen-Id
 * (`welcomePostRowId`). Verworfene Alternativen: „Anzahl > 1" wäre falsch,
 * sobald der Owner das Beispiel löscht (dann zählte sein erster echter Beitrag
 * als 1 und der Punkt bliebe für immer offen); eine Marker-SPALTE wäre eine
 * Migration für eine Zeile, die nach fünf Minuten gelöscht wird.
 *
 * KOSTEN: eine Zählabfrage (`limit(1)`, index-gestützt über communityId), und
 * NUR im Grenzfall ein zweiter Blick — bei 0 Zeilen steht „noch nichts" fest,
 * bei ≥2 Zeilen „jemand hat geschrieben" (mehr als die eine Saat kann es ohne
 * einen echten Beitrag nicht geben). Nur bei GENAU einer Zeile ist zu klären,
 * welche das ist.
 *
 * Der Soft-Delete des Beitrags-Löschens ist mitgedacht: eine gelöschte Zeile
 * bleibt bestehen (`status: 'deleted'`), also zählt sie weiter — wer sein
 * Beispiel löscht, bekommt den Punkt trotzdem nicht geschenkt.
 *
 * `as: 'operator'`, weil auch ein Entwurf oder ein ausgeblendeter Beitrag
 * geschrieben wurde; der Mandanten-Filter der Datentür bleibt die Grenze.
 */
export async function communityHasAuthoredPost(event: H3Event): Promise<boolean | null> {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') return null

  const db = tenantDb(event, { as: 'operator', actor: 'member' })
  const total = await db.count(POSTS_TABLE).catch(() => null)
  if (total === null) return null
  if (total === 0) return false
  if (total > 1) return true

  // `get()` wirft, wenn es die Zeile nicht gibt ODER sie einem fremden
  // Mandanten gehört — beides heißt hier dasselbe: das ist nicht unsere Saat.
  const seeded = await db.get(POSTS_TABLE, welcomePostRowId(tenant.tenantId))
    .then(() => true)
    .catch(() => false)
  return !seeded
}
