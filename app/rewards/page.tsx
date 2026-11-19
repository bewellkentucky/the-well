import { redirect } from "next/navigation"
import { getActor } from "@/lib/tenant"
import PageShell from "@/app/components/layout/PageShell"
import RewardsGrid from "@/app/components/rewards/RewardsGrid"

export default async function RewardsPage() {
  const actor = await getActor()
  if (!actor) redirect("/")

  const [rewards, user] = await Promise.all([
    actor.db.reward.findMany({
      where: { active: true },
      orderBy: [{ cost: "asc" }, { title: "asc" }],
      select: { id: true, title: true, description: true, cost: true, category: true, inventory: true, icon: true, color: true, imageUrl: true },
    }),
    actor.db.user.findUnique({ where: { id: actor.userId }, select: { balance: true } }),
  ])

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <RewardsGrid rewards={rewards} balance={user?.balance ?? 0} />
      </main>
    </PageShell>
  )
}
