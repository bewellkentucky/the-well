import { NextRequest, NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cronAuth"
import { resetAllowances } from "@/lib/allowanceReset"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const results = await resetAllowances()
  return NextResponse.json({ ok: true, companies: results.length, usersReset: results.reduce((s, r) => s + r.usersReset, 0) })
}
