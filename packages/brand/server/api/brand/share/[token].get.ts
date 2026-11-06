import { Query } from 'node-appwrite'
import { brandShareableSlotValues, isBrandChapterShareable } from '../../../../shared/brandSharing'
import type { BrandShareSnapshot, BrandShareViewResponse } from '../../../../shared/types/brand'
import {
  BRAND_SHARES_TABLE,
  type BrandShareRow,
  brandDb,
  isAppwriteNotFound,
} from '../../../utils/brandStore'
import { hashBrandShareToken } from '../../../utils/brandShares'
import { recordBrandEvent } from '../../../utils/brandEvents'

/**
 * DIE ÖFFENTLICHE LESEANSICHT — die AUSDRÜCKLICHE zweite Ausnahme vom
 * Zugangs-Gate (Plan §6). Der Token IST der Beweis; ein Konto braucht es nicht,
 * denn geteilt wird mit Menschen, die keines haben.
 *
 * ── DIE PRÜFUNG LÄUFT BEI JEDEM ABRUF, SERVERSEITIG ───────────────────────
 * Ablauf und Widerruf werden HIER entschieden, nicht beim Erzeugen des Links.
 * Deshalb `Cache-Control: no-store`: ein Widerruf muss sofort wirken, und eine
 * zwischengespeicherte Kopie in einem Proxy oder Browser würde ihn um Stunden
 * verzögern (Audit 5).
 *
 * ── DREI KÖPFE, DREI GRÜNDE ───────────────────────────────────────────────
 *   `Cache-Control: no-store`        Widerruf wirkt sofort (s. o.)
 *   `X-Robots-Tag: noindex, nofollow` der Link ist geteilt, nicht öffentlich —
 *                                    er gehört in keinen Suchindex
 *   `Referrer-Policy: no-referrer`   sonst trüge jeder Klick auf einen Link im
 *                                    Dokument den TOKEN in der Adresse an die
 *                                    fremde Seite weiter
 * Dazu `frame-ancestors 'none'`: die Share-Seite wird nie eingebettet (Audit 6)
 * — ein fremdes iframe darum herum wäre die einfachste Art, sie als eigene
 * Arbeit auszugeben.
 *
 * ── DER TOKEN WIRD NIE GELOGGT ────────────────────────────────────────────
 * Auch nicht bei einem Fehler, auch nicht gekürzt. Er ist das ganze Geheimnis;
 * eine Zeile im Log wäre eine Kopie davon an einer Stelle, die andere Leute
 * lesen dürfen.
 *
 * ── UNBEKANNT UND ABGELAUFEN ANTWORTEN GLEICH ─────────────────────────────
 * 404, ohne Unterschied. „Abgelaufen" verriete, dass es diesen Link gab.
 *
 * ── DER ALTE SNAPSHOT WIRD BEIM LESEN GEFILTERT (Paket G3) ────────────────
 * Seit MV1 M5 friert `share.post.ts` nur noch reisefähige Festlegungen ein —
 * jede Zeile, die VORHER entstanden ist, trägt trotzdem alles Bestätigte:
 * Wettbewerber samt notierter Schwäche, Beschwerden, Rohantworten (Konzept
 * §4). Diese Route sendet sie deshalb nicht mehr roh, sondern durch DENSELBEN
 * Filter, den der Schreibweg benutzt (`brandShareableSlotValues`). Das ist die
 * dritte Masche des Doppelnetzes aus §2.8 — nötig, weil der Renderer nur die
 * SEITE schützt: die API-Antwort steht daneben und ist mit dem Token ohne
 * Browser abrufbar.
 *
 * SEIT BRAND DESIGN D9 gilt dasselbe für ganze KAPITEL: die sechs von Brand
 * Design fallen hier wie dort (`isBrandChapterShareable`). Ein Abbild aus der
 * Zeit zwischen D8 und D9 trägt sie noch als rohe Slot-Werte; gerendert wurden
 * sie nie, ausgeliefert schon.
 */
export default defineEventHandler(async (event): Promise<BrandShareViewResponse> => {
  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': 'frame-ancestors \'none\'',
  })

  const token = getRouterParam(event, 'token') ?? ''
  // Länge vorab prüfen, damit ein 10-MB-„Token" nicht erst gehasht wird.
  if (!token || token.length > 256) throw createError({ status: 404, statusText: 'Not Found' })

  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandShareRow | undefined
  try {
    const res = await tablesDB.listRows<BrandShareRow>({
      databaseId,
      tableId: BRAND_SHARES_TABLE,
      // `uq_token_hash` ist UNIQUE — höchstens eine Zeile.
      queries: [Query.equal('tokenHash', hashBrandShareToken(token)), Query.limit(1)],
    })
    row = res.rows[0]
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.share_lookup_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  if (!row || row.revokedAt) throw createError({ status: 404, statusText: 'Not Found' })
  const expires = Date.parse(row.expiresAt ?? '')
  // Fehlendes/kaputtes Datum gilt als abgelaufen — ein Link ohne Frist wäre
  // ein dauerhafter Zugang, den niemand beschlossen hat.
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  let snapshot: BrandShareSnapshot
  try {
    snapshot = JSON.parse(row.snapshot) as BrandShareSnapshot
  }
  catch {
    // Ein unlesbarer Snapshot ist kein 500: nach aussen gibt es diesen Link
    // dann eben nicht. Der Betreiber sieht die Zeile im Log — ohne Token.
    logEvent('error', 'brand.share_snapshot_unreadable', { shareId: row.$id })
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  // Ein Kapitel, von dem nach dem Filter nichts übrig bleibt, FÄLLT WEG statt
  // als leere Überschrift dazustehen — dieselbe Regel wie beim Einfrieren.
  //
  // DIE SECHS DESIGN-KAPITEL FALLEN GANZ (D9, Davids Entscheidung 2026-09-09).
  // Auch hier gilt: der Schreibweg lässt sie seit D9 nicht mehr hinein, aber
  // jede Zeile von VORHER trägt sie noch — dieselbe Lage wie bei den internen
  // Sessions vor MV1 M5, und deshalb dieselbe Kur. Die Antwort verliert dabei
  // nichts Sichtbares: die visuelle Identität steht im `design`-Preset, das
  // unangetastet bleibt.
  const chapters = (snapshot.chapters ?? [])
    .filter(chapter => isBrandChapterShareable(chapter.stepKey))
    .map(chapter => ({ ...chapter, slots: brandShareableSlotValues(chapter.slots ?? []) }))
    .filter(chapter => chapter.slots.length > 0)

  await recordBrandEvent(event, {
    type: 'share.viewed',
    profileId: row.profileId,
    // Kein `userId`: der zweite Leser hat kein Konto — das ist der Sinn des
    // Links. Und keine IP: gezählt wird, DASS jemand liest, nicht wer.
    payload: { shareId: row.$id, chapters: chapters.length },
  })

  return {
    snapshot: { ...snapshot, chapters },
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
  }
})
