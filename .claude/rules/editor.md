---
paths:
  - "**/PostBodyField*"
  - "**/PostBodyEditor*"
  - "packages/posts/**"
  - "packages/pages/**"
  - "packages/comments/app/**"
  - "packages/core/shared/markdown.ts"
  - "packages/core/shared/editorBody.ts"
  - "packages/core/shared/handleAdoption.ts"
  - "packages/core/shared/accountHandleAudience.ts"
  - "packages/core/server/utils/handles.ts"
  - "packages/core/server/utils/accountHandles.ts"
  - "packages/core/server/api/handles/**"
  - "packages/core/server/api/account/handle*"
  - "pnpm-workspace.yaml"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen. FÜR EDITOR-
  FUNKTIONEN sind sie GESETZT (Davids Vorgabe 2026-08-04): `UEditor`
  (inkl. Blockquote fürs Zitieren), `UEditorToolbar`, `UEditorEmojiMenu`,
  `UEditorMentionMenu`, `UEditorSuggestionMenu`, `UEditorDragHandle`. Nichts
  davon selbst bauen; neue Editor-Fähigkeiten docken dort an. STAND
  2026-08-04: `UEditor` läuft im Seiten-Dashboard (pages), im Changelog-Admin,
  in `TicketModal` UND — seit der Umstellung an diesem Tag — in
  `PostBodyField.vue`, der EINEN Schreibfläche für Feed-Composer und
  Beitrags-Bearbeitung. Wer die Schreibfläche ändert, ändert beide Stellen.
  DREI DINGE, die man nicht „aufräumen" darf:
  (1) **Der Werkzeug-Vorrat ist an `core/shared/markdown.ts` GEKOPPELT.** Der
  Parser kann fett/kursiv/`code`/Link/h2+h3/Listen/Zitat/Codeblock — mehr
  nicht. Alles darüber hinaus stünde als ROHER TEXT im Beitrag, deshalb sind
  strike/underline/Bilder/Erwähnungen aus dem Schema entfernt (nicht bloß
  Knöpfe versteckt: Tastenkürzel und Einfügen gehen an einer versteckten
  Schaltfläche vorbei). `HorizontalRule` hängt `UEditor` UNBEDINGT an
  (`starterKit:false` wäre Nur-Text) — zu sind daher die zwei erreichbaren
  Wege: `enableInputRules`/`enablePasteRules` als ERLAUBNISLISTE (fail-closed,
  eine neue Extension ist damit automatisch aus) plus `transformPastedHTML`.
  (2) **`gfm: false` beim LESEN.** Mit Nuxt UIs Vorgabe `gfm:true` parst
  `marked` `~~alt~~` als Durchstreichung — die Marke gibt es hier nicht, und
  ein Bestands-Beitrag verlöre die vier Zeichen beim blossen AUFSCHLAGEN.
  (3) **Nachgeladen** (`LazyPostBodyEditor`): bis zum ersten `focusin` steht
  dieselbe `UTextarea` am selben `v-model` — keine Attrappe, sie trägt auch,
  wenn das Nachladen scheitert. `UTextarea` gibt kein Fokus-Ereignis nach
  aussen, `@focus` daran läuft ins Leere; der Haken sitzt am Wrapper. Erspart
  169 KiB gzip (≈20 % des Seiten-JS), solange niemand schreibt.
  Der HISTORISCHE Blocker (`@tiptap/markdown` maskiert beim Serialisieren
  hartkodiert ``\ ` * _ [ ] ~`` und macht aus `<>&` Entities) besteht
  weiterhin — er ist nur nicht mehr sichtbar, seit der Parser CommonMark-treu
  ist (F48: Escapes werden aufgelöst, Entities dekodiert, in Code-Spans
  bewusst nicht). Wer den Parser dort „vereinfacht", holt sich `snake\_case`
  in jeden Beitrag zurück. `bodyToSave` (`core/shared/editorBody.ts`) gilt
  weiter: Öffnen und Speichern ohne Tastendruck darf nichts ändern — sonst
  meldet `posts.editedAt` eine Bearbeitung, die der Leser nicht sieht.
  ERWÄHNUNGEN sind seit 2026-08-04 GEBAUT — mit einer Sicherung, die man nicht
  entfernen darf: `UEditorMentionMenu` serialisiert von Haus aus zu
  `[@ id="…" label="…"]` und stünde damit ROH im Beitrag. Zu ist das durch
  EINEN eigenen Knoten-Serialisierer (`Mention.extend({ renderMarkdown: n =>
  '@' + n.attrs.id })`) — nimmt man ihn weg, bricht nicht der Editor, sondern
  der INHALT (Gegenprobe gemessen: 14 von 22 Prüfungen fallen). Die
  Maskierung von `@tiptap/markdown` sitzt NUR im Text-Zweig; jeder andere
  Knoten geht durch seinen Handler, dessen Rückgabe wörtlich übernommen wird.
  `@handle` selbst ist gewöhnlicher Text (`@` steht in keiner Maskierungs-
  liste) — das PRODUKT hängt also am Text, das Menü ist nur Bedienhilfe.
  Handles sind seit AH-7 (2026-08-11, Davids Entscheidung: eine Pukalani-ID =
  EIN Handle überall) KONTO-weit: Tabelle `account_handles` (system-031, Unique
  auf `handleLower` ALLEIN — global, ohne Mandanten-Spalte), Dienst
  `core/server/utils/accountHandles.ts`, Routen `GET`/`PATCH
  /api/account/handle` (in `controlApiPrefixes`, EXAKTER Pfad wie
  `/api/account/activity`). Zugriff in core, Tabelle in system — dasselbe
  Muster wie `notify()`. Alte Handles bleiben über eine HISTORIEN-Zeile belegt,
  damit alte Erwähnungen weiter auf dieselbe Person auflösen. Angezeigt wird
  hervorgehoben, NICHT verlinkt (öffentliche Profile gibt es nicht).
  `community_handles` (system-029, je Community eindeutig) LEBT als ALT-BESTAND
  weiter: dort wird nichts mehr vergeben, aber gelesen — die Auflösungs-Kette
  in `core/server/utils/handles.ts` fragt ZUERST das Konto-Register und erst
  für den Rest den Alt-Bestand (sonst liefen Erwähnungen in Bestands-Beiträgen
  unbemerkt ins Leere). Kollisionsregel der Übernahme (Migration 031, pure +
  getestet in `core/shared/handleAdoption.ts`): je Konto der ÄLTESTE eigene
  aktive Handle, vergeben in dieser Reihenfolge — wer zuerst kam, behält; der
  Zweite bekommt KEINEN Eintrag und wählt neu (nie eine automatische
  Umbenennung).
  DREI DINGE, DIE MAN NICHT VEREINFACHEN DARF: (1) Das LESE-PUBLIKUM einer
  Konto-Zeile ist eine LISTE von Row-Permissions, eine
  `read(label:<communityId>)` je Mitgliedschaft
  (`core/shared/accountHandleAudience.ts`) — angelegt bei der Vergabe,
  nachgetragen beim ersten Auftauchen (`ensureAccountHandleAudience`), entzogen
  in `revokeCommunityLabel`. Sie ersetzt die weggefallene `communityId`-Spalte.
  (2) Das Erwähnungs-MENÜ (`/api/handles/search`) braucht seit AH-7 ein
  MITGLIEDER-GATE **und** einen Publikums-Filter: die Row-Permissions allein
  reichen NICHT, weil ein LESER Labels mehrerer Communities trägt und Appwrite
  nicht fragt, auf welchem Host er steht — ohne Gate stünden A-Mitglieder im
  Menü von B (beim Bau von AH-7 am Beweis aufgefallen). (3) Die AUFLÖSUNG
  (`resolveHandleOwners`, Admin-Client) filtert dieselbe Zugehörigkeit im Code;
  ohne sie wäre ein Beitrag ein Fernzünder für Benachrichtigungen an fremde
  Konten. Beweis: `packages/core/scripts/verify-handle-search-boundary.mjs` —
  inkl. GEGENPROBE (Commit 3d074289: drei Mutationen, drei Rote — Gate,
  Publikums-Filter und Auflösungs-Filter fallen je einzeln).
  `@tiptap/extension-mention` gehört EXAKT auf `3.27.1` gepinnt (Katalog, kein
  Caret): ungepinnt löst pnpm neu auf und der Lockfile bewegt sich um 1898
  Zeilen statt um 6. Messung, Optionen, Nebenbefunde:
  docs/archiv/COMPOSER-UEDITOR.md.
