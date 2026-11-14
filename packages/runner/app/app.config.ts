/**
 * Der AI-Runner meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (`pukalani.admin.modules`, über alle Layer deep-merged) und legt daneben die
 * zwei ANZEIGE-Kataloge des Start-Formulars ab.
 *
 * `app.config.ts` liegt in `app/` — im Package-Root wird sie stillschweigend
 * ignoriert, und genau das fällt beim Nachrüsten niemandem auf.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // 'operator' wie das Board: `runner.manage` trägt keine
          // Community-Rolle — es ist Davids eigenes Werkzeug (§ 2).
          id: 'runner',
          scope: 'operator',
          productKey: 'runner',
          labelKey: 'admin.nav.runner',
          icon: 'i-ph-rocket-launch',
          to: '/dashboard/runner',
          requiredCapability: 'runner.manage',
          // Gruppe 'management' sind die Betreiber-Werkzeuge; direkt hinter
          // dem Board (order 2), weil man von dort kommt.
          group: 'management',
          order: 3,
        },
      ],
    },
    runner: {
      /**
       * WÄHLBARE MODELLE — Anzeige-Katalog, keine Erlaubnis.
       *
       * Bewusst hier und nicht im Formular fest verdrahtet (Davids
       * Anforderung): eine neue Modell-Generation ist dann eine Config-Zeile
       * und kein Komponenten-Umbau. Die WAHRHEIT bleibt beim Runner — seine
       * lokale Allowlist kappt Modell, Modus und Budget (§ 8.1), und die
       * Datenbank darf nur auswählen, was er erlaubt.
       *
       * Die Namen sind EIGENNAMEN und laufen deshalb nicht über i18n (de = en,
       * dieselbe Regel wie bei den Theme-Namen).
       *
       * ACHTUNG BEIM ÜBERSCHREIBEN: `app.config` merged mit defu, und Arrays
       * werden KONKATENIERT, nicht ersetzt. Eine App kann also ergänzen; wer
       * einen Eintrag loswerden will, ändert diese Liste. Doppelte `value`
       * fängt die Oberfläche selbst ab.
       */
      models: [
        { value: 'fable', label: 'Fable' },
        { value: 'opus', label: 'Opus' },
        { value: 'sonnet', label: 'Sonnet' },
      ],
      /**
       * WÄHLBARE REPO-SCHLÜSSEL — ebenfalls nur Anzeige (§ 8.1).
       *
       * Über die Naht reist NIE ein Pfad, sondern immer ein SCHLÜSSEL: welcher
       * Ordner dahinter liegt, steht in `~/.config/pukalani-runner/config.json`
       * auf dem Rechner. Ein hier unbekannter Schlüssel lässt den Lauf beim
       * RUNNER scheitern (§ 7.2 Schritt 2) — auf der Maschine, die ihre eigenen
       * Grenzen kennt. Diese Liste ist deshalb eine Bequemlichkeit für das
       * Formular, keine Sicherung.
       */
      repos: ['maui-monorepo'],
      /**
       * subjectType → PFAD-PRÄFIX für den Link einer Lauf-Ende-Meldung.
       *
       * DEFAULT LEER, und das ist Absicht (A14): der `runner`-Layer kennt
       * `tickets` NICHT und darf ihren Dashboard-Pfad nicht hart verdrahten. Die
       * App, die runner UND tickets komponiert (apps/control), trägt das Mapping
       * ein — `{ ticket: '/dashboard/tickets?ticket=' }`, an das der Absender die
       * `subjectId` hängt. Ohne Eintrag zeigt die Meldung auf `/dashboard/runner`
       * (finish.post.ts). Objekt, kein Array — defu MERGED es tief, statt zu
       * konkatenieren.
       */
      subjectLinks: {} as Record<string, string>,
      /**
       * AUFRÄUM-LAUF (BE-025): Protokolle 30 Tage nach Laufende, Ereignisse
       * nach 90 Tagen löschen (server/utils/runRetention.ts). 'dry-run' zählt
       * nur, 'apply' löscht. Layer-Default AUS — Löschen ist nicht umkehrbar,
       * die App schaltet bewusst ein. Die FRISTEN sind kein Regler, sie stehen
       * als Konstanten in shared/runRetention.ts.
       */
      retention: 'off' as 'off' | 'dry-run' | 'apply',
    },
  },
})
