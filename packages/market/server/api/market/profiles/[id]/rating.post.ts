import { z } from 'zod'
import type { MarketRatingResponse } from '../../../../../shared/types/marketApi'
import { MARKET_RATING_NOTE_MAX, marketRatingEventRowId } from '../../../../../shared/marketRating'
import { filterMarketPii } from '../../../../../shared/marketPii'
import { recordBrandProductEvent } from '../../../../contracts/brandContract'
import { requireMarketProfile } from '../../../../utils/marketAccess'

/**
 * DIE EINE FREIWILLIGE FRAGE (Plan §2.10: „`market.rating` — eine freiwillige
 * Frage nach dem ersten Bericht"; MV1 M5).
 *
 * ── WOHIN SIE GESCHRIEBEN WIRD ────────────────────────────────────────────
 * In `brand_events` als Art `market.rating`, über
 * `recordBrandProductEvent`. §2.10 lässt „bestehendes `brand_events`-Muster
 * oder eigenes `market_events`" offen; genommen ist das bestehende, und der
 * Ausschlag war die Migration: `brand_events.type` ist ein varchar, kein Enum
 * (Migration brand-007 begründet das ausdrücklich) — eine neue Ereignis-Art
 * kostet damit KEINE Prod-Migration. Aufbewahrung (24 Monate) und
 * Löschkaskade gelten ohne Zutun. Eine eigene Tabelle hätte für eine einzige
 * Frage ein viertes Schema, eine vierte Kaskade und eine vierte
 * Parity-Zeile gebracht. Begründung ausführlich im Vertrag
 * (`server/contracts/brandContract.ts`).
 *
 * ── GENAU EINMAL JE BRANDING, UND ZWAR SERVERSEITIG ──────────────────────
 * Die Oberfläche merkt sich den Klick im `localStorage` — das ist BEQUEMLICHKEIT
 * (der Block verschwindet sofort), keine Zusage: ein zweiter Browser, ein
 * privates Fenster oder geräumte Site-Daten hätten die Frage wieder gestellt.
 * Die Zusage ist die deterministische Zeilen-Id (`marketRatingEventRowId`):
 * ein 409 heisst „gab es schon", und die Route antwortet dann `counted:
 * false` statt eines Fehlers — dasselbe Muster wie beim Idempotenz-Schlüssel
 * von `notify()` im core. Kein „erst nachsehen, dann schreiben": zwei
 * gleichzeitige Klicks wären sonst zwei Zeilen.
 *
 * ── WAS IN DER ZEILE STEHT ────────────────────────────────────────────────
 * Die Zahl, die Länge des Satzes — und der Satz selbst, PII-gefiltert. Er ist
 * die einzige Stelle in diesem Produkt, an der ein Mensch uns absichtlich
 * etwas schreibt, und eine Bewertung ohne den Grund ist eine Zahl ohne
 * Aussage. Der Filter ist derselbe, der vor jedem Modell-Aufruf läuft
 * (`filterMarketPii`) — E-Mail, Telefon, Namen nahe „Geschäftsführer/CEO/
 * Gründer" fallen heraus, bevor irgendetwas gespeichert wird. Die Kunden-Id
 * steht ohnehin in der Spalte `userId` daneben; sie ist eine Zuordnung, kein
 * Inhalt.
 *
 * Das ist die eng gefasste AUSNAHME von der Regel „`payload` trägt nie
 * Inhaltstext" (Kopf von `brandEvents.ts`) — sie ist dieselbe Sorte wie
 * `step.restarted`: ein AUDIT- bzw. Rückmelde-Eintrag, kein Messwert. Sie ist
 * eng, weil sie an genau einer Route hängt, der Text 200 Zeichen nicht
 * überschreiten darf und er gefiltert ist.
 *
 * ── OHNE FREISCHALTUNGS-SCHRANKE, ABER MIT BESITZ ────────────────────────
 * `requireMarketProfile` prüft Produkt-Gate, Beta-Zugang und Eigentum (404 auf
 * ein fremdes Branding). `requireMarketUnlocked` steht bewusst NICHT davor:
 * die Frage kommt NACH einem Bericht, dieser Bericht setzt die Freischaltung
 * bereits voraus, und ein 409 auf eine Rückmeldung wäre die unhöflichste
 * denkbare Antwort auf eine Gefälligkeit. Sie kostet nichts und ruft nichts an
 * — es gibt deshalb auch keinen Eimer.
 */

const bodySchema = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().max(MARKET_RATING_NOTE_MAX).optional(),
})

export default defineEventHandler(async (event): Promise<MarketRatingResponse> => {
  const { userId, profileId } = await requireMarketProfile(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ status: 400, statusText: 'Invalid rating' })

  const note = filterMarketPii(parsed.data.note?.trim() ?? '').text.slice(0, MARKET_RATING_NOTE_MAX)

  const counted = await recordBrandProductEvent(event, {
    product: 'market',
    name: 'rating',
    profileId,
    userId,
    rowId: marketRatingEventRowId(profileId),
    payload: {
      score: parsed.data.score,
      // Die LÄNGE steht daneben, weil sie auch dann etwas sagt, wenn der
      // Filter den Satz leer geräumt hat: „hat geschrieben" und „hat nur die
      // Zahl gegeben" sind zwei verschiedene Rückmeldungen.
      noteLength: note.length,
      ...(note ? { note } : {}),
    },
  })

  logEvent('info', 'market.rating', {
    // ZAHLEN, kein Inhalt — die Log-Regel gilt hier wie überall; der Satz
    // steht in der Ereignis-Zeile, nicht im Log.
    score: parsed.data.score,
    hasNote: note.length > 0,
    counted,
  })

  return { counted }
})
