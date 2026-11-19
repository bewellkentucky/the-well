"use server"

import { revalidatePath } from "next/cache"
import { requireActor, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { PILE_ON_CAP, PILE_ON_STEP, PILE_ON_LABEL, formatStars } from "@/lib/brand"

/**
 * Pile on: move `amount` stars from the actor's giving allowance to the kudo
 * recipient's earned wallet. The client stages taps (+5 each, max 5 taps) and
 * commits once; the server re-validates everything and never trusts the
 * staged amount. Running total per person per kudo is capped at PILE_ON_CAP.
 */
export async function pileOn(
  kudoId: string,
  amount: number,
): Promise<{ error?: string; newTotal?: number }> {
  try {
    const actor = await requireActor()

    if (
      typeof kudoId !== "string" ||
      !Number.isInteger(amount) ||
      amount < PILE_ON_STEP ||
      amount > PILE_ON_CAP ||
      amount % PILE_ON_STEP !== 0
    ) {
      throw new ActionError(`Invalid ${PILE_ON_LABEL.toLowerCase()} amount.`)
    }

    const newTotal = await actor.db.$transaction(async (tx) => {
      const kudo = await tx.kudo.findUnique({
        where: { id: kudoId },
        select: { id: true, fromId: true, toId: true, isPrivate: true, to: { select: { fullName: true, active: true } } },
      })
      if (!kudo) throw new ActionError("Kudo not found.")
      if (kudo.isPrivate) throw new ActionError(`You can't ${PILE_ON_LABEL.toLowerCase()} on a private kudo.`)
      if (kudo.toId === actor.userId) throw new ActionError(`You can't ${PILE_ON_LABEL.toLowerCase()} on a kudo you received.`)
      if (kudo.fromId === actor.userId) throw new ActionError(`You can't ${PILE_ON_LABEL.toLowerCase()} on your own kudo.`)
      if (!kudo.to.active) throw new ActionError("That person is no longer active.")

      // Serializes every money operation by this person (and the recipient).
      await lockUsers(tx, actor.companyId, [actor.userId, kudo.toId])

      const me = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { givingBalance: true, fullName: true },
      })
      if (!me) throw new ActionError("Person not found.")
      const sum = await tx.pileOn.aggregate({
        where: { kudoId, userId: actor.userId },
        _sum: { amount: true },
      })
      const committed = sum._sum.amount ?? 0
      if (committed + amount > PILE_ON_CAP) {
        throw new ActionError(
          `That would go past the ${formatStars(PILE_ON_CAP)} limit. You've already added ${formatStars(committed)} here.`
        )
      }
      if (me.givingBalance < amount) {
        throw new ActionError(`Not enough stars to give. You have ${formatStars(me.givingBalance)} left this month.`)
      }

      await tx.user.update({ where: { id: actor.userId }, data: { givingBalance: { decrement: amount } } })
      await tx.user.update({ where: { id: kudo.toId }, data: { balance: { increment: amount } } })
      await tx.pileOn.create({
        data: { companyId: actor.companyId, kudoId, userId: actor.userId, amount },
      })
      const next = committed + amount
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: me.fullName,
          targetId: kudo.toId,
          targetName: kudo.to.fullName,
          action: "pile_on",
          amount,
          details: `${PILE_ON_LABEL} +${amount} on kudo ${kudoId} (total from this person: ${next})`,
        },
      })
      return next
    }, MONEY_TX)

    revalidatePath("/")
    return { newTotal }
  } catch (e) {
    return toActionError(e)
  }
}
