import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import PageShell from "@/app/components/layout/PageShell"
import DirectoryGrid from "@/app/components/team/DirectoryGrid"

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  const users = await db.user.findMany({
    where: { active: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      title: true,
      department: true,
      role: true,
      thumbnailUrl: true,
    },
  })

  const sorted = [...users].sort((a, b) => {
    const ro = (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2)
    if (ro !== 0) return ro
    return a.fullName.localeCompare(b.fullName)
  })

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <DirectoryGrid users={sorted} totalCount={users.length} />
      </main>
    </PageShell>
  )
}
