import { redirect } from "next/navigation"
import { getActor } from "@/lib/tenant"
import PageShell from "@/app/components/layout/PageShell"
import DirectoryGrid from "@/app/components/team/DirectoryGrid"

const ROLE_ORDER: Record<string, number> = { admin: 0, member: 1 }

export default async function TeamPage() {
  const actor = await getActor()
  if (!actor) redirect("/")

  const [users, company] = await Promise.all([
    actor.db.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, email: true, title: true, department: true, role: true, thumbnailUrl: true },
    }),
    actor.db.company.findUnique({ where: { id: actor.companyId }, select: { name: true } }),
  ])

  const sorted = [...users].sort((a, b) => {
    const ro = (ROLE_ORDER[a.role] ?? 1) - (ROLE_ORDER[b.role] ?? 1)
    return ro !== 0 ? ro : a.fullName.localeCompare(b.fullName)
  })

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <DirectoryGrid users={sorted} totalCount={users.length} companyName={company?.name ?? ""} />
      </main>
    </PageShell>
  )
}
