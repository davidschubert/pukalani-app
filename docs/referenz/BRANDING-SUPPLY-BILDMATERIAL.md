# branding.supply — Bildmaterial-Register (Platzhalter + Prompts)

Stand 2026-09-04 (abends): A1–A6 und T3 sind als VEKTOR-Illustrationen live
(`apps/branding/app/components/Art*.vue`, Inline-SVG aus den `--bw-`-Tokens —
Davids Entscheidung: Vektoren statt KI-Fotos für die Objekt-Motive). Offen sind
nur die zwei Porträts T1/T2 als Foto. Die Seiten `/about` und `/team` trugen Bild-Platzhalter
(`BwImagePlaceholder`, Kennung sichtbar auf der Kachel). Hier steht je
Kennung, **wo** das Bild hängt, **welches Format** es braucht und der
**Generierungs-Prompt**. Derselbe Prompt steht als `prompt`-Prop an der
Stelle im Seiten-Code — er wird bewusst NICHT gerendert.

## Visuelle DNA (gilt für jeden Prompt)

Aus dem Marken-Fingerabdruck: *Contemporary · Geometric · Monochrome + Acid
Pop · Spacious · Digital-clean · Precise.* Übersetzt für Bildgeneratoren:

- **Monochrom** (Graustufen, warmes Off-White bis Anthrazit) mit **genau
  einem** Akzent in Acid-Grün `#dbe74b` — nie mehr als ein Pop je Bild.
- **Geometrisch, ruhig, viel Negativraum**; weiches Studiolicht, klare
  Schatten. Keine Verläufe-Orgien, kein Glow, kein „KI-Look".
- **Kein lesbarer Text** im Bild (Sprache wechselt de/en), **keine Logos
  fremder Marken**, keine Menschen — ausser bei den Porträts (T1, T2).
- Objektfotografie im Stil eines Produkt-Launches: das Motiv ist die Sache,
  nicht die Deko.

Empfohlene Suffixe je Generator: *„editorial product photography, matte
surfaces, soft studio light, high detail, no text"*.

## Register

| Kennung | Seite · Stelle | Format | Motiv (Kurz) | Status |
| --- | --- | --- | --- | --- |
| A1 | /about · Hero | 16:7 (breit) | Papierbogen mit Fingerabdruck-Zeile, Acid-Pin | Vektor live (`components/ArtA1.vue`) |
| A2 | /about · Warum es uns gibt | 3:1 (Streifen) | Agentur-Mappe · Schablone · Lautsprecher | Vektor live |
| A3 | /about · So arbeiten wir 01 | 4:3 | Zwei Stühle am Tisch, von oben | Vektor live |
| A4 | /about · So arbeiten wir 02 | 4:3 | Karteikarten-Stapel, eine Karte lit | Vektor live |
| A5 | /about · So arbeiten wir 03 | 4:3 | Gebundenes Dokument mit Lesebändchen | Vektor live |
| A6 | /about · Der Beweis | 1:1 | Fingerabdruck-Poster an der Wand | Vektor live |
| T1 | /team · George | 4:5 (Porträt) | George Winter, Porträt | offen — Foto extern (Prompt unten) |
| T2 | /team · Das Team | 16:7 (breit) | Das siebenköpfige Team im Studio | offen — Foto extern (Prompt unten) |
| T3 | /team · Zusammenspiel | 3:1 (Streifen) | Vier Objekte, ein Faden | Vektor live |

## Prompts (wörtlich)

**A1 — Hero (16:7).**
Editorial still life, wide panorama: a single sheet of heavy off-white paper
on a matte grey surface, printed with one line of small monospaced text
(illegible), a single acid-green (#dbe74b) enamel pin resting on its corner.
Monochrome photograph, geometric shadows, soft studio light, wide negative
space, digital-clean, precise. No readable text, no people.

**A2 — Warum (3:1).**
Product-style still life, 3:1 panorama: three objects evenly spaced on a
matte grey surface — a heavy dark leather agency folder, a flat plastic
template stencil, and a small matte black cylindrical speaker. Monochrome
photograph; only the speaker carries a single acid-green (#dbe74b) ring of
light. Geometric, spacious, soft studio light, digital-clean. No text, no
people.

**A3 — Gespräch statt Formular (4:3).**
Top-down photograph: two identical minimal chairs facing each other across a
small round table on a matte grey floor. Monochrome; one chair seat carries a
single acid-green (#dbe74b) dot. Geometric composition, wide negative space,
soft even light, digital-clean. No text, no people.

**A4 — Entscheidung für Entscheidung (4:3).**
Still life: a neat stack of blank white index cards on matte grey, one card
lifted at an angle and lit from the side, its edge glowing acid-green
(#dbe74b). Monochrome photograph otherwise, geometric shadow, spacious,
precise. No text, no people.

**A5 — Festgehalten und versandfertig (4:3).**
Still life: a closed, cloth-bound A4 document lying flat on matte grey, a
thin acid-green (#dbe74b) ribbon bookmark trailing out of it. Monochrome
photograph, geometric, soft studio light, wide negative space, digital-clean.
No readable text, no people.

**A6 — Der Beweis (1:1).**
Interior photograph: a large geometric poster on a light grey wall showing an
abstract fingerprint made of thin concentric monochrome lines, one line in
acid-green (#dbe74b). Minimal gallery setting, soft daylight, spacious,
editorial, precise. No readable text, no people.

**T1 — George Winter (4:5).**
Studio portrait of a calm, attentive brand advisor in his mid-forties, short
grey-flecked hair, plain dark knit sweater, looking slightly past the camera
as if listening. Neutral light-grey seamless backdrop, monochrome photograph
with exactly one acid-green (#dbe74b) detail: a small round enamel pin on the
chest. Soft directional studio light, editorial, precise, no text.

**T2 — Das Team (16:7).**
Wide editorial group photograph: seven people of mixed ages and genders in a
bright, minimal studio with a matte grey floor, standing loosely in a line as
if between two tasks — notebooks, a swatch fan, a laptop closed under one
arm. Monochrome photograph; a single acid-green (#dbe74b) object (a folder)
held by one person. Geometric composition, wide negative space, soft
daylight, no readable text.

**T3 — Zusammenspiel (3:1).**
Product-style still life, 3:1 panorama: four objects in a straight row on
matte grey — a closed notebook, a fanned colour-swatch deck (all greys), a
cloth-bound book, a small antenna. A single thin acid-green (#dbe74b) thread
runs through all four. Monochrome photograph, geometric, spacious, soft
studio light, digital-clean. No text, no people.

## Einbau, wenn ein Bild fertig ist

Bild nach `apps/branding/public/img/about/<kennung>.jpg` (oder `.webp`), die
`BwImagePlaceholder`-Stelle durch ein `<img>`/`NuxtImg` mit dem
`label`-Text als `alt` ersetzen, Seitenverhältnis beibehalten. Das Register
hier fortschreiben (Spalte „Status" ergänzen, wenn die erste Kachel fällt).
