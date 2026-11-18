/**
 * BESTAND: ROUTEN IM BLICK, DIE NOCH KEINEN ROLLEN-TEST HABEN (P27, OPS-009).
 *
 * Stand 2026-11-17, einmalig mechanisch aus dem damaligen Code erzeugt. Gelesen
 * von `../route-role-coverage.test.ts`.
 *
 * Diese Liste darf NUR SCHRUMPFEN. Bekommt eine Route einen Rollen-Test
 * (Prüfstand `participationHarness.ts`), fliegt ihr Eintrag hier raus — der
 * Wächter meldet es. Eine NEUE Route gehört NICHT hierher: sie bekommt gleich
 * einen Test.
 *
 * Gruppiert nach Layer (`packages/<name>` ⇒ `<name>`, `apps/<name>` ⇒
 * `apps/<name>`), Gruppen und Einträge alphabetisch. Pfade relativ zum Repo.
 */
export const ROUTE_ROLE_BACKLOG: Readonly<Record<string, readonly string[]>> = {
  'apps/comments': [
    'apps/comments/server/api/events/[id]/checkout.post.ts',
  ],
  'apps/control': [
    'apps/control/server/api/control/billing/community/checkout.post.ts',
    'apps/control/server/api/control/billing/community/portal.post.ts',
    'apps/control/server/api/control/billing/prices.get.ts',
    'apps/control/server/api/control/billing/prices.post.ts',
    'apps/control/server/api/control/stripe/keys.post.ts',
    'apps/control/server/api/control/stripe/prices.post.ts',
    'apps/control/server/api/control/stripe/status.get.ts',
    'apps/control/server/api/control/stripe/webhook.post.ts',
  ],
  'apps/photos': [
    'apps/photos/server/api/contact.post.ts',
  ],
  'apps/portfolio': [
    'apps/portfolio/server/api/intro-call.post.ts',
  ],
  brand: [
    'packages/brand/server/api/brand/admin/derivation-unlocks/index.get.ts',
    'packages/brand/server/api/brand/admin/design-unlocks/index.get.ts',
    'packages/brand/server/api/brand/admin/intro-calls/[id]/index.patch.ts',
    'packages/brand/server/api/brand/admin/intro-calls/index.get.ts',
    'packages/brand/server/api/brand/admin/profiles/[id]/derivation-lock.post.ts',
    'packages/brand/server/api/brand/admin/profiles/[id]/derivation-unlock.post.ts',
    'packages/brand/server/api/brand/admin/profiles/[id]/design-lock.post.ts',
    'packages/brand/server/api/brand/admin/profiles/[id]/design-unlock.post.ts',
    'packages/brand/server/api/brand/invite/check.post.ts',
    'packages/brand/server/api/brand/invite/redeem.post.ts',
    'packages/brand/server/api/brand/ops/events-sweep.post.ts',
    'packages/brand/server/api/brand/profiles/[id]/analyze.post.ts',
    'packages/brand/server/api/brand/profiles/[id]/design.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/index.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/index.patch.ts',
    'packages/brand/server/api/brand/profiles/[id]/inspiration/[fileId].delete.ts',
    'packages/brand/server/api/brand/profiles/[id]/inspiration/[fileId].patch.ts',
    'packages/brand/server/api/brand/profiles/[id]/inspiration/[fileId]/image.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/inspiration/index.post.ts',
    'packages/brand/server/api/brand/profiles/[id]/kit/workshop.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/mark/drafts/[draftId].delete.ts',
    'packages/brand/server/api/brand/profiles/[id]/mark/drafts/[draftId].patch.ts',
    'packages/brand/server/api/brand/profiles/[id]/mark/drafts/[draftId]/image.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/messages.get.ts',
    'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey].get.ts',
    'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/generations.get.ts',
    'packages/brand/server/api/brand/profiles/index.get.ts',
    'packages/brand/server/api/brand/profiles/index.post.ts',
    'packages/brand/server/api/brand/profiles/scores.get.ts',
    'packages/brand/server/api/brand/share/revoke.post.ts',
  ],
  market: [
    'packages/market/server/api/market/ops/sweep.post.ts',
    'packages/market/server/api/market/profiles/[id]/candidates.get.ts',
    'packages/market/server/api/market/profiles/[id]/competitors/[cid].delete.ts',
    'packages/market/server/api/market/profiles/[id]/competitors/[cid].patch.ts',
    'packages/market/server/api/market/profiles/[id]/competitors/index.get.ts',
    'packages/market/server/api/market/profiles/[id]/competitors/index.post.ts',
    'packages/market/server/api/market/profiles/[id]/rating.post.ts',
    'packages/market/server/api/market/profiles/[id]/report.get.ts',
    'packages/market/server/api/market/profiles/[id]/report.post.ts',
    'packages/market/server/api/market/profiles/[id]/visibility.patch.ts',
  ],
}
