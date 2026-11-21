# BS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **BS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**BS1 — branding.supply: was gebaut ist und was offen bleibt.** Gebaut und
live (Verlauf in COMPLETE): R0, R1, R1b, R1c, R2a, R2b, Z0 und die
vorläufige Datenschutz-Fassung. Die Production-Migrationen `pages-001…006`
und `brand-021` sind gefahren (die Tabelle der Erstgespräch-Anfragen ist in
Gebrauch), und `introCallNotify` ist in `apps/branding/app/app.config.ts`
gesetzt. Die alte Zeile nannte beides zugleich „gefahren" und „wartet auf
Davids Ja"; das Zweite war ein überholter Rest.

- **Unklar, prüfen:** Die alte Zeile sagte „Geo-Env gesetzt" und zugleich
  „David setzt die zwei `GEO_*`-Pfade in der Server-`.env`". Am Repo lässt
  sich das nicht entscheiden; der Beweis ist ein grüner Lauf von
  `pnpm ops:site-env` für branding.
- **Entschieden am 2026-09-08 (Plan § 9):** Kundenkreis nur B2B · Generator
  activeMind für die Erstfassung, später eRecht24 Premium · der
  Art.-27-Vertreter ist der eigene Punkt A27.
