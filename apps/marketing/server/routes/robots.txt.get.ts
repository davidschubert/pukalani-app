import { marketingBaseUrl, marketingRobotsTxt } from '../utils/marketingRoutes'

/** robots.txt der Marketing-Site — Regeln und Begründung bei `marketingRobotsTxt()`. */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return marketingRobotsTxt(marketingBaseUrl(event))
})
