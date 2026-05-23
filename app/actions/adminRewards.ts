"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in.")
  const actor = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true, fullName: true },
  })
  if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
    throw new Error("Not authorized.")
  return { actorId: session.user.id, actorName: actor.fullName, actorRole: actor.role }
}

export type RewardFormData = {
  title:       string
  description: string
  cost:        number
  category:    string
  inventory:   number | null
  icon:        string
  color:       string
}

const VALID_CATEGORIES = ["Swag", "Gift Card", "Time", "Office", "Team", "Growth"]

function validate(data: RewardFormData): string | null {
  if (!data.title.trim())       return "Title is required."
  if (!data.description.trim()) return "Description is required."
  if (!Number.isInteger(data.cost) || data.cost <= 0)
    return "Cost must be a positive whole number."
  if (!VALID_CATEGORIES.includes(data.category))
    return "Invalid category."
  if (data.inventory !== null && (!Number.isInteger(data.inventory) || data.inventory < 0))
    return "Inventory must be a non-negative whole number."
  return null
}

export async function createReward(
  data: RewardFormData
): Promise<{ error?: string }> {
  let actorId: string, actorName: string
  try {
    ;({ actorId, actorName } = await requireAdmin())
  } catch (e: any) {
    return { error: e.message }
  }

  const err = validate(data)
  if (err) return { error: err }

  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where:  { id: actorId },
        select: { role: true },
      })
      if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
        throw new Error("Not authorized.")

      const reward = await tx.reward.create({
        data: {
          id:          crypto.randomUUID(),
          title:       data.title.trim(),
          description: data.description.trim(),
          cost:        data.cost,
          category:    data.category,
          inventory:   data.inventory,
          icon:        data.icon || "🎁",
          color:       data.color,
          active:      true,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   "create_reward",
          actorName,
          details:  `Created: ${reward.title} (${reward.cost}đ, ${reward.category})`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to create reward." }
  }

  revalidatePath("/admin")
  revalidatePath("/rewards")
  return {}
}

export async function updateReward(
  id: string,
  data: RewardFormData
): Promise<{ error?: string }> {
  let actorId: string, actorName: string
  try {
    ;({ actorId, actorName } = await requireAdmin())
  } catch (e: any) {
    return { error: e.message }
  }

  const err = validate(data)
  if (err) return { error: err }

  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where:  { id: actorId },
        select: { role: true },
      })
      if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
        throw new Error("Not authorized.")

      // active is intentionally NOT updated here — managed by setRewardActive
      // imageUrl is intentionally NOT updated here — set separately (staff shop)
      await tx.reward.update({
        where: { id },
        data: {
          title:       data.title.trim(),
          description: data.description.trim(),
          cost:        data.cost,
          category:    data.category,
          inventory:   data.inventory,
          icon:        data.icon || "🎁",
          color:       data.color,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   "edit_reward",
          actorName,
          details:  `Edited: ${data.title.trim()}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to update reward." }
  }

  revalidatePath("/admin")
  revalidatePath("/rewards")
  return {}
}

export async function setRewardActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  let actorId: string, actorName: string
  try {
    ;({ actorId, actorName } = await requireAdmin())
  } catch (e: any) {
    return { error: e.message }
  }

  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where:  { id: actorId },
        select: { role: true },
      })
      if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
        throw new Error("Not authorized.")

      const reward = await tx.reward.update({
        where: { id },
        data:  { active },
        select: { title: true },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   active ? "enable_reward" : "disable_reward",
          actorName,
          details:  `${active ? "Enabled" : "Disabled"}: ${reward.title}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to update reward." }
  }

  revalidatePath("/admin")
  revalidatePath("/rewards")
  return {}
}
