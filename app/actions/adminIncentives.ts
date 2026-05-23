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

export type IncentiveFormData = {
  title:        string
  description:  string
  reward:       number
  verification: string
  cap:          string
  icon:         string
  color:        string
  proofPrompt:  string | null
  sortOrder:    number
  startsAt:     string | null  // YYYY-MM-DD or null
  endsAt:       string | null  // YYYY-MM-DD or null
}

function validate(data: IncentiveFormData): string | null {
  if (!data.title.trim())       return "Title is required."
  if (!data.description.trim()) return "Description is required."
  if (!Number.isInteger(data.reward) || data.reward <= 0)
    return "Reward must be a positive whole number."
  if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0)
    return "Sort order must be a non-negative whole number."
  if (!["self", "admin"].includes(data.verification))
    return "Invalid verification mode."
  if (!["once", "monthly", "quarterly", "unlimited"].includes(data.cap))
    return "Invalid cap."
  if (data.startsAt && data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt))
    return "End date must be after start date."
  return null
}

export async function createIncentive(
  data: IncentiveFormData
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

      const incentive = await tx.incentive.create({
        data: {
          id:           crypto.randomUUID(),
          title:        data.title.trim(),
          description:  data.description.trim(),
          reward:       data.reward,
          verification: data.verification,
          cap:          data.cap,
          icon:         data.icon || "⭐",
          color:        data.color,
          proofPrompt:  data.proofPrompt?.trim() || null,
          active:       true,
          sortOrder:    data.sortOrder,
          startsAt:     data.startsAt ? new Date(data.startsAt) : null,
          endsAt:       data.endsAt   ? new Date(data.endsAt)   : null,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   "create_incentive",
          actorName,
          details:  `Created: ${incentive.title} (${incentive.reward}đ, ${incentive.cap}, ${incentive.verification})`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to create incentive." }
  }

  revalidatePath("/admin")
  revalidatePath("/earn")
  revalidatePath("/")
  return {}
}

export async function updateIncentive(
  id: string,
  data: IncentiveFormData
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

      // active is managed separately by setIncentiveActive
      await tx.incentive.update({
        where: { id },
        data: {
          title:        data.title.trim(),
          description:  data.description.trim(),
          reward:       data.reward,
          verification: data.verification,
          cap:          data.cap,
          icon:         data.icon || "⭐",
          color:        data.color,
          proofPrompt:  data.proofPrompt?.trim() || null,
          sortOrder:    data.sortOrder,
          startsAt:     data.startsAt ? new Date(data.startsAt) : null,
          endsAt:       data.endsAt   ? new Date(data.endsAt)   : null,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   "edit_incentive",
          actorName,
          details:  `Edited: ${data.title.trim()}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to update incentive." }
  }

  revalidatePath("/admin")
  revalidatePath("/earn")
  revalidatePath("/")
  return {}
}

export async function setIncentiveActive(
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

      const incentive = await tx.incentive.update({
        where: { id },
        data:  { active },
        select: { title: true },
      })

      await tx.auditLog.create({
        data: {
          actorId,
          action:   active ? "enable_incentive" : "disable_incentive",
          actorName,
          details:  `${active ? "Enabled" : "Disabled"}: ${incentive.title}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to update incentive." }
  }

  revalidatePath("/admin")
  revalidatePath("/earn")
  return {}
}
