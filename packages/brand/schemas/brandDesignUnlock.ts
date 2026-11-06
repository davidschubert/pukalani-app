import { z } from 'zod'

/** Eine Seite der Betreiber-Liste. Wie überall: Query.limit ist Pflicht. */
export const BRAND_DESIGN_UNLOCK_PAGE_DEFAULT = 50
export const BRAND_DESIGN_UNLOCK_PAGE_MAX = 100

export function createBrandDesignUnlockListQuerySchema() {
  return z.object({
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_DESIGN_UNLOCK_PAGE_MAX)
      .default(BRAND_DESIGN_UNLOCK_PAGE_DEFAULT),
  })
}

export type BrandDesignUnlockListQuery
  = z.output<ReturnType<typeof createBrandDesignUnlockListQuerySchema>>
