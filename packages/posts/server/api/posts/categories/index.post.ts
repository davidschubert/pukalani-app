import { Query } from 'node-appwrite'
import { categorySchema } from '../../../../schemas/postCategory'
import { serializeCategoryTranslations } from '../../../../shared/categoryI18n'
import { MAX_CATEGORY_SORT_ORDER, POST_CATEGORIES_TABLE, type PostCategory } from '../../../../shared/types/post'
import { softFail } from '../../../../../core/server/utils/softFail'

/**
 * Kategorie anlegen — Struktur ist Admin-Sache (Davids Konzept Teil 1:
 * „Mitglieder können KEINE Kategorien anlegen"), also `posts.manage`.
 *
 * WER HANDELT (F17/C1c): `actor: 'operator'`, und das ist eine Entscheidung,
 * keine Bequemlichkeit. Zwei Dinge hängen am `actor`, und beide sollen hier
 * NICHT greifen:
 *
 *  1. M13 — die Zahlungssperre friert INHALTE ein. Davids Grenze lautet
 *     ausdrücklich: „offen bleiben alle Owner-Einstellungen (Branding,
 *     Team/Rollen, Publikum, Registrierung) und die Moderation". Eine
 *     Kategorie ist kein Inhalt, sondern der Rahmen, in dem Inhalt entsteht —
 *     dieselbe Sorte Einstellung wie das Branding. Mit `actor: 'member'`
 *     könnte ein Owner mit Zahlungsverzug seine Community nicht mehr ordnen,
 *     obwohl die Sperre ihn zum Zahlen bewegen und nicht aussperren soll.
 *     Die Themen-ANLAGE dagegen bleibt gesperrt: die läuft unverändert über
 *     `POST /api/posts` und ist Inhalt.
 *  2. A5 — wer schreibt, tritt bei. Ein Betreiber im Break-Glass soll durch
 *     das Aufräumen einer Kunden-Community nicht deren Mitglied werden, und
 *     ein Admin IST bereits Mitglied (er hat eine Rolle).
 *
 * `as: 'operator'` ist davon unabhängig nötig: `post_categories` trägt bewusst
 * keine Client-Schreibrechte (Table-Permissions leer, Migration posts-007).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.manage')

  const body = await readValidatedBody(event, categorySchema.parse)
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  /**
   * Vorab-Prüfung auf den Slug, obwohl der Unique-Index (communityId, slug)
   * die Wahrheit ist: der Index wirft einen nackten 409, aus dem die
   * Oberfläche nicht ableiten könnte, WELCHES Feld kollidiert. Der Index
   * bleibt trotzdem die Autorität — diese Abfrage ist die Erklärung, nicht
   * der Schutz (zwei gleichzeitige Anlagen fängt weiterhin nur er).
   */
  const existing = await db.find<PostCategory>(POST_CATEGORIES_TABLE, [Query.equal('slug', body.slug)])
  if (existing) {
    throw createError({ status: 409, statusText: 'Slug already in use', data: { code: 'slug_taken' } })
  }

  /**
   * OHNE ANGABE HINTEN ANHÄNGEN, nicht auf 0 setzen.
   *
   * Seit die Reihenfolge gezogen wird (`PATCH /categories/order`), gibt das
   * Formular keine Zahl mehr mit — und `?? 0` hieße: jede neue Kategorie
   * springt an die SPITZE der Liste, vor die Ordnung, die der Owner gerade von
   * Hand gelegt hat. Neues gehört ans Ende; von dort zieht man es in zwei
   * Sekunden dorthin, wo es hin soll.
   *
   * Eine Zahl im Body gewinnt weiterhin (API-Verträglichkeit); die Liste
   * kostet eine Abfrage, und Kategorien werden selten angelegt.
   */
  const sortOrder = body.sortOrder ?? await nextCategorySortOrder(db)

  const row = await db.create<PostCategory>(POST_CATEGORIES_TABLE, {
    name: body.name,
    slug: body.slug,
    description: body.description ?? '',
    sortOrder,
    active: body.active ?? true,
    // '' = nichts übersetzt (dann gilt überall die Grundfassung). Leere Felder
    // wirft der Serialisierer weg — siehe shared/categoryI18n.ts.
    translations: serializeCategoryTranslations(body.translations),
  }, {
    // Die Struktur ist so öffentlich wie die Inhalte darin: 'public' heißt in
    // einer geschlossenen Community `read(label:<communityId>)` (C18), nicht
    // `any` — die Tür rechnet das aus, diese Route entscheidet nur die ABSICHT.
    read: 'public',
  }).catch((error) => {
    throw toH3Error(error, 'Could not create category')
  })

  setResponseStatus(event, 201)
  return row
})

/** Die nächste freie Position: hinter der letzten vergebenen (0, wenn es noch
 *  keine gibt), gedeckelt auf den Wertebereich der Spalte. */
async function nextCategorySortOrder(db: ReturnType<typeof tenantDb>): Promise<number> {
  const existing = await listCategories(db).catch(softFail('posts:api/posts/categories/index.post:listCategories', [] as PostCategory[]))
  const highest = existing.reduce((max, category) => Math.max(max, category.sortOrder), -1)
  return Math.min(highest + 1, MAX_CATEGORY_SORT_ORDER)
}
