"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { formatStars } from "@/lib/brand"

// Every decision: conditional status transition (pending -> x, count must be
// 1) so a double click or two admins at once can't double-credit or
// double-refund. All lookups are company-scoped.

export async function approveIncentiveClaim(claimId: string): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const claim = await tx.incentiveClaim.findUnique({
        where: { id: claimId },
        select: {
          userId: true,
          rewardSnapshot: true,
          user: { select: { fullName: true } },
          incentive: { select: { reward: true, title: true } },
        },
      })
      if (!claim) throw new ActionError("Claim not found.")
      await lockUsers(tx, actor.companyId, [claim.userId])

      const { count } = await tx.incentiveClaim.updateMany({
        where: { id: claimId, status: "pending" },
        data: { status: "credited", decidedAt: new Date(), decidedById: actor.userId },
      })
      if (count !== 1) throw new ActionError("Already processed.")

      const amount = claim.rewardSnapshot ?? claim.incentive.reward
      await tx.user.update({ where: { id: claim.userId }, data: { balance: { increment: amount } } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: claim.userId,
          targetName: claim.user.fullName,
          action: "approve_claim",
          amount,
          details: `Approved claim: ${claim.incentive.title}`,
        },
      })
    }, MONEY_TX)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e, "Failed to approve claim.")
  }
}

export async function declineIncentiveClaim(claimId: string): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const claim = await tx.incentiveClaim.findUnique({
        where: { id: claimId },
        select: { userId: true, user: { select: { fullName: true } }, incentive: { select: { title: true } } },
      })
      if (!claim) throw new ActionError("Claim not found.")
      const { count } = await tx.incentiveClaim.updateMany({
        where: { id: claimId, status: "pending" },
        data: { status: "declined", decidedAt: new Date(), decidedById: actor.userId },
      })
      if (count !== 1) throw new ActionError("Already processed.")
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: claim.userId,
          targetName: claim.user.fullName,
          action: "decline_claim",
          details: `Declined claim: ${claim.incentive.title}`,
        },
      })
    }, MONEY_TX)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e, "Failed to decline claim.")
  }
}

export async function approveRedemption(redemptionId: string): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const r = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: { cost: true, userId: true, user: { select: { fullName: true } }, reward: { select: { title: true } } },
      })
      if (!r) throw new ActionError("Redemption not found.")
      const { count } = await tx.redemption.updateMany({
        where: { id: redemptionId, status: "pending" },
        data: { status: "processing" },
      })
      if (count !== 1) throw new ActionError("Already processed.")
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: r.userId,
          targetName: r.user.fullName,
          action: "approve_redemption",
          details: `Approved redemption: ${r.reward.title} (${formatStars(r.cost)})`,
        },
      })
    }, MONEY_TX)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e, "Failed to approve redemption.")
  }
}

export async function declineRedemption(redemptionId: string): Promise<{ error?: string }> {
  try {
    const actor = await requireAdmin()
    await actor.db.$transaction(async (tx) => {
      const r = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: {
          cost: true,
          userId: true,
          rewardId: true,
          user: { select: { fullName: true } },
          reward: { select: { title: true, inventory: true } },
        },
      })
      if (!r) throw new ActionError("Redemption not found.")
      await lockUsers(tx, actor.companyId, [r.userId])
      const { count } = await tx.redemption.updateMany({
        where: { id: redemptionId, status: "pending" },
        data: { status: "declined" },
      })
      if (count !== 1) throw new ActionError("Already processed.")
      // Refund the snapshot cost (what they actually paid), and put the item back.
      await tx.user.update({ where: { id: r.userId }, data: { balance: { increment: r.cost } } })
      if (r.reward.inventory !== null) {
        await tx.reward.updateMany({ where: { id: r.rewardId }, data: { inventory: { increment: 1 } } })
      }
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: actor.fullName,
          targetId: r.userId,
          targetName: r.user.fullName,
          action: "decline_redemption",
          amount: r.cost,
          details: `Declined redemption: ${r.reward.title}. ${formatStars(r.cost)} refunded`,
        },
      })
    }, MONEY_TX)
    revalidatePath("/admin")
    return {}
  } catch (e) {
    return toActionError(e, "Failed to decline redemption.")
  }
}
