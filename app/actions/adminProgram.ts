"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function requireAdminActor() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not authenticated.")
  const user = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true, fullName: true },
  })
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    throw new Error("Admin access required.")
  }
  return { id: session.user.id, fullName: user.fullName, role: user.role }
}

export async function getAllowanceSetting(): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: "allowanceAmount" } })
  return row ? parseInt(row.value, 10) : 100
}

export async function setAllowanceSetting(
  amount: number
): Promise<{ error?: string }> {
  if (!Number.isInteger(amount) || amount < 0 || amount > 10_000) {
    return { error: "Amount must be a whole number between 0 and 10,000." }
  }
  try {
    const actor = await requireAdminActor()
    await db.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where:  { key: "allowanceAmount" },
        update: { value: String(amount), updatedBy: actor.id },
        create: { key: "allowanceAmount", value: String(amount), updatedBy: actor.id },
      })
      await tx.auditLog.create({
        data: {
          action:    "update_setting",
          actorId:   actor.id,
          actorName: actor.fullName,
          details:   `allowanceAmount → ${amount}đ`,
          amount,
        },
      })
    })
    revalidatePath("/admin")
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." }
  }
}
