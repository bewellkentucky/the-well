"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { syncBambooHR } from "@/lib/syncBambooHR"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in.")
  const actor = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true, fullName: true },
  })
  if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
    throw new Error("Not authorized.")
  return { actorId: session.user.id, actorName: actor.fullName }
}

export async function triggerBambooSync(
  opts: { full?: boolean } = {}
): Promise<{
  enriched?: number
  skipped?:  number
  errors?:   number
  total?:    number
  error?:    string
}> {
  let actorId: string, actorName: string
  try {
    ;({ actorId, actorName } = await requireAdmin())
  } catch (e: any) {
    return { error: e.message }
  }

  try {
    const result = await syncBambooHR(opts.full ? { force: true } : {})

    await db.auditLog.create({
      data: {
        actorId,
        actorName,
        action:  "sync_bamboo",
        details: `${opts.full ? "Full" : "Incremental"} BambooHR sync: ${result.enriched} enriched, ${result.skipped} skipped, ${result.errors} errors (${result.total} total)`,
        amount:  result.enriched,
      },
    })

    revalidatePath("/admin")
    return result
  } catch (e: any) {
    return { error: e.message ?? "BambooHR sync failed." }
  }
}
