import { describe, expect, it } from 'vitest'
import { INSIGHTS_BRIEF_MAX, insightsSourceSchema } from '../shared/insightsPost'
import {
  INSIGHTS_BRIEF_PROMPT_VERSION,
  INSIGHTS_BRIEF_TOPICS_MAX,
  buildInsightsVideoBriefPrompt,
  clampInsightsBrief,
  insightsBriefRequestSchema,
  insightsBriefTitle,
  insightsVideoBriefSchema,
  insightsVideoBriefSource,
  insightsVideoPublishedDate,
} from '../shared/insightsVideoBrief'

/**
 * DER BRIEF AUS EINEM VIDEO (BI2 K5) — die Sätze, auf die es rechtlich
 * ankommt, als Prüfung statt als Kommentar.
 *
 * Die wichtigste davon ist die ZITAT-REGEL: ein gesprochener Satz lässt sich
 * mit unserem Beleg-Riegel nicht belegen (er sucht das Zitat im abgerufenen
 * SEITEN-Text, und dort steht nur Titel und Beschreibung). Der Prompt muss
 * also Paraphrasen mit Zeitmarke verlangen, und die QUELLE darf kein Zitat
 * tragen. Beides wird hier festgenagelt — ohne diese Tests wäre es eine
 * Behauptung im Dateikopf.
 */

const INPUT = {
  locale: 'de' as const,
  videoTitle: 'Why Being Good at Everything Gets You Nowhere',
  channelTitle: 'The Futur',
  publishedDate: '2026-10-21',
  topic: 'brand-strategy',
}

describe('buildInsightsVideoBriefPrompt', () => {
  it('nennt die Metadaten, damit das Modell das Datum nicht schätzt', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('Why Being Good at Everything Gets You Nowhere')
    expect(prompt).toContain('The Futur')
    expect(prompt).toContain('2026-10-21')
    expect(prompt).toContain('brand-strategy')
  })

  it('verbietet wörtliche Zitate UND verlangt Zeitmarken', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('ERFINDE KEIN ZITAT UND SCHREIBE KEINES AUF')
    expect(prompt).toContain('Zeitmarke')
    // Die Regel trifft AUSSAGEN, nicht Fachbegriffe — Schärfung aus dem
    // ersten echten Lauf (ein Modell setzte ein Fachwort in Anführungszeichen).
    expect(prompt).toContain('KEINE AUSSAGE aus dem Video in Anführungszeichen')
    expect(prompt).toContain('FACHBEGRIFF in Anführungszeichen ist in Ordnung')
  })

  it('verlangt einen AUFTRAG und keine Zusammenfassung', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('ZÄHLE NICHT NACH, SONDERN HAKE AN')
    expect(prompt).toContain('DIE THESE, DIE EINEN ARTIKEL TRÄGT')
    expect(prompt).toContain('OFFENE FRAGEN')
    expect(prompt).toContain('GEGENPOSITION')
  })

  it('trägt die anderen drei Verbote des Entwurfs mit', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('ERFINDE KEINE ZAHL')
    expect(prompt).toContain('SETZE NIEMANDEN HERAB')
    expect(prompt).toContain('BEHAUPTE NICHTS ÜBER DAS, WAS DU NICHT GESEHEN HAST')
  })

  it('nennt den Cluster-Katalog mit Schlüsseln und bestellt nicht mehr, als die Spalte trägt', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('seo-geo')
    expect(prompt).toContain('visual-identity')
    expect(prompt).toContain(String(INSIGHTS_BRIEF_MAX))
    expect(prompt).toContain(String(INSIGHTS_BRIEF_TOPICS_MAX))
  })

  it('bestellt die JSON-Form, mit der die Route rechnet', () => {
    const prompt = buildInsightsVideoBriefPrompt(INPUT)
    expect(prompt).toContain('{"title": "Arbeitstitel unseres Beitrags", "brief": "Der Brief als Markdown", "topics": ["cluster-schluessel"]}')
  })

  it('sagt die Sprache des Briefs — und auf Englisch die englische', () => {
    expect(buildInsightsVideoBriefPrompt(INPUT)).toContain('Deutsch (German)')
    expect(buildInsightsVideoBriefPrompt({ ...INPUT, locale: 'en' })).toContain('Englisch (English)')
  })

  it('bleibt lesbar, wenn Metadaten fehlen (statt „undefined" zu schicken)', () => {
    const prompt = buildInsightsVideoBriefPrompt({
      ...INPUT, videoTitle: '', channelTitle: '', publishedDate: '', topic: '',
    })
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('unbekannt')
  })

  it('hat eine Fassung im Namen', () => {
    expect(INSIGHTS_BRIEF_PROMPT_VERSION).toBe('insights-b-1')
  })
})

describe('insightsVideoBriefSchema', () => {
  it('nimmt eine vollständige Antwort', () => {
    const parsed = insightsVideoBriefSchema.parse({
      title: 'Spezialisierung schlägt Breite',
      brief: '## Worum es geht\n…',
      topics: ['brand-strategy'],
    })
    expect(parsed.title).toBe('Spezialisierung schlägt Breite')
    expect(parsed.topics).toEqual(['brand-strategy'])
  })

  it('wirft erfundene Cluster weg, statt alles abzulehnen', () => {
    const parsed = insightsVideoBriefSchema.parse({
      brief: 'x',
      topics: ['brand-strategy', 'markenzauber', 'seo-geo'],
    })
    expect(parsed.topics).toEqual(['brand-strategy', 'seo-geo'])
  })

  it('klemmt auf vier Cluster — so viele trägt die Spalte', () => {
    const parsed = insightsVideoBriefSchema.parse({
      brief: 'x',
      topics: ['rebranding', 'brand-psychology', 'brand-analysis', 'brand-strategy', 'seo-geo'],
    })
    expect(parsed.topics).toHaveLength(INSIGHTS_BRIEF_TOPICS_MAX)
  })

  it('verträgt eine Antwort ohne Felder (dann ist alles leer)', () => {
    const parsed = insightsVideoBriefSchema.parse({})
    expect(parsed).toEqual({ title: '', brief: '', topics: [] })
  })

  /**
   * DIE UMKEHRUNG VOM 2026-10-28. Hier stand „lehnt einen Brief ab, der
   * länger ist als die Spalte" — ein Test, der genau das festnagelte, was
   * Geld verbrennt: wenn dieses Schema etwas sieht, ist das Video gelesen
   * und bezahlt. Zwei von sechs gemessenen Läufen lagen über dem Deckel.
   */
  it('KLEMMT einen zu langen Brief, statt den bezahlten Lauf wegzuwerfen', () => {
    const long = `${'Satz eins. '.repeat(250)}Satz zwei.`
    expect(long.length).toBeGreaterThan(INSIGHTS_BRIEF_MAX)
    const parsed = insightsVideoBriefSchema.parse({ brief: long })
    expect(parsed.brief.length).toBeLessThanOrEqual(INSIGHTS_BRIEF_MAX)
    expect(parsed.brief.endsWith('.')).toBe(true)
  })

  it('klemmt auch einen zu langen Arbeitstitel, statt zu werfen', () => {
    const parsed = insightsVideoBriefSchema.parse({ title: 'T'.repeat(260), brief: 'x' })
    expect(parsed.title).toHaveLength(200)
  })
})

/**
 * DER SCHNITT AN DER GRENZE — die Gegenprobe zum Klick-Beweis vom
 * 2026-10-27, wo ein nacktes `slice` einen Brief wörtlich mit „… den
 * Markteintr" beendete.
 */
describe('clampInsightsBrief', () => {
  it('lässt einen Brief unter dem Deckel unberührt (nur getrimmt)', () => {
    expect(clampInsightsBrief('  Kurz und gut.  ')).toBe('Kurz und gut.')
  })

  it('endet auf einem Satzzeichen, nicht mitten im Wort', () => {
    const text = `${'Ein Satz mit Inhalt. '.repeat(120)}Und dann folgt noch ein Gedanke über den Markteintritt.`
    const clamped = clampInsightsBrief(text)
    expect(clamped.length).toBeLessThanOrEqual(INSIGHTS_BRIEF_MAX)
    expect(clamped).toMatch(/[.!?]$/)
  })

  it('nimmt das SPÄTERE von Zeilen- und Satzende — der Brief ist bezahlt', () => {
    // Zeilenumbruch früh, Satzende spät: der Satz muss gewinnen, sonst
    // verschenkt der Schnitt Hunderte Zeichen bezahlten Briefs.
    const text = `${'a'.repeat(900)}\n${'b'.repeat(900)}. ${'c'.repeat(400)}`
    const clamped = clampInsightsBrief(text)
    expect(clamped.endsWith('b.')).toBe(true)
    expect(clamped.length).toBeGreaterThan(1700)
  })

  it('trennt am Wort, wenn es weder Zeile noch Satz gibt', () => {
    const clamped = clampInsightsBrief(`${'wort '.repeat(500)}ende`)
    expect(clamped.endsWith('wort')).toBe(true)
    expect(clamped.length).toBeLessThanOrEqual(INSIGHTS_BRIEF_MAX)
  })

  it('lässt den Brief nicht mit einer leeren Überschrift enden', () => {
    // Genau der Fall aus der Gegenprobe: der Schnitt landete auf dem Umbruch
    // NACH „### OFFENE FRAGEN", und der Brief kündigte etwas an, das fehlte.
    const text = `${'Ein Satz mit Inhalt und etwas Länge.\n'.repeat(55)}### OFFENE FRAGEN\nDie erste Frage lautet wie folgt und ist lang.`
    const clamped = clampInsightsBrief(text)
    expect(clamped).not.toMatch(/OFFENE FRAGEN\s*$/)
    expect(clamped).toMatch(/[.!?]$/)
  })

  it('räumt auch einen leeren Aufzählungs-Marker am Schluss weg', () => {
    const text = `${'Ein Satz mit Inhalt und etwas Länge.\n'.repeat(55)}-\nNoch ein Punkt, der nicht mehr hineinpasst.`
    expect(clampInsightsBrief(text)).toMatch(/Länge\.$/)
  })

  it('schneidet hart, wenn es gar keine Grenze gibt — lieber das als nichts', () => {
    const clamped = clampInsightsBrief('x'.repeat(INSIGHTS_BRIEF_MAX + 500))
    expect(clamped).toHaveLength(INSIGHTS_BRIEF_MAX)
  })

  it('zählt einen Punkt INNERHALB einer Zahl nicht als Satzende', () => {
    // „3.1" darf den Schnitt nicht halten — sonst endet der Brief mit „3."
    const text = `${'Der Abschnitt 3.1 beschreibt die Lage im Markt sehr genau '.repeat(40)}Ende`
    const clamped = clampInsightsBrief(text)
    expect(clamped).not.toMatch(/\d\.$/)
    // Und trotzdem an einer Grenze: im Quelltext steht hinter dem Schnitt ein
    // Leerzeichen, also wurde kein Wort zerteilt.
    expect(text.slice(clamped.length, clamped.length + 1)).toBe(' ')
  })

  it('nimmt eine Abkürzung als Satzende an — bewusst, siehe Kopf der Regel', () => {
    // Die Gegenprobe zum Satz oben: wer das ändern will, ändert hier mit.
    const text = `${'Das gilt für Marken, z. B. '.repeat(100)}Schluss ohne Punkt`
    expect(clampInsightsBrief(text).endsWith('z. B.')).toBe(true)
  })
})

describe('insightsBriefRequestSchema', () => {
  /**
   * DIE REGRESSION AUS DEM KLICK-BEWEIS (2026-10-27). Der Knopf schickt
   * keinen Rumpf; `z.object` mit lauter Defaults nahm ein Objekt OHNE
   * Schlüssel, aber kein FEHLENDES Objekt — die Route antwortete 400, bevor
   * irgendetwas passierte. Typecheck und Tests sahen davon nichts.
   */
  it('nimmt einen FEHLENDEN Rumpf und setzt die Vorgaben', () => {
    expect(insightsBriefRequestSchema.parse(undefined)).toEqual({ format: 'article', baseLocale: 'de' })
  })

  it('nimmt einen leeren Rumpf', () => {
    expect(insightsBriefRequestSchema.parse({})).toEqual({ format: 'article', baseLocale: 'de' })
  })

  it('nimmt eine Hälfte und ergänzt die andere', () => {
    expect(insightsBriefRequestSchema.parse({ baseLocale: 'en' })).toEqual({ format: 'article', baseLocale: 'en' })
  })

  it('lehnt einen erfundenen Wert ab', () => {
    expect(() => insightsBriefRequestSchema.parse({ format: 'podcast' })).toThrow()
  })
})

describe('insightsVideoPublishedDate', () => {
  it('schneidet den Tag aus einem ISO-Zeitstempel', () => {
    expect(insightsVideoPublishedDate('2026-10-21T14:05:00.000Z')).toBe('2026-10-21')
  })

  /**
   * DIE GEGENPROBE ZUR ZEITZONE: ein `new Date(...)` hätte diesen Fall je nach
   * Maschine auf den 31.12. gedreht. Der Zuschnitt rechnet nicht.
   */
  it('dreht einen Mitternachts-Stempel NICHT in die Server-Zeitzone', () => {
    expect(insightsVideoPublishedDate('2026-01-01T00:30:00.000Z')).toBe('2026-01-01')
    expect(insightsVideoPublishedDate('2026-01-01T23:30:00.000Z')).toBe('2026-01-01')
  })

  it('gibt leer zurück, wenn kein Datum drinsteht', () => {
    expect(insightsVideoPublishedDate('')).toBe('')
    expect(insightsVideoPublishedDate('irgendwann')).toBe('')
  })
})

describe('insightsVideoBriefSource', () => {
  const INPUT_SOURCE = { videoId: 'jNQXAC9IVRw', channelTitle: 'The Futur', publishedDate: '2026-10-21' }

  it('baut eine ablegbare YouTube-Quelle', () => {
    const source = insightsVideoBriefSource(INPUT_SOURCE)
    expect(source).not.toBeNull()
    expect(source!.kind).toBe('youtube')
    expect(source!.url).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
    expect(source!.publisher).toBe('The Futur')
    expect(source!.date).toBe('2026-10-21')
  })

  /**
   * DIE ZWEITE HÄLFTE DER ZITAT-REGEL. Ein Zitat in der QUELLE schickt den
   * Beleg-Riegel gegen die Videoseite — und ein gesprochener Satz steht dort
   * nicht. Die Quelle trägt deshalb nie eines.
   */
  it('trägt NIE ein Zitat', () => {
    expect(insightsVideoBriefSource(INPUT_SOURCE)!.quote).toBe('')
  })

  it('ist `null` ohne Datum — sonst wäre der Brief bezahlt und nicht ablegbar', () => {
    expect(insightsVideoBriefSource({ ...INPUT_SOURCE, publishedDate: '' })).toBeNull()
  })

  it('ist `null` ohne Kanal — das Schema verlangt einen Herausgeber', () => {
    expect(insightsVideoBriefSource({ ...INPUT_SOURCE, channelTitle: '   ' })).toBeNull()
  })

  /**
   * DER BEWEIS, dass die Ablehnungen oben die RICHTIGEN sind: was diese
   * Funktion liefert, muss durch das Quellen-Schema gehen. Ohne diesen Test
   * wären die beiden `null`-Fälle geraten.
   */
  it('kommt durch `insightsSourceSchema`', () => {
    const source = insightsVideoBriefSource(INPUT_SOURCE)!
    expect(() => insightsSourceSchema.parse(source)).not.toThrow()
  })

  it('kürzt einen absurd langen Kanalnamen auf das Spaltenmaß', () => {
    const source = insightsVideoBriefSource({ ...INPUT_SOURCE, channelTitle: 'K'.repeat(400) })!
    expect(source.publisher).toHaveLength(160)
    expect(() => insightsSourceSchema.parse(source)).not.toThrow()
  })
})

describe('insightsBriefTitle', () => {
  it('nimmt den Vorschlag des Modells', () => {
    expect(insightsBriefTitle('Unsere These', 'Video-Titel')).toBe('Unsere These')
  })

  it('fällt auf den Video-Titel zurück — ohne Titel gibt es keine Adresse', () => {
    expect(insightsBriefTitle('   ', 'Video-Titel')).toBe('Video-Titel')
  })

  it('klemmt auf das Spaltenmaß', () => {
    expect(insightsBriefTitle('T'.repeat(500), 'x')).toHaveLength(200)
  })
})
