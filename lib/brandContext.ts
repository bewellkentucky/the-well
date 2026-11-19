import { cache } from "react"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { getActor } from "@/lib/tenant"
import { auth } from "@/auth"
import type { CompanyBrand } from "@/lib/branding"

/**
 * Branding for this request: the signed-in person's company, or (before
 * sign-in) the company whose address matches the request host. null means
 * Spotlight's default look. Company rows hold no secrets; only name, logo and
 * palette are read here. Cached per request.
 */
export const getRequestBrand = cache(async function getRequestBrand(): Promise<CompanyBrand | null> {
  const actor = await getActor()
  if (actor) {
    return db.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true, shortName: true, logoUrl: true, theme: true },
    })
  }
  const host = (await headers()).get("host")?.toLowerCase()
  if (!host) return null
  const candidates = await db.company.findMany({
    where: { active: true, appUrl: { not: null } },
    select: { name: true, shortName: true, logoUrl: true, theme: true, appUrl: true },
  })
  const match = candidates.find((c) => {
    try {
      return new URL(c.appUrl!).host.toLowerCase() === host
    } catch {
      return false
    }
  })
  return match
    ? { name: match.name, shortName: match.shortName, logoUrl: match.logoUrl, theme: match.theme }
    : null
})

const BRAND_SELECT = { name: true, shortName: true, logoUrl: true, theme: true } as const

/**
 * Branding for "Spotlight is coming soon" (lib/launch.ts). Returns the closed
 * company's brand, or null when this isn't a coming-soon case:
 *  - the signed-in person's company is closed to them (session from before
 *    it closed), or
 *  - a refused sign-in redirected here with the company slug (only closed,
 *    active companies resolve, so the slug reveals nothing about open ones).
 */
export async function getComingSoonBrand(slug: string | undefined): Promise<CompanyBrand | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { active: true, company: { select: { ...BRAND_SELECT, active: true, isOpen: true } } },
    })
    if (user?.active && user.company.active && !user.company.isOpen) {
      const { name, shortName, logoUrl, theme } = user.company
      return { name, shortName, logoUrl, theme }
    }
  }
  if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) return null
  return db.company.findFirst({ where: { slug, active: true, isOpen: false }, select: BRAND_SELECT })
}
