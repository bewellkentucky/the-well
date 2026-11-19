"use server"

import { revalidatePath } from "next/cache"
import { requireActor, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { blockingClaim, isInWindow } from "@/lib/incentives"

const MAX_NOTE = 500
const MAX_PROOF = 1000

export async function claimIncentive(
  incentiveId: string,
  note?: string,
  proofLink?: string,
): Promise<{ error?: string; status?: "credited" | "pending" }> {
  try {
    const actor = await requireActor()
    const cleanNote = typeof note === "string" ? note.trim().slice(0, MAX_NOTE) || null : null
    const cleanProof = typeof proofLink === "string" ? proofLink.trim().slice(0, MAX_PROOF) || null : null
    const now = new Date()

    const status = await actor.db.$transaction(async (tx) => {
      // Lock first: serializes this person's claims so a cap can't be beaten
      // by two quick submits.
      await lockUsers(tx, actor.companyId, [actor.userId])

      const incentive = await tx.incentive.findUnique({ where: { id: incentiveId } })
      if (!incentive || !incentive.active) throw new ActionError("Incentive not available.")
      if (!isInWindow(incentive, now)) {
        throw new ActionError(
          incentive.startsAt && now < incentive.startsAt ? "This incentive hasn't started yet." : "This incentive has ended."
        )
      }

      if (incentive.cap !== "unlimited") {
        const mine = await tx.incentiveClaim.findMany({
          where: { userId: actor.userId, incentiveId, status: { not: "declined" } },
          select: { incentiveId: true, status: true, createdAt: true },
        })
        if (blockingClaim(incentive.cap, mine, now)) {
          throw new ActionError("You've already claimed this incentive for this period.")
        }
      }

      const me = await tx.user.findUnique({ where: { id: actor.userId }, select: { fullName: true } })
      const isSelf = incentive.verification === "self"
      const claim = await tx.incentiveClaim.create({
        data: {
          companyId: actor.companyId,
          userId: actor.userId,
          incentiveId,
          status: isSelf ? "credited" : "pending",
          note: cleanNote,
          proofLink: cleanProof,
          rewardSnapshot: incentive.reward,
          ...(isSelf ? { decidedAt: now } : {}),
        },
        select: { id: true },
      })
      if (isSelf) {
        await tx.user.update({ where: { id: actor.userId }, data: { balance: { increment: incentive.reward } } })
      }
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: me?.fullName ?? actor.fullName,
          targetId: actor.userId,
          targetName: me?.fullName ?? actor.fullName,
          action: isSelf ? "self_claim_credited" : "submit_claim",
          amount: isSelf ? incentive.reward : null,
          details: `${isSelf ? "Self-attested" : "Submitted for review"}: ${incentive.title} (claim ${claim.id})`,
        },
      })
      return isSelf ? ("credited" as const) : ("pending" as const)
    }, MONEY_TX)

    revalidatePath("/earn")
    revalidatePath("/")
    return { status }
  } catch (e) {
    return toActionError(e)
  }
}
