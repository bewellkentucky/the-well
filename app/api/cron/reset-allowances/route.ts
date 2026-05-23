import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const maxDuration = 60

const FALLBACK_ALLOWANCE = 100

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const ts = new Date()

  const setting = await db.appSetting.findUnique({ where: { key: "allowanceAmount" } })
  const amount = setting
    ? Math.max(1, parseInt(setting.value, 10) || FALLBACK_ALLOWANCE)
    : FALLBACK_ALLOWANCE

  // Reset givingBalance only — earned wallet (balance) is never written here
  const { count: usersReset } = await db.user.updateMany({
    where: { active: true },
    data:  { givingBalance: amount },
  })

  await db.integrationSync.create({
    data: {
      source:           "allowance-reset",
      lastRunAt:        ts,
      recordsProcessed: usersReset,
      notes:            `Reset givingBalance to ${amount}đ for ${usersReset} active users`,
    },
  })

  return NextResponse.json({ ok: true, usersReset, amount, ts })
}
