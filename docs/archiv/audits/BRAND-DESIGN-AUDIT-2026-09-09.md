# Audit Brand Design (Produkt 02) — 2026-09-09

Phase „Audit" nach WORKFLOW.md, nach Abschluss der Pakete D0–D9 (docs/archiv/BRAND-DESIGN.md §2.18).
Zwei Aufklärer (audit-scout) und zwei Prüfer (audit-worker), read-only, Stand main bb39e223.
Grundlage: CLAUDE.md, BRAND-DESIGN.md §2.13 (Sicherheit), §2.16 (Nicht-Ziele), §2.17 (Fallen),
Leitplanken a–e (§2.2), DECISION-LOG 2026-09-08/09.

## Ergebnis in einem Satz

Keine hohen Befunde. Datentür, Buckets, ZDR-Klemme, Leitplanken a–e, Nicht-Ziele, Migrationen
und Hydration-Fallen sind belegt sauber; vier mittlere/niedrige Befunde und einige Hinweise
gehen als Paket **A1** in die Umsetzung.

## Befunde (Schwere · Stelle · Entscheidung)

| # | Schwere | Befund | Stelle | Entscheidung (A1) |
|---|---|---|---|---|
| 1 | mittel | `POST …/mark/brief` ist die einzige KI-ausgebende Design-Route ohne IP-Eimer; der Tages-Deckel greift erst nach Auth, Datentür und zwei Lesungen. | `core/server/middleware/05.rate-limit.ts` (Nachbarn `brand:dna`, `brand:drafts`) | Übersehen beim Bau von D5a — Eimer `brand:brief` ergänzen. |
| 2 | mittel | `aiVision` klemmt die Eingabe nicht (nur `length === 0`): weder Bild-Anzahl noch Gesamtbytes; der Konsument lädt bis 12 × 5 MB in einen Request. | `core/server/utils/aiVision.ts:268`, `brand/server/utils/brandInspirationReading.ts:235-254` | Transport-Sicherung `AI_VISION_MAX_IMAGES`/`AI_VISION_MAX_BYTES` (Bauform von `aiImage`), Produkt-Deckel bleibt beim Konsumenten. |
| 3 | mittel | GDPR-Purges der Vorbilder und Entwürfe schlucken JEDEN Fehler und zählen die Zeile trotzdem als entfernt — bei transientem Fehler meldet der Contributor Voll-Erfolg, das Konto wird gelöscht, Datei und Zeile bleiben. | `brand/server/utils/brandInspirationStore.ts:460-464`, `brandMarkDrafts.ts:306-310` | Nur 404 schlucken, sonst werfen (Muster `brandUserData.ts:229`); die Löschzusage braucht den Nachweis. |
| 4 | niedrig | Gate (`isAiVisionConfigured`) liest den Laufzeit-Override, der Aufruf ohne `options.model` den Build-Default — heute unschädlich, weil beide Konsumenten das Modell explizit übergeben. | `aiVision.ts:240` vs. `:257`, `aiImage.ts:286` vs. `:306` | Transport liest ohne `options.model` die effektive Config. |
| 5 | niedrig | Kopf von `brandAiQuota.ts` behauptet retain VOR Buchung; für Lesung, Entwürfe, Brief und DNA fehlt `retainBrandGeneration` — der Burst-Deckel greift gerade bei den teuersten Läufen nicht. | `brand/server/utils/brandAiQuota.ts:95-100` | retain/release in die vier Routen. |
| 6 | niedrig | Kein Test nagelt die Foundation-Wirkung von D2b fest (`d.primary`/`d.secondary` öffnen nach `d.hypothesis`). | `brand/tests/brandJourney.test.ts` | Test ergänzen (mit Gegenprobe). |
| 7 | Hinweis | 300 Zeichen Anbieter-Rumpf gehen nach `console.error`; manche Anbieter spiegeln Eingaben in Policy-Ablehnungen. | `aiVision.ts:296-299`, `aiImage.ts:342-344` | Nur Status + `error.code`. |
| 8 | Hinweis | Laufzeit-Override (`app_config.aiVisionModel`/`aiImageModel`) ohne Test. | `aiVision.ts:213-229`, `aiImage.ts:259-275` | Zwei Tests je Transport. |
| 9 | Hinweis | Szene (`div` mit `h3`/`p`) sitzt in einem `<button>` (Content-Modell), kein Parser-/Hydration-Fall. | `BwBoardCard.vue:46`, `BwDesignScene.vue:153` | Bleibt, Kommentar. |
| 10 | Hinweis | Bucket-Löschung beim Klick ist fail-soft, kein Aufräum-Sweep. | `brandInspirationStore.ts:437-446` | Bleibt (Klick-Fall); der GDPR-Lauf (#3) ist der harte Weg. |

## Belegt sauber

- **Datentür/Zugang:** alle 17 Design-Routen prüfen Zugang UND Besitz (`requireBrandAccess` → `requireBrandInspirationContext`/`requireBrandMarkContext`/`loadOwnedProfile`, fremd 404); Betreiber-Routen `users.manage` (401/403); keine Id aus dem Rumpf (Zod `.strict()`); `designUnlockedAt` auf keiner Kundenroute schreibbar; `Query.limit` überall.
- **Buckets:** `brand-inspiration` und `brand-drafts` `permissions: []`, `fileSecurity: false`, Magic-Bytes-Content-Type, Auslieferung nur an den Besitzer mit `private, no-store`; GDPR-Export nennt beide als Metadaten, Löschung ruft beide Purges.
- **Leitplanken a–e:** Prompts verbieten Nennung/Nachbau; Klemmung zieht `inspiration` auf `both`, `both` ohne Beleg auf `foundation`; `isBrandChapterShareable` filtert die sechs Design-Kapitel IMMER (Schreibweg und Lesepfad, auch Publication); `keptDrafts` im Snapshot-Typ nicht setzbar, Kapitel 10 macht daraus eine Zahl; alle sechs Konsumenten reichen `BRAND_PROVIDER_ROUTING` (`zdr`, kein Fallback) durch, der Transport setzt `data_collection = 'deny'` zuletzt und unkippbar (Gegenproben-Tests).
- **Zustandsmaschine:** `inputSatisfied` trifft genau drei `special`-Slots; für `d.primary`/`d.secondary` ist es die Auflösung eines Widerspruchs zur Abschluss-Formel (Audit A4), keine Regression; `conditionalInputCounts` nur für `g.reading`; `resolveNextSession` fragt dieselbe Erreichbarkeit.
- **D9-Härtungen:** `brandAccentInk` ist EINE Regel für Tabelle und Szene (identische Argumente); `swapBrandChoiceValueLine` nur ganze Zeilen, Katalog-Treffer, idempotent, kein Schreibvorgang.
- **Hydration/UI:** `immediate`-Watcher auf `onMounted`; fester `scheme` ⇒ Toggle als `<span>`; `v-html` nur hinter `isBrandMarkSvg`; keine harten Strings in 14 Komponenten; `localePath` überall.
- **Nicht-Ziele §2.16:** kein Token-Export, kein brand.json, kein Figma, kein Font-Upload, keine Rechtsprüfung, kein Stripe.
- **Migrationen 022/023/024:** Indizes nur über `createIndexSteps`/`indexStep`, idempotent, Bucket-Grenzen wie dokumentiert, Schema-Parität gepflegt.
- **Drosseln:** spezifische Regeln vor Wildcards, getrennte Eimer, GET-Bildrouten bewusst frei; Tages-Deckel je Marke VOR dem teuren Aufruf, keine Rückbuchung (gewollt).

## Entkräftete Scout-Kandidaten

Kompensierende `deleteFile`-Aufrufe nach fehlgeschlagenem `createRow` (Originalfehler wird geworfen), Rollback-Schleife der Profil-Anlage (`throw toH3Error`), Design-Option nur für den Share-Link (Publication trägt seit dem Nachschnitt auch keine rohen Design-Kapitel). Der Core-Scout meldete `aiImage.ts`/`brandMarkDrafts.ts` als fehlend — beide liegen auf main; Aufklärer-Ausgaben sind Kandidaten, keine Befunde.
