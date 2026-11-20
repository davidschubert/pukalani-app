import { helpBaseUrl, helpRobotsTxt } from '../utils/helpSitemap'

/** robots.txt der Hilfe — Regeln und Begründung bei `helpRobotsTxt()`. */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return helpRobotsTxt(helpBaseUrl(event))
})
