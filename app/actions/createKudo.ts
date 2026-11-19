"use server"

import { revalidatePath } from "next/cache"
import { requireActor, ActionError, toActionError } from "@/lib/tenant"
import { lockUsers, MONEY_TX } from "@/lib/money"
import { postKudoToChat } from "@/lib/chat/postKudo"
import { COMPANY_VALUE_NAMES, formatStars } from "@/lib/brand"

const VALID_VALUES = new Set(COMPANY_VALUE_NAMES)
const MAX_MESSAGE = 2000

type Params = {
  toId: string
  amount: number
  message: string
  values: string[]
  isPrivate: boolean
}

export async function createKudo(params: Params): Promise<{ error: string } | undefined> {
  try {
    const actor = await requireActor()
    const { toId, amount, values } = params
    const message = typeof params.message === "string" ? params.message.trim() : ""
    // Fail safe: anything other than an explicit false is treated as private.
    const isPrivate = params.isPrivate !== false

    if (!toId || typeof toId !== "string") throw new ActionError("Pick a recipient.")
    if (toId === actor.userId) throw new ActionError("You can't send kudos to yourself.")
    if (!message) throw new ActionError("Add a message.")
    if (message.length > MAX_MESSAGE) throw new ActionError("That message is too long.")
    if (!Number.isInteger(amount) || amount < 1) throw new ActionError("Minimum 1 star.")
    if (!Array.isArray(values) || values.length === 0) throw new ActionError("Select at least one value.")
    if (!values.every((v) => VALID_VALUES.has(v))) throw new ActionError("Invalid value.")

    const result = await actor.db.$transaction(async (tx) => {
      const recipient = await tx.user.findFirst({
        where: { id: toId, active: true },
        select: { id: true, fullName: true },
      })
      if (!recipient) throw new ActionError("Recipient not found.")

      await lockUsers(tx, actor.companyId, [actor.userId, recipient.id])

      const sender = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { givingBalance: true, fullName: true },
      })
      if (!sender) throw new ActionError("Sender not found.")
      if (amount > sender.givingBalance) {
        throw new ActionError(`You only have ${formatStars(sender.givingBalance)} to give.`)
      }

      const kudo = await tx.kudo.create({
        data: {
          companyId: actor.companyId,
          fromId: actor.userId,
          toId: recipient.id,
          amount,
          message,
          values: [...new Set(values)],
          isPrivate,
        },
        select: { id: true },
      })
      await tx.user.update({ where: { id: actor.userId }, data: { givingBalance: { decrement: amount } } })
      await tx.user.update({ where: { id: recipient.id }, data: { balance: { increment: amount } } })
      // Audit: amounts and ids only, never the message text (may contain sensitive detail).
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          actorId: actor.userId,
          actorName: sender.fullName,
          targetId: recipient.id,
          targetName: recipient.fullName,
          action: "give_kudo",
          amount,
          details: `${isPrivate ? "Private" : "Public"} kudo ${kudo.id}`,
        },
      })
      return { senderName: sender.fullName, recipientName: recipient.fullName }
    }, MONEY_TX)

    // Chat posting: after commit, best effort, public only, company's own space only.
    try {
      const company = await actor.db.company.findUnique({
        where: { id: actor.companyId },
        select: { chatSpace: true, appUrl: true },
      })
      await postKudoToChat({
        isPrivate,
        chatSpace: company?.chatSpace ?? null,
        appUrl: company?.appUrl ?? null,
        giverName: result.senderName,
        recipientName: result.recipientName,
        amount,
        values,
        message,
      })
    } catch {
      console.error("postKudoToChat failed")
    }

    revalidatePath("/")
    return undefined
  } catch (e) {
    return toActionError(e)
  }
}
