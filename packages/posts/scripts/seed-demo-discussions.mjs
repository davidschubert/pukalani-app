#!/usr/bin/env node
/**
 * Seed: Kategorien + Themen für eine SCHAUFENSTER-Community (Demo).
 *
 * WOZU: `demo.pukalani.app` ist von der Startseite direkt verlinkt und ist das
 * Erste, was ein Interessent vom Produkt sieht. Der Feed war gefüllt, die
 * DISKUSSIONEN aber leer — „Noch keine Themen", null Kategorien —, also genau
 * das Produkt, mit dem die Marketing-Seite am stärksten wirbt (Kundenreise
 * 2026-08-15, OPEN-ITEMS D7).
 *
 * MANDANT IST PFLICHT-ANGABE, aus demselben Grund wie bei seed-demo.mjs
 * (Paritäts-Audit 2026-08-02): auf einer Pool-Instanz ist ein fehlender Stempel
 * kein Fehler, den man sieht, sondern eine Waise, die niemandem gehört. Es gibt
 * bewusst keinen Default.
 *
 * IDEMPOTENT über den `slug` der Kategorie und den `title` des Themas, jeweils
 * ZUSAMMEN mit der Community — ein zweiter Lauf legt nichts doppelt an. Neu
 * hinzugefügte Einträge kommen beim nächsten Lauf dazu, bestehende bleiben
 * unangetastet (auch wenn jemand sie im Dashboard bearbeitet hat).
 *
 * WAS DIESES SKRIPT NICHT TUT: es rührt keine bestehende Zeile an und löscht
 * nichts. Wer eine Kategorie wieder loswerden will, tut das im Dashboard.
 *
 * DAS LESE-PUBLIKUM IST EBENFALLS PFLICHT-ANGABE (`--public`). Es steht in
 * `communities.audience` — und die Tabelle liegt im CONTROL-PLANE-Projekt, zu
 * dem dieses Skript mit seinem Pool-Schlüssel keinen Zugang hat. Es kann die
 * Annahme also nicht nachschlagen, und raten wäre hier der teuerste aller
 * Fehler: `read(any)` auf eine geschlossene Community gesetzt macht deren
 * Inhalte für jeden im Netz lesbar. Deshalb muss der Aufrufer es aussprechen,
 * und für eine geschlossene Community verweigert das Skript den Dienst
 * (dort bräuchte es `read(label:<communities.$id>)`, also die Row-Id — eine
 * andere Angabe als der Mandanten-Stempel).
 *
 * Aufruf (Pool/Produktion):
 *   node --env-file=~/.appwrite-secrets/migrations/account.env \
 *     packages/posts/scripts/seed-demo-discussions.mjs --community t-demo --public
 *
 * `--dry-run` zeigt nur, was entstehen würde.
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite'
// Die URL-Regel wird IMPORTIERT, nicht nachgebaut: `discussionUrl.ts` sagt im
// eigenen Kopf, dass Server und Client mit derselben Funktion rechnen, „sonst
// hätte eine 301-Schleife zwei Ursachen statt einer". Ein Seed, der die Regel
// abschreibt, wäre die dritte Ursache. Lauf deshalb mit
// `--experimental-strip-types`.
import { discussionTopicPath, topicSlug } from '../shared/discussionUrl.ts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Env-Vars — mit --env-file der Instanz aufrufen.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const oeffentlich = args.includes('--public')
const i = args.indexOf('--community')
const community = i >= 0 ? (args[i + 1] ?? '') : ''
if (!community) {
  console.error('Pflicht: --community <tenantId>  (z. B. t-demo)')
  process.exit(1)
}
if (!oeffentlich) {
  console.error('Pflicht: --public — dieses Skript setzt read(any) und ist nur für eine')
  console.error('öffentliche Community gedacht (communities.audience = "public").')
  console.error('Eine geschlossene Community braucht read(label:<communities.$id>) — dafür ist')
  console.error('dieses Skript bewusst nicht gebaut, statt die Grenze zu raten.')
  process.exit(1)
}

const CATEGORIES_TABLE = 'post_categories'
const POSTS_TABLE = 'community_posts'

/** `read(any)` — erlaubt nur mit `--public`, siehe Kopf der Datei. */
const READ_PUBLIC = [Permission.read(Role.any())]

const KATEGORIEN = [
  {
    slug: 'ankuendigungen',
    name: 'Ankündigungen',
    description: 'Was neu ist: Termine, Kurse, Änderungen. Schreibt das Team.',
    sortOrder: 1,
  },
  {
    slug: 'praxis',
    name: 'Praxis & Technik',
    description: 'Haltungen, Atem, Abläufe — was im Körper ankommt und was nicht.',
    sortOrder: 2,
  },
  {
    slug: 'fragen',
    name: 'Fragen',
    description: 'Alles, was mit einem Fragezeichen endet. Auch die vermeintlich kleinen.',
    sortOrder: 3,
  },
  {
    slug: 'vorstellen',
    name: 'Vorstellen',
    description: 'Neu hier? Erzähl kurz, wer du bist und wie dein Morgen aussieht.',
    sortOrder: 4,
  },
]

/**
 * Tage in der Vergangenheit statt fester Daten: die Themen sollen sich in den
 * bestehenden Feed EINSORTIEREN, nicht alle auf einmal obenauf liegen. Ein
 * Schaufenster, in dem neun Beiträge dieselbe Minute tragen, sieht aus wie
 * das, was es dann auch wäre — eine Einspielung.
 */
const THEMEN = [
  {
    kategorie: 'ankuendigungen',
    type: 'post',
    title: 'So sind die Diskussionen aufgebaut',
    body: 'Kurz zur Orientierung: Der **Feed** ist der Strom — alles, was gerade passiert.\n\nDie **Diskussionen** zeigen dieselben Beiträge nach Kategorien geordnet, damit man etwas wiederfindet.\n\n- **Ankündigungen** — schreibt das Team.\n- **Praxis & Technik** — Haltungen, Atem, Abläufe.\n- **Fragen** — alles mit Fragezeichen.\n- **Vorstellen** — neu hier? Sag Hallo.\n\nDeutsch und Englisch stehen nebeneinander. Schreib in der Sprache, in der du denkst.',
    autor: ['demo-lena', 'Lena (Coach)'],
    vorTagen: 34, upvotes: 12, downvotes: 0, pinned: true,
  },
  {
    kategorie: 'vorstellen',
    type: 'post',
    title: 'Sag Hallo — wer bist du, und wie sieht dein Morgen aus?',
    body: 'Zwei bis drei Sätze reichen: Wo wachst du auf, was ist das Erste, was du tust, und was möchtest du hier finden?\n\nIch fange an: Ich bin Lena, lebe auf Maui, und mein Morgen beginnt draußen — zehn Minuten Atem, bevor irgendein Bildschirm angeht.',
    autor: ['demo-lena', 'Lena (Coach)'],
    vorTagen: 31, upvotes: 9, downvotes: 0,
  },
  {
    kategorie: 'vorstellen',
    type: 'post',
    title: 'Hallo aus Hamburg — Frühschicht-Morgen',
    body: 'Ich bin Jonas, arbeite in Schichten, und mein Morgen fängt oft um halb fünf an.\n\nLange dachte ich, das schließt so eine Routine aus. Tut es nicht — sie ist nur kürzer. Sechs Minuten, im Flur, bevor ich das Haus verlasse.',
    autor: ['demo-jonas', 'Jonas'],
    vorTagen: 27, upvotes: 14, downvotes: 0,
  },
  {
    kategorie: 'praxis',
    type: 'post',
    title: 'Zehn Minuten, die immer gehen — auch an schlechten Tagen',
    body: 'Meine Notfall-Reihenfolge, wenn nichts klappt und der Tag schon schief startet:\n\n1. Zwei Minuten nur stehen und atmen. Nichts weiter.\n2. Katze-Kuh, langsam, bis der Rücken warm ist.\n3. Herabschauender Hund, aber mit gebeugten Knien.\n4. Eine Minute Vorbeuge, hängen lassen.\n5. Zum Schluss dreißig Sekunden aufrecht sitzen.\n\nDas Entscheidende ist nicht die Auswahl, sondern dass die Liste kurz genug ist, um sie nicht zu verhandeln.',
    autor: ['demo-nalani', 'Nalani'],
    vorTagen: 22, upvotes: 26, downvotes: 1,
  },
  {
    kategorie: 'praxis',
    type: 'post',
    title: 'Breathing before movement — why I switched the order',
    body: 'For a year I did it the other way round: move first, then breathe. It worked, but the first five minutes always felt like arguing with my body.\n\nSwitching the order changed that. Four minutes of slow breathing before anything else, and the movement afterwards costs nothing.\n\nCurious whether that holds for anyone else, or whether it is just how I am built.',
    autor: ['demo-grace', 'Grace'],
    vorTagen: 17, upvotes: 19, downvotes: 0,
  },
  {
    kategorie: 'fragen',
    type: 'question',
    title: 'Wie lange braucht es, bis sich eine Morgenroutine normal anfühlt?',
    body: 'Ich bin jetzt in der dritten Woche und es fühlt sich immer noch nach Überwindung an.\n\nIst das normal, oder mache ich etwas falsch? Wie war das bei euch — gab es einen Punkt, an dem es gekippt ist?',
    autor: ['demo-anna', 'Anna'],
    vorTagen: 13, upvotes: 21, downvotes: 0, solved: true,
  },
  {
    kategorie: 'fragen',
    type: 'question',
    title: 'Matte auf Teppich — geht das, oder rutscht das nur?',
    body: 'Mein einziger Platz mit genug Fläche ist Teppichboden. Bisher rutscht die Matte bei allem, was seitlich geht.\n\nHat jemand das gelöst, ohne extra Möbel zu rücken?',
    autor: ['demo-tobi', 'Tobi'],
    vorTagen: 9, upvotes: 7, downvotes: 0,
  },
  {
    kategorie: 'praxis',
    type: 'poll',
    title: 'Wie lang darf eure Morgen-Einheit höchstens sein?',
    body: 'Damit die nächsten Abläufe zu euren Morgen passen und nicht zu meinem.',
    pollOptions: ['Bis 10 Minuten', '10 bis 20 Minuten', '20 bis 30 Minuten', 'Länger, wenn Zeit ist'],
    autor: ['demo-lena', 'Lena (Coach)'],
    vorTagen: 6, upvotes: 8, downvotes: 0,
  },
  {
    kategorie: 'ankuendigungen',
    type: 'post',
    title: 'Hausregeln stehen jetzt hier',
    body: 'Kurz und dauerhaft: Wir reden über Praxis, nicht über Körper. Keine Diagnosen, keine Verkaufslinks.\n\nWer etwas empfiehlt, schreibt dazu, warum es bei ihm funktioniert hat — das ist der Unterschied zwischen einem Tipp und einer Anweisung.\n\nDie vollständigen Regeln stehen unter **Hausregeln** im Menü.',
    autor: ['demo-lena', 'Lena (Coach)'],
    vorTagen: 3, upvotes: 11, downvotes: 0, closed: true,
  },
]

/**
 * Antworten je Thema (Schlüssel = Titel des Themas).
 *
 * WARUM ÜBERHAUPT: ohne sie steht in der Themenliste hinter jeder Zeile eine
 * „0" — ein Diskussionsbereich, in dem niemand antwortet, wirkt leerer als
 * einer ohne Themen. Und die verschachtelten Antworten sind das, was das
 * Produkt von einem Gästebuch unterscheidet; ein Schaufenster, das sie nicht
 * zeigt, verkauft sie auch nicht.
 *
 * `antwortAuf` verweist auf den Text (Anfang) einer vorherigen Antwort
 * desselben Themas und erzeugt eine echte Verschachtelung (depth 1).
 *
 * `vorTagen` datiert die Antwort zurück. Das geht nur über `$createdAt`, und
 * Appwrite nimmt den Wert beim Anlegen tatsächlich an (nachgemessen) — ohne
 * ihn trüge ein Thema von „vor drei Wochen" lauter Antworten aus derselben
 * Minute, und die Demo sähe aus wie das, was sie dann wäre. Der Wert muss
 * KLEINER sein als das `vorTagen` seines Themas, sonst antwortet jemand,
 * bevor gefragt wurde; das Skript prüft das unten.
 */
const ANTWORTEN = {
  'Sag Hallo — wer bist du, und wie sieht dein Morgen aus?': [
    { autor: ['demo-anna', 'Anna'], text: 'Anna aus Freiburg. Mein Morgen fängt mit Kaffee an und hört mit Kaffee auf — dazwischen versuche ich seit vier Wochen, zehn Minuten unterzubringen. Klappt an drei von fünf Tagen.', upvotes: 6, vorTagen: 29 },
    { autor: ['demo-tobi', 'Tobi'], text: 'Tobi, Wien. Ich bin über den Kommentar-Thread hier gelandet und geblieben, weil niemand so tut, als wäre das alles leicht.', upvotes: 4, vorTagen: 26 },
    { autor: ['demo-grace', 'Grace'], text: 'Grace, Portland. I read for a month before writing anything — turns out that counts too.', upvotes: 8, vorTagen: 21 },
    { autor: ['demo-lena', 'Lena (Coach)'], text: 'Genau so ist es gemeint. Schön, dass ihr da seid. 🌅', upvotes: 3, antwortAuf: 'Grace, Portland', vorTagen: 20 },
  ],
  'Wie lange braucht es, bis sich eine Morgenroutine normal anfühlt?': [
    { autor: ['demo-nalani', 'Nalani'], text: 'Bei mir hat es ungefähr sechs Wochen gedauert — aber nicht so, dass es plötzlich leicht war. Es hat aufgehört, eine Entscheidung zu sein. Das ist der Unterschied.', upvotes: 18, vorTagen: 12 },
    { autor: ['demo-lena', 'Lena (Coach)'], text: 'Das deckt sich mit fast allem, was ich höre. Drei Wochen sind genau die Phase, in der es sich am zähesten anfühlt — der Reiz des Neuen ist weg, die Gewohnheit noch nicht da.\n\nWenn du etwas ändern willst: mach es **kürzer**, nicht lockerer. Sechs Minuten jeden Tag schlagen zwanzig Minuten an drei Tagen.', upvotes: 24, vorTagen: 11 },
    { autor: ['demo-anna', 'Anna'], text: 'Kürzer statt lockerer — das probiere ich. Danke euch beiden.', upvotes: 5, antwortAuf: 'Das deckt sich mit fast allem', vorTagen: 9 },
  ],
  'Zehn Minuten, die immer gehen — auch an schlechten Tagen': [
    { autor: ['demo-jonas', 'Jonas'], text: 'Die zwei Minuten Stehen am Anfang wirken übersprungen-würdig und sind es nicht. Ich habe es zweimal weggelassen und der Rest war beide Male schlechter.', upvotes: 11, vorTagen: 20 },
    { autor: ['demo-miriam', 'Miriam'], text: 'Frage zu Punkt 3: gebeugte Knie im Hund — dauerhaft oder nur zum Aufwärmen?', upvotes: 2, vorTagen: 18 },
    { autor: ['demo-nalani', 'Nalani'], text: 'Bei mir dauerhaft. Gerade Knie sind kein Ziel, ein langer Rücken schon.', upvotes: 9, antwortAuf: 'Frage zu Punkt 3', vorTagen: 17 },
  ],
  'Matte auf Teppich — geht das, oder rutscht das nur?': [
    { autor: ['demo-grace', 'Grace'], text: 'A thin yoga towel under the mat solved it for me — the kind with the rubber dots. Cheaper than a new mat and it fits in a drawer.', upvotes: 7, vorTagen: 8 },
    { autor: ['demo-tobi', 'Tobi'], text: 'Probiere ich, danke!', upvotes: 1, antwortAuf: 'A thin yoga towel', vorTagen: 7 },
  ],
  'Breathing before movement — why I switched the order': [
    { autor: ['demo-lena', 'Lena (Coach)'], text: 'It holds for more people than you would think. Breathing first tells the nervous system what kind of morning this is going to be — the movement then meets a body that has already agreed.', upvotes: 15, vorTagen: 15 },
    { autor: ['demo-anna', 'Anna'], text: 'Ich habe es heute umgedreht und war ehrlich überrascht. Vier Minuten, und der Rest ging von allein.', upvotes: 6, vorTagen: 12 },
  ],
  'So sind die Diskussionen aufgebaut': [
    { autor: ['demo-miriam', 'Miriam'], text: 'Danke — ich habe mich tatsächlich gefragt, warum manches doppelt auftaucht. Jetzt ergibt es Sinn.', upvotes: 5, vorTagen: 30 },
  ],
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function vorTagen(tage) {
  return new Date(Date.now() - tage * 86_400_000).toISOString()
}

async function findeKategorie(slug) {
  const { rows } = await tablesDB.listRows({
    databaseId, tableId: CATEGORIES_TABLE,
    queries: [Query.equal('communityId', [community]), Query.equal('slug', [slug]), Query.limit(1)],
  })
  return rows[0] ?? null
}

async function findeThema(title) {
  const { rows } = await tablesDB.listRows({
    databaseId, tableId: POSTS_TABLE,
    queries: [Query.equal('communityId', [community]), Query.equal('title', [title]), Query.limit(1)],
  })
  return rows[0] ?? null
}

console.log(`Seed Diskussionen → ${endpoint} / Projekt ${projectId} / DB ${databaseId} / Community ${community}${dryRun ? '  [DRY RUN]' : ''}`)

const idFuerSlug = new Map()
let neueKategorien = 0
for (const k of KATEGORIEN) {
  const vorhanden = await findeKategorie(k.slug)
  if (vorhanden) {
    idFuerSlug.set(k.slug, vorhanden.$id)
    console.log(`↷ Kategorie ${k.slug} (existiert)`)
    continue
  }
  if (dryRun) { idFuerSlug.set(k.slug, 'dry-run'); console.log(`+ Kategorie ${k.slug} — ${k.name}`); neueKategorien++; continue }
  const row = await tablesDB.createRow({
    databaseId, tableId: CATEGORIES_TABLE, rowId: ID.unique(),
    data: { communityId: community, name: k.name, slug: k.slug, description: k.description, sortOrder: k.sortOrder, active: true },
    permissions: READ_PUBLIC,
  })
  idFuerSlug.set(k.slug, row.$id)
  neueKategorien++
  console.log(`✔ Kategorie ${k.slug} — ${k.name}`)
}

let neueThemen = 0
for (const t of THEMEN) {
  if (await findeThema(t.title)) { console.log(`↷ Thema „${t.title.slice(0, 44)}…" (existiert)`); continue }
  const categoryId = idFuerSlug.get(t.kategorie)
  if (!categoryId) { console.error(`✖ Kategorie ${t.kategorie} fehlt — Thema übersprungen`); continue }
  const wann = vorTagen(t.vorTagen)
  const [authorId, authorName] = t.autor
  if (dryRun) { console.log(`+ Thema [${t.kategorie}] ${t.title}`); neueThemen++; continue }
  await tablesDB.createRow({
    databaseId, tableId: POSTS_TABLE, rowId: ID.unique(),
    data: {
      type: t.type,
      title: t.title,
      body: t.body,
      authorId, authorName,
      status: 'published',
      scheduledAt: null,
      publishedAt: wann,
      // Genau wie die Route: nur ein `poll` trägt Optionen, alles andere null.
      pollOptions: t.type === 'poll' ? JSON.stringify(t.pollOptions) : null,
      pollEndsAt: null,
      upvotes: t.upvotes ?? 0,
      downvotes: t.downvotes ?? 0,
      score: (t.upvotes ?? 0) - (t.downvotes ?? 0),
      communityId: community,
      categoryId,
      lastActivityAt: wann,
      pinned: t.pinned ?? false,
      closed: t.closed ?? false,
      solved: t.solved ?? false,
      editedAt: null,
    },
    permissions: READ_PUBLIC,
  })
  neueThemen++
  console.log(`✔ Thema [${t.kategorie}] ${t.title}`)
}

/**
 * Antworten. Läuft NACH den Themen, weil eine Antwort die Row-Id ihres Themas
 * braucht — und die gibt es erst, wenn das Thema steht.
 *
 * Idempotenz über den Text der Antwort zusammen mit dem Thema: ein zweiter
 * Lauf ergänzt nur, was fehlt.
 */
const COMMENTS_TABLE = 'comments'
const slugFuerId = new Map(KATEGORIEN.map(k => [idFuerSlug.get(k.slug), k.slug]))

let neueAntworten = 0
for (const [themaTitel, antworten] of Object.entries(ANTWORTEN)) {
  const thema = await findeThema(themaTitel)
  if (!thema) { console.error(`✖ Thema „${themaTitel.slice(0, 40)}…" nicht gefunden — Antworten übersprungen`); continue }

  const kategorieSlug = slugFuerId.get(thema.categoryId) ?? 'praxis'
  const pfad = discussionTopicPath(kategorieSlug, thema.$id, topicSlug(thema.title, thema.body))

  const { rows: bestehende } = await tablesDB.listRows({
    databaseId, tableId: COMMENTS_TABLE,
    queries: [Query.equal('communityId', [community]), Query.equal('targetId', [thema.$id]), Query.limit(100)],
  })
  const idFuerText = new Map(bestehende.map(r => [r.content, r.$id]))

  const themaTage = THEMEN.find(x => x.title === themaTitel)?.vorTagen ?? 0

  for (const a of antworten) {
    if (idFuerText.has(a.text)) continue
    const [authorId, authorName] = a.autor
    // Eine Antwort, die älter ist als ihr Thema, wäre eine sichtbare Lüge —
    // und in der Themenliste stünde sie als „Aktivität" VOR der Eröffnung.
    if (a.vorTagen >= themaTage) {
      console.error(`✖ Antwort von ${authorName} ist ${a.vorTagen} Tage alt, das Thema nur ${themaTage} — übersprungen`)
      continue
    }
    // Verschachtelung: `antwortAuf` nennt den Anfang eines Geschwister-Textes.
    let parentId = null
    let rootId = null
    if (a.antwortAuf) {
      const treffer = [...idFuerText.entries()].find(([text]) => text.startsWith(a.antwortAuf))
      if (!treffer) { console.error(`✖ Bezug „${a.antwortAuf}" nicht gefunden — Antwort bleibt oben`) }
      else { parentId = treffer[1]; rootId = treffer[1] }
    }
    if (dryRun) {
      // Im Trockenlauf entsteht keine Zeile — also auch keine Id, auf die sich
      // die nächste Antwort beziehen könnte. Ohne diesen Platzhalter meldete
      // der Probelauf für JEDE Verschachtelung einen Fehler, den der echte Lauf
      // nicht hat: dort steht die Eltern-Antwort, bevor das Kind drankommt.
      idFuerText.set(a.text, 'dry-run')
      console.log(`+ Antwort von ${authorName} auf „${themaTitel.slice(0, 34)}…"${parentId ? ' (verschachtelt)' : ''}`)
      neueAntworten++
      continue
    }
    const row = await tablesDB.createRow({
      databaseId, tableId: COMMENTS_TABLE, rowId: ID.unique(),
      data: {
        targetId: thema.$id,
        targetType: 'post',
        content: a.text,
        authorId, authorName,
        parentId,
        rootId,
        depth: parentId ? 1 : 0,
        upvotes: a.upvotes ?? 0,
        downvotes: 0,
        score: a.upvotes ?? 0,
        status: 'active',
        editedAt: null,
        targetUrl: pfad,
        authorKind: 'user',
        communityId: community,
        // Appwrite übernimmt ein mitgegebenes `$createdAt` (nachgemessen) —
        // ohne das trüge jede Antwort die Sekunde des Seed-Laufs.
        $createdAt: new Date(Date.now() - a.vorTagen * 86_400_000).toISOString(),
      },
      // Wie die Bestands-Kommentare der Demo: öffentlich lesbar, änderbar nur
      // vom Verfasser.
      permissions: [
        ...READ_PUBLIC,
        Permission.update(Role.user(authorId)),
        Permission.delete(Role.user(authorId)),
      ],
    })
    idFuerText.set(a.text, row.$id)
    neueAntworten++
  }
  console.log(`✔ Antworten zu „${themaTitel.slice(0, 44)}"`)
}

console.log(`\nFertig: ${neueKategorien} Kategorien, ${neueThemen} Themen, ${neueAntworten} Antworten neu${dryRun ? ' (nichts geschrieben)' : ''}.`)
