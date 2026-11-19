"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, ActionError, toActionError } from "@/lib/tenant"
import { normalizeLogoUrl } from "@/lib/branding"
import { formatStars } from "@/lib/brand"

// Company settings live on the Company row. Each action changes only the
// actor's own company (companyId comes from requireAdmin, never the client).

async function audit(actor: Awaited<ReturnType<typeof requireAdmin>>, details: string, amount?: number) {
  await actor.db.auditLog.create({
    data: {
      companyId: actor.companyId,
      actorId: actor.userId,
      actorName: actor.fullName,
      action: "update_setting",
      details,
      amount: amount ?? null,
    },
  })
}

export async function setAllowanceSetting(amount: number): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    if (!Number.isInteger(amount) || amount < 0 || amount > 10_000)
      throw new ActionError("Amount must be a whole number between 0 and 10,000.")
    await actor.db.company.update({ where: { id: actor.companyId }, data: { allowanceAmount: amount } })
    await audit(actor, `Giving allowance -> ${formatStars(amount)}`, amount)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}

export async function setFeaturedCount(count: number): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    if (!Number.isInteger(count) || count < 0 || count > 6)
      throw new ActionError("Featured count must be a whole number from 0 to 6.")
    await actor.db.company.update({ where: { id: actor.companyId }, data: { featuredIncentiveCount: count } })
    await audit(actor, `Featured incentives on Home -> ${count}`)
    revalidatePath("/admin")
    revalidatePath("/")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}

// Company admins set the logo. The color palette is set by the platform owner
// in /platform (it is contrast-checked there).
export async function setBranding(input: { logoUrl: string | null }): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    let logoUrl: string | null
    try {
      logoUrl = normalizeLogoUrl(input?.logoUrl)
    } catch (e) {
      throw new ActionError((e as Error).message)
    }
    await actor.db.company.update({ where: { id: actor.companyId }, data: { logoUrl } })
    await audit(actor, `Branding -> logo ${logoUrl ? "set" : "default"}`)
    revalidatePath("/", "layout")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}
