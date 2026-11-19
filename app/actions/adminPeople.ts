"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireAdmin, requirePlatformOwner, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { formatStars } from "@/lib/brand"

const VALID_ROLES = ["member", "admin"] as const
const MAX_ADJUST = 10_000

/**
 * Change a person's Spotlight role. Platform owner only (safest default; see
 * the overnight report's open questions). Works for any company; the audit
 * row lands in the target's company.
 */
export async function changeRole(targetId: string, newRole: string): Promise<{ error?: string }> {
  try {
    const actor = await requirePlatformOwner()
    if (!(VALID_ROLES as readonly string[]).includes(newRole)) throw new ActionError("Invalid role.")

    // Unscoped by design: the platform owner works across companies.
    await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, fullName: true, companyId: true },
      })
      if (!target) throw new ActionError("Person not found.")
      if (target.role === newRole) return

      if (target.role === "admin" && newRole !== "admin") {
        const admins = await tx.user.count({ where: { companyId: target.companyId, role: "admin", active: true } })
        if (admins <= 1) throw new ActionError("Can't remove the last admin of a company.")
      }
      await tx.user.update({ where: { id: target.id }, data: { role: newRole } })
      await tx.auditLog.create({
        data: {
          companyId: target.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: target.id,
          targetName: target.fullName,
          action: "change_role",
          details: `Role: ${target.role} -> ${newRole}`,
        },
      })
    })
    revalidatePath("/admin")
    revalidatePath("/platform")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}

/** Adjust a person's earned wallet. Spotlight admin, own company only. */
export async function adjustBalance(targetId: string, amount: number, reason: string): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    if (!Number.isInteger(amount) || amount === 0) throw new ActionError("Amount must be a non-zero whole number.")
    if (Math.abs(amount) > MAX_ADJUST) throw new ActionError(`Amount can't exceed ±${formatStars(MAX_ADJUST)}.`)
    const trimmed = typeof reason === "string" ? reason.trim() : ""
    if (trimmed.length < 3) throw new ActionError("A reason is required (at least 3 characters).")
    if (trimmed.length > 500) throw new ActionError("Reason is too long.")

    await actor.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } })
      if (!target) throw new ActionError("Person not found.")
      await lockUsers(tx, actor.companyId, [target.id])
      const current = await tx.user.findUnique({
        where: { id: target.id },
        select: { balance: true, fullName: true },
      })
      if (!current) throw new ActionError("Person not found.")
      if (amount < 0 && current.balance + amount < 0) {
        throw new ActionError(`Can't deduct more than their earned stars (${formatStars(current.balance)}).`)
      }
      await tx.user.update({ where: { id: target.id }, data: { balance: { increment: amount } } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: target.id,
          targetName: current.fullName,
          action: "adjust_balance",
          amount,
          reason: trimmed,
        },
      })
    }, MONEY_TX)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}
