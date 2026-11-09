/**
 * DIE EINE REGEL, WIE AUS EINER MODELL-ANTWORT JSON WIRD (BI4, 2026-11-08).
 *
 * Reine Funktionen, kein H3Event, kein `createError`, kein `console` — die
 * drei Transporte (`aiCompleteJson`, `aiVisionJson`, `aiVideoJson`) parsen
 * damit identisch und entscheiden selbst, was ein Fehlschlag kostet.
 *
 * ── WARUM ES DIESE DATEI GIBT ────────────────────────────────────────────
 * Gemessen am 2026-11-08 (BI4, Plan BRAND-INSIGHTS-KURATION §16): 4 von 52
 * echten Entwurfs-Läufen gegen `anthropic/claude-haiku-4.5` lieferten eine
 * VOLLSTÄNDIGE Antwort (`finish_reason: 'stop'`, schließendes `}` vorhanden),
 * die trotzdem kein JSON war — immer aus demselben Grund:
 *
 *     … die Wortmarke „Adidas" erscheint ausschließlich im Abspann …
 *
 * Das Modell öffnet mit dem deutschen Anführungszeichen `„` (U+201E) und
 * schließt mit einem NACKTEN ASCII-`"` (U+0022). Innerhalb eines
 * JSON-Strings beendet dieses Zeichen den String, und `JSON.parse` steigt
 * aus. `extractJsonObject` hilft dagegen nichts: es schneidet nur Zäune und
 * Plauderei weg, der Fehler sitzt MITTEN im Wert.
 *
 * ── UND WARUM REPARIEREN STATT ABLEHNEN ──────────────────────────────────
 * Die Regel aus dem K5-Nachtrag (§14), hier verschärft: ab dem Anbieter-
 * Aufruf ist der Lauf BEZAHLT. Ein 502 wirft einen fertigen, vollständigen
 * Artikel weg, weil ein Anführungszeichen falsch gesetzt ist — das ist kein
 * Schutz, das ist Verlust. Streng ist man VOR dem Aufruf (Prompt, Budget);
 * danach wird gerettet, was da ist.
 *
 * ── DIE SICHERUNG: ES ÄNDERT SICH NICHTS, WAS HEUTE GEHT ─────────────────
 * `parseModelJson` versucht IMMER zuerst den unveränderten Text. Die
 * Reparatur läuft ausschließlich, NACHDEM `JSON.parse` schon gescheitert
 * ist. Für jede Antwort, die heute durchgeht, ist diese Datei damit ein
 * No-op — sie kann bestehendes Verhalten nicht verbiegen, nur bisher
 * verlorene Läufe zurückholen.
 */

/**
 * DIE VORSORGE VOR DEM AUFRUF: BITTE UM TYPOGRAFISCHE ANFÜHRUNGSZEICHEN
 * (BI4 — AI2, 2026-11-09). Sie gehört in JEDEN Prompt, der ein
 * JSON-Objekt mit Fliesstext zurückbekommt, und steht hier neben der
 * Reparatur, weil beide dieselbe Fehlerklasse betreffen — die eine DAVOR,
 * die andere DANACH.
 *
 * Gemessen (s. Kopf): 4 von 52 Entwurfs-Läufen schrieben `„Adidas"` und
 * machten ihre eigene, bezahlte Antwort unparsbar. Streng ist man vor dem
 * Aufruf, gerettet wird danach — eine Bitte kostet nichts und senkt die
 * Häufigkeit, die Reparatur deckelt den Rest.
 *
 * ── DREI DINGE, DIE MAN HIER NICHT — AUCH NICHT GUT GEMEINT — ÄNDERT ────
 * (1) **Die Beispiele schliessen typografisch.** Die erste Fassung dieser
 *     Regel (im insights-Layer, 2026-11-08) schrieb sie als `„…"` und
 *     `"…"` — also genau mit dem Zeichen, das der nächste Satz
 *     verbietet. Ein Modell lernt die Form seiner Antwort aus den Beispielen
 *     im Auftrag, nicht aus dem Verbot daneben; im Entwurfs-Prompt standen so
 *     elf Vorlagen gegen eine Regel. Der Wächter
 *     `scripts/check-prompt-quotes.mjs` hält das offen.
 * (2) **Das gerade Zeichen steht nur in der Verbots-Zeile.** Es muss dort
 *     stehen — ein Verbot, das sein Zeichen nicht nennt, ist keines.
 * (3) **Sie ist EINE Zeichenkette für alle Layer.** Vorher lag sie im
 *     insights-Layer; `courses`, `posts`, `comments`, `events`, `pages`,
 *     `tickets`, `market` und `brand` rufen denselben Transport und hatten sie
 *     nicht. Eine zweite Kopie würde genau so wieder auseinanderlaufen.
 */
export const AI_JSON_QUOTE_RULE = [
  'ANFÜHRUNGSZEICHEN IM TEXT: benutze ausschliesslich typografische Anführungszeichen („…“ im Deutschen, “…” im Englischen).',
  'Ein gerades ASCII-Anführungszeichen (") darf in keinem Textwert vorkommen — es beendet dort den JSON-String und macht deine Antwort unlesbar.',
].join('\n')

/**
 * DIESELBE BITTE AUF ENGLISCH — für die Prompts, die auf Englisch
 * geschrieben sind (`brand`, `market`). Eine Übersetzung, keine zweite Regel:
 * eine deutsche Zeile mitten in einem englischen Auftrag liest ein Modell als
 * Material und nicht als Anweisung.
 *
 * Im Englischen wiegt sie SCHWERER als im Deutschen: dort ist `"` das
 * normale Anführungszeichen, ein Modell greift also von sich aus danach —
 * während im Deutschen erst die Mischung aus typografisch auf und gerade zu
 * den Fehler macht.
 */
export const AI_JSON_QUOTE_RULE_EN = [
  'QUOTATION MARKS IN TEXT: use typographic quotation marks only (“…” in English, „…“ in German).',
  'A straight ASCII double quote (") must never appear inside a text value — it ends the JSON string there and makes your answer unreadable.',
].join('\n')

/**
 * Schneidet eine Modell-Antwort auf das äußere JSON-Objekt zu: vom ERSTEN `{`
 * bis zum LETZTEN `}` — Zaun-Markierungen (```json) und Plauderei davor oder
 * dahinter fallen weg.
 *
 * Bis 2026-09-05 stand hier `raw.replace(/\}[\s\S]*$/, '}')`, und das greift
 * am ersten `}` der Antwort: jedes Objekt mit einem VERSCHACHTELTEN Objekt
 * (`{"items":[{…}]}`) wurde hinter dem inneren Ende abgeschnitten und war
 * damit nie parsbar. Die flachen Antworten der Triage, der Übersetzung und des
 * Assistenten haben das nie berührt; der Brand-Check war der erste Konsument
 * mit einer Liste von Objekten und starb live daran.
 */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end < start) return raw.trim()
  return raw.slice(start, end + 1)
}

/** JSON-Escapes für die Steuerzeichen, die in einem String stehen dürfen. */
const CONTROL_ESCAPES: Readonly<Record<string, string>> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
}

/**
 * SCHLIESST DIESES `"` DEN STRING — oder steht es im Text?
 *
 * Die einzige Stelle, an der diese Datei RATEN muss, und darum die einzige
 * mit einer ausgeschriebenen Begründung. Entschieden wird am nächsten
 * Zeichen, das nicht Leerraum ist:
 *
 *  - `:` → ein Schlüssel endet hier (`"title":`). Schließt.
 *  - `}` / `]` → der letzte Wert eines Objekts/Arrays endet hier. Schließt.
 *  - Ende des Texts → schließt (es kommt nichts mehr).
 *  - `,` → NUR dann, wenn danach ein weiterer SCHLÜSSEL folgt (`"dek":`)
 *    oder das nächste Array-Element (`"…"`, `{`). Sonst nicht: `… sagte
 *    "Hallo", und dann …` ist Prosa, und genau dort hat die naive Regel
 *    „Komma schließt" einen fertigen Artikel zerschnitten.
 *  - alles andere → Text. Wird escaped.
 *
 * Die Rest-Unschärfe bleibt bewusst stehen: ein Zitat, das WÖRTLICH auf
 * `",` endet und dem ein `"wort":` folgt, wäre nicht entscheidbar. In
 * deutscher Prosa ist das kein Satz, den jemand schreibt — und ein Rest-Fall,
 * der ohne diese Datei ohnehin ein 502 gewesen wäre, ist mit ihr höchstens
 * wieder einer.
 */
function quoteClosesString(text: string, quoteIndex: number): boolean {
  let i = quoteIndex + 1
  while (i < text.length && /\s/.test(text[i] as string)) i++
  if (i >= text.length) return true

  const next = text[i] as string
  if (next === ':' || next === '}' || next === ']') return true
  if (next !== ',') return false

  let j = i + 1
  while (j < text.length && /\s/.test(text[j] as string)) j++
  if (j >= text.length) return true
  const after = text[j] as string
  // Nächstes Array-Element als Objekt — `["a", {…}]`.
  if (after === '{' || after === '[') return true
  if (after !== '"') return false
  // `"` nach dem Komma: ein Schlüssel (`"dek":`) oder ein Array-Element
  // (`"…"`)? Beides schließt — unterscheiden muss man es nicht, denn in
  // beiden Fällen begann dort ein neuer String und nicht unsere Prosa.
  return true
}

/**
 * REPARIERT DIE ZWEI FEHLER, DIE MODELLE IN JSON-STRINGS WIRKLICH MACHEN:
 * ein nicht escaptes `"` und ein rohes Steuerzeichen (meist ein echter
 * Zeilenumbruch statt `\n`).
 *
 * Alles andere bleibt Zeichen für Zeichen stehen — insbesondere jede bereits
 * korrekte Escape-Sequenz (`\"`, `\\`, `ä`). Die Funktion ist damit
 * idempotent auf gültigem JSON: wer gültiges JSON hineingibt, bekommt es
 * unverändert zurück (per Test genagelt).
 *
 * NUR die beiden gemessenen Fehlerklassen. Es wird NICHTS ergänzt: kein
 * fehlendes `}`, kein abgeschnittener String, kein nachgezogenes Komma. Eine
 * abgeschnittene Antwort ist unbrauchbar, und eine „Reparatur", die ihr ein
 * Ende anklebt, erfindet dem Menschen einen Artikel, der nie geschrieben
 * wurde — genau das soll `finish_reason: 'length'` stattdessen SAGEN.
 */
export function repairModelJson(text: string): string {
  let out = ''
  let inString = false
  let i = 0

  while (i < text.length) {
    const ch = text[i] as string

    if (!inString) {
      out += ch
      if (ch === '"') inString = true
      i++
      continue
    }

    // Innerhalb eines Strings.
    if (ch === '\\') {
      // Eine Escape-Sequenz reist unangetastet mit — auch ein `\` am
      // Textende (dann gibt es kein nächstes Zeichen zu kopieren).
      out += ch
      if (i + 1 < text.length) out += text[i + 1] as string
      i += 2
      continue
    }

    if (ch === '"') {
      if (quoteClosesString(text, i)) {
        out += ch
        inString = false
      }
      else {
        out += '\\"'
      }
      i++
      continue
    }

    const escape = CONTROL_ESCAPES[ch]
    if (escape !== undefined) {
      out += escape
      i++
      continue
    }

    if (ch.charCodeAt(0) < 0x20) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
      i++
      continue
    }

    out += ch
    i++
  }

  return out
}

/** Was beim Lesen einer Modell-Antwort herauskam. */
export interface ModelJsonResult<T> {
  value: T
  /** War eine Reparatur nötig? Nur fürs Protokoll — der Wert ist derselbe. */
  repaired: boolean
}

/**
 * LIEST EINE MODELL-ANTWORT ALS JSON: zuschneiden, parsen, und erst bei
 * Misserfolg reparieren und noch einmal parsen. `null` heißt „auch danach
 * kein JSON" — was das kostet, entscheidet der Aufrufer.
 *
 * `T` ist eine BEHAUPTUNG, kein Beweis (wie bei `aiCompleteJson`): die Felder
 * prüft und klemmt der Konsument mit seinem Zod-Schema.
 */
export function parseModelJson<T>(raw: string): ModelJsonResult<T> | null {
  const text = extractJsonObject(raw)
  try {
    return { value: JSON.parse(text) as T, repaired: false }
  }
  catch { /* weiter zur Reparatur */ }

  const repaired = repairModelJson(text)
  if (repaired === text) return null
  try {
    return { value: JSON.parse(repaired) as T, repaired: true }
  }
  catch {
    return null
  }
}
