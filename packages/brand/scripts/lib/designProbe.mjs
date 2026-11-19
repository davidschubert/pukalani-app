/**
 * DIE EINE DESIGN-VORLAGE DER BEWEIS-SKRIPTE — der fertige DNA-Mix (`g.mix`)
 * von Kailua Coffee Co., so wie die App ihn selbst in die Ablage schreibt.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * Bis 2026-11-19 stand der Mix als kopierter Text in drei Skripten
 * (`verify-brand-kit`, `-design`, `-sessions`). Dann wurde im Wortschatz der
 * App aus „Aus eurer Foundation" die anredefreie Fassung „Aus der Foundation"
 * (`BRAND_DNA_ORIGIN_TERMS`), und keine der drei Kopien zog mit:
 * `parseBrandDnaMixSlotValue` las aus der alten Vorlage NICHTS, es entstand
 * kein fertiges Design, und rund fünfzig Prüfungen wurden rot — kein Fehler
 * im Produkt, nur eine Vorlage, die still veraltet war.
 *
 * ── WER SIE HÄLT ──────────────────────────────────────────────────────────
 * Die Skripte sind `.mjs` und können den Wortschatz (`shared/*.ts`, Importe
 * ohne Endung) nicht selbst laden. Deshalb steht der Mix hier als LITERAL —
 * die Beweise vergleichen später gegen genau diese Entscheidungen —, und der
 * Test `packages/brand/tests/designProbeTemplate.test.ts` hält ihn gegen den
 * Wortschatz: die App muss ihn lesen können, und was sie daraus zurückschreibt,
 * muss Zeichen für Zeichen dieser Text sein. Ändert sich ein Etikett, wird der
 * Test rot und nennt die Zeile — nicht erst der nächtliche Lauf.
 *
 * Aufbau je Block: `## <Dimension>` und darunter `<Wert> · <Board> · <Herkunft>`
 * (`brandDnaMixSlotValue` in `shared/brandDesignDna.ts`).
 */

/** Die zehn Entscheidungen als Ids — die Quelle für Vorlage UND Test. */
export const PROBE_DNA_MIX_ENTRIES = Object.freeze([
  { dimension: 'style', value: 'editorial', board: 'calmer', origin: 'foundation' },
  { dimension: 'era', value: 'timeless', board: 'calmer', origin: 'foundation' },
  { dimension: 'form', value: 'soft', board: 'calmer', origin: 'foundation' },
  { dimension: 'typography', value: 'bookish', board: 'calmer', origin: 'foundation' },
  { dimension: 'color', value: 'earthy', board: 'calmer', origin: 'foundation' },
  { dimension: 'imagery', value: 'craftClose', board: 'calmer', origin: 'foundation' },
  { dimension: 'composition', value: 'calm', board: 'calmer', origin: 'foundation' },
  { dimension: 'materiality', value: 'paper', board: 'calmer', origin: 'foundation' },
  { dimension: 'motion', value: 'calmMotion', board: 'calmer', origin: 'foundation' },
  { dimension: 'mood', value: 'warm', board: 'calmer', origin: 'foundation' },
].map(entry => Object.freeze(entry)))

/** Der Slot-Wert von `g.mix` in der Inhaltssprache Deutsch. */
export const PROBE_DNA_MIX = [
  '## Visueller Stil\nRedaktionell · Eine Stufe ruhiger · Aus der Foundation',
  '## Ästhetische Epoche\nZeitlos · Eine Stufe ruhiger · Aus der Foundation',
  '## Formsprache\nWeich gerundet · Eine Stufe ruhiger · Aus der Foundation',
  '## Typografie-Charakter\nBuchhafte Serif · Eine Stufe ruhiger · Aus der Foundation',
  '## Farb-Charakter\nErdig gedämpft · Eine Stufe ruhiger · Aus der Foundation',
  '## Bildwelt\nNah am Handwerk · Eine Stufe ruhiger · Aus der Foundation',
  '## Komposition\nRuhig und luftig · Eine Stufe ruhiger · Aus der Foundation',
  '## Materialität\nPapier, matt · Eine Stufe ruhiger · Aus der Foundation',
  '## Bewegungs-Charakter\nRuhig · Eine Stufe ruhiger · Aus der Foundation',
  '## Grundstimmung\nWarm einladend · Eine Stufe ruhiger · Aus der Foundation',
].join('\n\n')
