import { redirect } from "next/navigation"
import { getActor } from "@/lib/tenant"
import { activeIncentiveWhere, buildClaimStatuses, INCENTIVE_ORDER, INCENTIVE_PUBLIC_SELECT } from "@/lib/incentives"
import { formatStars } from "@/lib/brand"
import PageShell from "@/app/components/layout/PageShell"
import IncentivesGrid from "@/app/components/earn/IncentivesGrid"

export default async function EarnPage() {
  const actor = await getActor()
  if (!actor) redirect("/")

  const now = new Date()
  const [incentives, claims, user] = await Promise.all([
    actor.db.incentive.findMany({
      where: activeIncentiveWhere(now),
      orderBy: INCENTIVE_ORDER,
      select: INCENTIVE_PUBLIC_SELECT,
    }),
    actor.db.incentiveClaim.findMany({
      where: { userId: actor.userId, status: { not: "declined" } },
      select: { incentiveId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    actor.db.user.findUnique({
      where: { id: actor.userId },
      select: { balance: true },
    }),
  ])

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <div className="dir-topbar" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Earn stars</h1>
            <p className="page-subtitle">Complete activities to earn extra stars.</p>
          </div>
          {user && (
            <div className="balance-chip">
              <span className="balance-chip-label">Your stars</span>
              <span className="balance-chip-amount">{formatStars(user.balance)}</span>
              <span className="balance-chip-sublabel">Earned&nbsp;&middot;&nbsp;yours to spend</span>
            </div>
          )}
        </div>

        <IncentivesGrid incentives={incentives} claims={buildClaimStatuses(incentives, claims, now)} />
      </main>
    </PageShell>
  )
}
