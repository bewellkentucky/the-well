"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export const RAIN_STEP = 5
export const RAIN_CAP  = 25

export async function makeItRain(kudoId: string): Promise<{ error?: string; newAmount?: number }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }
  const actorId = session.user.id

  try {
    const newAmount = await db.$transaction(async (tx) => {
      // Sequential reads so the single transaction connection isn't multiplexed.
      // All three reads happen inside the transaction — this is the re-read that
      // prevents double-spend from rapid concurrent taps.
      const actor = await tx.user.findUnique({
        where:  { id: actorId },
        select: { givingBalance: true, fullName: true },
      })
      const kudo = await tx.kudo.findUnique({
        where:  { id: kudoId },
        select: { fromId: true, toId: true, isPrivate: true, to: { select: { fullName: true } } },
      })
      const existing = await tx.rain.findUnique({
        where:  { kudoId_userId: { kudoId, userId: actorId } },
        select: { amount: true },
      })

      if (!actor) throw new Error("User not found.")
      if (!kudo)  throw new Error("Kudo not found.")
      if (kudo.isPrivate) throw new Error("Can't rain on a private kudo.")
      if (kudo.fromId === actorId || kudo.toId === actorId)
        throw new Error("You can't rain on your own kudo.")

      const currentAmount = existing?.amount ?? 0
      if (currentAmount >= RAIN_CAP)
        throw new Error(`You've reached the ${RAIN_CAP}đ limit for this kudo.`)
      if (actor.givingBalance < RAIN_STEP)
        throw new Error("Not enough drops in your giving balance.")

      const next = currentAmount + RAIN_STEP

      // Sequential writes — avoids lock-ordering deadlocks on the User table.
      await tx.user.update({ where: { id: actorId },   data: { givingBalance: { decrement: RAIN_STEP } } })
      await tx.user.update({ where: { id: kudo.toId }, data: { balance:        { increment: RAIN_STEP } } })
      if (existing) {
        await tx.rain.update({
          where: { kudoId_userId: { kudoId, userId: actorId } },
          data:  { amount: { increment: RAIN_STEP } },
        })
      } else {
        await tx.rain.create({ data: { kudoId, userId: actorId, amount: RAIN_STEP } })
      }
      await tx.auditLog.create({
        data: {
          actorId,
          actorName:  actor.fullName,
          targetId:   kudo.toId,
          targetName: kudo.to.fullName,
          action:     "make_it_rain",
          details:    `Rained +${RAIN_STEP}đ on kudo ${kudoId} (total from actor: ${next}đ)`,
          amount:     RAIN_STEP,
        },
      })

      return next
    })

    revalidatePath("/")
    return { newAmount }
  } catch (e: any) {
    return { error: e.message ?? "Failed to make it rain." }
  }
}
