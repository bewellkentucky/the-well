import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthorizedCron } from "@/lib/cronAuth"

// Keeps a function instance and the database connection pool warm so the first
// visitor after a quiet period doesn't wait on a cold start. Touches no data.
export const maxDuration = 10

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const started = Date.now()
  await db.$queryRaw`SELECT 1`
  return NextResponse.json({ ok: true, dbMs: Date.now() - started })
}
