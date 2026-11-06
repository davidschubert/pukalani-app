<script setup lang="ts">
import { h, resolveComponent, type VNodeChild } from 'vue'
import { markdownHeadings, parseMarkdown, type BlockNode, type InlineNode } from '../../shared/markdown'
import { classifyContentLink, splitContentLinks, type ContentLink } from '../../shared/contentLinks'
import { splitMentions } from '../../shared/mentions'

/**
 * Rendert user-generiertes Markdown (Subset-AST aus shared/markdown.ts)
 * ausschließlich über vnodes — kein v-html, Raw-HTML im Content bleibt
 * escapter Text (Vue). Links sind im Parser auf https?://-/-Pfade geprüft.
 * Core-Component (seit Phase 25) — Konsumenten: comments, posts, pages,
 * tickets, courses, events, platform-Tenant-Homepage.
 *
 * Link-Policy (Audit-Befund S3): EIGENE Pfade sind keine Fremdlinks —
 * sie werden über localePath() lokalisiert (auf /de/* führte [Feed](/feed)
 * sonst in die EN-Route), gehen als NuxtLink per Client-Navigation und
 * tragen KEIN nofollow/noreferrer. Pfade MIT Locale-Prefix bleiben, wie sie
 * der Autor geschrieben hat. Fremde Ziele behalten target=_blank +
 * noopener/noreferrer/nofollow — die Sicherheits-Schranke (isSafeHref im
 * Parser) ist unverändert.
 */
/**
 * ERWÄHNUNGEN (@handle, seit 2026-08-04) — `mentions` ist die Menge der
 * Handles, die es in DIESER Community wirklich gibt (Vergleichsform, klein).
 *
 * KEIN LINK, sondern nur eine Hervorhebung: öffentliche Profilseiten gibt es
 * nicht, ein Link liefe also ins Leere. Sobald es sie gibt, wird aus dem
 * `<span>` hier ein `NuxtLink` — die Stelle ist genau eine.
 *
 * WEGGELASSEN heisst KEINE Hervorhebung, nicht „alles hervorheben". Damit
 * ändert sich für die sieben bestehenden Aufrufer dieser Komponente nichts,
 * und ein Tippfehler-`@nmae` sieht nie so aus, als führte er zu einem
 * Menschen. Die Sicherheitsgrenze bleibt unangetastet: auch ein
 * Erwähnungs-Stück ist ein vnode-TEXTknoten, es gibt weiterhin keinen
 * v-html-Pfad.
 */
/**
 * VERWEISE IM FLIESSTEXT (F57) — `links` sind die vom SERVER aufgelösten
 * Ziele, die als gewöhnlicher Text im Beitrag stehen (heute: Themen-Verweise
 * `#<id>-<deko>` aus dem posts-Layer).
 *
 * Anders als eine Erwähnung wird ein Verweis VERLINKT: ein Thema hat, was
 * einem Menschen fehlt — eine Zielseite. Angezeigt wird `label`, also der
 * HEUTIGE Titel des Ziels, nicht der Token. Wer sein Thema umbenennt, ändert
 * damit die Anzeige in jedem fremden Beitrag, der darauf zeigt.
 *
 * Diese Komponente kennt weder `#` noch Themen — sie ersetzt exakt die
 * Zeichenketten, die ihr gereicht werden (Begründung in
 * `shared/contentLinks.ts`). Weggelassen heisst: keine Verlinkung, kein
 * Verhalten ändert sich für die bestehenden Aufrufer.
 */
/**
 * SPRUNGMARKEN AN DEN ÜBERSCHRIFTEN (`headingAnchors`, BI1 I3 — Plan
 * docs/plans/BRAND-INSIGHTS.md §9.5).
 *
 * Aus ist der Default und bleibt es: die sieben bestehenden Aufrufer rendern
 * user-generierte Beiträge, und eine Id je Überschrift wäre dort ein
 * Anker-Namensraum, den niemand vergeben hat (mehrere Beiträge auf EINER
 * Feed-Seite ergäben doppelte Ids im selben Dokument). Wo ein Text die GANZE
 * Seite ist — ein Insights-Artikel —, ist genau das erwünscht.
 *
 * Die Ids kommen aus `markdownHeadings(source)` und werden NICHT hier noch
 * einmal gerechnet: das Inhaltsverzeichnis liest dieselbe Liste, und zwei
 * Rechnungen wären zwei Wahrheiten über dasselbe Sprungziel.
 */
const props = defineProps<{
  source: string
  mentions?: string[]
  links?: ContentLink[]
  headingAnchors?: boolean
}>()

/** Leer, solange niemand Sprungmarken will — dann kostet der Parser-Lauf nichts. */
const anchorIds = computed(() => (props.headingAnchors
  ? markdownHeadings(props.source).map(heading => heading.id)
  : []))

const knownMentions = computed(() => (props.mentions?.length ? new Set(props.mentions) : undefined))

const { locales } = useI18n()
const localePath = useLocalePath()
const NuxtLinkComponent = resolveComponent('NuxtLink')

const localeCodes = computed(() => locales.value.map(entry => entry.code))

function renderLink(node: Extract<InlineNode, { type: 'link' }>): VNodeChild {
  const linkClass = 'text-primary underline underline-offset-2'
  const kind = classifyContentLink(node.href, localeCodes.value)

  if (kind === 'external') {
    return h('a', {
      href: node.href,
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      class: linkClass,
    }, renderInline(node.children))
  }

  // Nur präfixlose eigene Pfade lokalisieren. localePath() gibt für nicht
  // auflösbare Pfade '' zurück (Tippfehler im Inhalt) — dann bleibt der Href
  // wie geschrieben, statt auf die aktuelle Seite zu zeigen.
  const localized = kind === 'internal' ? localePath(node.href) || node.href : node.href

  return h(NuxtLinkComponent, { to: localized, class: linkClass }, () => renderInline(node.children))
}

function renderInline(nodes: InlineNode[]): VNodeChild[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'strong': return h('strong', renderInline(node.children))
      case 'em': return h('em', renderInline(node.children))
      case 'code': return h('code', { class: 'rounded bg-elevated px-1 py-0.5 text-[0.85em]' }, node.text)
      case 'link': return renderLink(node)
      default: return renderText(node.text)
    }
  })
}

/**
 * Ein Text-Blatt: gewöhnlicher Text, mit hervorgehobenen Erwähnungen und
 * verlinkten Verweisen darin.
 *
 * ZWEI DURCHGÄNGE, NICHT EIN GEMEINSAMER REGEX: erst die Erwähnungen (`@`),
 * dann die Verweise (`#`) auf dem, was davon Text geblieben ist. So bleibt
 * `splitMentions` unangetastet, und die beiden Regeln können einander nicht in
 * die Quere kommen — ein `@handle` steht nie in einem Verweis-Token und
 * umgekehrt.
 */
function renderText(text: string): VNodeChild {
  const parts = splitMentions(text, knownMentions.value)

  return parts.flatMap((part): VNodeChild[] => {
    if (part.type === 'mention') {
      return [h('span', { class: 'font-medium text-primary', 'data-mention': part.handle }, part.text)]
    }
    return splitContentLinks(part.text, props.links).map(segment => (segment.type === 'link'
      // localePath() gibt für nicht auflösbare Pfade '' zurück — dann bleibt
      // der Href wie geliefert, statt auf die aktuelle Seite zu zeigen
      // (dieselbe Vorsicht wie in renderLink).
      ? h(NuxtLinkComponent, {
          to: localePath(segment.href) || segment.href,
          class: 'font-medium text-primary underline underline-offset-2',
          'data-topic-link': '',
        }, () => segment.label)
      : segment.text))
  })
}

/**
 * Zähler der Überschriften INNERHALB EINES Renderdurchlaufs — er wird in
 * `Content` vor dem Mapping zurückgesetzt. Er muss ausserhalb von
 * `renderBlock` stehen, weil die Funktion je Block einmal läuft; ein Zähler
 * darin zählte nie weiter.
 */
let headingIndex = 0

function renderBlock(block: BlockNode): VNodeChild {
  switch (block.type) {
    case 'codeblock':
      return h('pre', { class: 'overflow-x-auto rounded-md bg-elevated p-2 text-xs' }, h('code', block.text))
    case 'list':
      return h(block.ordered ? 'ol' : 'ul', { class: block.ordered ? 'list-decimal ps-5' : 'list-disc ps-5' },
        block.items.map(item => h('li', renderInline(item))))
    case 'quote':
      return h('blockquote', { class: 'border-s-2 border-default ps-3 text-muted whitespace-pre-line' }, renderInline(block.children))
    case 'heading':
      return h(block.level === 2 ? 'h2' : 'h3', {
        // `scroll-mt-10` gehört zur Sprungmarke, nicht zur Optik: ohne
        // Abstand nach oben verschwindet die angesprungene Überschrift unter
        // einer klebenden Kopfzeile.
        class: [
          block.level === 2 ? 'text-lg font-semibold mt-4 mb-1' : 'text-base font-semibold mt-3 mb-1',
          props.headingAnchors ? 'scroll-mt-10' : '',
        ],
        ...(props.headingAnchors ? { id: anchorIds.value[headingIndex++] } : {}),
      }, renderInline(block.children))
    default:
      return h('p', { class: 'whitespace-pre-line' }, renderInline(block.children))
  }
}

const Content = () => {
  headingIndex = 0
  return h('div', { class: 'space-y-2 leading-relaxed' }, parseMarkdown(props.source).map(renderBlock))
}
</script>

<template>
  <Content />
</template>
