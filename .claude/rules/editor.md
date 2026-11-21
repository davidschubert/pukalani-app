---
paths:
  - "**/PostBodyField*"
  - "**/PostBodyEditor*"
  - "**/MessageBody*"
  - "**/InEditor*"
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

## Editor, Markdown-Kopplung, Erwähnungen und Handles

- EDITOR-FUNKTIONEN SIND GESETZT (Davids Vorgabe): `UEditor` (inkl.
  Blockquote fürs Zitieren), `UEditorToolbar`, `UEditorEmojiMenu`,
  `UEditorMentionMenu`, `UEditorSuggestionMenu`, `UEditorDragHandle`. Nichts
  davon selbst bauen; neue Editor-Fähigkeiten docken dort an. Wo `UEditor`
  läuft, zeigt `git grep -ln "<UEditor" -- packages apps`. Für Beiträge ist
  `packages/posts/app/components/PostBodyField.vue` die EINE Schreibfläche
  für Feed-Composer UND Beitrags-Bearbeitung (der Editor darin:
  `PostBodyEditor.vue`) — wer sie ändert, ändert beide Stellen. Nachrichten
  (`packages/messages/app/components/MessageBodyEditor.vue`) und Insights
  (`packages/insights/app/components/InEditor.vue`) folgen den Regeln (1) und
  (2) unten; `InEditor.vue` wird direkt eingebunden, nicht nachgeladen.
- DREI DINGE, DIE MAN NICHT „AUFRÄUMEN" DARF:
  (1) **Der Werkzeug-Vorrat ist an `core/shared/markdown.ts` GEKOPPELT.** Der
  Parser kann fett/kursiv/`code`/Link/h2+h3/Listen/Zitat/Codeblock — mehr
  nicht; alles darüber stünde als ROHER TEXT im Beitrag. Deshalb sind
  strike/underline/Bilder aus dem SCHEMA entfernt, nicht bloß Knöpfe
  versteckt (Tastenkürzel und Einfügen gehen an versteckten Knöpfen vorbei).
  `HorizontalRule` hängt `UEditor` UNBEDINGT an (`starterKit:false` wäre
  Nur-Text) — zu sind daher `enableInputRules`/`enablePasteRules` als
  ERLAUBNISLISTE (fail-closed: eine neue Extension ist automatisch aus) plus
  `transformPastedHTML`.
  (2) **`gfm: false` beim LESEN.** Mit Nuxt UIs Vorgabe `gfm:true` parst
  `marked` `~~alt~~` als Durchstreichung — die Marke gibt es hier nicht, ein
  Bestands-Text verlöre die Zeichen beim bloßen Aufschlagen.
  (3) **Nachgeladen** (`LazyPostBodyEditor`): bis zum ersten `focusin` steht
  dieselbe `UTextarea` am selben `v-model` — keine Attrappe, sie trägt auch,
  wenn das Nachladen scheitert. `UTextarea` gibt kein Fokus-Ereignis nach
  außen, `@focus` daran läuft ins Leere; der Haken sitzt am Wrapper.
- DEN PARSER NICHT „VEREINFACHEN": `@tiptap/markdown` maskiert beim
  Serialisieren hartkodiert ``\ ` * _ [ ] ~`` und macht aus `<>&` Entities.
  Unsichtbar ist das nur, weil der Parser CommonMark-treu ist (F48: Escapes
  aufgelöst, Entities dekodiert, in Code-Spans bewusst nicht) — sonst steht
  `snake\_case` in jedem Beitrag.
- ÖFFNEN UND SPEICHERN OHNE TASTENDRUCK ÄNDERT NICHTS: `bodyToSave`
  (`core/shared/editorBody.ts`) — sonst meldet `posts.editedAt` eine
  Bearbeitung, die der Leser nicht sieht.

- ERWÄHNUNGEN: `UEditorMentionMenu` serialisiert von Haus aus zu
  `[@ id="…" label="…"]` und stünde ROH im Text. Zu ist das durch EINEN
  eigenen Knoten-Serialisierer (`Mention.extend({ renderMarkdown: n => '@' +
  n.attrs.id })` in `PostBodyEditor.vue`) — NIE entfernen: dann bricht nicht
  der Editor, sondern der INHALT. Die Maskierung sitzt nur im Text-Zweig;
  jeder andere Knoten geht durch seinen Handler, dessen Rückgabe wörtlich
  übernommen wird. `@handle` ist gewöhnlicher Text (`@` steht in keiner
  Maskierungsliste) — das PRODUKT hängt am Text, das Menü ist nur Bedienhilfe.
  In Nachrichten (1:1-Gespräch) und Insights sind Erwähnungen aus.
- HANDLES SIND KONTO-WEIT (AH-7, Davids Entscheidung: eine Pukalani-ID = EIN
  Handle überall): Tabelle `account_handles`
  (`packages/system/scripts/migrations/031-account-handles.ts`, Unique auf
  `handleLower` ALLEIN — global, ohne Mandanten-Spalte), Dienst
  `core/server/utils/accountHandles.ts`, Routen `GET`/`PATCH
  /api/account/handle` (in `controlApiPrefixes` als EXAKTER Pfad). Zugriff in
  core, Tabelle in system — dasselbe Muster wie `notify()`. Alte Handles
  bleiben über eine HISTORIEN-Zeile belegt (alte Erwähnungen lösen weiter auf
  dieselbe Person auf). Angezeigt wird hervorgehoben, NICHT verlinkt (es gibt
  keine öffentlichen Profile).
- `community_handles` (system-029) IST ALT-BESTAND: dort wird nichts mehr
  vergeben, aber gelesen — die Auflösungs-Kette in
  `core/server/utils/handles.ts` fragt ZUERST das Konto-Register, erst für den
  Rest den Alt-Bestand (sonst laufen Erwähnungen in Bestands-Beiträgen ins
  Leere).
- KOLLISIONSREGEL DER ÜBERNAHME (Migration 031, pur + getestet in
  `core/shared/handleAdoption.ts`): je Konto der ÄLTESTE eigene aktive Handle,
  vergeben in dieser Reihenfolge — wer zuerst kam, behält; der Zweite bekommt
  KEINEN Eintrag und wählt neu (nie eine automatische Umbenennung).
- DREI DINGE, DIE MAN NICHT VEREINFACHEN DARF:
  (1) Das LESE-PUBLIKUM einer Konto-Zeile ist eine LISTE von Row-Permissions,
  eine `read(label:<communityId>)` je Mitgliedschaft
  (`core/shared/accountHandleAudience.ts`) — angelegt bei der Vergabe,
  nachgetragen beim ersten Auftauchen (`ensureAccountHandleAudience`),
  entzogen in `revokeCommunityLabel`.
  (2) Das Erwähnungs-MENÜ (`/api/handles/search`) braucht ein MITGLIEDER-GATE
  **und** einen Publikums-Filter: Row-Permissions allein reichen NICHT, weil
  ein Leser Labels mehrerer Communities trägt und Appwrite nicht fragt, auf
  welchem Host er steht.
  (3) Die AUFLÖSUNG (`resolveHandleOwners`, Admin-Client) filtert dieselbe
  Zugehörigkeit im Code — sonst wäre ein Beitrag ein Fernzünder für
  Benachrichtigungen an fremde Konten.
  Beweis mit Gegenprobe (jede der drei fällt einzeln):
  `packages/core/scripts/verify-handle-search-boundary.mjs`.
- `@tiptap/extension-mention` EXAKT AUF DIE TIPTAP-LINIE GEPINNT (Katalog,
  kein Caret) und GEMEINSAM mit den `overrides` in `pnpm-workspace.yaml`
  bewegt — dort steht auch das Wechsel-Rezept; ungepinnt löst pnpm neu auf
  und der Lockfile bewegt sich weit. Hintergrund:
  `docs/archiv/COMPOSER-UEDITOR.md`.
