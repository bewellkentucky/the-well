"use server"

// Platform owner only. These act across companies, so they use the unscoped
// client deliberately and pass companyId explicitly on every write.
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requirePlatformOwner, ActionError, toActionError } from "@/lib/tenant"
import { normalizeDomains, normalizeSlug } from "@/lib/companies"
import { normalizeAppUrl, normalizeBrandColor, normalizeLogoUrl } from "@/lib/branding"

export type CompanyInput = {
  name: string
  slug: string
  domains: string
  appUrl: string | null
  logoUrl: string | null
  brandColor: string | null
  bambooEnabled: boolean
  bambooSubdomain: string | null
  chatSpace: string | null
  active: boolean
}

function clean(input: CompanyInput) {
  const name = String(input.name ?? "").trim()
  if (name.length < 2 || name.length > 120) throw new ActionError("Company name is required.")
  let slug: string, domains: string[], appUrl: string | null, logoUrl: string | null, brandColor: string | null
  try {
    slug = normalizeSlug(input.slug)
    domains = normalizeDomains(input.domains)
    appUrl = normalizeAppUrl(input.appUrl)
    logoUrl = normalizeLogoUrl(input.logoUrl)
    brandColor = normalizeBrandColor(input.brandColor)
  } catch (e) {
    throw new ActionError((e as Error).message)
  }
  const bambooSubdomain = input.bambooSubdomain?.trim() || null
  if (bambooSubdomain && !/^[a-z0-9-]{2,63}$/i.test(bambooSubdomain)) throw new ActionError("Invalid BambooHR subdomain.")
  const chatSpace = input.chatSpace?.trim() || null
  if (chatSpace && !/^spaces\/[A-Za-z0-9_-]+$/.test(chatSpace)) throw new ActionError("Chat space must look like spaces/XXXX.")
  return {
    name, slug, domains, appUrl, logoUrl, brandColor,
    bambooEnabled: input.bambooEnabled === true && !!bambooSubdomain,
    bambooSubdomain, chatSpace, active: input.active !== false,
  }
}

async function assertDomainsFree(domains: string[], companyId: string | null) {
  const taken = await db.companyDomain.findMany({
    where: { domain: { in: domains }, ...(companyId ? { NOT: { companyId } } : {}) },
    select: { domain: true },
  })
  if (taken.length) throw new ActionError(`Already used by another company: ${taken.map((t) => t.domain).join(", ")}`)
}

export async function createCompany(input: CompanyInput): Promise<{ error?: string; id?: string }> {
  try {
    const actor = await requirePlatformOwner()
    const c = clean(input)
    await assertDomainsFree(c.domains, null)
    const { domains, ...fields } = c
    const company = await db.$transaction(async (tx) => {
      const created = await tx.company.create({ data: fields })
      await tx.companyDomain.createMany({ data: domains.map((domain) => ({ domain, companyId: created.id })) })
      await tx.auditLog.create({
        data: {
          companyId: created.id,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "create_company",
          details: `Created company ${created.name} (${domains.join(", ")})`,
        },
      })
      return created
    })
    revalidatePath("/platform")
    return { id: company.id }
  } catch (e) {
    return toActionError(e)
  }
}

export async function updateCompany(id: string, input: CompanyInput): Promise<{ error?: string }> {
  try {
    const actor = await requirePlatformOwner()
    const c = clean(input)
    if (id === actor.companyId && c.active === false) throw new ActionError("You can't deactivate your own company.")
    await assertDomainsFree(c.domains, id)
    const { domains, ...fields } = c
    await db.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { id }, select: { id: true } })
      if (!before) throw new ActionError("Company not found.")
      await tx.company.update({ where: { id }, data: fields })
      await tx.companyDomain.deleteMany({ where: { companyId: id, domain: { notIn: domains } } })
      await tx.companyDomain.createMany({ data: domains.map((domain) => ({ domain, companyId: id })), skipDuplicates: true })
      await tx.auditLog.create({
        data: {
          companyId: id,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "update_company",
          details: `Updated company settings (domains: ${domains.join(", ")})`,
        },
      })
    })
    revalidatePath("/platform")
    revalidatePath("/", "layout")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}
