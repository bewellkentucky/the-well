import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import PageShell from "@/app/components/layout/PageShell"
import IncentivesGrid from "@/app/components/earn/IncentivesGrid"
import { seedIncentives } from "@/lib/seedIncentives"

export default async function EarnPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  await seedIncentives()

  const now = new Date()

  const incentives = await db.incentive.findMany({
    where: {
      active: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
      ],
    },
    orderBy: { sortOrder: "asc" },
  })

  const claims = await db.incentiveClaim.findMany({
    where: {
      userId: session.user.id,
      status: { not: "declined" },
    },
    select: { incentiveId: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  // For cap enforcement in the UI, reduce to the most relevant claim per incentive
  const relevantClaims = incentives.flatMap((inc) => {
    const incClaims = claims.filter((c) => c.incentiveId === inc.id)
    if (incClaims.length === 0) return []

    if (inc.cap === "monthly") {
      const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      const recent = incClaims.find((c) => new Date(c.createdAt) >= since)
      return recent ? [{ incentiveId: inc.id, status: recent.status }] : []
    }
    if (inc.cap === "quarterly") {
      const q = Math.floor(now.getUTCMonth() / 3)
      const since = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))
      const recent = incClaims.find((c) => new Date(c.createdAt) >= since)
      return recent ? [{ incentiveId: inc.id, status: recent.status }] : []
    }
    // "once" or "unlimited" — show the most recent non-declined claim
    return [{ incentiveId: inc.id, status: incClaims[0].status }]
  })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true, givingBalance: true },
  })

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <div className="dir-topbar" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Earn drops</h1>
            <p className="page-subtitle">
              Complete activities to earn extra drops for your balance.
            </p>
          </div>
          {user && (
            <div className="balance-chip">
              <span className="balance-chip-label">Balance</span>
              <span className="balance-chip-amount">{user.balance}d</span>
            </div>
          )}
        </div>

        <IncentivesGrid incentives={incentives} claims={relevantClaims} />
      </main>
    </PageShell>
  )
}
