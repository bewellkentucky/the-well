import { headers } from "next/headers"
import { db } from "@/lib/db"
import { getActor } from "@/lib/tenant"
import type { CompanyBrand } from "@/lib/branding"

/**
 * Branding for this request: the signed-in person's company, or (before
 * sign-in) the company whose address matches the request host. null means
 * Spotlight's default look. Company rows hold no secrets; only name, logo and
 * color are read here.
 */
export async function getRequestBrand(): Promise<CompanyBrand | null> {
  const actor = await getActor()
  if (actor) {
    return db.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true, logoUrl: true, brandColor: true },
    })
  }
  const host = (await headers()).get("host")?.toLowerCase()
  if (!host) return null
  const candidates = await db.company.findMany({
    where: { active: true, appUrl: { not: null } },
    select: { name: true, logoUrl: true, brandColor: true, appUrl: true },
  })
  const match = candidates.find((c) => {
    try {
      return new URL(c.appUrl!).host.toLowerCase() === host
    } catch {
      return false
    }
  })
  return match ? { name: match.name, logoUrl: match.logoUrl, brandColor: match.brandColor } : null
}
