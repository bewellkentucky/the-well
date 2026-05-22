"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function getActorRole(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  return user?.role ?? null
}

function isAdmin(role: string | null): role is "owner" | "admin" {
  return role === "owner" || role === "admin"
}

// ── Incentive claims ──────────────────────────────────────────

export async function approveIncentiveClaim(claimId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const role = await getActorRole()
  if (!isAdmin(role)) return { error: "Not authorized." }

  const actorId = session.user.id

  try {
    await db.$transaction(async (tx) => {
      // Re-read inside the transaction — prevents double-credit on rapid re-submission
      const current = await tx.incentiveClaim.findUnique({
        where: { id: claimId },
        select: {
          status:         true,
          userId:         true,
          incentiveId:    true,
          rewardSnapshot: true,
          user:           { select: { fullName: true } },
        },
      })
      if (!current) throw new Error("Claim not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      const [incentive, actor] = await Promise.all([
        tx.incentive.findUnique({
          where: { id: current.incentiveId },
          select: { reward: true, title: true },
        }),
        tx.user.findUnique({
          where: { id: actorId },
          select: { fullName: true },
        }),
      ])
      if (!incentive) throw new Error("Incentive not found.")

      // Use snapshot if available; fall back to live reward for pre-snapshot claims
      const rewardAmount = current.rewardSnapshot ?? incentive.reward

      await tx.incentiveClaim.update({
        where: { id: claimId },
        data: { status: "credited", decidedAt: new Date(), decidedById: actorId },
      })
      await tx.user.update({
        where: { id: current.userId },
        data: { balance: { increment: rewardAmount } },
      })
      await tx.auditLog.create({
        data: {
          actorId,
          targetId:   current.userId,
          action:     "approve_claim",
          actorName:  actor!.fullName,
          targetName: current.user.fullName,
          amount:     rewardAmount,
          details:    `Approved claim: ${incentive.title}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to approve claim." }
  }

  revalidatePath("/admin")
  return {}
}

export async function declineIncentiveClaim(claimId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const role = await getActorRole()
  if (!isAdmin(role)) return { error: "Not authorized." }

  const actorId = session.user.id

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.incentiveClaim.findUnique({
        where: { id: claimId },
        select: {
          status:    true,
          userId:    true,
          user:      { select: { fullName: true } },
          incentive: { select: { title: true } },
        },
      })
      if (!current) throw new Error("Claim not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      })

      await tx.incentiveClaim.update({
        where: { id: claimId },
        data: { status: "declined", decidedAt: new Date(), decidedById: actorId },
      })
      await tx.auditLog.create({
        data: {
          actorId,
          targetId:   current.userId,
          action:     "decline_claim",
          actorName:  actor!.fullName,
          targetName: current.user.fullName,
          details:    `Declined claim: ${current.incentive.title}`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to decline claim." }
  }

  revalidatePath("/admin")
  return {}
}

// ── Reward redemptions ────────────────────────────────────────

export async function approveRedemption(redemptionId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const role = await getActorRole()
  if (!isAdmin(role)) return { error: "Not authorized." }

  const actorId = session.user.id

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: {
          status: true,
          cost:   true,
          userId: true,
          user:   { select: { fullName: true } },
          reward: { select: { title: true } },
        },
      })
      if (!current) throw new Error("Redemption not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      })

      await tx.redemption.update({
        where: { id: redemptionId },
        data: { status: "processing" },
      })
      await tx.auditLog.create({
        data: {
          actorId,
          targetId:   current.userId,
          action:     "approve_redemption",
          actorName:  actor!.fullName,
          targetName: current.user.fullName,
          details:    `Approved redemption: ${current.reward.title} (${current.cost}đ)`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to approve redemption." }
  }

  revalidatePath("/admin")
  return {}
}

export async function declineRedemption(redemptionId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }

  const role = await getActorRole()
  if (!isAdmin(role)) return { error: "Not authorized." }

  const actorId = session.user.id

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: {
          status: true,
          cost:   true,
          userId: true,
          user:   { select: { fullName: true } },
          reward: { select: { title: true } },
        },
      })
      if (!current) throw new Error("Redemption not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      })

      await tx.redemption.update({
        where: { id: redemptionId },
        data: { status: "declined" },
      })
      // Refund the drops that were deducted at redemption time
      await tx.user.update({
        where: { id: current.userId },
        data: { balance: { increment: current.cost } },
      })
      await tx.auditLog.create({
        data: {
          actorId,
          targetId:   current.userId,
          action:     "decline_redemption",
          actorName:  actor!.fullName,
          targetName: current.user.fullName,
          amount:     current.cost,
          details:    `Declined redemption: ${current.reward.title} — ${current.cost}đ refunded`,
        },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to decline redemption." }
  }

  revalidatePath("/admin")
  return {}
}
