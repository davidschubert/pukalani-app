import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_CHANNELS_MAX,
  INSIGHTS_CHANNEL_NOTE_MAX,
  insightsChannelCreateSchema,
  insightsChannelLookup,
  insightsChannelPatchSchema,
} from '../shared/insightsChannel'
import { INSIGHTS_CHANNEL_SEED } from '../shared/insightsChannelSeed'
import { INSIGHTS_TOPIC_KEYS } from '../shared/insightsPost'
import { fromInsightsChannel, toInsightsChannel } from '../shared/insightsRows'
import type { InsightsChannelRow } from '../shared/insightsRows'

/**
 * DIE REINEN REGELN DER KANALLISTE (BI2 K3).
 *
 * Zwei Dinge brauchen hier einen Test, und beide haben eine Vorgeschichte:
 *  1. WAS DER BETREIBER EINTIPPT. Ein Handle, eine Id, eine kopierte Adresse —
 *     und die alten `/c/`- und `/user/`-Formen, die NICHT gehen dürfen, weil
 *     ein Weg, der bei jedem zweiten Versuch unerklärlich nichts findet,
 *     schlechter ist als eine klare Absage.
 *  2. DIE RUNDREISE Zeile ⇄ Vertrag. Hier entscheidet sich, ob ein Lauf die
 *     Notiz des Betreibers überschreiben kann — und genau dafür gibt es die
 *     Liste.
 */

describe('insightsChannelLookup', () => {
  it('liest eine nackte Kanal-Id', () => {
    expect(insightsChannelLookup('UC-b3c7kxa5vU-bnmaROgvog')).toEqual({
      kind: 'id', channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
    })
  })

  it('liest ein Handle mit und ohne {at}', () => {
    expect(insightsChannelLookup('@thefutur')).toEqual({ kind: 'handle', handle: 'thefutur' })
    expect(insightsChannelLookup('thefutur')).toEqual({ kind: 'handle', handle: 'thefutur' })
  })

  it('liest die Adressformen, die YouTube heute vergibt', () => {
    expect(insightsChannelLookup('https://www.youtube.com/@thefutur')).toEqual({ kind: 'handle', handle: 'thefutur' })
    expect(insightsChannelLookup('youtube.com/@thefutur')).toEqual({ kind: 'handle', handle: 'thefutur' })
    expect(insightsChannelLookup('https://m.youtube.com/@thefutur/videos')).toEqual({ kind: 'handle', handle: 'thefutur' })
    expect(insightsChannelLookup('https://www.youtube.com/channel/UC-b3c7kxa5vU-bnmaROgvog')).toEqual({
      kind: 'id', channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
    })
  })

  it('wirft die Query weg — ein kopiertes Verfolgungs-Anhängsel darf nichts verfälschen', () => {
    expect(insightsChannelLookup('https://www.youtube.com/@thefutur?si=abc123')).toEqual({
      kind: 'handle', handle: 'thefutur',
    })
  })

  it('lehnt die alten Adressformen AB, statt zu raten', () => {
    // GEGENPROBE zur Zeile darüber: dieselbe Domain, derselbe Aufbau — nur
    // ein Pfad, den die API nicht mehr auflöst (s. Kopf von `insightsChannel.ts`).
    expect(insightsChannelLookup('https://www.youtube.com/c/TheFutur')).toBeNull()
    expect(insightsChannelLookup('https://www.youtube.com/user/TheFutur')).toBeNull()
  })

  it('lehnt alles ab, was gar kein Kanal ist', () => {
    expect(insightsChannelLookup('')).toBeNull()
    expect(insightsChannelLookup('   ')).toBeNull()
    expect(insightsChannelLookup('https://vimeo.com/@thefutur')).toBeNull()
    expect(insightsChannelLookup('https://www.youtube.com/watch?v=abc')).toBeNull()
    // Zu kurz für ein Handle (YouTube verlangt drei Zeichen).
    expect(insightsChannelLookup('@ab')).toBeNull()
    // Eine Uploads-Playlist ist kein Kanal — und sie passt auf die Handle-Form,
    // weshalb der Riegel dafür ausdrücklich in der Funktion steht.
    expect(insightsChannelLookup('UU-b3c7kxa5vU-bnmaROgvog')).toBeNull()
    expect(insightsChannelLookup('PLb3c7kxa5vUbnmaROgvogxy')).toBeNull()
    // GEGENPROBE: ein echtes Handle, das zufällig mit denselben Buchstaben
    // beginnt, bleibt eines — der Riegel hängt an der LÄNGE, nicht am Anfang.
    expect(insightsChannelLookup('@PLprod')).toEqual({ kind: 'handle', handle: 'PLprod' })
  })
})

describe('die Formulare', () => {
  it('nimmt nur eine echte Kanal-Id an — die Vorschau liefert sie', () => {
    const ok = insightsChannelCreateSchema.safeParse({
      channelId: 'UC-b3c7kxa5vU-bnmaROgvog', topic: 'brand-strategy',
    })
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data.note).toBe('')

    expect(insightsChannelCreateSchema.safeParse({ channelId: '@thefutur', topic: 'brand-strategy' }).success).toBe(false)
    expect(insightsChannelCreateSchema.safeParse({ channelId: 'UC-b3c7kxa5vU-bnmaROgvog', topic: 'erfunden' }).success).toBe(false)
  })

  it('deckelt die Notiz', () => {
    const tooLong = { channelId: 'UC-b3c7kxa5vU-bnmaROgvog', topic: 'seo-geo', note: 'x'.repeat(INSIGHTS_CHANNEL_NOTE_MAX + 1) }
    expect(insightsChannelCreateSchema.safeParse(tooLong).success).toBe(false)
  })

  it('ändert nur, was einem Menschen gehört — und verlangt mindestens eines davon', () => {
    expect(insightsChannelPatchSchema.safeParse({ active: false }).success).toBe(true)
    expect(insightsChannelPatchSchema.safeParse({ topic: 'seo-geo' }).success).toBe(true)
    expect(insightsChannelPatchSchema.safeParse({ note: 'liefert nichts mehr' }).success).toBe(true)
    // GEGENPROBE: ein leerer Rumpf ist kein „nichts ändern", sondern ein Fehler.
    expect(insightsChannelPatchSchema.safeParse({}).success).toBe(false)
    // Und der Titel gehört der API, nicht dem Formular.
    const withTitle = insightsChannelPatchSchema.safeParse({ active: true, title: 'Handgetippt' })
    expect(withTitle.success && 'title' in withTitle.data).toBe(false)
  })
})

describe('Zeile ⇄ Vertrag', () => {
  const row = (extra: Partial<InsightsChannelRow> = {}): InsightsChannelRow => ({
    $id: 'row-1',
    $sequence: 1,
    $tableId: 'insights_channels',
    $databaseId: 'main',
    $createdAt: '2026-09-09T00:00:00.000Z',
    $updatedAt: '2026-09-09T00:00:00.000Z',
    $permissions: [],
    channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
    topic: 'brand-strategy',
    title: 'The Futur',
    handle: 'thefutur',
    subscribers: 42,
    active: true,
    note: 'drin, weil hohe Taktung',
    lastUploadAt: '2026-09-01T00:00:00.000Z',
    checkedAt: '2026-09-09T06:00:00.000Z',
    ...extra,
  } as InsightsChannelRow)

  it('liest eine vollständige Zeile', () => {
    expect(toInsightsChannel(row())).toEqual({
      channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
      topic: 'brand-strategy',
      title: 'The Futur',
      handle: 'thefutur',
      subscribers: 42,
      active: true,
      note: 'drin, weil hohe Taktung',
      lastUploadAt: '2026-09-01',
      checkedAt: '2026-09-09T06:00:00.000Z',
    })
  })

  it('ein unbekanntes Cluster wird zur Rubrik, nicht zur Ausnahme', () => {
    const read = toInsightsChannel(row({ topic: 'gab-es-mal' }))
    expect(INSIGHTS_TOPIC_KEYS).toContain(read.topic)
  })

  it('eine Zeile OHNE `active` läuft mit — nicht still aus dem Radar fallen', () => {
    expect(toInsightsChannel(row({ active: undefined as unknown as boolean }).valueOf() as InsightsChannelRow).active).toBe(true)
    // GEGENPROBE: ein ausdrückliches `false` bleibt `false`.
    expect(toInsightsChannel(row({ active: false })).active).toBe(false)
  })

  it('macht aus dem Kalendertag wieder UTC-Mitternacht, und aus leer ein `null`', () => {
    const written = fromInsightsChannel(toInsightsChannel(row()))
    expect(written.lastUploadAt).toBe('2026-09-01T00:00:00.000Z')
    expect(written.checkedAt).toBe('2026-09-09T06:00:00.000Z')

    const empty = fromInsightsChannel(toInsightsChannel(row({ lastUploadAt: null, checkedAt: null })))
    expect(empty.lastUploadAt).toBeNull()
    expect(empty.checkedAt).toBeNull()
  })

  it('überlange Felder werden geschnitten, nicht abgewiesen', () => {
    const written = fromInsightsChannel({
      ...toInsightsChannel(row()),
      title: 'x'.repeat(400),
      note: 'y'.repeat(INSIGHTS_CHANNEL_NOTE_MAX + 100),
    })
    expect(written.title).toHaveLength(160)
    expect(written.note).toHaveLength(INSIGHTS_CHANNEL_NOTE_MAX)
  })
})

describe('die Saat', () => {
  it('trägt genau die elf Kanäle, mit denen der Radar seit I4 läuft', () => {
    expect(INSIGHTS_CHANNEL_SEED).toHaveLength(11)
  })

  it('jede Zeile ist gültig — Id, bekanntes Cluster, Notiz im Deckel', () => {
    for (const entry of INSIGHTS_CHANNEL_SEED) {
      expect(insightsChannelLookup(entry.channelId)).toEqual({ kind: 'id', channelId: entry.channelId })
      expect(INSIGHTS_TOPIC_KEYS).toContain(entry.topic)
      expect(entry.note.length).toBeLessThanOrEqual(INSIGHTS_CHANNEL_NOTE_MAX)
      expect(entry.note).not.toBe('')
    }
  })

  it('keine Kanal-Id steht zweimal drin', () => {
    const ids = INSIGHTS_CHANNEL_SEED.map(entry => entry.channelId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('passt in den Deckel der Liste', () => {
    expect(INSIGHTS_CHANNEL_SEED.length).toBeLessThanOrEqual(INSIGHTS_CHANNELS_MAX)
  })
})
