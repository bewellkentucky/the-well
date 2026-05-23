"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function claimIncentive(
  incentiveId: string,
  note?: string,
  proofLink?: string,
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const userId = session.user.id
  const now = new Date()

  const incentive = await db.incentive.findUnique({ where: { id: incentiveId } })
  if (!incentive || !incentive.active) return { error: "Incentive not available." }

  // Window check
  if (incentive.startsAt && now < incentive.startsAt) return { error: "This incentive hasn't started yet." }
  if (incentive.endsAt && now > incentive.endsAt) return { error: "This incentive has ended." }

  // Cap check
  if (incentive.cap !== "unlimited") {
    let since: Date | undefined

    if (incentive.cap === "monthly") {
      since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    } else if (incentive.cap === "quarterly") {
      const q = Math.floor(now.getUTCMonth() / 3)
      since = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
    }
    // "once" → since stays undefined (any non-declined claim ever blocks it)

    const existing = await db.incentiveClaim.findFirst({
      where: {
        userId,
        incentiveId,
        status: { not: "declined" },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    })
    if (existing) return { error: "You've already claimed this incentive for this period." }
  }

  if (incentive.verification === "self") {
    // Instant credit
    await db.$transaction([
      db.incentiveClaim.create({
        data: { userId, incentiveId, status: "credited", note, proofLink, rewardSnapshot: incentive.reward },
      }),
      db.user.update({
        where: { id: userId },
        data: { balance: { increment: incentive.reward } },
      }),
    ])
  } else {
    // Admin-verify: create pending claim, no balance change yet
    await db.incentiveClaim.create({
      data: { userId, incentiveId, status: "pending", note, proofLink, rewardSnapshot: incentive.reward },
    })
  }

  revalidatePath("/earn")
  revalidatePath("/")
  return {}
}
