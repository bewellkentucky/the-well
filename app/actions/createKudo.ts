"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { db } from "@/lib/db"

const VALID_VALUES = new Set([
  "Compassion",
  "Ownership",
  "Curiosity",
  "Team-First",
  "Excellence",
  "Above & Beyond",
])

type Params = {
  toId: string
  amount: number
  message: string
  values: string[]
  isPrivate: boolean
}

export async function createKudo(params: Params): Promise<{ error: string } | undefined> {
  // Auth check — session user must be the sender. Prevents forged kudos.
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }
  const currentUserId = session.user.id

  const { toId, amount, message, values, isPrivate } = params

  if (!toId) return { error: "Pick a recipient." }
  if (toId === currentUserId) return { error: "You can't send kudos to yourself." }
  if (!message.trim()) return { error: "Add a message." }
  if (!Number.isInteger(amount) || amount < 1) return { error: "Minimum 1 drop." }
  if (values.length === 0) return { error: "Select at least one value." }
  if (!values.every((v) => VALID_VALUES.has(v))) return { error: "Invalid value." }

  const sender = await db.user.findUnique({
    where: { id: currentUserId },
    select: { givingBalance: true },
  })
  if (!sender) return { error: "Sender not found." }
  if (amount > sender.givingBalance) {
    return { error: `You only have ${sender.givingBalance}đ to give.` }
  }

  const recipient = await db.user.findUnique({
    where: { id: toId, active: true },
    select: { id: true },
  })
  if (!recipient) return { error: "Recipient not found." }

  await db.$transaction([
    db.kudo.create({
      data: { fromId: currentUserId, toId, amount, message: message.trim(), values, isPrivate },
    }),
    db.user.update({
      where: { id: currentUserId },
      data: { givingBalance: { decrement: amount } },
    }),
    db.user.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    }),
  ])

  revalidatePath("/")
}
