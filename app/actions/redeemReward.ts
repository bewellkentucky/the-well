"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function redeemReward(rewardId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const [reward, user] = await Promise.all([
    db.reward.findUnique({ where: { id: rewardId } }),
    db.user.findUnique({ where: { id: session.user.id }, select: { balance: true } }),
  ])

  if (!reward || !reward.active) return { error: "Reward not available." }
  if (!user) return { error: "User not found." }
  if (reward.inventory !== null && reward.inventory <= 0) return { error: "This reward is out of stock." }
  if (user.balance < reward.cost) return { error: "Not enough drops." }

  await db.$transaction([
    db.redemption.create({
      data: {
        userId: session.user.id,
        rewardId: reward.id,
        cost: reward.cost,
      },
    }),
    db.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: reward.cost } },
    }),
    ...(reward.inventory !== null
      ? [db.reward.update({ where: { id: reward.id }, data: { inventory: { decrement: 1 } } })]
      : []),
  ])

  revalidatePath("/rewards")
  return {}
}
