"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Internal constants — not exported (exporting non-async-functions from
// "use server" files makes the module emit zero exports, breaking the build).
const RAIN_CAP  = 25
const RAIN_STEP =  5

export async function makeItRain(
  kudoId: string,
  amount: number,
): Promise<{ error?: string; newTotal?: number }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }
  const actorId = session.user.id

  // Reject anything the client couldn't have produced legitimately.
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > RAIN_CAP ||
    amount % RAIN_STEP !== 0
  ) {
    return { error: "Invalid rain amount." }
  }

  try {
    const newTotal = await db.$transaction(async (tx) => {
      // All reads inside the transaction — in-tx re-reads prevent double-spend
      // from rapid double-commit (the commit button disables on first fire as a
      // client guard; this is the server backstop).
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

      // Cap check uses the server's committed total, not the client's view.
      const committed = existing?.amount ?? 0
      if (committed + amount > RAIN_CAP)
        throw new Error(
          `This would exceed the ${RAIN_CAP}đ limit. You've already committed ${committed}đ on this kudo.`
        )
      if (actor.givingBalance < amount)
        throw new Error("Not enough drops in your giving balance.")

      const next = committed + amount

      // Sequential writes — avoids lock-ordering deadlocks on the User table.
      await tx.user.update({ where: { id: actorId },   data: { givingBalance: { decrement: amount } } })
      await tx.user.update({ where: { id: kudo.toId }, data: { balance:        { increment: amount } } })
      if (existing) {
        await tx.rain.update({
          where: { kudoId_userId: { kudoId, userId: actorId } },
          data:  { amount: { increment: amount } },
        })
      } else {
        await tx.rain.create({ data: { kudoId, userId: actorId, amount } })
      }
      await tx.auditLog.create({
        data: {
          actorId,
          actorName:  actor.fullName,
          targetId:   kudo.toId,
          targetName: kudo.to.fullName,
          action:     "make_it_rain",
          details:    `Committed +${amount}đ rain on kudo ${kudoId} (actor total: ${next}đ)`,
          amount,
        },
      })

      return next
    })

    revalidatePath("/")
    return { newTotal }
  } catch (e: any) {
    return { error: e.message ?? "Failed to make it rain." }
  }
}
