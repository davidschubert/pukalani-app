import type { CommunityPost } from './types/post'

/**
 * Der Schnappschuss eines Beitrags im Activity-Feed (`metadata.snippet`):
 * der Titel, sonst die ersten 140 Zeichen des Textes.
 *
 * EINE Regel für Veröffentlichen UND Bearbeiten (SEC-032, 2026-11-15): seit
 * die Bearbeitung den Schnappschuss nachzieht, gibt es drei Stellen
 * (`index.post.ts`, `publishDuePosts`, `[id].patch.ts`) — eine abweichende
 * Kürzung würde einen bearbeiteten Beitrag im Feed anders aussehen lassen als
 * einen frischen.
 */
export function postActivitySnippet(post: Pick<CommunityPost, 'title' | 'body'>): string {
  return post.title || post.body.slice(0, 140)
}
