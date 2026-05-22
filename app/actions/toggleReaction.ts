"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { db } from "@/lib/db"

const VALID_EMOJIS = new Set(["💧", "💛", "🙌", "🎉", "👏", "🔥", "💯", "🙏", "✨", "❤️"])

export async function toggleReaction(
  kudoId: string,
  emoji: string
): Promise<{ error: string } | undefined> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not signed in." }
  if (!VALID_EMOJIS.has(emoji)) return { error: "Invalid emoji." }

  const userId = session.user.id

  const kudo = await db.kudo.findUnique({
    where: { id: kudoId },
    select: { isPrivate: true, fromId: true, toId: true },
  })
  if (!kudo) return { error: "Kudo not found." }
  if (kudo.isPrivate && kudo.fromId !== userId && kudo.toId !== userId) {
    return { error: "Not authorized." }
  }

  const existing = await db.reaction.findUnique({
    where: { kudoId_userId_emoji: { kudoId, userId, emoji } },
  })

  if (existing) {
    await db.reaction.delete({ where: { id: existing.id } })
  } else {
    await db.reaction.create({ data: { kudoId, userId, emoji } })
  }

  revalidatePath("/")
}
