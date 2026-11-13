/**
 * WAS EINE STIMM-ROUTE ZURÜCKGIBT (SEC-031, seit 2026-11-13).
 *
 * Drei Layer haben eine Stimme mit derselben Zähler-Form — Beiträge
 * (`posts/[id]/score`), Kommentare (`comments/[id]/vote`) und Termine
 * (`events/[id]/score`). Alle drei zählen und schreiben die Zähler über die
 * Operator-Klinke, weil die Tabellen kein Schreibrecht für Konten tragen. Bis
 * SEC-031 gaben sie die FRISCH GESCHRIEBENE Zeile vollständig zurück — gelesen
 * an den Row-Permissions vorbei, also mehr, als dieselbe Person über die
 * Leseroute gesehen hätte.
 *
 * Die Oberfläche braucht nach einer Stimme nur die Zähler; den Rest hat sie
 * schon von der Leseroute. Deshalb eine feste Feldauswahl (Erlaubnisliste,
 * kein Weglassen): ein neues Feld an der Zeile wandert so nie von selbst in
 * diese Antwort. Hier im Core, weil die drei Layer einander nicht kennen
 * (A14) — dieselbe Begründung wie bei `upvoteDelta.ts`.
 */

export interface VoteCounts {
  $id: string
  upvotes: number
  downvotes: number
  score: number
}

export function toVoteCounts(row: VoteCounts): VoteCounts {
  return { $id: row.$id, upvotes: row.upvotes, downvotes: row.downvotes, score: row.score }
}
