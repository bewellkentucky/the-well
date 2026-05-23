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

  const [incentives, claims, user] = await Promise.all([
    db.incentive.findMany({
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
    }),
    db.incentiveClaim.findMany({
      where: {
        userId: session.user.id,
        status: { not: "declined" },
      },
      select: { incentiveId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { balance: true, givingBalance: true },
    }),
  ])

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
    // "unlimited" — never lock the button; the modal success screen handles acknowledgment
    if (inc.cap === "unlimited") return []
    // "once" — block if any non-declined claim exists
    return [{ incentiveId: inc.id, status: incClaims[0].status }]
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
              <span className="balance-chip-label">Your drops</span>
              <span className="balance-chip-amount">{user.balance}đ</span>
              <span className="balance-chip-sublabel">Earned&nbsp;&middot;&nbsp;yours to spend</span>
            </div>
          )}
        </div>

        <IncentivesGrid incentives={incentives} claims={relevantClaims} />
      </main>
    </PageShell>
  )
}
