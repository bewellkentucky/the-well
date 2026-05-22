"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

const VALID_ROLES = ["owner", "admin", "member"] as const

async function getActorRole(id: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id }, select: { role: true } })
  return user?.role ?? null
}

export async function changeRole(
  targetId: string,
  newRole: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  if (!(VALID_ROLES as readonly string[]).includes(newRole))
    return { error: "Invalid role." }

  const actorRole = await getActorRole(session.user.id)
  if (actorRole !== "owner") return { error: "Only owners can change roles." }

  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: session.user!.id! },
        select: { role: true, fullName: true },
      })
      if (!actor || actor.role !== "owner")
        throw new Error("Only owners can change roles.")

      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { role: true, fullName: true },
      })
      if (!target) throw new Error("User not found.")

      if (target.role === "owner" && newRole !== "owner") {
        const ownerCount = await tx.user.count({ where: { role: "owner" } })
        if (ownerCount <= 1) throw new Error("Cannot remove the last owner.")
      }

      await tx.user.update({ where: { id: targetId }, data: { role: newRole } })
      await tx.auditLog.create({
        data: {
          actorId:    session.user!.id!,
          targetId,
          action:     "change_role",
          actorName:  actor.fullName,
          targetName: target.fullName,
          details:    `Role: ${target.role} → ${newRole}`,
        },
      })
    })

    revalidatePath("/admin")
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." }
  }
}

export async function adjustBalance(
  targetId: string,
  amount: number,
  reason: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  if (!Number.isInteger(amount) || amount === 0)
    return { error: "Amount must be a non-zero integer." }
  if (Math.abs(amount) > 10_000)
    return { error: "Amount cannot exceed ±10,000đ." }

  const trimmedReason = reason.trim()
  if (trimmedReason.length < 3)
    return { error: "A reason is required (at least 3 characters)." }

  const actorRole = await getActorRole(session.user.id)
  if (actorRole !== "owner" && actorRole !== "admin")
    return { error: "Insufficient permissions." }

  try {
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: session.user!.id! },
        select: { role: true, fullName: true },
      })
      if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
        throw new Error("Insufficient permissions.")

      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { id: true, balance: true, fullName: true },
      })
      if (!target) throw new Error("User not found.")

      if (amount < 0 && target.balance + amount < 0)
        throw new Error(
          `Cannot deduct more than the current balance (${target.balance}đ).`
        )

      await tx.user.update({
        where: { id: targetId },
        data: { balance: { increment: amount } },
      })
      await tx.auditLog.create({
        data: {
          actorId:    session.user!.id!,
          targetId,
          action:     "adjust_balance",
          actorName:  actor.fullName,
          targetName: target.fullName,
          amount,
          reason:     trimmedReason,
        },
      })
    })

    revalidatePath("/admin")
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." }
  }
}
