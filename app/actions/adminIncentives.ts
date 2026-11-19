"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, ActionError, toActionError, type ScopedTx } from "@/lib/tenant"
import { INCENTIVE_CAPS, INCENTIVE_ORDER } from "@/lib/incentives"
import { formatStars } from "@/lib/brand"

export type IncentiveFormData = {
  title: string
  description: string
  reward: number
  verification: string
  cap: string
  icon: string
  color: string
  proofPrompt: string | null
  startsAt: string | null // YYYY-MM-DD or null
  endsAt: string | null
}

function validate(data: IncentiveFormData): void {
  if (!data.title?.trim()) throw new ActionError("Title is required.")
  if (data.title.trim().length > 120) throw new ActionError("Title is too long.")
  if (!data.description?.trim()) throw new ActionError("Description is required.")
  if (!Number.isInteger(data.reward) || data.reward <= 0 || data.reward > 100_000)
    throw new ActionError("Reward must be a positive whole number.")
  if (!["self", "admin"].includes(data.verification)) throw new ActionError("Invalid verification mode.")
  if (!(INCENTIVE_CAPS as readonly string[]).includes(data.cap)) throw new ActionError("Invalid cap.")
  if (data.color && !/^#[0-9a-fA-F]{6}$/.test(data.color)) throw new ActionError("Color must be #rrggbb.")
  if (data.startsAt && data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt))
    throw new ActionError("End date must be after start date.")
}

function fields(data: IncentiveFormData) {
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    reward: data.reward,
    verification: data.verification,
    cap: data.cap,
    icon: (data.icon || "⭐").slice(0, 8),
    color: data.color || "#c2410c",
    proofPrompt: data.proofPrompt?.trim() || null,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    // End date is inclusive of the whole day.
    endsAt: data.endsAt ? new Date(`${data.endsAt}T23:59:59.999Z`) : null,
  }
}

/** Serializes order edits within one company. */
async function lockOrder(tx: ScopedTx, companyId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"incentive-order:" + companyId}))`
}

function revalidateIncentives() {
  revalidatePath("/admin")
  revalidatePath("/earn")
  revalidatePath("/")
}

export async function createIncentive(data: IncentiveFormData): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    validate(data)
    await actor.db.$transaction(async (tx) => {
      await lockOrder(tx, actor.companyId)
      const last = await tx.incentive.aggregate({ _max: { sortOrder: true } })
      const inc = await tx.incentive.create({
        data: { companyId: actor.companyId, ...fields(data), active: true, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "create_incentive",
          details: `Created: ${inc.title} (${formatStars(inc.reward)}, ${inc.cap}, ${inc.verification})`,
        },
      })
    })
    revalidateIncentives()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to create incentive.")
  }
}

export async function updateIncentive(id: string, data: IncentiveFormData): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    validate(data)
    await actor.db.$transaction(async (tx) => {
      const { count } = await tx.incentive.updateMany({ where: { id }, data: fields(data) })
      if (count !== 1) throw new ActionError("Incentive not found.")
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "edit_incentive",
          details: `Edited: ${data.title.trim()}`,
        },
      })
    })
    revalidateIncentives()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to update incentive.")
  }
}

export async function setIncentiveActive(id: string, active: boolean): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const inc = await tx.incentive.findUnique({ where: { id }, select: { title: true } })
      if (!inc) throw new ActionError("Incentive not found.")
      await tx.incentive.updateMany({ where: { id }, data: { active: active === true } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: active ? "enable_incentive" : "disable_incentive",
          details: `${active ? "Enabled" : "Disabled"}: ${inc.title}`,
        },
      })
    })
    revalidateIncentives()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to update incentive.")
  }
}

/**
 * Move an incentive up or down in the company's single incentive order.
 * Renumbers the whole list 0..n-1 so order is always contiguous and unique.
 */
export async function moveIncentive(id: string, direction: "up" | "down"): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    if (direction !== "up" && direction !== "down") throw new ActionError("Invalid direction.")
    await actor.db.$transaction(async (tx) => {
      await lockOrder(tx, actor.companyId)
      const all = await tx.incentive.findMany({ orderBy: INCENTIVE_ORDER, select: { id: true, title: true } })
      const i = all.findIndex((x) => x.id === id)
      if (i === -1) throw new ActionError("Incentive not found.")
      const j = direction === "up" ? i - 1 : i + 1
      if (j < 0 || j >= all.length) return
      ;[all[i], all[j]] = [all[j], all[i]]
      for (let k = 0; k < all.length; k++) {
        await tx.incentive.updateMany({ where: { id: all[k].id }, data: { sortOrder: k } })
      }
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "reorder_incentive",
          details: `Moved ${direction}: ${all[j].title} (now #${j + 1})`,
        },
      })
    })
    revalidateIncentives()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to reorder.")
  }
}
