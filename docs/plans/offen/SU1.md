# SU1 — Einzelheiten

> Einzelheiten zum offenen Punkt **SU1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**SU1 — Community-Seiten in der Suche: Reste (aus dem Gesamtaudit, Paket Q10).**
Gebaut am 2026-11-21 (COMPLETE „Q10"): Hauptsprache je Community,
Beschreibung und Hauptüberschrift für Diskussion, Kurs und Termin, eine
maßgebliche Adresse je Beitrag, Sitemap mit den Inhalten, `noindex` für
Konto-Seiten, Kundenbereich und Betreiber-Oberfläche.

- **(a) Hauptsprache bestehender Communities.** Wer vor dem 2026-11-21
  angelegt wurde, hat keine Wahl gespeichert; es gilt die Adresse ohne
  Sprach-Vorsatz. Eine deutschsprachige Community stellt unter
  Dashboard → Community → „Name und Beschreibung" auf „Deutsch". Für die
  Demo-Community ist das ein Klick des Owners.
- **(b) Strukturierte Daten.** `DiscussionForumPosting`, `Course` und `Event`
  auf den drei Seitenarten, dazu `og:site_name` und `og:type`. Im Befund als
  zweiter Schritt genannt.
- **(c) Themen ohne Titel** fehlen in der Sitemap: ihr Adress-Name entsteht
  aus dem Text des Beitrags, den die Liste bewusst nicht lädt. Lösbar, wenn
  der Adress-Name einmal mit dem Beitrag gespeichert wird.
- **(d) Marken-Galerie von branding.supply.** Die Profil-Seiten haben
  dieselbe Frage (ein Text, zwei Sprach-Adressen) und noch keine Hauptsprache.
  Der Baustein steht (`useSeoCanonicalLocale` im Core); es fehlt die
  Entscheidung, woher die Sprache einer Marke kommt.
- **(e) Aus dem Sammelbefund offen.** Titel- und Beschreibungs-Längen auf
  branding.supply und pukalani.studio (hängt am Wortlaut), `/insights` ohne
  Beiträge in Menü und Sitemap. Die Sprach-Berichtigung bleibt bewusst 302.
- **(f) Regel-Datei.** Der neue Vertrag (`useCommunityContentSeo`,
  `pukalani.seo.indexOnly`, `seoNoindex`) steht noch nicht in
  `.claude/rules/i18n-seo.md` — die Datei war am Tag des Baus in Arbeit einer
  anderen Sitzung.
