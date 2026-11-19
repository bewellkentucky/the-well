"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, toActionError } from "@/lib/tenant"
import { syncBambooHR } from "@/lib/syncBambooHR"

export async function triggerBambooSync(opts: { full?: boolean } = {}): Promise<{
  created?: number
  enriched?: number
  skipped?: number
  errors?: number
  total?: number
  error?: string
}> {
  try {
    const actor = await requireAdmin()
    const result = await syncBambooHR(actor.companyId, opts.full ? { force: true } : {})
    await actor.db.auditLog.create({
      data: {
        companyId: actor.companyId,
        actorId: actor.userId,
        actorName: actor.fullName,
        action: "sync_bamboo",
        details: `${opts.full ? "Full" : "Incremental"} BambooHR sync: ${result.created} created, ${result.enriched} enriched, ${result.skipped} skipped, ${result.errors} errors (${result.total} total)`,
        amount: result.enriched,
      },
    })
    revalidatePath("/admin")
    return result
  } catch (e) {
    return toActionError(e, "BambooHR sync failed.")
  }
}
