<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import type { HandleSuggestion } from '../../../core/shared/types/handle'
import type { TopicLinkSuggestion } from '../../shared/types/post'
import { POST_EMOJI_ITEMS } from '../utils/emojiMenuItems'

/**
 * DER Beitrags-Editor — `UEditor` im Markdown-Modus (Davids Editor-Vorgabe vom
 * 2026-08-04, gebaut am selben Tag).
 *
 * NICHT DIREKT BENUTZEN: die Schreibfläche ist `PostBodyField`. Diese Datei
 * existiert getrennt, damit sie NACHGELADEN werden kann — Tiptap wiegt
 * mehrere hundert Kilobyte und darf nicht im Bündel jeder eingeloggten
 * Feed-Ansicht stehen (Muster K4: `LazyThemePickerModal`). Der Feed montiert
 * `PostBodyField` eifrig; erst wer wirklich schreibt, holt diesen Teil.
 *
 * ── DAS FORMAT ÄNDERT SICH NICHT ───────────────────────────────────────────
 * Gespeichert wird weiterhin das Markdown-SUBSET aus core/shared/markdown.ts,
 * Spalte `community_posts.body`. Keine Migration, keine zweite Darstellung:
 * was hier herauskommt, rendert `MarkdownContent` — derselbe Parser wie
 * bisher, dieselbe Sicherheitsgrenze (kein v-html).
 *
 * ── DER EDITOR DARF NUR, WAS DER PARSER KANN ───────────────────────────────
 * Das ist der ganze Punkt dieser Konfiguration, und es reicht NICHT, Knöpfe
 * wegzulassen: ein Tastenkürzel oder ein Einfügen aus der Zwischenablage geht
 * an einer fehlenden Schaltfläche vorbei. Deshalb wird abgeschaltet, was der
 * Renderer nicht kennt:
 *  - `strike`/`underline` ⇒ Marke gar nicht erst im Schema (Strg+Shift+X,
 *    Strg+U laufen ins Leere, `<s>`/`<u>` aus der Zwischenablage verlieren
 *    nur ihre Auszeichnung, der Text bleibt);
 *  - `heading: { levels: [2, 3] }` ⇒ h1 und h4+ existieren nicht; ein
 *    eingefügtes `<h1>` wird zum Absatz (der Parser kennt nur h2/h3, die
 *    Seiten-Überschrift ist die h1);
 *  - `:image="false"`, `:mention="false"` ⇒ beide Knoten fehlen im Schema;
 *  - Tabellen und Aufgabenlisten sind im `StarterKit` gar nicht enthalten.
 *
 * ZWEI REST-STELLEN, die die Bibliothek nicht hergibt, mit ihrer Behandlung:
 * 1. `HorizontalRule` hängt `UEditor` UNBEDINGT an (Editor.vue: `starterKit
 *    !== false && HorizontalRule.extend(...)`), und `starterKit: false` wäre
 *    Nur-Text — also alles andere weg. Die zwei Wege dorthin sind deshalb
 *    EINZELN zu: die Eingaberegel `---` steht nicht auf der Erlaubnisliste
 *    unten, und `<hr>` aus der Zwischenablage entfernt `transformPastedHTML`.
 *    Bleibt der Programm-Befehl, den keine Schaltfläche auslöst; käme doch
 *    eine Linie zustande, stünde im Beitrag sichtbar `---` — wie heute in der
 *    Textfläche auch, also unschön, aber nichts Unbekanntes.
 * 2. `gfm: false` beim Markdown-LESEN (Vorgabe von `UEditor` wäre `true`):
 *    mit GFM parst `marked` `~~alt~~` als Durchstreichung — die Marke gibt es
 *    hier nicht, sie fiele weg, und aus `~~alt~~` würde beim Speichern
 *    `alt`. Ein bestehender Beitrag verlöre also Zeichen, bloß weil ihn
 *    jemand aufschlägt. Ohne GFM bleibt es Text und kommt als `\~\~alt\~\~`
 *    zurück, was der Parser wieder zu `~~alt~~` macht. Dasselbe gilt für
 *    Tabellen-Zeilen (`| a | b |`).
 *
 * ── DIE ERLAUBNISLISTE IST FAIL-CLOSED ─────────────────────────────────────
 * `enableInputRules`/`enablePasteRules` nehmen statt `true` eine LISTE von
 * Erweiterungen (`isExtensionRulesEnabled` in @tiptap/core). Was nicht
 * dasteht, hat keine Eingabe-Automatik. Bringt eine künftige @nuxt/ui-Version
 * eine neue Erweiterung mit, ist sie damit still AUS statt still AN — die
 * richtige Richtung für einen Editor, der ein Subset bedienen soll.
 *
 * ── ERWÄHNUNGEN GEHEN — GETIPPT (seit 2026-08-04) ──────────────────────────
 * `@handle` ist in diesem Produkt GEWÖHNLICHER TEXT (core/shared/mentions.ts).
 * Wer hier `@david` tippt, speichert genau `@david`: `@` steht in KEINER der
 * beiden hartkodierten Listen von `@tiptap/markdown` (maskiert werden
 * `\ ` * _ [ ] ~`, kodiert werden `< > &`), und der Rundlauf
 * parse → serialize ist zeichengleich (nachgemessen). Die Auflösung,
 * die Hervorhebung und die Benachrichtigung hängen daran und funktionieren
 * ohne jede Editor-Erweiterung.
 *
 * ── `UEditorMentionMenu`: DIE BEQUEMLICHKEIT, NICHT DAS FORMAT (2026-08-05) ─
 * Das Menü ist eine TIPPHILFE und sonst nichts. Es ändert weder das
 * Speicherformat noch die Auflösung noch die Benachrichtigung — wer den Namen
 * von Hand tippt, bekommt exakt dasselbe Ergebnis. Genau deshalb durfte es
 * ein eigener, später Schnitt sein.
 *
 * DER EINE PUNKT, AN DEM ES KAPUTTGEHT, ist die Serialisierung. Das Menü fügt
 * einen mention-KNOTEN ein, und der serialisiert von Haus aus zu
 * `[@ id="…" label="…"]` — die Klammer-Syntax, die unser Parser roh
 * durchreicht (gemessen, nicht vermutet: siehe unten). Die Maskierung von
 * `@tiptap/markdown` sitzt AUSSCHLIESSLICH im Zweig `node.type === 'text'` von
 * `renderNodeToMarkdown`; jeder andere Knoten geht über
 * `handler.renderMarkdown(node, …)`, und dessen Rückgabe wird WÖRTLICH
 * übernommen. `MENTION_AS_PLAIN_TEXT` unten nutzt genau das.
 *
 * WARUM `.extend()` UND NICHT `.configure()`: `renderMarkdown` ist ein
 * EXTENSION-FELD, kein Options-Feld — `MarkdownManager.registerExtension`
 * liest es über `getExtensionField(extension, 'renderMarkdown')`. Über
 * `:mention="{ … }"` (das @nuxt/ui an `Mention.configure()` weiterreicht) ist
 * es deshalb NICHT erreichbar. Daraus folgt zwingend `:mention="false"` plus
 * die eigene Erweiterung über `:extensions` — und daraus die direkte
 * Abhängigkeit `@tiptap/extension-mention`, exakt auf die Version von
 * @nuxt/ui gepinnt (Begründung im Katalog, Wächter `check:single-copy`).
 *
 * GEMESSEN (DOM-frei über `MarkdownManager.serialize`, 2026-08-05):
 *   Mention unverändert          → `Hallo [@ id="david" label="david"] hier`
 *   Mention + renderMarkdown     → `Hallo @david hier`
 * Ein Knoten wird dabei NICHT maskiert: `@erika_muster` bleibt beim Einfügen
 * über das Menü genau das, während derselbe Name GETIPPT als `@erika\_muster`
 * gespeichert wird. Beide lösen auf dieselbe Person auf, weil der Renderer
 * über den AST geht und Escapes vorher auflöst (shared/mentions.ts, F48) —
 * das Menü liefert also nebenbei den saubereren Text.
 *
 * ── DER ZUTRÄGER FILTERT, NICHT DER BROWSER (`ignore-filter`) ──────────────
 * `GET /api/handles/search` liefert höchstens acht aktive Namen DIESER
 * Community (Session-Client, `read(label:<communityId>)` — die Liste aller
 * Namen ist die Mitgliederliste). Die eingebaute Fuzzy-Filterung von
 * `useEditorMenu` würde dieses Ergebnis ein zweites Mal sieben, und zwar
 * gegen einen Suchbegriff, der der Antwort um eine Netzwerkrunde VORAUS ist.
 * `ignore-filter` schaltet sie ab. Das ist hier kein Geschmack: nur in diesem
 * Zweig beobachtet `useEditorMenu` die `items` überhaupt (`watch`) und öffnet
 * das Menü nach, wenn Treffer NACHTRÄGLICH eintreffen. Ohne das Flag würde
 * `filteredItems` allein bei Tastendrücken gesetzt — eine Antwort, die nach
 * dem letzten Anschlag ankommt, käme nie an.
 *
 * ── DREI DINGE, DIE DAS MENÜ BEWUSST NICHT TUT ─────────────────────────────
 * 1. Ein nacktes `@` zeigt NICHTS. Die leere Anfrage wird nicht gestellt,
 *    denn sie hätte zwei Bedeutungen: „gerade `@` getippt" UND „Menü beendet"
 *    (`onExit` setzt den Suchbegriff zurück). Das erspart nebenbei, dass ein
 *    einzelnes Zeichen die Mitgliederliste aufblättert.
 * 2. `@` MITTEN IM WORT löst nichts aus — `e@mail` bleibt eine Adresse. Das
 *    kommt von `allowedPrefixes: [' ']` in @tiptap/suggestion und deckt sich
 *    mit der linken Flanke von MENTION_RE in shared/mentions.ts.
 * 3. Es gibt KEINE neuen i18n-Texte. Das Menü zeigt ausschließlich Handles,
 *    und die sind Eigennamen.
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  /** Cursor beim Montieren ans Textende setzen (Bearbeiten-Fall). */
  autofocus?: boolean
  /** Name der Schreibfläche für Hilfsmittel — siehe `PostBodyField`. */
  label?: string
}>(), { placeholder: '', autofocus: false, label: undefined })

const model = defineModel<string>({ required: true })

const { t } = useI18n()

/**
 * Genau das Subset, in derselben Reihenfolge wie im Seiten-Editor (pages) —
 * zwei Schreibflächen für dasselbe Format sollen gleich aussehen.
 * Jeder Knopf trägt `aria-label` UND Tooltip: er zeigt nur ein Symbol.
 */
const toolbarItems = computed<EditorToolbarItem[]>(() => ([
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b', 'aria-label': t('posts.editor.bold'), tooltip: { text: t('posts.editor.bold') } },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic', 'aria-label': t('posts.editor.italic'), tooltip: { text: t('posts.editor.italic') } },
  { kind: 'mark', mark: 'code', icon: 'i-ph-code-simple', 'aria-label': t('posts.editor.code'), tooltip: { text: t('posts.editor.code') } },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two', 'aria-label': t('posts.editor.heading2'), tooltip: { text: t('posts.editor.heading2') } },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three', 'aria-label': t('posts.editor.heading3'), tooltip: { text: t('posts.editor.heading3') } },
  { kind: 'bulletList', icon: 'i-ph-list-bullets', 'aria-label': t('posts.editor.bulletList'), tooltip: { text: t('posts.editor.bulletList') } },
  { kind: 'orderedList', icon: 'i-ph-list-numbers', 'aria-label': t('posts.editor.orderedList'), tooltip: { text: t('posts.editor.orderedList') } },
  { kind: 'link', icon: 'i-ph-link', 'aria-label': t('posts.editor.link'), tooltip: { text: t('posts.editor.link') } },
  { kind: 'blockquote', icon: 'i-ph-quotes', 'aria-label': t('posts.editor.quote'), tooltip: { text: t('posts.editor.quote') } },
  { kind: 'codeBlock', icon: 'i-ph-code', 'aria-label': t('posts.editor.codeBlock'), tooltip: { text: t('posts.editor.codeBlock') } },
]))

/** Siehe Kopf: was der Renderer nicht kann, kommt gar nicht erst ins Schema. */
const starterKit = { strike: false as const, underline: false as const, heading: { levels: [2, 3] as (2 | 3)[] } }

/** Siehe Kopf, Punkt 2 — GFM würde bestehende Zeichen verschlucken. */
const markdown = { markedOptions: { gfm: false } } as const

/**
 * Erlaubnisliste für Eingabe- und Einfüge-Automatik (siehe Kopf). `horizontalRule`
 * fehlt bewusst: `---` bleibt damit getippter Text statt einer Linie.
 */
const RULE_EXTENSIONS = [
  'bold', 'italic', 'code', 'codeBlock', 'heading',
  'bulletList', 'orderedList', 'blockquote', 'link',
]

/**
 * Der zweite Weg zu einer Trennlinie (siehe Kopf, Punkt 1). Bewusst eine
 * Zeichenketten-Ersetzung: `transformPastedHTML` bekommt das rohe HTML, BEVOR
 * ProseMirror es liest — das kostet keine eigene Tiptap-Abhängigkeit.
 */
const editorProps = computed(() => ({
  transformPastedHTML: (html: string) => html.replace(/<hr\b[^>]*>/gi, ''),
  // Die Schreibfläche hatte eine Rolle (`textbox`, von Tiptap), aber keinen
  // Namen (UX-004): ein Hilfsmittel las nur „Textfeld". `UEditor` mischt
  // diese Attribute mit seinen eigenen (defu), es geht also nichts verloren.
  attributes: {
    'aria-multiline': 'true',
    ...(props.label ? { 'aria-label': props.label } : {}),
  },
}))

/**
 * Der Mention-Knoten, der zu GEWÖHNLICHEM TEXT serialisiert — siehe Kopf.
 * Das ist die einzige Zeile dieses Pakets, an der das Speicherformat hängt.
 *
 * `attrs.id` und NICHT `attrs.label`: beide tragen laut
 * `/api/handles/search` denselben Wert, aber `id` ist das Feld, das die Route
 * als Vergleichsform zusagt. Fehlt es wider Erwarten, fällt der Knoten auf
 * eine leere Zeichenkette zurück — lieber nichts im Beitrag als `@undefined`.
 */
/**
 * Wie ein eingefügter Knoten IM EDITOR aussieht (nicht, wie er gespeichert
 * wird — das macht `renderMarkdown`).
 *
 * Der Token eines Themen-Verweises trägt sein `#` bereits; ein Handle trägt
 * sein `@` nie. Deshalb wird nur vorangestellt, was noch fehlt.
 */
function mentionNodeLabel(attrs: Record<string, unknown>): string {
  const char = typeof attrs.mentionSuggestionChar === 'string' ? attrs.mentionSuggestionChar : '@'
  const text = attrs.label ?? attrs.id
  if (typeof text !== 'string' || !text) return char
  return text.startsWith(char) ? text : `${char}${text}`
}

const MENTION_AS_PLAIN_TEXT = Mention.extend({
  /**
   * ── ZWEI MENÜS, EIN KNOTEN (F57, Themen-Verlinkung) ──────────────────────
   * `UEditorMentionMenu` fügt IMMER `type: 'mention'` ein — auch das
   * `#`-Menü. Ein eigener Knotentyp wäre also gar nicht erreichbar, ohne den
   * `onSelect` der Komponente zu ersetzen. Er ist auch nicht nötig: das
   * auslösende Zeichen reist als Attribut mit (`mentionSuggestionChar`, von
   * `@tiptap/extension-mention` deklariert und beim Einfügen gesetzt), und
   * daran unterscheidet dieser eine Serialisierer die beiden Fälle.
   *
   * `#` ⇒ `attrs.id` ist der FERTIGE Token, den `/api/posts/discussions/
   * link-search` gebildet hat (`#<id>-<deko>`), und wird WÖRTLICH übernommen —
   * die Route ist die einzige Stelle, die Id und Slug kennt.
   * `@` ⇒ `attrs.id` ist der nackte Handle, das `@` kommt hierher.
   *
   * Fehlt `id` wider Erwarten, bleibt es bei der leeren Zeichenkette: lieber
   * nichts im Beitrag als `@undefined`.
   */
  renderMarkdown: (node) => {
    const value = node.attrs?.id
    if (typeof value !== 'string' || !value) return ''
    return node.attrs?.mentionSuggestionChar === '#' ? value : `@${value}`
  },

  /**
   * NUR DIE ANZEIGE IM EDITOR, nicht das Speicherformat.
   *
   * Die Vorgabe von `@tiptap/extension-mention` nimmt das Zeichen aus der
   * `suggestions`-Konfiguration — die hier LEER ist (die Suggestion-Plugins
   * stellt `useEditorMenu` von @nuxt/ui, nicht die Extension). `null` fällt
   * dort auf `'@'` zurück, ein gerade eingefügter Themen-Verweis sähe also bis
   * zum nächsten Laden aus wie eine Erwähnung. Genommen wird deshalb das
   * Attribut am KNOTEN.
   *
   * `suggestions: [{ char: '#' }, …]` wäre der naheliegende Weg gewesen und
   * ist bewusst NICHT gewählt: die Extension legt daraus eigene
   * Suggestion-Plugins an, die mit denen der Menü-Komponenten kollidierten.
   */
  addOptions(): MentionOptions {
    return {
      ...(this.parent?.() ?? {}) as MentionOptions,
      // Array-Form statt schlichtem String: die Laufzeit nähme beides, der
      // Typ nur diese. `options.HTMLAttributes` trägt an dieser Stelle bereits
      // `data-type` und die zusammengeführten Attribute (der Wrapper mergt sie
      // vor dem Aufruf) — genau wie in der Vorgabe der Extension.
      renderHTML: ({ options, node }) => ['span', options.HTMLAttributes, mentionNodeLabel(node.attrs)],
      renderText: ({ node }) => mentionNodeLabel(node.attrs),
    }
  },
})
const extensions = [MENTION_AS_PLAIN_TEXT]

/*
 * Ein Treffer aus `/api/handles/search` (`HandleSuggestion`, oben importiert):
 * `id` und `label` tragen denselben Handle. Der Typ kam bis AU2 (2026-08-15)
 * aus einem lokalen `type` — jetzt aus `core/shared/types/handle.ts`, wo ihn
 * auch der Handler nennt. Die Form der Antwort gehört an BEIDE Enden, nicht je
 * Aufrufstelle neu behauptet.
 */

/** Ein Mensch tippt schneller, als eine Runde zum Server dauert. */
const SEARCH_DEBOUNCE_MS = 150

const mentionQuery = ref('')
const mentionItems = ref<HandleSuggestion[]>([])

let searchTimer: ReturnType<typeof setTimeout> | undefined
/**
 * Laufende Nummer statt AbortController: verworfen werden muss nur die
 * ANTWORT, nicht die Anfrage — und eine zu spät eintreffende Antwort würde
 * sonst Treffer zu einem Suchbegriff zeigen, der längst weitergetippt ist.
 */
let searchSeq = 0

watch(mentionQuery, (query) => {
  clearTimeout(searchTimer)

  // Siehe Kopf, Punkt 1: die leere Anfrage wird nicht gestellt. Die leere
  // Liste schließt zugleich ein offenes Menü (`useEditorMenu` räumt auf,
  // sobald keine Treffer mehr da sind).
  if (!query) {
    mentionItems.value = []
    return
  }

  const seq = ++searchSeq
  searchTimer = setTimeout(async () => {
    let rows: HandleSuggestion[] = []
    try {
      rows = await $fetch<HandleSuggestion[]>('/api/handles/search', { query: { q: query } })
    }
    catch {
      // Eine Tipphilfe darf nicht lauter sein als das, wobei sie hilft:
      // ohne Netz bleibt das Menü einfach aus, der Mensch tippt den Namen zu
      // Ende, und alles Weitere hängt ohnehin am Text.
      rows = []
    }
    if (seq !== searchSeq) return
    mentionItems.value = rows
  }, SEARCH_DEBOUNCE_MS)
})

/**
 * ── DAS `#`-MENÜ: THEMEN STATT MENSCHEN (F57) ────────────────────────────
 * Dieselbe Bauart wie oben, mit EINEM Unterschied, der Absicht ist: ein
 * nacktes `#` zeigt hier die zuletzt aktiven Themen, statt nichts.
 *
 * Bei den Erwähnungen wäre die leere Anfrage das Aufblättern der
 * Mitgliederliste gewesen — hier ist sie das Naheliegende: wer `#` tippt,
 * meint fast immer etwas, worüber gerade gesprochen wird. Die Route deckelt
 * auf acht und lässt nur Themen dieser Community durch.
 *
 * Preis, den man kennen muss: `onExit` setzt den Suchbegriff auf '' zurück,
 * und '' ist hier eine gültige Anfrage. Nach dem Schließen des Menüs läuft
 * also noch EIN Abruf ins Leere. Er ist entprellt, gedrosselt und sein
 * Ergebnis landet in einer Liste, die niemand mehr sieht — das ist billiger
 * als ein zweiter Zustand, der „gerade `#` getippt" von „Menü beendet"
 * unterscheiden müsste.
 */
const topicQuery = ref('')
const topicItems = ref<TopicLinkSuggestion[]>([])

let topicTimer: ReturnType<typeof setTimeout> | undefined
let topicSeq = 0

watch(topicQuery, (query) => {
  clearTimeout(topicTimer)

  const seq = ++topicSeq
  topicTimer = setTimeout(async () => {
    let rows: TopicLinkSuggestion[] = []
    try {
      rows = await $fetch<TopicLinkSuggestion[]>('/api/posts/discussions/link-search', {
        query: query ? { q: query } : {},
      })
    }
    catch {
      // Wie oben: eine Tipphilfe bleibt still, wenn sie nicht helfen kann.
      rows = []
    }
    if (seq !== topicSeq) return
    topicItems.value = rows
  }, SEARCH_DEBOUNCE_MS)
})
</script>

<template>
  <UEditor
    v-model="model"
    content-type="markdown"
    :starter-kit="starterKit"
    :markdown="markdown"
    :image="false"
    :mention="false"
    :extensions="extensions"
    :placeholder="props.placeholder"
    :enable-input-rules="RULE_EXTENSIONS"
    :enable-paste-rules="RULE_EXTENSIONS"
    :editor-props="editorProps"
    :autofocus="props.autofocus ? 'end' : false"
    class="w-full rounded-md border border-default"
    :ui="{ base: 'px-3 py-2', content: 'min-h-20' }"
  >
    <template #default="{ editor }">
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        class="border-b border-default px-1.5 py-1"
      />
      <!-- Emoji sind reiner Text (`:` öffnet die Auswahl) — siehe utils/emojiMenuItems.ts -->
      <UEditorEmojiMenu :editor="editor" :items="POST_EMOJI_ITEMS" />
      <!-- Namensvervollständigung: `@` öffnet, der Server sucht (siehe Kopf).
           `ignore-filter` ist Pflicht, nicht Geschmack — nur so kommen
           Treffer an, die nach dem letzten Tastendruck eintreffen. -->
      <UEditorMentionMenu
        v-model:search-term="mentionQuery"
        :editor="editor"
        :items="mentionItems"
        ignore-filter
      />
      <!-- Themen verlinken: `#` öffnet, der Server sucht (siehe Kopf des
           Loaders). EIGENER `plugin-key` ist PFLICHT — der Default
           ('mentionMenu') gehört schon dem `@`-Menü, und zwei Suggestion-
           Plugins mit demselben Schlüssel schließen einander aus. -->
      <UEditorMentionMenu
        v-model:search-term="topicQuery"
        :editor="editor"
        :items="topicItems"
        char="#"
        plugin-key="topicLinkMenu"
        ignore-filter
      />
    </template>
  </UEditor>
</template>
