"use server"

// Platform owner only. These act across companies, so they use the unscoped
// client deliberately and pass companyId explicitly on every write.
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requirePlatformOwner, ActionError, toActionError } from "@/lib/tenant"
import { normalizeDomains, normalizeSlug } from "@/lib/companies"
import { normalizeAppUrl, normalizeLogoUrl, normalizeShortName } from "@/lib/branding"
import { normalizeTheme, themeContrastProblems, type Theme } from "@/lib/theme"
import { normalizeBlockedSignIns } from "@/lib/blockedSignIns"
import { Prisma } from "@/app/generated/prisma/client"

export type CompanyInput = {
  name: string
  shortName: string | null
  slug: string
  domains: string
  appUrl: string | null
  logoUrl: string | null
  theme: Theme | null // null = Spotlight default
  bambooEnabled: boolean
  bambooSubdomain: string | null
  chatSpace: string | null
  active: boolean
}

function clean(input: CompanyInput) {
  const name = String(input.name ?? "").trim()
  if (name.length < 2 || name.length > 120) throw new ActionError("Company name is required.")
  let shortName: string | null, slug: string, domains: string[], appUrl: string | null, logoUrl: string | null, theme: Theme | null
  try {
    shortName = normalizeShortName(input.shortName)
    slug = normalizeSlug(input.slug)
    domains = normalizeDomains(input.domains)
    appUrl = normalizeAppUrl(input.appUrl)
    logoUrl = normalizeLogoUrl(input.logoUrl)
    theme = normalizeTheme(input.theme)
  } catch (e) {
    throw new ActionError((e as Error).message)
  }
  if (theme) {
    const problems = themeContrastProblems(theme)
    if (problems.length)
      throw new ActionError(
        `These colors are too hard to read (WCAG AA): ${problems
          .map((p) => `${p.use} ${p.ratio}:1, needs ${p.min}:1`)
          .join("; ")}`,
      )
  }
  const bambooSubdomain = input.bambooSubdomain?.trim() || null
  if (bambooSubdomain && !/^[a-z0-9-]{2,63}$/i.test(bambooSubdomain)) throw new ActionError("Invalid BambooHR subdomain.")
  const chatSpace = input.chatSpace?.trim() || null
  if (chatSpace && !/^spaces\/[A-Za-z0-9_-]+$/.test(chatSpace)) throw new ActionError("Chat space must look like spaces/XXXX.")
  return {
    name, shortName, slug, domains, appUrl, logoUrl,
    theme: theme ?? Prisma.DbNull,
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

/**
 * Launch switch (lib/launch.ts). Platform owner only, audit-logged. Opening
 * lets everyone from the company's domains sign in and turns on its cron,
 * Chat posts and BambooHR sync. Closing is allowed too (same audit).
 */
export async function setCompanyOpen(id: string, open: boolean): Promise<{ error?: string }> {
  try {
    const actor = await requirePlatformOwner()
    if (typeof open !== "boolean") throw new ActionError("Invalid value.")
    await db.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { id }, select: { id: true, name: true, isOpen: true } })
      if (!before) throw new ActionError("Company not found.")
      if (before.isOpen === open) return
      await tx.company.update({ where: { id }, data: { isOpen: open } })
      await tx.auditLog.create({
        data: {
          companyId: id,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: open ? "open_company" : "close_company",
          details: open
            ? `Opened Spotlight for ${before.name}: everyone from its domains can sign in`
            : `Closed Spotlight for ${before.name}: only admins and testers can sign in`,
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

/** Tester flag: may sign in while the company is closed. Platform owner only, audit-logged. */
export async function setTester(userId: string, isTester: boolean): Promise<{ error?: string }> {
  try {
    const actor = await requirePlatformOwner()
    if (typeof isTester !== "boolean") throw new ActionError("Invalid value.")
    await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, companyId: true, isTester: true },
      })
      if (!target) throw new ActionError("Person not found.")
      if (target.isTester === isTester) return
      await tx.user.update({ where: { id: target.id }, data: { isTester } })
      await tx.auditLog.create({
        data: {
          companyId: target.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: target.id,
          targetName: target.fullName,
          action: isTester ? "add_tester" : "remove_tester",
          details: isTester ? "Can sign in before launch" : "No longer a tester",
        },
      })
    })
    revalidatePath("/platform")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}

/**
 * Blocked sign-in addresses (shared mailboxes, lib/blockedSignIns.ts).
 * Platform owner only, audit-logged with what was added and removed. Every
 * address must be on one of the company's own domains. Existing user rows for
 * a newly blocked address are not deactivated here (deactivate by hand).
 */
export async function setBlockedSignIns(companyId: string, input: string): Promise<{ error?: string }> {
  try {
    const actor = await requirePlatformOwner()
    await db.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, blockedSignIns: true, domains: { select: { domain: true } } },
      })
      if (!company) throw new ActionError("Company not found.")
      let next: string[]
      try {
        next = normalizeBlockedSignIns(input, company.domains.map((d) => d.domain))
      } catch (e) {
        throw new ActionError((e as Error).message)
      }
      const added = next.filter((e) => !company.blockedSignIns.includes(e))
      const removed = company.blockedSignIns.filter((e) => !next.includes(e))
      if (!added.length && !removed.length) return
      await tx.company.update({ where: { id: companyId }, data: { blockedSignIns: next } })
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "set_blocked_signins",
          details: [
            added.length ? `Blocked: ${added.join(", ")}` : null,
            removed.length ? `Unblocked: ${removed.join(", ")}` : null,
          ].filter(Boolean).join(". "),
        },
      })
    })
    revalidatePath("/platform")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}
