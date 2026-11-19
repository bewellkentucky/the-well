"use server"

import { revalidatePath } from "next/cache"
import { requireActor, ActionError, toActionError } from "@/lib/tenant"
import { REACTION_CHOICES } from "@/lib/brand"

const VALID_EMOJIS = new Set<string>(REACTION_CHOICES)

export async function toggleReaction(kudoId: string, emoji: string): Promise<{ error: string } | undefined> {
  try {
    const actor = await requireActor()
    if (!VALID_EMOJIS.has(emoji)) throw new ActionError("Invalid emoji.")

    const kudo = await actor.db.kudo.findUnique({
      where: { id: kudoId },
      select: { isPrivate: true, fromId: true, toId: true },
    })
    if (!kudo) throw new ActionError("Kudo not found.")
    if (kudo.isPrivate && kudo.fromId !== actor.userId && kudo.toId !== actor.userId) {
      throw new ActionError("Kudo not found.")
    }

    const key = { kudoId_userId_emoji: { kudoId, userId: actor.userId, emoji } }
    const existing = await actor.db.reaction.findUnique({ where: key, select: { id: true } })
    if (existing) {
      await actor.db.reaction.deleteMany({ where: { id: existing.id } })
    } else {
      await actor.db.reaction
        .create({ data: { companyId: actor.companyId, kudoId, userId: actor.userId, emoji } })
        .catch((e: { code?: string }) => {
          if (e?.code !== "P2002") throw e // double tap: already reacted, fine
        })
    }

    revalidatePath("/")
    return undefined
  } catch (e) {
    return toActionError(e)
  }
}
