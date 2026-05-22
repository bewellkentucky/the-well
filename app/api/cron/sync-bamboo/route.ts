import { NextRequest, NextResponse } from "next/server"
import { syncBambooHR } from "@/lib/syncBambooHR"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const force = req.nextUrl.searchParams.get("full") === "1"

  try {
    const result = await syncBambooHR({ force })
    return NextResponse.json(result)
  } catch (err) {
    console.error("BambooHR cron sync failed:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
