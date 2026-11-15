import { Permission, Role } from 'node-appwrite'
import type { Comment } from '../../shared/types/comment'

/**
 * DER GRABSTEIN EINES KOMMENTARS — EINE Quelle für beide Wege, die einen
 * Kommentar löschen (SEC-032, 2026-11-15): das eigene Löschen
 * (`api/comments/[id].delete.ts`) und die Kontolöschung
 * (`userDataContributor.ts`).
 *
 * Davids Entscheidung: „Gelöschte Kommentare, Übersetzungen und Vorschauen
 * werden wirklich geleert." Bis hierher setzte das eigene Löschen nur
 * `status: 'deleted'` — Text, Name, Konto-Id und der Übersetzungs-Cache
 * blieben in der Zeile, direkt bei Appwrite und über Realtime für jeden
 * lesbar, der den Kommentar vorher lesen durfte; die Liste blankte nur bei
 * der Auslieferung. Die Kontolöschung leerte den Text, vergaß aber die
 * Übersetzung (dieselben Sätze, in bis zu sechs Sprachen).
 *
 * Die STRUKTUR bleibt: die Zeile bleibt stehen (Antworten anderer hängen über
 * `parentId`/`rootId` an ihr), ebenso Ziel, Tiefe und Zähler. Der INHALT nicht.
 */

/**
 * Die Datenfelder des Grabsteins. `translations: ''` ist der Leerwert der
 * Spalte (comments-020, „''/fehlend = nichts übersetzt"), derselbe, den die
 * Bearbeitung beim echten Ändern schreibt.
 */
export const COMMENT_TOMBSTONE_DATA = {
  status: 'deleted',
  content: '',
  authorName: '',
  authorId: '',
  editedAt: null,
  translations: '',
} as const

/**
 * Die Rechte des Grabsteins: die des AUTORS fallen (`update`/`delete` für sein
 * Konto), das LESE-Publikum bleibt — der Platzhalter „[gelöscht]" ist so
 * sichtbar wie der Kommentar vorher und hält den Faden zusammen.
 *
 * FILTERN statt neu setzen (C18): wer den Kommentar lesen durfte, entscheidet
 * die Community (`read(any)` oder `read(label:<communityId>)`), und die
 * Kontolöschung läuft über ALLE Communities. Ein festes Publikum hätte die
 * Grabsteine einer geschlossenen Community öffentlich gemacht und
 * ausgeblendete (ohne Leserecht) wieder lesbar.
 */
export function commentTombstonePermissions(permissions: readonly string[], authorId: string): string[] {
  if (!authorId) return [...permissions]
  const update = Permission.update(Role.user(authorId))
  const remove = Permission.delete(Role.user(authorId))
  return permissions.filter(permission => permission !== update && permission !== remove)
}

/**
 * Wie ein gelöschter Kommentar eine ÖFFENTLICHE Antwort verlässt — eine
 * Feldauswahl, keine Kopie der Zeile. Vorher hieß es `{ ...row, content: '' }`:
 * damit reisten der Übersetzungs-Cache (der Text in anderen Sprachen),
 * `$permissions` (darin `update("user:<id>")` — also der Autor), `targetUrl`,
 * `editedAt` und jede künftige Spalte mit. Ein neues Feld wird hier nicht von
 * selbst öffentlich.
 *
 * Übrig bleibt, was der FADEN braucht: Id, Zeitpunkte, Platz im Baum, Ziel,
 * Status und die Zähler, die die Oberfläche zeigt. Leere Werte statt
 * fehlender Felder, wo der Typ sie verlangt (`targetUrl`, `editedAt`: `null`;
 * `$permissions`: `[]`) — die Oberfläche liest dieselbe Form wie bei jedem
 * anderen Kommentar.
 */
export function toDeletedCommentPlaceholder(row: Comment): Comment {
  return {
    $id: row.$id,
    $sequence: row.$sequence,
    $createdAt: row.$createdAt,
    $updatedAt: row.$updatedAt,
    $databaseId: row.$databaseId,
    $tableId: row.$tableId,
    $permissions: [],
    targetId: row.targetId,
    targetType: row.targetType,
    parentId: row.parentId,
    rootId: row.rootId,
    depth: row.depth,
    status: 'deleted',
    content: '',
    authorName: '',
    authorId: '',
    targetUrl: null,
    editedAt: null,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.score,
  }
}

/**
 * Ein Kommentar für eine ÖFFENTLICHE Antwort (Liste, eigenes Löschen).
 *
 * Gelöscht ⇒ der Platzhalter oben. Sonst die Zeile, aber OHNE `$permissions`
 * (als leere Liste, der Typ verlangt das Feld): die Rechte-Liste nennt den
 * Autor als `update("user:<id>")`, und die Oberfläche liest sie nirgends —
 * „darf ich bearbeiten" entscheidet dort `authorId === ich`. Die Liste ist für
 * Gäste außerdem im Microcache, die Rechte wären also bis zu 10 s lang
 * Allgemeingut.
 */
export function toPublicCommentRow(row: Comment): Comment {
  if (row.status === 'deleted') return toDeletedCommentPlaceholder(row)
  return { ...row, $permissions: [] }
}
