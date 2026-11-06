<script setup lang="ts">
/** Clickdummy: About us (Runde 163, David) — die Seite ist der
 *  SELBSTBEWEIS: Branding Supply ist mit den eigenen Produkten
 *  gebaut. Darunter das Team mit Rollen-Abschnitten je Mitglied
 *  („In dieser Rolle …" / „… weil"). Profilbilder folgen.
 *
 *  ── IM RUHESTAND (2026-09-02) ───────────────────────────────────────────
 *  Die HUNDE-WELT dieses Dummys (Rassen, tierische Nachnamen, Wohnort-und-
 *  Hobby-Zeilen) ist am 2026-09-02 zugunsten eines professionellen Teams
 *  VERWORFEN — Davids Entscheidung, nachzulesen im DECISION-LOG. Der aktuelle
 *  Stand steht in `apps/branding/app/pages/team.vue` (live) und in
 *  `packages/brand/shared/brandAdvisors.ts` (Registry). Diese Datei bleibt
 *  bewusst unverändert als historischer Dummy — sie ist ein Protokoll der
 *  Runde 163, keine Vorlage. Nichts hier abschreiben. */
const team = [
  {
    initials: 'GW', name: 'George Wuffwuff', title: 'Markenberater · Brand Wizard',
    desc: 'Führt euch durch Foundation und Language — den roten Faden gibt er nie aus der Pfote. Was Gestaltung ist, gehört Frida.',
    will: ['die Fragen stellen, die eine gute Agentur stellt', 'jede Empfehlung strategisch begründen', 'Foundation und Language mit euch festhalten'],
    because: ['er lieber nachfragt als rät', 'er Entscheidungen erklärt, statt sie zu verkünden'],
    skills: ['Markenstrategie', 'Archetypen', 'Purpose & Werte', 'Naming'],
    personal: 'Chihuahua mit Terrier-Anteil · Kiel · sammelt Manifeste, schwimmt in der Förde',
  },
  {
    initials: 'FF', name: 'Frida Fellini', title: 'Design Directorin · Brand Design',
    desc: 'Macht aus eurer Foundation eine Gestalt. Strategie-Fragen reicht sie an George zurück.',
    will: ['eure Foundation in Visual DNA übersetzen', 'drei Moodboard-Richtungen ableiten', 'mit euch verfeinern, bis es sitzt'],
    because: ['sie Strategie in Bilder übersetzen kann', 'sie Geschmack immer mit Begründung liefert'],
    skills: ['Visual DNA', 'Moodboards', 'Farbwelten', 'Typografie'],
    personal: 'Pudel · Mailand/Hamburg · fotografiert Hauswände, hasst Stock-Lächeln',
  },
  {
    initials: 'RS', name: 'Rex Setter', title: 'Produktioner · Brand Book & Kit',
    desc: 'Macht das Entschiedene versandfertig — er erfindet nichts Neues.',
    will: ['Book, Tokens, brand.json und Pressekit produzieren', 'das Strategy Playbook versandfertig machen', 'Konsistenz bis ins letzte Kapitel prüfen'],
    because: ['ihm kein Detail durchrutscht', 'er Beschlossenes nie eigenmächtig ändert'],
    skills: ['Brand Books', 'Design-Tokens', 'brand.json', 'Pressekits'],
    personal: 'Irish Setter · Leipzig · Buchdruck-Nerd, sortiert Schrauben nach Größe',
  },
  {
    initials: 'KA', name: 'Kira Apport', title: 'Content-Strategin · Brand Experience',
    desc: 'Bringt die Marke in die Welt — immer entlang des 90-Tage-Plans. Bewertet nicht, was Ada gehört.',
    will: ['den Content-Kompass in Wochenpläne übersetzen', 'Templates und Quick Wins bereitstellen', 'den Launch begleiten — intern zuerst'],
    because: ['sie Pläne liefert statt Ideen zu sammeln', 'sie weiß, was jeder Kanal wirklich braucht'],
    skills: ['Content-Säulen', 'SEO & GEO', 'Launch-Pläne', 'Templates'],
    personal: 'Labrador · Köln · apportiert Deadlines, läuft Halbmarathon',
  },
  {
    initials: 'WW', name: 'Wanda Wachsam', title: 'Monitoring-Analystin · Brand Monitoring',
    desc: 'Der Blick von außen, jede Woche. Schlägt nur an, wenn es etwas zu melden gibt.',
    will: ['euer Außenbild wöchentlich prüfen', 'KI-Antworten über eure Marke beobachten', 'Wettbewerber-Bewegungen und Chancen melden'],
    because: ['sie Veränderungen zuerst sieht', 'sie Ruhe von Alarm unterscheiden kann'],
    skills: ['Außenbild-Checks', 'KI-Antwort-Radar', 'Alerts', 'Trend-Signale'],
    personal: 'Schäferhündin · Wien · Nachtschichten, Fernglas-Sammlung',
  },
  {
    initials: 'AP', name: 'Ada Prüfstein', title: 'Score-Prüferin · Brand Score',
    desc: 'Rechnet den Brand Score — unbestechlich, auch bei unseren eigenen Marken.',
    will: ['die 40 Prüfkriterien reproduzierbar rechnen', 'jede Wertung begründen', 'auch unsere eigenen Marken streng bewerten'],
    because: ['sie Zahlen nie fühlt, sondern rechnet', 'sie sich von niemandem beeindrucken lässt'],
    skills: ['Prüfkriterien', 'Reproduzierbarkeit', 'Begründungen', 'Bänder'],
    personal: 'Dackel · Zürich · misst alles zweimal, spielt Schach gegen sich selbst',
  },
  {
    initials: 'SS', name: 'Scout Schnüffler', title: 'Research-Analyst · Brand Benchmark',
    desc: 'Findet Wettbewerber und Vorbilder — Schlüsse zieht ihr mit George.',
    will: ['Wettbewerber und Vorbilder aufspüren', 'sie ins selbe Raster legen', 'jede Aussage mit Quellen belegen'],
    because: ['er keine Spur verliert', 'er sammelt, statt zu urteilen'],
    skills: ['Wettbewerbs-Research', 'Benchmarks', 'Quellen-Belege', 'Markt-Raster'],
    personal: 'Beagle · Berlin · verliert nie eine Spur, außer beim Bällchen',
  },
]
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="@container mx-auto max-w-7xl">

      <!-- Wer wir sind: der Selbstbeweis -->
      <div class="mx-auto mt-14 max-w-3xl text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">About Branding Supply</p>
        <h1 class="mt-4 text-balance text-5xl font-extralight leading-tight tracking-tight">Wir sind unser eigener Beweis.</h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">Es gibt uns, weil gutes Branding zu oft entweder zu teuer ist oder zur Vorlage verkommt. Wir glauben: Jede Marke ist ein Fingerabdruck — und der Weg dorthin lässt sich führen, begründen und messen.</p>
        <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">Deshalb haben wir unsere Produkte zuerst auf uns selbst angewendet: Der Name, der Fingerabdruck, diese Farbwelt, diese Seite — alles ist mit dem Brand Wizard, unserer Visual DNA und dem eigenen Playbook entstanden. Bewertet von Ada, versteht sich.</p>
        <p class="bw-label mx-auto mt-6 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">Branding Supply · Der Weise · Rest Schöpfer — Stil: Minimal · Editorial — Visual DNA: Contemporary · Geometric · Monochrome + Acid Pop · Spacious · Digital-clean · Precise</p>
      </div>

      <!-- Das Team -->
      <div class="mx-auto mt-24 max-w-3xl text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Das Team</p>
        <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight">Für jede Aufgabe das richtige Teammitglied.</h2>
        <p class="mx-auto mt-4 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Wir zerlegen euer Projekt in Aufgaben — und jede übernimmt die Spezialistin oder der Spezialist, der sie am besten kann. Sieben Rollen, klare Grenzen, ein gemeinsames Gedächtnis.</p>
      </div>

      <div class="mt-10 grid gap-x-6 gap-y-6 @sm:grid-cols-2 @md:grid-cols-3">
        <div v-for="m in team" :key="m.name" class="bw-card flex flex-col p-8">
          <div class="flex items-center gap-4">
            <BwGeorgeAvatar v-if="m.initials === 'GW'" size="xl" />
            <UAvatar v-else :text="m.initials" size="xl" />
            <div class="min-w-0">
              <h3 class="truncate text-lg font-medium tracking-tight">{{ m.name }}</h3>
              <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ m.title }}</p>
            </div>
          </div>
          <p class="mt-4 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ m.desc }}</p>
          <p class="bw-label mt-4" style="color: var(--bw-muted)">In dieser Rolle wird {{ m.initials === 'GW' || m.initials === 'RS' || m.initials === 'SS' ? 'er' : 'sie' }}:</p>
          <ul class="mt-1.5 space-y-1">
            <li v-for="w in m.will" :key="w" class="flex gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"><span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ w }}</li>
          </ul>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">Diese Rolle passt, weil:</p>
          <ul class="mt-1.5 flex-1 space-y-1">
            <li v-for="b in m.because" :key="b" class="flex gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"><span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ b }}</li>
          </ul>
          <div class="mt-4 flex flex-wrap gap-1.5">
            <span v-for="s in m.skills" :key="s" class="bw-label rounded-full px-2.5 py-1" style="background: var(--bw-surface-hi)">{{ s }}</span>
          </div>
          <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ m.personal }}</p>
        </div>
      </div>

      <div class="bw-card mt-16 flex flex-wrap items-center justify-between gap-4 p-8">
        <p class="text-sm" style="color: var(--bw-ink-soft)">Das Team steht bereit — die erste Frage stellt George.</p>
        <UButton label="Starte dein Branding" class="rounded-full" />
      </div>

      <BwSiteFooter />
    </div>
  </div>
</template>
