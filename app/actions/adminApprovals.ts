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
        select: { status: true, userId: true, incentiveId: true },
      })
      if (!current) throw new Error("Claim not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      const incentive = await tx.incentive.findUnique({
        where: { id: current.incentiveId },
        select: { reward: true },
      })
      if (!incentive) throw new Error("Incentive not found.")

      await tx.incentiveClaim.update({
        where: { id: claimId },
        data: { status: "credited", decidedAt: new Date(), decidedById: actorId },
      })
      await tx.user.update({
        where: { id: current.userId },
        data: { balance: { increment: incentive.reward } },
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
        select: { status: true },
      })
      if (!current) throw new Error("Claim not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      await tx.incentiveClaim.update({
        where: { id: claimId },
        data: { status: "declined", decidedAt: new Date(), decidedById: actorId },
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

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: { status: true },
      })
      if (!current) throw new Error("Redemption not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      await tx.redemption.update({
        where: { id: redemptionId },
        data: { status: "processing" },
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

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.redemption.findUnique({
        where: { id: redemptionId },
        select: { status: true, cost: true, userId: true },
      })
      if (!current) throw new Error("Redemption not found.")
      if (current.status !== "pending") throw new Error("Already processed.")

      await tx.redemption.update({
        where: { id: redemptionId },
        data: { status: "declined" },
      })
      // Refund the drops that were deducted at redemption time
      await tx.user.update({
        where: { id: current.userId },
        data: { balance: { increment: current.cost } },
      })
    })
  } catch (e: any) {
    return { error: e.message ?? "Failed to decline redemption." }
  }

  revalidatePath("/admin")
  return {}
}
