"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, ActionError, toActionError } from "@/lib/tenant"
import { formatStars } from "@/lib/brand"

export type RewardFormData = {
  title: string
  description: string
  cost: number
  category: string
  inventory: number | null
  icon: string
  color: string
}


const VALID_CATEGORIES = ["Swag", "Gift Card", "Time", "Office", "Team", "Growth"]

function validate(data: RewardFormData): void {
  if (!data.title?.trim()) throw new ActionError("Title is required.")
  if (!data.description?.trim()) throw new ActionError("Description is required.")
  if (!Number.isInteger(data.cost) || data.cost <= 0 || data.cost > 1_000_000)
    throw new ActionError("Cost must be a positive whole number.")
  if (!VALID_CATEGORIES.includes(data.category)) throw new ActionError("Invalid category.")
  if (data.inventory !== null && (!Number.isInteger(data.inventory) || data.inventory < 0))
    throw new ActionError("Inventory must be a non-negative whole number.")
  if (data.color && !/^#[0-9a-fA-F]{6}$/.test(data.color)) throw new ActionError("Color must be #rrggbb.")
}

function fields(data: RewardFormData) {
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    cost: data.cost,
    category: data.category,
    inventory: data.inventory,
    icon: (data.icon || "🎁").slice(0, 8),
    color: data.color || "#c2410c",
  }
}

function revalidateRewards() {
  revalidatePath("/admin")
  revalidatePath("/rewards")
}

export async function createReward(data: RewardFormData): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    validate(data)
    await actor.db.$transaction(async (tx) => {
      const reward = await tx.reward.create({ data: { companyId: actor.companyId, ...fields(data), active: true } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "create_reward",
          details: `Created: ${reward.title} (${formatStars(reward.cost)}, ${reward.category})`,
        },
      })
    })
    revalidateRewards()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to create reward.")
  }
}

export async function updateReward(id: string, data: RewardFormData): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    validate(data)
    await actor.db.$transaction(async (tx) => {
      const { count } = await tx.reward.updateMany({ where: { id }, data: fields(data) })
      if (count !== 1) throw new ActionError("Reward not found.")
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: "edit_reward",
          details: `Edited: ${data.title.trim()}`,
        },
      })
    })
    revalidateRewards()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to update reward.")
  }
}

export async function setRewardActive(id: string, active: boolean): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const reward = await tx.reward.findUnique({ where: { id }, select: { title: true } })
      if (!reward) throw new ActionError("Reward not found.")
      await tx.reward.updateMany({ where: { id }, data: { active: active === true } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          action: active ? "enable_reward" : "disable_reward",
          details: `${active ? "Enabled" : "Disabled"}: ${reward.title}`,
        },
      })
    })
    revalidateRewards()
    return {}
  } catch (e) {
    return toActionError(e, "Failed to update reward.")
  }
}
