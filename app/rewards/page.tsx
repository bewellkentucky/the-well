import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { seedRewards } from "@/lib/seedRewards"
import PageShell from "@/app/components/layout/PageShell"
import RewardsGrid from "@/app/components/rewards/RewardsGrid"

export default async function RewardsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  await seedRewards()

  const [rewards, user] = await Promise.all([
    db.reward.findMany({
      where: { active: true },
      orderBy: { cost: "asc" },
      select: { id: true, title: true, description: true, cost: true, category: true, inventory: true },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { balance: true },
    }),
  ])

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <RewardsGrid rewards={rewards} balance={user?.balance ?? 0} />
      </main>
    </PageShell>
  )
}
