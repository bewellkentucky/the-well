import { cache } from "react"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { getActor } from "@/lib/tenant"
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
