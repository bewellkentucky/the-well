import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthorizedCron } from "@/lib/cronAuth"
import { syncBambooHR } from "@/lib/syncBambooHR"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const force = req.nextUrl.searchParams.get("full") === "1"
  const companies = await db.company.findMany({
    // Closed companies (launch switch) never sync; syncBambooHR refuses them too.
    where: { active: true, isOpen: true, bambooEnabled: true, bambooSubdomain: { not: null } },
    select: { id: true, slug: true },
  })
  const results: Record<string, unknown> = {}
  for (const c of companies) {
    try {
      results[c.slug] = await syncBambooHR(c.id, { force })
    } catch (err) {
      console.error(`BambooHR cron sync failed for ${c.slug}`)
      results[c.slug] = { error: err instanceof Error ? err.message : "failed" }
    }
  }
  return NextResponse.json({ ok: true, results })
}
