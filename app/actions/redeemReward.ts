"use server"

import { revalidatePath } from "next/cache"
import { requireActor, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { formatStars } from "@/lib/brand"

export async function redeemReward(rewardId: string): Promise<{ error?: string }> {
  try {
    const actor = await requireActor()

    await actor.db.$transaction(async (tx) => {
      await lockUsers(tx, actor.companyId, [actor.userId])

      const reward = await tx.reward.findUnique({ where: { id: rewardId } })
      if (!reward || !reward.active) throw new ActionError("Reward not available.")

      const me = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { balance: true, fullName: true },
      })
      if (!me) throw new ActionError("Person not found.")
      if (me.balance < reward.cost) throw new ActionError(`Not enough stars. You have ${formatStars(me.balance)}.`)

      if (reward.inventory !== null) {
        // Conditional decrement: the row lock on the reward makes this atomic.
        const { count } = await tx.reward.updateMany({
          where: { id: reward.id, inventory: { gt: 0 } },
          data: { inventory: { decrement: 1 } },
        })
        if (count !== 1) throw new ActionError("This reward is out of stock.")
      }

      const redemption = await tx.redemption.create({
        data: { companyId: actor.companyId, userId: actor.userId, rewardId: reward.id, cost: reward.cost },
        select: { id: true },
      })
      await tx.user.update({ where: { id: actor.userId }, data: { balance: { decrement: reward.cost } } })
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: me.fullName,
          targetId: actor.userId,
          targetName: me.fullName,
          action: "redeem_reward",
          amount: -reward.cost,
          details: `Redeemed: ${reward.title} (redemption ${redemption.id})`,
        },
      })
    }, MONEY_TX)

    revalidatePath("/rewards")
    revalidatePath("/")
    return {}
  } catch (e) {
    return toActionError(e)
  }
}
